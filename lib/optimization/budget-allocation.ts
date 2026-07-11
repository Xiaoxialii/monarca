import { roundCurrency, roundRatio, safeRatio, type CommerceSkuState } from "@/lib/optimization/objective";
import type { SimulationResult } from "@/lib/optimization/simulation-search";

export type BudgetAllocation = {
  sku: string;
  allocated_budget: number;
  expected_profit: number;
  roi: number;
};

export function allocateBudgetByMarginalRoi(input: {
  skus: CommerceSkuState[];
  simulations: SimulationResult[];
  budgetLimit: number;
}): BudgetAllocation[] {
  const scalable = input.skus
    .map((sku) => {
      const bestScale = input.simulations
        .filter((scenario) => scenario.sku === sku.skuId && scenario.actions.includes("SCALE_ADS"))
        .sort((left, right) => right.profitDelta - left.profitDelta)[0];
      const incrementalBudget = roundCurrency(Math.max(0, sku.adSpend * 0.22 || 50));
      const expectedProfit = roundCurrency(Math.max(0, bestScale?.profitDelta ?? 0));
      return {
        sku: sku.skuId,
        allocated_budget: incrementalBudget,
        expected_profit: expectedProfit,
        roi: safeRatio(expectedProfit, incrementalBudget)
      };
    })
    .filter((row) => row.expected_profit > 0 && row.roi > 0)
    .sort((left, right) => right.roi - left.roi || right.expected_profit - left.expected_profit);

  const allocations: BudgetAllocation[] = [];
  let remaining = Math.max(0, input.budgetLimit);

  for (const row of scalable) {
    if (remaining <= 0) break;
    const allocated = roundCurrency(Math.min(row.allocated_budget, remaining));
    allocations.push({
      sku: row.sku,
      allocated_budget: allocated,
      expected_profit: roundCurrency(row.roi * allocated),
      roi: roundRatio(row.roi)
    });
    remaining = roundCurrency(remaining - allocated);
  }

  return allocations;
}
