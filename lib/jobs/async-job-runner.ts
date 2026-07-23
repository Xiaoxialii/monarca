import { Prisma, type PrismaClient } from "@prisma/client";
import { METRIC_SNAPSHOT_VERSION } from "@/lib/dashboard/decision-snapshot-lifecycle";
import { generateEcommerceDecisionSnapshots } from "@/lib/dashboard/decision-snapshot-generator";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { processIngestionJob, retryableIngestionJobWhere } from "@/lib/ingestion/unified-ingestion-worker";
import { prisma } from "@/lib/prisma";
import { normalizeProfitInputs } from "@/lib/profit/profit-input-normalizer";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";

export const ASYNC_JOB_TYPES = [
  "INGESTION",
  "SYNC_CONNECTOR",
  "CALCULATE_METRICS",
  "PROFIT_ANALYSIS",
  "GENERATE_REPORT",
  "GENERATE_INSIGHT",
  "SKU_OPTIMIZATION",
  "SIMULATION"
] as const;

export const ASYNC_JOB_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
] as const;

const ACTIVE_ASYNC_JOB_STATUSES = ["PROCESSING"] as const;
const RESUMABLE_ASYNC_JOB_STATUSES = ["PROCESSING", "PAUSED"] as const;
const DEFAULT_STALE_ASYNC_JOB_MS = 10 * 60 * 1000;
const DEFAULT_QUEUED_ASYNC_JOB_MS = 2 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_MAX_RECOVERY_BATCH = 25;

type AsyncJobType = typeof ASYNC_JOB_TYPES[number];
type AsyncJobStatus = typeof ASYNC_JOB_STATUSES[number];

type AsyncJobPayload = {
  unifiedIngestionJobId?: string;
  ingestionJobId?: string;
  dataSourceId?: string;
  schemaSnapshotId?: string;
  [key: string]: unknown;
};

type JobHandlerResult = {
  snapshotType?: string;
  snapshotVersion?: string;
  dataReference?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  nextJobs?: Array<{
    type: AsyncJobType;
    payload?: Prisma.InputJsonValue | null;
    currentStep?: string;
  }>;
};

function configuredDurationMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const STALE_ASYNC_JOB_MS = configuredDurationMs(
  process.env.ASYNC_JOB_STALE_MS,
  DEFAULT_STALE_ASYNC_JOB_MS
);

export const QUEUED_ASYNC_JOB_MS = configuredDurationMs(
  process.env.ASYNC_JOB_QUEUED_MS,
  DEFAULT_QUEUED_ASYNC_JOB_MS
);

const HEARTBEAT_INTERVAL_MS = configuredDurationMs(
  process.env.ASYNC_JOB_HEARTBEAT_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS
);

