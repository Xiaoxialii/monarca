import { readFile } from "node:fs/promises";
import { ConnectionStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { buildSemanticLayer, generateSemanticMetrics } from "@/lib/semantic-layer";
import { validateWorkspaceMetrics } from "@/lib/metric-validation";
import { fileExtension, inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import {
  buildBusinessMetricRegistry,
  upsertBusinessMetricRegistryDefinitions
} from "@/lib/metrics/metric-registry";
import { compileLogisticsKpiOperatingSystem } from "@/lib/logistics-kpi-operating-system";

type MetricGenerationClient = PrismaClient | Prisma.TransactionClient;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function tablesFromWorkspaceSchema(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];

  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const name = typeof tableRecord.name === "string" ? tableRecord.name : "";

    if (!name) {
      return [];
    }

    const columns = Array.isArray(tableRecord.columns) ? tableRecord.columns : [];

    return [{
      name,
      schema: typeof tableRecord.schema === "string" ? tableRecord.schema : undefined,
      rowCount: Number.isFinite(Number(tableRecord.rowCount)) ? Number(tableRecord.rowCount) : undefined,
      rawHeaderRows: Array.isArray(tableRecord.rawHeaderRows)
        ? tableRecord.rawHeaderRows
          .filter((row): row is unknown[] => Array.isArray(row))
          .map((row) => row.map((cell) => String(cell ?? "")))
        : undefined,
      sampleRows: Array.isArray(tableRecord.sampleRows)
        ? tableRecord.sampleRows.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)))
        : undefined,
      columns: columns.flatMap((column) => {
        const columnRecord = asRecord(column);
        const columnName = typeof columnRecord.name === "string" ? columnRecord.name : "";

        if (!columnName) {
          return [];
        }

        return [{
          name: columnName,
          displayName: typeof columnRecord.displayName === "string" ? columnRecord.displayName : undefined,
          semanticName: typeof columnRecord.semanticName === "string" ? columnRecord.semanticName : undefined,
          rawHeaderPath: Array.isArray(columnRecord.rawHeaderPath) ? columnRecord.rawHeaderPath.filter((part): part is string => typeof part === "string") : undefined,
          type: typeof columnRecord.type === "string" ? columnRecord.type : "unknown",
          nullable: typeof columnRecord.nullable === "boolean" ? columnRecord.nullable : true
        }];
      })
    }];
  });
}

