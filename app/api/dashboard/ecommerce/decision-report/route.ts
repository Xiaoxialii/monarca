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
import { optimizationReadiness, type OptimizationReadiness } from "@/lib/dashboard/optimization-readiness";
import { validateOptimizationData } from "@/lib/optimization/optimization-data-contract";
import {
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

function hasUsableOptimizationPayload(payload: Record<string, unknown>) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions)
    ? optimization.skuDecisions
    : Array.isArray(payload.skuDecisions)
      ? payload.skuDecisions
      : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];

  return Object.keys(report).length > 0 || decisionRows.length > 0 || portfolioRows.length > 0;
}

function hasOptimizationRecommendationRows(payload: Record<string, unknown>) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions)
    ? optimization.skuDecisions
    : Array.isArray(payload.skuDecisions)
      ? payload.skuDecisions
      : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];

  return decisionRows.length > 0 || portfolioRows.length > 0;
}

async function restoreFreshOptimizationCacheStateIfNeeded(input: {
  workspaceId: string;
  reportCache: {
    id: string;
    state: string;
    algorithmVersion: string | null;
    optimizationVersion: string | null;
    canonicalSnapshotVersion: string | null;
    metricSnapshotVersion: string | null;
    simulationVersion: string | null;
    inputHash: string | null;
  };
  payload: Record<string, unknown>;
}) {
  const payload = input.payload;
  const state = typeof payload.state === "string" ? payload.state : input.reportCache.state;
  if (state === "ready" || !hasOptimizationRecommendationRows(payload)) {
    return { payload, restored: false };
  }

  const freshness = await decisionSnapshotFreshness(prisma, {
    workspaceId: input.workspaceId,
    snapshot: {
      algorithmVersion: input.reportCache.algorithmVersion,
      optimizationVersion: input.reportCache.optimizationVersion,
      canonicalSnapshotVersion: input.reportCache.canonicalSnapshotVersion,
      metricSnapshotVersion: input.reportCache.metricSnapshotVersion,
      simulationVersion: input.reportCache.simulationVersion,
      inputHash: input.reportCache.inputHash
    }
  });

  if (!freshness.isFresh) {
    return { payload, restored: false, freshness };
  }

  await prisma.optimizationReportCache.updateMany({
    where: {
      id: input.reportCache.id,
      workspaceId: input.workspaceId,
      state: { not: "ready" }
    },
    data: {
      state: "ready",
      warning: null
    }
  });

  console.info("[decision-report] restored_fresh_optimization_cache_state", {
    workspaceId: input.workspaceId,
    cacheId: input.reportCache.id,
    previousState: state,
    canonicalVersion: input.reportCache.canonicalSnapshotVersion,
    optimizationVersion: input.reportCache.optimizationVersion,
    inputHash: input.reportCache.inputHash
  });

  return {
    payload: {
      ...payload,
      state: "ready",
      warning: null
    },
    restored: true,
    freshness
  };
}

function optimizationRecommendationCount(payload: Record<string, unknown>) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions)
    ? optimization.skuDecisions
    : Array.isArray(payload.skuDecisions)
      ? payload.skuDecisions
      : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];
  const summary = asRecord(optimization.optimization_summary);
  const summaryCount = firstNumericValue(
    summary.queued_recommendation_count,
    summary.selected_sku_count,
    summary.total_opportunities
  );

  return Math.max(decisionRows.length, portfolioRows.length, summaryCount ?? 0);
}

type ExplicitOptimizationStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "STALE";
type ExplicitRefreshStatus = "IDLE" | "QUEUED" | "RUNNING" | "FAILED";

type DecisionReportContractInput = {
  payload: Record<string, unknown>;
  workspaceId: string;
  mode: "full" | "sku";
  metricsGeneratedAt?: string | null;
  currentVersions?: {
    canonicalSnapshotVersion?: string | null;
    metricSnapshotVersion?: string | null;
    optimizationVersion?: string | null;
    inputHash?: string | null;
  } | null;
  optimizationSource?: "optimization_snapshot" | "none";
  optimizationStatus?: ExplicitOptimizationStatus;
  optimizationSnapshotId?: string | null;
  optimizationGeneratedAt?: string | null;
  optimizationCanonicalVersion?: string | null;
  optimizationVersion?: string | null;
  refreshStatus?: ExplicitRefreshStatus;
  refreshJobId?: string | null;
  refreshCurrentStep?: string | null;
  refreshErrorCode?: string | null;
  refreshErrorMessage?: string | null;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  readiness?: OptimizationReadiness | null;
};

