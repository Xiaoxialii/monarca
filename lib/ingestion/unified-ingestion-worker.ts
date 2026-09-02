import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { csvRowsFromText, excelRowsFromBuffer } from "@/lib/csv-upload-rows";
import { inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { runUnifiedIngestionPipeline } from "@/lib/ingestion/unified-ingestion-engine";
import { prisma } from "@/lib/prisma";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { InMemorySemanticMemoryStore } from "@/lib/semantic/memory";
import { buildSemanticMappingCache, semanticMappingCacheSummary } from "@/lib/semantic/schema-mapping-cache";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { writeCanonicalDatasetArtifacts } from "@/lib/snapshot/canonical-artifact-writer";
import {
  buildProductContextIndexRows,
  PRODUCT_CONTEXT_INDEX_VERSION,
  PRODUCT_CONTEXT_VALIDATION_VERSION,
  replaceProductContextIndex
} from "@/lib/snapshot/product-context-index";

const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 1_000;
export const SOURCE_INFERENCE_VERSION = "source_inference/v2";
export const SEMANTIC_MAPPING_VERSION = "semantic_mapping/v2_product_context";
const ACTIVE_INGESTION_JOB_STATUSES = ["RUNNING"] as const;
const LEGACY_ACTIVE_INGESTION_JOB_STATUSES = ["PROCESSING", "SCHEMA_READY", "CANONICALIZING"] as const;
const MAX_INGESTION_ATTEMPTS = 3;
const DEFAULT_STALE_INGESTION_JOB_MS = 2 * 60 * 1000;
const DEFAULT_QUEUED_INGESTION_JOB_MS = 2 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;

function configuredDurationMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const STALE_INGESTION_JOB_MS = configuredDurationMs(
  process.env.UNIFIED_INGESTION_STALE_MS,
  DEFAULT_STALE_INGESTION_JOB_MS
);
export const QUEUED_INGESTION_JOB_MS = configuredDurationMs(
  process.env.UNIFIED_INGESTION_QUEUED_MS,
  DEFAULT_QUEUED_INGESTION_JOB_MS
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

function queuedBeforeDate(now = new Date()) {
  return new Date(now.getTime() - QUEUED_INGESTION_JOB_MS);
}

function staleActiveJobWhere(now = new Date()) {
  const staleBefore = staleBeforeDate(now);

  return {
    status: {
      in: [...ACTIVE_INGESTION_JOB_STATUSES, ...LEGACY_ACTIVE_INGESTION_JOB_STATUSES]
    },
    OR: [
      {
        lastHeartbeatAt: {
          lt: staleBefore
        }
      },
      {
        heartbeatAt: {
          lt: staleBefore
        }
      },
      {
        lastHeartbeatAt: null,
        heartbeatAt: null,
        updatedAt: {
          lt: staleBefore
        }
      }
    ]
  };
}

function staleQueuedJobWhere(now = new Date()) {
  return {
    status: "QUEUED",
    updatedAt: {
      lt: queuedBeforeDate(now)
    }
  };
}

export function retryableIngestionJobWhere(now = new Date()) {
  return {
    OR: [
      {
        status: "FAILED",
        attemptCount: {
          lt: MAX_INGESTION_ATTEMPTS
        }
      },
      {
        status: "TIMEOUT",
        attemptCount: {
          lt: MAX_INGESTION_ATTEMPTS
        }
      },
      staleQueuedJobWhere(now),
      staleActiveJobWhere(now)
    ]
  };
}

type UploadSource = "csv" | "excel";

type IngestionJobMetadata = {
  userId?: string;
  source?: UploadSource;
  provider?: string;
  businessSource?: string;
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
  const businessSource = inferBusinessSource({
    source: metadata.source,
    provider: metadata.provider,
    businessSource: metadata.businessSource,
    fileName: metadata.fileName
  });

  return {
    type: typeof config.type === "string" ? config.type : metadata.source,
    businessSource,
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

export function inferBusinessSource(input: {
  source?: UploadSource;
  provider?: string | null;
  businessSource?: string | null;
  fileName?: string | null;
  observedFields?: string[];
}) {
  return inferBusinessSourceDiagnostic(input).inferredSource;
}

export function inferBusinessSourceDiagnostic(input: {
  source?: UploadSource;
  provider?: string | null;
  businessSource?: string | null;
  fileName?: string | null;
  observedFields?: string[];
}) {
  const explicit = normalizeBusinessSource(input.businessSource);
  if (explicit && !isTransportSource(explicit)) {
    return {
      inferredSource: explicit,
      confidence: 1,
      matchedSignals: [`explicit:${explicit}`],
      conflictingSignals: [] as string[],
      warnings: [] as string[],
      inferenceVersion: SOURCE_INFERENCE_VERSION
    };
  }

  const observed = inferBusinessSourceFromObservedFields(input.observedFields ?? []);

  const provider = normalizeBusinessSource(input.provider);
  const value = normalizeBusinessSource(`${input.provider ?? ""} ${input.fileName ?? ""}`) ?? "";
  const namedSource = businessSourceFromNormalizedValue(value);
  const providerSource = provider && !isTransportSource(provider) ? provider : null;
  const weakSource = providerSource ?? namedSource;
  const conflicts = [
    ...(weakSource && observed.inferredSource && weakSource !== observed.inferredSource ? [`weak:${weakSource}`] : []),
    ...observed.conflictingSignals
  ];

  if (observed.inferredSource) {
    return {
      inferredSource: observed.inferredSource,
      confidence: observed.confidence,
      matchedSignals: observed.matchedSignals,
      conflictingSignals: conflicts,
      warnings: conflicts.length ? ["Source filename/provider conflicted with strong field signals; using observed fields."] : [],
      inferenceVersion: SOURCE_INFERENCE_VERSION
    };
  }
  if (weakSource) {
    return {
      inferredSource: weakSource,
      confidence: providerSource ? 0.75 : 0.55,
      matchedSignals: [providerSource ? `provider:${weakSource}` : `filename:${weakSource}`],
      conflictingSignals: [] as string[],
      warnings: providerSource ? [] : ["Business source inferred from weak filename signal."],
      inferenceVersion: SOURCE_INFERENCE_VERSION
    };
  }

  const fallback = hasGenericEcommerceFields(input.observedFields ?? []) ? "ecommerce" : input.source ?? "upload";
  return {
    inferredSource: fallback,
    confidence: fallback === "ecommerce" ? 0.5 : 0.25,
    matchedSignals: fallback === "ecommerce" ? ["generic:ecommerce_fields"] : [`transport:${fallback}`],
    conflictingSignals: [] as string[],
    warnings: fallback === "ecommerce" ? ["Using generic ecommerce fallback."] : [],
    inferenceVersion: SOURCE_INFERENCE_VERSION
  };
}

function businessSourceFromNormalizedValue(value: string) {
  if (hasBusinessToken(value, ["meta", "facebook", "fb", "meta_ads", "facebook_ads"])) return "meta_ads";
  if (hasBusinessToken(value, ["amazon", "amz"])) return "amazon";
  if (hasBusinessToken(value, ["shopify"])) return "shopify";
  if (hasBusinessToken(value, ["inventory", "warehouse", "stock"])) return "inventory";
  if (hasBusinessToken(value, ["ads", "ad", "advertising", "campaign"])) return "ads";

  return null;
}

function inferBusinessSourceFromObservedFields(fields: string[]) {
  const normalizedFields = new Set(fields.map((fieldName) => normalizeBusinessSource(fieldName)).filter(Boolean) as string[]);
  if (!normalizedFields.size) {
    return {
      inferredSource: null as string | null,
      confidence: 0,
      matchedSignals: [] as string[],
      conflictingSignals: [] as string[]
    };
  }

  const signals = {
    amazon: observedFieldMatches(normalizedFields, [
      "amazon_order_id",
      "asin",
      "amazon_order_id",
      "marketplace_id",
      "seller_sku",
      "item_price",
      "item_tax",
      "amazon_fee",
      "fba_fee",
      "referral_fee",
      "fulfillment_channel"
    ]),
    shopify: observedFieldMatches(normalizedFields, [
      "shopify_order_id",
      "shopify_product_id",
      "admin_graphql_api_id",
      "variant_id",
      "variant_sku",
      "lineitem_sku",
      "lineitem_name",
      "handle",
      "product_handle",
      "vendor",
      "product_type",
      "compare_at_price",
      "financial_status",
      "fulfillment_status",
      "body_html"
    ]),
    meta_ads: observedFieldMatches(normalizedFields, [
      "ad_account_id",
      "campaign_id",
      "adset_id",
      "ad_set_id",
      "ad_id",
      "impressions",
      "clicks",
      "spend",
      "date_start"
    ]),
    inventory: observedFieldMatches(normalizedFields, [
      "warehouse_id",
      "stock_level",
      "stock_on_hand",
      "available_stock",
      "reorder_point",
      "inventory_quantity"
    ])
  };
  const score = Object.fromEntries(Object.entries(signals).map(([source, matches]) => [source, matches.length]));
  const ranked = Object.entries(score).sort((left, right) => right[1] - left[1]);
  const [winner, winningScore] = ranked[0] ?? [];
  const runnerUp = ranked[1];
  const runnerUpScore = runnerUp?.[1] ?? 0;

  return {
    inferredSource: winningScore >= 2 && winningScore >= runnerUpScore + 1 ? winner : null,
    confidence: Math.min(0.98, 0.45 + winningScore * 0.12 - runnerUpScore * 0.06),
    matchedSignals: winner ? signals[winner as keyof typeof signals].map((field) => `${winner}:${field}`) : [],
    conflictingSignals: runnerUp && runnerUpScore > 0 ? signals[runnerUp[0] as keyof typeof signals].map((field) => `${runnerUp[0]}:${field}`) : []
  };
}

function observedFieldMatches(fields: Set<string>, candidates: string[]) {
  return Array.from(new Set(candidates.filter((fieldName) => fields.has(fieldName))));
}

function hasGenericEcommerceFields(fields: string[]) {
  const normalizedFields = new Set(fields.map((fieldName) => normalizeBusinessSource(fieldName)).filter(Boolean) as string[]);
  const requiredGroups = [
    ["order_id", "order_number"],
    ["sku", "seller_sku", "variant_sku"],
    ["product_name", "product_title", "item_name", "title"],
    ["quantity", "qty"],
    ["unit_price", "price", "item_price"],
    ["order_date", "date", "created_at"]
  ];
  return requiredGroups.filter((group) => group.some((field) => normalizedFields.has(field))).length >= 4;
}

function isTransportSource(value: string) {
  return value === "excel" || value === "csv" || value === "upload" || value === "file";
}

function hasBusinessToken(value: string, tokens: string[]) {
  return tokens.some((token) => value === token || value.startsWith(`${token}_`) || value.endsWith(`_${token}`) || value.includes(`_${token}_`));
}

function normalizeBusinessSource(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return null;
  if (normalized === "facebook" || normalized === "facebook_ads" || normalized === "fb_ads") return "meta_ads";
  if (normalized === "amz") return "amazon";
  return normalized;
}

function observedFieldsFromTables(tables: Array<{
  columns: Array<{
    name?: string;
    displayName?: string;
    semanticName?: string;
    rawHeaderPath?: string[];
  }>;
}>) {
  return Array.from(new Set(tables.flatMap((table) => table.columns.flatMap((column) => [
    column.name,
    column.displayName,
    column.semanticName,
    ...(column.rawHeaderPath ?? [])
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)))));
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
    rowCount?: number;
    nonNullCount?: number;
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
      nullable: column.nullable,
      rowCount: column.rowCount,
      nonNullCount: column.nonNullCount
    }))
  }));
}

