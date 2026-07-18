import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { PortfolioSkuInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import type { DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";

export type InventoryRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type InventoryHealthAssessment = {
  inventory_risk_level: InventoryRiskLevel;
  inventory_pressure_score: number;
  inventory_coverage_days: number;
  sell_through_rate: number;
  demand_forecast_units: number;
  inventory_value: number;
  holding_cost: number;
  cash_locked: number;
  max_clear_inventory_ratio: number;
};

export type ClearInventoryQuality = {
  eligible: boolean;
  score: number;
  inventory_pressure: number;
  cash_locked: number;
  recovery_probability: number;
  margin_loss_risk: number;
  reason: string;
};

export function assessPortfolioInventoryHealth(skus: PortfolioSkuInput[]): InventoryHealthAssessment {
  if (!skus.length) return emptyInventoryHealth();

  const totalInventory = sum(skus.map((sku) => sku.inventory));
  const totalVelocity = sum(skus.map((sku) => Math.max(0, sku.sales_velocity)));
  const demandForecastUnits = sum(skus.map((sku) => demandForecast(sku)));
  const inventoryValue = sum(skus.map((sku) => inventoryValueForSku(sku)));
  const holdingCost = roundCurrency(inventoryValue * 0.025);
  const cashLocked = sum(skus.map((sku) => Math.max(0, sku.inventory - demandForecast(sku)) * Math.max(0, sku.cogs)));
  const coverageDays = totalVelocity > 0 ? totalInventory / Math.max(0.1, totalVelocity) : 999;
  const sellThroughRate = safeRatio(demandForecastUnits, Math.max(1, totalInventory));
  const overstockShare = skus.filter((sku) => skuInventoryCoverageDays(sku) > 120).length / skus.length;
  const valuePressure = safeRatio(cashLocked, Math.max(1, inventoryValue));
  const coveragePressure = clamp01((coverageDays - 45) / 180);
  const sellThroughPressure = clamp01((0.45 - sellThroughRate) / 0.45);
  const pressure = roundRatio(clamp01(coveragePressure * 0.42 + sellThroughPressure * 0.25 + valuePressure * 0.23 + overstockShare * 0.1));

  return buildInventoryHealth({
    inventory_pressure_score: pressure,
    inventory_coverage_days: roundRatio(coverageDays),
    sell_through_rate: roundRatio(sellThroughRate),
    demand_forecast_units: Math.round(demandForecastUnits),
    inventory_value: roundCurrency(inventoryValue),
    holding_cost: holdingCost,
    cash_locked: roundCurrency(cashLocked)
  });
}

export function assessSelectedInventoryMix(rows: ProfitSimulationResult[]): InventoryHealthAssessment & {
  clear_inventory_ratio: number;
  clear_inventory_impact_ratio: number;
  clear_inventory_cash_recovery_ratio: number;
} {
  if (!rows.length) {
    return {
      ...emptyInventoryHealth(),
      clear_inventory_ratio: 0,
      clear_inventory_impact_ratio: 0,
      clear_inventory_cash_recovery_ratio: 0
    };
  }

  const skus = rows.map((row) => ({
    sku: row.sku,
    category: row.category,
    channel: row.channel,
    revenue: row.before_state.revenue,
    quantity: Math.max(1, row.required_inventory || row.before_state.inventory || 1),
    price: row.before_state.price,
    cogs: Math.max(0, row.before_state.price * Math.max(0.05, row.before_state.margin)),
    ads_spend: row.before_state.ad_spend,
    margin: row.before_state.margin,
    net_profit: row.before_state.profit,
    inventory: row.before_state.inventory,
    sales_velocity: row.required_inventory > 0 ? row.required_inventory / Math.max(1, row.simulation_horizon.days) : Math.max(0.1, row.before_state.inventory / 180),
    refund_rate: 0.05,
    customer_ltv: row.before_state.price * 4,
    conversion_rate: 0.02,
    prediction_confidence: row.confidence
  }));
  const health = assessPortfolioInventoryHealth(skus);
  const clearRows = rows.filter(isClearInventorySimulation);
  const clearProfit = sum(clearRows.map((row) => Math.max(0, row.profit_delta)));
  const totalProfit = sum(rows.map((row) => Math.max(0, row.profit_delta)));
  const clearCash = sum(clearRows.map((row) => clearInventoryCashRecovery(row)));
  const totalCashRecovery = sum(rows.map((row) => Math.max(0, clearInventoryCashRecovery(row))));

  return {
    ...health,
    clear_inventory_ratio: roundRatio(clearRows.length / rows.length),
    clear_inventory_impact_ratio: roundRatio(safeRatio(clearProfit, Math.max(1, totalProfit))),
    clear_inventory_cash_recovery_ratio: roundRatio(safeRatio(clearCash, Math.max(1, totalCashRecovery)))
  };
}

export function clearInventoryQualityScore(sku: PortfolioSkuInput, thresholdProfile?: DynamicThresholdProfile): ClearInventoryQuality {
  const coverageDays = skuInventoryCoverageDays(sku);
  const excessThreshold = thresholdProfile?.inventory_threshold.excess_coverage_days ?? 90;
  const forecast = demandForecast(sku);
  const inventoryPressure = clamp01((coverageDays - excessThreshold) / Math.max(30, excessThreshold));
  const demandBelowInventory = forecast < sku.inventory;
  const sellThroughDeclining = isSellThroughDeclining(sku, coverageDays, excessThreshold);
  const cashLockedValue = Math.max(0, sku.inventory - forecast) * Math.max(0, sku.cogs);
  const inventoryValue = inventoryValueForSku(sku);
  const cashLocked = clamp01(safeRatio(cashLockedValue, Math.max(1, inventoryValue)));
  const recoveryProbability = clamp01(0.25 + inventoryPressure * 0.4 + cashLocked * 0.25 + (sku.margin > 0.15 ? 0.1 : 0));
  const marginLossRisk = clamp01(Math.max(0.05, sku.margin) * 0.35 + (sku.revenue_growth && sku.revenue_growth > 0.1 ? 0.15 : 0));
  const score = roundRatio(inventoryPressure * cashLocked * recoveryProbability - marginLossRisk * 0.25);
  const threshold = thresholdProfile?.business_objective === "CASH_RECOVERY" ? 0.06 : 0.1;
  const eligible = coverageDays > excessThreshold && demandBelowInventory && sellThroughDeclining && score > threshold;

  return {
    eligible,
    score,
    inventory_pressure: roundRatio(inventoryPressure),
    cash_locked: roundRatio(cashLocked),
    recovery_probability: roundRatio(recoveryProbability),
    margin_loss_risk: roundRatio(marginLossRisk),
    reason: eligible ? "excess inventory pressure with cash recovery potential" : "inventory clearance quality threshold not met"
  };
}

export function dynamicClearInventoryMaxRatio(health: Pick<InventoryHealthAssessment, "inventory_pressure_score" | "inventory_risk_level">) {
  const base = health.inventory_risk_level === "HIGH" ? 0.4 : health.inventory_risk_level === "MEDIUM" ? 0.28 : 0.18;
  const adjustment = health.inventory_risk_level === "HIGH" ? 0.2 : health.inventory_risk_level === "MEDIUM" ? 0.12 : 0.07;
  const maxByLevel = health.inventory_risk_level === "HIGH" ? 0.6 : health.inventory_risk_level === "MEDIUM" ? 0.4 : 0.25;
  return roundRatio(Math.min(maxByLevel, base + health.inventory_pressure_score * adjustment));
}

export function isClearInventorySimulation(row: ProfitSimulationResult) {
  return row.action === "REDUCE_INVENTORY" || row.unified_action === "REDUCE_INVENTORY";
}

export function clearInventoryCashRecovery(row: ProfitSimulationResult) {
  if (!isClearInventorySimulation(row)) return 0;
  return roundCurrency(Math.max(0, -row.inventory_impact) * Math.max(0, row.current_price * Math.max(0.08, row.before_state.margin)));
}

function buildInventoryHealth(input: Omit<InventoryHealthAssessment, "inventory_risk_level" | "max_clear_inventory_ratio">): InventoryHealthAssessment {
  const riskLevel: InventoryRiskLevel = input.inventory_pressure_score >= 0.66 || input.inventory_coverage_days > 180
    ? "HIGH"
    : input.inventory_pressure_score >= 0.34 || input.inventory_coverage_days > 100
      ? "MEDIUM"
      : "LOW";

  return {
    ...input,
    inventory_risk_level: riskLevel,
    max_clear_inventory_ratio: dynamicClearInventoryMaxRatio({
      inventory_pressure_score: input.inventory_pressure_score,
      inventory_risk_level: riskLevel
    })
  };
}

function emptyInventoryHealth(): InventoryHealthAssessment {
  return {
    inventory_risk_level: "LOW",
    inventory_pressure_score: 0,
    inventory_coverage_days: 0,
    sell_through_rate: 0,
    demand_forecast_units: 0,
    inventory_value: 0,
    holding_cost: 0,
    cash_locked: 0,
    max_clear_inventory_ratio: 0.25
  };
}

function skuInventoryCoverageDays(sku: PortfolioSkuInput) {
  return sku.sales_velocity > 0 ? sku.inventory / Math.max(0.1, sku.sales_velocity) : 999;
}

function demandForecast(sku: PortfolioSkuInput) {
  const trend = Math.max(0.35, 1 + (sku.revenue_growth ?? sku.order_growth ?? 0));
  return Math.max(0, sku.sales_velocity * 30 * trend);
}

function isSellThroughDeclining(sku: PortfolioSkuInput, coverageDays: number, excessThreshold: number) {
  if ((sku.revenue_growth ?? 0) < 0 || (sku.order_growth ?? 0) < 0 || (sku.conversion_trend ?? 0) < -0.03) return true;
  return coverageDays > excessThreshold * 1.4 && sku.sales_velocity < Math.max(2, sku.inventory / 180);
}

function inventoryValueForSku(sku: PortfolioSkuInput) {
  return Math.max(0, sku.inventory) * Math.max(0, sku.cogs || sku.price * Math.max(0.08, sku.margin));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