function explicitRefreshStatus(status: string | null | undefined): ExplicitRefreshStatus {
  if (status === "QUEUED") return "QUEUED";
  if (status === "PROCESSING" || status === "PAUSED" || status === "RUNNING") return "RUNNING";
  if (status === "FAILED" || status === "CANCELLED") return "FAILED";
  return "IDLE";
}

function withDecisionReportContract(input: DecisionReportContractInput) {
  const payload = input.payload;
  const versions = asRecord(payload.decisionSnapshotVersions);
  const snapshot = asRecord(payload.snapshot);
  const recommendationCount = optimizationRecommendationCount(payload);
  const optimizationSource = input.optimizationSource ?? (recommendationCount > 0 ? "optimization_snapshot" : "none");
  const optimizationStatus = input.optimizationStatus ??
    (optimizationSource === "optimization_snapshot" ? "SUCCESS" : "PENDING");
  const generatedAt =
    input.optimizationGeneratedAt ??
    (typeof versions.generatedAt === "string" ? versions.generatedAt : null) ??
    (typeof payload.generated_at === "string" ? payload.generated_at : null) ??
    (typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null) ??
    (typeof snapshot.createdAt === "string" ? snapshot.createdAt : null);
  const canonicalVersion =
    input.optimizationCanonicalVersion ??
    (typeof versions.canonicalSnapshotVersion === "string" ? versions.canonicalSnapshotVersion : null) ??
    (typeof versions.canonicalDataVersion === "string" ? versions.canonicalDataVersion : null);
  const optimizationVersion =
    input.optimizationVersion ??
    (typeof versions.optimizationVersion === "string" ? versions.optimizationVersion : null) ??
    (typeof versions.optimizationEngineVersion === "string" ? versions.optimizationEngineVersion : null);
  const metricsGeneratedAt =
    input.metricsGeneratedAt ??
    (typeof payload.generated_at === "string" ? payload.generated_at : null);
  const metricsCanonicalVersion =
    input.currentVersions?.canonicalSnapshotVersion ??
    canonicalVersion;

  return {
    ...payload,
    readiness: input.readiness ?? asRecord(payload.readiness),
    canonical: {
      snapshotId: input.readiness?.canonicalSnapshotId ?? null,
      dataVersion: input.readiness?.dataVersion ?? input.currentVersions?.canonicalSnapshotVersion ?? null,
      status: input.readiness?.latestObservedStatus?.canonicalStatus ?? null,
      artifactStatus: input.readiness?.artifactStatus ?? "NOT_CHECKED"
    },
    metrics: {
      source: "canonical_live",
      generatedAt: metricsGeneratedAt,
      canonicalVersion: metricsCanonicalVersion,
      metricVersion: input.currentVersions?.metricSnapshotVersion ?? (typeof versions.metricSnapshotVersion === "string" ? versions.metricSnapshotVersion : null)
    },
    optimization: {
      source: optimizationSource,
      status: optimizationStatus,
      snapshotId: input.optimizationSnapshotId ?? (typeof snapshot.id === "string" ? snapshot.id : null),
      generatedAt,
      canonicalVersion,
      optimizationVersion,
      recommendationCount
    },
    refresh: {
      status: input.refreshStatus ?? "IDLE",
      jobId: input.refreshJobId ?? null,
      currentStep: input.refreshCurrentStep ?? null,
      errorCode: input.refreshErrorCode ?? null,
      errorMessage: input.refreshErrorMessage ?? null
    },
    fallback: {
      used: input.fallbackUsed === true,
      reason: input.fallbackReason ?? null
    }
  };
}

