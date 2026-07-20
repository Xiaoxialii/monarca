import { ConnectionStatus, DataSourceType, Prisma, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { storeUploadInR2 } from "@/lib/r2-storage";
import { apiErrorResponse } from "@/lib/api-errors";
import { fileExtension, inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { storeUploadLocally } from "@/lib/local-upload-storage";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { csvRowsFromText, excelRowsFromBuffer } from "@/lib/csv-upload-rows";
import { runUnifiedIngestionPipeline } from "@/lib/ingestion/unified-ingestion-engine";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { writeCanonicalDatasetArtifacts } from "@/lib/snapshot/canonical-artifact-writer";

export const runtime = "nodejs";

const MAX_FILE_NAME_LENGTH = 180;
const INLINE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 5_000;

function pendingUnifiedIngestionSummary(input: {
  source: "csv" | "excel";
  totalParsedRows: number;
}) {
  return {
    status: "pending",
    source: input.source,
    sampledRows: Math.min(input.totalParsedRows, MAX_UNIFIED_INGESTION_SAMPLE_ROWS),
    totalParsedRows: input.totalParsedRows,
    message: "Unified ingestion is running in the background."
  };
}

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
      payload: sampledRows,
      metadata: {
        fileName: input.fileName,
        sampledRows: sampledRows.length,
        totalParsedRows: input.rows.length,
        samplingStrategy: "first_n_rows"
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

function runUploadPostProcessing(input: {
  workspaceId: string;
  userId: string;
  dataSourceId: string;
  schemaSnapshotId: string;
  source: "csv" | "excel";
  provider: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  extension: string;
  uploadedBuffer: Buffer;
  schemaPayload: Record<string, unknown>;
  qualityReport: Record<string, unknown>;
  inlineStoredFile: Record<string, unknown> | null;
  localStoredFilePath: string | null;
}) {
  void (async () => {
    const job = await prisma.backgroundJob.create({
      data: {
        workspaceId: input.workspaceId,
        type: "SYNC_DATA_SOURCE",
        status: "RUNNING",
        startedAt: new Date(),
        metadataJson: {
          dataSourceId: input.dataSourceId,
          schemaSnapshotId: input.schemaSnapshotId,
          provider: input.provider,
          fileName: input.fileName
        } as Prisma.InputJsonValue
      }
    });
    let storedFile: Awaited<ReturnType<typeof storeUploadInR2>> = null;

    try {
      const uploadBody = new ArrayBuffer(input.uploadedBuffer.byteLength);
      new Uint8Array(uploadBody).set(input.uploadedBuffer);
      const uploadFile = new File([uploadBody], input.fileName, {
        type: input.fileType || "application/octet-stream"
      });
      storedFile = await storeUploadInR2({
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        file: uploadFile
      });
    } catch (storageError) {
      console.warn("Cloud upload storage failed; local upload storage is already saved", storageError);
    }

    if (storedFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: input.dataSourceId
        },
        data: {
          isActive: true,
          config: {
            fileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: input.fileType,
            extension: input.extension,
            ...(input.inlineStoredFile ?? {}),
            storedFilePath: input.localStoredFilePath,
            storageProvider: "r2",
            storageBucket: storedFile.bucket,
            storagePath: storedFile.key,
            objectKey: storedFile.key,
            storage: {
              provider: "cloudflare-r2",
              bucket: storedFile.bucket,
              key: storedFile.key
            }
          }
        }
      });
    }

    const uploadRows = input.source === "csv"
      ? csvRowsFromText(input.uploadedBuffer.toString("utf8"))
      : await excelRowsFromBuffer(input.uploadedBuffer);
    const unifiedIngestionResult = await buildUnifiedUploadIngestionSummary({
      workspaceId: input.workspaceId,
      source: input.source,
      rows: uploadRows,
      fileName: input.fileName
    });
    const completedSchemaPayload = {
      ...input.schemaPayload,
      unifiedIngestion: unifiedIngestionResult.summary
    };
    const canonicalSchemaJson = unifiedIngestionResult.canonicalDataset
      ? await writeCanonicalDatasetArtifacts({
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        sourceProvider: input.provider.toLowerCase(),
        fileName: input.fileName,
        canonicalDataset: unifiedIngestionResult.canonicalDataset,
        manifest: {
          dataMode: "upload_unified_canonical"
        }
      })
      : null;
    const schemaJson = (canonicalSchemaJson
      ? {
        sourceId: input.dataSourceId,
        rawUploadSchema: completedSchemaPayload,
        ...canonicalSchemaJson
      }
      : {
        sourceId: input.dataSourceId,
        ...completedSchemaPayload
      }) as Prisma.InputJsonValue;

    await prisma.dataSourceConnection.update({
      where: {
        id: input.dataSourceId
      },
      data: {
        schemas: completedSchemaPayload as Prisma.InputJsonValue
      }
    });
    await prisma.schemaSnapshot.update({
      where: {
        id: input.schemaSnapshotId
      },
      data: {
        schemaJson,
        qualityReport: {
          ...input.qualityReport,
          canonicalArtifactBacked: Boolean(canonicalSchemaJson)
        } as Prisma.InputJsonValue
      }
    });

    await generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      dataSourceIds: [input.dataSourceId]
    });

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      }
    });
  })().catch(async (backgroundError) => {
    console.error("Failed to finish post-upload processing", backgroundError);
    const errorMessage = backgroundError instanceof Error ? backgroundError.message : "Unified ingestion failed.";

    await prisma.schemaSnapshot.update({
      where: {
        id: input.schemaSnapshotId
      },
      data: {
        schemaJson: {
          sourceId: input.dataSourceId,
          ...input.schemaPayload,
	          unifiedIngestion: {
	            status: "failed",
	            source: input.source,
	            sampledRows: 0,
	            message: errorMessage
	          }
	        } as Prisma.InputJsonValue
	      }
	    }).catch((updateError) => {
	      console.error("Failed to record upload post-processing failure", updateError);
	    });
    await prisma.backgroundJob.updateMany({
      where: {
        workspaceId: input.workspaceId,
        type: "SYNC_DATA_SOURCE",
        status: "RUNNING",
        metadataJson: {
          path: ["dataSourceId"],
          equals: input.dataSourceId
        }
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: errorMessage
      }
    }).catch((jobError) => {
      console.error("Failed to record upload background job failure", jobError);
    });
  });
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeMessage = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]");

  if (message.includes("DATABASE_URL must be a PostgreSQL connection string")) {
    return "数据库连接地址不是 PostgreSQL。请把 DATABASE_URL 改为 Neon/PostgreSQL 连接串后重试。";
  }

  if (
    message.includes("pool timeout") ||
    message.includes("failed to retrieve a connection") ||
    message.includes("Can't reach database server") ||
    message.includes("Timed out fetching a new connection")
  ) {
    return "数据库暂时无法连接，请检查 PostgreSQL / Neon 连接地址后再上传文件";
  }

  if (
    message.includes("does not exist") ||
    message.includes("Unknown argument") ||
    message.includes("Invalid `") ||
    message.includes("migration")
  ) {
    return `生产数据库结构可能未更新，请先执行 Prisma migration。原始错误：${safeMessage || "database schema error"}`;
  }

  if (
    message.includes("too large") ||
    message.includes("too many") ||
    message.includes("Unsupported")
  ) {
    return message;
  }

  return safeMessage ? `文件上传失败：${safeMessage}` : "File upload failed";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "File is required" }, { status: 400 });
    }

    const extension = fileExtension(file.name);
    const isCsv = extension === "csv";
    const isExcel = ["xls", "xlsx"].includes(extension);

    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { ok: false, message: "Only CSV, XLS, and XLSX files are supported" },
        { status: 400 }
      );
    }

    if (file.name.length > MAX_FILE_NAME_LENGTH) {
      return NextResponse.json(
        { ok: false, message: `File name is too long. Maximum supported length: ${MAX_FILE_NAME_LENGTH}.` },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ ok: false, message: "File is empty" }, { status: 400 });
    }

    if (file.size > FILE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${FILE_UPLOAD_MAX_MB}MB.` },
        { status: 413 }
      );
    }

    const uploadedBuffer = Buffer.from(await file.arrayBuffer());
    const tables = isCsv
      ? inferTablesFromCsvText(file.name, uploadedBuffer.toString("utf8"))
      : await inferTablesFromExcelBuffer(file.name, uploadedBuffer);
    const scannedAt = new Date().toISOString();
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const schemaTables = publicTables(tables);
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(schemaTables);
    const uploadSource = isCsv ? "csv" : "excel";
    const totalParsedRows = tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0);
    const unifiedIngestion = pendingUnifiedIngestionSummary({
      source: uploadSource,
      totalParsedRows
    });
    const snapshotSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables: schemaTables,
      semanticLayer,
      unifiedIngestion,
      analysisReport
    };
    const publicSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables: schemaTables,
      semanticLayer,
      unifiedIngestion,
      analysisReport
    };

    const dataSource = await prisma.dataSourceConnection.create({
      data: {
        workspaceId: session.workspace.id,
        type: sourceType,
        name: `${provider} - ${file.name}`,
        provider,
        isActive: true,
        status: ConnectionStatus.CONNECTED,
        connectionMode: "Upload",
        authMethod: "File",
        config: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          extension
        },
        schemas: publicSchemaPayload as Prisma.InputJsonValue,
        connectedAt: new Date(),
        lastSyncAt: new Date()
      }
    });

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
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
    const schemaSnapshot = await prisma.schemaSnapshot.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id,
        version: (latestSnapshot?.version ?? 0) + 1,
        status: ConnectionStatus.CONNECTED,
        schemaJson: {
          sourceId: dataSource.id,
          ...snapshotSchemaPayload
        } as Prisma.InputJsonValue,
        qualityReport: {
          tableCount: tables.length,
          columnCount,
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount: semanticLayer.metrics.length,
          analysisReport,
          canonicalArtifactBacked: false
        }
      }
    });
    const result = { dataSource, schemaSnapshot };
    void clearWorkspaceReportCaches(prisma, session.workspace.id).catch((cacheError) => {
      console.warn("Failed to clear report caches after upload", cacheError);
    });

    const generatedMetricCount = semanticLayer.metrics.length;
    let localStoredFile: Awaited<ReturnType<typeof storeUploadLocally>> | null = null;
    let storageWarning: string | null = null;
    const inlineStoredFile = file.size <= INLINE_UPLOAD_MAX_BYTES
      ? {
        inlineFileBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        inlineFileName: file.name,
        inlineMimeType: file.type || null,
        inlineFileSize: file.size
      }
      : null;

    try {
      localStoredFile = await storeUploadLocally({
        workspaceId: session.workspace.id,
        dataSourceId: result.dataSource.id,
        file
      });
    } catch (localStorageError) {
      storageWarning = "Original file storage failed; schema import was saved.";
      console.warn("Skipping local upload storage after schema import", localStorageError);
    }

    if (localStoredFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: result.dataSource.id
        },
        data: {
          isActive: true,
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension,
            ...(inlineStoredFile ?? {}),
            storedFilePath: localStoredFile.path,
            storage: {
              provider: localStoredFile.provider,
              path: localStoredFile.path
            }
          }
        }
      });
    } else if (inlineStoredFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: result.dataSource.id
        },
        data: {
          isActive: true,
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension,
            ...inlineStoredFile,
            storage: {
              provider: "inline-database"
            }
          }
        }
      });
    }

    runUploadPostProcessing({
      workspaceId: session.workspace.id,
      userId: session.user.id,
      dataSourceId: result.dataSource.id,
      schemaSnapshotId: result.schemaSnapshot.id,
      source: uploadSource,
      provider,
      fileName: file.name,
      fileType: file.type || null,
      fileSize: file.size,
      extension,
      uploadedBuffer,
      schemaPayload: snapshotSchemaPayload,
      qualityReport: {
        tableCount: tables.length,
        columnCount,
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount: semanticLayer.metrics.length,
        analysisReport
      },
      inlineStoredFile,
      localStoredFilePath: localStoredFile?.path ?? null
    });

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: result.dataSource.id,
        name: result.dataSource.name,
        provider: result.dataSource.provider,
        type: result.dataSource.type,
        status: result.dataSource.status,
        connectionMode: result.dataSource.connectionMode,
        authMethod: result.dataSource.authMethod,
        config: {
          fileName: file.name,
          fileSize: file.size,
          extension,
          storage: localStoredFile
            ? {
                provider: localStoredFile.provider,
                path: localStoredFile.path
              }
            : null,
          hasStoredFile: Boolean(localStoredFile)
        },
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables: schemaTables,
          unifiedIngestion
        },
        connectedAt: result.dataSource.connectedAt?.toISOString() ?? null,
        lastSyncAt: result.dataSource.lastSyncAt?.toISOString() ?? null
      },
      schema: {
        id: result.schemaSnapshot.id,
        version: result.schemaSnapshot.version,
        tableCount: tables.length,
        columnCount,
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount,
        analysisReport
      },
      storageWarning
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof BillingEntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: billingEntitlementMessage(error, billingLocaleFromRequest(request)),
          upgradeUrl: "/settings/billing",
          oneTimeUrl: "/settings/billing"
        },
        { status: error.status }
      );
    }

    return apiErrorResponse(error, uploadErrorMessage(error));
  }
}
