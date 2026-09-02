export type InventoryDecisionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type InventoryRiskDecisionStatus =
  | "STOCKOUT_RISK"
  | "OVERSTOCK_RISK"
  | "EXCESS_INVENTORY"
  | "LIQUIDATION_RISK"
  | "HEALTHY"
  | "OBSERVATION";

export type InventoryRecommendedAction =
  | "RESTOCK"
  | "REDUCE_PURCHASE"
  | "SHIFT_CHANNEL"
  | "INCREASE_DEMAND"
  | "LIQUIDATE"
  | "MAINTAIN"
  | "MONITOR";

export type DemandTrendDirection = "UP" | "DOWN" | "STABLE" | "UNKNOWN";

export type DemandTrend = {
  direction: DemandTrendDirection;
  growth_rate: number;
  confidence: InventoryDecisionConfidence;
};

export type InventoryDecision = {
  inventoryRiskScore: number;
  risk_status: InventoryRiskDecisionStatus;
  confidence: InventoryDecisionConfidence;
  recommended_action: InventoryRecommendedAction;
  reasons: string[];
  demandTrend: DemandTrend;
  inventory_value: number;
  capital_locked: number;
  paid_dependency_score: number;
  organic_sales_ratio: number;
  seasonality_score: number;
  risk_components: {
    demandRisk: number;
    lifecycleRisk: number;
    profitabilityRisk: number;
    capitalRisk: number;
    channelRisk: number;
    advertisingDependencyRisk: number;
    supplyRisk: number;
  };
};

export type InventoryDecisionInput = {
  sku: string;
  lifecycle_stage?: string | null;
  lifecycle_confidence?: InventoryDecisionConfidence | null;
  stock: number;
  sold: number;
  revenue: number;
  cogs: number;
  margin: number;
  net_profit: number;
  contribution_profit?: number | null;
  inventory_unit_cost?: number | null;
  inventory_value?: number | null;
  sales_velocity: number;
  velocity_confidence?: InventoryDecisionConfidence | null;
  data_period_days?: number | null;
  runway_days?: number | null;
  channel_details?: Array<{ platform: string; revenue: number; quantity?: number; margin?: number; share?: number }>;
  ad_spend?: number | null;
  roas_confidence?: InventoryDecisionConfidence | null;
  seasonality_score?: number | null;
  demandTrend?: DemandTrend | null;
};

