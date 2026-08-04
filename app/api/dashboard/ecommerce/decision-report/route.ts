import { after, NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { decisionSnapshotFreshness } from "@/lib/dashboard/decision-snapshot-lifecycle";
import {
  findLatestDecisionSnapshot,
  snapshotPerformance
} from "@/lib/dashboard/snapshot-store";
import {
  findOptimizationReportCache,
  optimizationReportCachePayload
} from "@/lib/dashboard/optimization-report-cache";
import {
  enqueueSkuOptimizationJob,
  processJob,
  recoverAsyncJobs,
  SKU_OPTIMIZATION_STALE_JOB_MS
} from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but operating reports need sales/order history, order line items, refunds, customers, inventory, unit costs, fulfillment costs, and ad spend to generate reliable KPIs and recommendations.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateToIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

function isPendingOptimizationStatus(status: string | null | undefined) {
  return status === "QUEUED" || status === "PROCESSING" || status === "PAUSED";
}

function cacheNeedsOptimizationRefresh(payload: unknown) {
  const record = asRecord(payload);
  const state = typeof record.state === "string" ? record.state : null;
  const report = asRecord(record.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];

  return state !== "ready" || (decisionRows.length === 0 && portfolioRows.length === 0);
}

async function hasReadyCanonicalSources(workspaceId: string) {
  const readySnapshots = await prisma.schemaSnapshot.count({
    where: {
      workspaceId,
      dataSourceId: { not: null },
      canonicalStatus: "READY",
      canonicalVersion: { not: null },
      dataSource: {
        isActive: true,
        status: "CONNECTED"
      }
    }
  });

  return readySnapshots > 0;
}

async function latestOptimizationJob(workspaceId: string) {
  const jobs = await prisma.asyncJob.findMany({
    where: {
      workspaceId,
      type: "SKU_OPTIMIZATION",
      status: {
        in: ["QUEUED", "PROCESSING", "PAUSED"]
      }
    },
    select: {
      id: true,
      status: true,
      currentStep: true,
      heartbeatAt: true,
      startedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 10
  });

  const queued = jobs.find((job) => job.status === "QUEUED");
  if (queued) return queued;

  const staleBefore = new Date(Date.now() - SKU_OPTIMIZATION_STALE_JOB_MS);
  return jobs.find((job) => {
    const heartbeat = job.heartbeatAt ?? job.startedAt ?? job.lockedAt ?? job.updatedAt ?? job.createdAt;
    return heartbeat >= staleBefore;
  }) ?? null;
}

function queuedOptimizationResponse(input: {
  payload?: Record<string, unknown>;
  jobId: string;
  status: string;
  currentStep?: string | null;
  message: string;
  startedAt: number;
}) {
  return NextResponse.json({
    ...(input.payload ?? {}),
    ok: true,
    state: "processing",
    status: input.status,
    latestSnapshot: false,
    message: input.message,
    jobId: input.jobId,
    decision_report: null,
    portfolioSummary: null,
    allocationRecommendation: null,
    skuDecisions: [],
    riskAlerts: [],
    executionPlan: [],
    optimizationRun: {
      ...asRecord(input.payload?.optimizationRun),
      optimization_run_id: input.jobId,
      current_step: input.currentStep ?? null
    },
    performance: snapshotPerformance(input.startedAt, "snapshot")
  });
}

function processQueuedOptimizationJob(job: { id: string; status: string }) {
  if (job.status !== "QUEUED") return;

  after(() => {
    void processJob(job.id).catch((error) => {
      console.error("Failed to process queued decision report optimization job", error);
    });
  });
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const decisionMode = url.searchParams.get("mode") === "sku" ? "sku" : "full";
  const optimizationType = decisionMode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION";

  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] dashboard.ecommerce.decision-report.GET", session);
  after(() => {
    void recoverAsyncJobs({ workspaceId: session.workspace.id, limit: 5 }).catch((error) => {
      console.error("Failed to recover stale optimization jobs from decision report route", error);
    });
  });

  const reportCache = await findOptimizationReportCache(prisma, {
    workspaceId: session.workspace.id,
    mode: decisionMode
  });

  if (reportCache) {
    const cachedPayload = optimizationReportCachePayload(reportCache);
    if (cacheNeedsOptimizationRefresh(cachedPayload) && await hasReadyCanonicalSources(session.workspace.id)) {
      let job = await latestOptimizationJob(session.workspace.id);

      if (!job || !isPendingOptimizationStatus(job.status)) {
        const queuedJob = await enqueueSkuOptimizationJob(prisma, {
          workspaceId: session.workspace.id,
          reason: `non_ready_decision_report_cache:${reportCache.state || "unknown"}`,
          decisionMode,
          inputHash: reportCache.inputHash
        });
        job = queuedJob;

        after(() => {
          void processJob(queuedJob.id).catch((error) => {
            console.error("Failed to process non-ready decision report cache refresh job", error);
          });
        });
      }
      processQueuedOptimizationJob(job);

      return queuedOptimizationResponse({
        payload: cachedPayload,
        jobId: job.id,
        status: job.status,
        currentStep: job.currentStep,
        message: "Optimization data is ready and a decision analysis refresh is running.",
        startedAt
      });
    }

    if (cachedOptimizationReportMissingOpsRows(cachedPayload)) {
      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: "invalid_decision_report_cache:missing_ops_rows",
        decisionMode,
        inputHash: reportCache.inputHash
      });

      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process invalid decision report cache refresh job", error);
        });
      });

      return NextResponse.json({
        ...cachedPayload,
        ok: true,
        state: "stale",
        status: "STALE",
        latestSnapshot: false,
        message: "Optimization snapshot is missing SKU operating rows. A refresh job has been queued.",
        staleReason: "missing_ops_rows",
        jobId: job.id,
        snapshot: {
          id: reportCache.id,
          type: "OptimizationReportCache",
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          createdAt: dateToIso(reportCache.createdAt),
          updatedAt: dateToIso(reportCache.updatedAt),
          stale: true
        },
        performance: snapshotPerformance(startedAt, "snapshot")
      });
    }

    const freshness = await decisionSnapshotFreshness(prisma, {
      workspaceId: session.workspace.id,
      snapshot: {
        algorithmVersion: reportCache.algorithmVersion,
        optimizationVersion: reportCache.optimizationVersion,
        canonicalSnapshotVersion: reportCache.canonicalSnapshotVersion,
        metricSnapshotVersion: reportCache.metricSnapshotVersion,
        simulationVersion: reportCache.simulationVersion,
        inputHash: reportCache.inputHash
      }
    });

    if (!freshness.isFresh) {
      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_report_cache:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process stale decision report cache refresh job", error);
        });
      });

      return NextResponse.json({
        ...cachedPayload,
        ok: true,
        state: "stale",
        status: "STALE",
        latestSnapshot: false,
        message: "Optimization snapshot is stale. A refresh job has been queued.",
        staleReason: freshness.reason,
        jobId: job.id,
        currentVersions: freshness.current,
        snapshot: {
          id: reportCache.id,
          type: "OptimizationReportCache",
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          createdAt: dateToIso(reportCache.createdAt),
          updatedAt: dateToIso(reportCache.updatedAt),
          stale: true
        },
        performance: snapshotPerformance(startedAt, "snapshot")
      });
    }

    return NextResponse.json({
      ...cachedPayload,
      snapshot: {
        id: reportCache.id,
        type: "OptimizationReportCache",
        sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
        createdAt: dateToIso(reportCache.createdAt),
        updatedAt: dateToIso(reportCache.updatedAt),
        latestSnapshot: true
      },
      performance: snapshotPerformance(startedAt, "snapshot")
    });
  }

  const snapshot = await findLatestDecisionSnapshot(prisma, {
    workspaceId: session.workspace.id,
    optimizationType
  });

  const recommendationsJson = asRecord(snapshot?.recommendationsJson);

  if (snapshot && Object.keys(recommendationsJson).length) {
    const freshness = await decisionSnapshotFreshness(prisma, {
      workspaceId: session.workspace.id,
      snapshot: {
        algorithmVersion: typeof snapshot.algorithmVersion === "string" ? snapshot.algorithmVersion : null,
        optimizationVersion: typeof snapshot.optimizationVersion === "string" ? snapshot.optimizationVersion : null,
        canonicalSnapshotVersion: typeof snapshot.canonicalSnapshotVersion === "string" ? snapshot.canonicalSnapshotVersion : null,
        metricSnapshotVersion: typeof snapshot.metricSnapshotVersion === "string" ? snapshot.metricSnapshotVersion : null,
        simulationVersion: typeof snapshot.simulationVersion === "string" ? snapshot.simulationVersion : null,
        inputHash: typeof snapshot.inputHash === "string" ? snapshot.inputHash : null
      }
    });

    if (!freshness.isFresh) {
      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_snapshot:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process stale decision snapshot refresh job", error);
        });
      });

      return NextResponse.json({
        ...recommendationsJson,
        ok: true,
        state: "stale",
        status: "STALE",
        latestSnapshot: false,
        message: "Optimization snapshot is stale. A refresh job has been queued.",
        staleReason: freshness.reason,
        jobId: job.id,
        currentVersions: freshness.current,
        snapshot: {
          id: snapshot.id,
          type: "DecisionSnapshot",
          createdAt: dateToIso(snapshot.createdAt),
          stale: true
        },
        performance: snapshotPerformance(startedAt, "snapshot")
      });
    }

    return NextResponse.json({
      ...recommendationsJson,
      snapshot: {
        id: snapshot.id,
        type: "DecisionSnapshot",
        createdAt: dateToIso(snapshot.createdAt),
        latestSnapshot: true,
        algorithmVersion: snapshot.algorithmVersion,
        optimizationVersion: snapshot.optimizationVersion,
        canonicalSnapshotVersion: snapshot.canonicalSnapshotVersion,
        metricSnapshotVersion: snapshot.metricSnapshotVersion,
        simulationVersion: snapshot.simulationVersion,
        inputHash: snapshot.inputHash,
        generatedAt: snapshot.generatedAt instanceof Date ? snapshot.generatedAt.toISOString() : null
      },
      performance: snapshotPerformance(startedAt, "snapshot")
    });
  }

  if (await hasReadyCanonicalSources(session.workspace.id)) {
    let job = await latestOptimizationJob(session.workspace.id);

    if (!job || !isPendingOptimizationStatus(job.status)) {
      const queuedJob = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: "decision_snapshot_missing_with_ready_sources",
        decisionMode,
        inputHash: null
      });
      job = queuedJob;

      after(() => {
        void processJob(queuedJob.id).catch((error) => {
          console.error("Failed to process missing decision snapshot refresh job", error);
        });
      });
    }
    processQueuedOptimizationJob(job);

    return queuedOptimizationResponse({
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      message: "Optimization data is ready and a decision analysis refresh is running.",
      startedAt
    });
  }

  return NextResponse.json({
    ok: true,
    state: "empty",
    hasConnectedDataSource: false,
    message: OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE,
    decision_report: null,
    portfolioSummary: null,
    allocationRecommendation: null,
    skuDecisions: [],
    riskAlerts: [],
    executionPlan: [],
    generated_at: null,
    source_platforms: [],
    lineage: null,
    missingDataRequirements: [
      "sales_order_history",
      "order_line_items",
      "refunds",
      "customers",
      "inventory",
      "unit_costs",
      "fulfillment_costs",
      "ad_spend"
    ],
    warning: "DECISION_SNAPSHOT_MISS",
    performance: snapshotPerformance(startedAt, "snapshot")
  });
}

function cachedOptimizationReportMissingOpsRows(payload: unknown) {
  const record = asRecord(payload);
  const report = asRecord(record.decision_report);
  const breakdown = asRecord(report.sku_breakdown);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const topRevenueSkus = Array.isArray(breakdown.top_revenue_skus) ? breakdown.top_revenue_skus : [];
  const topProfitSkus = Array.isArray(breakdown.top_profit_skus) ? breakdown.top_profit_skus : [];
  const decisionRows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];

  return (decisionRows.length > 0 || portfolioRows.length > 0) && topRevenueSkus.length === 0 && topProfitSkus.length === 0;
}
