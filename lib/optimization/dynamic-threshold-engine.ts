import { roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { AdsCampaignInput, PortfolioOptimizationInput, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";

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

const SYSTEM_DEFAULT_PROFILE: DynamicThresholdProfile = {
  source: "system_default",
  business_objective: "BALANCED",
  industry: "general ecommerce",
  user_benchmark: {
    roas: 2.5,
    margin: 0.3,
    conversion_rate: 0.02,
    inventory_turnover: 0.18,
    cac: 35
  },
  scale_ads_threshold: {
    marginal_roas: 2.2,
    confidence: 0.65,
    margin: 0.3,
    inventory_coverage_days: 30,
    customer_quality: 0.45
  },
  price_threshold: {
    market_gap: 0.1,
    elasticity: -0.5,
    margin_headroom: 0.22,
    conversion_stability: 0.012
  },
  channel_threshold: {
    channel_fit_score: 0.52,
    confidence: 0.58,
    margin: 0.24
  },
  inventory_threshold: {
    restock_coverage_days: 21,
    excess_coverage_days: 90,
    turnover: 0.12
  },
  portfolio_health_threshold: {
    marginal_roas: 1.35,
    minimum_profit: 0,
    confidence: 0.48,
    recovery_probability: 0.32
  },
  lifecycle_adjustments: {
    LAUNCH: { scale_ads_multiplier: 1.35, price_multiplier: 1.15, cash_recovery_multiplier: 0.9, learning_value_multiplier: 1.35 },
    GROWTH: { scale_ads_multiplier: 0.9, price_multiplier: 1.05, cash_recovery_multiplier: 1, learning_value_multiplier: 1.05 },
    MATURE: { scale_ads_multiplier: 1.1, price_multiplier: 0.9, cash_recovery_multiplier: 0.85, learning_value_multiplier: 0.95 },
    DECLINING: { scale_ads_multiplier: 1.35, price_multiplier: 0.95, cash_recovery_multiplier: 0.72, learning_value_multiplier: 0.9 }
  }
};

export function buildDynamicThresholdProfile(input: PortfolioOptimizationInput): DynamicThresholdProfile {
  const businessObjective = input.business_objective ?? "BALANCED";
  const industry = input.industry ?? inferIndustry(input.skus);
  const industryProfile = industryBenchmarkProfile(industry, businessObjective);
  const userBenchmark = buildUserBenchmark(input.skus, input.ads ?? []);
  const hasUserHistory = input.skus.length >= 3 && input.skus.some((sku) => sku.order_count || sku.customer_count || sku.revenue_growth != null) || (input.ads?.length ?? 0) >= 3;
  const base = hasUserHistory ? userBenchmark : industryProfile.user_benchmark;
  const source = hasUserHistory ? "user_historical" : input.skus.length ? "industry_benchmark" : "system_default";
  const objective = objectiveAdjustment(businessObjective);
  const outcomeHistory = Array.isArray((input as { optimization_outcome_history?: OptimizationOutcomeHistoryRow[] }).optimization_outcome_history)
    ? (input as { optimization_outcome_history?: OptimizationOutcomeHistoryRow[] }).optimization_outcome_history ?? []
    : [];

  const profile: DynamicThresholdProfile = {
    ...industryProfile,
    source,
    business_objective: businessObjective,
    industry,
    user_benchmark: base,
    scale_ads_threshold: {
      marginal_roas: roundRatio(Math.max(1.15, base.roas * 0.82 * objective.scale)),
      confidence: roundRatio(Math.max(0.48, Math.min(0.82, 0.58 + base.conversion_rate * 2.2))),
      margin: roundRatio(Math.max(0.16, Math.min(0.55, base.margin * 0.82))),
      inventory_coverage_days: Math.round(industryProfile.scale_ads_threshold.inventory_coverage_days * objective.inventory),
      customer_quality: roundRatio(Math.max(0.28, Math.min(0.72, 0.35 + base.margin * 0.45)))
    },
    price_threshold: {
      market_gap: roundRatio(industryProfile.price_threshold.market_gap * objective.price),
      elasticity: roundRatio(industryProfile.price_threshold.elasticity),
      margin_headroom: roundRatio(Math.max(0.12, base.margin * 0.7)),
      conversion_stability: roundRatio(Math.max(0.006, base.conversion_rate * 0.55))
    },
    inventory_threshold: {
      restock_coverage_days: Math.round(industryProfile.inventory_threshold.restock_coverage_days * objective.inventory),
      excess_coverage_days: Math.round(industryProfile.inventory_threshold.excess_coverage_days * objective.cash),
      turnover: roundRatio(Math.max(0.05, base.inventory_turnover * 0.72))
    },
    portfolio_health_threshold: {
      marginal_roas: roundRatio(Math.max(0.8, base.roas * 0.48 * objective.cash)),
      minimum_profit: input.constraints.minimum_profit,
      confidence: businessObjective === "CASH_RECOVERY" ? 0.4 : industryProfile.portfolio_health_threshold.confidence,
      recovery_probability: businessObjective === "CASH_RECOVERY" ? 0.26 : industryProfile.portfolio_health_threshold.recovery_probability
    }
  };

  return outcomeHistory.length ? applyOptimizationOutcomeHistory(profile, outcomeHistory) : profile;
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

function buildUserBenchmark(skus: PortfolioSkuInput[], ads: AdsCampaignInput[]) {
  const revenue = sum(skus.map((sku) => sku.revenue));
  const adsSpend = sum(skus.map((sku) => sku.ads_spend));
  const grossProfit = sum(skus.map((sku) => Math.max(0, sku.net_profit)));
  const weightedMargin = safeRatio(sum(skus.map((sku) => sku.margin * Math.max(1, sku.revenue))), Math.max(1, revenue));
  const weightedConversion = safeRatio(sum(skus.map((sku) => sku.conversion_rate * Math.max(1, sku.revenue))), Math.max(1, revenue));
  const inventoryTurnover = safeRatio(sum(skus.map((sku) => sku.sales_velocity * 30)), Math.max(1, sum(skus.map((sku) => sku.inventory))));
  const adsRoas = ads.length
    ? safeRatio(sum(ads.map((campaign) => campaign.roas * Math.max(1, campaign.spend))), Math.max(1, sum(ads.map((campaign) => campaign.spend))))
    : safeRatio(revenue, Math.max(1, adsSpend));
  const orders = sum(skus.map((sku) => sku.order_count ?? sku.quantity));
  const cac = safeRatio(adsSpend, Math.max(1, orders));

  return {
    roas: roundRatio(Math.max(0.5, adsRoas)),
    margin: roundRatio(weightedMargin || safeRatio(grossProfit, Math.max(1, revenue))),
    conversion_rate: roundRatio(weightedConversion || 0.02),
    inventory_turnover: roundRatio(inventoryTurnover || 0.12),
    cac: roundRatio(cac || 35)
  };
}

function industryBenchmarkProfile(industry: string, businessObjective: BusinessObjective): DynamicThresholdProfile {
  const normalized = industry.toLowerCase();
  const profile = structuredClone(SYSTEM_DEFAULT_PROFILE);
  profile.source = "industry_benchmark";
  profile.business_objective = businessObjective;
  profile.industry = industry;

  if (/fashion|apparel|beauty/.test(normalized)) {
    profile.user_benchmark = { roas: 3.0, margin: 0.48, conversion_rate: 0.025, inventory_turnover: 0.2, cac: 32 };
    profile.scale_ads_threshold.margin = 0.34;
    profile.inventory_threshold.excess_coverage_days = 90;
  } else if (/home|furniture|decor/.test(normalized)) {
    profile.user_benchmark = { roas: 2.4, margin: 0.38, conversion_rate: 0.018, inventory_turnover: 0.11, cac: 55 };
    profile.inventory_threshold.excess_coverage_days = 120;
  } else if (/electronics|gadget/.test(normalized)) {
    profile.user_benchmark = { roas: 2.8, margin: 0.24, conversion_rate: 0.016, inventory_turnover: 0.18, cac: 48 };
    profile.scale_ads_threshold.margin = 0.2;
  }

  return profile;
}

function objectiveAdjustment(objective: BusinessObjective) {
  if (objective === "GROWTH") return { scale: 0.86, price: 1.05, inventory: 1.18, cash: 1.08 };
  if (objective === "PROFIT") return { scale: 1.02, price: 0.88, inventory: 1, cash: 0.95 };
  if (objective === "CASH_RECOVERY") return { scale: 1.18, price: 0.96, inventory: 0.9, cash: 0.72 };
  return { scale: 1, price: 1, inventory: 1, cash: 1 };
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

function inferIndustry(skus: PortfolioSkuInput[]) {
  const category = skus.find((sku) => sku.category)?.category;
  return category ?? "general ecommerce";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
