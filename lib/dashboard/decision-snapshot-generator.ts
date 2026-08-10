import type { PrismaClient } from "@prisma/client";
import {
  loadEcommerceSalesDashboardData,
  type LoadDashboardResult
} from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { currentDecisionSnapshotVersions } from "@/lib/dashboard/decision-snapshot-lifecycle";
import { upsertDecisionSnapshot, upsertReportSnapshot } from "@/lib/dashboard/snapshot-store";
import { upsertOptimizationReportCache } from "@/lib/dashboard/optimization-report-cache";
import { normalizeProfitInputs, type ProfitInputRow } from "@/lib/profit/profit-input-normalizer";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "@/lib/profit/canonical-profitability-engine";
import { applyDecisionLearningToDecisionReport } from "@/lib/decision-outcome/optimizer-learning-integration";
import { activeDecisionContextForSku } from "@/lib/optimization/decision-context/active-decision-context";
import { loadActiveDecisionContexts } from "@/lib/optimization/decision-context/decision-context-loader";
import type { ActiveDecisionContext } from "@/lib/optimization/decision-context/decision-context-types";
import { recommendationIdFromRecord } from "@/lib/optimization/recommendation-identity";

type DecisionMode = "full" | "sku";

type GenerateDecisionSnapshotsResult = {
  generated: Array<{
    mode: DecisionMode;
    optimizationType: string;
    snapshotId: string | null;
    state: LoadDashboardResult["state"];
  }>;
};

type OptimizationRunMetadata = {
  optimization_run_id: string | null;
  started_at: string;
  completed_at: string | null;
  optimizer_version: string;
  policy_version: string;
  simulation_version: string;
  data_version: string;
  analyzed_sku_count: number;
};

type RecommendationIdentityContext = {
  optimizationRunId: string | null;
  policyVersion: string;
  optimizerVersion: string;
  simulationVersion: string;
  dataVersion: string;
};

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but optimization needs order id/date, SKU order items, revenue, unit cost/COGS, shipping cost, platform fee, payment fee, refunds, SKU-level ad spend, inventory on hand, and channel/platform fields to generate reliable profit lift.";
const PROFIT_INPUT_ROW_LIMIT = 250;

export async function generateEcommerceDecisionSnapshots(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    dataSourceId?: string | null;
    sourceJobId?: string | null;
    modes?: DecisionMode[];
  }
): Promise<GenerateDecisionSnapshotsResult> {
  const generated: GenerateDecisionSnapshotsResult["generated"] = [];
  const versions = await currentDecisionSnapshotVersions(prisma, {
    workspaceId: input.workspaceId
  });
  const modes = input.modes?.length ? input.modes : (["full", "sku"] as const);

  for (const mode of modes) {
    const startedAt = Date.now();
    const runStartedAt = new Date(startedAt).toISOString();
    const optimizationType = mode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION";
    const loadStartedAt = Date.now();
    const loaded = await loadEcommerceSalesDashboardData({
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId ?? null,
      decisionMode: mode
    });
    const loadDurationMs = Date.now() - loadStartedAt;
    const activeDecisionContexts = await loadActiveDecisionContexts(prisma, {
      workspaceId: input.workspaceId
    });
    const contentStartedAt = Date.now();
    const content = await applyDecisionLearningToDecisionReport(prisma, {
      workspaceId: input.workspaceId,
      content: decisionSnapshotContent(loaded, versions, {
        optimizationRunId: input.sourceJobId ?? null,
        startedAt: runStartedAt,
        activeDecisionContexts
      })
    }) as ReturnType<typeof decisionSnapshotContent>;
    const contentDurationMs = Date.now() - contentStartedAt;
    content.optimizationRun = {
      ...content.optimizationRun,
      completed_at: new Date().toISOString()
    };
    const decisionReport = content.decision_report;
    const portfolioSummary = decisionReport?.portfolioSummary;
    const persistStartedAt = Date.now();
    const snapshot = await upsertDecisionSnapshot(prisma, {
      workspaceId: input.workspaceId,
      optimizationType,
      content: compactReportSnapshotContent(content),
      assumptions: {
        generatedFrom: "canonical_snapshot",
        dashboardState: loaded.state,
        dataSourceId: input.dataSourceId ?? null,
        lineage: loaded.lineage ?? null,
        sourceJobId: input.sourceJobId ?? null,
        optimizationRun: content.optimizationRun
      },
      expectedProfitImpact: typeof portfolioSummary?.totalProfitImpact === "number"
        ? portfolioSummary.totalProfitImpact
        : null,
      ...versions
    });
    await upsertOptimizationReportCache(prisma, {
      workspaceId: input.workspaceId,
      mode,
      content,
      sourceReportSnapshotId: null,
      sourceDecisionSnapshotId: typeof snapshot?.id === "string" ? snapshot.id : null
    });
    await upsertReportSnapshot(prisma, {
      workspaceId: input.workspaceId,
      reportType: `optimization_decision_report:${mode}`,
      cacheKey: "latest",
      content: compactReportSnapshotContent(content)
    });
    await saveSimulationSnapshot(prisma, {
      workspaceId: input.workspaceId,
      sourceJobId: input.sourceJobId ?? null,
      decisionSnapshotId: typeof snapshot?.id === "string" ? snapshot.id : null,
      content
    });
    await writeDecisionGenerationLog(prisma, {
      workspaceId: input.workspaceId,
      sourceJobId: input.sourceJobId ?? null,
      decisionSnapshotId: typeof snapshot?.id === "string" ? snapshot.id : null,
      optimizationType,
      versions,
      content,
      executionTimeMs: Date.now() - startedAt
    });
    console.info("[decision-snapshot-generator]", {
      workspace_id: input.workspaceId,
      source_job_id: input.sourceJobId ?? null,
      mode,
      state: loaded.state,
      load_duration_ms: loadDurationMs,
      content_duration_ms: contentDurationMs,
      active_decision_context_sku_count: activeDecisionContexts.size,
      persist_duration_ms: Date.now() - persistStartedAt,
      total_duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });

    generated.push({
      mode,
      optimizationType,
      snapshotId: typeof snapshot?.id === "string" ? snapshot.id : null,
      state: loaded.state
    });
  }

  return { generated };
}