function canonicalSummary(input: {
  source: string;
  transportSource: UploadSource;
  rows: Array<Record<string, unknown>>;
  result: Awaited<ReturnType<typeof runUnifiedIngestionPipeline>>;
}) {
  return {
    status: "ready",
    source: input.result.source,
    transportSource: input.transportSource,
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
  source: string;
  transportSource: UploadSource;
  totalParsedRows: number;
}) {
  return {
    status: "processing",
    source: input.source,
    transportSource: input.transportSource,
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
  const heartbeat = data.heartbeatAt === undefined ? new Date() : data.heartbeatAt;
  await client.unifiedIngestionJob.updateMany({
    where: { id: jobId },
    data: {
      ...data,
      heartbeatAt: heartbeat,
      lastHeartbeatAt: heartbeat
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
        lastHeartbeatAt: new Date(),
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
      retryCount: true,
      attemptCount: true
    }
  });
  const previousAttempts = Math.max(previousJob?.attemptCount ?? 0, previousJob?.retryCount ?? 0);
  if (previousAttempts >= MAX_INGESTION_ATTEMPTS) {
    return { ok: false, skipped: true, reason: "Maximum ingestion attempts reached." };
  }
  const shouldIncrementRetryCount = Boolean(previousJob && previousJob.status !== "QUEUED");
  const lock = await client.unifiedIngestionJob.updateMany({
    where: {
      id: jobId,
      OR: [
        {
          status: "QUEUED"
        },
        {
          status: "FAILED",
          attemptCount: {
            lt: MAX_INGESTION_ATTEMPTS
          }
        },
        {
          status: "TIMEOUT",
          attemptCount: {
            lt: MAX_INGESTION_ATTEMPTS
          }
        },
        staleActiveJobWhere()
      ]
    },
    data: {
      status: "RUNNING",
      progress: 5,
      currentStep: "Loading uploaded file",
      errorMessage: null,
      heartbeatAt: new Date(),
      lastHeartbeatAt: new Date(),
      lockedAt: new Date(),
      lockedBy: owner,
      retryCount: {
        increment: shouldIncrementRetryCount ? 1 : 0
      },
      attemptCount: {
        increment: 1
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
  let sourceInference = inferBusinessSourceDiagnostic({
    source,
    provider,
    businessSource: metadata.businessSource,
    fileName
  });
  let businessSource = sourceInference.inferredSource;
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

    const activeDataSource = await client.dataSourceConnection.findFirst({
      where: {
        id: dataSourceId,
        workspaceId,
        isActive: true
      },
      select: {
        id: true
      }
    });

    if (!activeDataSource) {
      stopJobHeartbeat();
      await updateJob(client, jobId, {
        status: "CANCELLED",
        progress: 100,
        currentStep: "Cancelled",
        errorMessage: "Data source was removed.",
        heartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date()
      });
      return { ok: false, jobId };
    }

    const content = await readUploadedFile(metadata, source);

    await setJobState({
      status: "RUNNING",
      progress: 20,
      currentStep: "Inferring source schema"
    });

    const tables = await inferSchema(source, fileName, content);
    sourceInference = inferBusinessSourceDiagnostic({
      source,
      provider,
      businessSource: metadata.businessSource,
      fileName,
      observedFields: observedFieldsFromTables(tables)
    });
    businessSource = sourceInference.inferredSource;
    const schemaTables = publicTables(tables);
    const semanticLayer = buildSemanticLayer(tables);
    const semanticMappingCache = buildSemanticMappingCache({
      tables: schemaTables,
      semanticLayer,
      source: "unified_ingestion_sync"
    });
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const schemaPayload = {
      scannedAt: new Date().toISOString(),
      fileName,
      fileSize: metadata.fileSize ?? 0,
      tables: schemaTables,
      semanticMappingCache,
      unifiedIngestion: pendingUnifiedIngestionSummary({
        source: businessSource,
        transportSource: source,
        totalParsedRows: tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0)
      }),
      sourceInference
    };
    const qualityReport = {
      tableCount: tables.length,
      columnCount,
      semanticFieldCount: semanticLayer.fields.length,
      businessEntityCount: semanticLayer.entities.length,
      generatedMetricCount: semanticLayer.metrics.length,
      semanticMappingCache: semanticMappingCacheSummary(semanticMappingCache)
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
      status: "RUNNING",
      progress: 45,
      currentStep: "Building canonical model"
    });

    const uploadRows = await parseRows(source, content);
    const sampledRows = representativeIngestionRows(uploadRows, MAX_UNIFIED_INGESTION_SAMPLE_ROWS);
    const ingestionResult = await runUnifiedIngestionPipeline({
      source: businessSource,
      workspace_id: workspaceId,
      payload: uploadRows,
      metadata: {
        fileName,
        transportSource: source,
        businessSource,
        sourceInference,
        sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
        semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
        sampledRows: sampledRows.length,
        totalParsedRows: uploadRows.length,
        samplingStrategy: "representative_rows_for_mapping_full_rows_for_canonical",
        semanticMemoryMode: "ephemeral"
      },
      memory: new InMemorySemanticMemoryStore(),
      persistInferredMappings: false
    });
    const unifiedIngestion = canonicalSummary({
      source: businessSource,
      transportSource: source,
      rows: uploadRows,
      result: ingestionResult
    });

    await setJobState({
      status: "RUNNING",
      progress: 75,
      currentStep: "Generating canonical artifact"
    });

    const canonicalSchemaJson = await writeCanonicalDatasetArtifacts({
      workspaceId,
      dataSourceId,
      sourceProvider: businessSource,
      fileName,
      canonicalDataset: ingestionResult.canonical_data as CanonicalDataset,
      manifest: {
        dataMode: "upload_unified_canonical"
      }
    });
    const canonicalRowCount = countCanonicalRows(ingestionResult.canonical_data as CanonicalDataset);
    const productContextIndex = buildProductContextIndexRows({
      workspaceId,
      dataSourceId,
      schemaSnapshotId,
      provider: businessSource,
      canonicalDataset: ingestionResult.canonical_data as CanonicalDataset
    });
    const indexWrite = await replaceProductContextIndex(client, productContextIndex.rows);
    const validationStatus = productContextIndex.validation.status;
    const canonicalStatus = canonicalRowCount > 0 && validationStatus !== "FAILED_VALIDATION" ? "READY" : "FAILED";
    const completedSchemaPayload = {
      ...schemaPayload,
      unifiedIngestion,
      sourceInference
    };
    const schemaJson = {
      sourceId: dataSourceId,
      rawUploadSchema: completedSchemaPayload,
      ...canonicalSchemaJson,
      semanticMappingCache,
      sourceInference,
      sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
      semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
      productContextIndexVersion: PRODUCT_CONTEXT_INDEX_VERSION,
      productContextValidationVersion: PRODUCT_CONTEXT_VALIDATION_VERSION,
      productContextValidation: productContextIndex.validation,
      productContextIndex: {
        status: indexWrite.available ? "READY" : "UNAVAILABLE",
        version: PRODUCT_CONTEXT_INDEX_VERSION,
        rowCount: productContextIndex.rows.length,
        insertedRows: indexWrite.inserted
      }
    } as Prisma.InputJsonValue;

    await setJobState({
      status: "RUNNING",
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
          canonicalArtifactManifest: objectValue(canonicalSchemaJson).canonicalArtifactManifest ?? null,
          canonicalStatus,
          canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
          validationStatus,
          sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
          semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
          productContextIndexVersion: PRODUCT_CONTEXT_INDEX_VERSION,
          publishedAt: canonicalStatus === "READY" ? new Date() : null,
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
          canonicalArtifactBacked: canonicalRowCount > 0,
          canonicalArtifactManifest: objectValue(canonicalSchemaJson).canonicalArtifactManifest ?? null,
          canonicalRowCount,
          semanticMappingCache: semanticMappingCacheSummary(semanticMappingCache),
          sourceInference,
          productContextValidation: productContextIndex.validation,
          productContextIndex: {
            status: indexWrite.available ? "READY" : "UNAVAILABLE",
            version: PRODUCT_CONTEXT_INDEX_VERSION,
            rowCount: productContextIndex.rows.length,
            insertedRows: indexWrite.inserted
          }
        } as Prisma.InputJsonValue
      }
    });

    await client.schemaSnapshot.updateMany({
      where: { id: schemaSnapshotId },
      data: {
        status: canonicalRowCount > 0 ? ConnectionStatus.CONNECTED : ConnectionStatus.FAILED,
        schemaStatus: "READY",
        canonicalStatus,
        canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
        validationStatus,
        sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
        semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
        productContextIndexVersion: PRODUCT_CONTEXT_INDEX_VERSION,
        publishedAt: canonicalStatus === "READY" ? new Date() : null
      }
    });

    await client.dataSourceConnection.updateMany({
      where: {
        id: dataSourceId,
        isActive: true
      },
      data: {
        isActive: true,
        status: canonicalRowCount > 0 ? ConnectionStatus.CONNECTED : ConnectionStatus.FAILED,
        lastErrorMessage: canonicalRowCount > 0 ? null : "Canonical generation produced no rows",
        config: {
          ...compactDataSourceConfig({}, metadata),
          businessSource,
          sourceInference,
          canonicalArtifactManifest: objectValue(canonicalSchemaJson).canonicalArtifactManifest ?? null,
          schemaSnapshotId,
          schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
          canonicalStatus,
          validationStatus,
          sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
          semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
          productContextIndexVersion: PRODUCT_CONTEXT_INDEX_VERSION
        } as Prisma.InputJsonValue
      }
    });

    if (canonicalRowCount <= 0) {
      throw new Error("Canonical generation produced no rows");
    }

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
        lastHeartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
        errorMessage: null,
        metadataJson: {
          ...metadata,
          sourceInference,
          businessSource,
          schemaSnapshotId,
          sourceInferenceVersion: SOURCE_INFERENCE_VERSION,
          semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
          productContextIndexVersion: PRODUCT_CONTEXT_INDEX_VERSION,
          productContextValidation: productContextIndex.validation
        } as Prisma.InputJsonValue
      }
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
        where: {
          id: dataSourceId,
          isActive: true
        },
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
        lastHeartbeatAt: new Date(),
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

export function representativeIngestionRows<T>(rows: T[], maxRows = MAX_UNIFIED_INGESTION_SAMPLE_ROWS) {
  if (rows.length <= maxRows) return rows;

  const selected = new Map<number, T>();
  const firstWindow = Math.min(100, rows.length);
  const lastWindow = Math.min(100, rows.length);

  for (let index = 0; index < firstWindow; index += 1) {
    selected.set(index, rows[index]);
  }

  for (let index = Math.max(0, rows.length - lastWindow); index < rows.length; index += 1) {
    selected.set(index, rows[index]);
  }

  const remaining = Math.max(0, maxRows - selected.size);
  if (remaining > 0) {
    const stride = rows.length / remaining;
    for (let offset = 0; offset < remaining; offset += 1) {
      selected.set(Math.min(rows.length - 1, Math.floor(offset * stride)), rows[Math.min(rows.length - 1, Math.floor(offset * stride))]);
    }
  }

  for (let index = 0; selected.size < maxRows && index < rows.length; index += 1) {
    selected.set(index, rows[index]);
  }

  return Array.from(selected.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, row]) => row);
}

