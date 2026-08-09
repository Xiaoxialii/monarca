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
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { canonicalArtifactAvailability } from "@/lib/dashboard/canonical-artifact-availability";
import { validateOptimizationData } from "@/lib/optimization/optimization-data-contract";
import {
  enqueueSkuOptimizationJob,
  processJob,
  recoverAsyncJobs,
  SKU_OPTIMIZATION_STALE_JOB_MS
} from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but optimization needs order id/date, SKU order items, revenue, unit cost/COGS, shipping cost, platform fee, payment fee, refunds, SKU-level ad spend, inventory on hand, and channel/platform fields to generate reliable profit lift.";

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

  return (
    state !== "ready" ||
    !Object.keys(report).length ||
    !Object.keys(optimization).length ||
    (decisionRows.length === 0 && portfolioRows.length === 0)
  );
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

async function optimizationRefreshAvailability(workspaceId: string) {
  if (!await hasReadyCanonicalSources(workspaceId)) {
    return {
      canRefresh: false,
      artifact: null
    };
  }

  const artifact = await canonicalArtifactAvailability(prisma, { workspaceId });
  return {
    canRefresh: artifact.available,
    artifact
  };
}

function unavailableCanonicalArtifactResponse(input: {
  payload?: Record<string, unknown>;
  cacheId?: string | null;
  cacheCreatedAt?: Date | null;
  cacheUpdatedAt?: Date | null;
  sourceDecisionSnapshotId?: string | null;
  artifact: Awaited<ReturnType<typeof canonicalArtifactAvailability>> | null;
  startedAt: number;
}) {
  return NextResponse.json({
    ...(input.payload ?? {}),
    ok: true,
    state: input.payload?.state ?? "unavailable",
    status: "UNAVAILABLE",
    latestSnapshot: Boolean(input.cacheId),
    message: input.artifact?.message ?? "Canonical ecommerce artifacts are unavailable. Refresh skipped.",
    refreshSkippedReason: "canonical_artifact_unavailable",
    artifactAvailability: input.artifact,
    jobId: null,
    snapshot: input.cacheId
      ? {
        id: input.cacheId,
        type: "OptimizationReportCache",
        sourceDecisionSnapshotId: input.sourceDecisionSnapshotId ?? null,
        createdAt: dateToIso(input.cacheCreatedAt),
        updatedAt: dateToIso(input.cacheUpdatedAt),
        latestSnapshot: true,
        refreshSkipped: true
      }
      : null,
    performance: snapshotPerformance(input.startedAt, "snapshot")
  });
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

async function processQueuedOptimizationJob(job: { id: string; status: string }): Promise<Awaited<ReturnType<typeof processJob>> | null> {
  if (job.status !== "QUEUED") return null;

  after(() => {
    void processJob(job.id).then((result) => {
      if (!result.ok && !result.skipped) {
        console.error("Failed to process queued decision report optimization job", result);
      }
    }).catch((error) => {
      console.error("Failed to process queued decision report optimization job", { jobId: job.id, error });
    });
  });

  return null;
}

async function freshOptimizationCacheResponse(input: {
  workspaceId: string;
  mode: "full" | "sku";
  startedAt: number;
}) {
  const refreshedCache = await findOptimizationReportCache(prisma, {
    workspaceId: input.workspaceId,
    mode: input.mode
  });
  if (!refreshedCache) return null;

  const refreshedPayload = optimizationReportCachePayload(refreshedCache);
  if (cacheNeedsOptimizationRefresh(refreshedPayload)) return null;

  return NextResponse.json({
    ...await withOptimizationReadiness(input.workspaceId, refreshedPayload),
    snapshot: {
      id: refreshedCache.id,
      type: "OptimizationReportCache",
      sourceDecisionSnapshotId: refreshedCache.sourceDecisionSnapshotId,
      createdAt: dateToIso(refreshedCache.createdAt),
      updatedAt: dateToIso(refreshedCache.updatedAt),
      latestSnapshot: true
    },
    performance: snapshotPerformance(input.startedAt, "snapshot")
  });
}

async function liveDecisionReportResponse(input: {
  workspaceId: string;
  mode: "full" | "sku";
  startedAt: number;
  message?: string;
}) {
  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId: input.workspaceId,
    decisionMode: input.mode
  }).catch((error) => ({
    state: "unavailable" as const,
    message: error instanceof Error ? error.message : "Ecommerce decision report data is unavailable.",
    data: null,
    lineage: null
  }));

  const decisionReport = loaded.data?.decision_report ?? null;
  if (loaded.state !== "ready" || !decisionReport) return null;

  const optimization = asRecord(decisionReport.sku_portfolio_optimization);
  const queueRows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];
  const optimizationReadiness = validateOptimizationData(loaded.data);

  return NextResponse.json({
    ok: true,
    state: "ready",
    status: "READY",
    latestSnapshot: false,
    hasConnectedDataSource: true,
    message: input.message ?? loaded.message ?? "Loaded current decision analysis from live canonical metrics.",
    decision_report: decisionReport,
    portfolioSummary: decisionReport.portfolioSummary ?? optimization.portfolioSummary ?? null,
    allocationRecommendation: decisionReport.allocationRecommendation ?? optimization.allocationRecommendation ?? null,
    skuDecisions: queueRows,
    riskAlerts: Array.isArray(decisionReport.riskAlerts) ? decisionReport.riskAlerts : [],
    executionPlan: Array.isArray(decisionReport.executionPlan) ? decisionReport.executionPlan : [],
    generated_at: loaded.data?.metadata.computed_at ?? null,
    source_platforms: loaded.data?.metadata.source_platforms ?? [],
    lineage: loaded.lineage,
    optimizationReadiness,
    optimizationReadinessDebug: readinessDebug(loaded, "current_canonical_metrics"),
    liveFallback: true,
    snapshot: {
      id: null,
      type: "LiveDecisionReport",
      latestSnapshot: false
    },
    performance: snapshotPerformance(input.startedAt, "snapshot"),
    debug: {
      queueRows: queueRows.length,
      portfolioRows: portfolioRows.length
    }
  });
}