function compactReportSnapshotContent(content: ReturnType<typeof decisionSnapshotContent>) {
  const record = asRecord(content) ?? {};
  const decisionReport = asRecord(record.decision_report) ?? {};
  const optimization = asRecord(decisionReport.sku_portfolio_optimization) ?? {};
  const profitInputModel = asRecord(record.profitInputModel) ?? {};

  return {
    ...record,
    decision_report: {
      ...decisionReport,
      sku_portfolio_optimization: {
        ...optimization,
        currentPortfolio: undefined,
        lifecycleClassifications: [],
        budget_plan: [],
        pricing_plan: [],
        inventory_plan: [],
        simulations: []
      },
      skuDecisions: Array.isArray(decisionReport.skuDecisions) ? decisionReport.skuDecisions : []
    },
    skuDecisions: Array.isArray(record.skuDecisions) ? record.skuDecisions : [],
    profitInputModel: {
      ...profitInputModel,
      rows: []
    }
  };
}

async function writeDecisionGenerationLog(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sourceJobId?: string | null;
    decisionSnapshotId?: string | null;
    optimizationType: string;
    versions: Awaited<ReturnType<typeof currentDecisionSnapshotVersions>>;
    content: Record<string, unknown>;
    executionTimeMs: number;
    errorMessage?: string | null;
  }
) {
  const decisionGenerationLog = (prisma as unknown as {
    decisionGenerationLog?: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  }).decisionGenerationLog;
  if (!decisionGenerationLog) return null;

  const report = asRecord(input.content.decision_report);
  const optimization = asRecord(report?.sku_portfolio_optimization);
  const summary = asRecord(optimization?.optimization_summary);
  const skuDecisions = Array.isArray(optimization?.skuDecisions)
    ? optimization.skuDecisions
    : Array.isArray(report?.skuDecisions)
      ? report.skuDecisions
      : Array.isArray(input.content.skuDecisions) ? input.content.skuDecisions : [];

  return decisionGenerationLog.create({
    data: {
      workspaceId: input.workspaceId,
      sourceJobId: input.sourceJobId ?? null,
      decisionSnapshotId: input.decisionSnapshotId ?? null,
      optimizationType: input.optimizationType,
      algorithmVersion: input.versions.algorithmVersion,
      optimizationVersion: input.versions.optimizationVersion,
      canonicalSnapshotVersion: input.versions.canonicalSnapshotVersion,
      metricSnapshotVersion: input.versions.metricSnapshotVersion,
      simulationVersion: input.versions.simulationVersion,
      inputHash: input.versions.inputHash,
      simulationCount: toNumber(summary?.scenarios_tested) ?? 0,
      executionTimeMs: input.executionTimeMs,
      errorMessage: input.errorMessage ?? null,
      resultSummary: {
        state: input.content.state,
        warning: input.content.warning,
        optimizationRun: input.content.optimizationRun ?? null,
        skuDecisionCount: skuDecisions.length,
        expectedProfitGain: toNumber(summary?.total_expected_profit_gain) ?? toNumber(summary?.expected_profit_gain) ?? 0,
        currentPortfolioProfit: toNumber(summary?.current_portfolio_profit) ?? 0,
        optimizedPortfolioProfit: toNumber(summary?.optimized_portfolio_profit) ?? 0
      }
    }
  });
}

async function saveSimulationSnapshot(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sourceJobId?: string | null;
    decisionSnapshotId?: string | null;
    content: Record<string, unknown>;
  }
) {
  const snapshot = (prisma as unknown as {
    snapshot?: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  }).snapshot;
  if (!snapshot) return null;

  const report = asRecord(input.content.decision_report);
  const optimization = asRecord(report?.sku_portfolio_optimization);
  const summary = asRecord(optimization?.optimization_summary);
  const scenariosTested = toNumber(summary?.scenarios_tested) ?? 0;
  if (scenariosTested <= 0) return null;

  return snapshot.create({
    data: {
      workspaceId: input.workspaceId,
      sourceJobId: input.sourceJobId ?? null,
      type: "SIMULATION_SNAPSHOT",
      version: "sku_portfolio_simulation_v1",
      status: "READY",
      dataReference: {
        decisionSnapshotId: input.decisionSnapshotId,
        scenarios_tested: scenariosTested,
        baseline_profit: toNumber(summary?.current_portfolio_profit) ?? 0,
        optimized_profit: toNumber(summary?.optimized_portfolio_profit) ?? 0,
        expected_profit_gain: toNumber(summary?.total_expected_profit_gain) ?? toNumber(summary?.expected_profit_gain) ?? 0
      },
      metadataJson: {
        generatedFrom: "decision_snapshot_generator",
        assumptions: optimization?.assumptions ?? [],
        confidence_score: toNumber(optimization?.optimizationConfidenceScore) ?? toNumber(optimization?.optimization_confidence) ?? null,
        constraints_applied: Array.isArray(summary?.constraints_applied) ? summary?.constraints_applied : []
      }
    }
  });
}

