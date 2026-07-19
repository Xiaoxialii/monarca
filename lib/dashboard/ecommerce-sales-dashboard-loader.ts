import { prisma } from "@/lib/prisma";
import { readR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";
import {
  ECOMMERCE_CANONICAL_SCHEMA_VERSION,
  ensureEcommerceCanonicalSnapshotFromDataSourceSchemas,
  isEcommerceCanonicalSchemaJson
} from "@/lib/snapshot/canonical-snapshot-generator";
import {
  adaptCanonicalDatasetForMetrics,
  buildEcommerceSalesDashboardData,
  emptyEcommerceCanonicalDataset,
  type EcommerceDashboardDecisionMode,
  type EcommerceSalesDashboardData
} from "@/lib/dashboard/ecommerce-sales-dashboard-data";

export type LoadDashboardResult = {
  data: EcommerceSalesDashboardData;
  state: "ready" | "empty" | "unavailable";
  message?: string;
  lineage?: {
    schemaSnapshotId: string;
    dataSourceId: string | null;
    manifestKey?: string;
    syncRunId?: string;
    checksum?: unknown;
  };
};

const TABLE_NAMES = [
  "ecommerce_orders",
  "ecommerce_order_items",
  "ecommerce_products",
  "ecommerce_customers",
  "ecommerce_refunds",
  "ecommerce_ads",
  "ecommerce_inventory"
] as const;

export async function loadEcommerceSalesDashboardData(input: {
  workspaceId: string;
  dataSourceId?: string | null;
  decisionMode?: EcommerceDashboardDecisionMode;
}): Promise<LoadDashboardResult> {
  let snapshots: Awaited<ReturnType<typeof findLatestEcommerceCanonicalSnapshots>>;

  try {
    snapshots = await findLatestEcommerceCanonicalSnapshots(input);
  } catch (error) {
    throw error;
  }

  if (!snapshots.length) {
    await ensureEcommerceCanonicalSnapshotFromDataSourceSchemas({
      prisma,
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId ?? null
    });
    snapshots = await findLatestEcommerceCanonicalSnapshots(input);
  }

  if (!snapshots.length) {
    return {
      data: buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset(), { decisionMode: input.decisionMode }),
      state: "empty",
      message: "No ecommerce canonical snapshot is available yet."
    };
  }

  const artifactDatasets: CanonicalDataset[] = [];
  const unavailableSnapshots: Array<{
    snapshotId: string;
    dataSourceId: string | null;
    message: string;
  }> = [];

  for (const snapshot of snapshots) {
    const schemaJson = objectValue(snapshot.schemaJson);
    try {
      artifactDatasets.push(await readCanonicalDatasetFromSnapshot(schemaJson));
    } catch (error) {
      unavailableSnapshots.push({
        snapshotId: snapshot.id,
        dataSourceId: snapshot.dataSourceId,
        message: readableArtifactError(error)
      });
    }
  }

  if (!artifactDatasets.length) {
    return {
      data: buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset(sourcePlatforms(objectValue(snapshots[0]?.schemaJson))), { decisionMode: input.decisionMode }),
      state: "unavailable",
      message: unavailableSnapshots.length
        ? "Canonical ecommerce artifacts are unavailable. Refresh the connected data source to regenerate canonical data."
        : "No canonical ecommerce artifacts are available.",
      lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
    };
  }

  const dataset = artifactDatasets.reduce((merged, current) => mergeCanonicalDatasets(merged, current));
  const adapted = adaptCanonicalDatasetForMetrics(dataset);
  const hasRows = Object.values(adapted.tables).some((rows) => rows.length > 0);

  const data = buildEcommerceSalesDashboardData(adapted, { decisionMode: input.decisionMode });

  return {
    data,
    state: hasRows ? "ready" : "empty",
    message: hasRows ? undefined : "Ecommerce canonical tables are empty.",
    lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
  };
}

async function readCanonicalDatasetFromSnapshot(schemaJson: Record<string, unknown>): Promise<CanonicalDataset> {
  const tableArtifacts = Array.isArray(schemaJson.tables) ? schemaJson.tables : [];
  const tables: CanonicalDataset["tables"] = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: [],
    ecommerce_inventory: []
  };

  for (const tableName of TABLE_NAMES) {
    const table = tableArtifacts.find((item) => objectValue(item).name === tableName);
    const artifactKey = typeof objectValue(table).artifactKey === "string" ? objectValue(table).artifactKey as string : null;
    if (!artifactKey) continue;

    tables[tableName] = parseJsonl(await readR2ObjectText(artifactKey));
  }

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: sourcePlatforms(schemaJson),
      normalized_at: typeof schemaJson.syncFinishedAt === "string"
        ? schemaJson.syncFinishedAt
        : typeof schemaJson.syncRunId === "string"
          ? String(schemaJson.syncRunId)
          : "1970-01-01T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: 0,
        warnings: Array.isArray(schemaJson.missingFields)
          ? schemaJson.missingFields.map((field) => ({ table: "ecommerce", field: String(field), reason: "upstream_missing_field" }))
          : [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: Number(schemaJson.confidenceScore ?? 0)
    }
  };
}

