import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";
import { writeR2ObjectText } from "@/lib/r2-storage";
import { buildCanonicalDatasetFromMappedRecords } from "@/lib/semantic/mapper/canonical-schema-engine";
import type { CanonicalDataset } from "@/lib/semantic/types";
import {
  GOOGLE_ADS_PROVIDER,
  GoogleAdsConnectorError,
  isGoogleAdsAuthRevokedError
} from "@/lib/connectors/google-ads/google-ads-errors";
import { GoogleAdsClient } from "@/lib/connectors/google-ads/google-ads-client";
import {
  googleAdsApiVersion,
  googleAdsUseMock,
  normalizeCustomerId,
  requiredGoogleAdsEnv,
  refreshGoogleAdsAccessToken
} from "@/lib/connectors/google-ads/google-ads-oauth";
import {
  googleAdsCanonicalColumns,
  googleAdsPerformanceToCanonicalMappedRecords,
  normalizeGoogleAdsPerformanceToCanonicalAds
} from "@/lib/connectors/google-ads/google-ads-normalizer";
import { buildCanonicalSnapshotJson, storeCanonicalSchemaSnapshot } from "@/lib/snapshot/canonical-snapshot-generator";

const SCHEMA_VERSION = "ecommerce_canonical_v1";
const DEFAULT_SYNC_DAYS = 30;

type JsonRecord = Record<string, unknown>;

type ArtifactWriteResult = {
  artifactKey: string;
  checksum: string;
  rowCount: number;
};

