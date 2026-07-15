import { roundCurrency } from "@/lib/optimization/objective";
import type { OptimizationActionTiming, PortfolioOptimizationResult } from "@/lib/optimization/portfolio-optimizer";

export type PortfolioOptimizationBusinessReport = {
  executive_summary: {
    current_profit: number;
    optimized_profit: number;
    profit_lift: number;
    prediction_confidence: number;
    optimization_confidence: number;
    simulation_source: string;
    summary: string;
  };
  top_actions: Array<{
    title: string;
    reason: string;
    expected_profit_impact: number;
    evidence: string[];
    lifecycle_stage?: string;
    lifecycle_signals?: string[];
    simulation: Record<string, number | string>;
    simulation_estimate?: PortfolioOptimizationResult["recommended_portfolio"][number]["simulation_estimate"];
    timing?: OptimizationActionTiming;
    confidence: number;
  }>;
  budget_summary: string;
  pricing_summary: string;
  inventory_summary: string;
};

export function generatePortfolioOptimizationReport(result: PortfolioOptimizationResult): PortfolioOptimizationBusinessReport {
  const topPortfolioActions = result.recommended_portfolio.slice(0, 5).map((row) => ({
    title: actionTitle(row.action, row.sku, row.lifecycle_stage),
    reason: row.why,
    expected_profit_impact: row.profit_delta,
    evidence: [...row.evidence, ...(row.lifecycle?.signals ?? []).map((signal) => `lifecycle:${signal}`)],
    lifecycle_stage: row.lifecycle_stage,
    lifecycle_signals: row.lifecycle?.signals,
    simulation: {
      current_profit: row.current_profit,
      predicted_profit: row.predicted_profit,
      predicted_revenue: row.simulation.predicted_revenue,
      recommended_ads_spend: row.simulation.recommended_ads_spend,
      simulated_price: row.simulation.simulated_price
    },
    simulation_estimate: row.simulation_estimate,
    timing: row.timing,
    confidence: row.confidence
  }));
  const budgetActions = result.budget_plan.slice(0, 3).map((row) => ({
    title: `Adjust ${row.campaign} budget for ${row.sku}`,
    reason: row.reason,
    expected_profit_impact: row.expected_profit_gain,
    evidence: [`marginal_roas=${row.marginal_roas}`, `old_budget=${row.old_budget}`, `new_budget=${row.new_budget}`],
    simulation: {
      old_budget: row.old_budget,
      new_budget: row.new_budget,
      expected_profit_gain: row.expected_profit_gain
    },
    confidence: 0.72
  }));
  const pricingActions = result.pricing_plan.slice(0, 3).map((row) => ({
    title: `Adjust ${row.sku} price`,
    reason: row.why,
    expected_profit_impact: row.expected_profit_delta,
    evidence: [`current_price=${row.current_price}`, `optimal_price=${row.optimal_price}`],
    simulation: {
      current_price: row.current_price,
      optimal_price: row.optimal_price,
      expected_profit_delta: row.expected_profit_delta
    },
    confidence: row.confidence
  }));

  const topActions = [...topPortfolioActions, ...budgetActions, ...pricingActions]
    .sort((left, right) => right.expected_profit_impact - left.expected_profit_impact)
    .slice(0, 8);

  return {
    executive_summary: {
      current_profit: result.optimization_summary.current_portfolio_profit,
      optimized_profit: result.optimization_summary.optimized_portfolio_profit,
      profit_lift: result.optimization_summary.total_expected_profit_gain,
      prediction_confidence: result.prediction_summary.prediction_confidence,
      optimization_confidence: result.optimization_confidence,
      simulation_source: result.prediction_summary.simulation_source,
      summary: `Current portfolio profit is ${money(result.optimization_summary.current_portfolio_profit)}. Optimized expected profit is ${money(result.optimization_summary.optimized_portfolio_profit)}, a projected lift of ${money(result.optimization_summary.total_expected_profit_gain)}. Simulation source: ${result.prediction_summary.simulation_source}.`
    },
    top_actions: topActions,
    budget_summary: result.budget_plan.length
      ? `Budget is reallocated across ${result.budget_plan.length} SKU/campaign pairs under the total ads budget constraint.`
      : "No budget reallocation cleared the confidence, margin, and inventory constraints.",
    pricing_summary: result.pricing_plan.length
      ? `${result.pricing_plan.length} SKUs have price moves with positive simulated profit impact.`
      : "No tested price move produced a stronger expected profit outcome.",
    inventory_summary: result.inventory_plan.length
      ? `${result.inventory_plan.length} SKUs are stock-constrained and have quantified protected profit if inventory is added.`
      : "Selected portfolio does not require additional inventory protection."
  };
}

function actionTitle(action: string, sku: string, lifecycleStage?: string) {
  const prefix = lifecycleStage === "GROWTH"
    ? "Growth Opportunity"
    : lifecycleStage === "LAUNCH"
      ? "Launch Test"
      : lifecycleStage === "DECLINING"
        ? "Exit Decision"
        : lifecycleStage === "MATURE"
          ? "Profit Efficiency"
          : null;
  const lifecyclePrefix = prefix ? `${prefix} · ` : "";
  if (action.includes("TEST_AD_SPEND")) return `${lifecyclePrefix}Test ${sku} ad response`;
  if (action.includes("SCALE_ADS")) return `${lifecyclePrefix}Increase ${sku} ads allocation`;
  if (action.includes("REDUCE_ADS")) return `${lifecyclePrefix}Reduce ${sku} ads allocation`;
  if (action.includes("PRICE_UP")) return `${lifecyclePrefix}Raise ${sku} price`;
  if (action.includes("PRICE_DOWN")) return `${lifecyclePrefix}Lower ${sku} price`;
  if (action.includes("RESTOCK")) return `${lifecyclePrefix}Increase ${sku} inventory before scaling`;
  return `${lifecyclePrefix}Keep ${sku} in optimized portfolio${lifecycleStage ? ` (${lifecycleStage})` : ""}`;
}

function money(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
