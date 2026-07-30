import type { DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";
import type { PortfolioAction, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { ActionEligibilityResult, ActionPolicyRule, OptimizationPolicy, PolicyTrace, PortfolioGovernanceAction } from "@/lib/optimization/policy/optimization-policy-types";

export function dynamicThresholdProfileFromPolicy(policy: OptimizationPolicy): DynamicThresholdProfile {
  return {
    source: policy.source === "workspace_policy" || policy.source === "ai_learned_thresholds" || policy.source === "business_objective"
      ? "user_historical"
      : policy.source,
    business_objective: policy.objective,
    industry: policy.industry,
    user_benchmark: {
      roas: policy.userBenchmark.roas,
      margin: policy.userBenchmark.margin,
      conversion_rate: policy.userBenchmark.conversionRate,
      inventory_turnover: policy.userBenchmark.inventoryTurnover,
      cac: policy.userBenchmark.cac
    },
    scale_ads_threshold: {
      marginal_roas: policy.thresholds.advertising.scaleAds.minimumMarginalRoas,
      confidence: policy.thresholds.advertising.scaleAds.minimumConfidence,
      margin: policy.thresholds.advertising.scaleAds.minimumMargin,
      inventory_coverage_days: policy.thresholds.advertising.scaleAds.minimumInventoryCoverageDays,
      customer_quality: policy.thresholds.advertising.scaleAds.minimumCustomerQuality
    },
    price_threshold: {
      market_gap: policy.thresholds.pricing.marketGap,
      elasticity: policy.thresholds.pricing.elasticityFloor,
      margin_headroom: policy.thresholds.pricing.minimumMarginHeadroom,
      conversion_stability: policy.thresholds.pricing.minimumConversionStability
    },
    channel_threshold: {
      channel_fit_score: policy.thresholds.channel.minimumFitScore,
      confidence: policy.thresholds.channel.minimumConfidence,
      margin: policy.thresholds.channel.minimumMargin
    },
    inventory_threshold: {
      restock_coverage_days: policy.thresholds.inventory.stockoutRiskDays,
      excess_coverage_days: policy.thresholds.inventory.excessInventoryDays,
      turnover: policy.thresholds.inventory.minimumInventoryTurnover
    },
    portfolio_health_threshold: {
      marginal_roas: policy.thresholds.advertising.reduceAds.roasThreshold,
      minimum_profit: policy.thresholds.portfolioHealth.minimumProfit,
      confidence: policy.thresholds.portfolioHealth.minimumConfidence,
      recovery_probability: policy.thresholds.portfolioHealth.recoveryProbability
    },
    lifecycle_adjustments: {
      LAUNCH: { scale_ads_multiplier: 1.35, price_multiplier: 1.15, cash_recovery_multiplier: 0.9, learning_value_multiplier: 1.35 },
      GROWTH: { scale_ads_multiplier: 0.9, price_multiplier: 1.05, cash_recovery_multiplier: 1, learning_value_multiplier: 1.05 },
      MATURE: { scale_ads_multiplier: 1.1, price_multiplier: 0.9, cash_recovery_multiplier: 0.85, learning_value_multiplier: 0.95 },
      DECLINING: { scale_ads_multiplier: 1.35, price_multiplier: 0.95, cash_recovery_multiplier: 0.72, learning_value_multiplier: 0.9 }
    }
  };
}

export function evaluateActionEligibility(input: {
  sku: PortfolioSkuInput;
  action: PortfolioAction;
  policy: OptimizationPolicy;
  marginalRoas?: number | null;
  confidence?: number | null;
  coverageDays?: number | null;
  priceElasticityConfidence?: number | null;
  marketGap?: number | null;
  clearInventoryEligible?: boolean;
}): ActionEligibilityResult {
  const { sku, action, policy } = input;
  const rule = policyRuleForAction(action);
  const coverageDays = input.coverageDays ?? inventoryCoverageDays(sku);
  const confidence = input.confidence ?? sku.prediction_confidence ?? 0.55;
  const marginalRoas = input.marginalRoas ?? (sku.ads_spend > 0 ? sku.revenue / Math.max(1, sku.ads_spend) : 0);
  const reasons: string[] = [];
  const rejectedReasons: string[] = [];
  const thresholds: Record<string, number | string | boolean> = {};
  const metrics: Record<string, number | string | boolean | null> = {
    margin: roundRatio(sku.margin),
    confidence: roundRatio(confidence),
    marginalRoas: roundRatio(marginalRoas),
    inventoryCoverageDays: roundRatio(coverageDays),
    salesVelocity: roundRatio(sku.sales_velocity),
    conversionRate: roundRatio(sku.conversion_rate),
    netProfit: roundCurrency(sku.net_profit)
  };

  const requireRule = (passed: boolean, passedReason: string, rejectedReason: string) => {
    if (passed) reasons.push(passedReason);
    else rejectedReasons.push(rejectedReason);
  };

  if (action === "HOLD") {
    reasons.push("Baseline action is always allowed.");
  } else if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5") {
    const threshold = policy.thresholds.advertising.scaleAds;
    thresholds.minimumMarginalRoas = threshold.minimumMarginalRoas;
    thresholds.minimumMargin = threshold.minimumMargin;
    thresholds.minimumConfidence = threshold.minimumConfidence;
    thresholds.minimumInventoryCoverageDays = threshold.minimumInventoryCoverageDays;
    requireRule(marginalRoas >= threshold.minimumMarginalRoas, "ROAS exceeds threshold.", "ROAS below scale ads threshold.");
    requireRule(sku.margin >= threshold.minimumMargin, "Margin sufficient.", "Margin below scale ads threshold.");
    requireRule(confidence >= threshold.minimumConfidence, "Confidence sufficient.", "Confidence below scale ads threshold.");
    requireRule(coverageDays >= threshold.minimumInventoryCoverageDays, "Inventory sufficient.", "Inventory coverage below scale ads threshold.");
    requireRule(sku.net_profit > 0, "Profit is positive.", "Current profit is not positive.");
  } else if (action === "TEST_AD_SPEND") {
    thresholds.minimumConfidence = Math.max(0.28, policy.thresholds.portfolioHealth.minimumConfidence - 0.2);
    requireRule(confidence >= Number(thresholds.minimumConfidence), "Enough confidence for controlled test.", "Confidence too low for ad test.");
  } else if (action === "REDUCE_ADS") {
    const threshold = policy.thresholds.advertising.reduceAds;
    thresholds.roasThreshold = threshold.roasThreshold;
    requireRule(sku.ads_spend > 0, "Paid spend exists.", "No paid spend to reduce.");
    requireRule(marginalRoas < threshold.roasThreshold || sku.margin < policy.thresholds.pricing.minimumMarginHeadroom || sku.net_profit < 0, "Efficiency or margin pressure exists.", "No low-efficiency ads evidence.");
  } else if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") {
    const threshold = policy.thresholds.pricing;
    thresholds.minimumElasticityConfidence = threshold.minimumElasticityConfidence;
    thresholds.minimumConversionStability = threshold.minimumConversionStability;
    thresholds.marketGap = threshold.marketGap;
    metrics.marketGap = input.marketGap ?? null;
    metrics.elasticityConfidence = input.priceElasticityConfidence ?? null;
    requireRule(sku.conversion_rate >= threshold.minimumConversionStability, "Conversion stability sufficient.", "Conversion stability below pricing threshold.");
    requireRule((input.priceElasticityConfidence ?? threshold.minimumElasticityConfidence) >= threshold.minimumElasticityConfidence, "Elasticity confidence sufficient.", "Elasticity confidence below pricing threshold.");
  } else if (action === "RESTOCK_AND_SCALE") {
    const threshold = policy.thresholds.inventory;
    thresholds.stockoutRiskDays = threshold.stockoutRiskDays;
    requireRule(coverageDays < threshold.stockoutRiskDays, "Inventory coverage is below stockout threshold.", "Inventory coverage does not indicate stockout risk.");
    requireRule(sku.sales_velocity > 0, "Sales velocity supports restock.", "Sales velocity does not support restock.");
  } else if (action === "REDUCE_INVENTORY") {
    const threshold = policy.thresholds.inventory;
    thresholds.excessInventoryDays = threshold.excessInventoryDays;
    requireRule(coverageDays > threshold.excessInventoryDays, "Inventory coverage exceeds excess threshold.", "Inventory coverage below clearance threshold.");
    requireRule(input.clearInventoryEligible === true, "Clearance quality threshold passed.", "Clearance quality threshold not met.");
  } else if (action === "STOP") {
    const threshold = policy.thresholds.advertising.stopAds;
    thresholds.lossThreshold = threshold.lossThreshold;
    thresholds.roasThreshold = threshold.roasThreshold;
    requireRule(sku.net_profit < threshold.lossThreshold || marginalRoas < threshold.roasThreshold, "Loss or very low ROAS supports stop action.", "Stop action lacks loss evidence.");
  } else if (action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE") {
    const threshold = policy.thresholds.channel;
    thresholds.minimumMargin = threshold.minimumMargin;
    requireRule(sku.margin >= threshold.minimumMargin, "Margin supports channel action.", "Margin below channel threshold.");
    requireRule(sku.revenue > 0, "Revenue history supports channel action.", "No revenue history for channel action.");
  }

  return {
    action,
    policyRule: rule,
    allowed: rejectedReasons.length === 0,
    reasons,
    rejectedReasons,
    thresholds,
    metrics
  };
}

