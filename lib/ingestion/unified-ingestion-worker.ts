import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { csvRowsFromText, excelRowsFromBuffer } from "@/lib/csv-upload-rows";
import { inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { runUnifiedIngestionPipeline } from "@/lib/ingestion/unified-ingestion-engine";
import { prisma } from "@/lib/prisma";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { writeCanonicalDatasetArtifacts } from "@/lib/snapshot/canonical-artifact-writer";

const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 5_000;

type UploadSource = "csv" | "excel";

type IngestionJobMetadata = {
  userId?: string;
  source?: UploadSource;
  provider?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string | null;
  extension?: string;
  schemaSnapshotId?: string;
  storage?: {
    provider?: string;
    path?: string;
    key?: string;
    bucket?: string;
  };
  inlineFileBase64?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataValue(value: unknown): IngestionJobMetadata {
  return objectValue(value) as IngestionJobMetadata;
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

function canonicalSummary(input: {
  source: UploadSource;
  rows: Array<Record<string, unknown>>;
  result: Awaited<ReturnType<typeof runUnifiedIngestionPipeline>>;
}) {
  return {
    status: "ready",
    source: input.result.source,
    sampledRows: Math.min(input.rows.length, MAX_UNIFIED_INGESTION_SAMPLE_ROWS),
    totalParsedRows: input.rows.length,
    detectedSchema: input.result.detected_schema,
    semantic: input.result.semantic,
    canonical: {
      schemaVersion: input.result.canonical_data.schema_version,
      rowCounts: Object.fromEntries(
        Object.entries(input.result.canonical_data.tables).map(([tableName, rows]) => [tableName, rows?.length ?? 0])
      ),
      validation: input.result.canonical_data.metadata.validation,
      dedupe: input.result.canonical_data.metadata.dedupe,
      mappingConfidence: input.result.canonical_data.metadata.mapping_confidence,
      unknownFieldCount: input.result.canonical_data.metadata.unknown_fields.length
    },
    metrics: input.result.metrics,
    learning: input.result.learning,
    audit: input.result.metadata.audit
  };
}

function pendingUnifiedIngestionSummary(input: {
  source: UploadSource;
  totalParsedRows: number;
}) {
  return {
    status: "processing",
    source: input.source,
    sampledRows: Math.min(input.totalParsedRows, MAX_UNIFIED_INGESTION_SAMPLE_ROWS),
    totalParsedRows: input.totalParsedRows,
    message: "Unified ingestion is running in the background."
  };
}

async function updateJob(
  client: PrismaClient,
  jobId: string,
  data: {
    status?: string;
    progress?: number;
    currentStep?: string | null;
    errorMessage?: string | null;
    startedAt?: Date;
    completedAt?: Date | null;
  }
) {
  await client.unifiedIngestionJob.update({
    where: { id: jobId },
    data
  });
}

async function readUploadedFile(metadata: IngestionJobMetadata, source: UploadSource) {
  const storage = metadata.storage ?? {};

  if (typeof metadata.inlineFileBase64 === "string" && metadata.inlineFileBase64) {
    const buffer = Buffer.from(metadata.inlineFileBase64, "base64");
    return source === "csv" ? buffer.toString("utf8") : buffer;
  }

  if (storage.provider === "local-file" && storage.path) {
    const buffer = await readFile(storage.path);
    return source === "csv" ? buffer.toString("utf8") : buffer;
  }

  if ((storage.provider === "cloudflare-r2" || storage.provider === "r2") && storage.key) {
    return source === "csv" ? await readR2ObjectText(storage.key) : await readR2ObjectBuffer(storage.key);
  }

  throw new Error("Uploaded file is unavailable for ingestion processing.");
}

function parseRows(source: UploadSource, content: string | Buffer) {
  return source === "csv"
    ? csvRowsFromText(content as string)
    : excelRowsFromBuffer(content as Buffer);
}

async function inferSchema(source: UploadSource, fileName: string, content: string | Buffer) {
  return source === "csv"
    ? inferTablesFromCsvText(fileName, content as string)
    : await inferTablesFromExcelBuffer(fileName, content as Buffer);
}

export async function processIngestionJob(
  jobId: string,
  options: { client?: PrismaClient } = {}
) {
  const client = options.client ?? prisma;
  const lock = await client.unifiedIngestionJob.updateMany({
    where: {
      id: jobId,
      status: {
        in: ["QUEUED", "FAILED"]
      }
    },
    data: {
      status: "PROCESSING",
      progress: 5,
      currentStep: "Loading uploaded file",
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null
    }
  });

  if (lock.count !== 1) {
    return { ok: false, skipped: true, reason: "Job is already processing or completed." };
  }

  const job = await client.unifiedIngestionJob.findUnique({
    where: { id: jobId }
  });
  const metadata = metadataValue(job?.metadataJson);
  const workspaceId = job?.workspaceId;
  const dataSourceId = job?.dataSourceId;
  const source = metadata.source;
  const fileName = metadata.fileName;
  const schemaSnapshotId = metadata.schemaSnapshotId;
  const provider = metadata.provider ?? (source === "csv" ? "CSV" : "Excel");

  try {
    if (!job || !workspaceId || !dataSourceId || !schemaSnapshotId || (source !== "csv" && source !== "excel") || !fileName) {
      throw new Error("Unified ingestion job metadata is incomplete.");
    }

    const content = await readUploadedFile(metadata, source);

    await updateJob(client, jobId, {
      status: "PROCESSING",
      progress: 20,
      currentStep: "Inferring source schema"
    });

    const tables = await inferSchema(source, fileName, content);
    const schemaTables = publicTables(tables);
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(schemaTables);
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const schemaPayload = {
      scannedAt: new Date().toISOString(),
      fileName,
      fileSize: metadata.fileSize ?? 0,
      tables: schemaTables,
      semanticLayer,
      unifiedIngestion: pendingUnifiedIngestionSummary({
        source,
        totalParsedRows: tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0)
      }),
      analysisReport
    };
    const qualityReport = {
      tableCount: tables.length,
      columnCount,
      semanticFieldCount: semanticLayer.fields.length,
      businessEntityCount: semanticLayer.entities.length,
      generatedMetricCount: semanticLayer.metrics.length,
      analysisReport
    };

    if (schemaSnapshotId) await client.schemaSnapshot.update({
      where: { id: schemaSnapshotId },
      data: {
        schemaStatus: "PROCESSING",
        canonicalStatus: "GENERATING",
        schemaJson: {
          sourceId: dataSourceId,
          ...schemaPayload
        } as Prisma.InputJsonValue,
        qualityReport: {
          ...qualityReport,
          canonicalArtifactBacked: false
        } as Prisma.InputJsonValue
      }
    });

    await updateJob(client, jobId, {
      status: "CANONICALIZING",
      progress: 45,
      currentStep: "Building canonical model"
    });

    const uploadRows = await parseRows(source, content);
    const sampledRows = uploadRows.slice(0, MAX_UNIFIED_INGESTION_SAMPLE_ROWS);
    const ingestionResult = await runUnifiedIngestionPipeline({
      source,
      workspace_id: workspaceId,
      payload: sampledRows,
      metadata: {
        fileName,
        sampledRows: sampledRows.length,
        totalParsedRows: uploadRows.length,
        samplingStrategy: "first_n_rows"
      },
      memory: new PrismaSemanticMemoryStore(client, { workspaceId })
    });
    const unifiedIngestion = canonicalSummary({
      source,
      rows: uploadRows,
      result: ingestionResult
    });

    await updateJob(client, jobId, {
      status: "CANONICALIZING",
      progress: 75,
      currentStep: "Generating canonical artifact"
    });

    const canonicalSchemaJson = await writeCanonicalDatasetArtifacts({
      workspaceId,
      dataSourceId,
      sourceProvider: provider.toLowerCase(),
      fileName,
      canonicalDataset: ingestionResult.canonical_data as CanonicalDataset,
      manifest: {
        dataMode: "upload_unified_canonical"
      }
    });
    const completedSchemaPayload = {
      ...schemaPayload,
      unifiedIngestion
    };
    const schemaJson = {
      sourceId: dataSourceId,
      rawUploadSchema: completedSchemaPayload,
      ...canonicalSchemaJson
    } as Prisma.InputJsonValue;

    await updateJob(client, jobId, {
      status: "SCHEMA_READY",
      progress: 90,
      currentStep: "Saving schema snapshot"
    });

    const existingDataSourceConfig = objectValue((await client.dataSourceConnection.findUnique({
      where: { id: dataSourceId },
      select: { config: true }
    }))?.config);

    await client.$transaction(async (tx) => {
      await tx.dataSourceConnection.update({
        where: { id: dataSourceId },
        data: {
          isActive: true,
          status: ConnectionStatus.CONNECTED,
          lastErrorMessage: null,
          schemas: completedSchemaPayload as Prisma.InputJsonValue,
          config: {
            ...existingDataSourceConfig,
            schemaSnapshotId,
            schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
            canonicalStatus: "READY"
          } as Prisma.InputJsonValue
        }
      });

      await tx.schemaSnapshot.update({
        where: { id: schemaSnapshotId },
        data: {
          status: ConnectionStatus.CONNECTED,
          schemaStatus: "READY",
          canonicalStatus: "READY",
          canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
          schemaJson,
          qualityReport: {
            ...qualityReport,
            canonicalArtifactBacked: true
          } as Prisma.InputJsonValue
        }
      });

      await tx.unifiedIngestionJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          currentStep: "Ready",
          completedAt: new Date(),
          errorMessage: null
        }
      });
    }, {
      timeout: 1_000
    });

    if (metadata.userId) {
      await generateWorkspaceMetricsFromConnectedSources(client, {
        workspaceId,
        userId: metadata.userId,
        dataSourceIds: [dataSourceId]
      });
    }

    await clearWorkspaceReportCaches(client, workspaceId).catch((cacheError) => {
      console.warn("Failed to clear report caches after ingestion job", cacheError);
    });

    return { ok: true, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unified ingestion failed.";
    console.error("Unified ingestion job failed", { jobId, message });

    await client.schemaSnapshot.update({
      where: { id: schemaSnapshotId },
      data: {
        status: ConnectionStatus.FAILED,
        schemaStatus: "FAILED",
        canonicalStatus: "FAILED",
        qualityReport: {
          errorMessage: message,
          canonicalArtifactBacked: false
        } as Prisma.InputJsonValue
      }
    }).catch((updateError) => {
      console.error("Failed to mark schema snapshot ingestion failure", updateError);
    });

    if (dataSourceId) {
      const existingDataSourceConfig = objectValue((await client.dataSourceConnection.findUnique({
        where: { id: dataSourceId },
        select: { config: true }
      }))?.config);

      await client.dataSourceConnection.update({
        where: { id: dataSourceId },
        data: {
          status: ConnectionStatus.FAILED,
          lastErrorMessage: message,
          config: {
            ...existingDataSourceConfig,
            canonicalStatus: "FAILED"
          } as Prisma.InputJsonValue
        }
      }).catch((updateError) => {
        console.error("Failed to mark data source ingestion failure", updateError);
      });
    }

    await client.unifiedIngestionJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        progress: 100,
        currentStep: "Failed",
        completedAt: new Date(),
        errorMessage: message
      }
    }).catch((jobError) => {
      console.error("Failed to mark ingestion job failure", jobError);
    });

    return { ok: false, jobId, error: message };
  }
}
