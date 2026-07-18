import type { PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import type { DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";

export type OpportunityType =
  | "GROWTH"
  | "MARGIN_IMPROVEMENT"
  | "INVENTORY"
  | "AD_EFFICIENCY"
  | "CHANNEL_OPTIMIZATION"
  | "CHANNEL"
  | "PROFIT"
  | "PORTFOLIO";

export type Opportunity = {
  sku: string;
  opportunity_type: OpportunityType;
  opportunity_types: OpportunityType[];
  opportunity_score: number;
  score_components: {
    demand_growth: number;
    customer_quality: number;
    channel_fit: number;
    margin_headroom: number;
    inventory_capacity: number;
    competition_risk: number;
  };
  signals: string[];
  evidence: {
    margin: number;
    net_profit: number;
    ads_spend: number;
    inventory: number;
    sales_velocity: number;
    conversion_rate: number;
    confidence: number;
  };
  feasibility: number;
};

export function detectOptimizationOpportunities(skus: PortfolioSkuInput[], thresholdProfile?: DynamicThresholdProfile): Opportunity[] {
  return skus.map((sku) => detectSkuOpportunitySpace(sku, thresholdProfile));
}

function detectSkuOpportunitySpace(sku: PortfolioSkuInput, thresholdProfile?: DynamicThresholdProfile): Opportunity {
  const opportunityTypes = new Set<OpportunityType>();
  const signals = new Set<string>();
  const coverageDays = sku.sales_velocity > 0 ? sku.inventory / Math.max(0.1, sku.sales_velocity) : 999;
  const confidence = sku.prediction_confidence ?? 0.55;
  const growthMarginThreshold = thresholdProfile?.scale_ads_threshold.margin ?? 0.25;
  const growthConfidenceThreshold = thresholdProfile?.scale_ads_threshold.confidence ?? 0.6;
  const growthCoverageThreshold = thresholdProfile?.scale_ads_threshold.inventory_coverage_days ?? 14;
  const priceMarginThreshold = thresholdProfile?.price_threshold.margin_headroom ?? 0.18;
  const priceConversionThreshold = thresholdProfile?.price_threshold.conversion_stability ?? 0.01;
  const restockCoverageThreshold = thresholdProfile?.inventory_threshold.restock_coverage_days ?? 21;
  const excessCoverageThreshold = thresholdProfile?.inventory_threshold.excess_coverage_days ?? 90;
  const adWasteRoasThreshold = thresholdProfile?.portfolio_health_threshold.marginal_roas ?? 1.35;
  const estimatedRoas = sku.ads_spend > 0 ? sku.revenue / Math.max(1, sku.ads_spend) : 0;
  const marginalRoasThreshold = thresholdProfile?.scale_ads_threshold.marginal_roas ?? 2.2;
  const stableDemand = (sku.revenue_growth ?? 0) >= -0.04 && (sku.order_growth ?? sku.revenue_growth ?? 0) >= -0.04 && (sku.conversion_trend ?? 0) >= -0.04;
  const baseEvidence = {
    margin: sku.margin,
    net_profit: sku.net_profit,
    ads_spend: sku.ads_spend,
    inventory: sku.inventory,
    sales_velocity: sku.sales_velocity,
    conversion_rate: sku.conversion_rate,
    confidence: sku.prediction_confidence ?? 0.55
  };

  if (
    sku.margin >= growthMarginThreshold &&
    sku.net_profit > 0 &&
    coverageDays >= growthCoverageThreshold &&
    confidence >= Math.max(0.45, growthConfidenceThreshold - 0.08) &&
    stableDemand &&
    (sku.ads_spend <= 0 || estimatedRoas >= marginalRoasThreshold)
  ) {
    opportunityTypes.add("GROWTH");
    signals.add("high_margin");
    signals.add("positive_incremental_profit");
    signals.add("inventory_available");
  }

  if (sku.margin >= priceMarginThreshold && sku.conversion_rate >= priceConversionThreshold) {
    opportunityTypes.add("PROFIT");
    opportunityTypes.add("MARGIN_IMPROVEMENT");
    signals.add("margin_room");
    signals.add("conversion_data_available");
    signals.add("price_elasticity_testable");
  }

  if (sku.net_profit > 0 && sku.sales_velocity > 0 && coverageDays < restockCoverageThreshold) {
    opportunityTypes.add("INVENTORY");
    signals.add("demand_present");
    signals.add("stock_coverage_limited");
    signals.add("profit_protection");
  }

  if (sku.ads_spend > 0 && (sku.margin < priceMarginThreshold || estimatedRoas < adWasteRoasThreshold)) {
    opportunityTypes.add("PORTFOLIO");
    opportunityTypes.add("AD_EFFICIENCY");
    signals.add("paid_spend_present");
    signals.add("margin_pressure");
    signals.add("budget_reallocation_candidate");
  }

  if (sku.revenue > 0 && sku.conversion_rate > Math.max(0.004, priceConversionThreshold * 0.5) && sku.margin >= (thresholdProfile?.channel_threshold.margin ?? 0.18)) {
    opportunityTypes.add("CHANNEL");
    opportunityTypes.add("CHANNEL_OPTIMIZATION");
    signals.add("channel_fit_testable");
  }

  if (coverageDays > excessCoverageThreshold && sku.sales_velocity > 0) {
    opportunityTypes.add("INVENTORY");
    signals.add("excess_inventory");
    signals.add("cash_recovery_candidate");
  }

  if (!opportunityTypes.size) {
    opportunityTypes.add("PORTFOLIO");
    signals.add("hold_baseline");
    signals.add("monitor_channel_mix");
  }

  const scoreComponents = opportunityScoreComponents(sku);
  const opportunityScore = Math.max(0, Math.min(100, Math.round((
    scoreComponents.demand_growth +
      scoreComponents.customer_quality +
      scoreComponents.channel_fit +
      scoreComponents.margin_headroom +
      scoreComponents.inventory_capacity -
      scoreComponents.competition_risk
  ) * 100)));

  return {
    sku: sku.sku,
    opportunity_type: primaryOpportunityType(Array.from(opportunityTypes)),
    opportunity_types: Array.from(opportunityTypes),
    opportunity_score: opportunityScore,
    score_components: scoreComponents,
    signals: Array.from(signals),
    evidence: baseEvidence,
    feasibility: feasibilityScore(sku, 0.72 + opportunityScore / 600)
  };
}

function feasibilityScore(sku: PortfolioSkuInput, base: number) {
  const confidence = sku.prediction_confidence ?? 0.55;
  const inventoryFactor = sku.inventory > 0 ? 0.08 : -0.12;
  const marginFactor = sku.margin > 0 ? Math.min(0.08, sku.margin * 0.1) : -0.1;
  return Math.max(0.1, Math.min(0.98, base + confidence * 0.12 + inventoryFactor + marginFactor));
}

function opportunityScoreComponents(sku: PortfolioSkuInput) {
  const revenueGrowth = sku.revenue_growth ?? Math.min(0.45, Math.max(-0.2, sku.sales_velocity / Math.max(1, sku.quantity)));
  const demandGrowth = Math.max(0, Math.min(1, 0.35 + revenueGrowth));
  const customerQuality = Math.max(0, Math.min(1, sku.customer_ltv / Math.max(1, sku.price * 6) + (sku.repeat_rate ?? 0) * 0.35));
  const channelFit = Math.max(0, Math.min(1, sku.conversion_rate * 12 + (sku.ads_spend > 0 ? 0.18 : 0)));
  const marginHeadroom = Math.max(0, Math.min(1, sku.margin / 0.55));
  const inventoryCapacity = sku.sales_velocity > 0 ? Math.max(0, Math.min(1, sku.inventory / Math.max(1, sku.sales_velocity * 45))) : 0.35;
  const competitionRisk = Math.max(0, Math.min(1, sku.refund_rate * 1.5 + (sku.margin < 0.12 ? 0.25 : 0)));

  return {
    demand_growth: demandGrowth,
    customer_quality: customerQuality,
    channel_fit: channelFit,
    margin_headroom: marginHeadroom,
    inventory_capacity: inventoryCapacity,
    competition_risk: competitionRisk
  };
}

function primaryOpportunityType(types: OpportunityType[]): OpportunityType {
  if (types.includes("GROWTH")) return "GROWTH";
  if (types.includes("PROFIT")) return "PROFIT";
  if (types.includes("INVENTORY")) return "INVENTORY";
  if (types.includes("CHANNEL")) return "CHANNEL";
  return types[0] ?? "PORTFOLIO";
}