async function withOptimizationReadiness(workspaceId: string, payload: Record<string, unknown>) {
  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId,
    decisionMode: "full"
  }).catch(() => null);
  const optimizationReadiness = loaded?.data ? validateOptimizationData(loaded.data) : null;

  return {
    ...payload,
    optimizationReadiness,
    optimizationReadinessDebug: readinessDebug(loaded, "cached_payload_with_current_canonical_metrics")
  };
}

function readinessDebug(
  loaded: Awaited<ReturnType<typeof loadEcommerceSalesDashboardData>> | null,
  source: "cached_payload_with_current_canonical_metrics" | "current_canonical_metrics"
) {
  const data = loaded?.data ?? null;
  const mappings = data?.metadata.field_mappings ?? [];
  const adSpendMapping = mappings.find((mapping) => mapping.canonical_field === "ad_spend") ?? null;
  const eventDateMapping = mappings.find((mapping) => mapping.canonical_field === "event_date") ?? null;
  const orderDateMapping = mappings.find((mapping) => mapping.canonical_field === "order_date") ?? null;
  const adSourceField = adSpendMapping?.source_field ?? adSpendMapping?.source_column ?? null;
  const adSourceFile = adSpendMapping?.source_file ?? adSpendMapping?.source_system ?? adSpendMapping?.source_file_type ?? null;
  const orderDateSourceField = orderDateMapping?.source_field ?? orderDateMapping?.source_column ?? null;
  const orderDateSourceFile = orderDateMapping?.source_file ?? orderDateMapping?.source_system ?? orderDateMapping?.source_file_type ?? null;

  return {
    source,
    loader_state: loaded?.state ?? "unavailable",
    lineage: loaded?.lineage ?? null,
    canonical_metrics: {
      ad_spend: data?.metrics.ads.ad_spend ?? null,
      business_ad_spend: data?.metrics.business.ad_spend ?? null
    },
    mapping_debug: {
      ad_spend: adSpendMapping ? {
        canonical_field: adSpendMapping.canonical_field,
        source_field: adSourceField,
        source_file: adSourceFile,
        confidence: adSpendMapping.mapping_confidence,
        status: adSpendMapping.requires_confirmation ? "NEEDS_CONFIRMATION" : "AVAILABLE"
      } : null,
      event_date: eventDateMapping ? {
        canonical_field: eventDateMapping.canonical_field,
        source_field: eventDateMapping.source_field ?? eventDateMapping.source_column ?? null,
        source_file: eventDateMapping.source_file ?? eventDateMapping.source_system ?? eventDateMapping.source_file_type ?? null,
        confidence: eventDateMapping.mapping_confidence,
        status: eventDateMapping.requires_confirmation ? "NEEDS_CONFIRMATION" : "AVAILABLE"
      } : null,
      order_date: orderDateMapping ? {
        canonical_field: orderDateMapping.canonical_field,
        source_field: orderDateSourceField,
        source_file: orderDateSourceFile,
        confidence: orderDateMapping.mapping_confidence,
        status: orderDateMapping.requires_confirmation ? "NEEDS_CONFIRMATION" : "AVAILABLE"
      } : null,
      meta_date_maps_to_order_date: orderDateSourceField === "date" && /meta/i.test(String(orderDateSourceFile ?? ""))
    },
    missing_fields: data?.quality.missing_fields ?? []
  };
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
  }).catch((error) => {
    console.warn("[decision-report] optimization cache lookup failed; using live fallback when available", {
      workspace_id: session.workspace.id,
      mode: decisionMode,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });

  if (reportCache) {
    const cachedPayload = optimizationReportCachePayload(reportCache);
    if (cacheNeedsOptimizationRefresh(cachedPayload)) {
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          startedAt
        });
      }

      const liveResponse = await liveDecisionReportResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "Loaded current decision analysis while the optimization cache refreshes."
      });
      if (liveResponse) return liveResponse;

      let job = await latestOptimizationJob(session.workspace.id);

      if (!job || !isPendingOptimizationStatus(job.status)) {
        const queuedJob = await enqueueSkuOptimizationJob(prisma, {
          workspaceId: session.workspace.id,
          reason: `non_ready_decision_report_cache:${reportCache.state || "unknown"}`,
          decisionMode,
          inputHash: reportCache.inputHash
        });
        job = queuedJob;

      }
      const processed = await processQueuedOptimizationJob(job);
      if (processed?.ok) {
        const freshResponse = await freshOptimizationCacheResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          startedAt
        });
        if (freshResponse) return freshResponse;
      }

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
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          startedAt
        });
      }

      const liveResponse = await liveDecisionReportResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "Loaded current decision analysis because the cached optimization rows are incomplete."
      });
      if (liveResponse) return liveResponse;

      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: "invalid_decision_report_cache:missing_ops_rows",
        decisionMode,
        inputHash: reportCache.inputHash
      });

      const processed = await processQueuedOptimizationJob(job);
      if (processed?.ok) {
        const freshResponse = await freshOptimizationCacheResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          startedAt
        });
        if (freshResponse) return freshResponse;
      }

      return NextResponse.json({
        ...await withOptimizationReadiness(session.workspace.id, cachedPayload),
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
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          startedAt
        });
      }

      const liveResponse = await liveDecisionReportResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "Loaded current decision analysis because the cached optimization snapshot is stale."
      });
      if (liveResponse) return liveResponse;

      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_report_cache:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      const processed = await processQueuedOptimizationJob(job);
      if (processed?.ok) {
        const freshResponse = await freshOptimizationCacheResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          startedAt
        });
        if (freshResponse) return freshResponse;
      }

      return NextResponse.json({
        ...await withOptimizationReadiness(session.workspace.id, cachedPayload),
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
      ...await withOptimizationReadiness(session.workspace.id, cachedPayload),
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
  }).catch((error) => {
    console.warn("[decision-report] decision snapshot lookup failed; using live fallback when available", {
      workspace_id: session.workspace.id,
      optimization_type: optimizationType,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });

  const recommendationsJson = asRecord(snapshot?.recommendationsJson);

  if (snapshot && Object.keys(recommendationsJson).length && !cacheNeedsOptimizationRefresh(recommendationsJson)) {
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
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          payload: recommendationsJson,
          cacheId: snapshot.id,
          cacheCreatedAt: snapshot.createdAt,
          cacheUpdatedAt: snapshot.createdAt,
          sourceDecisionSnapshotId: snapshot.id,
          artifact: refreshAvailability.artifact,
          startedAt
        });
      }

      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_snapshot:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      const processed = await processQueuedOptimizationJob(job);
      if (processed?.ok) {
        const freshResponse = await freshOptimizationCacheResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          startedAt
        });
        if (freshResponse) return freshResponse;
      }

      return NextResponse.json({
        ...await withOptimizationReadiness(session.workspace.id, recommendationsJson),
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
      ...await withOptimizationReadiness(session.workspace.id, recommendationsJson),
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

  const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
  if (refreshAvailability.canRefresh) {
    const liveResponse = await liveDecisionReportResponse({
      workspaceId: session.workspace.id,
      mode: decisionMode,
      startedAt,
      message: "Loaded current decision analysis while the optimization cache refreshes."
    });
    if (liveResponse) return liveResponse;

    let job = await latestOptimizationJob(session.workspace.id);

    if (!job || !isPendingOptimizationStatus(job.status)) {
      const queuedJob = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: "decision_snapshot_missing_with_ready_sources",
        decisionMode,
        inputHash: null
      });
      job = queuedJob;

    }
    const processed = await processQueuedOptimizationJob(job);
    if (processed?.ok) {
      const freshResponse = await freshOptimizationCacheResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt
      });
      if (freshResponse) return freshResponse;
    }

    return queuedOptimizationResponse({
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      message: "Optimization data is ready and a decision analysis refresh is running.",
      startedAt
    });
  }

  if (refreshAvailability.artifact) {
    return unavailableCanonicalArtifactResponse({
      artifact: refreshAvailability.artifact,
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
      "orders.order_id",
      "orders.order_date",
      "order_items.sku",
      "order_items.quantity",
      "order_items.revenue",
      "products.sku_or_product_id",
      "cost.unit_cost_or_cogs",
      "cost.shipping_cost",
      "cost.platform_fee",
      "cost.payment_fee",
      "refunds.order_id",
      "refunds.refund_amount",
      "ads.ad_spend",
      "ads.sku_or_product_id",
      "inventory.sku",
      "inventory.inventory_on_hand",
      "channel.channel_or_platform"
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
