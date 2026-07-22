import type { PrismaClient } from "@prisma/client";
import {
  loadEcommerceSalesDashboardData,
  type LoadDashboardResult
} from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { upsertDecisionSnapshot } from "@/lib/dashboard/snapshot-store";
import { normalizeProfitInputs } from "@/lib/profit/profit-input-normalizer";

type DecisionMode = "full" | "sku";

type GenerateDecisionSnapshotsResult = {
  generated: Array<{
    mode: DecisionMode;
    optimizationType: string;
    snapshotId: string | null;
    state: LoadDashboardResult["state"];
  }>;
};

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but operating reports need sales/order history, order line items, refunds, customers, inventory, unit costs, fulfillment costs, and ad spend to generate reliable KPIs and recommendations.";
const SNAPSHOT_ROW_LIMIT = 100;

export async function generateEcommerceDecisionSnapshots(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    dataSourceId?: string | null;
  }
): Promise<GenerateDecisionSnapshotsResult> {
  const generated: GenerateDecisionSnapshotsResult["generated"] = [];

  for (const mode of ["full", "sku"] as const) {
    const loaded = await loadEcommerceSalesDashboardData({
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId ?? null,
      decisionMode: mode
    });
    const content = decisionSnapshotContent(loaded);
    const decisionReport = content.decision_report;
    const portfolioSummary = decisionReport?.portfolioSummary;
    const snapshot = await upsertDecisionSnapshot(prisma, {
      workspaceId: input.workspaceId,
      optimizationType: mode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION",
      content,
      assumptions: {
        generatedFrom: "canonical_snapshot",
        dashboardState: loaded.state,
        dataSourceId: input.dataSourceId ?? null,
        lineage: loaded.lineage ?? null
      },
      expectedProfitImpact: typeof portfolioSummary?.totalProfitImpact === "number"
        ? portfolioSummary.totalProfitImpact
        : null
    });

    generated.push({
      mode,
      optimizationType: mode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION",
      snapshotId: typeof snapshot?.id === "string" ? snapshot.id : null,
      state: loaded.state
    });
  }

  return { generated };
}

function decisionSnapshotContent(loaded: LoadDashboardResult) {
  const report = loaded.data.decision_report;
  const profitInputModel = normalizeProfitInputs(loaded.data);
  const isPartialOptimization = profitInputModel.profitDataCoverage < 95;
  const hasDecisionRows = report.skuDecisions.length > 0 || report.sku_breakdown.top_revenue_skus.length > 0;
  const exposedReport = hasDecisionRows ? report : null;
  const skuDecisions = exposedReport?.skuDecisions.length
    ? exposedReport.skuDecisions
    : partialSkuRecommendations(loaded, profitInputModel);
  const compactReport = exposedReport ? compactDecisionReport(exposedReport, skuDecisions) : null;
  const compactProfitInputModel = {
    ...profitInputModel,
    rows: profitInputModel.rows.slice(0, SNAPSHOT_ROW_LIMIT)
  };

  return {
    ok: true,
    state: loaded.state,
    hasConnectedDataSource: loaded.state === "ready",
    message: isPartialOptimization
      ? partialOptimizationMessage(profitInputModel.profitDataCoverage)
      : loaded.message ?? null,
    decision_report: compactReport,
    portfolioSummary: compactReport?.portfolioSummary ?? null,
    allocationRecommendation: compactReport?.allocationRecommendation ?? null,
    skuDecisions: skuDecisions.slice(0, SNAPSHOT_ROW_LIMIT),
    riskAlerts: compactReport?.riskAlerts ?? [],
    executionPlan: compactReport?.executionPlan ?? [],
    generated_at: new Date().toISOString(),
    source_platforms: loaded.data.metadata.source_platforms,
    lineage: loaded.lineage ?? null,
    profitInputModel: compactProfitInputModel,
    profitDataCoverage: profitInputModel.profitDataCoverage,
    optimizationLevel: profitInputModel.optimizationLevel,
    confidenceScore: profitInputModel.confidenceScore,
    missingDataRequirements: isPartialOptimization ? profitInputModel.missingFields : [],
    warning: isPartialOptimization
      ? "PARTIAL_OPTIMIZATION_INPUTS"
      : loaded.state === "ready" ? null : "DECISION_SNAPSHOT_PARTIAL"
  };
}

function compactDecisionReport(
  report: NonNullable<LoadDashboardResult["data"]["decision_report"]>,
  skuDecisions: unknown[]
) {
  return {
    ...report,
    sku_breakdown: {
      ...report.sku_breakdown,
      top_revenue_skus: report.sku_breakdown.top_revenue_skus.slice(0, SNAPSHOT_ROW_LIMIT),
      top_profit_skus: report.sku_breakdown.top_profit_skus.slice(0, SNAPSHOT_ROW_LIMIT)
    },
    sku_optimization_algorithm: compactSkuOptimizationAlgorithm(report.sku_optimization_algorithm),
    sku_portfolio_optimization: compactPortfolioOptimization(report.sku_portfolio_optimization),
    sku_portfolio_report: compactPortfolioReport(report.sku_portfolio_report),
    skuDecisions: skuDecisions.slice(0, SNAPSHOT_ROW_LIMIT),
    riskAlerts: report.riskAlerts.slice(0, 50),
    executionPlan: report.executionPlan.slice(0, 50),
    profit_control_insights: report.profit_control_insights.slice(0, SNAPSHOT_ROW_LIMIT),
    sku_classification_signals: report.sku_classification_signals.slice(0, SNAPSHOT_ROW_LIMIT)
  };
}