function tableLabel(table: ReturnType<typeof tablesFromWorkspaceSchema>[number]) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function uniqueTables(tables: ReturnType<typeof tablesFromWorkspaceSchema>) {
  const seen = new Set<string>();

  return tables.filter((table) => {
    const key = tableLabel(table).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function tableHasSnapshotRows(table: { sampleRows?: unknown }) {
  return Array.isArray(table.sampleRows) && table.sampleRows.length > 0;
}

function tablesHaveSnapshotRows(tables: Array<{ sampleRows?: unknown }>) {
  return tables.some(tableHasSnapshotRows);
}

function sourceHasConnectedFile(source: { config: unknown }) {
  const config = asRecord(source.config);
  const storage = asRecord(config.storage);
  const storageProvider = typeof config.storageProvider === "string" ? config.storageProvider : null;
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
        : null;

  return typeof config.inlineFileBase64 === "string" && config.inlineFileBase64.trim().length > 0 ||
    typeof config.storedFilePath === "string" && config.storedFilePath.trim().length > 0 ||
    ((storage.provider === "cloudflare-r2" || storageProvider === "r2") && Boolean(objectKey));
}

function normalizeUploadTables(tables: Awaited<ReturnType<typeof inferTablesFromExcelBuffer>>) {
  return tables.map((table) => ({
    name: table.name,
    schema: undefined,
    rowCount: table.rowCount,
    rawHeaderRows: table.rawHeaderRows,
    sampleRows: table.sampleRows,
    columns: table.columns.map((column) => ({
      name: column.name,
      displayName: column.displayName,
      semanticName: column.semanticName,
      rawHeaderPath: column.rawHeaderPath,
      type: column.type,
      nullable: column.nullable
    }))
  }));
}

function inlineUploadBuffer(config: Record<string, unknown>) {
  const encoded = typeof config.inlineFileBase64 === "string" ? config.inlineFileBase64 : null;

  if (!encoded) {
    return null;
  }

  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return null;
  }
}

export async function tablesFromConnectedDataSourceFile(source: {
  name: string;
  config: unknown;
}) {
  const config = asRecord(source.config);
  const fileName = typeof config.fileName === "string" ? config.fileName : source.name;
  const extension = fileExtension(fileName);

  const storage = asRecord(config.storage);
  const storageProvider = typeof config.storageProvider === "string" ? config.storageProvider : null;
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
      : null;

  const inlineBuffer = inlineUploadBuffer(config);

  if (inlineBuffer) {
    const tables = extension === "csv"
      ? inferTablesFromCsvText(fileName, inlineBuffer.toString("utf8"))
      : inferTablesFromExcelBuffer(fileName, inlineBuffer);
    return normalizeUploadTables(await tables);
  }

  if (typeof config.storedFilePath === "string" && config.storedFilePath.trim()) {
    const buffer = await readFile(config.storedFilePath);
    const tables = extension === "csv"
      ? inferTablesFromCsvText(fileName, buffer.toString("utf8"))
      : inferTablesFromExcelBuffer(fileName, buffer);
    return normalizeUploadTables(await tables);
  }

  if ((storage.provider === "cloudflare-r2" || storageProvider === "r2") && objectKey) {
    const objectExtension = extension || fileExtension(objectKey);
    const tables = objectExtension === "csv"
      ? inferTablesFromCsvText(fileName, await readR2ObjectText(objectKey))
      : inferTablesFromExcelBuffer(fileName, await readR2ObjectBuffer(objectKey));
    return normalizeUploadTables(await tables);
  }

  return null;
}

export async function getConnectedWorkspaceSchemaContext(
  client: MetricGenerationClient,
  workspaceId: string,
  options: { dataSourceIds?: string[] } = {}
) {
  const scopedDataSourceIds = [...new Set(options.dataSourceIds ?? [])].filter(Boolean);
  const dataSources = await client.dataSourceConnection.findMany({
    where: {
      workspaceId,
      isActive: true,
      status: ConnectionStatus.CONNECTED,
      ...(scopedDataSourceIds.length ? { id: { in: scopedDataSourceIds } } : {})
    },
    select: {
      id: true,
      name: true,
      config: true
    },
    orderBy: {
      updatedAt: "desc"
    }
  });
  const snapshots = dataSources.length > 0
    ? await client.schemaSnapshot.findMany({
      where: {
        workspaceId,
        dataSourceId: {
          in: dataSources.map((source) => source.id)
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })
    : [];
  const snapshotBySource = new Map<string, typeof snapshots[number]>();

  for (const snapshot of snapshots) {
    if (snapshot.dataSourceId && !snapshotBySource.has(snapshot.dataSourceId)) {
      snapshotBySource.set(snapshot.dataSourceId, snapshot);
    }
  }

  const selectedSnapshots = Array.from(snapshotBySource.values());
  const tablesBySource = await Promise.all(dataSources.map(async (source) => {
    const snapshot = snapshotBySource.get(source.id);
    const snapshotTables = snapshot ? tablesFromWorkspaceSchema(snapshot.schemaJson) : [];
    const fileTables = sourceHasConnectedFile(source)
      ? await tablesFromConnectedDataSourceFile(source).catch(() => null)
      : null;

    return fileTables?.length ? fileTables : snapshotTables;
  }));

  return {
    primarySnapshot: selectedSnapshots[0] ?? null,
    snapshots: selectedSnapshots,
    tables: uniqueTables(tablesBySource.flat())
  };
}

export async function generateWorkspaceMetricsFromConnectedSources(
  client: MetricGenerationClient,
  {
    workspaceId,
    userId,
    dataSourceIds
  }: {
    workspaceId: string;
    userId?: string | null;
    dataSourceIds?: string[];
  }
) {
  const context = await getConnectedWorkspaceSchemaContext(client, workspaceId, { dataSourceIds });

  if (!context.primarySnapshot) {
    return {
      ...context,
      semanticLayer: null,
      generatedMetricCount: 0,
      validationResults: []
    };
  }

  const semanticLayer = buildSemanticLayer(context.tables);
  const metricRegistry = buildBusinessMetricRegistry({
    tables: context.tables,
    semanticLayer,
    workspaceId
  });
  const logisticsKpiOperatingSystem = metricRegistry.industry === "logistics_service_kpi"
    ? compileLogisticsKpiOperatingSystem({
        schema_snapshot: context.primarySnapshot.schemaJson,
        semantic_metrics: semanticLayer.metrics,
        business_metric_registry: metricRegistry.definitions,
        raw_excel_sample: [],
        workspace_id: workspaceId
      })
    : null;
  const finalizedMetricRegistry = {
    ...metricRegistry,
    logisticsKpiOperatingSystem
  };
  const registryMetricCount = finalizedMetricRegistry.definitions.length > 0
    ? await upsertBusinessMetricRegistryDefinitions(client, {
        workspaceId,
        userId,
        registry: finalizedMetricRegistry
      })
    : 0;
  const semanticMetricCount = await generateSemanticMetrics(client, {
    workspaceId,
    userId,
    semanticLayer,
    deactivateStale: registryMetricCount === 0
  });
  const generatedMetricCount = registryMetricCount + semanticMetricCount;
  const validationResults = await validateWorkspaceMetrics(client, {
    workspaceId,
    tables: context.tables
  });

  await client.schemaSnapshot.update({
    where: {
      id: context.primarySnapshot.id
    },
    data: {
      schemaJson: {
        ...asRecord(context.primarySnapshot.schemaJson),
        semanticLayer,
        metricRegistry: finalizedMetricRegistry,
        logisticsKpiOperatingSystem
      },
      qualityReport: {
        ...asRecord(context.primarySnapshot.qualityReport),
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount,
        metricRegistryId: finalizedMetricRegistry.metricRegistryId,
        detectedIndustry: finalizedMetricRegistry.industry,
        workspaceType: finalizedMetricRegistry.industry === "logistics_service_kpi" ? "logistics_service_kpi" : undefined,
        industry: finalizedMetricRegistry.industry === "logistics_service_kpi"
          ? "logistics / express_delivery / service_operations"
          : finalizedMetricRegistry.industry,
        analysisDomain: finalizedMetricRegistry.industry === "logistics_service_kpi" ? "branch_kpi_and_ticket_resolution" : undefined,
        missingCoreMetrics: finalizedMetricRegistry.missingCoreMetrics,
        logisticsKpiOperatingSystem
      }
    }
  });

  return {
    ...context,
    semanticLayer,
    metricRegistry: finalizedMetricRegistry,
    logisticsKpiOperatingSystem,
    generatedMetricCount,
    validationResults
  };
}
