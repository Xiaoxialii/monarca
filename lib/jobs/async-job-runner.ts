import { Prisma, type PrismaClient } from "@prisma/client";
import {
  currentDecisionSnapshotVersions,
  METRIC_SNAPSHOT_VERSION
} from "@/lib/dashboard/decision-snapshot-lifecycle";
import { markDashboardCachesStale } from "@/lib/dashboard/cache-lifecycle";
import { generateEcommerceDecisionSnapshots } from "@/lib/dashboard/decision-snapshot-generator";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { processIngestionJob, retryableIngestionJobWhere } from "@/lib/ingestion/unified-ingestion-worker";
import { prisma } from "@/lib/prisma";
import { normalizeProfitInputs } from "@/lib/profit/profit-input-normalizer";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { runShopifyProductionSync } from "@/lib/ecommerce-connectors/providers/shopify-sync-engine";
import { SHOPIFY_PROVIDER } from "@/lib/ecommerce-connectors/shopify-oauth";
import { markShopifyScheduledSyncFailure } from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import { AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import { runAmazonProductionSync } from "@/lib/connectors/amazon/amazon-sync";
import { GOOGLE_ADS_PROVIDER } from "@/lib/connectors/google-ads/google-ads-errors";
import { runGoogleAdsProductionSync } from "@/lib/connectors/google-ads/google-ads-sync";
import {
  collectDecisionExecutionMetric,
  evaluateDecisionOutcome
} from "@/lib/decision-outcome/closed-loop-service";
import { optimizationReadiness } from "@/lib/dashboard/optimization-readiness";

export const ASYNC_JOB_TYPES = [
  "INGESTION",
  "SYNC_CONNECTOR",
  "CALCULATE_METRICS",
  "PROFIT_ANALYSIS",
  "GENERATE_REPORT",
  "GENERATE_INSIGHT",
  "SKU_OPTIMIZATION",
  "SIMULATION",
  "DECISION_OUTCOME_COLLECTOR",
  "DECISION_EVALUATOR",
  "DECISION_LEARNING_UPDATER"
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
const DEFAULT_STALE_ASYNC_JOB_MS = 2 * 60 * 1000;
const DEFAULT_SKU_OPTIMIZATION_STALE_JOB_MS = 10 * 60 * 1000;
const DEFAULT_QUEUED_ASYNC_JOB_MS = 2 * 60 * 1000;
const DEFAULT_OPTIMIZATION_QUEUED_ASYNC_JOB_MS = 15 * 60 * 1000;
const DEFAULT_OPTIMIZATION_MAX_EXECUTION_MS = 8 * 60 * 1000;
const DEFAULT_ASYNC_JOB_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_ASYNC_JOB_WORKER_BATCH_SIZE = 3;
const DEFAULT_ASYNC_JOB_EXECUTION_BUDGET_MS = 45 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_MAX_RECOVERY_BATCH = 25;

export type AsyncJobType = typeof ASYNC_JOB_TYPES[number];
type AsyncJobStatus = typeof ASYNC_JOB_STATUSES[number];

type AsyncJobPayload = {
  unifiedIngestionJobId?: string;
  ingestionJobId?: string;
  dataSourceId?: string;
  schemaSnapshotId?: string;
  recommendationId?: string;
  actionId?: string;
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

type ProcessBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  skipped: number;
  durationMs: number;
  results: Array<Awaited<ReturnType<typeof processJob>>>;
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

export const SKU_OPTIMIZATION_STALE_JOB_MS = configuredDurationMs(
  process.env.OPTIMIZATION_HEARTBEAT_STALE_MS ?? process.env.SKU_OPTIMIZATION_JOB_STALE_MS,
  DEFAULT_SKU_OPTIMIZATION_STALE_JOB_MS
);

export const OPTIMIZATION_QUEUED_ASYNC_JOB_MS = configuredDurationMs(
  process.env.OPTIMIZATION_QUEUED_STALE_MS,
  DEFAULT_OPTIMIZATION_QUEUED_ASYNC_JOB_MS
);

export const OPTIMIZATION_MAX_EXECUTION_MS = configuredDurationMs(
  process.env.OPTIMIZATION_MAX_EXECUTION_MS,
  DEFAULT_OPTIMIZATION_MAX_EXECUTION_MS
);

export const ASYNC_JOB_LEASE_MS = configuredDurationMs(
  process.env.ASYNC_JOB_LEASE_MS,
  DEFAULT_ASYNC_JOB_LEASE_MS
);

export const ASYNC_JOB_WORKER_BATCH_SIZE = Math.max(
  1,
  Math.min(
    Number.isFinite(Number(process.env.ASYNC_JOB_BATCH_SIZE))
      ? Number(process.env.ASYNC_JOB_BATCH_SIZE)
      : DEFAULT_ASYNC_JOB_WORKER_BATCH_SIZE,
    10
  )
);

export const ASYNC_JOB_EXECUTION_BUDGET_MS = configuredDurationMs(
  process.env.ASYNC_JOB_EXECUTION_BUDGET_MS,
  DEFAULT_ASYNC_JOB_EXECUTION_BUDGET_MS
);

const HEARTBEAT_INTERVAL_MS = configuredDurationMs(
  process.env.OPTIMIZATION_HEARTBEAT_INTERVAL_MS ?? process.env.ASYNC_JOB_HEARTBEAT_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS
);

function workerId() {
  return `async-job-worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function errorCodeFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/CANONICAL_ARTIFACT_UNREADABLE/i.test(message)) return "CANONICAL_ARTIFACT_UNREADABLE";
  if (/CANONICAL_ARTIFACT_KEY_MISSING/i.test(message)) return "CANONICAL_ARTIFACT_KEY_MISSING";
  if (/NO_READY_CANONICAL_SNAPSHOT|No READY ecommerce canonical snapshot/i.test(message)) return "CANONICAL_NOT_READY";
  if (/R2 storage is not configured|R2_CONFIGURATION_MISSING/i.test(message)) return "CANONICAL_ARTIFACT_UNREADABLE";
  if (/specified key does not exist|NoSuchKey|not found|ENOENT/i.test(message)) return "CANONICAL_ARTIFACT_NOT_FOUND";
  if (/database|prisma|P1001|connection/i.test(message)) return "DATABASE_UNAVAILABLE";
  return "ASYNC_JOB_FAILED";
}

function staleBeforeDate(now = new Date()) {
  return new Date(now.getTime() - STALE_ASYNC_JOB_MS);
}

function queuedBeforeDate(now = new Date()) {
  return new Date(now.getTime() - QUEUED_ASYNC_JOB_MS);
}

function optimizationQueuedBeforeDate(now = new Date()) {
  return new Date(now.getTime() - OPTIMIZATION_QUEUED_ASYNC_JOB_MS);
}

function skuOptimizationStaleBeforeDate(now = new Date()) {
  return new Date(now.getTime() - SKU_OPTIMIZATION_STALE_JOB_MS);
}

function staleQueuedJobWhere(now = new Date()) {
  return {
    status: "QUEUED",
    updatedAt: {
      lt: queuedBeforeDate(now)
    }
  };
}

function staleOptimizationQueuedJobWhere(now = new Date()) {
  return {
    status: "QUEUED",
    type: "SKU_OPTIMIZATION",
    updatedAt: {
      lt: optimizationQueuedBeforeDate(now)
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

function staleSkuOptimizationResumableJobWhere(now = new Date()) {
  const staleBefore = skuOptimizationStaleBeforeDate(now);
  return {
    type: "SKU_OPTIMIZATION",
    status: {
      in: [...RESUMABLE_ASYNC_JOB_STATUSES]
    },
    OR: [
      { leaseExpiresAt: { lt: now } },
      {
        leaseExpiresAt: null,
        heartbeatAt: {
          lt: staleBefore
        }
      },
      {
        leaseExpiresAt: null,
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

function activeJobHeartbeatDate(job: {
  heartbeatAt: Date | null;
  startedAt: Date | null;
  lockedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}) {
  return job.heartbeatAt ?? job.startedAt ?? job.lockedAt ?? job.updatedAt ?? job.createdAt;
}

function isStaleSkuOptimizationJob(job: {
  status: string;
  heartbeatAt: Date | null;
  startedAt: Date | null;
  lockedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}, now = new Date()) {
  if (job.status !== "PROCESSING" && job.status !== "PAUSED") return false;
  return activeJobHeartbeatDate(job) < skuOptimizationStaleBeforeDate(now);
}

function startHeartbeat(
  client: PrismaClient,
  jobId: string,
  owner: string,
  getState: () => { currentStep: string | null; progress: number }
) {
  const interval = setInterval(() => {
    const now = new Date();
    const state = getState();
    void client.asyncJob.updateMany({
      where: {
        id: jobId,
        lockedBy: owner,
        status: {
          in: [...ACTIVE_ASYNC_JOB_STATUSES]
        }
      },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + ASYNC_JOB_LEASE_MS),
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

async function jobLeaseStillOwned(client: PrismaClient, jobId: string, owner: string) {
  const job = await client.asyncJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      lockedBy: true,
      leaseExpiresAt: true
    }
  });
  return Boolean(
    job?.status === "PROCESSING" &&
    job.lockedBy === owner &&
    (!job.leaseExpiresAt || job.leaseExpiresAt > new Date())
  );
}

async function updateJob(
  client: PrismaClient,
  jobId: string,
  data: {
    status?: AsyncJobStatus;
    progress?: number;
    currentStep?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    resultReference?: Prisma.InputJsonValue;
    heartbeatAt?: Date | null;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    leaseExpiresAt?: Date | null;
    completedAt?: Date | null;
    failedAt?: Date | null;
  },
  owner?: string
) {
  await client.asyncJob.updateMany({
    where: {
      id: jobId,
      ...(owner ? { lockedBy: owner } : {})
    },
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
    identity?: string | null;
    payload?: Prisma.InputJsonValue | null;
    maxRetries?: number;
    currentStep?: string;
  }
) {
  return client.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      identity: input.identity ?? undefined,
      status: "QUEUED",
      progress: 0,
      currentStep: input.currentStep ?? "Queued",
      payload: input.payload ?? undefined,
      maxRetries: input.maxRetries ?? 3
    }
  });
}

function optimizationJobIdentity(input: {
  decisionMode?: "full" | "sku" | null;
  inputHash?: string | null;
}) {
  const mode = input.decisionMode ?? "all";
  const inputHash = input.inputHash?.trim() || "no-input-hash";
  return `optimization:${mode}:${inputHash}`;
}

export async function enqueueSkuOptimizationJob(
  client: PrismaClient,
  input: {
    workspaceId: string;
    reason?: string;
    decisionMode?: "full" | "sku";
    triggerDataSourceId?: string | null;
    schemaSnapshotId?: string | null;
    inputHash?: string | null;
  }
) {
  const identity = optimizationJobIdentity(input);
  const existingJobs = await client.asyncJob.findMany({
    where: {
      workspaceId: input.workspaceId,
      type: "SKU_OPTIMIZATION",
      identity
    },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      identity: true,
      status: true,
      progress: true,
      currentStep: true,
      payload: true,
      resultReference: true,
      errorCode: true,
      errorMessage: true,
      retryCount: true,
      maxRetries: true,
      heartbeatAt: true,
      leaseExpiresAt: true,
      lockedAt: true,
      lockedBy: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const now = new Date();
  for (const existing of existingJobs) {
    if (existing.status === "COMPLETED") return existing;

    if (existing.status === "QUEUED") {
      if (existing.updatedAt >= optimizationQueuedBeforeDate(now)) return existing;

      await client.asyncJob.updateMany({
        where: {
          id: existing.id,
          status: "QUEUED"
        },
        data: {
          status: "FAILED",
          progress: 100,
          currentStep: "Failed - stale queued optimization job",
          errorCode: "JOB_QUEUE_TIMEOUT",
          errorMessage: `Superseded because SKU optimization stayed queued for more than ${Math.round(OPTIMIZATION_QUEUED_ASYNC_JOB_MS / 60000)} minutes.`,
          heartbeatAt: now,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
          retryCount: existing.maxRetries,
          completedAt: now,
          failedAt: now
        }
      });
      continue;
    }

    if (!isStaleSkuOptimizationJob(existing, now)) return existing;

    await client.asyncJob.updateMany({
      where: {
        id: existing.id,
        status: {
          in: ["PROCESSING", "PAUSED"]
        }
      },
      data: {
        status: "FAILED",
        progress: 100,
        currentStep: "Failed - stale optimization job heartbeat",
        errorCode: "JOB_HEARTBEAT_TIMEOUT",
        errorMessage: `Superseded because SKU optimization heartbeat was stale for more than ${Math.round(SKU_OPTIMIZATION_STALE_JOB_MS / 60000)} minutes.`,
        heartbeatAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        retryCount: existing.maxRetries,
        completedAt: now,
        failedAt: now
      }
    });

    continue;
  }

  const retryableFailed = existingJobs.find((job) => job.status === "FAILED" && job.retryCount < job.maxRetries);
  if (retryableFailed) {
    await client.asyncJob.update({
      where: { id: retryableFailed.id },
      data: {
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued for decision optimization retry",
        errorCode: null,
        errorMessage: null,
        resultReference: Prisma.DbNull,
        heartbeatAt: null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        payload: {
          reason: input.reason ?? "retry_optimization_refresh",
          decisionMode: input.decisionMode ?? null,
          triggerDataSourceId: input.triggerDataSourceId ?? null,
          schemaSnapshotId: input.schemaSnapshotId ?? null,
          inputHash: input.inputHash ?? null
        } as Prisma.InputJsonValue
      }
    });
    const retried = await client.asyncJob.findUnique({ where: { id: retryableFailed.id } });
    if (retried) return retried;
  }

  try {
    return await createAsyncJob(client, {
      workspaceId: input.workspaceId,
      type: "SKU_OPTIMIZATION",
      identity,
      currentStep: "Queued for decision optimization",
      payload: {
        reason: input.reason ?? "manual_or_freshness_refresh",
        decisionMode: input.decisionMode ?? null,
        triggerDataSourceId: input.triggerDataSourceId ?? null,
        schemaSnapshotId: input.schemaSnapshotId ?? null,
        inputHash: input.inputHash ?? null
      } as Prisma.InputJsonValue
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await client.asyncJob.findFirst({
        where: {
          workspaceId: input.workspaceId,
          type: "SKU_OPTIMIZATION",
          identity
        },
        orderBy: { createdAt: "desc" }
      });
      if (existing) return existing;
    }
    throw error;
  }
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
      type: true,
      status: true,
      retryCount: true,
      maxRetries: true,
      leaseExpiresAt: true
    }
  });
  const shouldIncrementRetryCount = Boolean(previousJob && previousJob.status !== "QUEUED");
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + ASYNC_JOB_LEASE_MS);
  const resumableWhere = previousJob?.type === "SKU_OPTIMIZATION"
    ? {
      status: {
        in: [...RESUMABLE_ASYNC_JOB_STATUSES]
      },
      OR: [
        { leaseExpiresAt: { lt: now } },
        { leaseExpiresAt: null, heartbeatAt: { lt: skuOptimizationStaleBeforeDate(now) } },
        { leaseExpiresAt: null, heartbeatAt: null, updatedAt: { lt: skuOptimizationStaleBeforeDate(now) } }
      ]
    }
    : staleResumableJobWhere(now);

  const lock = await client.asyncJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: "QUEUED" },
        resumableWhere,
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
      errorCode: null,
      errorMessage: null,
      heartbeatAt: now,
      lockedAt: now,
      lockedBy: owner,
      leaseExpiresAt,
      retryCount: {
        increment: shouldIncrementRetryCount ? 1 : 0
      },
      startedAt: previousJob?.status === "PROCESSING" ? undefined : now,
      completedAt: null,
      failedAt: null
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
  const stopHeartbeat = startHeartbeat(client, jobId, owner, () => ({
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
    await updateJob(client, jobId, data, owner);
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
      const leaseStillOwned = await jobLeaseStillOwned(client, jobId, owner);
      if (!leaseStillOwned) {
        stopJobHeartbeat();
        return { ok: false, skipped: true, reason: "Job lease was lost before result publication." };
      }
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
      leaseExpiresAt: null,
      completedAt: new Date(),
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      resultReference: resultReference as Prisma.InputJsonValue
    }, owner);

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
      errorCode: errorCodeFromError(error),
      errorMessage: message,
      heartbeatAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      failedAt: new Date()
    }, owner).catch((jobError) => {
      console.error("Failed to mark async job failure", jobError);
    });

    return { ok: false, jobId, error: message };
  } finally {
    stopJobHeartbeat();
  }
}

export async function processAsyncJobBatch(options: {
  client?: PrismaClient;
  jobId?: string | null;
  jobType?: AsyncJobType | null;
  limit?: number;
  budgetMs?: number;
} = {}): Promise<ProcessBatchResult> {
  const client = options.client ?? prisma;
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? ASYNC_JOB_EXECUTION_BUDGET_MS;
  const limit = Math.max(1, Math.min(options.limit ?? ASYNC_JOB_WORKER_BATCH_SIZE, 10));
  const results: ProcessBatchResult["results"] = [];

  const candidateJobs = options.jobId
    ? await client.asyncJob.findMany({
        where: { id: options.jobId },
        select: { id: true },
        take: 1
      })
    : await client.asyncJob.findMany({
        where: {
          status: "QUEUED",
          ...(options.jobType ? { type: options.jobType } : {})
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: limit
      });

  for (const candidate of candidateJobs) {
    if (Date.now() - startedAt > budgetMs - 5_000) break;
    const result = await processJob(candidate.id, { client }).catch((error) => ({
      ok: false,
      jobId: candidate.id,
      error: error instanceof Error ? error.message : "Async job processing failed."
    }));
    results.push(result);
  }

  const completed = results.filter((result) => result.ok).length;
  const skipped = results.filter((result) => "skipped" in result && result.skipped).length;
  const failed = results.length - completed - skipped;

  return {
    claimed: results.length - skipped,
    completed,
    failed,
    retried: 0,
    skipped,
    durationMs: Date.now() - startedAt,
    results
  };
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
    case "SYNC_CONNECTOR":
      return processConnectorSyncAsyncJob(client, input);
    case "CALCULATE_METRICS":
      return processMetricCalculationAsyncJob(client, input);
    case "PROFIT_ANALYSIS":
      return processProfitAnalysisAsyncJob(client, input);
    case "SKU_OPTIMIZATION":
      return processSkuOptimizationAsyncJob(client, input);
    case "DECISION_OUTCOME_COLLECTOR":
      return processDecisionOutcomeCollectorJob(client, input);
    case "DECISION_EVALUATOR":
      return processDecisionEvaluatorJob(client, input);
    case "DECISION_LEARNING_UPDATER":
      return processDecisionLearningUpdaterJob(client, input);
    case "GENERATE_REPORT":
    case "GENERATE_INSIGHT":
    case "SIMULATION":
      throw new Error(`${input.type} handler is registered but has not been migrated to AsyncJob yet.`);
  }
}

async function processConnectorSyncAsyncJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const provider = typeof input.payload.provider === "string" ? input.payload.provider : null;
  const dataSourceId = typeof input.payload.dataSourceId === "string" ? input.payload.dataSourceId : null;
  const connectorAccountId = typeof input.payload.connectorAccountId === "string" ? input.payload.connectorAccountId : null;
  const shopDomain = typeof input.payload.shopDomain === "string" ? input.payload.shopDomain : null;
  const trigger = input.payload.trigger === "scheduled" ? "scheduled" : "manual";

  if (!provider || ![SHOPIFY_PROVIDER, AMAZON_PROVIDER, GOOGLE_ADS_PROVIDER].includes(provider) || !dataSourceId || !connectorAccountId || !shopDomain) {
    throw new Error("Connector sync job payload is incomplete.");
  }

  const account = await client.ecommerceConnectorAccount.findFirst({
    where: {
      id: connectorAccountId,
      workspaceId: input.workspaceId,
      provider,
      shopDomain,
      dataSourceId,
      dataSource: {
        id: dataSourceId,
        workspaceId: input.workspaceId,
        isActive: true
      }
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      shopDomain: true
    }
  });

  if (!account) {
    throw new Error(`${provider} connector account was not found for this workspace.`);
  }

  await input.setJobState({
    progress: 20,
    currentStep: `Running ${provider} sync`
  });

  const startedAt = Date.now();
  try {
    const result = provider === AMAZON_PROVIDER
      ? await runAmazonProductionSync(client, {
          workspaceId: input.workspaceId,
          dataSourceId,
          trigger,
          force: false
        })
      : provider === GOOGLE_ADS_PROVIDER
        ? await runGoogleAdsProductionSync(client, {
            workspaceId: input.workspaceId,
            dataSourceId,
            trigger,
            force: false
          })
        : await runShopifyProductionSync(client, {
            workspaceId: input.workspaceId,
            dataSourceId,
            trigger,
            force: false
          });
    const downstreamJobId = "downstreamJobId" in result ? result.downstreamJobId ?? null : null;
    const optimizationRefresh = result.reused
      ? {
          jobId: null,
          skipped: true,
          reason: "sync_reused_existing_result"
        }
      : await enqueueOptimizationRefreshAfterConnectorSync(client, {
          workspaceId: input.workspaceId,
          provider,
          dataSourceId,
          connectorJobId: input.id
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Failed to queue optimization refresh after connector sync.";
          console.warn("Connector sync succeeded but optimization refresh could not be queued", {
            workspaceId: input.workspaceId,
            provider,
            dataSourceId,
            connectorAccountId,
            shopDomain,
            connectorJobId: input.id,
            message
          });
          return {
            jobId: null,
            skipped: true,
            reason: "optimization_refresh_queue_failed",
            errorMessage: message
          };
        });

    console.info(provider === AMAZON_PROVIDER ? "AMAZON_SYNC_SUCCESS" : provider === GOOGLE_ADS_PROVIDER ? "GOOGLE_ADS_SYNC_SUCCESS" : "SHOPIFY_SYNC_SUCCESS", {
      workspaceId: input.workspaceId,
      dataSourceId,
      connectorAccountId,
      shopDomain,
      jobId: input.id,
      runId: result.syncRunId,
      optimizationRefreshJobId: optimizationRefresh.jobId,
      optimizationRefreshSkipped: optimizationRefresh.skipped,
      optimizationRefreshSkippedReason: optimizationRefresh.reason,
      durationMs: Date.now() - startedAt
    });

    return {
      snapshotType: "CONNECTOR_SYNC",
      snapshotVersion: `${provider}_sync_v1`,
      dataReference: {
        provider,
        dataSourceId,
        connectorAccountId,
        shopDomain,
        syncRunId: result.syncRunId,
        downstreamJobId,
        optimizationRefreshJobId: optimizationRefresh.jobId
      },
      metadataJson: {
        trigger,
        status: result.status,
        reused: result.reused ?? false,
        optimizationRefresh
      }
    };
  } catch (error) {
    console.error(provider === AMAZON_PROVIDER ? "AMAZON_SYNC_FAILED" : provider === GOOGLE_ADS_PROVIDER ? "GOOGLE_ADS_SYNC_FAILED" : "SHOPIFY_SYNC_FAILED", {
      workspaceId: input.workspaceId,
      dataSourceId,
      connectorAccountId,
      shopDomain,
      jobId: input.id,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : `${provider} sync failed`
    });

    if (trigger === "scheduled") {
      await markShopifyScheduledSyncFailure(client, {
        workspaceId: input.workspaceId,
        connectorAccountId,
        dataSourceId,
        shopDomain,
        provider,
        error
      });
    }

    throw error;
  }
}

async function enqueueOptimizationRefreshAfterConnectorSync(
  client: PrismaClient,
  input: {
    workspaceId: string;
    provider: string;
    dataSourceId: string;
    connectorJobId: string;
  }
) {
  const readiness = await optimizationReadiness(client, {
    workspaceId: input.workspaceId
  }).catch((error) => {
    console.warn("Failed to check optimization readiness after connector sync", {
      workspaceId: input.workspaceId,
      provider: input.provider,
      dataSourceId: input.dataSourceId,
      connectorJobId: input.connectorJobId,
      error
    });
    return null;
  });

  if (!readiness?.ready) {
    return {
      jobId: null,
      skipped: true,
      reason: readiness?.code ?? "optimization_not_ready",
      readiness
    };
  }

  const reason = `connector_sync:${input.provider}`;
  const [versions, staleSummary] = await Promise.all([
    currentDecisionSnapshotVersions(client, {
      workspaceId: input.workspaceId
    }),
    markDashboardCachesStale(client, {
      workspaceId: input.workspaceId,
      reason,
      invalidateOptimizationAssets: true
    })
  ]);

  const job = await enqueueSkuOptimizationJob(client, {
    workspaceId: input.workspaceId,
    reason,
    decisionMode: "full",
    triggerDataSourceId: input.dataSourceId,
    schemaSnapshotId: readiness.canonicalSnapshotId,
    inputHash: versions.inputHash
  });

  void processJob(job.id, { client }).catch((error) => {
    console.warn("Failed to process connector-triggered optimization job", {
      workspaceId: input.workspaceId,
      provider: input.provider,
      dataSourceId: input.dataSourceId,
      connectorJobId: input.connectorJobId,
      optimizationJobId: job.id,
      error
    });
  });

  return {
    jobId: job.id,
    skipped: false,
    reason,
    staleSummary,
    readiness,
    inputHash: versions.inputHash
  };
}

function dateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const decisionMode = input.payload.decisionMode === "full" || input.payload.decisionMode === "sku"
    ? input.payload.decisionMode
    : null;

  await input.setJobState({
    progress: 35,
    currentStep: "Checking canonical artifact availability"
  });

  const readiness = await optimizationReadiness(client, {
    workspaceId: input.workspaceId
  });
  if (!readiness.ready) {
    const message = readiness.message ?? "Connected data is not ready for optimization.";
    throw new Error(`${readiness.code ?? "CANONICAL_NOT_READY"}: ${message}`);
  }

  await input.setJobState({
    progress: 40,
    currentStep: "Generating decision snapshot"
  });

  const snapshotStartedAt = Date.now();
  const decisionSnapshots = await generateEcommerceDecisionSnapshots(client, {
    workspaceId: input.workspaceId,
    dataSourceId: null,
    sourceJobId: input.id,
    modes: decisionMode ? [decisionMode] : undefined
  });
  console.info("[sku-optimization-job]", {
    job_id: input.id,
    workspace_id: input.workspaceId,
    decision_mode: decisionMode ?? "all",
    generated_count: decisionSnapshots.generated.length,
    snapshot_duration_ms: Date.now() - snapshotStartedAt,
    timestamp: new Date().toISOString()
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

async function processDecisionOutcomeCollectorJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const targetRecommendationId = typeof input.payload.recommendationId === "string" ? input.payload.recommendationId : null;

  await input.setJobState({
    progress: 20,
    currentStep: "Finding executing decision actions"
  });

  const actions = await client.decisionAction.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "EXECUTING",
      recommendationId: targetRecommendationId ?? { not: null }
    },
    select: { id: true, recommendationId: true },
    take: targetRecommendationId ? 1 : 200,
    orderBy: { updatedAt: "asc" }
  });

  let collected = 0;
  for (const action of actions) {
    if (!action.recommendationId) continue;
    await collectDecisionExecutionMetric(client, {
      workspaceId: input.workspaceId,
      recommendationId: action.recommendationId,
      date: new Date()
    });
    collected += 1;
    await input.setJobState({
      progress: Math.min(85, 20 + Math.round((collected / Math.max(1, actions.length)) * 60)),
      currentStep: `Collected metrics for ${collected}/${actions.length} active decisions`
    });
  }

  return {
    dataReference: {
      collectedDecisionCount: collected,
      recommendationId: targetRecommendationId
    },
    metadataJson: {
      collectorVersion: "decision_outcome_collector_v1",
      collectedAt: new Date().toISOString()
    },
    nextJobs: [
      {
        type: "DECISION_EVALUATOR",
        currentStep: "Queued for decision outcome evaluation",
        payload: targetRecommendationId ? { recommendationId: targetRecommendationId } as Prisma.InputJsonValue : undefined
      }
    ]
  };
}

async function processDecisionEvaluatorJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const targetRecommendationId = typeof input.payload.recommendationId === "string" ? input.payload.recommendationId : null;

  await input.setJobState({
    progress: 20,
    currentStep: "Finding executing decisions ready for evaluation"
  });

  const actions = await client.decisionAction.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "EXECUTING",
      recommendationId: targetRecommendationId ?? { not: null }
    },
    select: { id: true, recommendationId: true, acceptedAt: true, executionStartedAt: true, actionPayload: true },
    take: targetRecommendationId ? 1 : 200,
    orderBy: { updatedAt: "asc" }
  });

  const now = dateOnly(new Date());
  let evaluated = 0;
  let skipped = 0;
  for (const action of actions) {
    if (!action.recommendationId) continue;
    const tracking = asRecord(asRecord(action.actionPayload).tracking);
    const windowDays = Math.max(1, numberFromUnknown(tracking.observation_window_days) ?? 30);
    const startedAt = action.executionStartedAt ?? action.acceptedAt ?? null;
    if (!targetRecommendationId && startedAt && dateOnly(addDays(startedAt, windowDays)) > now) {
      skipped += 1;
      continue;
    }

    await evaluateDecisionOutcome(client, {
      workspaceId: input.workspaceId,
      recommendationId: action.recommendationId,
      evaluationPeriodEnd: now
    });
    evaluated += 1;
    await input.setJobState({
      progress: Math.min(90, 20 + Math.round(((evaluated + skipped) / Math.max(1, actions.length)) * 65)),
      currentStep: `Evaluated ${evaluated}; skipped ${skipped}`
    });
  }

  return {
    dataReference: {
      evaluatedRecommendationCount: evaluated,
      skippedRecommendationCount: skipped,
      recommendationId: targetRecommendationId
    },
    metadataJson: {
      evaluatorVersion: "decision_evaluator_v1",
      evaluatedAt: new Date().toISOString()
    },
    nextJobs: evaluated > 0
      ? [
        {
          type: "DECISION_LEARNING_UPDATER",
          currentStep: "Queued for learning update",
          payload: targetRecommendationId ? { recommendationId: targetRecommendationId } as Prisma.InputJsonValue : undefined
        }
      ]
      : []
  };
}

async function processDecisionLearningUpdaterJob(
  client: PrismaClient,
  input: {
    id: string;
    workspaceId: string;
    payload: AsyncJobPayload;
    setJobState: (data: Parameters<typeof updateJob>[2]) => Promise<void>;
  }
): Promise<JobHandlerResult> {
  const targetRecommendationId = typeof input.payload.recommendationId === "string" ? input.payload.recommendationId : null;

  await input.setJobState({
    progress: 35,
    currentStep: "Marking evaluated recommendations as learned"
  });

  const updated = await client.optimizationDecision.updateMany({
    where: {
      workspaceId: input.workspaceId,
      ...(targetRecommendationId ? { id: targetRecommendationId } : {}),
      learningStatus: "READY_TO_LEARN",
      decisionLearnings: { some: {} }
    },
    data: { learningStatus: "LEARNED" }
  });

  await client.decisionAction.updateMany({
    where: {
      workspaceId: input.workspaceId,
      recommendation: {
        ...(targetRecommendationId ? { id: targetRecommendationId } : {}),
        learningStatus: "LEARNED"
      }
    },
    data: { status: "LEARNED" }
  });

  return {
    dataReference: {
      learnedRecommendationCount: updated.count,
      recommendationId: targetRecommendationId
    },
    metadataJson: {
      learningUpdaterVersion: "decision_learning_updater_v1",
      updatedAt: new Date().toISOString()
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
  const decisionIntelligenceJobs = await enqueueDecisionIntelligenceRuntimeJobs(client, {
    workspaceId: options.workspaceId
  });
  const jobs = await client.asyncJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      status: {
        notIn: ["COMPLETED", "CANCELLED"]
      },
      OR: [
        {
          ...staleQueuedJobWhere(),
          type: {
            not: "SKU_OPTIMIZATION"
          }
        },
        staleOptimizationQueuedJobWhere(),
        {
          ...staleResumableJobWhere(),
          type: {
            not: "SKU_OPTIMIZATION"
          }
        },
        staleSkuOptimizationResumableJobWhere(),
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
    ...decisionIntelligenceJobs,
    ...jobs.filter((item) => {
      if (item.type === "SKU_OPTIMIZATION" && item.status === "FAILED") return false;
      return item.status !== "FAILED" || item.retryCount < item.maxRetries;
    })
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
    decisionIntelligenceJobs: decisionIntelligenceJobs.length,
    results
  };
}

async function enqueueDecisionIntelligenceRuntimeJobs(
  client: PrismaClient,
  options: {
    workspaceId?: string;
  }
) {
  const workspaces = options.workspaceId
    ? [{ workspaceId: options.workspaceId }]
    : await client.decisionAction.findMany({
      where: { status: "EXECUTING" },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
      take: 100
    });
  const createdJobs = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const workspace of workspaces) {
    const activeDecisionCount = await client.decisionAction.count({
      where: {
        workspaceId: workspace.workspaceId,
        status: "EXECUTING"
      }
    });
    if (!activeDecisionCount) continue;

    for (const type of ["DECISION_OUTCOME_COLLECTOR", "DECISION_EVALUATOR"] as const) {
      const existing = await client.asyncJob.findFirst({
        where: {
          workspaceId: workspace.workspaceId,
          type,
          status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] },
          payload: {
            path: ["runtimeDate"],
            equals: today
          }
        },
        select: {
          id: true,
          workspaceId: true,
          type: true,
          status: true,
          progress: true,
          currentStep: true,
          errorMessage: true,
          retryCount: true,
          maxRetries: true,
          heartbeatAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: "desc" }
      });
      if (existing) continue;

      const job = await createAsyncJob(client, {
        workspaceId: workspace.workspaceId,
        type,
        currentStep: type === "DECISION_OUTCOME_COLLECTOR"
          ? "Queued for daily outcome metric collection"
          : "Queued for daily decision outcome evaluation",
        payload: {
          runtimeDate: today,
          source: "decision_intelligence_scheduler"
        } as Prisma.InputJsonValue
      });
      createdJobs.push({
        id: job.id,
        workspaceId: job.workspaceId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        heartbeatAt: job.heartbeatAt,
        updatedAt: job.updatedAt
      });
    }
  }

  return createdJobs;
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
        in: ["QUEUED", "PROCESSING", "PAUSED"]
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
