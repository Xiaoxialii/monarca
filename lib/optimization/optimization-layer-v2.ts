import { allocateBudgetByMarginalRoi, type BudgetAllocation } from "@/lib/optimization/budget-allocation";
import { buildJointOptimizationResults, type JointOptimizationResult } from "@/lib/optimization/joint-optimization";
import { commerceSkuNetProfit, roundCurrency, roundRatio, safeRatio, type CommerceState } from "@/lib/optimization/objective";
import { riskPenalty, simulateAllScenarios, type SimulationResult } from "@/lib/optimization/simulation-search";

export type OptimizationLayerV2Report = {
  version: "optimization_layer_v2";
  executive_summary: {
    total_profit: number;
    current_profit: number;
    optimized_profit: number;
    profit_change: number;
    key_drivers: string[];
  };
  best_actions: Array<{
    sku: string;
    action: string;
    reason: string;
    expected_profit_delta: number;
  }>;
  budget_allocation: Array<BudgetAllocation & { budget: number }>;
  joint_optimization_results: JointOptimizationResult[];
  simulation_results: Array<{
    sku: string;
    scenario: string;
    profit: number;
    risk: number;
  }>;
  ranking: Array<{
    sku: string;
    score: number;
  }>;
  constraints_applied: string[];
  confidence_score: number;
};

export function runOptimizationLayerV2(state: CommerceState): OptimizationLayerV2Report {
  const simulations = simulateAllScenarios(state.skus);
  const selectedBySku = selectBestRiskAdjustedScenario(simulations);
  const budgetAllocation = allocateBudgetByMarginalRoi({
    skus: state.skus,
    simulations,
    budgetLimit: state.constraints.budgetLimit
  });
  const jointResults = buildJointOptimizationResults(simulations);
  const currentProfit = roundCurrency(state.skus.reduce((sum, sku) => sum + commerceSkuNetProfit(sku), 0));
  const optimizedProfit = roundCurrency(Array.from(selectedBySku.values()).reduce((sum, result) => sum + result.profit, 0));
  const profitChange = roundCurrency(optimizedProfit - currentProfit);
  const bestActions = Array.from(selectedBySku.values())
    .sort((left, right) => right.profitDelta - left.profitDelta)
    .map((result) => ({
      sku: result.sku,
      action: result.scenario,
      reason: explainSelection(result),
      expected_profit_delta: result.profitDelta
    }));
  const ranking = Array.from(selectedBySku.values())
    .map((result) => ({
      sku: result.sku,
      score: roundRatio(Math.max(0, result.profit - riskPenalty(result)) / Math.max(1, Math.abs(result.currentProfit) + 1))
    }))
    .sort((left, right) => right.score - left.score || left.sku.localeCompare(right.sku));

  return {
    version: "optimization_layer_v2",
    executive_summary: {
      total_profit: optimizedProfit,
      current_profit: currentProfit,
      optimized_profit: optimizedProfit,
      profit_change: profitChange,
      key_drivers: keyDrivers({ bestActions, budgetAllocation, jointResults })
    },
    best_actions: bestActions,
    budget_allocation: budgetAllocation.map((row) => ({ ...row, budget: row.allocated_budget })),
    joint_optimization_results: jointResults,
    simulation_results: simulations
      .sort((left, right) => right.profit - left.profit)
      .slice(0, 24)
      .map((row) => ({
        sku: row.sku,
        scenario: row.scenario,
        profit: row.profit,
        risk: row.risk
      })),
    ranking,
    constraints_applied: constraintsApplied(state),
    confidence_score: confidenceScore(selectedBySku, budgetAllocation)
  };
}

function selectBestRiskAdjustedScenario(simulations: SimulationResult[]) {
  const selected = new Map<string, SimulationResult>();

  for (const simulation of simulations) {
    const score = simulation.profit - riskPenalty(simulation);
    const current = selected.get(simulation.sku);
    const currentScore = current ? current.profit - riskPenalty(current) : Number.NEGATIVE_INFINITY;
    if (score > currentScore) selected.set(simulation.sku, simulation);
  }

  return selected;
}

function explainSelection(result: SimulationResult) {
  if (result.scenario.includes("STOP_SKU")) return "Selected because stopping the SKU removes negative or weak contribution exposure.";
  if (result.scenario.includes("SCALE_ADS") && result.scenario.includes("PRICE_UP")) return "Selected because joint ads scaling and price lift creates the highest risk-adjusted profit.";
  if (result.scenario.includes("SCALE_ADS")) return "Selected because marginal paid growth improves expected contribution profit.";
  if (result.scenario.includes("PRICE_UP")) return "Selected because margin expansion improves expected SKU profit.";
  if (result.scenario.includes("REDUCE_ADS")) return "Selected because reducing inefficient ad exposure improves profit quality.";
  return "Selected because holding current operating settings is the best risk-adjusted option.";
}

function keyDrivers(input: {
  bestActions: Array<{ action: string }>;
  budgetAllocation: BudgetAllocation[];
  jointResults: JointOptimizationResult[];
}) {
  const drivers = [];
  if (input.budgetAllocation.length) drivers.push("Budget shifted toward highest marginal ROI SKUs");
  if (input.jointResults.some((row) => row.beats_single_variable)) drivers.push("Joint SKU, ads, and pricing optimization beats single-variable moves");
  if (input.bestActions.some((row) => row.action.includes("STOP_SKU"))) drivers.push("Negative contribution SKUs are stopped or contained");
  if (input.bestActions.some((row) => row.action.includes("PRICE_UP"))) drivers.push("Price lift improves margin quality");
  return drivers.length ? drivers : ["Current operating state is already close to optimal under constraints"];
}

function constraintsApplied(state: CommerceState) {
  const constraints = [`budget_limit=${state.constraints.budgetLimit}`];
  if (state.constraints.minRoas != null) constraints.push(`min_roas=${state.constraints.minRoas}`);
  if (state.constraints.maxCac != null) constraints.push(`max_cac=${state.constraints.maxCac}`);
  if (state.constraints.cashFlowLimit != null) constraints.push(`cash_flow_limit=${state.constraints.cashFlowLimit}`);
  constraints.push("inventory_limit=sku_stock_level");
  return constraints;
}

function confidenceScore(selectedBySku: Map<string, SimulationResult>, budgetAllocation: BudgetAllocation[]) {
  const avgRisk = selectedBySku.size
    ? Array.from(selectedBySku.values()).reduce((sum, result) => sum + result.risk, 0) / selectedBySku.size
    : 0.5;
  const allocationCoverage = safeRatio(budgetAllocation.length, Math.max(1, selectedBySku.size));
  return roundRatio(Math.max(0.35, Math.min(0.95, 0.82 - avgRisk * 0.4 + allocationCoverage * 0.1)));
}