export function policyTraceFromEligibility(policy: OptimizationPolicy, eligibility: ActionEligibilityResult): PolicyTrace {
  return {
    policyVersion: policy.version,
    policySource: policy.source,
    policyRule: eligibility.policyRule,
    thresholds: eligibility.thresholds,
    metrics: eligibility.metrics,
    passedRules: eligibility.reasons,
    failedRules: eligibility.rejectedReasons
  };
}

export function governanceActionForPortfolioAction(action: PortfolioAction): PortfolioGovernanceAction | null {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "TEST_AD_SPEND") return "SCALE_ADS";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return "PRICE_CHANGE";
  if (action === "REDUCE_INVENTORY") return "CLEARANCE";
  if (action === "RESTOCK_AND_SCALE") return "RESTOCK";
  if (action === "STOP") return "STOP";
  if (action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE") return "CHANNEL";
  return null;
}

export function policyRuleForAction(action: PortfolioAction): ActionPolicyRule {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5") return "advertising.scaleAds";
  if (action === "TEST_AD_SPEND") return "advertising.testAds";
  if (action === "REDUCE_ADS") return "advertising.reduceAds";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return "pricing.adjustPrice";
  if (action === "RESTOCK_AND_SCALE") return "inventory.restock";
  if (action === "REDUCE_INVENTORY") return "inventory.clearance";
  if (action === "STOP") return "portfolio.stop";
  if (action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE") return "channel.expand";
  return "portfolio.hold";
}

function inventoryCoverageDays(sku: PortfolioSkuInput) {
  return sku.sales_velocity > 0 ? sku.inventory / Math.max(0.1, sku.sales_velocity) : 999;
}
