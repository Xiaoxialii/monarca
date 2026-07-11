import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";
import { writeR2ObjectText } from "@/lib/r2-storage";
import {
  MetaAdsConnector,
  metaInsightsToCanonicalMappedRecords,
  normalizeMetaInsightsToCanonicalAds
} from "@/lib/ads/meta/meta-ads-connector";
import { META_ADS_PROVIDER } from "@/lib/ads/meta/meta-oauth";
import { decryptConnectorToken } from "@/lib/ecommerce-connectors/shopify-oauth";
import {
  buildCanonicalSnapshotJson,
  storeCanonicalSchemaSnapshot
} from "@/lib/snapshot/canonical-snapshot-generator";
import { buildCanonicalDatasetFromMappedRecords } from "@/lib/semantic/mapper/canonical-schema-engine";
import type { CanonicalDataset } from "@/lib/semantic/types";

const SCHEMA_VERSION = "ecommerce_canonical_v1";
const DEFAULT_SYNC_DAYS = 30;

type JsonRecord = Record<string, unknown>;

type ArtifactWriteResult = {
  artifactKey: string;
  checksum: string;
  rowCount: number;
};

type MetaSyncManifest = {
  workspace_id: string;
  data_source_id: string;
  connector_account_id: string;
  provider: typeof META_ADS_PROVIDER;
  ad_account_id: string;
  sync_run_id: string;
  schema_version: typeof SCHEMA_VERSION;
  manifest_key: string;
  raw_artifact_keys: Record<string, string>;
  normalized_artifact_keys: Record<string, string>;
  row_counts: Record<string, number>;
  accepted_row_counts: Record<string, number>;
  rejected_row_counts: Record<string, number>;
  checksum: Record<string, string>;
  latest_business_date: string | null;
  sync_started_at: string;
  sync_finished_at: string;
  sync_window_start: string;
  sync_window_end: string;
  quality_summary: {
    raw_rows: number;
    normalized_ads: number;
    campaigns: number;
    adsets: number;
    ads: number;
    insights: number;
  };
};

