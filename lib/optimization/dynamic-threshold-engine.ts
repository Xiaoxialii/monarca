import { roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { PortfolioOptimizationInput } from "@/lib/optimization/profit-simulation-engine";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { dynamicThresholdProfileFromPolicy } from "@/lib/optimization/policy/optimization-policy";
import { getOptimizationPolicyForInput } from "@/lib/optimization/policy/policy-loader";

export type BusinessObjective = "GROWTH" | "PROFIT" | "CASH_RECOVERY" | "BALANCED";

export type DynamicThresholdProfile = {
  source: "optimization_outcome_history" | "user_historical" | "industry_benchmark" | "system_default";
  business_objective: BusinessObjective;
  industry: string;
  user_benchmark: {
    roas: number;
    margin: number;
    conversion_rate: number;
    inventory_turnover: number;
    cac: number;
  };
  scale_ads_threshold: {
    marginal_roas: number;
    confidence: number;
    margin: number;
    inventory_coverage_days: number;
    customer_quality: number;
  };
  price_threshold: {
    market_gap: number;
    elasticity: number;
    margin_headroom: number;
    conversion_stability: number;
  };
  channel_threshold: {
    channel_fit_score: number;
    confidence: number;
    margin: number;
  };
  inventory_threshold: {
    restock_coverage_days: number;
    excess_coverage_days: number;
    turnover: number;
  };
  portfolio_health_threshold: {
    marginal_roas: number;
    minimum_profit: number;
    confidence: number;
    recovery_probability: number;
  };
  lifecycle_adjustments: Record<SkuLifecycleStage, {
    scale_ads_multiplier: number;
    price_multiplier: number;
    cash_recovery_multiplier: number;
    learning_value_multiplier: number;
  }>;
};

export type OptimizationOutcomeHistoryRow = {
  action: string;
  prediction: number;
  actual: number;
  confidence?: number;
};

export function buildDynamicThresholdProfile(input: PortfolioOptimizationInput): DynamicThresholdProfile {
  return dynamicThresholdProfileFromPolicy(getOptimizationPolicyForInput(input));
}

export function applyOptimizationOutcomeHistory(profile: DynamicThresholdProfile, history: OptimizationOutcomeHistoryRow[]): DynamicThresholdProfile {
  if (!history.length) return profile;

  const scaleAds = actionHistory(history, /scale|ads/i);
  const price = actionHistory(history, /price|promotion/i);
  const inventory = actionHistory(history, /inventory|restock|clear/i);
  const next = structuredClone(profile);
  next.source = "optimization_outcome_history";

  if (scaleAds.length) {
    const scaleAccuracy = averageAccuracy(scaleAds);
    next.scale_ads_threshold.confidence = roundRatio(Math.max(0.45, Math.min(0.88, next.scale_ads_threshold.confidence + (0.72 - scaleAccuracy) * 0.18)));
    next.scale_ads_threshold.marginal_roas = roundRatio(Math.max(0.9, next.scale_ads_threshold.marginal_roas * actualPredictionRatio(scaleAds)));
  }

  if (price.length) {
    const priceAccuracy = averageAccuracy(price);
    next.price_threshold.market_gap = roundRatio(Math.max(0.06, Math.min(0.22, next.price_threshold.market_gap + (0.72 - priceAccuracy) * 0.04)));
  }

  if (inventory.length) {
    const inventoryRatio = actualPredictionRatio(inventory);
    next.inventory_threshold.excess_coverage_days = Math.round(Math.max(45, next.inventory_threshold.excess_coverage_days * inventoryRatio));
  }

  return next;
}

export function lifecycleThresholdMultiplier(profile: DynamicThresholdProfile, stage?: SkuLifecycleStage) {
  if (!stage) return { scale_ads_multiplier: 1, price_multiplier: 1, cash_recovery_multiplier: 1, learning_value_multiplier: 1 };
  return profile.lifecycle_adjustments[stage];
}

function actionHistory(history: OptimizationOutcomeHistoryRow[], pattern: RegExp) {
  return history.filter((row) => pattern.test(row.action));
}

function averageAccuracy(history: OptimizationOutcomeHistoryRow[]) {
  if (!history.length) return 1;
  return safeRatio(
    sum(history.map((row) => Math.max(0, 1 - Math.abs(row.actual - row.prediction) / Math.max(1, Math.abs(row.prediction))))),
    history.length
  );
}

function actualPredictionRatio(history: OptimizationOutcomeHistoryRow[]) {
  const predicted = sum(history.map((row) => Math.max(0, row.prediction)));
  const actual = sum(history.map((row) => Math.max(0, row.actual)));
  return roundRatio(Math.max(0.72, Math.min(1.28, safeRatio(actual, Math.max(1, predicted)) || 1)));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
