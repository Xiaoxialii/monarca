import { Prisma, type PrismaClient } from "@prisma/client";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "../profit/canonical-profitability-engine";
import {
  attachSnapshotIdentity,
  currentDashboardSnapshotIdentity,
  isSnapshotFresh,
  shouldRejectSnapshotOverwrite,
  type SnapshotIdentity
} from "./snapshot-freshness";

export type OptimizationReportMode = "sku" | "full";

export type OptimizationReportCacheRecord = {
  id: string;
  workspaceId: string;
  mode: string;
  state: string;
  hasConnectedDataSource: boolean;
  message: string | null;
  warning: string | null;
  generatedAt: Date | null;
  sourcePlatforms: unknown;
  lineageJson: unknown;
  profitDataCoverage: number | null;
  optimizationLevel: string | null;
  confidenceScore: number | null;
  missingDataRequirements: unknown;
  reportShellJson: unknown;
  portfolioOptimizationJson: unknown;
  queueRowsJson: unknown;
  portfolioRowsJson: unknown;
  portfolioSummaryJson: unknown;
  allocationRecommendationJson: unknown;
  riskAlertsJson: unknown;
  executionPlanJson: unknown;
  algorithmVersion: string | null;
  optimizationVersion: string | null;
  canonicalSnapshotVersion: string | null;
  metricSnapshotVersion: string | null;
  simulationVersion: string | null;
  inputHash: string | null;
  sourceReportSnapshotId: string | null;
  sourceDecisionSnapshotId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OptimizationReportCacheClient = PrismaClient & {
  optimizationReportCache?: {
    findUnique: (args: Record<string, unknown>) => Promise<OptimizationReportCacheRecord | null>;
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function json(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

function dateOrNull(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function optimizationRowsPresent(cache: Pick<OptimizationReportCacheRecord, "queueRowsJson" | "portfolioRowsJson"> | {
  queueRowsJson?: unknown;
  portfolioRowsJson?: unknown;
}) {
  return asArray(cache.queueRowsJson).length > 0 || asArray(cache.portfolioRowsJson).length > 0;
}

function splitOptimizationReportContent(content: Record<string, unknown>) {
  const report = asRecord(content.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const versions = asRecord(content.decisionSnapshotVersions);
  const rawPortfolioSummary = asRecord(report.portfolioSummary ?? optimization.portfolioSummary ?? content.portfolioSummary ?? null);
  const identity: SnapshotIdentity = {
    canonicalDataVersion: typeof versions.canonicalDataVersion === "string"
      ? versions.canonicalDataVersion
      : typeof versions.canonicalSnapshotVersion === "string"
        ? versions.canonicalSnapshotVersion
        : null,
    canonicalSnapshotVersion: typeof versions.canonicalSnapshotVersion === "string" ? versions.canonicalSnapshotVersion : null,
    metricEngineVersion: typeof versions.metricEngineVersion === "string"
      ? versions.metricEngineVersion
      : typeof versions.metricSnapshotVersion === "string"
        ? versions.metricSnapshotVersion
        : null,
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    algorithmVersion: typeof versions.algorithmVersion === "string" ? versions.algorithmVersion : null,
    optimizationEngineVersion: typeof versions.optimizationEngineVersion === "string"
      ? versions.optimizationEngineVersion
      : typeof versions.optimizationVersion === "string"
        ? versions.optimizationVersion
        : null,
    optimizationVersion: typeof versions.optimizationVersion === "string" ? versions.optimizationVersion : null,
    simulationVersion: typeof versions.simulationVersion === "string" ? versions.simulationVersion : null,
    inputHash: typeof versions.inputHash === "string" ? versions.inputHash : null,
    dataFingerprint: typeof versions.dataFingerprint === "string"
      ? versions.dataFingerprint
      : typeof versions.inputHash === "string"
        ? versions.inputHash
        : null,
    generatedAt: typeof content.generated_at === "string" ? content.generated_at : new Date().toISOString()
  };
  const portfolioSummary = Object.keys(rawPortfolioSummary).length
    ? attachSnapshotIdentity(rawPortfolioSummary, identity)
    : null;
  const allocationRecommendation = report.allocationRecommendation ?? optimization.allocationRecommendation ?? content.allocationRecommendation ?? null;
  const riskAlerts = report.riskAlerts ?? optimization.riskAlerts ?? content.riskAlerts ?? [];
  const executionPlan = report.executionPlan ?? optimization.executionPlan ?? content.executionPlan ?? [];
  const reportShellBase = { ...report };
  delete reportShellBase.sku_portfolio_optimization;
  delete reportShellBase.skuDecisions;
  const portfolioOptimizationBase = { ...optimization };
  delete portfolioOptimizationBase.skuDecisions;
  delete portfolioOptimizationBase.recommended_portfolio;
  delete portfolioOptimizationBase.currentPortfolio;
  delete portfolioOptimizationBase.lifecycleClassifications;
  delete portfolioOptimizationBase.budget_plan;
  delete portfolioOptimizationBase.pricing_plan;
  delete portfolioOptimizationBase.inventory_plan;
  delete portfolioOptimizationBase.simulations;

  const reportShell = attachSnapshotIdentity({
    ...reportShellBase,
    optimizationRun: content.optimizationRun ?? reportShellBase.optimizationRun ?? null,
    skuDecisions: [],
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  }, identity);
  const portfolioOptimization = attachSnapshotIdentity({
    ...portfolioOptimizationBase,
    skuDecisions: [],
    recommended_portfolio: [],
    lifecycleClassifications: [],
    budget_plan: [],
    pricing_plan: [],
    inventory_plan: [],
    simulations: [],
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  }, identity);

  return {
    state: typeof content.state === "string" ? content.state : "empty",
    hasConnectedDataSource: content.hasConnectedDataSource === true,
    message: typeof content.message === "string" ? content.message : null,
    warning: typeof content.warning === "string" ? content.warning : null,
    generatedAt: dateOrNull(content.generated_at),
    sourcePlatforms: asArray(content.source_platforms),
    lineageJson: content.lineage ?? null,
    profitDataCoverage: typeof content.profitDataCoverage === "number" ? content.profitDataCoverage : null,
    optimizationLevel: typeof content.optimizationLevel === "string" ? content.optimizationLevel : null,
    confidenceScore: typeof content.confidenceScore === "number" ? content.confidenceScore : null,
    missingDataRequirements: asArray(content.missingDataRequirements),
    reportShellJson: reportShell,
    portfolioOptimizationJson: portfolioOptimization,
    queueRowsJson: asArray(optimization.skuDecisions),
    portfolioRowsJson: asArray(optimization.recommended_portfolio),
    portfolioSummaryJson: portfolioSummary,
    allocationRecommendationJson: allocationRecommendation,
    riskAlertsJson: asArray(riskAlerts),
    executionPlanJson: asArray(executionPlan),
    algorithmVersion: identity.algorithmVersion,
    optimizationVersion: identity.optimizationVersion ?? identity.optimizationEngineVersion ?? null,
    canonicalSnapshotVersion: identity.canonicalSnapshotVersion ?? identity.canonicalDataVersion ?? null,
    metricSnapshotVersion: identity.metricEngineVersion ?? null,
    simulationVersion: identity.simulationVersion ?? null,
    inputHash: identity.inputHash ?? identity.dataFingerprint ?? null
  };
}

export async function findOptimizationReportCache(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    mode: OptimizationReportMode;
  }
) {
  const cache = (prisma as OptimizationReportCacheClient).optimizationReportCache;
  if (!cache) return null;

  const record = await cache.findUnique({
    where: {
      workspaceId_mode: {
        workspaceId: input.workspaceId,
        mode: input.mode
      }
    },
    select: {
      id: true,
      workspaceId: true,
      mode: true,
      state: true,
      hasConnectedDataSource: true,
      message: true,
      warning: true,
      generatedAt: true,
      sourcePlatforms: true,
      lineageJson: true,
      profitDataCoverage: true,
      optimizationLevel: true,
      confidenceScore: true,
      missingDataRequirements: true,
      reportShellJson: true,
      portfolioOptimizationJson: true,
      queueRowsJson: true,
      portfolioRowsJson: true,
      portfolioSummaryJson: true,
      allocationRecommendationJson: true,
      riskAlertsJson: true,
      executionPlanJson: true,
      algorithmVersion: true,
      optimizationVersion: true,
      canonicalSnapshotVersion: true,
      metricSnapshotVersion: true,
      simulationVersion: true,
      inputHash: true,
      sourceReportSnapshotId: true,
      sourceDecisionSnapshotId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!record) return null;

  const expected = await currentDashboardSnapshotIdentity(prisma, { workspaceId: input.workspaceId });
  const freshness = isSnapshotFresh({
    ...record,
    ...asRecord(record.portfolioOptimizationJson),
    ...asRecord(record.portfolioSummaryJson)
  }, expected);
  if (!freshness.isFresh) {
    console.warn("[optimization-report-cache] stale cache skipped", {
      workspace_id: input.workspaceId,
      mode: input.mode,
      cache_id: record.id,
      reasons: freshness.reasons
    });
    return null;
  }

  return record;
}

export async function upsertOptimizationReportCache(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    mode: OptimizationReportMode;
    content: Record<string, unknown>;
    sourceReportSnapshotId?: string | null;
    sourceDecisionSnapshotId?: string | null;
  }
) {
  const cache = (prisma as OptimizationReportCacheClient).optimizationReportCache;
  if (!cache) return null;

  const split = splitOptimizationReportContent(input.content);
  const existing = await cache.findUnique({
    where: {
      workspaceId_mode: {
        workspaceId: input.workspaceId,
        mode: input.mode
      }
    },
    select: {
      id: true,
      workspaceId: true,
      mode: true,
      state: true,
      queueRowsJson: true,
      portfolioRowsJson: true,
      updatedAt: true
    }
  });

  const rejectOverwrite = shouldRejectSnapshotOverwrite({
    existingState: existing?.state,
    newState: split.state,
    existingHasRows: existing ? optimizationRowsPresent(existing) : false,
    newHasRows: optimizationRowsPresent(split)
  });

  if (existing?.id && rejectOverwrite) {
    console.warn("[optimization-report-cache] skipped unsafe overwrite of ready cache", {
      workspace_id: input.workspaceId,
      mode: input.mode,
      existing_cache_id: existing.id,
      existing_state: existing.state,
      new_state: split.state,
      existing_has_rows: optimizationRowsPresent(existing),
      new_has_rows: optimizationRowsPresent(split)
    });
    return existing;
  }

  const data = {
    state: split.state,
    hasConnectedDataSource: split.hasConnectedDataSource,
    message: split.message,
    warning: split.warning,
    generatedAt: split.generatedAt,
    sourcePlatforms: json(split.sourcePlatforms),
    lineageJson: json(split.lineageJson),
    profitDataCoverage: split.profitDataCoverage,
    optimizationLevel: split.optimizationLevel,
    confidenceScore: split.confidenceScore,
    missingDataRequirements: json(split.missingDataRequirements),
    reportShellJson: json(split.reportShellJson),
    portfolioOptimizationJson: json(split.portfolioOptimizationJson),
    queueRowsJson: json(split.queueRowsJson),
    portfolioRowsJson: json(split.portfolioRowsJson),
    portfolioSummaryJson: json(split.portfolioSummaryJson),
    allocationRecommendationJson: json(split.allocationRecommendationJson),
    riskAlertsJson: json(split.riskAlertsJson),
    executionPlanJson: json(split.executionPlanJson),
    algorithmVersion: split.algorithmVersion,
    optimizationVersion: split.optimizationVersion,
    canonicalSnapshotVersion: split.canonicalSnapshotVersion,
    metricSnapshotVersion: split.metricSnapshotVersion,
    simulationVersion: split.simulationVersion,
    inputHash: split.inputHash,
    sourceReportSnapshotId: input.sourceReportSnapshotId ?? null,
    sourceDecisionSnapshotId: input.sourceDecisionSnapshotId ?? null
  };

  return cache.upsert({
    where: {
      workspaceId_mode: {
        workspaceId: input.workspaceId,
        mode: input.mode
      }
    },
    create: {
      workspaceId: input.workspaceId,
      mode: input.mode,
      ...data
    },
    update: data,
    select: {
      id: true,
      workspaceId: true,
      mode: true,
      state: true,
      updatedAt: true
    }
  });
}

export function optimizationReportCachePayload(cache: OptimizationReportCacheRecord) {
  const portfolioSummary = cache.portfolioSummaryJson ?? null;
  const allocationRecommendation = cache.allocationRecommendationJson ?? null;
  const riskAlerts = asArray(cache.riskAlertsJson);
  const executionPlan = asArray(cache.executionPlanJson);
  const queueRows = asArray(cache.queueRowsJson);
  const portfolioRows = asArray(cache.portfolioRowsJson);
  const reportShell = asRecord(cache.reportShellJson);
  const optimizationRun = asRecord(reportShell.optimizationRun);
  const portfolioOptimization = {
    ...asRecord(cache.portfolioOptimizationJson),
    skuDecisions: queueRows,
    recommended_portfolio: portfolioRows,
    simulations: asArray(asRecord(cache.portfolioOptimizationJson).simulations),
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  };
  const decisionReport = {
    ...reportShell,
    sku_portfolio_optimization: portfolioOptimization,
    skuDecisions: queueRows,
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  };

  return {
    ok: true,
    state: cache.state,
    hasConnectedDataSource: cache.hasConnectedDataSource,
    message: cache.message,
    decision_report: decisionReport,
    portfolioSummary,
    allocationRecommendation,
    skuDecisions: queueRows,
    riskAlerts,
    executionPlan,
    generated_at: cache.generatedAt instanceof Date ? cache.generatedAt.toISOString() : null,
    source_platforms: asArray(cache.sourcePlatforms),
    lineage: cache.lineageJson ?? null,
    optimizationRun: Object.keys(optimizationRun).length ? optimizationRun : null,
    decisionSnapshotVersions: {
      algorithmVersion: cache.algorithmVersion,
      optimizationVersion: cache.optimizationVersion,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      optimizationEngineVersion: cache.optimizationVersion,
      canonicalDataVersion: cache.canonicalSnapshotVersion,
      canonicalSnapshotVersion: cache.canonicalSnapshotVersion,
      metricEngineVersion: cache.metricSnapshotVersion,
      metricSnapshotVersion: cache.metricSnapshotVersion,
      simulationVersion: cache.simulationVersion,
      inputHash: cache.inputHash,
      dataFingerprint: cache.inputHash,
      generatedAt: cache.generatedAt instanceof Date ? cache.generatedAt.toISOString() : null
    },
    profitDataCoverage: cache.profitDataCoverage,
    optimizationLevel: cache.optimizationLevel,
    confidenceScore: cache.confidenceScore,
    missingDataRequirements: asArray(cache.missingDataRequirements),
    warning: cache.warning
  };
}