function decisionSnapshotContent(
  loaded: LoadDashboardResult,
  versions: Awaited<ReturnType<typeof currentDecisionSnapshotVersions>>,
  runInput: {
    optimizationRunId?: string | null;
    startedAt?: string | null;
    activeDecisionContexts?: Map<string, ActiveDecisionContext>;
  } = {}
) {
  const report = loaded.data.decision_report;
  const profitInputModel = normalizeProfitInputs(loaded.data);
  const portfolioOptimization = report.sku_portfolio_optimization;
  const portfolioOptimizationRecord = asRecord(portfolioOptimization) ?? {};
  const policy = asRecord(portfolioOptimizationRecord.optimization_policy);
  const optimizationSummaryRecord = asRecord(portfolioOptimization.optimization_summary) ?? {};
  const scenariosTested = portfolioOptimization.optimization_summary.scenarios_tested ?? 0;
  const hasSimulationOutput = scenariosTested > 0;
  const hasEstimatedOptimizationInputs = profitInputModel.profitDataCoverage < 95 && hasSimulationOutput;
  const isPartialOptimization = profitInputModel.profitDataCoverage < 95 && !hasSimulationOutput;
  const optimizerSkuDecisions = portfolioOptimization.skuDecisions.length
    ? portfolioOptimization.skuDecisions
    : report.skuDecisions;
  const hasDecisionRows = optimizerSkuDecisions.length > 0 || report.sku_breakdown.top_revenue_skus.length > 0;
  const exposedReport = hasDecisionRows ? report : null;
  const partialRecommendations = partialSkuRecommendations(loaded, profitInputModel);
  const skuDecisions = isPartialOptimization
    ? partialRecommendations
    : optimizerSkuDecisions.length
      ? optimizerSkuDecisions
      : partialRecommendations;
  const recommendationIdentityContext: RecommendationIdentityContext = {
    optimizationRunId: runInput.optimizationRunId ?? null,
    policyVersion: typeof policy?.version === "string" ? policy.version : "expert-baseline-v1",
    optimizerVersion: versions.optimizationVersion,
    simulationVersion: versions.simulationVersion,
    dataVersion: versions.canonicalSnapshotVersion ?? versions.metricSnapshotVersion ?? versions.inputHash
  };
  const optimizationRun: OptimizationRunMetadata = {
    optimization_run_id: runInput.optimizationRunId ?? null,
    started_at: runInput.startedAt ?? new Date().toISOString(),
    completed_at: null,
    optimizer_version: recommendationIdentityContext.optimizerVersion,
    policy_version: recommendationIdentityContext.policyVersion,
    simulation_version: recommendationIdentityContext.simulationVersion,
    data_version: recommendationIdentityContext.dataVersion,
    analyzed_sku_count: toNumber(optimizationSummaryRecord.input_sku_count)
      ?? toNumber(optimizationSummaryRecord.portfolio_size)
      ?? skuDecisions.length
  };
  const profitabilityBySku = new Map(profitInputModel.rows.map((row) => [row.sku, row]));
  const compactReport = exposedReport
    ? compactDecisionReport(exposedReport, skuDecisions, runInput.activeDecisionContexts, recommendationIdentityContext, profitabilityBySku)
    : null;
  const compactProfitInputModel = {
    ...profitInputModel,
    rows: profitInputModel.rows.slice(0, PROFIT_INPUT_ROW_LIMIT)
  };

  return {
    ok: true,
    state: loaded.state,
    hasConnectedDataSource: loaded.state === "ready",
    message: hasEstimatedOptimizationInputs
      ? estimatedOptimizationMessage(profitInputModel.profitDataCoverage)
      : isPartialOptimization
      ? partialOptimizationMessage(profitInputModel.profitDataCoverage)
      : loaded.message ?? null,
    decision_report: compactReport,
    portfolioSummary: compactReport?.portfolioSummary ?? null,
    allocationRecommendation: compactReport?.allocationRecommendation ?? null,
    skuDecisions: [],
    riskAlerts: compactReport?.riskAlerts ?? [],
    executionPlan: compactReport?.executionPlan ?? [],
    generated_at: new Date().toISOString(),
    optimizationRun,
    source_platforms: loaded.data.metadata.source_platforms,
    lineage: loaded.lineage ?? null,
    decisionSnapshotVersions: {
      algorithmVersion: versions.algorithmVersion,
      optimizationVersion: versions.optimizationVersion,
      profitabilityEngineVersion: versions.profitabilityEngineVersion,
      policyVersion: optimizationRun.policy_version,
      canonicalSnapshotVersion: versions.canonicalSnapshotVersion,
      metricSnapshotVersion: versions.metricSnapshotVersion,
      simulationVersion: versions.simulationVersion,
      inputHash: versions.inputHash
    },
    profitInputModel: compactProfitInputModel,
    profitDataCoverage: profitInputModel.profitDataCoverage,
    optimizationLevel: profitInputModel.optimizationLevel,
    confidenceScore: profitInputModel.confidenceScore,
    missingDataRequirements: profitInputModel.profitDataCoverage < 95 ? profitInputModel.missingFields : [],
    warning: hasEstimatedOptimizationInputs
      ? "ESTIMATED_OPTIMIZATION_INPUTS"
      : isPartialOptimization
      ? "PARTIAL_OPTIMIZATION_INPUTS"
      : loaded.state === "ready" ? null : "DECISION_SNAPSHOT_PARTIAL"
  };
}

