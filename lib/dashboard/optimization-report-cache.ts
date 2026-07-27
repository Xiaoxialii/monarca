import { Prisma, type PrismaClient } from "@prisma/client";

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
    upsert: (args: Record<string, unknown>) => Promise<OptimizationReportCacheRecord>;
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

function splitOptimizationReportContent(content: Record<string, unknown>) {
  const report = asRecord(content.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const versions = asRecord(content.decisionSnapshotVersions);
  const portfolioSummary = report.portfolioSummary ?? optimization.portfolioSummary ?? content.portfolioSummary ?? null;
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

  const reportShell = {
    ...reportShellBase,
    skuDecisions: [],
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  };
  const portfolioOptimization = {
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
  };

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
    algorithmVersion: typeof versions.algorithmVersion === "string" ? versions.algorithmVersion : null,
    optimizationVersion: typeof versions.optimizationVersion === "string" ? versions.optimizationVersion : null,
    canonicalSnapshotVersion: typeof versions.canonicalSnapshotVersion === "string" ? versions.canonicalSnapshotVersion : null,
    metricSnapshotVersion: typeof versions.metricSnapshotVersion === "string" ? versions.metricSnapshotVersion : null,
    simulationVersion: typeof versions.simulationVersion === "string" ? versions.simulationVersion : null,
    inputHash: typeof versions.inputHash === "string" ? versions.inputHash : null
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

  return cache.findUnique({
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
    update: data
  });
}

export function optimizationReportCachePayload(cache: OptimizationReportCacheRecord) {
  const portfolioSummary = cache.portfolioSummaryJson ?? null;
  const allocationRecommendation = cache.allocationRecommendationJson ?? null;
  const riskAlerts = asArray(cache.riskAlertsJson);
  const executionPlan = asArray(cache.executionPlanJson);
  const portfolioOptimization = {
    ...asRecord(cache.portfolioOptimizationJson),
    skuDecisions: asArray(cache.queueRowsJson),
    recommended_portfolio: asArray(cache.portfolioRowsJson),
    simulations: asArray(asRecord(cache.portfolioOptimizationJson).simulations),
    portfolioSummary,
    allocationRecommendation,
    riskAlerts,
    executionPlan
  };
  const decisionReport = {
    ...asRecord(cache.reportShellJson),
    sku_portfolio_optimization: portfolioOptimization,
    skuDecisions: [],
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
    skuDecisions: [],
    riskAlerts,
    executionPlan,
    generated_at: cache.generatedAt instanceof Date ? cache.generatedAt.toISOString() : null,
    source_platforms: asArray(cache.sourcePlatforms),
    lineage: cache.lineageJson ?? null,
    decisionSnapshotVersions: {
      algorithmVersion: cache.algorithmVersion,
      optimizationVersion: cache.optimizationVersion,
      canonicalSnapshotVersion: cache.canonicalSnapshotVersion,
      metricSnapshotVersion: cache.metricSnapshotVersion,
      simulationVersion: cache.simulationVersion,
      inputHash: cache.inputHash
    },
    profitDataCoverage: cache.profitDataCoverage,
    optimizationLevel: cache.optimizationLevel,
    confidenceScore: cache.confidenceScore,
    missingDataRequirements: asArray(cache.missingDataRequirements),
    warning: cache.warning
  };
}