export function evaluateInventoryDecision(input: InventoryDecisionInput): InventoryDecision {
  const lifecycle = normalizeLifecycle(input.lifecycle_stage);
  const velocityConfidence = input.velocity_confidence ?? "LOW";
  const dataConfidence = combinedConfidence(velocityConfidence, input.lifecycle_confidence ?? "LOW", input.data_period_days ?? 0);
  const fallbackUnitCost = input.sold > 0 ? Math.max(0, input.cogs / input.sold) : 0;
  const unitCost = isFiniteNumber(input.inventory_unit_cost) ? Math.max(0, input.inventory_unit_cost ?? 0) : fallbackUnitCost;
  const inventoryValue = isFiniteNumber(input.inventory_value)
    ? roundCurrency(Math.max(0, input.inventory_value ?? 0))
    : roundCurrency(Math.max(0, input.stock) * unitCost);
  const runway = input.runway_days ?? (input.sales_velocity > 0 ? input.stock / input.sales_velocity : null);
  const sellThroughRate = input.sold + input.stock > 0 ? input.sold / (input.sold + input.stock) : 0;
  const demandTrend = input.demandTrend ?? inferDemandTrendFromSignals({
    lifecycle,
    velocityConfidence,
    dataPeriodDays: input.data_period_days ?? 0,
    salesVelocity: input.sales_velocity,
    sold: input.sold
  });
  const paidDependencyScore = clamp(safeRatio(input.ad_spend ?? 0, input.revenue), 0, 1);
  const organicSalesRatio = roundRatio(1 - paidDependencyScore);
  const seasonalityScore = clamp(input.seasonality_score ?? 0, 0, 1);
  const strongestChannel = strongestChannelShare(input.channel_details ?? []);
  const margin = Number.isFinite(input.margin) ? input.margin : 0;
  const profitPerUnit = input.sold > 0 ? input.net_profit / input.sold : 0;

  const demandRisk = demandTrend.direction === "DOWN" ? 0.22 : demandTrend.direction === "UP" ? -0.08 : 0.06;
  const lifecycleRisk = lifecycle === "DECLINING" ? 0.2 : lifecycle === "GROWTH" ? -0.08 : lifecycle === "UNKNOWN" ? 0.04 : 0.06;
  const profitabilityRisk = margin < 0.12 || profitPerUnit < 0 ? 0.24 : margin < 0.25 ? 0.12 : margin > 0.4 ? -0.08 : 0.04;
  const capitalRisk = inventoryValue > Math.max(10000, input.revenue * 0.6) ? 0.18 : inventoryValue > Math.max(5000, input.revenue * 0.35) ? 0.1 : 0.02;
  const channelRisk = strongestChannel >= 0.65 ? 0.08 : strongestChannel > 0 && strongestChannel < 0.45 ? -0.04 : 0.02;
  const advertisingDependencyRisk = paidDependencyScore > 0.25 && (input.roas_confidence ?? "LOW") === "LOW" ? 0.16 : paidDependencyScore > 0.15 ? 0.08 : 0.02;
  const supplyRisk = runway !== null && runway < 21 ? 0.22 : runway !== null && runway > 30 ? 0.16 : 0.03;
  const seasonalityAdjustment = seasonalityScore > 0.65 ? -0.12 : 0;

  const riskScore = clamp(
    demandRisk + lifecycleRisk + profitabilityRisk + capitalRisk + channelRisk + advertisingDependencyRisk + supplyRisk + seasonalityAdjustment,
    0,
    1
  );

  const reasons: string[] = [];
  let riskStatus: InventoryRiskDecisionStatus = "HEALTHY";
  let action: InventoryRecommendedAction = "MAINTAIN";

  if (runway !== null && runway < 14 && input.sales_velocity > 0) {
    riskStatus = "STOCKOUT_RISK";
    action = dataConfidence === "LOW" ? "MONITOR" : "RESTOCK";
    reasons.push(`Inventory coverage is ${roundRatio(runway)} days, below the 14-day stockout threshold.`);
  } else if (
    runway !== null &&
    runway > 30 &&
    (lifecycle === "DECLINING" || demandTrend.direction === "DOWN" || sellThroughRate < 0.25)
  ) {
    riskStatus = margin < 0.2 ? "LIQUIDATION_RISK" : "EXCESS_INVENTORY";
    action = margin < 0.2 && dataConfidence !== "LOW" ? "LIQUIDATE" : "REDUCE_PURCHASE";
    reasons.push(`Inventory coverage is ${roundRatio(runway)} days while demand indicators are weak.`);
  } else if (runway !== null && runway > 60 && inventoryValue > Math.max(5000, input.revenue * 0.25)) {
    riskStatus = "OVERSTOCK_RISK";
    action = dataConfidence === "LOW" ? "MONITOR" : "INCREASE_DEMAND";
    reasons.push(`Inventory value ${roundCurrency(inventoryValue)} is high relative to current demand.`);
  } else if (lifecycle === "GROWTH" && demandTrend.direction === "UP" && margin >= 0.25) {
    riskStatus = runway !== null && runway < 45 ? "STOCKOUT_RISK" : "HEALTHY";
    action = runway !== null && runway < 45 && dataConfidence !== "LOW" ? "RESTOCK" : "MAINTAIN";
    reasons.push("Growth lifecycle, positive demand trend, and healthy margin support continued inventory investment.");
  } else if (strongestChannel < 0.55 && demandTrend.direction !== "DOWN" && margin >= 0.25) {
    riskStatus = "HEALTHY";
    action = "SHIFT_CHANNEL";
    reasons.push("Demand is distributed across channels; channel rebalancing can improve inventory productivity.");
  }

  if (riskStatus === "HEALTHY" && dataConfidence === "LOW") {
    riskStatus = riskScore >= 0.45 ? "OBSERVATION" : "HEALTHY";
    action = action === "SHIFT_CHANNEL" ? "SHIFT_CHANNEL" : "MONITOR";
    reasons.push("Inventory decision confidence is low, so recommendation strength is limited.");
  }

  if (lifecycle === "UNKNOWN") reasons.push("Lifecycle history is limited; inventory analysis uses profitability, coverage, and capital signals.");
  if (paidDependencyScore > 0.15) reasons.push(`Paid demand dependency is ${roundRatio(paidDependencyScore * 100)}%.`);
  if (inventoryValue > 0) reasons.push(`Inventory capital locked is ${formatCurrency(inventoryValue)}.`);

  return {
    inventoryRiskScore: roundRatio(riskScore),
    risk_status: riskStatus,
    confidence: dataConfidence,
    recommended_action: action,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    demandTrend,
    inventory_value: inventoryValue,
    capital_locked: inventoryValue,
    paid_dependency_score: roundRatio(paidDependencyScore),
    organic_sales_ratio: organicSalesRatio,
    seasonality_score: roundRatio(seasonalityScore),
    risk_components: {
      demandRisk: roundRatio(demandRisk),
      lifecycleRisk: roundRatio(lifecycleRisk),
      profitabilityRisk: roundRatio(profitabilityRisk),
      capitalRisk: roundRatio(capitalRisk),
      channelRisk: roundRatio(channelRisk),
      advertisingDependencyRisk: roundRatio(advertisingDependencyRisk),
      supplyRisk: roundRatio(supplyRisk)
    }
  };
}