function estimatedOptimizationMessage(coverage: number) {
  if (coverage >= 70) {
    return "Optimization ran with estimated profit inputs. Review confidence and assumptions before executing actions.";
  }

  return "Optimization ran with estimated costs and partial profit inputs. Recommendations include reduced confidence and assumptions.";
}

function compactDecisionReport(
  report: NonNullable<LoadDashboardResult["data"]["decision_report"]>,
  skuDecisions: unknown[],
  activeDecisionContexts?: Map<string, ActiveDecisionContext>,
  recommendationIdentityContext?: RecommendationIdentityContext,
  profitabilityBySku?: Map<string, ProfitInputRow>
) {
  const compactPortfolio = compactPortfolioOptimization(report.sku_portfolio_optimization, skuDecisions, activeDecisionContexts, recommendationIdentityContext, profitabilityBySku);
  const compactSkuBreakdown = compactSkuBreakdownRows(report.sku_breakdown, compactPortfolio.skuDecisions);

  return {
    executive_summary: report.executive_summary,
    performance_overview: report.performance_overview,
    sku_breakdown: compactSkuBreakdown,
    ads_breakdown: {
      ...report.ads_breakdown,
      campaign_performance: []
    },
    customer_breakdown: {
      ...report.customer_breakdown,
      cohort_by_first_purchase_month: [],
      revenue_per_customer_segment: [],
      profit_per_customer_segment: [],
      ads_cost_per_customer_segment: []
    },
    data_quality: report.data_quality,
    metadata: report.metadata,
    sku_portfolio_optimization: compactPortfolio,
    skuDecisions: [],
    portfolioSummary: compactPortfolio.portfolioSummary,
    allocationRecommendation: compactPortfolio.allocationRecommendation,
    riskAlerts: compactPortfolio.riskAlerts,
    executionPlan: compactPortfolio.executionPlan,
    insight_summary: report.insight_summary
  };
}

function compactSkuBreakdownRows(
  breakdown: NonNullable<LoadDashboardResult["data"]["decision_report"]>["sku_breakdown"],
  decisionRows: unknown[]
) {
  const decisionSkuIds = new Set(
    decisionRows
      .map((row) => String(asRecord(row)?.skuId ?? asRecord(row)?.sku ?? "").trim())
      .filter(Boolean)
  );

  return {
    ...breakdown,
    top_revenue_skus: compactSkuRows(breakdown.top_revenue_skus, decisionSkuIds),
    top_profit_skus: compactSkuRows(breakdown.top_profit_skus, decisionSkuIds)
  };
}

function compactSkuRows<T extends { sku: string }>(rows: T[], prioritySkuIds: Set<string>) {
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  const selected: T[] = [];
  const selectedSkuIds = new Set<string>();

  for (const sku of prioritySkuIds) {
    const row = bySku.get(sku);
    if (!row || selectedSkuIds.has(row.sku)) continue;
    selected.push(row);
    selectedSkuIds.add(row.sku);
  }

  for (const row of rows) {
    if (selectedSkuIds.has(row.sku)) continue;
    selected.push(row);
    selectedSkuIds.add(row.sku);
  }

  return selected;
}

