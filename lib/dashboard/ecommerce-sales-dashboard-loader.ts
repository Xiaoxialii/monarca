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
import type { ReportDateRangeInput } from "@/lib/report-date-range";

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
  dateRange?: Partial<ReportDateRangeInput> | null;
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
        data: buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset(), {
          decisionMode: input.decisionMode,
          dateRange: input.dateRange
        }),
      state: "empty",
      message: "No ecommerce canonical snapshot is available yet."
    };
  }

  const artifactDatasets: CanonicalDataset[] = [];
  const dashboardSnapshots: EcommerceSalesDashboardData[] = [];
  const unavailableSnapshots: Array<{
    snapshotId: string;
    dataSourceId: string | null;
    message: string;
  }> = [];

  const loadedSnapshots = await Promise.all(snapshots.map(async (snapshot) => {
    const schemaJson = objectValue(snapshot.schemaJson);
    const embeddedDashboard = dashboardSnapshotValue(schemaJson.dashboardSnapshot);
    try {
      return {
        snapshot,
        schemaJson,
        embeddedDashboard,
        dataset: await readCanonicalDatasetFromSnapshot(schemaJson),
        error: null as unknown
      };
    } catch (error) {
      return {
        snapshot,
        schemaJson,
        embeddedDashboard,
        dataset: null,
        error
      };
    }
  }));

  for (const loaded of loadedSnapshots) {
    if (loaded.dataset) {
      artifactDatasets.push(loaded.dataset);
      continue;
    }

    if (loaded.embeddedDashboard) dashboardSnapshots.push(loaded.embeddedDashboard);
    unavailableSnapshots.push({
      snapshotId: loaded.snapshot.id,
      dataSourceId: loaded.snapshot.dataSourceId,
      message: readableArtifactError(loaded.error)
    });
  }

  if (!artifactDatasets.length) {
    const dashboardSnapshot = dashboardSnapshots[0];
    if (dashboardSnapshot) {
      return {
        data: dashboardSnapshot,
        state: hasDashboardSnapshotRows(dashboardSnapshot) ? "ready" : "empty",
        message: hasDashboardSnapshotRows(dashboardSnapshot) ? undefined : "Ecommerce canonical dashboard snapshot is empty.",
        lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
      };
    }

    return {
      data: buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset(sourcePlatforms(objectValue(snapshots[0]?.schemaJson))), {
        decisionMode: input.decisionMode,
        dateRange: input.dateRange
      }),
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

  const data = buildEcommerceSalesDashboardData(adapted, {
    decisionMode: input.decisionMode,
    dateRange: input.dateRange
  });

  return {
    data,
    state: hasRows ? "ready" : "empty",
    message: hasRows ? undefined : "Ecommerce canonical tables are empty.",
    lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
  };
}