function countCanonicalRows(dataset: CanonicalDataset) {
  return Object.values(dataset.tables).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

async function markIngestionJobExhausted(
  client: PrismaClient,
  job: {
    id: string;
    dataSourceId: string;
    metadataJson?: Prisma.JsonValue | null;
  },
  message: string
) {
  const metadata = metadataValue(job.metadataJson);
  const schemaSnapshotId = metadata.schemaSnapshotId;

  if (schemaSnapshotId) {
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
    });
  }

  await client.dataSourceConnection.updateMany({
    where: {
      id: job.dataSourceId,
      isActive: true
    },
    data: {
      status: ConnectionStatus.FAILED,
      lastErrorMessage: message
    }
  });

  await client.unifiedIngestionJob.updateMany({
    where: { id: job.id },
    data: {
      status: "FAILED",
      progress: 100,
      currentStep: "Failed",
      errorMessage: message,
      heartbeatAt: new Date(),
      lastHeartbeatAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date()
    }
  });
}

export async function recoverStaleIngestionJobs(
  options: {
    client?: PrismaClient;
    workspaceId?: string;
    limit?: number;
    processRetryableJobs?: boolean;
  } = {}
) {
  const client = options.client ?? prisma;
  const limit = options.limit ?? 10;
  const processRetryableJobs = options.processRetryableJobs ?? true;
  const staleRunningJobs = await client.unifiedIngestionJob.findMany({
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
      lastHeartbeatAt: true,
      attemptCount: true,
      retryCount: true,
      metadataJson: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit
  });
  const timedOutJobs = [];
  const exhaustedJobs = [];

  for (const job of staleRunningJobs) {
    const attempts = Math.max(job.attemptCount ?? 0, job.retryCount ?? 0);
    const timeoutMessage = "Ingestion worker timed out before completing.";
    await client.unifiedIngestionJob.updateMany({
      where: { id: job.id },
      data: {
        status: "TIMEOUT",
        currentStep: "Timed out",
        errorMessage: timeoutMessage,
        heartbeatAt: new Date(),
        lastHeartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date()
      }
    });

    timedOutJobs.push(job);

    if (attempts >= MAX_INGESTION_ATTEMPTS) {
      await markIngestionJobExhausted(client, job, `${timeoutMessage} Maximum retry attempts reached.`);
      exhaustedJobs.push(job);
    }
  }

  const jobs = processRetryableJobs ? await client.unifiedIngestionJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      OR: [
        staleQueuedJobWhere(),
        {
          status: "TIMEOUT",
          attemptCount: {
            lt: MAX_INGESTION_ATTEMPTS
          }
        },
        {
          status: "FAILED",
          attemptCount: {
            lt: MAX_INGESTION_ATTEMPTS
          }
        }
      ]
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      status: true,
      progress: true,
      currentStep: true,
      heartbeatAt: true,
      lastHeartbeatAt: true,
      attemptCount: true,
      retryCount: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit
  }) : [];
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
    timedOut: timedOutJobs.length,
    exhausted: exhaustedJobs.length,
    results
  };
}
