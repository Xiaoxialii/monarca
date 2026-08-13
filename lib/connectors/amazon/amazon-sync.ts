import crypto from "node:crypto";
import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { writeR2ObjectText } from "@/lib/r2-storage";
import {
  AMAZON_PROVIDER,
  AmazonConnectorError,
  isAmazonAuthRevokedError
} from "@/lib/connectors/amazon/amazon-errors";
import { AmazonSellingPartnerClient, fetchAllAmazonPages } from "@/lib/connectors/amazon/amazon-client";
import { amazonRegionConfig, normalizeAmazonRegion } from "@/lib/connectors/amazon/amazon-regions";
import { marketplaceSummary, normalizeMarketplaceIds } from "@/lib/connectors/amazon/amazon-marketplaces";
import {
  amazonFirstSyncDays,
  amazonPublicAccountConfig,
  amazonSafetyOverlapMs,
  refreshAmazonAccessToken,
  requiredAmazonEnv
} from "@/lib/connectors/amazon/amazon-oauth";
import {
  AMAZON_CANONICAL_SCHEMA_VERSION,
  amazonCanonicalColumns,
  dedupeAmazonCanonicalArtifact,
  normalizeAmazonRecords,
  type AmazonCanonicalArtifact
} from "@/lib/connectors/amazon/amazon-normalizer";
import type { AmazonFinancialEvent, AmazonOrderItem } from "@/lib/connectors/amazon/amazon-types";
import {
  buildCanonicalSnapshotJson,
  storeCanonicalSchemaSnapshot
} from "@/lib/snapshot/canonical-snapshot-generator";
import type { CanonicalDataset } from "@/lib/semantic/types";

type JsonRecord = Record<string, unknown>;

type PhaseResult<T> = {
  status: "success" | "failed";
  records: T;
  error?: string;
  cursor?: string | null;
  pageCount?: number;
};

export async function runInitialAmazonSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
}) {
  return runAmazonProductionSync(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    trigger: "initial",
    force: true
  });
}