async function readCanonicalDatasetFromSnapshot(schemaJson: Record<string, unknown>): Promise<CanonicalDataset> {
  const embeddedDataset = canonicalDatasetValue(schemaJson.canonicalDataset) ?? canonicalDatasetValue(schemaJson.canonical_dataset);
  if (embeddedDataset) return embeddedDataset;

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

  const tableRows = await Promise.all(TABLE_NAMES.map(async (tableName) => {
    const table = tableArtifacts.find((item) => objectValue(item).name === tableName);
    const artifactKey = typeof objectValue(table).artifactKey === "string" ? objectValue(table).artifactKey as string : null;
    if (!artifactKey) return [tableName, [] as Record<string, unknown>[]] as const;

    return [tableName, parseJsonl(await readR2ObjectText(artifactKey))] as const;
  }));

  for (const [tableName, rows] of tableRows) {
    tables[tableName] = rows;
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
      mapping_confidence: Number(schemaJson.confidenceScore ?? 0),
      field_mappings: fieldMappingsFromSchemaJson(schemaJson)
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
        snapshot.id,
        snapshot."dataSourceId",
        jsonb_build_object(
          'schemaVersion', snapshot."schemaJson"->>'schemaVersion',
          'schema_version', snapshot."schemaJson"->>'schema_version',
          'tables', snapshot."schemaJson"->'tables',
          'sourceProvider', snapshot."schemaJson"->>'sourceProvider',
          'sourcePlatforms', snapshot."schemaJson"->'sourcePlatforms',
          'source_platforms', snapshot."schemaJson"->'source_platforms',
          'syncFinishedAt', snapshot."schemaJson"->>'syncFinishedAt',
          'syncRunId', snapshot."schemaJson"->>'syncRunId',
          'manifestKey', snapshot."schemaJson"->>'manifestKey',
          'checksum', snapshot."schemaJson"->'checksum',
          'missingFields', snapshot."schemaJson"->'missingFields',
          'confidenceScore', snapshot."schemaJson"->'confidenceScore',
          'field_mappings', snapshot."schemaJson"->'field_mappings',
          'fieldMappings', snapshot."schemaJson"->'fieldMappings',
          'metadata', snapshot."schemaJson"->'metadata',
          'canonicalDataset', snapshot."schemaJson"->'canonicalDataset',
          'canonical_dataset', snapshot."schemaJson"->'canonical_dataset',
          'dashboardSnapshot', snapshot."schemaJson"->'dashboardSnapshot'
        ) as "schemaJson"
      from "SchemaSnapshot" snapshot
      left join "DataSourceConnection" source
        on source.id = snapshot."dataSourceId"
        and source."workspaceId" = snapshot."workspaceId"
      where snapshot."workspaceId" = $1
        ${dataSourceFilter.replaceAll('"dataSourceId"', 'snapshot."dataSourceId"')}
        and snapshot."dataSourceId" is not null
        and source."isActive" = true
        and source."status" = 'CONNECTED'
        and snapshot."canonicalStatus" = 'READY'
        and snapshot."canonicalVersion" = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
        and (
          snapshot."schemaJson"->>'schemaVersion' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
          or snapshot."schemaJson"->>'schema_version' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
        )
      order by snapshot."createdAt" desc
      limit 40
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
      mapping_confidence: Math.max(left.metadata.mapping_confidence, right.metadata.mapping_confidence),
      field_mappings: [
        ...(left.metadata.field_mappings ?? []),
        ...(right.metadata.field_mappings ?? [])
      ]
    }
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dashboardSnapshotValue(value: unknown): EcommerceSalesDashboardData | null {
  const snapshot = objectValue(value);
  const metadata = objectValue(snapshot.metadata);
  if (metadata.schema_version !== ECOMMERCE_CANONICAL_SCHEMA_VERSION) return null;
  if (!Object.keys(objectValue(snapshot.metrics)).length) return null;
  if (!Object.keys(objectValue(snapshot.quality)).length) return null;

  return snapshot as unknown as EcommerceSalesDashboardData;
}

function hasDashboardSnapshotRows(data: EcommerceSalesDashboardData) {
  const metrics = objectValue(data.metrics);
  const catalog = objectValue(data.catalog_health);
  return Number(metrics.total_orders ?? 0) > 0 ||
    Number(metrics.total_revenue ?? 0) > 0 ||
    Number(catalog.catalog_row_count ?? 0) > 0 ||
    Number(catalog.sku_count ?? 0) > 0;
}

function canonicalDatasetValue(value: unknown): CanonicalDataset | null {
  const dataset = objectValue(value);
  const tables = objectValue(dataset.tables);
  if (!tables || dataset.schema_version !== ECOMMERCE_CANONICAL_SCHEMA_VERSION) return null;

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables: {
      ecommerce_orders: arrayRows(tables.ecommerce_orders),
      ecommerce_order_items: arrayRows(tables.ecommerce_order_items),
      ecommerce_products: arrayRows(tables.ecommerce_products),
      ecommerce_customers: arrayRows(tables.ecommerce_customers),
      ecommerce_refunds: arrayRows(tables.ecommerce_refunds),
      ecommerce_ads: arrayRows(tables.ecommerce_ads),
      ecommerce_inventory: arrayRows(tables.ecommerce_inventory)
    },
    metadata: canonicalMetadataValue(dataset.metadata)
  };
}

function arrayRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function canonicalMetadataValue(value: unknown): CanonicalDataset["metadata"] {
  const metadata = objectValue(value);
  const validation = objectValue(metadata.validation);
  const dedupe = objectValue(metadata.dedupe);

  return {
    source_platforms: Array.isArray(metadata.source_platforms)
      ? metadata.source_platforms.map(String)
      : [],
    normalized_at: typeof metadata.normalized_at === "string" ? metadata.normalized_at : new Date().toISOString(),
    unknown_fields: Array.isArray(metadata.unknown_fields)
      ? metadata.unknown_fields.filter((row): row is CanonicalDataset["metadata"]["unknown_fields"][number] => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      : [],
    validation: {
      accepted_rows: Number(validation.accepted_rows ?? 0),
      rejected_rows: Number(validation.rejected_rows ?? 0),
      warnings: Array.isArray(validation.warnings)
        ? validation.warnings.filter((row): row is CanonicalDataset["metadata"]["validation"]["warnings"][number] => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        : [],
      rejected: Array.isArray(validation.rejected)
        ? validation.rejected.filter((row): row is CanonicalDataset["metadata"]["validation"]["rejected"][number] => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        : []
    },
    dedupe: {
      canonical_key_strategy: "hash(platform + source_id + order_id)",
      duplicate_count: Number(dedupe.duplicate_count ?? 0)
    },
    mapping_confidence: Number(metadata.mapping_confidence ?? 0),
    field_mappings: fieldMappingsFromSchemaJson({ metadata })
  };
}

function fieldMappingsFromSchemaJson(schemaJson: Record<string, unknown>) {
  const metadata = objectValue(schemaJson.metadata);
  const candidates = [
    schemaJson.field_mappings,
    schemaJson.fieldMappings,
    metadata.field_mappings,
    metadata.fieldMappings
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    return candidate.filter((mapping): mapping is NonNullable<CanonicalDataset["metadata"]["field_mappings"]>[number] => (
      Boolean(mapping) &&
      typeof mapping === "object" &&
      !Array.isArray(mapping)
    ));
  }

  return [];
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
