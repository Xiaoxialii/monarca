import type { PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";

export type OpportunityType =
  | "GROWTH"
  | "MARGIN_IMPROVEMENT"
  | "INVENTORY"
  | "AD_EFFICIENCY"
  | "CHANNEL_OPTIMIZATION";

export type Opportunity = {
  sku: string;
  opportunity_type: OpportunityType;
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

export function detectOptimizationOpportunities(skus: PortfolioSkuInput[]): Opportunity[] {
  return skus.flatMap((sku) => detectSkuOpportunities(sku));
}

function detectSkuOpportunities(sku: PortfolioSkuInput): Opportunity[] {
  const opportunities: Opportunity[] = [];
  const baseEvidence = {
    margin: sku.margin,
    net_profit: sku.net_profit,
    ads_spend: sku.ads_spend,
    inventory: sku.inventory,
    sales_velocity: sku.sales_velocity,
    conversion_rate: sku.conversion_rate,
    confidence: sku.prediction_confidence ?? 0.55
  };

  if (sku.margin >= 0.25 && sku.net_profit > 0 && sku.inventory > Math.max(10, sku.sales_velocity * 14)) {
    opportunities.push({
      sku: sku.sku,
      opportunity_type: "GROWTH",
      signals: ["high_margin", "positive_incremental_profit", "inventory_available"],
      evidence: baseEvidence,
      feasibility: feasibilityScore(sku, 0.9)
    });
  }

  if (sku.margin >= 0.18 && sku.conversion_rate > 0.01) {
    opportunities.push({
      sku: sku.sku,
      opportunity_type: "MARGIN_IMPROVEMENT",
      signals: ["margin_room", "conversion_data_available", "price_elasticity_testable"],
      evidence: baseEvidence,
      feasibility: feasibilityScore(sku, 0.78)
    });
  }

  if (sku.net_profit > 0 && sku.sales_velocity > 0 && sku.inventory < sku.sales_velocity * 21) {
    opportunities.push({
      sku: sku.sku,
      opportunity_type: "INVENTORY",
      signals: ["demand_present", "stock_coverage_limited", "profit_protection"],
      evidence: baseEvidence,
      feasibility: feasibilityScore(sku, 0.72)
    });
  }

  if (sku.ads_spend > 0 && sku.margin < 0.18) {
    opportunities.push({
      sku: sku.sku,
      opportunity_type: "AD_EFFICIENCY",
      signals: ["paid_spend_present", "margin_pressure", "budget_reallocation_candidate"],
      evidence: baseEvidence,
      feasibility: feasibilityScore(sku, 0.68)
    });
  }

  if (opportunities.length === 0) {
    opportunities.push({
      sku: sku.sku,
      opportunity_type: "CHANNEL_OPTIMIZATION",
      signals: ["hold_baseline", "monitor_channel_mix"],
      evidence: baseEvidence,
      feasibility: feasibilityScore(sku, 0.55)
    });
  }

  return opportunities;
}

function feasibilityScore(sku: PortfolioSkuInput, base: number) {
  const confidence = sku.prediction_confidence ?? 0.55;
  const inventoryFactor = sku.inventory > 0 ? 0.08 : -0.12;
  const marginFactor = sku.margin > 0 ? Math.min(0.08, sku.margin * 0.1) : -0.1;
  return Math.max(0.1, Math.min(0.98, base + confidence * 0.12 + inventoryFactor + marginFactor));
}
