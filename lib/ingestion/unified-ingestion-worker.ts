import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { csvRowsFromText, excelRowsFromBuffer } from "@/lib/csv-upload-rows";
import { inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { runUnifiedIngestionPipeline } from "@/lib/ingestion/unified-ingestion-engine";
import { generateEcommerceDecisionSnapshots } from "@/lib/dashboard/decision-snapshot-generator";
import { prisma } from "@/lib/prisma";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { writeCanonicalDatasetArtifacts } from "@/lib/snapshot/canonical-artifact-writer";

const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 5_000;
const ACTIVE_INGESTION_JOB_STATUSES = ["PROCESSING", "SCHEMA_READY", "CANONICALIZING"] as const;
const DEFAULT_STALE_INGESTION_JOB_MS = 10 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;

function configuredDurationMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const STALE_INGESTION_JOB_MS = configuredDurationMs(
  process.env.UNIFIED_INGESTION_STALE_MS,
  DEFAULT_STALE_INGESTION_JOB_MS
);
const HEARTBEAT_INTERVAL_MS = configuredDurationMs(
  process.env.UNIFIED_INGESTION_HEARTBEAT_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS
);

function workerId() {
  return `ingestion-worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function staleBeforeDate(now = new Date()) {
  return new Date(now.getTime() - STALE_INGESTION_JOB_MS);
}

function staleActiveJobWhere(now = new Date()) {
  const staleBefore = staleBeforeDate(now);

  return {
    status: {
      in: [...ACTIVE_INGESTION_JOB_STATUSES]
    },
    OR: [
      {
        heartbeatAt: {
          lt: staleBefore
        }
      },
      {
        heartbeatAt: null,
        updatedAt: {
          lt: staleBefore
        }
      }
    ]
  };
}

export function retryableIngestionJobWhere(now = new Date()) {
  return {
    OR: [
      {
        status: "FAILED"
      },
      staleActiveJobWhere(now)
    ]
  };
}

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

function compactDataSourceConfig(configValue: unknown, metadata: IngestionJobMetadata) {
  const config = objectValue(configValue);
  const storage = objectValue(config.storage);
  const metadataStorage = metadata.storage ?? {};

  return {
    type: typeof config.type === "string" ? config.type : metadata.source,
    fileName: typeof config.fileName === "string" ? config.fileName : metadata.fileName,
    fileSize: typeof config.fileSize === "number" ? config.fileSize : metadata.fileSize,
    mimeType: typeof config.mimeType === "string" ? config.mimeType : metadata.mimeType ?? null,
    extension: typeof config.extension === "string" ? config.extension : metadata.extension,
    storage: {
      provider: typeof storage.provider === "string" ? storage.provider : metadataStorage.provider ?? null,
      key: typeof storage.key === "string" ? storage.key : metadataStorage.key ?? null,
      path: typeof storage.path === "string" ? storage.path : metadataStorage.path ?? null,
      bucket: typeof storage.bucket === "string" ? storage.bucket : metadataStorage.bucket ?? null
    },
    storageProvider: typeof config.storageProvider === "string" ? config.storageProvider : metadataStorage.provider ?? null,
    objectKey: typeof config.objectKey === "string" ? config.objectKey : metadataStorage.key ?? null,
    storagePath: typeof config.storagePath === "string" ? config.storagePath : metadataStorage.path ?? null,
    storedFilePath: typeof config.storedFilePath === "string" ? config.storedFilePath : null
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
    learning: input.result.learning
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
    heartbeatAt?: Date | null;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    startedAt?: Date;
    completedAt?: Date | null;
  }
) {
  await client.unifiedIngestionJob.updateMany({
    where: { id: jobId },
    data: {
      ...data,
      heartbeatAt: data.heartbeatAt === undefined ? new Date() : data.heartbeatAt
    }
  });
}

function startHeartbeat(
  client: PrismaClient,
  jobId: string,
  getState: () => { currentStep: string | null; progress: number }
) {
  const interval = setInterval(() => {
    const state = getState();
    void client.unifiedIngestionJob.updateMany({
      where: {
        id: jobId,
        status: {
          in: [...ACTIVE_INGESTION_JOB_STATUSES]
        }
      },
      data: {
        heartbeatAt: new Date(),
        currentStep: state.currentStep,
        progress: state.progress
      }
    }).catch((error) => {
      console.warn("Failed to update ingestion job heartbeat", { jobId, error });
    });
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  return () => clearInterval(interval);
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
  const owner = workerId();
  const previousJob = await client.unifiedIngestionJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      retryCount: true
    }
  });
  const shouldIncrementRetryCount = Boolean(previousJob && previousJob.status !== "QUEUED");
  const lock = await client.unifiedIngestionJob.updateMany({
    where: {
      id: jobId,
      OR: [
        {
          status: "QUEUED"
        },
        {
          status: "FAILED"
        },
        staleActiveJobWhere()
      ]
    },
    data: {
      status: "PROCESSING",
      progress: 5,
      currentStep: "Loading uploaded file",
      errorMessage: null,
      heartbeatAt: new Date(),
      lockedAt: new Date(),
      lockedBy: owner,
      retryCount: {
        increment: shouldIncrementRetryCount ? 1 : 0
      },
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
  let currentStep: string | null = "Loading uploaded file";
  let currentProgress = 5;
  const stopHeartbeat = startHeartbeat(client, jobId, () => ({
    currentStep,
    progress: currentProgress
  }));
  let heartbeatStopped = false;
  const stopJobHeartbeat = () => {
    if (heartbeatStopped) return;
    heartbeatStopped = true;
    stopHeartbeat();
  };

  const setJobState = async (data: Parameters<typeof updateJob>[2]) => {
    if (typeof data.currentStep !== "undefined") {
      currentStep = data.currentStep;
    }
    if (typeof data.progress === "number") {
      currentProgress = data.progress;
    }
    await updateJob(client, jobId, data);
  };

  try {
    if (!job || !workspaceId || !dataSourceId || !schemaSnapshotId || (source !== "csv" && source !== "excel") || !fileName) {
      throw new Error("Unified ingestion job metadata is incomplete.");
    }

    const content = await readUploadedFile(metadata, source);

    await setJobState({
      status: "PROCESSING",
      progress: 20,
      currentStep: "Inferring source schema"
    });

    const tables = await inferSchema(source, fileName, content);
    const schemaTables = publicTables(tables);
    const semanticLayer = buildSemanticLayer(tables);
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const schemaPayload = {
      scannedAt: new Date().toISOString(),
      fileName,
      fileSize: metadata.fileSize ?? 0,
      tables: schemaTables,
      unifiedIngestion: pendingUnifiedIngestionSummary({
        source,
        totalParsedRows: tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0)
      })
    };
    const qualityReport = {
      tableCount: tables.length,
      columnCount,
      semanticFieldCount: semanticLayer.fields.length,
      businessEntityCount: semanticLayer.entities.length,
      generatedMetricCount: semanticLayer.metrics.length
    };

    if (schemaSnapshotId) await client.schemaSnapshot.updateMany({
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

    await setJobState({
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

    await setJobState({
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

    await setJobState({
      status: "SCHEMA_READY",
      progress: 90,
      currentStep: "Saving schema snapshot"
    });

    await client.dataSourceConnection.updateMany({
      where: { id: dataSourceId },
      data: {
        schemas: {
          scannedAt: completedSchemaPayload.scannedAt,
          fileName,
          fileSize: metadata.fileSize ?? 0,
          tableCount: qualityReport.tableCount,
          columnCount: qualityReport.columnCount,
          canonicalStatus: "READY",
          canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
          schemaSnapshotId
        } as Prisma.InputJsonValue
      }
    });

    await client.schemaSnapshot.updateMany({
      where: { id: schemaSnapshotId },
      data: {
        schemaJson,
        qualityReport: {
          ...qualityReport,
          canonicalArtifactBacked: true
        } as Prisma.InputJsonValue
      }
    });

    await client.schemaSnapshot.updateMany({
      where: { id: schemaSnapshotId },
      data: {
        status: ConnectionStatus.CONNECTED,
        schemaStatus: "READY",
        canonicalStatus: "READY",
        canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION
      }
    });

    await client.dataSourceConnection.updateMany({
      where: { id: dataSourceId },
      data: {
        isActive: true,
        status: ConnectionStatus.CONNECTED,
        lastErrorMessage: null,
        config: {
          ...compactDataSourceConfig({}, metadata),
          schemaSnapshotId,
          schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
          canonicalStatus: "READY"
        } as Prisma.InputJsonValue
      }
    });

    currentStep = "Completing ingestion job";
    currentProgress = 95;
    stopJobHeartbeat();

    await client.unifiedIngestionJob.updateMany({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        currentStep: "Ready",
        heartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
        errorMessage: null
      }
    });

    if (metadata.userId) {
      await generateWorkspaceMetricsFromConnectedSources(client, {
        workspaceId,
        userId: metadata.userId,
        dataSourceIds: [dataSourceId]
      });
    }

    await generateEcommerceDecisionSnapshots(client, {
      workspaceId,
      dataSourceId
    }).catch((decisionSnapshotError) => {
      console.warn("Failed to generate upload decision snapshots after ingestion job", decisionSnapshotError);
    });

    await clearWorkspaceReportCaches(client, workspaceId).catch((cacheError) => {
      console.warn("Failed to clear report caches after ingestion job", cacheError);
    });

    return { ok: true, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unified ingestion failed.";
    console.error("Unified ingestion job failed", { jobId, message });

    await client.schemaSnapshot.updateMany({
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
      await client.dataSourceConnection.updateMany({
        where: { id: dataSourceId },
        data: {
          status: ConnectionStatus.FAILED,
          lastErrorMessage: message
        }
      }).catch((updateError) => {
        console.error("Failed to mark data source ingestion failure", updateError);
      });
    }

    await client.unifiedIngestionJob.updateMany({
      where: { id: jobId },
      data: {
        status: "FAILED",
        progress: 100,
        currentStep: "Failed",
        heartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
        errorMessage: message
      }
    }).catch((jobError) => {
      console.error("Failed to mark ingestion job failure", jobError);
    });

    return { ok: false, jobId, error: message };
  } finally {
    stopJobHeartbeat();
  }
}

export async function recoverStaleIngestionJobs(
  options: {
    client?: PrismaClient;
    workspaceId?: string;
    limit?: number;
  } = {}
) {
  const client = options.client ?? prisma;
  const jobs = await client.unifiedIngestionJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...staleActiveJobWhere()
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      status: true,
      progress: true,
      currentStep: true,
      heartbeatAt: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: options.limit ?? 10
  });
  const results = [];

  for (const job of jobs) {
    const result = await processIngestionJob(job.id, { client });
    results.push({
      job,
      result
    });
  }

  return {
    recovered: results.filter((item) => item.result.ok).length,
    attempted: results.length,
    results
  };
}