function compactDecisionRows(
  rows: unknown[],
  activeDecisionContexts?: Map<string, ActiveDecisionContext>,
  recommendationIdentityContext?: RecommendationIdentityContext,
  profitabilityBySku?: Map<string, ProfitInputRow>
) {
  return rows.map((row) => {
    const record = asRecord(row) ?? {};
    const skuId = String(record.skuId ?? record.sku ?? "").trim();
    const profitability = profitabilityBySku?.get(skuId) ?? profitabilityBySku?.get(String(record.sku ?? ""));
    const timing = asRecord(record.timing) ?? {};
    const simulationHorizon = asRecord(record.simulation_horizon) ?? {};
    const simulation = asRecord(record.simulation) ?? {};
    const beforeState = asRecord(record.before_state) ?? {};
    const inventoryEvidence = decisionContractInventoryEvidence(record.decision_contract);
    const expectedProfitImpact = profitImpactValue(record);

    return {
      recommendation_id: recommendationIdentityForDecision(record, recommendationIdentityContext),
      optimization_run_id: recommendationIdentityContext?.optimizationRunId ?? null,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      sku_id: skuId || record.skuId || record.sku,
      action_type: record.action,
      revenue: profitability?.revenue ?? null,
      cogs: profitability?.cogs ?? null,
      shipping_cost: profitability?.shipping_cost ?? null,
      fulfillment_cost: profitability?.fulfillment_cost ?? null,
      warehouse_cost: profitability?.warehouse_cost ?? null,
      platform_fee: profitability?.platform_fee ?? null,
      payment_fee: profitability?.payment_fee ?? null,
      refund_cost: profitability?.refunds ?? null,
      operating_cost: profitability?.operating_cost ?? null,
      ads_spend: profitability?.ad_spend ?? null,
      ad_cost_allocated: profitability?.ad_spend ?? null,
      total_cost: profitability?.total_cost ?? null,
      gross_profit: profitability?.gross_profit ?? null,
      net_profit: profitability?.net_profit ?? null,
      margin: profitability?.margin ?? null,
      cogs_status: profitability?.cogs_status ?? null,
      cogs_confidence: profitability?.cogs_confidence ?? null,
      ad_allocation_method: profitability?.ad_allocation_method ?? null,
      attribution_confidence: profitability?.attribution_confidence ?? null,
      profitability_confidence: profitability?.profitability_confidence ?? null,
      validation_status: profitability?.validation_status ?? null,
      optimization_allowed: profitability?.optimization_allowed ?? null,
      skuId: record.skuId,
      sku: record.sku ?? record.skuId,
      previous_decision_context: activeDecisionContextForSku(activeDecisionContexts, skuId),
      action: record.action,
      sourceAction: record.sourceAction,
      canonical_action: record.canonical_action,
      decision_contract: record.decision_contract,
      policy_trace: record.policy_trace,
      unified_action: record.unified_action,
      optimization_goal: record.optimization_goal,
      opportunity_type: record.opportunity_type,
      profit_delta: expectedProfitImpact,
      expected_profit_impact: expectedProfitImpact,
      expectedProfitImpact,
      estimatedProfitImpact: expectedProfitImpact,
      confidence: record.confidence,
      inventoryRisk: record.inventoryRisk,
      budgetOpportunity: record.budgetOpportunity,
      lifecycle_stage: record.lifecycle_stage,
      skuRole: record.skuRole,
      risk_level: record.risk_level,
      risk: record.risk,
      priority: record.priority,
      action_score: record.action_score,
      time_to_impact: record.time_to_impact,
      recommendedActions: record.recommendedActions,
      recommendedExecution: record.recommendedExecution,
      timing: {
        simulation_window_days: timing.simulation_window_days,
        simulation_window_start: timing.simulation_window_start,
        simulation_window_end: timing.simulation_window_end,
        timing_source: timing.timing_source
      },
      simulation_horizon: {
        days: simulationHorizon.days
      },
      simulation: {
        required_inventory: simulation.required_inventory ?? inventoryEvidence.requiredInventory,
        current_inventory: simulation.current_inventory ?? inventoryEvidence.currentInventory,
        current_ads_spend: simulation.current_ads_spend,
        recommended_ads_spend: simulation.recommended_ads_spend
      },
      before_state: {
        inventory: beforeState.inventory ?? inventoryEvidence.currentInventory
      }
    };
  });
}

function compactPortfolioRows(
  rows: unknown[],
  activeDecisionContexts?: Map<string, ActiveDecisionContext>,
  recommendationIdentityContext?: RecommendationIdentityContext,
  profitabilityBySku?: Map<string, ProfitInputRow>
) {
  return rows.map((row) => {
    const record = asRecord(row) ?? {};
    const skuId = String(record.sku ?? record.skuId ?? "").trim();
    const profitability = profitabilityBySku?.get(skuId) ?? profitabilityBySku?.get(String(record.sku_id ?? ""));
    const simulation = asRecord(record.simulation) ?? {};
    const beforeState = asRecord(record.before_state) ?? {};
    const inventoryEvidence = decisionContractInventoryEvidence(record.decision_contract);
    const expectedProfitImpact = profitImpactValue(record);

    return {
      recommendation_id: recommendationIdentityForDecision(record, recommendationIdentityContext),
      optimization_run_id: recommendationIdentityContext?.optimizationRunId ?? null,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      sku_id: skuId || record.sku || record.skuId,
      action_type: record.action ?? record.canonical_action ?? record.unified_action,
      expected_profit_impact: expectedProfitImpact,
      revenue: profitability?.revenue ?? null,
      cogs: profitability?.cogs ?? null,
      shipping_cost: profitability?.shipping_cost ?? null,
      fulfillment_cost: profitability?.fulfillment_cost ?? null,
      warehouse_cost: profitability?.warehouse_cost ?? null,
      platform_fee: profitability?.platform_fee ?? null,
      payment_fee: profitability?.payment_fee ?? null,
      refund_cost: profitability?.refunds ?? null,
      operating_cost: profitability?.operating_cost ?? null,
      ads_spend: profitability?.ad_spend ?? null,
      ad_cost_allocated: profitability?.ad_spend ?? null,
      total_cost: profitability?.total_cost ?? null,
      gross_profit: profitability?.gross_profit ?? null,
      net_profit: profitability?.net_profit ?? null,
      margin: profitability?.margin ?? null,
      cogs_status: profitability?.cogs_status ?? null,
      cogs_confidence: profitability?.cogs_confidence ?? null,
      ad_allocation_method: profitability?.ad_allocation_method ?? null,
      attribution_confidence: profitability?.attribution_confidence ?? null,
      profitability_confidence: profitability?.profitability_confidence ?? null,
      validation_status: profitability?.validation_status ?? null,
      optimization_allowed: profitability?.optimization_allowed ?? null,
      sku: record.sku,
      previous_decision_context: activeDecisionContextForSku(activeDecisionContexts, skuId),
      product_name: record.product_name,
      current_profit: record.current_profit,
      predicted_profit: record.predicted_profit,
      profit_delta: expectedProfitImpact,
      expectedProfitImpact,
      estimatedProfitImpact: expectedProfitImpact,
      recommended_action: record.recommended_action,
      action: record.action,
      unified_action: record.unified_action,
      canonical_action: record.canonical_action,
      decision_contract: record.decision_contract,
      policy_trace: record.policy_trace,
      lifecycle_stage: record.lifecycle_stage,
      simulation: {
        current_ads_spend: simulation.current_ads_spend,
        recommended_ads_spend: simulation.recommended_ads_spend,
        predicted_revenue: simulation.predicted_revenue,
        required_inventory: simulation.required_inventory ?? inventoryEvidence.requiredInventory,
        current_inventory: simulation.current_inventory ?? inventoryEvidence.currentInventory,
        inventory_impact: simulation.inventory_impact ?? inventoryEvidence.inventoryDelta
      },
      before_state: {
        inventory: beforeState.inventory ?? inventoryEvidence.currentInventory
      }
    };
  });
}