function workerId() {
  return `async-job-worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function staleBeforeDate(now = new Date()) {
  return new Date(now.getTime() - STALE_ASYNC_JOB_MS);
}

function queuedBeforeDate(now = new Date()) {
  return new Date(now.getTime() - QUEUED_ASYNC_JOB_MS);
}

function staleQueuedJobWhere(now = new Date()) {
  return {
    status: "QUEUED",
    updatedAt: {
      lt: queuedBeforeDate(now)
    }
  };
}

function staleResumableJobWhere(now = new Date()) {
  const staleBefore = staleBeforeDate(now);

  return {
    status: {
      in: [...RESUMABLE_ASYNC_JOB_STATUSES]
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

export function retryableAsyncJobWhere(now = new Date()) {
  return {
    OR: [
      staleQueuedJobWhere(now),
      staleResumableJobWhere(now),
      {
        status: "FAILED"
      }
    ]
  };
}

function startHeartbeat(
  client: PrismaClient,
  jobId: string,
  getState: () => { currentStep: string | null; progress: number }
) {
  const interval = setInterval(() => {
    const state = getState();
    void client.asyncJob.updateMany({
      where: {
        id: jobId,
        status: {
          in: [...ACTIVE_ASYNC_JOB_STATUSES]
        }
      },
      data: {
        heartbeatAt: new Date(),
        currentStep: state.currentStep,
        progress: state.progress
      }
    }).catch((error) => {
      console.warn("Failed to update async job heartbeat", { jobId, error });
    });
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  return () => clearInterval(interval);
}

async function updateJob(
  client: PrismaClient,
  jobId: string,
  data: {
    status?: AsyncJobStatus;
    progress?: number;
    currentStep?: string | null;
    errorMessage?: string | null;
    resultReference?: Prisma.InputJsonValue;
    heartbeatAt?: Date | null;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    completedAt?: Date | null;
  }
) {
  await client.asyncJob.updateMany({
    where: { id: jobId },
    data: {
      ...data,
      heartbeatAt: data.heartbeatAt === undefined ? new Date() : data.heartbeatAt
    }
  });
}

export async function createAsyncJob(
  client: PrismaClient,
  input: {
    workspaceId: string;
    type: AsyncJobType;
    payload?: Prisma.InputJsonValue | null;
    maxRetries?: number;
    currentStep?: string;
  }
) {
  return client.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      status: "QUEUED",
      progress: 0,
      currentStep: input.currentStep ?? "Queued",
      payload: input.payload ?? undefined,
      maxRetries: input.maxRetries ?? 3
    }
  });
}

export async function enqueueSkuOptimizationJob(
  client: PrismaClient,
  input: {
    workspaceId: string;
    reason?: string;
    triggerDataSourceId?: string | null;
    schemaSnapshotId?: string | null;
    inputHash?: string | null;
  }
) {
  const existing = await client.asyncJob.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: "SKU_OPTIMIZATION",
      status: {
        in: ["QUEUED", "PROCESSING", "PAUSED"]
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (existing) return existing;

  return createAsyncJob(client, {
    workspaceId: input.workspaceId,
    type: "SKU_OPTIMIZATION",
    currentStep: "Queued for decision optimization",
    payload: {
      reason: input.reason ?? "manual_or_freshness_refresh",
      triggerDataSourceId: input.triggerDataSourceId ?? null,
      schemaSnapshotId: input.schemaSnapshotId ?? null,
      inputHash: input.inputHash ?? null
    } as Prisma.InputJsonValue
  });
}

export async function processJob(
  jobId: string,
  options: { client?: PrismaClient } = {}
) {
  const client = options.client ?? prisma;
  const owner = workerId();
  const previousJob = await client.asyncJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      retryCount: true,
      maxRetries: true
    }
  });
  const shouldIncrementRetryCount = Boolean(previousJob && previousJob.status !== "QUEUED");

  const lock = await client.asyncJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: "QUEUED" },
        staleResumableJobWhere(),
        {
          status: "FAILED",
          retryCount: {
            lt: previousJob?.maxRetries ?? 3
          }
        }
      ]
    },
    data: {
      status: "PROCESSING",
      progress: 5,
      currentStep: "Starting job",
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

  const job = await client.asyncJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      payload: true
    }
  });

  let currentStep: string | null = "Starting job";
  let currentProgress = 5;
  let heartbeatStopped = false;
  const stopHeartbeat = startHeartbeat(client, jobId, () => ({
    currentStep,
    progress: currentProgress
  }));
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
    if (!job?.workspaceId || !ASYNC_JOB_TYPES.includes(job.type as AsyncJobType)) {
      throw new Error("Async job metadata is incomplete.");
    }

    const result = await executeJobHandler(client, {
      id: job.id,
      workspaceId: job.workspaceId,
      type: job.type as AsyncJobType,
      payload: asRecord(job.payload) as AsyncJobPayload,
      setJobState
    });
    const resultReference = {
      ...(result.dataReference ?? {}),
      snapshotType: result.snapshotType ?? null,
      snapshotVersion: result.snapshotVersion ?? null
    };

    if (result.snapshotType) {
      await client.snapshot.create({
        data: {
          workspaceId: job.workspaceId,
          sourceJobId: job.id,
          type: result.snapshotType,
          version: result.snapshotVersion ?? "v1",
          status: "READY",
          dataReference: result.dataReference as Prisma.InputJsonValue,
          metadataJson: result.metadataJson as Prisma.InputJsonValue
        }
      });
    }

    stopJobHeartbeat();
    await updateJob(client, jobId, {
      status: "COMPLETED",
      progress: 100,
      currentStep: "Completed",
      heartbeatAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date(),
      errorMessage: null,
      resultReference: resultReference as Prisma.InputJsonValue
    });

    const downstreamJobs = [];
    for (const nextJob of result.nextJobs ?? []) {
      const created = await createAsyncJob(client, {
        workspaceId: job.workspaceId,
        type: nextJob.type,
        payload: nextJob.payload,
        currentStep: nextJob.currentStep
      });
      downstreamJobs.push(created.id);
    }

    for (const downstreamJobId of downstreamJobs) {
      void processJob(downstreamJobId).catch((error) => {
        console.warn("Failed to process downstream async job", { downstreamJobId, error });
      });
    }

    return { ok: true, jobId, resultReference, downstreamJobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Async job failed.";
    console.error("Async job failed", { jobId, message });

    stopJobHeartbeat();
    await updateJob(client, jobId, {
      status: "FAILED",
      progress: 100,
      currentStep: "Failed",
      errorMessage: message,
      heartbeatAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date()
    }).catch((jobError) => {
      console.error("Failed to mark async job failure", jobError);
    });

    return { ok: false, jobId, error: message };
  } finally {
    stopJobHeartbeat();
  }
}

async function executeJobHandler(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    type: AsyncJobType;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  switch (input.type) {
    case "INGESTION":
      return processIngestionAsyncJob(client, input);
    case "CALCULATE_METRICS":
      return processMetricCalculationAsyncJob(client, input);
    case "PROFIT_ANALYSIS":
      return processProfitAnalysisAsyncJob(client, input);
    case "SKU_OPTIMIZATION":
      return processSkuOptimizationAsyncJob(client, input);
    case "SYNC_CONNECTOR":
    case "GENERATE_REPORT":
    case "GENERATE_INSIGHT":
    case "SIMULATION":
      throw new Error(`${input.type} handler is registered but has not been migrated to AsyncJob yet.`);
  }
}

async function processIngestionAsyncJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const ingestionJobId = input.payload.unifiedIngestionJobId ?? input.payload.ingestionJobId;

  if (!ingestionJobId) {
    throw new Error("INGESTION job payload is missing unifiedIngestionJobId.");
  }

  await input.setJobState({
    progress: 10,
    currentStep: "Running ingestion pipeline"
  });

  const existingIngestionJob = await client.unifiedIngestionJob.findUnique({
    where: { id: ingestionJobId },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      status: true,
      errorMessage: true,
      metadataJson: true
    }
  });

  if (!existingIngestionJob || existingIngestionJob.workspaceId !== input.workspaceId) {
    throw new Error("Unified ingestion job was not found for this workspace.");
  }

  if (existingIngestionJob.status !== "COMPLETED") {
    const result = await processIngestionJob(ingestionJobId, { client });
    if (!result.ok && !result.skipped) {
      throw new Error(result.error ?? "Unified ingestion failed.");
    }
  }

  const refreshedIngestionJob = await client.unifiedIngestionJob.findUnique({
    where: { id: ingestionJobId },
    select: {
      dataSourceId: true,
      status: true,
      errorMessage: true,
      metadataJson: true
    }
  });

  if (refreshedIngestionJob?.status !== "COMPLETED") {
    throw new Error(refreshedIngestionJob?.errorMessage ?? "Unified ingestion did not complete.");
  }

  const payloadSchemaSnapshotId = typeof input.payload.schemaSnapshotId === "string"
    ? input.payload.schemaSnapshotId
    : typeof asRecord(refreshedIngestionJob.metadataJson).schemaSnapshotId === "string"
      ? asRecord(refreshedIngestionJob.metadataJson).schemaSnapshotId as string
      : null;
  const schemaSnapshot = payloadSchemaSnapshotId
    ? await client.schemaSnapshot.findFirst({
        where: {
          id: payloadSchemaSnapshotId,
          workspaceId: input.workspaceId
        },
        select: {
          id: true,
          dataSourceId: true,
          canonicalVersion: true,
          schemaStatus: true,
          canonicalStatus: true
        }
      })
    : await client.schemaSnapshot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          dataSourceId: refreshedIngestionJob.dataSourceId
        },
        select: {
          id: true,
          dataSourceId: true,
          canonicalVersion: true,
          schemaStatus: true,
          canonicalStatus: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

  await input.setJobState({
    progress: 90,
    currentStep: "Recording snapshot reference"
  });

  return {
    snapshotType: "SCHEMA_SNAPSHOT",
    snapshotVersion: schemaSnapshot?.canonicalVersion ?? ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    dataReference: {
      schemaSnapshotId: schemaSnapshot?.id ?? payloadSchemaSnapshotId,
      dataSourceId: schemaSnapshot?.dataSourceId ?? refreshedIngestionJob.dataSourceId,
      unifiedIngestionJobId: ingestionJobId
    },
    metadataJson: {
      schemaStatus: schemaSnapshot?.schemaStatus ?? null,
      canonicalStatus: schemaSnapshot?.canonicalStatus ?? null,
      migratedFrom: "UnifiedIngestionJob"
    },
    nextJobs: [
      {
        type: "CALCULATE_METRICS",
        currentStep: "Queued for metric calculation",
        payload: {
          dataSourceId: schemaSnapshot?.dataSourceId ?? refreshedIngestionJob.dataSourceId,
          schemaSnapshotId: schemaSnapshot?.id ?? payloadSchemaSnapshotId
        } as Prisma.InputJsonValue
      }
    ]
  };
}

async function processMetricCalculationAsyncJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const triggerDataSourceId = typeof input.payload.dataSourceId === "string" ? input.payload.dataSourceId : null;
  const schemaSnapshotId = typeof input.payload.schemaSnapshotId === "string" ? input.payload.schemaSnapshotId : null;
  const source = triggerDataSourceId
    ? await client.dataSourceConnection.findFirst({
        where: {
          id: triggerDataSourceId,
          workspaceId: input.workspaceId
        },
        select: {
          id: true
        }
      })
    : null;

  if (triggerDataSourceId && !source) {
    throw new Error("Metric calculation source was not found for this workspace.");
  }

  await input.setJobState({
    progress: 25,
    currentStep: "Calculating metric snapshots"
  });

  const generated = await generateWorkspaceMetricsFromConnectedSources(client, {
    workspaceId: input.workspaceId
  }).catch((error) => {
    console.warn("Metric calculation job completed with degraded metric output", error);
    return { generatedMetricCount: 0 };
  });

  await input.setJobState({
    progress: 85,
    currentStep: "Metric snapshot ready"
  });

  return {
    snapshotType: "METRIC_SNAPSHOT",
    snapshotVersion: METRIC_SNAPSHOT_VERSION,
    dataReference: {
      triggerDataSourceId,
      schemaSnapshotId,
      generatedMetricCount: generated.generatedMetricCount ?? 0
    },
    metadataJson: {
      calculationVersion: "metrics_from_canonical_v1"
    },
    nextJobs: [
      {
        type: "PROFIT_ANALYSIS",
        currentStep: "Queued for profit analysis",
        payload: {
          triggerDataSourceId,
          schemaSnapshotId
        } as Prisma.InputJsonValue
      }
    ]
  };
}

async function processProfitAnalysisAsyncJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const triggerDataSourceId = typeof input.payload.triggerDataSourceId === "string"
    ? input.payload.triggerDataSourceId
    : typeof input.payload.dataSourceId === "string"
      ? input.payload.dataSourceId
      : null;
  const schemaSnapshotId = typeof input.payload.schemaSnapshotId === "string" ? input.payload.schemaSnapshotId : null;

  await input.setJobState({
    progress: 25,
    currentStep: "Normalizing profit inputs"
  });

  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId: input.workspaceId,
    dataSourceId: null,
    decisionMode: "full"
  });
  const profitInputModel = normalizeProfitInputs(loaded.data);

  await input.setJobState({
    progress: 85,
    currentStep: "Profit analysis ready"
  });

  return {
    snapshotType: "INSIGHT_SNAPSHOT",
    snapshotVersion: "profit_input_model_v1",
    dataReference: {
      triggerDataSourceId,
      schemaSnapshotId,
      profitDataCoverage: profitInputModel.profitDataCoverage,
      optimizationLevel: profitInputModel.optimizationLevel,
      missingFields: profitInputModel.missingFields
    },
    metadataJson: {
      state: loaded.state,
      confidenceScore: profitInputModel.confidenceScore,
      rowCount: profitInputModel.rows.length
    },
    nextJobs: [
      {
        type: "SKU_OPTIMIZATION",
        currentStep: "Queued for decision optimization",
        payload: {
          triggerDataSourceId,
          schemaSnapshotId,
          profitDataCoverage: profitInputModel.profitDataCoverage,
          optimizationLevel: profitInputModel.optimizationLevel
        } as Prisma.InputJsonValue
      }
    ]
  };
}

async function processSkuOptimizationAsyncJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const triggerDataSourceId = typeof input.payload.triggerDataSourceId === "string"
    ? input.payload.triggerDataSourceId
    : typeof input.payload.dataSourceId === "string"
      ? input.payload.dataSourceId
      : null;
  const schemaSnapshotId = typeof input.payload.schemaSnapshotId === "string" ? input.payload.schemaSnapshotId : null;

  await input.setJobState({
    progress: 35,
    currentStep: "Generating decision snapshot"
  });

  const decisionSnapshots = await generateEcommerceDecisionSnapshots(client, {
    workspaceId: input.workspaceId,
    dataSourceId: null,
    sourceJobId: input.id
  });

  await input.setJobState({
    progress: 90,
    currentStep: "Decision snapshot ready"
  });

  return {
    snapshotType: "DECISION_SNAPSHOT",
    snapshotVersion: "decision_snapshot_v1",
    dataReference: {
      triggerDataSourceId,
      schemaSnapshotId,
      generated: decisionSnapshots.generated
    },
    metadataJson: {
      optimizationType: "SKU_OPTIMIZATION",
      generatedSnapshotCount: decisionSnapshots.generated.length
    }
  };
}

export async function recoverAsyncJobs(
  options: {
    client?: PrismaClient;
    workspaceId?: string;
    limit?: number;
  } = {}
) {
  const client = options.client ?? prisma;
  const limit = Math.max(1, Math.min(options.limit ?? 10, DEFAULT_MAX_RECOVERY_BATCH));
  const bridgedIngestionJobs = await enqueueMissingIngestionAsyncJobs(client, {
    workspaceId: options.workspaceId,
    limit
  });
  const jobs = await client.asyncJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      status: {
        notIn: ["COMPLETED", "CANCELLED"]
      },
      OR: [
        staleQueuedJobWhere(),
        staleResumableJobWhere(),
        {
          status: "FAILED"
        }
      ]
    },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      status: true,
      progress: true,
      currentStep: true,
      retryCount: true,
      maxRetries: true,
      heartbeatAt: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit
  });
  const results = [];

  for (const job of [
    ...bridgedIngestionJobs,
    ...jobs.filter((item) => item.status !== "FAILED" || item.retryCount < item.maxRetries)
  ]) {
    const result = await processJob(job.id, { client });
    results.push({
      job,
      result
    });
  }

  return {
    recovered: results.filter((item) => item.result.ok).length,
    attempted: results.length,
    bridgedIngestionJobs: bridgedIngestionJobs.length,
    results
  };
}

async function enqueueMissingIngestionAsyncJobs(
  client: PrismaClient,
  options: {
    workspaceId?: string;
    limit: number;
  }
) {
  const ingestionJobs = await client.unifiedIngestionJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...retryableIngestionJobWhere()
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      status: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: options.limit
  });

  if (!ingestionJobs.length) return [];

  const existingAsyncJobs = await client.asyncJob.findMany({
    where: {
      workspaceId: {
        in: Array.from(new Set(ingestionJobs.map((job) => job.workspaceId)))
      },
      type: "INGESTION",
      status: {
        notIn: ["CANCELLED"]
      }
    },
    select: {
      payload: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 500
  });
  const coveredIngestionJobIds = new Set(
    existingAsyncJobs
      .map((job) => asRecord(job.payload).unifiedIngestionJobId)
      .filter((value): value is string => typeof value === "string")
  );
  const createdJobs = [];

  for (const ingestionJob of ingestionJobs) {
    if (coveredIngestionJobIds.has(ingestionJob.id)) continue;

    const asyncJob = await createAsyncJob(client, {
      workspaceId: ingestionJob.workspaceId,
      type: "INGESTION",
      currentStep: "Recovered legacy ingestion job",
      payload: {
        unifiedIngestionJobId: ingestionJob.id,
        dataSourceId: ingestionJob.dataSourceId
      } as Prisma.InputJsonValue
    });
    createdJobs.push({
      id: asyncJob.id,
      workspaceId: asyncJob.workspaceId,
      type: asyncJob.type,
      status: asyncJob.status,
      progress: asyncJob.progress,
      currentStep: asyncJob.currentStep,
      errorMessage: asyncJob.errorMessage,
      retryCount: asyncJob.retryCount,
      maxRetries: asyncJob.maxRetries,
      heartbeatAt: asyncJob.heartbeatAt,
      updatedAt: asyncJob.updatedAt
    });
  }

  return createdJobs;
}