export async function runGoogleAdsProductionSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  trigger?: "manual" | "scheduled" | "google_ads_oauth_callback";
  force?: boolean;
  historicalSyncDays?: number | null;
}) {
  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: GOOGLE_ADS_PROVIDER,
      status: "connected",
      ...(input.dataSourceId ? { dataSourceId: input.dataSourceId } : {})
    },
    include: {
      dataSource: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!account?.dataSourceId || !account.dataSource) {
    throw new GoogleAdsConnectorError("Google Ads connection not found for this workspace.", "GOOGLE_ADS_ACCOUNT_NOT_FOUND", 404);
  }
  if (account.dataSource.workspaceId !== input.workspaceId || account.dataSource.provider !== GOOGLE_ADS_PROVIDER) {
    throw new GoogleAdsConnectorError("Google Ads connection not found for this workspace.", "GOOGLE_ADS_WORKSPACE_MISMATCH", 404);
  }

  const config = objectValue(account.dataSource.config);
  const customerId = normalizeCustomerId(stringValue(config.customerId) || account.shopDomain);
  const loginCustomerId = normalizeCustomerId(stringValue(config.loginCustomerId) || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "");
  if (!customerId) {
    throw new GoogleAdsConnectorError("Google Ads customer account is not accessible.", "GOOGLE_ADS_CUSTOMER_NOT_ACCESSIBLE", 403);
  }

  const syncWindowEnd = new Date();
  const historicalDays = positiveInt(input.historicalSyncDays ?? config.historicalSyncDays, DEFAULT_SYNC_DAYS);
  const previousSync = account.lastSyncedAt ?? account.dataSource.lastSyncAt;
  const syncWindowStart = previousSync && !input.force
    ? new Date(previousSync.getTime() - 5 * 60 * 1000)
    : new Date(syncWindowEnd.getTime() - historicalDays * 24 * 60 * 60 * 1000);
  const idempotencyKey = sha256([
    input.workspaceId,
    account.dataSourceId,
    GOOGLE_ADS_PROVIDER,
    customerId,
    isoDate(syncWindowStart),
    isoDate(syncWindowEnd)
  ].join(":"));

  const existingRun = await prisma.ecommerceSyncRun.findUnique({
    where: {
      workspaceId_dataSourceId_provider_shopDomain_idempotencyKey: {
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId,
        provider: GOOGLE_ADS_PROVIDER,
        shopDomain: customerId,
        idempotencyKey
      }
    },
    select: {
      syncRunId: true,
      status: true,
      manifestKey: true
    }
  });

  if (!input.force && (existingRun?.status === "running" || existingRun?.status === "success")) {
    return {
      ok: true,
      reused: true,
      syncRunId: existingRun.syncRunId,
      status: existingRun.status,
      manifestKey: existingRun.manifestKey
    };
  }

  const syncRunId = `google_ads_sync_${crypto.randomUUID()}`;
  const syncRun = await prisma.ecommerceSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      provider: GOOGLE_ADS_PROVIDER,
      shopDomain: customerId,
      syncRunId,
      idempotencyKey,
      status: "running",
      syncWindowStart,
      syncWindowEnd
    }
  });

  try {
    const env = googleAdsUseMock()
      ? { clientId: "mock", clientSecret: "mock", redirectUri: "mock", developerToken: "mock", loginCustomerId, apiVersion: googleAdsApiVersion() }
      : requiredGoogleAdsEnv();
    const token = googleAdsUseMock()
      ? { accessToken: "mock", expiresIn: 3600 }
      : await refreshGoogleAdsAccessToken({
          encryptedRefreshToken: account.encryptedAccessToken,
          clientId: env.clientId,
          clientSecret: env.clientSecret
        });
    const client = new GoogleAdsClient({
      accessToken: token.accessToken,
      developerToken: env.developerToken,
      loginCustomerId: loginCustomerId || env.loginCustomerId,
      apiVersion: env.apiVersion
    });
    const [customer, campaigns, adGroups, keywordPerformance] = await Promise.all([
      client.fetchCustomer(customerId),
      client.fetchCampaigns(customerId),
      client.fetchAdGroups(customerId),
      client.fetchKeywordPerformance({
        customerId,
        since: isoDate(syncWindowStart),
        until: isoDate(syncWindowEnd)
      })
    ]);
    const canonicalRows = normalizeGoogleAdsPerformanceToCanonicalAds(keywordPerformance);
    const canonicalDataset = buildGoogleAdsCanonicalDataset(keywordPerformance);
    const latestBusinessDate = latestDate(canonicalRows.map((row) => row.date));
    const baseKey = [
      "workspaces",
      input.workspaceId,
      "connectors",
      "google_ads",
      account.dataSourceId,
      syncRunId
    ].join("/");
    const rawArtifacts = {
      campaigns: await writeArtifact(`${baseKey}/raw/campaigns.jsonl`, campaigns),
      ad_groups: await writeArtifact(`${baseKey}/raw/ad_groups.jsonl`, adGroups),
      keyword_performance: await writeArtifact(`${baseKey}/raw/keyword_performance.jsonl`, keywordPerformance)
    };
    const normalizedArtifacts = {
      ecommerce_ads: await writeArtifact(`${baseKey}/normalized/ecommerce_ads.jsonl`, canonicalDataset.tables.ecommerce_ads ?? [])
    };
    const manifestKey = `${baseKey}/manifest/manifest.json`;
    const manifest = {
      workspace_id: input.workspaceId,
      data_source_id: account.dataSourceId,
      connector_account_id: account.id,
      provider: GOOGLE_ADS_PROVIDER,
      customer_id: customerId,
      login_customer_id: loginCustomerId || env.loginCustomerId || null,
      sync_run_id: syncRunId,
      schema_version: SCHEMA_VERSION,
      manifest_key: manifestKey,
      raw_artifact_keys: objectMap(rawArtifacts, (artifact) => artifact.artifactKey),
      normalized_artifact_keys: objectMap(normalizedArtifacts, (artifact) => artifact.artifactKey),
      row_counts: objectMap(rawArtifacts, (artifact) => artifact.rowCount),
      accepted_row_counts: objectMap(normalizedArtifacts, (artifact) => artifact.rowCount),
      rejected_row_counts: {},
      checksum: objectMap(normalizedArtifacts, (artifact) => artifact.checksum),
      latest_business_date: latestBusinessDate,
      sync_started_at: syncRun.startedAt.toISOString(),
      sync_finished_at: new Date().toISOString(),
      sync_window_start: syncWindowStart.toISOString(),
      sync_window_end: syncWindowEnd.toISOString(),
      advertising_data_available: true,
      sku_attribution_available: false,
      quality_summary: {
        raw_rows: campaigns.length + adGroups.length + keywordPerformance.length,
        normalized_ads: canonicalDataset.tables.ecommerce_ads?.length ?? 0,
        campaigns: campaigns.length,
        ad_groups: adGroups.length,
        keyword_performance: keywordPerformance.length
      }
    };
    const manifestArtifact = await writeArtifact(manifestKey, [manifest], "application/json");
    const snapshotJson = buildCanonicalSnapshotJson({
      manifest: {
        businessType: "ads",
        sourceProvider: GOOGLE_ADS_PROVIDER,
        manifestKey,
        syncRunId,
        checksum: manifest.checksum,
        latestBusinessDate,
        dataMode: "FULL",
        confidenceScore: canonicalDataset.tables.ecommerce_ads?.length ? 0.85 : 0.5,
        missingFields: [],
        estimationUsed: false,
        syncStartedAt: manifest.sync_started_at,
        syncFinishedAt: manifest.sync_finished_at,
        analytics: {
          table: "ecommerce_ads",
          rows: canonicalDataset.tables.ecommerce_ads?.length ?? 0,
          advertisingDataAvailable: true,
          skuAttributionAvailable: false
        }
      },
      artifacts: {
        ecommerce_ads: {
          ...normalizedArtifacts.ecommerce_ads,
          columns: googleAdsCanonicalColumns("ecommerce_ads")
        }
      },
      canonicalDataset
    });

    await prisma.$transaction(async (tx) => {
      await tx.ecommerceSyncArtifact.createMany({
        data: [
          ...Object.entries(rawArtifacts).map(([name, artifact]) => ({ name, type: "raw", artifact })),
          ...Object.entries(normalizedArtifacts).map(([name, artifact]) => ({ name, type: "normalized", artifact })),
          { name: "manifest", type: "manifest", artifact: manifestArtifact }
        ].map((item) => ({
          workspaceId: input.workspaceId,
          dataSourceId: account.dataSourceId!,
          connectorAccountId: account.id,
          syncRunId,
          provider: GOOGLE_ADS_PROVIDER,
          shopDomain: customerId,
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
          status: "success",
          cursorJson: {
            syncWindowStart: syncWindowStart.toISOString(),
            syncWindowEnd: syncWindowEnd.toISOString(),
            customerId,
            latestBusinessDate
          },
          rowsPulled: manifest.quality_summary.raw_rows,
          rowsNormalized: normalizedArtifacts.ecommerce_ads.rowCount,
          rowsRejected: 0,
          manifestKey,
          finishedAt: new Date()
        }
      });
      await tx.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: {
          lastSyncedAt: syncWindowEnd,
          lastAutoSyncSuccessAt: syncWindowEnd,
          autoSyncFailureCount: 0
        }
      });
      await tx.googleAdsConnection.updateMany({
        where: {
          workspaceId: input.workspaceId,
          dataSourceId: account.dataSourceId!,
          customerId
        },
        data: {
          accessTokenLastRefreshedAt: googleAdsUseMock() ? null : new Date(),
          status: "connected",
          lastSyncedAt: syncWindowEnd,
          syncCursor: {
            syncWindowStart: syncWindowStart.toISOString(),
            syncWindowEnd: syncWindowEnd.toISOString(),
            latestBusinessDate
          } as Prisma.InputJsonValue
        }
      });
      const snapshot = await storeCanonicalSchemaSnapshot({
        prisma: tx,
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId!,
        status: ConnectionStatus.CONNECTED,
        schemaJson: snapshotJson,
        qualityReport: {
          manifestKey,
          syncRunId,
          sourceProvider: GOOGLE_ADS_PROVIDER,
          advertisingDataAvailable: true,
          skuAttributionAvailable: false,
          qualitySummary: manifest.quality_summary
        } as Prisma.InputJsonValue
      });

      await tx.dataSourceStats.upsert({
        where: {
          dataSourceConnectionId_tableName: {
            dataSourceConnectionId: account.dataSourceId!,
            tableName: "ecommerce_ads"
          }
        },
        create: {
          dataSourceConnectionId: account.dataSourceId!,
          tableName: "ecommerce_ads",
          rowCount: normalizedArtifacts.ecommerce_ads.rowCount,
          maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
          dateField: "date",
          schemaHash: normalizedArtifacts.ecommerce_ads.checksum
        },
        update: {
          rowCount: normalizedArtifacts.ecommerce_ads.rowCount,
          maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
          schemaHash: normalizedArtifacts.ecommerce_ads.checksum,
          calculatedAt: new Date()
        }
      });
      await tx.dataSourceConnection.update({
        where: { id: account.dataSourceId! },
        data: {
          lastSyncAt: syncWindowEnd,
          schemas: snapshotJson as Prisma.InputJsonValue,
          lastErrorMessage: null,
          config: {
            ...objectValue(account.dataSource?.config),
            customerId,
            loginCustomerId: loginCustomerId || env.loginCustomerId || null,
            customerName: customer?.descriptiveName ?? stringValue(config.customerName) ?? null,
            currencyCode: customer?.currencyCode ?? stringValue(config.currencyCode) ?? null,
            timeZone: customer?.timeZone ?? stringValue(config.timeZone) ?? null,
            manifestKey,
            latestSyncRunId: syncRunId,
            schemaVersion: SCHEMA_VERSION,
            latestBusinessDate,
            checksum: manifest.checksum,
            schemaSnapshotId: snapshot.id,
            advertisingDataAvailable: true,
            skuAttributionAvailable: false,
            qualitySummary: manifest.quality_summary
          } as Prisma.InputJsonValue
        }
      });
    });

    return {
      ok: true,
      reused: false,
      syncRunId,
      status: "success",
      manifest,
      rowCounts: {
        campaigns: campaigns.length,
        adGroups: adGroups.length,
        keywordPerformance: keywordPerformance.length,
        ecommerceAds: canonicalDataset.tables.ecommerce_ads?.length ?? 0
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Ads sync failed.";
    await prisma.ecommerceSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date()
      }
    }).catch(() => undefined);
    if (isGoogleAdsAuthRevokedError(error)) {
      await prisma.ecommerceConnectorAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: input.workspaceId,
          provider: GOOGLE_ADS_PROVIDER
        },
        data: {
          status: "needs_reconnection",
          autoSyncEnabled: false,
          nextSyncAt: null
        }
      }).catch(() => undefined);
      await prisma.dataSourceConnection.updateMany({
        where: {
          id: account.dataSourceId!,
          workspaceId: input.workspaceId,
          provider: GOOGLE_ADS_PROVIDER
        },
        data: {
          status: ConnectionStatus.PENDING,
          lastErrorMessage: message
        }
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function runInitialGoogleAdsSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
}) {
  return runGoogleAdsProductionSync(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    trigger: "google_ads_oauth_callback",
    force: true
  });
}

function buildGoogleAdsCanonicalDataset(rows: Parameters<typeof googleAdsPerformanceToCanonicalMappedRecords>[0]): CanonicalDataset {
  const dataset = buildCanonicalDatasetFromMappedRecords(googleAdsPerformanceToCanonicalMappedRecords(rows));

  return {
    ...dataset,
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: [],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: dataset.tables.ecommerce_ads ?? []
    },
    metadata: {
      ...dataset.metadata,
      source_platforms: [GOOGLE_ADS_PROVIDER]
    }
  };
}

async function writeArtifact(key: string, rows: unknown[], contentType = "application/x-ndjson"): Promise<ArtifactWriteResult> {
  const body = contentType === "application/json"
    ? JSON.stringify(rows[0] ?? {}, null, 2)
    : rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  await writeR2ObjectText({ key, body, contentType });

  return { artifactKey: key, checksum: sha256(body), rowCount: rows.length };
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function objectMap<T, V>(object: Record<string, T>, mapper: (value: T, key: string) => V) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, mapper(value, key)]));
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestDate(values: string[]) {
  const timestamps = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (!timestamps.length) return null;

  return new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
}