function decisionContractInventoryEvidence(value: unknown) {
  const contract = asRecord(value) ?? {};
  const contractEvidence = asRecord(contract.evidence) ?? {};
  const trace = asRecord(contract.trace) ?? {};
  const traceEvidence = asRecord(trace.evidence) ?? {};

  return {
    currentInventory: traceEvidence.current_inventory ?? contractEvidence.currentInventory ?? null,
    requiredInventory: traceEvidence.required_inventory ?? contractEvidence.requiredInventory ?? null,
    inventoryDelta: traceEvidence.inventory_delta ?? contractEvidence.inventoryDelta ?? contractEvidence.recommendedInventoryChange ?? null
  };
}

function recommendationIdentityForDecision(
  record: Record<string, unknown>,
  context?: RecommendationIdentityContext
) {
  return recommendationIdFromRecord(record, context);
}

function compactPortfolioOptimization(
  optimization: LoadDashboardResult["data"]["decision_report"]["sku_portfolio_optimization"],
  fallbackSkuDecisions: unknown[] = [],
  activeDecisionContexts?: Map<string, ActiveDecisionContext>,
  recommendationIdentityContext?: RecommendationIdentityContext,
  profitabilityBySku?: Map<string, ProfitInputRow>
) {
  const portfolioSkuDecisions = optimization.skuDecisions.length
    ? optimization.skuDecisions
    : fallbackSkuDecisions;
  const availableSkuDecisions = portfolioSkuDecisions;
  const queueDecisionRows = availableSkuDecisions.filter((row) => isOptimizationCandidateRow(row, activeDecisionContexts, recommendationIdentityContext));
  const compactSkuDecisions = compactDecisionRows(queueDecisionRows, activeDecisionContexts, recommendationIdentityContext, profitabilityBySku);
  const compactRecommendedPortfolio = compactPortfolioRows(
    optimization.recommended_portfolio,
    activeDecisionContexts,
    recommendationIdentityContext,
    profitabilityBySku
  );
  const monitorCount = compactSkuDecisions.filter((row) => asRecord(row)?.action === "MONITOR").length;
  const totalProfitImpact = compactSkuDecisions.reduce<number>((sum, row) => {
    const record = asRecord(row);
    return sum + (record ? profitImpactValue(record) ?? 0 : 0);
  }, 0);

  return {
    ...optimization,
    optimization_summary: {
      ...optimization.optimization_summary,
      total_opportunities: compactSkuDecisions.length,
      selected_sku_count: compactSkuDecisions.length,
      expected_profit_gain: totalProfitImpact,
      total_expected_profit_gain: totalProfitImpact,
      constraints_applied: Array.from(new Set([
        ...optimization.optimization_summary.constraints_applied,
        ...(activeDecisionContexts?.size ? ["active_decision_context_included"] : []),
        ...(optimization.skuDecisions.length ? [] : ["partial_recommendations_from_profit_input_model"])
      ]))
    },
    recommended_portfolio: compactRecommendedPortfolio,
    portfolioSummary: optimization.portfolioSummary.totalProfitImpact || compactSkuDecisions.length
      ? {
        ...optimization.portfolioSummary,
        totalProfitImpact,
        monitorCount: Math.max(optimization.portfolioSummary.monitorCount, monitorCount),
        optimizeCount: optimization.portfolioSummary.optimizeCount || Math.max(0, compactSkuDecisions.length - monitorCount)
      }
      : optimization.portfolioSummary,
    lifecycleClassifications: [],
    currentPortfolio: undefined,
    allocationRecommendation: {
      ...optimization.allocationRecommendation,
      current: optimization.allocationRecommendation.current,
      recommended: optimization.allocationRecommendation.recommended
    },
    skuDecisions: compactSkuDecisions,
    riskAlerts: optimization.riskAlerts.slice(0, 50),
    executionPlan: optimization.executionPlan.length
      ? optimization.executionPlan.slice(0, 50)
      : compactSkuDecisions.length
        ? [{
          step: 1,
          action: "MONITOR",
          description: "Review partial optimization recommendations after enriching cost, refund, SKU-level ad spend, inventory, and channel inputs.",
          skuIds: compactSkuDecisions.map((row) => String(asRecord(row)?.skuId ?? "")).filter(Boolean),
          estimatedProfitImpact: totalProfitImpact
        }]
        : [],
    budget_plan: [],
    pricing_plan: [],
    inventory_plan: [],
    simulations: []
  };
}