export function inferDemandTrendFromOrderDates(input: {
  totalUnitsSold: number;
  orderDates: Array<string | Date | number | null | undefined>;
}): DemandTrend {
  const timestamps = input.orderDates
    .map(toDayTimestamp)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (timestamps.length < 2) return { direction: "UNKNOWN", growth_rate: 0, confidence: "LOW" };

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const periodDays = Math.max(1, Math.round((last - first) / MS_PER_DAY));
  if (periodDays < 14) return { direction: "UNKNOWN", growth_rate: 0, confidence: "LOW" };

  const midpoint = first + ((last - first) / 2);
  const earlyCount = timestamps.filter((date) => date <= midpoint).length;
  const recentCount = Math.max(0, timestamps.length - earlyCount);
  const unitsPerOrder = input.totalUnitsSold / Math.max(1, timestamps.length);
  const earlyVelocity = (earlyCount * unitsPerOrder) / Math.max(1, periodDays / 2);
  const recentVelocity = (recentCount * unitsPerOrder) / Math.max(1, periodDays / 2);
  const growthRate = safeRatio(recentVelocity - earlyVelocity, Math.max(0.01, earlyVelocity));
  const direction = growthRate > 0.15 ? "UP" : growthRate < -0.15 ? "DOWN" : "STABLE";
  const confidence: InventoryDecisionConfidence = periodDays >= 30 ? "HIGH" : "MEDIUM";
  return { direction, growth_rate: roundRatio(growthRate), confidence };
}

function inferDemandTrendFromSignals(input: {
  lifecycle: string;
  velocityConfidence: InventoryDecisionConfidence;
  dataPeriodDays: number;
  salesVelocity: number;
  sold: number;
}): DemandTrend {
  if (input.lifecycle === "GROWTH") return { direction: "UP", growth_rate: 0.2, confidence: input.velocityConfidence };
  if (input.lifecycle === "DECLINING") return { direction: "DOWN", growth_rate: -0.2, confidence: input.velocityConfidence };
  if (input.dataPeriodDays < 14) return { direction: "UNKNOWN", growth_rate: 0, confidence: "LOW" };
  return { direction: input.salesVelocity > 0 && input.sold > 0 ? "STABLE" : "UNKNOWN", growth_rate: 0, confidence: input.velocityConfidence };
}

function combinedConfidence(
  velocityConfidence: InventoryDecisionConfidence,
  lifecycleConfidence: InventoryDecisionConfidence,
  dataPeriodDays: number
): InventoryDecisionConfidence {
  if (dataPeriodDays >= 30 && velocityConfidence === "HIGH") return "HIGH";
  if (dataPeriodDays >= 14 || velocityConfidence === "MEDIUM" || lifecycleConfidence === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function normalizeLifecycle(value: string | null | undefined) {
  const normalized = String(value ?? "UNKNOWN").toUpperCase();
  if (["GROWTH", "MATURE", "DECLINING", "UNKNOWN"].includes(normalized)) return normalized;
  return "UNKNOWN";
}

function strongestChannelShare(details: Array<{ revenue: number; share?: number }>) {
  if (!details.length) return 0;
  const explicit = Math.max(...details.map((row) => typeof row.share === "number" ? row.share : 0));
  if (explicit > 0) return explicit;
  const total = details.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
  return total > 0 ? Math.max(...details.map((row) => Math.max(0, row.revenue) / total)) : 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDayTimestamp(value: string | Date | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function safeRatio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCurrency(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