function logDecisionReportContract(body: Record<string, unknown>, input: { workspaceId: string; mode: string }) {
  const metrics = asRecord(body.metrics);
  const optimization = asRecord(body.optimization);
  const refresh = asRecord(body.refresh);
  const fallback = asRecord(body.fallback);
  console.info("[decision-report] response_state", {
    workspaceId: input.workspaceId,
    mode: input.mode,
    metricsSource: metrics.source ?? null,
    optimizationSource: optimization.source ?? null,
    snapshotId: optimization.snapshotId ?? null,
    canonicalVersion: optimization.canonicalVersion ?? metrics.canonicalVersion ?? null,
    optimizationVersion: optimization.optimizationVersion ?? null,
    recommendationCount: optimization.recommendationCount ?? 0,
    optimizationStatus: optimization.status ?? null,
    refreshStatus: refresh.status ?? null,
    fallbackUsed: fallback.used === true,
    fallbackReason: fallback.reason ?? null
  });
}

function decisionReportJson(input: DecisionReportContractInput & { startedAt: number }) {
  const body = withDecisionReportContract({
    ...input,
    payload: {
      ...input.payload,
      performance: input.payload.performance ?? snapshotPerformance(input.startedAt, "snapshot")
    }
  });
  logDecisionReportContract(body, { workspaceId: input.workspaceId, mode: input.mode });
  return NextResponse.json(body);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumericValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = numericValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function profitImpactValue(record: Record<string, unknown>) {
  const simulation = asRecord(record.simulation);
  const simulationProfit = asRecord(simulation.profit_simulation);
  const candidates = [
    record.profit_delta,
    simulation.profit_delta,
    simulationProfit.expected_profit_impact,
    simulationProfit.incremental_profit,
    simulationProfit.profit_delta,
    record.expected_profit_impact,
    record.expectedProfitImpact,
    record.estimatedProfitImpact
  ];
  const nonZero = candidates
    .map((value) => numericValue(value))
    .find((value) => value !== null && Math.abs(value) > 0.000001);
  if (nonZero !== undefined && nonZero !== null) return nonZero;

  const sourceAction = String(record.sourceAction ?? record.unified_action ?? "").toUpperCase();
  const confidence = Math.max(0.2, Math.min(0.8, numericValue(record.confidence) ?? numericValue(record.confidenceScore) ?? 0.25));
  const margin = Math.max(0.05, Math.min(0.65, numericValue(record.margin) ?? numericValue(record.contribution_margin) ?? 0.25));
  const revenue = numericValue(record.revenue) ?? 0;
  const netProfit = numericValue(record.net_profit) ?? 0;
  const grossProfit = numericValue(record.gross_profit) ?? 0;
  const baseProfit = netProfit > 0 ? netProfit : grossProfit > 0 ? grossProfit : revenue * margin;
  const shouldEstimate = baseProfit > 0 && (
    sourceAction === "VALIDATE_AND_SCALE" ||
    record.budgetOpportunity === true ||
    record.action === "OPTIMIZE"
  );
  if (shouldEstimate) {
    const liftRate = sourceAction === "VALIDATE_AND_SCALE" ? 0.08 : 0.035;
    return Math.round(Math.max(1, baseProfit * liftRate * confidence) * 100) / 100;
  }

  return firstNumericValue(...candidates);
}

function normalizeOptimizationProfitImpactPayload(payload: Record<string, unknown>) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  if (!Object.keys(report).length || !Object.keys(optimization).length) return payload;

  const normalizeRows = (rows: unknown[]) => rows.map((row) => {
    const record = asRecord(row);
    const impact = profitImpactValue(record);
    if (impact === null) return row;
    return {
      ...record,
      profit_delta: impact,
      expected_profit_impact: impact,
      expectedProfitImpact: impact,
      estimatedProfitImpact: impact
    };
  });

  const skuDecisions = Array.isArray(optimization.skuDecisions)
    ? normalizeRows(optimization.skuDecisions)
    : [];
  const recommendedPortfolio = Array.isArray(optimization.recommended_portfolio)
    ? normalizeRows(optimization.recommended_portfolio)
    : [];
  const sourceRows = skuDecisions.length ? skuDecisions : recommendedPortfolio;
  const totalImpact = sourceRows.reduce<number>((sum, row) => {
    const record = asRecord(row);
    return sum + (profitImpactValue(record) ?? 0);
  }, 0);
  const existingSummary = asRecord(optimization.optimization_summary);
  const existingPortfolioSummary = asRecord(optimization.portfolioSummary);
  const shouldPatchSummary = Math.abs(totalImpact) > 0;
  const optimizationSummary = shouldPatchSummary
    ? {
      ...existingSummary,
      expected_profit_gain: firstNumericValue(existingSummary.expected_profit_gain) || totalImpact,
      total_expected_profit_gain: firstNumericValue(existingSummary.total_expected_profit_gain) || totalImpact
    }
    : existingSummary;

  return {
    ...payload,
    total_expected_profit_gain: shouldPatchSummary
      ? firstNumericValue(payload.total_expected_profit_gain) || totalImpact
      : payload.total_expected_profit_gain,
    decision_report: {
      ...report,
      sku_portfolio_optimization: {
        ...optimization,
        total_expected_profit_gain: shouldPatchSummary
          ? firstNumericValue(optimization.total_expected_profit_gain) || totalImpact
          : optimization.total_expected_profit_gain,
        optimization_summary: optimizationSummary,
        portfolioSummary: shouldPatchSummary
          ? {
            ...existingPortfolioSummary,
            totalProfitImpact: firstNumericValue(existingPortfolioSummary.totalProfitImpact) || totalImpact
          }
          : existingPortfolioSummary,
        skuDecisions,
        recommended_portfolio: recommendedPortfolio
      }
    }
  };
}