function isOptimizationCandidateRow(
  row: unknown,
  activeDecisionContexts?: Map<string, ActiveDecisionContext>,
  recommendationIdentityContext?: RecommendationIdentityContext
) {
  const record = asRecord(row) ?? {};
  const skuId = String(record.skuId ?? record.sku ?? record.sku_id ?? "").trim();
  const recommendationId = recommendationIdentityForDecision(record, recommendationIdentityContext);
  const matchingAcceptedAction = skuId
    ? activeDecisionContexts?.get(skuId)?.activeActions.find((action) =>
      (action.status === "ACCEPTED" || action.status === "EXECUTING") &&
      (action.recommendationId === recommendationId || legacyActiveActionMatchesRecommendation(action, record))
    )
    : null;
  if (matchingAcceptedAction) {
    return false;
  }

  const action = typeof record.action === "string" ? record.action : "";
  const impact = Math.abs(profitImpactValue(record) ?? 0);

  return action !== "MONITOR" || impact > 1 || record.inventoryRisk === true || record.budgetOpportunity === true;
}

function legacyActiveActionMatchesRecommendation(
  action: ActiveDecisionContext["activeActions"][number],
  record: Record<string, unknown>
) {
  const currentAction = String(record.action ?? record.action_type ?? "").trim().toUpperCase();
  const activeAction = String(action.actionType ?? "").trim().toUpperCase();
  if (!currentAction || !activeAction || currentAction !== activeAction) return false;

  const simulation = asRecord(record.simulation) ?? {};
  const currentAdDelta = metricDelta(simulation.recommended_ads_spend, simulation.current_ads_spend);
  if (currentAdDelta == null || action.adBudgetChange == null) return false;

  return Math.abs(currentAdDelta - action.adBudgetChange) <= 0.01;
}

function metricDelta(after: unknown, before: unknown) {
  const next = toNumber(after);
  const current = toNumber(before);
  if (next == null || current == null) return null;
  return Math.round((next - current) * 100) / 100;
}

