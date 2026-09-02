import fs from "node:fs";
import { ConnectionStatus, DataSourceType, Prisma, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDatabaseConfig, type SupportedDatabaseType } from "@/lib/database-connection-config";
import { getDataSourceStats, introspectDatabase } from "@/lib/database-introspection";
import { csvRowsFromText, excelRowsFromBuffer } from "@/lib/csv-upload-rows";
import { fileExtension, inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { runUnifiedIngestionPipeline } from "@/lib/ingestion/unified-ingestion-engine";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import { buildSemanticMappingCache, semanticMappingCacheSummary } from "@/lib/semantic/schema-mapping-cache";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { storedSecret } from "@/lib/secret-crypto";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { writeCanonicalDatasetArtifacts } from "@/lib/snapshot/canonical-artifact-writer";
import { logWorkspaceContext } from "@/lib/current-workspace-context";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dataSourceTypeToDatabaseType(type: DataSourceType): SupportedDatabaseType | null {
  if (type === DataSourceType.POSTGRESQL) {
    return "postgresql";
  }

  if (type === DataSourceType.MYSQL) {
    return "mysql";
  }

  return null;
}

const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 1_000;

function publicTables(tables: Array<{
  name: string;
  rowCount?: number;
  columns: Array<{
    name: string;
    displayName?: string;
    semanticName?: string;
    rawHeaderPath?: string[];
    type?: string;
    nullable?: boolean;
  }>;
  rawHeaderRows?: string[][];
}>) {
  return tables.map((table) => ({
    name: table.name,
    rowCount: table.rowCount,
    rawHeaderRows: table.rawHeaderRows,
    columns: table.columns.map((column) => ({
      name: column.name,
      displayName: column.displayName,
      semanticName: column.semanticName,
      rawHeaderPath: column.rawHeaderPath,
      type: column.type ?? "unknown",
      nullable: column.nullable
    }))
  }));
}

async function rowsForUploadedSource(input: {
  name: string;
  config: Record<string, unknown> | null;
}) {
  const config = input.config ?? {};
  const storage = asRecord(config.storage) ?? {};
  const fileName = stringValue(config.fileName) || input.name.replace(/^(CSV|Excel)\s+-\s+/i, "");
  const extension = fileExtension(fileName);
  const inlineFileBase64 = stringValue(config.inlineFileBase64);
  const storedFilePath = stringValue(config.storedFilePath);
  const objectKey = stringValue(config.objectKey) || stringValue(config.storagePath) || stringValue(storage.key);

  if (extension === "csv") {
    const text = inlineFileBase64
      ? Buffer.from(inlineFileBase64, "base64").toString("utf8")
      : storedFilePath && fs.existsSync(storedFilePath)
        ? fs.readFileSync(storedFilePath, "utf8")
        : objectKey
          ? await readR2ObjectText(objectKey)
          : null;

    if (!text) {
      throw new Error("Uploaded CSV content was not found. Please reconnect or upload the file again.");
    }

    return {
      fileName,
      source: "csv" as const,
      rows: csvRowsFromText(text),
      tables: inferTablesFromCsvText(fileName, text)
    };
  }

  if (!["xls", "xlsx"].includes(extension)) {
    throw new Error("Only CSV, XLS, and XLSX upload sources can be rescanned.");
  }

  const buffer = inlineFileBase64
    ? Buffer.from(inlineFileBase64, "base64")
    : storedFilePath && fs.existsSync(storedFilePath)
      ? fs.readFileSync(storedFilePath)
      : objectKey
        ? await readR2ObjectBuffer(objectKey)
        : null;

  if (!buffer) {
    throw new Error("Uploaded Excel content was not found. Please reconnect or upload the file again.");
  }

  return {
    fileName,
    source: "excel" as const,
    rows: await excelRowsFromBuffer(buffer),
    tables: await inferTablesFromExcelBuffer(fileName, buffer)
  };
}

async function buildUnifiedUploadIngestionSummary(input: {
  workspaceId: string;
  source: "csv" | "excel";
  rows: Array<Record<string, unknown>>;
  fileName: string;
}): Promise<{ summary: Record<string, unknown>; canonicalDataset: CanonicalDataset | null }> {
  if (!input.rows.length) {
    return {
      summary: {
        status: "empty",
        source: input.source,
        sampledRows: 0,
        message: "No rows available for unified ingestion."
      },
      canonicalDataset: null
    };
  }

  try {
    const sampledRows = input.rows.slice(0, MAX_UNIFIED_INGESTION_SAMPLE_ROWS);
    const result = await runUnifiedIngestionPipeline({
      source: input.source,
      workspace_id: input.workspaceId,
      payload: input.rows,
      metadata: {
        fileName: input.fileName,
        sampledRows: sampledRows.length,
        totalParsedRows: input.rows.length,
        samplingStrategy: "rescan_first_n_rows_for_mapping_full_rows_for_canonical"
      },
      memory: new PrismaSemanticMemoryStore(prisma, { workspaceId: input.workspaceId })
    });

    return {
      summary: {
        status: "ready",
        source: result.source,
        sampledRows: sampledRows.length,
        totalParsedRows: input.rows.length,
        detectedSchema: result.detected_schema,
        semantic: result.semantic,
        canonical: {
          schemaVersion: result.canonical_data.schema_version,
          rowCounts: Object.fromEntries(
            Object.entries(result.canonical_data.tables).map(([tableName, rows]) => [tableName, rows?.length ?? 0])
          ),
          validation: result.canonical_data.metadata.validation,
          dedupe: result.canonical_data.metadata.dedupe,
          mappingConfidence: result.canonical_data.metadata.mapping_confidence,
          unknownFieldCount: result.canonical_data.metadata.unknown_fields.length
        },
        metrics: result.metrics,
        learning: result.learning,
        audit: result.metadata.audit
      },
      canonicalDataset: result.canonical_data
    };
  } catch (error) {
    return {
      summary: {
        status: "failed",
        source: input.source,
        sampledRows: Math.min(input.rows.length, MAX_UNIFIED_INGESTION_SAMPLE_ROWS),
        message: error instanceof Error ? error.message : "Unified ingestion failed."
      },
      canonicalDataset: null
    };
  }
}

async function rescanUploadedSource(input: {
  dataSource: {
    id: string;
    workspaceId: string;
    name: string;
    provider: string;
    type: DataSourceType;
    connectionMode: string | null;
    authMethod: string | null;
    config: Prisma.JsonValue;
    connectedAt: Date | null;
  };
  userId: string;
}) {
  const config = asRecord(input.dataSource.config);
  const upload = await rowsForUploadedSource({
    name: input.dataSource.name,
    config
  });
  const tables = publicTables(upload.tables);
  const semanticLayer = buildSemanticLayer(upload.tables);
  const semanticMappingCache = buildSemanticMappingCache({
    tables,
    semanticLayer,
    source: "uploaded_source_rescan"
  });
  const analysisReport = generateUniversalDataAnalysisReport(tables);
  const unifiedIngestionResult = await buildUnifiedUploadIngestionSummary({
    workspaceId: input.dataSource.workspaceId,
    source: upload.source,
    rows: upload.rows,
    fileName: upload.fileName
  });
  const unifiedIngestion = unifiedIngestionResult.summary;
  const schemaPayload = {
    scannedAt: new Date().toISOString(),
    fileName: upload.fileName,
    tables,
    semanticLayer,
    semanticMappingCache,
    unifiedIngestion,
    analysisReport
  };
  const columnCount = upload.tables.reduce((sum, table) => sum + table.columns.length, 0);

  const result = await prisma.$transaction(async (tx) => {
    await clearWorkspaceReportCaches(tx, input.dataSource.workspaceId);

    const latestSnapshot = await tx.schemaSnapshot.findFirst({
      where: {
        workspaceId: input.dataSource.workspaceId
      },
      orderBy: {
        version: "desc"
      },
      select: {
        version: true
      }
    });

    const updatedSource = await tx.dataSourceConnection.update({
      where: {
        id: input.dataSource.id
      },
      data: {
        status: ConnectionStatus.CONNECTED,
        schemas: schemaPayload as Prisma.InputJsonValue,
        lastSyncAt: new Date(),
        lastErrorMessage: unifiedIngestionResult.canonicalDataset ? null : String(unifiedIngestion.message ?? "Unified ingestion failed.")
      }
    });

    const canonicalSchemaJson = unifiedIngestionResult.canonicalDataset
      ? await writeCanonicalDatasetArtifacts({
        workspaceId: input.dataSource.workspaceId,
        dataSourceId: input.dataSource.id,
        sourceProvider: input.dataSource.provider.toLowerCase(),
        fileName: upload.fileName,
        canonicalDataset: unifiedIngestionResult.canonicalDataset,
        manifest: {
          dataMode: "upload_unified_canonical_rescan"
        }
      })
      : null;
    const canonicalArtifactManifest = canonicalSchemaJson
      ? asRecord(canonicalSchemaJson)?.canonicalArtifactManifest ?? null
      : null;

    const schemaSnapshot = await tx.schemaSnapshot.create({
      data: {
        workspaceId: input.dataSource.workspaceId,
        dataSourceId: input.dataSource.id,
        version: (latestSnapshot?.version ?? 0) + 1,
        status: ConnectionStatus.CONNECTED,
        schemaJson: (canonicalSchemaJson
          ? {
            sourceId: input.dataSource.id,
            rawUploadSchema: schemaPayload,
            ...canonicalSchemaJson,
            semanticMappingCache
          }
          : {
            sourceId: input.dataSource.id,
            ...schemaPayload
          }) as Prisma.InputJsonValue,
        qualityReport: {
          tableCount: upload.tables.length,
          columnCount,
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount: semanticLayer.metrics.length,
          analysisReport,
          canonicalArtifactBacked: Boolean(canonicalSchemaJson),
          canonicalArtifactManifest,
          rescan: true,
          semanticMappingCache: semanticMappingCacheSummary(semanticMappingCache)
        }
      }
    });

    if (canonicalSchemaJson) {
      await tx.dataSourceConnection.update({
        where: {
          id: input.dataSource.id
        },
        data: {
          schemas: {
            ...schemaPayload,
            canonicalArtifactManifest,
            canonicalStatus: "READY",
            canonicalVersion: "ecommerce_canonical_v1",
            schemaSnapshotId: schemaSnapshot.id
          } as Prisma.InputJsonValue,
          config: {
            ...(config ?? {}),
            canonicalArtifactManifest,
            canonicalStatus: "READY",
            schemaVersion: "ecommerce_canonical_v1",
            schemaSnapshotId: schemaSnapshot.id
          } as Prisma.InputJsonValue
        }
      });
    }

    const metricGeneration = await generateWorkspaceMetricsFromConnectedSources(tx, {
      workspaceId: input.dataSource.workspaceId,
      userId: input.userId,
      dataSourceIds: [updatedSource.id]
    });

    return { updatedSource, schemaSnapshot, generatedMetricCount: metricGeneration.generatedMetricCount };
  }, {
    maxWait: 20_000,
    timeout: 30_000
  });

  if (!unifiedIngestionResult.canonicalDataset) {
    return NextResponse.json(
      {
        ok: false,
        message: String(unifiedIngestion.message ?? "Unified ingestion failed."),
        unifiedIngestion
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    dataSource: {
      id: result.updatedSource.id,
      name: result.updatedSource.name,
      provider: result.updatedSource.provider,
      type: result.updatedSource.type,
      status: result.updatedSource.status,
      connectionMode: result.updatedSource.connectionMode,
      authMethod: result.updatedSource.authMethod,
      config,
      schema: {
        tableCount: upload.tables.length,
        columnCount,
        scannedAt: schemaPayload.scannedAt,
        tables,
        semanticLayer,
        analysisReport
      },
      connectedAt: result.updatedSource.connectedAt?.toISOString() ?? null,
      lastSyncAt: result.updatedSource.lastSyncAt?.toISOString() ?? null
    },
    schema: {
      id: result.schemaSnapshot.id,
      version: result.schemaSnapshot.version,
      tableCount: upload.tables.length,
      columnCount,
      semanticFieldCount: semanticLayer.fields.length,
      businessEntityCount: semanticLayer.entities.length,
      generatedMetricCount: result.generatedMetricCount,
      analysisReport,
      canonicalArtifactBacked: true
    }
  });
}

function publicConfig(config: ReturnType<typeof resolveDatabaseConfig>) {
  return {
    type: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.ssl
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    logWorkspaceContext("[workspace-context] data-sources.id.rescan.POST", session);
    const { id } = await params;
    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    if (dataSource.type === DataSourceType.CSV || dataSource.type === DataSourceType.EXCEL) {
      return rescanUploadedSource({
        dataSource,
        userId: session.user.id
      });
    }

    const type = dataSourceTypeToDatabaseType(dataSource.type);

    if (!type) {
      return NextResponse.json({ ok: false, message: "当前暂不支持该数据库类型。" }, { status: 400 });
    }

    const savedConfig = asRecord(dataSource.config);
    const config = resolveDatabaseConfig(type, {
      host: savedConfig?.host,
      port: savedConfig?.port,
      database: savedConfig?.database,
      username: savedConfig?.username,
      password: storedSecret(savedConfig?.password, savedConfig?.passwordEncrypted),
      ssl: savedConfig?.ssl
    });

    const tables = await introspectDatabase(config);
    const scannedAt = new Date().toISOString();
    const semanticLayer = buildSemanticLayer(tables);
    const semanticMappingCache = buildSemanticMappingCache({
      tables,
      semanticLayer,
      source: "database_source_rescan"
    });
    const tableStats = await getDataSourceStats(config, tables);
    const schemaPayload = {
      scannedAt,
      databaseType: type,
      tables,
      semanticLayer,
      semanticMappingCache,
      stats: tableStats
    };
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);

    const result = await prisma.$transaction(async (tx) => {
      await clearWorkspaceReportCaches(tx, session.workspace.id);

      const latestSnapshot = await tx.schemaSnapshot.findFirst({
        where: {
          workspaceId: session.workspace.id
        },
        orderBy: {
          version: "desc"
        },
        select: {
          version: true
        }
      });

      const updatedSource = await tx.dataSourceConnection.update({
        where: {
          id: dataSource.id
        },
        data: {
          status: ConnectionStatus.CONNECTED,
          config: {
            ...savedConfig,
            ...publicConfig(config)
          },
          schemas: schemaPayload,
          lastSyncAt: new Date(),
          lastErrorMessage: null
        }
      });

      await tx.dataSourceStats.deleteMany({
        where: {
          dataSourceConnectionId: dataSource.id
        }
      });
      await tx.dataSourceStats.createMany({
        data: tableStats.map((stat) => ({
          dataSourceConnectionId: dataSource.id,
          tableName: stat.tableName,
          rowCount: stat.rowCount,
          minDate: stat.minDate,
          maxDate: stat.maxDate,
          dateField: stat.dateField,
          schemaHash: stat.schemaHash,
          calculatedAt: new Date()
        }))
      });

      const schemaSnapshot = await tx.schemaSnapshot.create({
        data: {
          workspaceId: session.workspace.id,
          dataSourceId: updatedSource.id,
          version: (latestSnapshot?.version ?? 0) + 1,
          status: ConnectionStatus.CONNECTED,
          schemaJson: {
            sourceId: updatedSource.id,
            ...schemaPayload
          },
          qualityReport: {
            tableCount: tables.length,
            columnCount,
            semanticFieldCount: semanticLayer.fields.length,
            businessEntityCount: semanticLayer.entities.length,
            generatedMetricCount: semanticLayer.metrics.length,
            stats: tableStats,
            semanticMappingCache: semanticMappingCacheSummary(semanticMappingCache)
          }
        }
      });

      const metricGeneration = await generateWorkspaceMetricsFromConnectedSources(tx, {
        workspaceId: session.workspace.id,
        userId: session.user.id,
        dataSourceIds: [updatedSource.id]
      });

      return { updatedSource, schemaSnapshot, generatedMetricCount: metricGeneration.generatedMetricCount };
    });

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: result.updatedSource.id,
        name: result.updatedSource.name,
        provider: result.updatedSource.provider,
        type: result.updatedSource.type,
        status: result.updatedSource.status,
        connectionMode: result.updatedSource.connectionMode,
        authMethod: result.updatedSource.authMethod,
        config: publicConfig(config),
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables,
          semanticLayer,
          stats: tableStats
        },
        connectedAt: result.updatedSource.connectedAt?.toISOString() ?? null,
        lastSyncAt: result.updatedSource.lastSyncAt?.toISOString() ?? null
      },
      schema: {
        id: result.schemaSnapshot.id,
        version: result.schemaSnapshot.version,
        tableCount: tables.length,
        columnCount,
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount: result.generatedMetricCount,
        stats: tableStats
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Schema rescan failed"
      },
      { status: 400 }
    );
  }
}
