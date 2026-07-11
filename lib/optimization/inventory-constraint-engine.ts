import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { BusinessConstraintsInput, PortfolioSkuInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";

export type InventoryPlan = {
  sku: string;
  current_inventory: number;
  required_inventory: number;
  lost_profit_without_stock: number;
  expected_profit_protection: number;
  why: string;
};

export function violatesInventoryConstraint(result: ProfitSimulationResult, constraints: BusinessConstraintsInput) {
  if (result.required_inventory <= result.current_inventory) return false;
  if (result.action === "RESTOCK_AND_SCALE") return result.required_inventory > constraints.inventory_capacity;
  return true;
}

export function buildInventoryPlan(
  skus: PortfolioSkuInput[],
  simulations: ProfitSimulationResult[],
  constraints: BusinessConstraintsInput
): InventoryPlan[] {
  const bySku = new Map(skus.map((sku) => [sku.sku, sku]));

  return simulations
    .filter((result) => result.required_inventory > result.current_inventory && result.profit_delta > 0)
    .map((result) => {
      const sku = bySku.get(result.sku);
      const missingUnits = Math.max(0, result.required_inventory - result.current_inventory);
      const unitProfit = sku ? Math.max(0, sku.net_profit / Math.max(1, sku.quantity)) : 0;
      const lostProfit = roundCurrency(Math.min(result.profit_delta, missingUnits * unitProfit));

      return {
        sku: result.sku,
        current_inventory: result.current_inventory,
        required_inventory: Math.min(result.required_inventory, constraints.inventory_capacity),
        lost_profit_without_stock: lostProfit,
        expected_profit_protection: roundCurrency(Math.max(lostProfit, result.profit_delta * 0.35)),
        why: "Demand and margin simulation show this SKU cannot scale unless inventory coverage is increased."
      };
    })
    .filter((plan) => plan.required_inventory > plan.current_inventory)
    .sort((left, right) => right.expected_profit_protection - left.expected_profit_protection);
}

export function inventoryUtilization(results: ProfitSimulationResult[], capacity: number) {
  const required = results.reduce((sum, result) => sum + result.required_inventory, 0);
  return roundRatio(required / Math.max(1, capacity));
}