function partialOptimizationMessage(coverage: number) {
  if (coverage >= 70) {
    return "Partial profit data is available. Showing growth and ad optimization recommendations with reduced confidence.";
  }

  if (coverage >= 40) {
    return "Sales data is available. Showing trend-based recommendations while cost, inventory, or refund inputs are incomplete.";
  }

  return OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function partialExpectedProfitImpact(input: {
  row: { revenue?: unknown; profit?: unknown };
  profitRow?: ProfitInputRow;
  confidence: number;
  coverage: number;
}) {
  const revenue = toNumber(input.profitRow?.revenue) ?? toNumber(input.row.revenue) ?? 0;
  const netProfit = toNumber(input.profitRow?.net_profit) ?? toNumber(input.row.profit) ?? 0;
  const grossProfit = toNumber(input.profitRow?.gross_profit) ?? 0;
  const margin = Math.max(0.05, Math.min(0.65, toNumber(input.profitRow?.contribution_margin) ?? toNumber(input.profitRow?.margin) ?? 0.25));
  const confidenceFactor = Math.max(0.2, Math.min(0.8, input.confidence));
  const coverageFactor = Math.max(0.35, Math.min(1, input.coverage / 100));
  const baseProfit = netProfit > 0
    ? netProfit
    : grossProfit > 0
      ? grossProfit
      : revenue * margin;
  const liftRate = input.coverage >= 70 ? 0.08 : 0.035;
  const estimate = baseProfit * liftRate * confidenceFactor * coverageFactor;
  if (estimate > 0) return roundMoney(Math.max(1, estimate));
  return 0;
}

function partialSkuRecommendations(
  loaded: LoadDashboardResult,
  profitInputModel: ReturnType<typeof normalizeProfitInputs>
) {
  const topRows = loaded.data.decision_report.sku_breakdown.top_profit_skus.length
    ? loaded.data.decision_report.sku_breakdown.top_profit_skus
    : loaded.data.decision_report.sku_breakdown.top_revenue_skus.length
      ? loaded.data.decision_report.sku_breakdown.top_revenue_skus
      : loaded.data.sku_analysis.top_skus;

  return topRows.slice(0, PROFIT_INPUT_ROW_LIMIT).map((row, index) => {
    const profitRow = profitInputModel.rows.find((item) => item.sku === row.sku);
    const confidence = Math.max(0.25, profitRow?.confidence ?? profitInputModel.confidenceScore);
    const action = "OPTIMIZE";
    const sourceAction = profitInputModel.profitDataCoverage >= 70 ? "VALIDATE_AND_SCALE" : "ENRICH_PROFIT_INPUTS";
    const recommendation = profitInputModel.profitDataCoverage >= 70
      ? "Revenue and demand signals are available, but missing profit inputs reduce certainty. Validate unit costs, shipping cost, platform fee, payment fee, refunds, SKU-level ad spend, inventory, and channel data before increasing spend materially."
      : "Sales activity is present, but profit inputs are incomplete. Track this SKU and enrich cost, refund, SKU-level ad spend, inventory, and channel data before running full optimization.";
    const title = profitInputModel.profitDataCoverage >= 70
      ? `Review growth opportunity for ${row.sku}`
      : `Enrich profit inputs for ${row.sku}`;
    const missingFields = profitRow?.missingFields.length ? profitRow.missingFields : profitInputModel.missingFields;
    const expectedProfitImpact = partialExpectedProfitImpact({
      row,
      profitRow,
      confidence,
      coverage: profitInputModel.profitDataCoverage
    });

    return {
      id: `partial-${row.sku}-${index}`,
      skuId: row.sku,
      sku: row.sku,
      action,
      skuRole: "GROWTH",
      sourceAction,
      inventoryRisk: false,
      budgetOpportunity: profitInputModel.profitDataCoverage >= 70,
      profit_delta: expectedProfitImpact,
      expected_profit_impact: expectedProfitImpact,
      expectedProfitImpact,
      estimatedProfitImpact: expectedProfitImpact,
      revenue: row.revenue,
      units: row.quantity,
      confidence,
      confidenceScore: confidence,
      action_score: confidence,
      risk: 1 - confidence,
      risk_level: "medium",
      cash_impact: 0,
      time_to_impact: "After profit inputs are enriched",
      optimization_goal: profitInputModel.profitDataCoverage >= 70 ? "GROWTH_VALIDATION" : "INPUT_ENRICHMENT",
      unified_action: sourceAction,
      display: {
        title,
        icon: "trend",
        category: profitInputModel.profitDataCoverage >= 70 ? "growth" : "portfolio-health",
        description: recommendation,
        subtitle: "Partial optimization",
        reason: missingFields.slice(0, 3).join(", ") || "Profit inputs are incomplete.",
        impact_label: expectedProfitImpact > 0
          ? `Conservative estimated lift: ${expectedProfitImpact}`
          : "Input enrichment required"
      },
      reasoning: {
        title: "Partial recommendation generated from available sales signals.",
        reasons: missingFields.slice(0, 3).map((field) => ({
          signal: "Missing input",
          metric: field,
          explanation: "This field is required before generating reliable profit impact."
        })),
        summary: recommendation
      },
      priority: index + 1,
      reasons: [recommendation],
      decisionDrivers: [],
      causalExplanation: {
        summary: recommendation,
        primaryDriver: "Data completeness",
        supportingSignals: missingFields.slice(0, 5)
      },
      risks: missingFields.slice(0, 5),
      comparisonInsights: [],
      recommendedActions: [recommendation],
      recommendedExecution: [recommendation],
      evidence: {
        margin: profitRow?.contribution_margin ?? 0,
        roas: null,
        inventoryRunwayDays: null,
        revenueDelta: expectedProfitImpact > 0 && (profitRow?.contribution_margin ?? 0) > 0
          ? roundMoney(expectedProfitImpact / Math.max(0.05, profitRow?.contribution_margin ?? 0.25))
          : 0,
        marginChange: 0
      },
      simulation_horizon: {
        days: 30,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      },
      timing: {
        action_start_at: new Date().toISOString(),
        simulation_window_days: 30,
        simulation_window_start: new Date().toISOString().slice(0, 10),
        simulation_window_end: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        baseline_period_start: new Date().toISOString().slice(0, 10),
        baseline_period_end: new Date().toISOString().slice(0, 10),
        tracking_window_days: 30,
        tracking_window_start: new Date().toISOString().slice(0, 10),
        tracking_window_end: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        timing_source: "fallback_today"
      },
      confidence_breakdown: {
        data_quality: confidence,
        model_confidence: confidence,
        action_confidence: confidence,
        risk_confidence: confidence
      },
      constraints_passed: ["partial_recommendation"],
      ai_evidence: [],
      scenarios: [],
      alternative_actions: [],
      selected_scenario: {
        action: sourceAction,
        profit_delta: expectedProfitImpact,
        confidence,
        selected: true,
        status: "Selected"
      },
      decision_explanation: {
        selected_action: sourceAction,
        selection_reason: recommendation,
        rejected_actions: []
      },
      tracking_status: "RECOMMENDED",
      feedback: {
        prediction_error: null,
        actual_profit_lift: null,
        learned: false
      },
      sku_decision_object: {
        sku: row.sku,
        action: sourceAction,
        recommendation,
        expected_profit_impact: expectedProfitImpact,
        confidence,
        scenarios: []
      },
      title,
      recommendation,
      missingFields,
      optimizationLevel: profitInputModel.optimizationLevel,
      estimated: true
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function profitImpactValue(record: Record<string, unknown>) {
  const simulation = asRecord(record.simulation);
  const candidates = [
    record.profit_delta,
    simulation?.profit_delta,
    record.expected_profit_impact,
    record.expectedProfitImpact,
    record.estimatedProfitImpact
  ];
  const nonZero = candidates
    .map((value) => toNumber(value))
    .find((value) => value !== null && Math.abs(value) > 0.000001);
  if (nonZero !== undefined && nonZero !== null) return nonZero;

  const sourceAction = String(record.sourceAction ?? record.unified_action ?? "").toUpperCase();
  const confidence = Math.max(0.2, Math.min(0.8, toNumber(record.confidence) ?? toNumber(record.confidenceScore) ?? 0.25));
  const margin = Math.max(0.05, Math.min(0.65, toNumber(record.margin) ?? toNumber(record.contribution_margin) ?? 0.25));
  const revenue = toNumber(record.revenue) ?? 0;
  const netProfit = toNumber(record.net_profit) ?? 0;
  const grossProfit = toNumber(record.gross_profit) ?? 0;
  const baseProfit = netProfit > 0 ? netProfit : grossProfit > 0 ? grossProfit : revenue * margin;
  const shouldEstimate = baseProfit > 0 && (
    sourceAction === "VALIDATE_AND_SCALE" ||
    record.budgetOpportunity === true ||
    record.action === "OPTIMIZE"
  );
  if (shouldEstimate) {
    const liftRate = sourceAction === "VALIDATE_AND_SCALE" ? 0.08 : 0.035;
    return roundMoney(Math.max(1, baseProfit * liftRate * confidence));
  }

  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}