export async function runMetaAdsProductionSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
}) {
  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: META_ADS_PROVIDER,
      status: "connected",
      ...(input.dataSourceId ? { dataSourceId: input.dataSourceId } : {})
    },
    include: {
      dataSource: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!account?.dataSourceId || !account.dataSource) {
    throw new Error("META_CONNECTOR_ACCOUNT_NOT_FOUND");
  }
  if (account.dataSource.workspaceId !== input.workspaceId) {
    throw new Error("META_WORKSPACE_MISMATCH");
  }
  if (String(account.dataSource.type) !== "ADS_PLATFORM" || account.dataSource.provider !== META_ADS_PROVIDER) {
    throw new Error("META_DATA_SOURCE_MISMATCH");
  }

  const config = objectValue(account.dataSource.config);
  const adAccountId = stringValue(config.adAccountId) || account.shopDomain;
  if (!adAccountId) {
    throw new Error("META_AD_ACCOUNT_NOT_BOUND");
  }

  const syncWindowEnd = new Date();
  const previousSync = account.lastSyncedAt ?? account.dataSource.lastSyncAt;
  const syncWindowStart = previousSync
    ? new Date(previousSync.getTime() - 5 * 60 * 1000)
    : new Date(syncWindowEnd.getTime() - DEFAULT_SYNC_DAYS * 24 * 60 * 60 * 1000);
  const idempotencyKey = sha256([
    input.workspaceId,
    account.dataSourceId,
    META_ADS_PROVIDER,
    adAccountId,
    isoDate(syncWindowStart),
    isoDate(syncWindowEnd)
  ].join(":"));

  const existingRun = await prisma.ecommerceSyncRun.findUnique({
    where: {
      workspaceId_dataSourceId_provider_shopDomain_idempotencyKey: {
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId,
        provider: META_ADS_PROVIDER,
        shopDomain: adAccountId,
        idempotencyKey
      }
    },
    select: {
      syncRunId: true,
      status: true,
      manifestKey: true
    }
  });

  if (existingRun?.status === "running" || existingRun?.status === "success") {
    return {
      ok: true,
      reused: true,
      syncRunId: existingRun.syncRunId,
      status: existingRun.status,
      manifestKey: existingRun.manifestKey
    };
  }

  const syncRunId = `meta_sync_${crypto.randomUUID()}`;
  const syncRun = await prisma.ecommerceSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      provider: META_ADS_PROVIDER,
      shopDomain: adAccountId,
      syncRunId,
      idempotencyKey,
      status: "running",
      syncWindowStart,
      syncWindowEnd
    }
  });

  try {
    const accessToken = decryptConnectorToken(account.encryptedAccessToken);
    const connector = new MetaAdsConnector({
      accessToken,
      adAccountId
    });

    const [campaigns, adsets, ads, insights] = await Promise.all([
      connector.fetchCampaigns(),
      connector.fetchAdSets(),
      connector.fetchAds(),
      connector.fetchInsights({
        since: isoDate(syncWindowStart),
        until: isoDate(syncWindowEnd),
        level: "ad"
      })
    ]);

    const canonicalRows = normalizeMetaInsightsToCanonicalAds(insights);
    const canonicalDataset = buildMetaCanonicalDataset(insights);
    const latestBusinessDate = latestDate(canonicalRows.map((row) => row.date));
    const baseKey = [
      "workspaces",
      input.workspaceId,
      "connectors",
      "meta",
      account.dataSourceId,
      syncRunId
    ].join("/");

    const rawArtifacts = {
      campaigns: await writeArtifact(`${baseKey}/raw/campaigns.jsonl`, campaigns),
      adsets: await writeArtifact(`${baseKey}/raw/adsets.jsonl`, adsets),
      ads: await writeArtifact(`${baseKey}/raw/ads.jsonl`, ads),
      insights: await writeArtifact(`${baseKey}/raw/insights.jsonl`, insights)
    };
    const normalizedArtifacts = {
      ecommerce_ads: await writeArtifact(`${baseKey}/normalized/ecommerce_ads.jsonl`, canonicalDataset.tables.ecommerce_ads ?? [])
    };
    const manifest: MetaSyncManifest = {
      workspace_id: input.workspaceId,
      data_source_id: account.dataSourceId,
      connector_account_id: account.id,
      provider: META_ADS_PROVIDER,
      ad_account_id: adAccountId,
      sync_run_id: syncRunId,
      schema_version: SCHEMA_VERSION,
      manifest_key: `${baseKey}/manifest/manifest.json`,
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
      quality_summary: {
        raw_rows: campaigns.length + adsets.length + ads.length + insights.length,
        normalized_ads: canonicalDataset.tables.ecommerce_ads?.length ?? 0,
        campaigns: campaigns.length,
        adsets: adsets.length,
        ads: ads.length,
        insights: insights.length
      }
    };
    const manifestArtifact = await writeArtifact(manifest.manifest_key, [manifest], "application/json");
    const allArtifacts = [
      ...Object.entries(rawArtifacts).map(([name, artifact]) => ({ name, type: "raw", artifact })),
      ...Object.entries(normalizedArtifacts).map(([name, artifact]) => ({ name, type: "normalized", artifact })),
      { name: "manifest", type: "manifest", artifact: manifestArtifact }
    ];
    const snapshotJson = buildCanonicalSnapshotJson({
      manifest: {
        businessType: "ads",
        sourceProvider: META_ADS_PROVIDER,
        manifestKey: manifest.manifest_key,
        syncRunId,
        checksum: manifest.checksum,
        latestBusinessDate,
        dataMode: "FULL",
        confidenceScore: canonicalDataset.tables.ecommerce_ads?.length ? 1 : 0.5,
        missingFields: canonicalDataset.tables.ecommerce_ads?.length ? [] : ["ecommerce_ads.*"],
        estimationUsed: false,
        syncStartedAt: manifest.sync_started_at,
        syncFinishedAt: manifest.sync_finished_at,
        analytics: {
          table: "ecommerce_ads",
          rows: canonicalDataset.tables.ecommerce_ads?.length ?? 0
        }
      },
      artifacts: Object.fromEntries(Object.entries(normalizedArtifacts).map(([name, artifact]) => [
        name,
        {
          ...artifact,
          columns: canonicalColumns(name)
        }
      ])),
      canonicalDataset
    });

    await prisma.$transaction(async (tx) => {
      await tx.ecommerceSyncArtifact.createMany({
        data: allArtifacts.map((item) => ({
          workspaceId: input.workspaceId,
          dataSourceId: account.dataSourceId!,
          connectorAccountId: account.id,
          syncRunId,
          provider: META_ADS_PROVIDER,
          shopDomain: adAccountId,
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
            syncWindowEnd: syncWindowEnd.toISOString()
          },
          rowsPulled: manifest.quality_summary.raw_rows,
          rowsNormalized: normalizedArtifacts.ecommerce_ads.rowCount,
          rowsRejected: 0,
          manifestKey: manifest.manifest_key,
          finishedAt: new Date()
        }
      });
      await tx.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: syncWindowEnd }
      });
      const snapshot = await storeCanonicalSchemaSnapshot({
        prisma: tx,
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId!,
        status: ConnectionStatus.CONNECTED,
        schemaJson: snapshotJson,
        qualityReport: {
          manifestKey: manifest.manifest_key,
          syncRunId,
          sourceProvider: META_ADS_PROVIDER,
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
          config: {
            ...objectValue(account.dataSource?.config),
            manifestKey: manifest.manifest_key,
            latestSyncRunId: syncRunId,
            schemaVersion: SCHEMA_VERSION,
            latestBusinessDate,
            checksum: manifest.checksum,
            schemaSnapshotId: snapshot.id,
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
        adsets: adsets.length,
        ads: ads.length,
        insights: insights.length,
        ecommerce_ads: canonicalDataset.tables.ecommerce_ads?.length ?? 0
      }
    };
  } catch (error) {
    await prisma.ecommerceSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Meta Ads sync failed.",
        finishedAt: new Date()
      }
    }).catch(() => undefined);
    throw error;
  }
}

function buildMetaCanonicalDataset(insights: Parameters<typeof metaInsightsToCanonicalMappedRecords>[0]): CanonicalDataset {
  const dataset = buildCanonicalDatasetFromMappedRecords(metaInsightsToCanonicalMappedRecords(insights));

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
      source_platforms: ["meta_ads"]
    }
  };
}

async function writeArtifact(key: string, rows: unknown[], contentType = "application/x-ndjson"): Promise<ArtifactWriteResult> {
  const body = contentType === "application/json"
    ? JSON.stringify(rows[0] ?? {}, null, 2)
    : rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  await writeR2ObjectText({ key, body, contentType });
  const checksum = sha256(body);

  return { artifactKey: key, checksum, rowCount: rows.length };
}

function canonicalColumns(tableName: string) {
  const tableFields: Record<string, string[]> = {
    ecommerce_ads: ["platform", "campaign_id", "adset_id", "ad_id", "spend", "impressions", "clicks", "conversions", "attribution_revenue", "date", "source_id", "canonical_key"]
  };

  return (tableFields[tableName] ?? []).map((name) => ({ name, type: "canonical" }));
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestDate(values: string[]) {
  const timestamps = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (!timestamps.length) return null;

  return new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
}
