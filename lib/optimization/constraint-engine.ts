import { roundRatio } from "@/lib/optimization/objective";
import { violatesInventoryConstraint } from "@/lib/optimization/inventory-constraint-engine";
import type { BusinessConstraintsInput, PortfolioOptimizationInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import { isActionAllowedForLifecycle } from "@/lib/lifecycle/lifecycle-optimization-router";

export type ConstraintEvaluation = {
  valid: boolean;
  violations: string[];
  risk_score: number;
};

export function evaluateActionConstraints(
  result: ProfitSimulationResult,
  constraints: BusinessConstraintsInput
): ConstraintEvaluation {
  const violations: string[] = [];
  const isStop = result.action === "STOP";
  const priceChange = Math.abs((result.simulated_price - result.current_price) / Math.max(1, result.current_price));

  if (!isStop && result.predicted_profit < constraints.minimum_profit) violations.push("minimum_profit");
  if (!isStop && isIncrementalAdsAction(result.action) && result.profit_delta <= 0) violations.push("non_positive_incremental_profit");
  if (!isStop && result.predicted_margin < constraints.target_margin) violations.push("target_margin");
  if (!isStop && result.confidence < (constraints.minimum_confidence ?? 0.55)) violations.push("minimum_confidence");
  if (priceChange > constraints.max_price_change) violations.push("max_price_change");
  if (result.recommended_ads_spend > constraints.total_ads_budget) violations.push("total_ads_budget");
  if (violatesInventoryConstraint(result, constraints)) violations.push("inventory_capacity");
  if (typeof constraints.available_cash === "number" && result.required_cash > constraints.available_cash) violations.push("available_cash");
  if (!isStop && result.current_profit < 0 && result.action.includes("SCALE")) violations.push("negative_margin_scaling");
  if (!isStop && result.lifecycle && !isActionAllowedForLifecycle(result.action, result.lifecycle)) violations.push("lifecycle_action_not_allowed");

  return {
    valid: violations.length === 0,
    violations,
    risk_score: roundRatio(Math.min(0.95, result.risk + violations.length * 0.12))
  };
}

function isIncrementalAdsAction(action: ProfitSimulationResult["action"]) {
  return action === "TEST_AD_SPEND" ||
    action === "SCALE_ADS" ||
    action === "SCALE_ADS_PRICE_UP_5" ||
    action === "RESTOCK_AND_SCALE" ||
    action === "SHIFT_CHANNEL";
}

export function groupValidPortfolioSimulations(input: PortfolioOptimizationInput, simulations: ProfitSimulationResult[]) {
  const grouped = new Map<string, ProfitSimulationResult[]>();

  for (const result of simulations) {
    const evaluation = evaluateActionConstraints(result, input.constraints);
    if (!evaluation.valid) continue;
    grouped.set(result.sku, [...(grouped.get(result.sku) ?? []), result]);
  }

  for (const sku of input.skus) {
    if (!grouped.has(sku.sku)) {
      const stop = simulations.find((result) => result.sku === sku.sku && result.action === "STOP");
      if (stop) grouped.set(sku.sku, [stop]);
    }
  }

  return grouped;
}

export function constraintsApplied(input: PortfolioOptimizationInput) {
  return [
    `total_ads_budget=${input.constraints.total_ads_budget}`,
    `inventory_capacity=${input.constraints.inventory_capacity}`,
    `available_cash=${input.constraints.available_cash ?? "not_set"}`,
    `target_margin=${input.constraints.target_margin}`,
    `max_price_change=${input.constraints.max_price_change}`,
    `minimum_profit=${input.constraints.minimum_profit}`,
    `minimum_confidence=${input.constraints.minimum_confidence ?? 0.55}`,
    `simulation_horizon_days=${input.constraints.simulation_horizon_days ?? 30}`
  ];
}