function compactSkuOptimizationAlgorithm(
  algorithm: LoadDashboardResult["data"]["decision_report"]["sku_optimization_algorithm"]
) {
  return {
    ...algorithm,
    input_rows: algorithm.input_rows.slice(0, SNAPSHOT_ROW_LIMIT),
    ranked_skus: algorithm.ranked_skus.slice(0, SNAPSHOT_ROW_LIMIT),
    scale_ads_skus: algorithm.scale_ads_skus.slice(0, SNAPSHOT_ROW_LIMIT),
    reduce_or_stop_ads_skus: algorithm.reduce_or_stop_ads_skus.slice(0, SNAPSHOT_ROW_LIMIT),
    raise_price_skus: algorithm.raise_price_skus.slice(0, SNAPSHOT_ROW_LIMIT),
    replenish_inventory_skus: algorithm.replenish_inventory_skus.slice(0, SNAPSHOT_ROW_LIMIT),
    budget_allocation: algorithm.budget_allocation.slice(0, SNAPSHOT_ROW_LIMIT),
    constraints: {
      ...algorithm.constraints,
      inventory_constrained_skus: algorithm.constraints.inventory_constrained_skus.slice(0, SNAPSHOT_ROW_LIMIT),
      negative_profit_skus: algorithm.constraints.negative_profit_skus.slice(0, SNAPSHOT_ROW_LIMIT)
    }
  };
}

function compactPortfolioOptimization(
  optimization: LoadDashboardResult["data"]["decision_report"]["sku_portfolio_optimization"]
) {
  return {
    ...optimization,
    recommended_portfolio: optimization.recommended_portfolio.slice(0, SNAPSHOT_ROW_LIMIT),
    lifecycleClassifications: optimization.lifecycleClassifications.slice(0, SNAPSHOT_ROW_LIMIT),
    currentPortfolio: Array.isArray((optimization as unknown as Record<string, unknown>).currentPortfolio)
      ? ((optimization as unknown as Record<string, unknown>).currentPortfolio as unknown[]).slice(0, SNAPSHOT_ROW_LIMIT)
      : undefined,
    allocationRecommendation: {
      ...optimization.allocationRecommendation,
      current: optimization.allocationRecommendation.current.slice(0, SNAPSHOT_ROW_LIMIT),
      recommended: optimization.allocationRecommendation.recommended.slice(0, SNAPSHOT_ROW_LIMIT)
    },
    skuDecisions: optimization.skuDecisions.slice(0, SNAPSHOT_ROW_LIMIT),
    riskAlerts: optimization.riskAlerts.slice(0, 50),
    executionPlan: optimization.executionPlan.slice(0, 50),
    budget_plan: optimization.budget_plan.slice(0, SNAPSHOT_ROW_LIMIT),
    pricing_plan: optimization.pricing_plan.slice(0, SNAPSHOT_ROW_LIMIT),
    inventory_plan: optimization.inventory_plan.slice(0, SNAPSHOT_ROW_LIMIT),
    simulations: optimization.simulations.slice(0, SNAPSHOT_ROW_LIMIT)
  };
}

function compactPortfolioReport(
  report: LoadDashboardResult["data"]["decision_report"]["sku_portfolio_report"]
) {
  const record = report as unknown as Record<string, unknown>;

  return {
    ...report,
    decision_sections: Array.isArray(record.decision_sections) ? record.decision_sections.slice(0, 20) : record.decision_sections,
    next_steps: Array.isArray(record.next_steps) ? record.next_steps.slice(0, 20) : record.next_steps
  };
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

function partialSkuRecommendations(
  loaded: LoadDashboardResult,
  profitInputModel: ReturnType<typeof normalizeProfitInputs>
) {
  const topRows = loaded.data.sku_analysis.top_skus.length
    ? loaded.data.sku_analysis.top_skus
    : loaded.data.decision_report.sku_breakdown.top_revenue_skus;

  return topRows.slice(0, 10).map((row, index) => {
    const profitRow = profitInputModel.rows.find((item) => item.sku === row.sku);
    const confidence = Math.max(0.25, profitRow?.confidence ?? profitInputModel.confidenceScore);

    return {
      id: `partial-${row.sku}-${index}`,
      sku: row.sku,
      action: profitInputModel.profitDataCoverage >= 70 ? "MONITOR_AND_SCALE" : "MONITOR_TREND",
      title: profitInputModel.profitDataCoverage >= 70
        ? `Review growth opportunity for ${row.sku}`
        : `Monitor sales trend for ${row.sku}`,
      recommendation: profitInputModel.profitDataCoverage >= 70
        ? "Revenue and demand signals are available, but missing cost inputs reduce profit certainty. Validate unit costs and fulfillment costs before increasing spend materially."
        : "Sales activity is present, but profit inputs are incomplete. Track this SKU and enrich cost, inventory, refund, and ad spend data before running full optimization.",
      expectedProfitImpact: null,
      revenue: row.revenue,
      units: row.quantity,
      confidence,
      confidenceScore: confidence,
      missingFields: profitRow?.missingFields.length ? profitRow.missingFields : profitInputModel.missingFields,
      optimizationLevel: profitInputModel.optimizationLevel,
      estimated: true
    };
  });
}
