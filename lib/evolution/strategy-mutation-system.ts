import { roundCurrency, roundRatio, safeRatio, type CommerceState } from "@/lib/optimization/objective";
import type { OptimizationLayerV2Report } from "@/lib/optimization/optimization-layer-v2";
import type { EvolutionEngineResult, StrategyMutation } from "@/lib/evolution/types";

export function generateStrategyMutations(input: {
  state: CommerceState;
  optimizationReport: OptimizationLayerV2Report;
  evolution: EvolutionEngineResult;
}): StrategyMutation[] {
  const baseline = input.optimizationReport.executive_summary.current_profit;
  const optimized = input.optimizationReport.executive_summary.optimized_profit;
  const portfolioRoas = safeRatio(
    input.state.skus.reduce((sum, sku) => sum + sku.revenue, 0),
    input.state.skus.reduce((sum, sku) => sum + sku.adSpend, 0)
  );
  const avgCoverage = averageInventoryCoverage(input.state);

  const mutations: StrategyMutation[] = [
    mutation("aggressive_scale", optimized * 1.08, baseline, portfolioRoas < 2 ? 0.45 : 0.28, "Increase budget pressure on high-ROAS SKUs while preserving hard budget limits."),
    mutation("conservative_scale", optimized * 0.98, baseline, 0.18, "Scale only SKUs with high confidence and sufficient inventory coverage."),
    mutation("profit_first", optimized * 1.03, baseline, 0.22, "Prioritize contribution profit and suppress low-margin growth."),
    mutation("growth_first", optimized * 1.06, baseline, portfolioRoas < 1.5 ? 0.5 : 0.34, "Accept higher short-term volatility for revenue growth on efficient SKUs."),
    mutation("profit_stability", optimized * 1.01, baseline, avgCoverage < 14 ? 0.3 : 0.16, "Favor lower volatility and stable inventory-backed profit.")
  ];

  return mutations
    .map((row) => ({
      ...row,
      confidence: adjustConfidence(row, input.evolution)
    }))
    .sort((left, right) => (right.expected_profit - right.risk * 1000) - (left.expected_profit - left.risk * 1000));
}

function mutation(
  strategy: StrategyMutation["strategy"],
  expectedProfit: number,
  baseline: number,
  risk: number,
  explanation: string
): StrategyMutation {
  return {
    strategy,
    expected_profit: roundCurrency(expectedProfit),
    expected_profit_delta: roundCurrency(expectedProfit - baseline),
    risk: roundRatio(risk),
    confidence: roundRatio(Math.max(0.35, Math.min(0.92, 0.82 - risk * 0.6))),
    explanation
  };
}

function adjustConfidence(row: StrategyMutation, evolution: EvolutionEngineResult) {
  const isSupported = evolution.strategy_changes.some((change) =>
    row.strategy.includes(change.strategy.replace("profitable_", "").replace("_scaling", "_scale")) ||
    change.strategy.includes(row.strategy)
  );
  return roundRatio(Math.max(0.35, Math.min(0.95, row.confidence + (isSupported ? 0.06 : 0))));
}

function averageInventoryCoverage(state: CommerceState) {
  const coverages = state.skus
    .filter((sku) => sku.salesVelocity > 0)
    .map((sku) => sku.inventory / sku.salesVelocity);
  return coverages.length ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length : 30;
}
