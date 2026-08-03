import { commerceSkuMargin, commerceSkuNetProfit, roundCurrency, roundRatio, safeRatio, type CommerceSkuState } from "@/lib/optimization/objective";

export type OptimizationScenarioAction = "SCALE_ADS" | "REDUCE_ADS" | "STOP_SKU" | "PRICE_UP" | "PRICE_DOWN" | "HOLD";

export type SimulationResult = {
  sku: string;
  scenario: string;
  actions: OptimizationScenarioAction[];
  revenue: number;
  cost: number;
  profit: number;
  risk: number;
  currentProfit: number;
  profitDelta: number;
};

export function simulateSkuScenarios(sku: CommerceSkuState): SimulationResult[] {
  const actionSets: OptimizationScenarioAction[][] = [
    ["HOLD"],
    ["SCALE_ADS"],
    ["SCALE_ADS", "PRICE_UP"],
    ["PRICE_UP"],
    ["REDUCE_ADS"],
    ["REDUCE_ADS", "PRICE_DOWN"],
    ["STOP_SKU"]
  ];

  return actionSets.map((actions) => simulateActionSet(sku, actions));
}

export function simulateAllScenarios(skus: CommerceSkuState[]) {
  return skus.flatMap(simulateSkuScenarios);
}

export function riskPenalty(result: SimulationResult) {
  return roundCurrency(result.risk * Math.max(1, Math.abs(result.profit)));
}

function simulateActionSet(sku: CommerceSkuState, actions: OptimizationScenarioAction[]): SimulationResult {
  const currentProfit = baselineProfit(sku);
  const cogsRatio = safeRatio(Math.max(0, sku.revenue - sku.grossProfit), sku.revenue);
  const inventoryCoverage = sku.salesVelocity > 0 ? sku.inventory / sku.salesVelocity : 999;
  let revenueMultiplier = 1;
  let adSpendMultiplier = 1;
  let priceLoss = 0;
  let costEfficiencyMultiplier = 1;

  if (actions.includes("SCALE_ADS")) {
    revenueMultiplier += 0.16;
    adSpendMultiplier += 0.22;
  }
  if (actions.includes("REDUCE_ADS")) {
    revenueMultiplier -= 0.08;
    adSpendMultiplier -= 0.35;
  }
  if (actions.includes("PRICE_UP")) {
    revenueMultiplier *= 1.04;
    priceLoss += sku.revenue * 0.025;
    costEfficiencyMultiplier *= 0.94;
  }
  if (actions.includes("PRICE_DOWN")) {
    revenueMultiplier *= 0.96;
    priceLoss += sku.revenue * 0.02;
  }
  if (actions.includes("STOP_SKU")) {
    revenueMultiplier = 0;
    adSpendMultiplier = 0;
  }
  if (inventoryCoverage < 14 && actions.includes("SCALE_ADS")) {
    revenueMultiplier -= 0.08;
  }

  const revenue = roundCurrency(Math.max(0, sku.revenue * revenueMultiplier));
  const adsCost = roundCurrency(Math.max(0, sku.adSpend * adSpendMultiplier));
  const inventoryCost = roundCurrency(actions.includes("SCALE_ADS") ? Math.max(0, sku.salesVelocity * 7 - sku.inventory) * 2 : 0);
  const variableCost = roundCurrency(revenue * cogsRatio * costEfficiencyMultiplier);
  const cost = roundCurrency(variableCost + adsCost + inventoryCost + priceLoss);
  const profit = roundCurrency(revenue - cost);
  const risk = scenarioRisk(sku, actions, inventoryCoverage);

  return {
    sku: sku.skuId,
    scenario: actions.join(" + "),
    actions,
    revenue,
    cost,
    profit,
    risk,
    currentProfit,
    profitDelta: roundCurrency(profit - currentProfit)
  };
}

function scenarioRisk(sku: CommerceSkuState, actions: OptimizationScenarioAction[], inventoryCoverage: number) {
  const margin = commerceSkuMargin(sku);
  const attributionRisk = sku.roas == null && sku.adSpend > 0 ? 0.12 : 0;
  const inventoryRisk = inventoryCoverage < 14 && actions.includes("SCALE_ADS") ? 0.22 : inventoryCoverage < 7 ? 0.16 : 0.04;
  const marginRisk = margin < 0.12 && !actions.includes("PRICE_UP") ? 0.18 : 0.04;
  return roundRatio(Math.min(0.8, attributionRisk + inventoryRisk + marginRisk));
}

function baselineProfit(sku: CommerceSkuState) {
  return commerceSkuNetProfit(sku);
}