export async function runAmazonProductionSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  force?: boolean;
  trigger?: "initial" | "manual" | "scheduled";
}) {
  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: AMAZON_PROVIDER,
      status: "connected",
      ...(input.dataSourceId ? { dataSourceId: input.dataSourceId } : {})
    },
    include: { dataSource: true },
    orderBy: { updatedAt: "desc" }
  });

  if (!account || !account.dataSourceId || !account.dataSource) {
    throw new AmazonConnectorError("No connected Amazon account with data source was found for this workspace.", "SELLER_ACCOUNT_UNAVAILABLE", 404);
  }
  if (account.dataSource.workspaceId !== input.workspaceId || account.dataSource.provider !== AMAZON_PROVIDER) {
    throw new AmazonConnectorError("Amazon connector account does not belong to the current workspace data source.", "WORKSPACE_SCOPE_MISMATCH", 403);
  }

  const dataSourceConfig = safeRecord(account.dataSource.config);
  const region = normalizeAmazonRegion(stringValue(dataSourceConfig.amazonRegion) ?? "na");
  const marketplaceIds = normalizeMarketplaceIds(dataSourceConfig.marketplaceIds, region);
  const sellerId = stringValue(dataSourceConfig.sellerId) ?? account.shopDomain;
  const now = new Date();
  const syncWindowStart = new Date((account.lastSyncedAt?.getTime() ?? now.getTime() - amazonFirstSyncDays() * 24 * 60 * 60 * 1000) - amazonSafetyOverlapMs());
  const syncWindowEnd = now;
  const idempotencyKey = sha256([
    input.workspaceId,
    account.dataSourceId,
    AMAZON_PROVIDER,
    sellerId,
    marketplaceIds.join(","),
    syncWindowStart.toISOString(),
    syncWindowEnd.toISOString().slice(0, 16)
  ].join("|"));
  const existingRun = await prisma.ecommerceSyncRun.findUnique({
    where: {
      workspaceId_dataSourceId_provider_shopDomain_idempotencyKey: {
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId,
        provider: AMAZON_PROVIDER,
        shopDomain: account.shopDomain,
        idempotencyKey
      }
    }
  });

  if (!input.force && existingRun && (existingRun.status === "running" || existingRun.status === "success" || existingRun.status === "partial")) {
    return {
      ok: true,
      reused: true,
      syncRunId: existingRun.syncRunId,
      status: existingRun.status,
      manifestKey: existingRun.manifestKey
    };
  }

  const syncRunId = crypto.randomUUID();
  const syncRun = await prisma.ecommerceSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      provider: AMAZON_PROVIDER,
      shopDomain: account.shopDomain,
      syncRunId,
      idempotencyKey,
      status: "running",
      syncWindowStart,
      syncWindowEnd
    }
  });

  try {
    const env = requiredAmazonEnv();
    const access = await refreshAmazonAccessToken({
      encryptedRefreshToken: account.encryptedAccessToken,
      clientId: env.clientId,
      clientSecret: env.clientSecret
    });
    const regionConfig = amazonRegionConfig(region);
    const client = new AmazonSellingPartnerClient({
      accessToken: access.accessToken,
      endpoint: regionConfig.spApiEndpoint,
      awsSigningRegion: regionConfig.awsSigningRegion,
      awsAccessKeyId: env.awsAccessKeyId,
      awsSecretAccessKey: env.awsSecretAccessKey,
      awsSessionToken: env.awsSessionToken
    });

    const ordersResult = await runPhase("orders", () =>
      fetchAllAmazonPages({
        fetchPage: (nextToken) => client.listOrders({
          marketplaceIds,
          lastUpdatedAfter: syncWindowStart.toISOString(),
          nextToken
        })
      })
    );
    const orders = ordersResult.records?.records ?? [];
    const orderItemsByOrderId = new Map<string, AmazonOrderItem[]>();
    let orderItemsRead = 0;
    const orderItemsResult = await runPhase("order_items", async () => {
      for (const order of orders) {
        if (!order.AmazonOrderId) continue;
        const page = await fetchAllAmazonPages({
          fetchPage: (nextToken) => client.listOrderItems({
            amazonOrderId: order.AmazonOrderId!,
            nextToken
          })
        });
        orderItemsByOrderId.set(order.AmazonOrderId, page.records);
        orderItemsRead += page.records.length;
      }
      return { records: orderItemsRead, completed: true, lastCursor: null, pageCount: orders.length };
    });
    const asinList = Array.from(new Set(Array.from(orderItemsByOrderId.values()).flat().map((item) => item.ASIN).filter((asin): asin is string => Boolean(asin))));
    const productsResult = await runPhase("products", () =>
      client.getCatalogItems({ asinList, marketplaceIds })
    );
    const inventoryResult = await runPhase("inventory", () =>
      fetchAllAmazonPages({
        fetchPage: (nextToken) => client.listInventorySummaries({
          marketplaceIds,
          startDateTime: syncWindowStart.toISOString(),
          nextToken
        })
      })
    );
    const financialsResult = await runPhase("financials", () =>
      fetchAllAmazonPages<AmazonFinancialEvent>({
        fetchPage: (nextToken) => client.listFinancialEvents({
          postedAfter: syncWindowStart.toISOString(),
          nextToken
        })
      })
    );
    const phaseStatuses = {
      orders: summarizePhase(ordersResult),
      order_items: summarizePhase(orderItemsResult),
      products: summarizePhase(productsResult),
      inventory: summarizePhase(inventoryResult),
      financials: summarizePhase(financialsResult)
    };
    const products = Array.isArray(productsResult.records) ? productsResult.records : [];
    const inventory = inventoryResult.records?.records ?? [];
    const financialEvents = financialsResult.records?.records ?? [];
    const successfulPhases = Object.values(phaseStatuses).filter((phase) => phase.status === "success").length;

    if (successfulPhases === 0) {
      throw new AmazonConnectorError("Amazon sync failed before any resource completed.", "SYNC_FAILED", 502);
    }

    const canonical = normalizeAmazonRecords({
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      sellerId,
      syncRunId,
      orders,
      orderItemsByOrderId,
      products,
      inventory,
      financialEvents
    });
    const deduped = dedupeAmazonCanonicalArtifact(canonical);
    const normalizedRowCount = Object.values(deduped.artifact).reduce((sum, rows) => sum + rows.length, 0);
    const status = Object.values(phaseStatuses).some((phase) => phase.status === "failed") ? "partial" : "success";
    const baseKey = `workspaces/${input.workspaceId}/connectors/amazon/${account.dataSourceId}/${syncRunId}`;
    const rawArtifacts = {
      orders: await writeArtifact(`${baseKey}/raw/orders.jsonl`, orders),
      order_items: await writeArtifact(`${baseKey}/raw/order_items.jsonl`, Array.from(orderItemsByOrderId.entries()).flatMap(([orderId, items]) => items.map((item) => ({ orderId, ...item })))),
      products: await writeArtifact(`${baseKey}/raw/products.jsonl`, products),
      inventory: await writeArtifact(`${baseKey}/raw/inventory.jsonl`, inventory),
      financials: await writeArtifact(`${baseKey}/raw/financials.jsonl`, financialEvents)
    };
    const normalizedArtifacts: Record<string, ArtifactWriteResult> = {};
    for (const [tableName, rows] of Object.entries(deduped.artifact)) {
      normalizedArtifacts[tableName] = await writeArtifact(`${baseKey}/normalized/${tableName}.jsonl`, rows);
    }
    const latestBusinessDate = latestDate(deduped.artifact.ecommerce_orders.map((row) => row.order_date));
    const manifest = {
      workspace_id: input.workspaceId,
      data_source_id: account.dataSourceId,
      connector_account_id: account.id,
      provider: AMAZON_PROVIDER,
      seller_id: sellerId,
      selling_partner_id: sellerId,
      marketplaces: marketplaceSummary(marketplaceIds),
      marketplace_ids: marketplaceIds,
      amazon_region: region,
      sync_run_id: syncRunId,
      schema_version: AMAZON_CANONICAL_SCHEMA_VERSION,
      manifest_key: `${baseKey}/manifest/manifest.json`,
      raw_artifact_keys: objectMap(rawArtifacts, (artifact) => artifact.artifactKey),
      normalized_artifact_keys: objectMap(normalizedArtifacts, (artifact) => artifact.artifactKey),
      row_counts: {
        orders_read: orders.length,
        order_items_read: orderItemsRead,
        products_read: products.length,
        inventory_rows_read: inventory.length,
        financial_events_read: financialEvents.length
      },
      accepted_row_counts: objectMap(normalizedArtifacts, (artifact) => artifact.rowCount),
      rejected_row_counts: {},
      duplicate_count: deduped.duplicateCounts,
      checksum: objectMap(normalizedArtifacts, (artifact) => artifact.checksum),
      latest_business_date: latestBusinessDate,
      sync_started_at: syncRun.startedAt.toISOString(),
      sync_finished_at: new Date().toISOString(),
      sync_window_start: syncWindowStart.toISOString(),
      sync_window_end: syncWindowEnd.toISOString(),
      sync_status: status,
      phases: phaseStatuses,
      rate_limit_retries: client.stats.rateLimitRetries,
      advertising_data_available: false,
      cogs_status: "missing"
    };
    const manifestArtifact = await writeArtifact(manifest.manifest_key, [manifest], "application/json");
    const allArtifacts = [
      ...Object.entries(rawArtifacts).map(([name, artifact]) => ({ name, type: "raw", artifact })),
      ...Object.entries(normalizedArtifacts).map(([name, artifact]) => ({ name, type: "normalized", artifact })),
      { name: "manifest", type: "manifest", artifact: manifestArtifact }
    ];
    const canonicalDataset = buildAmazonCanonicalDataset(deduped.artifact, {
      normalizedAt: manifest.sync_finished_at,
      warnings: Object.entries(phaseStatuses).filter(([, phase]) => phase.status === "failed").map(([name, phase]) => `${name}: ${phase.error ?? "failed"}`),
      duplicateCount: Object.values(deduped.duplicateCounts).reduce((sum, count) => sum + count, 0)
    });
    const snapshotJson = buildCanonicalSnapshotJson({
      manifest: {
        businessType: "ecommerce",
        sourceProvider: AMAZON_PROVIDER,
        manifestKey: manifest.manifest_key,
        syncRunId: manifest.sync_run_id,
        checksum: manifest.checksum,
        latestBusinessDate: manifest.latest_business_date,
        dataMode: status === "partial" ? "PARTIAL" : "FULL",
        confidenceScore: status === "partial" ? 0.75 : 0.9,
        missingFields: Object.entries(phaseStatuses).filter(([, phase]) => phase.status === "failed").map(([name]) => name),
        estimationUsed: false,
        syncStartedAt: manifest.sync_started_at,
        syncFinishedAt: manifest.sync_finished_at,
        analytics: { provider: AMAZON_PROVIDER, phases: phaseStatuses },
        semanticLearning: { records_updated: 0, memory_size: 0, average_memory_confidence: 0 },
        guardrailReport: {
          provider: AMAZON_PROVIDER,
          partial: status === "partial",
          advertisingDataAvailable: false,
          cogsStatus: "missing"
        }
      },
      artifacts: Object.fromEntries(Object.entries(normalizedArtifacts).map(([name, artifact]) => [
        name,
        {
          ...artifact,
          columns: amazonCanonicalColumns(name)
        }
      ])),
      canonicalDataset
    });

    const syncCommit = await prisma.$transaction(async (tx) => {
      await tx.ecommerceSyncArtifact.createMany({
        data: allArtifacts.map((item) => ({
          workspaceId: input.workspaceId,
          dataSourceId: account.dataSourceId!,
          connectorAccountId: account.id,
          syncRunId,
          provider: AMAZON_PROVIDER,
          shopDomain: account.shopDomain,
          artifactType: item.type,
          tableName: item.type === "normalized" ? item.name : null,
          artifactKey: item.artifact.artifactKey,
          checksum: item.artifact.checksum,
          rowCount: item.artifact.rowCount
        })),
        skipDuplicates: true
      });
      await tx.ecommerceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status,
          cursorJson: {
            phases: phaseStatuses,
            orders: ordersResult.records?.lastCursor ?? null,
            inventory: inventoryResult.records?.lastCursor ?? null,
            financials: financialsResult.records?.lastCursor ?? null
          },
          rowsPulled: orders.length + orderItemsRead + products.length + inventory.length + financialEvents.length,
          rowsNormalized: normalizedRowCount,
          rowsRejected: 0,
          manifestKey: manifest.manifest_key,
          errorMessage: status === "partial" ? "Amazon sync partially completed. Successful resources were preserved." : null,
          finishedAt: new Date()
        }
      });
      const successfulSyncTime = syncWindowEnd;
      await tx.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: {
          lastSyncedAt: successfulSyncTime,
          lastAutoSyncSuccessAt: input.trigger === "scheduled" ? successfulSyncTime : account.lastAutoSyncSuccessAt,
          autoSyncFailureCount: input.trigger === "scheduled" ? 0 : account.autoSyncFailureCount,
          nextSyncAt: account.autoSyncEnabled
            ? new Date(successfulSyncTime.getTime() + account.syncIntervalMinutes * 60 * 1000)
            : null
        }
      });
      const snapshot = await storeCanonicalSchemaSnapshot({
        prisma: tx,
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId!,
        status: status === "partial" ? ConnectionStatus.FAILED : ConnectionStatus.CONNECTED,
        schemaJson: snapshotJson,
        qualityReport: {
          provider: AMAZON_PROVIDER,
          manifestKey: manifest.manifest_key,
          syncRunId,
          phases: phaseStatuses,
          duplicateCount: deduped.duplicateCounts,
          cogsStatus: "missing",
          advertisingDataAvailable: false
        } as Prisma.InputJsonValue
      });

      await Promise.all(Object.entries(normalizedArtifacts).map(([tableName, artifact]) =>
        tx.dataSourceStats.upsert({
          where: {
            dataSourceConnectionId_tableName: {
              dataSourceConnectionId: account.dataSourceId!,
              tableName
            }
          },
          create: {
            dataSourceConnectionId: account.dataSourceId!,
            tableName,
            rowCount: artifact.rowCount,
            maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
            dateField: tableName === "ecommerce_inventory" ? "snapshot_at" : tableName === "ecommerce_costs" ? "cost_date" : "order_date",
            schemaHash: artifact.checksum
          },
          update: {
            rowCount: artifact.rowCount,
            maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
            schemaHash: artifact.checksum,
            calculatedAt: new Date()
          }
        })
      ));

      await tx.dataSourceConnection.updateMany({
        where: {
          id: account.dataSourceId!,
          workspaceId: input.workspaceId,
          isActive: true
        },
        data: {
          status: status === "partial" ? ConnectionStatus.FAILED : ConnectionStatus.CONNECTED,
          lastErrorMessage: status === "partial" ? "Latest Amazon sync partially completed. Showing successful resource data." : null,
          lastSyncAt: syncWindowEnd,
          schemas: snapshotJson as Prisma.InputJsonValue,
          config: {
            ...dataSourceConfig,
            ...amazonPublicAccountConfig({
              sellerId,
              connectorAccountId: account.id,
              region,
              marketplaceIds,
              authorizationStatus: status === "partial" ? "sync_partial" : "connected"
            }),
            manifestKey: manifest.manifest_key,
            latestSyncRunId: syncRunId,
            schemaSnapshotId: snapshot.id,
            latestBusinessDate,
            canonicalDataVersion: sha256(JSON.stringify(manifest.checksum)),
            phases: phaseStatuses
          } as Prisma.InputJsonValue
        }
      });

      return { schemaSnapshotId: snapshot.id };
    }, { timeout: 60_000 });

    const downstreamJob = await prisma.asyncJob.create({
      data: {
        workspaceId: input.workspaceId,
        type: "CALCULATE_METRICS",
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued after Amazon sync",
        payload: {
          dataSourceId: account.dataSourceId,
          schemaSnapshotId: syncCommit.schemaSnapshotId,
          syncRunId,
          provider: AMAZON_PROVIDER,
          canonicalDataVersion: sha256(JSON.stringify(manifest.checksum))
        } as Prisma.InputJsonValue
      }
    }).catch((error) => {
      console.warn("Failed to create Amazon downstream metric job", error);
      return null;
    });
    if (downstreamJob?.id) {
      void import("@/lib/jobs/async-job-runner").then(({ processJob }) => processJob(downstreamJob.id)).catch((error) => {
        console.warn("Failed to process Amazon downstream metric job", error);
      });
    }

    console.info("AMAZON_SYNC_SUCCESS", {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      shopDomain: account.shopDomain,
      sellerId,
      syncRunId,
      status
    });

    return {
      ok: true,
      reused: false,
      syncRunId,
      status,
      manifest,
      manifestKey: manifest.manifest_key,
      downstreamJobId: downstreamJob?.id ?? null
    };
  } catch (error) {
    await prisma.ecommerceSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Amazon sync failed.",
        finishedAt: new Date()
      }
    }).catch(() => undefined);
    await prisma.dataSourceConnection.updateMany({
      where: {
        id: account.dataSourceId,
        workspaceId: input.workspaceId
      },
      data: {
        status: isAmazonAuthRevokedError(error) ? ConnectionStatus.PENDING : ConnectionStatus.FAILED,
        lastErrorMessage: isAmazonAuthRevokedError(error)
          ? "Amazon authorization needs to be renewed."
          : error instanceof Error ? error.message : "Amazon sync failed."
      }
    }).catch(() => undefined);

    if (isAmazonAuthRevokedError(error)) {
      await prisma.ecommerceConnectorAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: input.workspaceId,
          provider: AMAZON_PROVIDER
        },
        data: {
          status: "needs_reconnection",
          autoSyncEnabled: false,
          nextSyncAt: null
        }
      }).catch(() => undefined);
    }

    console.error(isAmazonAuthRevokedError(error) ? "AMAZON_SYNC_AUTH_REVOKED" : "AMAZON_SYNC_FAILED", {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      shopDomain: account.shopDomain,
      message: error instanceof Error ? error.message : "Amazon sync failed"
    });

    throw error;
  }
}

