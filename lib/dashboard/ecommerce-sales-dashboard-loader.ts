import { prisma } from "@/lib/prisma";
import { listR2ObjectKeys, readR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { ANALYTICS_METRIC_ENGINE_VERSION } from "@/lib/report-metric-cache";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "@/lib/profit/canonical-profitability-engine";
import {
  ECOMMERCE_CANONICAL_SCHEMA_VERSION,
  ensureEcommerceCanonicalSnapshotFromDataSourceSchemas
} from "@/lib/snapshot/canonical-snapshot-generator";
import {
  adaptCanonicalDatasetForMetrics,
  buildEcommerceSalesDashboardData,
  emptyEcommerceCanonicalDataset,
  type EcommerceDashboardDecisionMode,
  type EcommerceSalesDashboardData
} from "@/lib/dashboard/ecommerce-sales-dashboard-data";
import type { ReportDateRangeInput } from "@/lib/report-date-range";
import { resolveCanonicalSnapshot } from "@/lib/snapshot/canonical-snapshot-resolver";

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
const CANONICAL_ACTIVE_SOURCE_LIMIT = 20;
const CANONICAL_ARTIFACT_READ_TIMEOUT_MS = 15_000;
const CANONICAL_ARTIFACT_LIST_TIMEOUT_MS = 10_000;
const canonicalArtifactManifestCache = new Map<string, {
  expiresAt: number;
  tables: Array<{ name: string; artifactKey: string; rowCount: number; rows: number }>;
}>();
type EcommerceCanonicalTableName = typeof TABLE_NAMES[number];
type SnapshotSourceRole = "commerce" | "ads" | "inventory" | "catalog" | "unknown";
type EcommerceCanonicalSnapshotRow = {
  id: string;
  dataSourceId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  version: number;
  qualityReport: unknown;
  schemaJson: Record<string, unknown>;
  sourceName?: string | null;
  sourceProvider?: string | null;
  sourceType?: string | null;
};

function debugDashboardLoader(stage: string, details: Record<string, unknown> = {}) {
  if (process.env.MONARCA_DASHBOARD_LOADER_DEBUG !== "true") return;
  console.info("[ecommerce-dashboard-loader]", {
    stage,
    ...details
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        if (typeof timeout.unref === "function") timeout.unref();
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function loadEcommerceSalesDashboardData(input: {
  workspaceId: string;
  dataSourceId?: string | null;
  decisionMode?: EcommerceDashboardDecisionMode;
  dateRange?: Partial<ReportDateRangeInput> | null;
}): Promise<LoadDashboardResult> {
  const loadStartedAt = Date.now();
  debugDashboardLoader("load_start", {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId ?? null,
    decisionMode: input.decisionMode ?? null
  });
  let snapshots: Awaited<ReturnType<typeof findLatestEcommerceCanonicalSnapshots>>;

  try {
    snapshots = await findLatestEcommerceCanonicalSnapshots(input);
    debugDashboardLoader("snapshots_found", {
      workspaceId: input.workspaceId,
      count: snapshots.length,
      durationMs: Date.now() - loadStartedAt
    });
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
    debugDashboardLoader("snapshots_found_after_ensure", {
      workspaceId: input.workspaceId,
      count: snapshots.length,
      durationMs: Date.now() - loadStartedAt
    });
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

  const artifactDatasets: Array<{
    snapshotId: string;
    dataSourceId: string | null;
    createdAt: Date;
    dataset: CanonicalDataset;
  }> = [];
  const dashboardSnapshots: EcommerceSalesDashboardData[] = [];
  const unavailableSnapshots: Array<{
    snapshotId: string;
    dataSourceId: string | null;
    message: string;
  }> = [];

  const snapshotsBySource = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const sourceKey = snapshot.dataSourceId ?? snapshot.id;
    snapshotsBySource.set(sourceKey, [...(snapshotsBySource.get(sourceKey) ?? []), snapshot]);
  }

  const sourceReadResults = await Promise.all(Array.from(snapshotsBySource.values()).map(readFirstAvailableSourceDataset));
  debugDashboardLoader("source_artifacts_read", {
    workspaceId: input.workspaceId,
    groups: sourceReadResults.length,
    durationMs: Date.now() - loadStartedAt
  });
  for (const sourceReadResult of sourceReadResults) {
    if (sourceReadResult.artifactDataset) {
      artifactDatasets.push(sourceReadResult.artifactDataset);
    }
    if (sourceReadResult.dashboardSnapshot) {
      dashboardSnapshots.push(sourceReadResult.dashboardSnapshot);
    }
    unavailableSnapshots.push(...sourceReadResult.unavailableSnapshots);
  }

  if (!artifactDatasets.some((entry) => (entry.dataset.tables.ecommerce_ads ?? []).length > 0)) {
    const supplementalAds = await readLatestWorkspaceSupplementalCanonicalTable(input.workspaceId, "ecommerce_ads").catch((error) => {
      unavailableSnapshots.push({
        snapshotId: "workspace_supplemental_ecommerce_ads",
        dataSourceId: null,
        message: readableArtifactError(error)
      });
      return null;
    });
    if (supplementalAds?.rows.length) {
      debugDashboardLoader("supplemental_ads_read", {
        workspaceId: input.workspaceId,
        snapshotId: supplementalAds.snapshotId,
        rows: supplementalAds.rows.length,
        durationMs: Date.now() - loadStartedAt
      });
      artifactDatasets.push({
        snapshotId: supplementalAds.snapshotId,
        dataSourceId: null,
        createdAt: supplementalAds.createdAt,
        dataset: datasetForSingleSupplementalTable("ecommerce_ads", supplementalAds.rows, supplementalAds.sourcePlatforms)
      });
    }
  }

  async function readFirstAvailableSourceDataset(sourceSnapshots: typeof snapshots[number][]) {
    const result: {
      artifactDataset: typeof artifactDatasets[number] | null;
      dashboardSnapshot: EcommerceSalesDashboardData | null;
      unavailableSnapshots: typeof unavailableSnapshots;
    } = {
      artifactDataset: null,
      dashboardSnapshot: null,
      unavailableSnapshots: []
    };

    for (const snapshot of sourceSnapshots) {
      const schemaJson = objectValue(snapshot.schemaJson);
      const embeddedDashboard = dashboardSnapshotValue(schemaJson.dashboardSnapshot);
      const allowedTables = allowedTablesForSnapshotRole(snapshotSourceRole(snapshot));
      try {
        result.artifactDataset = {
          snapshotId: snapshot.id,
          dataSourceId: snapshot.dataSourceId,
          createdAt: snapshot.createdAt,
          dataset: await readCanonicalDatasetFromSnapshot(schemaJson, {
            snapshotId: snapshot.id,
            dataSourceId: snapshot.dataSourceId
          }, allowedTables)
        };
        break;
      } catch (error) {
        if (embeddedDashboard) {
          result.dashboardSnapshot = embeddedDashboard;
          break;
        }

        result.unavailableSnapshots.push({
          snapshotId: snapshot.id,
          dataSourceId: snapshot.dataSourceId,
          message: readableArtifactError(error)
        });
      }
    }

    return result;
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

  const sourceScopedDatasets = suppressSupersededOrderFactDatasets(artifactDatasets);
  const dataset = sourceScopedDatasets.map((item) => item.dataset).reduce((merged, current) => mergeCanonicalDatasets(merged, current));
  debugDashboardLoader("datasets_merged", {
    workspaceId: input.workspaceId,
    datasets: artifactDatasets.length,
    orders: dataset.tables.ecommerce_orders.length,
    orderItems: dataset.tables.ecommerce_order_items.length,
    refunds: dataset.tables.ecommerce_refunds.length,
    ads: (dataset.tables.ecommerce_ads ?? []).length,
    inventory: (dataset.tables.ecommerce_inventory ?? []).length,
    durationMs: Date.now() - loadStartedAt
  });
  const adapted = adaptCanonicalDatasetForMetrics(dataset);
  const hasRows = Object.values(adapted.tables).some((rows) => rows.length > 0);

  const data = buildEcommerceSalesDashboardData(adapted, {
    decisionMode: input.decisionMode,
    dateRange: input.dateRange
  });
  const validationStatus = stringValue(objectValue(data.analytics_validation).status).toUpperCase();
  const hasInvalidCanonicalData = hasRows && validationStatus === "INVALID";
  debugDashboardLoader("metrics_built", {
    workspaceId: input.workspaceId,
    state: hasInvalidCanonicalData ? "unavailable" : hasRows ? "ready" : "empty",
    orders: data.metrics.orders,
    revenue: data.metrics.revenue,
    validationStatus,
    durationMs: Date.now() - loadStartedAt
  });

  return {
    data,
    state: hasInvalidCanonicalData ? "unavailable" : hasRows ? "ready" : "empty",
    message: hasInvalidCanonicalData
      ? "Canonical ecommerce data failed validation. Reprocess the connected data sources before showing report metrics."
      : hasRows ? undefined : "Ecommerce canonical tables are empty.",
    lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
  };
}

async function readCanonicalDatasetFromSnapshot(
  schemaJson: Record<string, unknown>,
  source?: { snapshotId: string; dataSourceId: string | null },
  allowedTables?: Set<EcommerceCanonicalTableName>
): Promise<CanonicalDataset> {
  const tableArtifacts = Array.isArray(schemaJson.tables) ? schemaJson.tables : [];
  const hasArtifactTables = tableArtifacts.some((item) => typeof objectValue(item).artifactKey === "string");
  if (!hasArtifactTables) {
    const embeddedDataset = canonicalDatasetValue(schemaJson.canonicalDataset) ?? canonicalDatasetValue(schemaJson.canonical_dataset);
    if (embeddedDataset) return embeddedDataset;
  }

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
    if (allowedTables && !allowedTables.has(tableName)) {
      return [tableName, [] as Record<string, unknown>[]] as const;
    }
    const table = tableArtifacts.find((item) => objectValue(item).name === tableName);
    const tableObject = objectValue(table);
    const artifactKey = typeof tableObject.artifactKey === "string" ? tableObject.artifactKey : null;
    if (!artifactKey) return [tableName, [] as Record<string, unknown>[]] as const;
    if (Number(tableObject.rowCount ?? tableObject.rows ?? 0) === 0) {
      return [tableName, [] as Record<string, unknown>[]] as const;
    }

    const artifactText = await withTimeout(
      readR2ObjectText(artifactKey),
      CANONICAL_ARTIFACT_READ_TIMEOUT_MS,
      `Canonical artifact read timed out for ${tableName}.`
    );
    return [tableName, parseJsonl(artifactText).map((row) => withSourceScope(row, source))] as const;
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

function withSourceScope(row: Record<string, unknown>, source?: { snapshotId: string; dataSourceId: string | null }) {
  if (!source) return row;

  return {
    ...row,
    data_source_id: firstString(row.data_source_id, row.dataSourceId) || source.dataSourceId || undefined,
    schema_snapshot_id: firstString(row.schema_snapshot_id, row.schemaSnapshotId) || source.snapshotId
  };
}

async function findLatestEcommerceCanonicalSnapshots(input: {
  workspaceId: string;
  dataSourceId?: string | null;
}): Promise<EcommerceCanonicalSnapshotRow[]> {
  const startedAt = Date.now();
  debugDashboardLoader("find_latest_start", {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId ?? null
  });
  const resolved = await resolveCanonicalSnapshot(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId ?? null
  });
  debugDashboardLoader("find_latest_resolved", {
    workspaceId: input.workspaceId,
    resolvedSnapshotId: resolved.snapshotId,
    resolvedDataSourceId: resolved.dataSourceId,
    durationMs: Date.now() - startedAt
  });
  const sources = await withTimeout(prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    provider: string;
    type: string;
    config: unknown;
    schemas: unknown;
    updatedAt: Date;
  }>>(
    `
      SELECT
        source.id,
        source.name,
        source.provider,
        source.type::text AS type,
        jsonb_strip_nulls(jsonb_build_object(
          'businessSource', source.config->>'businessSource',
          'sourceProvider', source.config->>'sourceProvider',
          'fileName', source.config->>'fileName'
        )) AS config,
        '{}'::jsonb AS schemas,
        source."updatedAt"
      FROM "DataSourceConnection" source
      WHERE source."workspaceId" = $1
        AND source."isActive" = true
        AND source.status = 'CONNECTED'
        AND ($2::text IS NULL OR source.id = $2::text)
      ORDER BY source."updatedAt" DESC
      LIMIT $3
    `,
    input.workspaceId,
    input.dataSourceId ?? null,
    CANONICAL_ACTIVE_SOURCE_LIMIT
  ), 10_000, "Connected source lookup timed out.");
  debugDashboardLoader("find_latest_sources", {
    workspaceId: input.workspaceId,
    sourceCount: sources.length,
    durationMs: Date.now() - startedAt
  });
  const orderedSources = sources.sort((left, right) => {
    if (resolved.dataSourceId && left.id === resolved.dataSourceId) return -1;
    if (resolved.dataSourceId && right.id === resolved.dataSourceId) return 1;
    return Number(right.updatedAt) - Number(left.updatedAt);
  });

  const sourceIds = orderedSources.map((source) => source.id);
  if (!sourceIds.length) return [];

  const sourceOrder = new Map(sourceIds.map((sourceId, index) => [sourceId, index]));
  const snapshotRows = await withTimeout(prisma.$queryRawUnsafe<Array<{
    id: string;
    dataSourceId: string | null;
    createdAt: Date;
    publishedAt: Date | null;
    version: number;
    schemaJson: unknown;
    qualityReport: unknown;
  }>>(
    `
      with ranked_snapshots as (
        select
          snapshot.id,
          row_number() over (
            partition by snapshot."dataSourceId"
            order by coalesce(snapshot."publishedAt", snapshot."createdAt") desc, snapshot.version desc
          ) as row_rank
        from "SchemaSnapshot" snapshot
        join "DataSourceConnection" source
          on source.id = snapshot."dataSourceId"
          and source."workspaceId" = snapshot."workspaceId"
        where snapshot."workspaceId" = $1
          and source."isActive" = true
          and source.status = 'CONNECTED'
          and ($2::text is null or snapshot."dataSourceId" = $2::text)
          and snapshot."canonicalStatus" = 'READY'
          and snapshot."canonicalVersion" = $3
      )
      select
        snapshot.id,
        snapshot."dataSourceId",
        snapshot."createdAt",
        snapshot."publishedAt",
        snapshot.version,
        jsonb_strip_nulls(jsonb_build_object(
          'sourceProvider', snapshot."schemaJson"->>'sourceProvider',
          'sourcePlatforms', snapshot."schemaJson"->'sourcePlatforms',
          'source_platforms', snapshot."schemaJson"->'source_platforms',
          'syncRunId', snapshot."schemaJson"->>'syncRunId',
          'manifestKey', snapshot."schemaJson"->>'manifestKey',
          'checksum', snapshot."schemaJson"->'checksum',
          'confidenceScore', snapshot."schemaJson"->'confidenceScore',
          'tables', COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'name', table_entry->>'name',
              'artifactKey', table_entry->>'artifactKey',
              'key', table_entry->>'key',
              'rowCount', table_entry->'rowCount',
              'rows', table_entry->'rows'
            )))
            FROM jsonb_array_elements(COALESCE(snapshot."schemaJson"->'tables', '[]'::jsonb)) table_entry
          ), '[]'::jsonb)
        )) AS "schemaJson",
        jsonb_strip_nulls(jsonb_build_object(
          'syncRunId', snapshot."qualityReport"->>'syncRunId',
          'manifestKey', snapshot."qualityReport"->>'manifestKey',
          'confidenceScore', snapshot."qualityReport"->'confidenceScore',
          'canonicalArtifactManifest', snapshot."qualityReport"->'canonicalArtifactManifest',
          'canonical_artifact_manifest', snapshot."qualityReport"->'canonical_artifact_manifest',
          'artifacts', snapshot."qualityReport"->'artifacts',
          'canonicalArtifacts', snapshot."qualityReport"->'canonicalArtifacts',
          'canonical_artifacts', snapshot."qualityReport"->'canonical_artifacts'
        )) AS "qualityReport"
      from ranked_snapshots ranked
      join "SchemaSnapshot" snapshot
        on snapshot.id = ranked.id
      where ranked.row_rank = 1
    `,
    input.workspaceId,
    input.dataSourceId ?? null,
    ECOMMERCE_CANONICAL_SCHEMA_VERSION
  ), 10_000, "Canonical snapshot lookup timed out.");
  debugDashboardLoader("find_latest_snapshot_rows", {
    workspaceId: input.workspaceId,
    rowCount: snapshotRows.length,
    durationMs: Date.now() - startedAt
  });
  const latestBySource = new Map<string, typeof snapshotRows[number]>();
  for (const snapshot of snapshotRows) {
    if (!snapshot.dataSourceId) continue;
    if (!latestBySource.has(snapshot.dataSourceId)) {
      latestBySource.set(snapshot.dataSourceId, snapshot);
    }
  }

  const rows = await Promise.all(Array.from(latestBySource.values()).map(async (snapshot) => {
    const dataSourceId = snapshot.dataSourceId;
    if (!dataSourceId) return null;
    const source = sources.find((item) => item.id === dataSourceId);
    const sourceConfig = objectValue(source?.config);
    const sourceSchemas = objectValue(source?.schemas);
    const qualityReport = objectValue(snapshot.qualityReport);
    const dbSchemaJson = objectValue(snapshot.schemaJson);
    const sourceProvider = firstString(
      sourceConfig.businessSource,
      sourceConfig.sourceProvider,
      sourceSchemas.sourceProvider,
      dbSchemaJson.sourceProvider,
      source?.provider,
      source?.type,
      "canonical"
    );
    const manifestTables = canonicalArtifactTablesFromMetadata(dbSchemaJson) ??
      canonicalArtifactTablesFromMetadata(qualityReport) ??
      canonicalArtifactTablesFromMetadata(sourceConfig) ??
      canonicalArtifactTablesFromMetadata(sourceSchemas) ??
      [];
    const tables = manifestTables.length
      ? manifestTables
      : await listLatestCanonicalArtifactTables(input.workspaceId, dataSourceId).catch(() => []);
    const schemaJson = lightweightCanonicalSchemaJsonFromTables({
      workspaceId: input.workspaceId,
      dataSourceId,
      sourceProvider,
      qualityReport,
      sourceConfig,
      sourceSchemas,
      tables
    });

    return {
      ...snapshot,
      schemaJson,
      sourceName: firstString((source as { name?: unknown } | undefined)?.name),
      sourceProvider,
      sourceType: firstString(source?.type)
    };
  }));

  const selectedRows = selectCanonicalReportingSnapshots(rows
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => (sourceOrder.get(left.dataSourceId ?? "") ?? 999) - (sourceOrder.get(right.dataSourceId ?? "") ?? 999)));
  debugDashboardLoader("reporting_snapshots_selected", {
    workspaceId: input.workspaceId,
    selected: selectedRows.map((row) => ({
      snapshotId: row.id,
      dataSourceId: row.dataSourceId,
      sourceName: row.sourceName,
      role: snapshotSourceRole(row)
    }))
  });

  return selectedRows;
}

function selectCanonicalReportingSnapshots(rows: EcommerceCanonicalSnapshotRow[]) {
  if (rows.length <= 1) return rows;

  const selected = new Map<string, EcommerceCanonicalSnapshotRow>();
  const add = (key: string, row: EcommerceCanonicalSnapshotRow | undefined) => {
    if (!row?.dataSourceId) return;
    selected.set(`${key}:${row.dataSourceId}`, row);
  };

  add("commerce", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_orders", "ecommerce_order_items"]) && snapshotSourceRole(row) === "commerce"));
  add("ads", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_ads"]) && snapshotSourceRole(row) === "ads"));
  add("inventory", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_inventory"]) && snapshotSourceRole(row) === "inventory"));
  if (!Array.from(selected.values()).some((row) => snapshotHasAnyTable(row, ["ecommerce_products"]))) {
    add("catalog", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_products"]) && snapshotSourceRole(row) === "catalog"));
  }

  if (!Array.from(selected.values()).some((row) => snapshotHasAnyTable(row, ["ecommerce_orders", "ecommerce_order_items"]))) {
    add("fallback-commerce", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_orders", "ecommerce_order_items"])));
  }
  if (!Array.from(selected.values()).some((row) => snapshotHasAnyTable(row, ["ecommerce_ads"]))) {
    add("fallback-ads", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_ads"]) && snapshotSourceRole(row) === "ads"));
  }
  if (!Array.from(selected.values()).some((row) => snapshotHasAnyTable(row, ["ecommerce_inventory"]))) {
    add("fallback-inventory", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_inventory"]) && snapshotSourceRole(row) === "inventory"));
  }
  if (!Array.from(selected.values()).some((row) => snapshotHasAnyTable(row, ["ecommerce_products"]))) {
    add("fallback-catalog", rows.find((row) => snapshotHasAnyTable(row, ["ecommerce_products"])));
  }

  const scoped = Array.from(selected.values());
  return scoped.length ? scoped : rows.slice(0, 1);
}

function snapshotSourceRole(snapshot: Pick<EcommerceCanonicalSnapshotRow, "schemaJson" | "sourceName" | "sourceProvider" | "sourceType">): SnapshotSourceRole {
  const schemaJson = objectValue(snapshot.schemaJson);
  const text = [
    snapshot.sourceName,
    snapshot.sourceProvider,
    snapshot.sourceType,
    schemaJson.sourceProvider,
    schemaJson.source_provider,
    ...sourcePlatforms(schemaJson)
  ].map(stringValue).join(" ").toLowerCase();

  if (/(^|[^a-z])(meta|meta_ads|facebook_ads|google_ads|amazon_ads|ads?|advertising)([^a-z]|$)/i.test(text)) return "ads";
  if (/(^|[^a-z])(inventory|warehouse|stock)([^a-z]|$)/i.test(text)) return "inventory";
  if (/(shopify|amazon|tiktok|ecommerce_platform|orders?|commerce)/i.test(text)) {
    return snapshotHasAnyTable(snapshot, ["ecommerce_orders", "ecommerce_order_items"]) ? "commerce" : "catalog";
  }

  if (snapshotHasAnyTable(snapshot, ["ecommerce_ads"]) && !snapshotHasAnyTable(snapshot, ["ecommerce_orders", "ecommerce_order_items"])) return "ads";
  if (snapshotHasAnyTable(snapshot, ["ecommerce_inventory"]) && !snapshotHasAnyTable(snapshot, ["ecommerce_orders", "ecommerce_order_items"])) return "inventory";
  if (snapshotHasAnyTable(snapshot, ["ecommerce_products"]) && !snapshotHasAnyTable(snapshot, ["ecommerce_orders", "ecommerce_order_items"])) return "catalog";
  return "unknown";
}

function allowedTablesForSnapshotRole(role: SnapshotSourceRole) {
  const tables: Record<SnapshotSourceRole, EcommerceCanonicalTableName[]> = {
    commerce: ["ecommerce_orders", "ecommerce_order_items", "ecommerce_products", "ecommerce_customers", "ecommerce_refunds"],
    ads: ["ecommerce_ads"],
    inventory: ["ecommerce_inventory"],
    catalog: ["ecommerce_products"],
    unknown: [...TABLE_NAMES]
  };
  return new Set(tables[role]);
}

function snapshotHasAnyTable(snapshot: Pick<EcommerceCanonicalSnapshotRow, "schemaJson">, names: EcommerceCanonicalTableName[]) {
  const rawTables = objectValue(snapshot.schemaJson).tables;
  const tables = Array.isArray(rawTables) ? rawTables : [];
  return names.some((name) => {
    const table = tables.find((item: unknown) => objectValue(item).name === name);
    return firstNumber(objectValue(table).rowCount, objectValue(table).rows) > 0;
  });
}

function lightweightCanonicalSchemaJsonFromTables(input: {
  workspaceId: string;
  dataSourceId: string;
  sourceProvider: string;
  qualityReport: Record<string, unknown>;
  sourceConfig: Record<string, unknown>;
  sourceSchemas: Record<string, unknown>;
  tables: Array<{ name: string; artifactKey: string; rowCount: number; rows: number }>;
}) {
  const qualityReport = input.qualityReport;
  const sourceConfig = input.sourceConfig;
  const sourceSchemas = input.sourceSchemas;
  const tables = input.tables;

  return {
    schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    sourceProvider: input.sourceProvider,
    sourcePlatforms: [input.sourceProvider],
    source_platforms: [input.sourceProvider],
    syncRunId: firstString(qualityReport.syncRunId, sourceConfig.latestSyncRunId, sourceConfig.syncRunId),
    manifestKey: firstString(qualityReport.manifestKey, sourceConfig.manifestKey, sourceSchemas.manifestKey) || null,
    checksum: objectValue(sourceConfig.checksum),
    missingFields: [],
    confidenceScore: firstFiniteNumber(qualityReport.confidenceScore, sourceConfig.confidenceScore) ?? 0,
    field_mappings: [],
    metadata: {
      source: "lightweight_canonical_manifest",
      canonicalArtifactBacked: tables.length > 0
    },
    tables
  };
}

function canonicalArtifactTablesFromMetadata(value: Record<string, unknown>) {
  const candidates = [
    value.tables,
    value.canonicalArtifactManifest,
    value.canonical_artifact_manifest,
    value.artifacts,
    objectValue(value.canonicalArtifacts).tables,
    objectValue(value.canonical_artifacts).tables
  ];

  for (const candidate of candidates) {
    const tables = artifactTablesFromCandidate(candidate);
    if (tables.length) return tables;
  }

  return null;
}

function artifactTablesFromCandidate(candidate: unknown) {
  if (Array.isArray(candidate)) {
    return candidate
      .map((item) => objectValue(item))
      .map((item) => ({
        name: firstString(item.name, item.tableName, item.table),
        artifactKey: firstString(item.artifactKey, item.key),
        rowCount: firstNumber(item.rowCount, item.rows),
        rows: firstNumber(item.rowCount, item.rows)
      }))
      .filter((item) => item.name && item.artifactKey);
  }

  const object = objectValue(candidate);
  return Object.entries(object)
    .map(([name, item]) => {
      const itemObject = objectValue(item);
      return {
        name,
        artifactKey: firstString(itemObject.artifactKey, itemObject.key),
        rowCount: firstNumber(itemObject.rowCount, itemObject.rows),
        rows: firstNumber(itemObject.rowCount, itemObject.rows)
      };
    })
    .filter((item) => item.name && item.artifactKey);
}

async function listLatestCanonicalArtifactTables(workspaceId: string, dataSourceId: string) {
  const prefix = `canonical/${workspaceId}/${dataSourceId}/`;
  const cacheKey = prefix;
  const cached = canonicalArtifactManifestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.tables;

  const keys = await withTimeout(
    listR2ObjectKeys(prefix, 250),
    CANONICAL_ARTIFACT_LIST_TIMEOUT_MS,
    "Canonical artifact listing timed out."
  );
  const tableKeys = keys.filter((key) => key.endsWith(".jsonl"));
  const byRun = new Map<string, string[]>();
  for (const key of tableKeys) {
    const parts = key.split("/");
    const runKey = parts.slice(0, 4).join("/");
    byRun.set(runKey, [...(byRun.get(runKey) ?? []), key]);
  }

  const latestRun = Array.from(byRun.entries())
    .map(([runKey, runKeys]) => ({ runKey, runKeys, tableCount: runKeys.length }))
    .sort((left, right) => {
      const tableCountDelta = right.tableCount - left.tableCount;
      if (tableCountDelta !== 0) return tableCountDelta;
      return right.runKey.localeCompare(left.runKey);
    })[0];
  const latestKeys = latestRun?.runKeys ?? [];
  const tables = latestKeys
    .map((artifactKey) => {
      const fileName = artifactKey.split("/").at(-1) ?? "";
      const name = fileName.replace(/\.jsonl$/, "");
      return {
        name,
        artifactKey,
        rowCount: 1,
        rows: 1
      };
    })
    .filter((item) => TABLE_NAMES.includes(item.name as typeof TABLE_NAMES[number]));

  canonicalArtifactManifestCache.set(cacheKey, {
    expiresAt: Date.now() + 120_000,
    tables
  });
  return tables;
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

function dedupeRowsByIdentity<T extends Record<string, unknown>>(rows: T[], identity: (row: T, index: number) => string) {
  const deduped = new Map<string, T>();
  rows.forEach((row, index) => {
    const key = identity(row, index) || String(index);
    deduped.set(key, row);
  });
  return Array.from(deduped.values());
}

function mergeInventoryRows(rows: Record<string, unknown>[]) {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows.filter(hasUsableInventorySignal)) {
    const key = inventoryMergeIdentity(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const currentValue = firstFiniteNumber(
      existing.inventory_value,
      existing.inventoryValue,
      existing.total_inventory_value,
      existing.totalInventoryValue,
      existing["Inventory Value"],
      existing["Inventory value"],
      existing["inventory value"],
      existing["Total Inventory Value"],
      existing["Total inventory value"],
      existing["total inventory value"],
      existing["inventory-value"],
      existing.inventory_cost,
      existing.inventoryAssetValue,
      existing.inventory_asset_value,
      existing.stock_value,
      existing.stockValue,
      existing.stock_asset_value,
      existing.on_hand_value,
      existing.total_value,
      existing.totalValue,
      existing.value
    );
    const nextValue = firstFiniteNumber(
      row.inventory_value,
      row.inventoryValue,
      row.total_inventory_value,
      row.totalInventoryValue,
      row["Inventory Value"],
      row["Inventory value"],
      row["inventory value"],
      row["Total Inventory Value"],
      row["Total inventory value"],
      row["total inventory value"],
      row["inventory-value"],
      row.inventory_cost,
      row.inventoryAssetValue,
      row.inventory_asset_value,
      row.stock_value,
      row.stockValue,
      row.stock_asset_value,
      row.on_hand_value,
      row.total_value,
      row.totalValue,
      row.value
    );
    const currentStock = firstFiniteNumber(existing.stock_level, existing.on_hand, existing.inventory_quantity, existing.available_stock, existing.available);
    const nextStock = firstFiniteNumber(row.stock_level, row.on_hand, row.inventory_quantity, row.available_stock, row.available);
    const merged = { ...existing, ...row };
    if (currentValue !== null && (nextValue === null || nextValue === 0)) {
      merged.inventory_value = currentValue;
      merged.inventory_cost = currentValue;
    } else if (nextValue !== null) {
      merged.inventory_value = nextValue;
      merged.inventory_cost = nextValue;
    }
    if (currentStock !== null && nextStock === null) {
      merged.stock_level = currentStock;
      merged.available_stock = firstFiniteNumber(existing.available_stock, existing.available) ?? currentStock;
    }
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

function inventoryMergeIdentity(row: Record<string, unknown>) {
  const sku = firstString(row.sku, row.product_sku, row.seller_sku);
  if (!sku) return stringValue(row.canonical_key);
  return [
    "inventory",
    sku.toLowerCase(),
    firstString(row.warehouse_id, row.location_id, row.location, row.warehouse).toLowerCase()
  ].join(":");
}

function suppressSupersededOrderFactDatasets(datasets: Array<{
  snapshotId: string;
  dataSourceId: string | null;
  createdAt: Date;
  dataset: CanonicalDataset;
}>) {
  const ordered = [...datasets].sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
  const suppressed = new Set<string>();
  const sourceFacts = ordered.map((entry) => ({
    entry,
    orderIds: sourceNativeOrderIds(entry.dataset),
    orderIdsByProvider: sourceNativeOrderIdsByProvider(entry.dataset),
    orderFactRows: entry.dataset.tables.ecommerce_orders.length + entry.dataset.tables.ecommerce_order_items.length
  }));

  for (let currentIndex = 0; currentIndex < sourceFacts.length; currentIndex += 1) {
    const current = sourceFacts[currentIndex];
    if (!current.orderFactRows || current.orderIds.size < 25) continue;

    for (let olderIndex = currentIndex + 1; olderIndex < sourceFacts.length; olderIndex += 1) {
      const older = sourceFacts[olderIndex];
      const olderKey = older.entry.dataSourceId ?? older.entry.snapshotId;
      if (suppressed.has(olderKey) || !older.orderFactRows || older.orderIds.size < 25) continue;

      const overlap = overlapCount(current.orderIds, older.orderIds);
      const coverage = overlap / Math.max(1, Math.min(current.orderIds.size, older.orderIds.size));
      const providerOverlap = nativeProviderOverlap(current.orderIdsByProvider, older.orderIdsByProvider);
      const factCoverage = current.orderFactRows / Math.max(1, older.orderFactRows);
      if ((overlap >= 50 && coverage >= 0.8) || (factCoverage >= 0.75 && providerOverlap.supersedes)) {
        suppressed.add(olderKey);
      }
    }
  }

  if (!suppressed.size) return datasets;

  return datasets.map((entry) => {
    const key = entry.dataSourceId ?? entry.snapshotId;
    if (!suppressed.has(key)) return entry;

    return {
      ...entry,
      dataset: {
        ...entry.dataset,
        tables: {
          ...entry.dataset.tables,
          ecommerce_orders: [],
          ecommerce_order_items: [],
          ecommerce_refunds: []
        },
        metadata: {
          ...entry.dataset.metadata,
          validation: {
            ...entry.dataset.metadata.validation,
            warnings: [
              ...entry.dataset.metadata.validation.warnings,
              {
                table: "ecommerce_orders",
                field: "source_order_id",
                reason: "order_facts_superseded_by_newer_overlapping_source"
              }
            ]
          }
        }
      }
    };
  });
}

function sourceNativeOrderIds(dataset: CanonicalDataset) {
  const ids = new Set<string>();
  const collect = (row: Record<string, unknown>) => {
    const native = nativeOrderIdFromRow(row);
    if (native) ids.add(native.toLowerCase());
  };
  dataset.tables.ecommerce_orders.forEach(collect);
  dataset.tables.ecommerce_order_items.forEach(collect);
  dataset.tables.ecommerce_refunds.forEach(collect);
  return ids;
}

function sourceNativeOrderIdsByProvider(dataset: CanonicalDataset) {
  const ids = new Map<string, Set<string>>();
  const collect = (row: Record<string, unknown>) => {
    const native = nativeOrderIdentityFromRow(row);
    if (!native) return;
    const providerIds = ids.get(native.provider) ?? new Set<string>();
    providerIds.add(native.id.toLowerCase());
    ids.set(native.provider, providerIds);
  };
  dataset.tables.ecommerce_orders.forEach(collect);
  dataset.tables.ecommerce_order_items.forEach(collect);
  dataset.tables.ecommerce_refunds.forEach(collect);
  return ids;
}

function nativeProviderOverlap(left: Map<string, Set<string>>, right: Map<string, Set<string>>) {
  let bestOverlap = 0;
  let bestCoverage = 0;
  for (const [provider, leftIds] of left.entries()) {
    const rightIds = right.get(provider);
    if (!rightIds?.size || leftIds.size < 25) continue;
    const overlap = overlapCount(leftIds, rightIds);
    const coverage = overlap / Math.max(1, Math.min(leftIds.size, rightIds.size));
    if (coverage > bestCoverage || (coverage === bestCoverage && overlap > bestOverlap)) {
      bestOverlap = overlap;
      bestCoverage = coverage;
    }
  }
  return {
    overlap: bestOverlap,
    coverage: bestCoverage,
    supersedes: bestOverlap >= 50 && bestCoverage >= 0.8
  };
}

function overlapCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function mergeCanonicalDatasets(left: CanonicalDataset, right: CanonicalDataset): CanonicalDataset {
  const allEcommerceOrders = [...left.tables.ecommerce_orders, ...right.tables.ecommerce_orders];
  const ecommerceOrders = dedupeRowsByIdentity(allEcommerceOrders, orderMergeIdentity);
  const ecommerceOrderItems = dedupeRowsByIdentity(
    attachNativeOrderIdsToOrderItems([...left.tables.ecommerce_order_items, ...right.tables.ecommerce_order_items], allEcommerceOrders),
    orderItemMergeIdentity
  );
  const tables = {
    ecommerce_orders: ecommerceOrders,
    ecommerce_order_items: ecommerceOrderItems,
    ecommerce_products: dedupeRows([...left.tables.ecommerce_products, ...right.tables.ecommerce_products], "canonical_key"),
    ecommerce_customers: dedupeRows([...left.tables.ecommerce_customers, ...right.tables.ecommerce_customers], "canonical_key"),
    ecommerce_refunds: dedupeRows([...left.tables.ecommerce_refunds, ...right.tables.ecommerce_refunds], "canonical_key"),
    ecommerce_ads: dedupeRows([...(left.tables.ecommerce_ads ?? []), ...(right.tables.ecommerce_ads ?? [])], "canonical_key"),
    ecommerce_inventory: mergeInventoryRows([...(left.tables.ecommerce_inventory ?? []), ...(right.tables.ecommerce_inventory ?? [])])
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

async function readLatestWorkspaceSupplementalCanonicalTable(
  workspaceId: string,
  tableName: typeof TABLE_NAMES[number]
) {
  const rows = await withTimeout(prisma.schemaSnapshot.findMany({
    where: {
      workspaceId,
      dataSourceId: null,
      canonicalStatus: "READY",
      canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION
    },
    select: {
      id: true,
      createdAt: true,
      publishedAt: true,
      version: true,
      qualityReport: true
    },
    orderBy: [
      { publishedAt: "desc" },
      { createdAt: "desc" },
      { version: "desc" }
    ],
    take: 8
  }), CANONICAL_ARTIFACT_LIST_TIMEOUT_MS, "Supplemental canonical snapshot lookup timed out.");

  const snapshotRows = rows.map((snapshot) => {
    const tables = canonicalArtifactTablesFromMetadata(objectValue(snapshot.qualityReport)) ?? [];
    const table = tables.find((item) => item.name === tableName && item.artifactKey && item.rowCount > 0);
    return table ? {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      artifactKey: table.artifactKey,
      rowCount: table.rowCount,
      sourcePlatforms: []
    } : null;
  });

  const snapshot = snapshotRows.find(Boolean);
  if (!snapshot?.artifactKey) return null;

  const artifactText = await withTimeout(
    readR2ObjectText(snapshot.artifactKey),
    CANONICAL_ARTIFACT_READ_TIMEOUT_MS,
    `Canonical supplemental artifact read timed out for ${tableName}.`
  );
  return {
    snapshotId: snapshot.id,
    createdAt: snapshot.createdAt,
    rows: parseJsonl(artifactText).map((row) => withSourceScope(row, { snapshotId: snapshot.id, dataSourceId: null })),
    sourcePlatforms: Array.isArray(snapshot.sourcePlatforms)
      ? snapshot.sourcePlatforms.map(String)
      : []
  };
}

function datasetForSingleSupplementalTable(
  tableName: typeof TABLE_NAMES[number],
  rows: Record<string, unknown>[],
  sourcePlatforms: string[]
): CanonicalDataset {
  const tables = emptyEcommerceCanonicalDataset(sourcePlatforms).tables;
  tables[tableName] = rows;
  return {
    ...emptyEcommerceCanonicalDataset(sourcePlatforms),
    tables,
    metadata: {
      ...emptyEcommerceCanonicalDataset(sourcePlatforms).metadata,
      validation: {
        accepted_rows: rows.length,
        rejected_rows: 0,
        warnings: [{
          table: tableName,
          field: "artifact",
          reason: "supplemented_from_latest_workspace_canonical_snapshot"
        }],
        rejected: []
      }
    }
  };
}

function orderMergeIdentity(row: Record<string, unknown>, index: number) {
  const nativeIdentity = nativeOrderMergeIdentity(row);
  if (nativeIdentity) return nativeIdentity;
  return stringValue(row.canonical_key) || [
    "source-order",
    firstString(row.workspace_id, row.workspaceId),
    firstString(row.data_source_id, row.dataSourceId, row.connection_id, row.connectionId),
    firstString(row.source_account_id, row.sourceAccountId, row.account_id, row.accountId, row.shop_id, row.seller_id),
    firstString(row.source_order_id, row.sourceOrderId, row.order_id, row.orderId)
  ].join(":") || String(index);
}

function orderItemMergeIdentity(row: Record<string, unknown>, index: number) {
  const nativeIdentity = nativeOrderMergeIdentity(row);
  if (nativeIdentity) {
    return [
      "native-order-item",
      nativeIdentity,
      firstString(row.sku, row.product_sku, row.seller_sku),
      firstString(row.asin),
      String(firstNumber(row.quantity)),
      String(firstNumber(row.gross_sales, row.net_sales, row.revenue, row.price, row.unit_price, row.amount)),
      String(firstNumber(row.item_cost, row.unit_cost, row.cogs, row.cost_price))
    ].join(":");
  }

  return stringValue(row.canonical_key) || [
    "source-order-item",
    firstString(row.workspace_id, row.workspaceId),
    firstString(row.data_source_id, row.dataSourceId, row.connection_id, row.connectionId),
    firstString(row.source_account_id, row.sourceAccountId, row.account_id, row.accountId, row.shop_id, row.seller_id),
    firstString(row.source_order_id, row.sourceOrderId, row.order_id, row.orderId),
    firstString(row.source_line_item_id, row.sourceLineItemId, row.line_item_id, row.lineItemId, row.order_item_id, row.orderItemId),
    firstString(row.sku, row.product_sku, row.seller_sku),
    String(firstNumber(row.quantity)),
    String(firstNumber(row.gross_sales, row.net_sales, row.revenue, row.price, row.unit_price, row.amount))
  ].join(":") || String(index);
}

const NATIVE_ORDER_PROVIDER_KEYS = ["amazon", "shopify"] as const;
const NATIVE_ORDER_ID_PATTERNS = [
  [/^AMZ[-_:]/i, /^\d{3}-\d{7}-\d{7}$/],
  [/^gid:\/\/shopify\/Order\//i]
] as const;

function nativeOrderMergeIdentity(row: Record<string, unknown>) {
  const native = nativeOrderIdentityFromRow(row);
  if (!native) return "";
  return [
    "native-source-order",
    firstString(row.workspace_id, row.workspaceId) || "unknown",
    native.provider,
    native.id.toLowerCase()
  ].join(":");
}

function nativeOrderIdFromRow(row: Record<string, unknown>) {
  return nativeOrderIdentityFromRow(row)?.id ?? "";
}

function nativeOrderIdentityFromRow(row: Record<string, unknown>) {
  const candidates = [
    row.native_order_id,
    row.nativeOrderId,
    row.source_order_id,
    row.sourceOrderId,
    row.order_id,
    row.orderId,
    row.amazon_order_id,
    row.shopify_order_id,
    row.source_id,
    row.sourceId
  ].map(firstString).map((value) => value.trim()).filter(Boolean);

  for (const providerIndex of [0, 1]) {
    const value = candidates.find((candidate) => NATIVE_ORDER_ID_PATTERNS[providerIndex]?.some((pattern) => pattern.test(candidate)));
    if (value) {
      return {
        provider: NATIVE_ORDER_PROVIDER_KEYS[providerIndex] ?? "unknown",
        id: value
      };
    }
  }

  return null;
}

function orderMatchValues(row: Record<string, unknown>) {
  return Array.from(new Set([
    row.native_order_id,
    row.nativeOrderId,
    row.order_id,
    row.orderId,
    row.source_order_id,
    row.sourceOrderId,
    row.amazon_order_id,
    row.shopify_order_id,
    nativeOrderIdFromRow(row)
  ].map(stringValue).map((value) => value.trim()).filter(Boolean)));
}

function attachNativeOrderIdsToOrderItems<T extends Record<string, unknown>>(
  items: T[],
  orders: Record<string, unknown>[]
) {
  if (!items.length || !orders.length) return items;

  const nativeOrderIdByOrderMatch = new Map<string, string>();
  for (const order of orders) {
    const nativeOrderId = nativeOrderIdFromRow(order);
    if (!nativeOrderId) continue;
    for (const matchValue of orderMatchValues(order)) {
      nativeOrderIdByOrderMatch.set(matchValue, nativeOrderId);
    }
  }

  if (!nativeOrderIdByOrderMatch.size) return items;

  return items.map((item) => {
    const nativeOrderId = orderMatchValues(item)
      .map((matchValue) => nativeOrderIdByOrderMatch.get(matchValue))
      .find(Boolean);
    return nativeOrderId ? { ...item, native_order_id: nativeOrderId } : item;
  });
}

function hasUsableInventorySignal(row: Record<string, unknown>) {
  return [
    row.stock_level,
    row.on_hand,
    row.inventory_quantity,
    row.available_stock,
    row.available,
    row.reserved_stock,
    row.reserved,
    row.committed,
    row.inventory_value,
    row.inventoryValue,
    row.total_inventory_value,
    row.totalInventoryValue,
    row["Inventory Value"],
    row["Inventory value"],
    row["inventory value"],
    row["Total Inventory Value"],
    row["Total inventory value"],
    row["total inventory value"],
    row["inventory-value"],
    row.inventory_unit_cost,
    row.unit_cost,
    row.item_cost,
    row.cost_price,
    row.product_cost,
    row.average_cost,
    row.avg_cost,
    row.cost,
    row.inventory_cost,
    row.inventoryAssetValue,
    row.inventory_asset_value,
    row.stock_value,
    row.stockValue,
    row.stock_asset_value,
    row.on_hand_value,
    row.totalValue,
    row.total_value,
    row.value
  ].some((value) => firstFiniteNumber(value) !== null);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value).trim();
    if (text) return text;
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  return firstFiniteNumber(...values) ?? 0;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function numericValue(value: unknown) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value);
  const normalized = value.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  return normalized ? Number(normalized) : NaN;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function dashboardSnapshotValue(value: unknown): EcommerceSalesDashboardData | null {
  const snapshot = objectValue(value);
  const metadata = objectValue(snapshot.metadata);
  if (metadata.schema_version !== ECOMMERCE_CANONICAL_SCHEMA_VERSION) return null;
  if (metadata.metric_engine_version !== ANALYTICS_METRIC_ENGINE_VERSION) return null;
  if (metadata.profitability_engine_version !== CANONICAL_PROFITABILITY_ENGINE_VERSION) return null;
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
  if (!Object.values(tables).some((rows) => Array.isArray(rows) && rows.length > 0)) return null;

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

export const __ecommerceSalesDashboardLoaderTestHooks = {
  mergeCanonicalDatasets,
  nativeOrderIdFromRow,
  selectCanonicalReportingSnapshots,
  sourceNativeOrderIdsByProvider,
  sourceNativeOrderIds,
  snapshotSourceRole,
  suppressSupersededOrderFactDatasets
};

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