async function findLatestEcommerceCanonicalSnapshots(input: {
  workspaceId: string;
  dataSourceId?: string | null;
}) {
  const dataSourceFilter = input.dataSourceId ? `and "dataSourceId" = $2` : "";
  const snapshots = await prisma.$queryRawUnsafe<Array<{
    id: string;
    dataSourceId: string | null;
    schemaJson: unknown;
  }>>(
    `
      select
        id,
        "dataSourceId",
        jsonb_build_object(
          'schemaVersion', "schemaJson"->>'schemaVersion',
          'schema_version', "schemaJson"->>'schema_version',
          'tables', "schemaJson"->'tables',
          'sourceProvider', "schemaJson"->>'sourceProvider',
          'sourcePlatforms', "schemaJson"->'sourcePlatforms',
          'source_platforms', "schemaJson"->'source_platforms',
          'syncFinishedAt', "schemaJson"->>'syncFinishedAt',
          'syncRunId', "schemaJson"->>'syncRunId',
          'manifestKey', "schemaJson"->>'manifestKey',
          'checksum', "schemaJson"->'checksum',
          'missingFields', "schemaJson"->'missingFields',
          'confidenceScore', "schemaJson"->'confidenceScore'
        ) as "schemaJson"
      from "SchemaSnapshot"
      where "workspaceId" = $1
        ${dataSourceFilter}
        and (
          "schemaJson"->>'schemaVersion' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
          or "schemaJson"->>'schema_version' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
        )
      order by "createdAt" desc
      limit 80
    `,
    ...(input.dataSourceId ? [input.workspaceId, input.dataSourceId] : [input.workspaceId])
  );

  const latestBySource = new Map<string, typeof snapshots[number]>();

  for (const snapshot of snapshots) {
    if (!isEcommerceCanonicalSchemaJson(snapshot.schemaJson)) continue;

    const sourceKey = snapshot.dataSourceId ?? snapshot.id;
    if (!latestBySource.has(sourceKey)) {
      latestBySource.set(sourceKey, snapshot);
    }
  }

  return Array.from(latestBySource.values());
}

function parseJsonl(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readableArtifactError(error: unknown) {
  if (!(error instanceof Error)) return "Canonical artifact is unavailable.";

  if (
    error.name === "NoSuchKey" ||
    /specified key does not exist|nosuchkey/i.test(error.message)
  ) {
    return "Canonical artifact object is missing from storage.";
  }

  return error.message || "Canonical artifact is unavailable.";
}

function dedupeRows<T extends Record<string, unknown>>(rows: T[], key: string) {
  const deduped = new Map<string, T>();
  rows.forEach((row, index) => {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
      ? `${index}`
      : String(row[key]).trim();
    deduped.set(value, row);
  });

  return Array.from(deduped.values());
}

function mergeCanonicalDatasets(left: CanonicalDataset, right: CanonicalDataset): CanonicalDataset {
  const tables = {
    ecommerce_orders: dedupeRows([...left.tables.ecommerce_orders, ...right.tables.ecommerce_orders], "canonical_key"),
    ecommerce_order_items: dedupeRows([...left.tables.ecommerce_order_items, ...right.tables.ecommerce_order_items], "canonical_key"),
    ecommerce_products: dedupeRows([...left.tables.ecommerce_products, ...right.tables.ecommerce_products], "canonical_key"),
    ecommerce_customers: dedupeRows([...left.tables.ecommerce_customers, ...right.tables.ecommerce_customers], "canonical_key"),
    ecommerce_refunds: dedupeRows([...left.tables.ecommerce_refunds, ...right.tables.ecommerce_refunds], "canonical_key"),
    ecommerce_ads: dedupeRows([...(left.tables.ecommerce_ads ?? []), ...(right.tables.ecommerce_ads ?? [])], "canonical_key"),
    ecommerce_inventory: dedupeRows([...(left.tables.ecommerce_inventory ?? []), ...(right.tables.ecommerce_inventory ?? [])], "canonical_key")
  };
  const leftValidation = left.metadata.validation;
  const rightValidation = right.metadata.validation;

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: Array.from(new Set([
        ...left.metadata.source_platforms,
        ...right.metadata.source_platforms
      ])).sort(),
      normalized_at: new Date().toISOString(),
      unknown_fields: [...left.metadata.unknown_fields, ...right.metadata.unknown_fields],
      validation: {
        accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: leftValidation.rejected_rows + rightValidation.rejected_rows,
        warnings: [...leftValidation.warnings, ...rightValidation.warnings],
        rejected: [...leftValidation.rejected, ...rightValidation.rejected]
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: left.metadata.dedupe.duplicate_count + right.metadata.dedupe.duplicate_count
      },
      mapping_confidence: Math.max(left.metadata.mapping_confidence, right.metadata.mapping_confidence)
    }
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourcePlatforms(schemaJson: Record<string, unknown>) {
  const provider = typeof schemaJson.sourceProvider === "string" ? schemaJson.sourceProvider : null;

  return provider ? [provider] : [];
}

function lineage(schemaSnapshotId: string, dataSourceId: string | null, schemaJson: Record<string, unknown>) {
  return {
    schemaSnapshotId,
    dataSourceId,
    manifestKey: typeof schemaJson.manifestKey === "string" ? schemaJson.manifestKey : undefined,
    syncRunId: typeof schemaJson.syncRunId === "string" ? schemaJson.syncRunId : undefined,
    checksum: schemaJson.checksum
  };
}