async function optimizationRefreshAvailability(workspaceId: string) {
  const readiness = await optimizationReadiness(prisma, { workspaceId });
  if (!readiness.ready) {
    return {
      canRefresh: false,
      artifact: readiness.artifact,
      readiness
    };
  }

  return {
    canRefresh: true,
    artifact: readiness.artifact,
    readiness
  };
}

function unavailableCanonicalArtifactResponse(input: {
  workspaceId: string;
  mode: "full" | "sku";
  payload?: Record<string, unknown>;
  cacheId?: string | null;
  cacheCreatedAt?: Date | null;
  cacheUpdatedAt?: Date | null;
  sourceDecisionSnapshotId?: string | null;
  artifact: Awaited<ReturnType<typeof canonicalArtifactAvailability>> | null;
  readiness?: OptimizationReadiness | null;
  startedAt: number;
}) {
  const payload = input.payload ?? {};
  return decisionReportJson({
    workspaceId: input.workspaceId,
    mode: input.mode,
    startedAt: input.startedAt,
    payload: {
      ...payload,
      ok: true,
      state: payload.state ?? "unavailable",
      status: "UNAVAILABLE",
      latestSnapshot: Boolean(input.cacheId),
      message: input.artifact?.message ?? "Canonical ecommerce artifacts are unavailable. Refresh skipped.",
      refreshSkippedReason: "canonical_artifact_unavailable",
      artifactAvailability: input.artifact,
      readiness: input.readiness ?? null,
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
        : null
    },
    optimizationStatus: hasOptimizationRecommendationRows(payload) ? "FAILED" : "PENDING",
    optimizationSnapshotId: input.cacheId ?? null,
    refreshStatus: "FAILED",
    refreshErrorCode: input.readiness?.code ?? "ARTIFACT_UNAVAILABLE",
    refreshErrorMessage: input.readiness?.message ?? input.artifact?.message ?? "Canonical ecommerce artifacts are unavailable. Refresh skipped.",
    readiness: input.readiness ?? null,
    fallbackUsed: hasOptimizationRecommendationRows(payload),
    fallbackReason: "canonical_artifact_unavailable"
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
      payload: true,
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
  const manualJobs = jobs.filter((job) => asRecord(job.payload).reason === "manual_optimization_refresh");

  const queued = manualJobs.find((job) => job.status === "QUEUED");
  if (queued) return queued;

  const staleBefore = new Date(Date.now() - SKU_OPTIMIZATION_STALE_JOB_MS);
  return manualJobs.find((job) => {
    const heartbeat = job.heartbeatAt ?? job.startedAt ?? job.lockedAt ?? job.updatedAt ?? job.createdAt;
    return heartbeat >= staleBefore;
  }) ?? null;
}

function queuedOptimizationResponse(input: {
  workspaceId: string;
  mode: "full" | "sku";
  payload?: Record<string, unknown>;
  jobId: string;
  status: string;
  currentStep?: string | null;
  message: string;
  readiness?: OptimizationReadiness | null;
  startedAt: number;
}) {
  const payload = input.payload ?? {};
  const existingReport = asRecord(payload.decision_report);
  const existingOptimization = asRecord(existingReport.sku_portfolio_optimization);
  const existingSkuDecisions = Array.isArray(existingOptimization.skuDecisions)
    ? existingOptimization.skuDecisions
    : Array.isArray(payload.skuDecisions)
      ? payload.skuDecisions
      : [];
  const existingRiskAlerts = Array.isArray(payload.riskAlerts)
    ? payload.riskAlerts
    : Array.isArray(existingReport.riskAlerts)
      ? existingReport.riskAlerts
      : [];
  const existingExecutionPlan = Array.isArray(payload.executionPlan)
    ? payload.executionPlan
    : Array.isArray(existingReport.executionPlan)
      ? existingReport.executionPlan
      : [];
  const hasExistingReport = Object.keys(existingReport).length > 0 || existingSkuDecisions.length > 0;

  return decisionReportJson({
    workspaceId: input.workspaceId,
    mode: input.mode,
    startedAt: input.startedAt,
    payload: {
      ...payload,
      ok: true,
      state: "processing",
      status: input.status,
      latestSnapshot: false,
      message: input.message,
      jobId: input.jobId,
      decision_report: hasExistingReport ? payload.decision_report : null,
      portfolioSummary: hasExistingReport
        ? payload.portfolioSummary ?? existingReport.portfolioSummary ?? existingOptimization.portfolioSummary ?? null
        : null,
      allocationRecommendation: hasExistingReport
        ? payload.allocationRecommendation ?? existingReport.allocationRecommendation ?? null
        : null,
      skuDecisions: hasExistingReport ? existingSkuDecisions : [],
      riskAlerts: hasExistingReport ? existingRiskAlerts : [],
      executionPlan: hasExistingReport ? existingExecutionPlan : [],
      optimizationRun: {
        ...asRecord(payload.optimizationRun),
        optimization_run_id: input.jobId,
        current_step: input.currentStep ?? null
      }
    },
    optimizationStatus: hasExistingReport ? "RUNNING" : "PENDING",
    refreshStatus: explicitRefreshStatus(input.status),
    refreshJobId: input.jobId,
    refreshCurrentStep: input.currentStep ?? null,
    readiness: input.readiness ?? null,
    fallbackUsed: hasExistingReport,
    fallbackReason: hasExistingReport ? "provided_optimization_payload" : null
  });
}

function manualOptimizationRequiredResponse(input: {
  workspaceId: string;
  mode: "full" | "sku";
  startedAt: number;
  message: string;
  reason: string;
  readiness?: OptimizationReadiness | null;
  currentVersions?: DecisionReportContractInput["currentVersions"];
  snapshotType?: string;
}) {
  return decisionReportJson({
    workspaceId: input.workspaceId,
    mode: input.mode,
    startedAt: input.startedAt,
    payload: {
      ok: true,
      state: "ready_to_optimize",
      status: "READY_TO_OPTIMIZE",
      latestSnapshot: false,
      message: input.message,
      staleReason: input.reason,
      jobId: null,
      currentVersions: input.currentVersions ?? null,
      decision_report: null,
      portfolioSummary: null,
      allocationRecommendation: null,
      skuDecisions: [],
      riskAlerts: [],
      executionPlan: [],
      snapshot: {
        id: null,
        type: input.snapshotType ?? "OptimizationReportCache",
        invalidated: true
      }
    },
    currentVersions: input.currentVersions ?? null,
    optimizationSource: "none",
    optimizationStatus: "PENDING",
    optimizationSnapshotId: null,
    refreshStatus: "IDLE",
    refreshJobId: null,
    refreshCurrentStep: null,
    readiness: input.readiness ?? null,
    fallbackUsed: false,
    fallbackReason: input.reason
  });
}

async function withOptimizationReadiness(workspaceId: string, payload: Record<string, unknown>) {
  const normalizedPayload = normalizeOptimizationProfitImpactPayload(payload);
  const existingReadiness = asRecord(normalizedPayload.optimizationReadiness);
  if (Object.keys(existingReadiness).length) {
    return {
      ...normalizedPayload,
      optimizationReadiness: existingReadiness
    };
  }
  if (hasUsableOptimizationPayload(normalizedPayload)) {
    return normalizedPayload;
  }

  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId,
    decisionMode: "full"
  }).catch(() => null);
  const optimizationReadiness = loaded?.data ? validateOptimizationData(loaded.data) : null;

  return {
    ...normalizedPayload,
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
    let cachedPayload: Record<string, unknown> = optimizationReportCachePayload(reportCache);
    const restoredCache = await restoreFreshOptimizationCacheStateIfNeeded({
      workspaceId: session.workspace.id,
      reportCache,
      payload: cachedPayload
    });
    cachedPayload = restoredCache.payload;

    if (cacheNeedsOptimizationRefresh(cachedPayload)) {
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      const job = await latestOptimizationJob(session.workspace.id);

      if (!job || !isPendingOptimizationStatus(job.status)) {
        return manualOptimizationRequiredResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          startedAt,
          message: "New data is available. Run optimization to generate current recommendations.",
          reason: `non_ready_decision_report_cache:${reportCache.state || "unknown"}`,
          readiness: refreshAvailability.readiness,
          currentVersions: {
            canonicalSnapshotVersion: refreshAvailability.readiness?.dataVersion ?? null,
            inputHash: reportCache.inputHash
          }
        });
      }

      return queuedOptimizationResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        jobId: job.id,
        status: job.status,
        currentStep: job.currentStep,
        message: "New data is available. Optimization refresh is running.",
        readiness: refreshAvailability.readiness,
        startedAt
      });
    }

    if (cachedOptimizationReportMissingOpsRows(cachedPayload)) {
      const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
      if (!refreshAvailability.canRefresh) {
        return unavailableCanonicalArtifactResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      const job = await latestOptimizationJob(session.workspace.id);
      if (job && isPendingOptimizationStatus(job.status)) {
        return queuedOptimizationResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          jobId: job.id,
          status: job.status,
          currentStep: job.currentStep,
          message: "Optimization refresh is running.",
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      return manualOptimizationRequiredResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "Optimization snapshot is invalid. Run optimization to generate current recommendations.",
        reason: "invalid_decision_report_cache:missing_ops_rows",
        readiness: refreshAvailability.readiness,
        currentVersions: {
          canonicalSnapshotVersion: refreshAvailability.readiness?.dataVersion ?? null,
          inputHash: reportCache.inputHash
        }
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
          workspaceId: session.workspace.id,
          mode: decisionMode,
          payload: cachedPayload,
          cacheId: reportCache.id,
          cacheCreatedAt: reportCache.createdAt,
          cacheUpdatedAt: reportCache.updatedAt,
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          artifact: refreshAvailability.artifact,
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      const job = await latestOptimizationJob(session.workspace.id);
      if (job && isPendingOptimizationStatus(job.status)) {
        return queuedOptimizationResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          jobId: job.id,
          status: job.status,
          currentStep: job.currentStep,
          message: "New data is available. Optimization refresh is running.",
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      return manualOptimizationRequiredResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "New data invalidated the previous optimization snapshot. Run optimization to generate current recommendations.",
        reason: `stale_decision_report_cache:${freshness.reason ?? "unknown"}`,
        readiness: refreshAvailability.readiness,
        currentVersions: freshness.current,
        snapshotType: "OptimizationReportCache"
      });
    }

    return decisionReportJson({
      workspaceId: session.workspace.id,
      mode: decisionMode,
      startedAt,
      payload: {
        ...await withOptimizationReadiness(session.workspace.id, cachedPayload),
        snapshot: {
          id: reportCache.id,
          type: "OptimizationReportCache",
          sourceDecisionSnapshotId: reportCache.sourceDecisionSnapshotId,
          createdAt: dateToIso(reportCache.createdAt),
          updatedAt: dateToIso(reportCache.updatedAt),
          latestSnapshot: true
        }
      },
      optimizationStatus: "SUCCESS",
      optimizationSnapshotId: reportCache.id,
      refreshStatus: "IDLE"
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
          workspaceId: session.workspace.id,
          mode: decisionMode,
          payload: recommendationsJson,
          cacheId: snapshot.id,
          cacheCreatedAt: snapshot.createdAt,
          cacheUpdatedAt: snapshot.createdAt,
          sourceDecisionSnapshotId: snapshot.id,
          artifact: refreshAvailability.artifact,
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      const job = await latestOptimizationJob(session.workspace.id);
      if (job && isPendingOptimizationStatus(job.status)) {
        return queuedOptimizationResponse({
          workspaceId: session.workspace.id,
          mode: decisionMode,
          payload: recommendationsJson,
          jobId: job.id,
          status: job.status,
          currentStep: job.currentStep,
          message: "New data is available. Optimization refresh is running.",
          readiness: refreshAvailability.readiness,
          startedAt
        });
      }

      return manualOptimizationRequiredResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        startedAt,
        message: "New data invalidated the previous optimization snapshot. Run optimization to generate current recommendations.",
        reason: `stale_decision_snapshot:${freshness.reason ?? "unknown"}`,
        readiness: refreshAvailability.readiness,
        currentVersions: freshness.current,
        snapshotType: "DecisionSnapshot"
      });
    }

    return decisionReportJson({
      workspaceId: session.workspace.id,
      mode: decisionMode,
      startedAt,
      payload: {
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
        }
      },
      optimizationStatus: "SUCCESS",
      optimizationSnapshotId: snapshot.id,
      optimizationGeneratedAt: snapshot.generatedAt instanceof Date ? snapshot.generatedAt.toISOString() : null,
      optimizationCanonicalVersion: snapshot.canonicalSnapshotVersion,
      optimizationVersion: snapshot.optimizationVersion,
      refreshStatus: "IDLE"
    });
  }

  const refreshAvailability = await optimizationRefreshAvailability(session.workspace.id);
  if (refreshAvailability.canRefresh) {
    const job = await latestOptimizationJob(session.workspace.id);

    if (job && isPendingOptimizationStatus(job.status)) {
      return queuedOptimizationResponse({
        workspaceId: session.workspace.id,
        mode: decisionMode,
        jobId: job.id,
        status: job.status,
        currentStep: job.currentStep,
        message: "Optimization refresh is running.",
        readiness: refreshAvailability.readiness,
        startedAt
      });
    }

    return manualOptimizationRequiredResponse({
      workspaceId: session.workspace.id,
      mode: decisionMode,
      startedAt,
      message: "Connected data is ready. Run optimization to generate recommendations.",
      reason: "decision_snapshot_missing_with_ready_sources",
      readiness: refreshAvailability.readiness,
      currentVersions: {
        canonicalSnapshotVersion: refreshAvailability.readiness?.dataVersion ?? null
      },
      snapshotType: "DecisionSnapshot"
    });
  }

  if (refreshAvailability.artifact) {
    return unavailableCanonicalArtifactResponse({
      workspaceId: session.workspace.id,
      mode: decisionMode,
      artifact: refreshAvailability.artifact,
      readiness: refreshAvailability.readiness,
      startedAt
    });
  }

  return decisionReportJson({
    workspaceId: session.workspace.id,
    mode: decisionMode,
    startedAt,
    payload: {
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
      warning: "DECISION_SNAPSHOT_MISS"
    },
    optimizationSource: "none",
    optimizationStatus: "PENDING",
    refreshStatus: "IDLE"
  });
}

function cachedOptimizationReportMissingOpsRows(payload: unknown) {
  const record = asRecord(payload);
  const report = asRecord(record.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];
  const rows = [...decisionRows, ...portfolioRows];

  if (rows.length === 0) return false;

  return !rows.some((row) => {
    const item = asRecord(row);
    return typeof item.sku === "string" || typeof item.skuId === "string";
  });
}