async function runPhase<T>(name: string, fn: () => Promise<T>): Promise<PhaseResult<T | null>> {
  try {
    return { status: "success", records: await fn() };
  } catch (error) {
    console.warn("AMAZON_SYNC_PHASE_FAILED", {
      phase: name,
      message: error instanceof Error ? error.message : "phase failed"
    });
    return { status: "failed", records: null, error: error instanceof Error ? error.message : "phase failed" };
  }
}

function summarizePhase(result: PhaseResult<unknown>) {
  return {
    status: result.status,
    error: result.error ?? null,
    pageCount: result.records && typeof result.records === "object" && "pageCount" in result.records
      ? Number((result.records as { pageCount?: number }).pageCount ?? 0)
      : null,
    cursor: result.records && typeof result.records === "object" && "lastCursor" in result.records
      ? ((result.records as { lastCursor?: string | null }).lastCursor ?? null)
      : null
  };
}

type ArtifactWriteResult = {
  artifactKey: string;
  checksum: string;
  rowCount: number;
};

async function writeArtifact(key: string, rows: unknown[], contentType = "application/x-ndjson"): Promise<ArtifactWriteResult> {
  const body = contentType === "application/json"
    ? JSON.stringify(rows[0] ?? {}, null, 2)
    : rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  const checksum = sha256(body);
  await writeR2ObjectText({ key, body, contentType });
  return { artifactKey: key, checksum, rowCount: rows.length };
}

function buildAmazonCanonicalDataset(artifact: AmazonCanonicalArtifact, input: {
  normalizedAt: string;
  warnings: string[];
  duplicateCount: number;
}): CanonicalDataset {
  return {
    schema_version: AMAZON_CANONICAL_SCHEMA_VERSION,
    tables: artifact,
    metadata: {
      source_platforms: [AMAZON_PROVIDER],
      normalized_at: input.normalizedAt,
      unknown_fields: [],
      validation: {
        accepted_rows: Object.values(artifact).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: 0,
        warnings: input.warnings.map((warning) => ({ table: "amazon", field: "sync_phase", reason: warning })),
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: input.duplicateCount
      },
      mapping_confidence: 0.9
    }
  };
}

function objectMap<T, R>(value: Record<string, T>, mapper: (input: T) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapper(item)]));
}

function latestDate(values: unknown[]) {
  const timestamps = values
    .map((value) => typeof value === "string" ? Date.parse(value) : NaN)
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function safeRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
