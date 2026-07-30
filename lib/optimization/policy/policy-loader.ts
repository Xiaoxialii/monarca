import { roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { AdsCampaignInput, PortfolioOptimizationInput, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import type { OptimizationPolicy, OptimizationPolicyOverride, OptimizationPolicySource } from "@/lib/optimization/policy/optimization-policy-types";

export type OptimizationPolicyRequest = {
  workspaceId?: string;
  industry?: string;
  objective?: OptimizationPolicy["objective"];
  skus?: PortfolioSkuInput[];
  ads?: AdsCampaignInput[];
  constraints?: PortfolioOptimizationInput["constraints"];
  optimizationOutcomeHistory?: Array<{ action: string; prediction: number; actual: number; confidence?: number }>;
  workspacePolicy?: OptimizationPolicyOverride;
};

export function getOptimizationPolicy(request: OptimizationPolicyRequest = {}): OptimizationPolicy {
  const objective = request.objective ?? "BALANCED";
  const industry = request.industry ?? inferIndustry(request.skus ?? []);
  const industryPolicy = applyIndustryPolicy(DEFAULT_OPTIMIZATION_POLICY, industry);
  const userBenchmark = buildUserBenchmark(request.skus ?? [], request.ads ?? []);
  const hasUserHistory = (request.skus?.length ?? 0) >= 3 &&
    ((request.skus ?? []).some((sku) => sku.order_count || sku.customer_count || sku.revenue_growth != null) || (request.ads?.length ?? 0) >= 3);
  const benchmark = hasUserHistory ? userBenchmark : industryPolicy.userBenchmark;
  const objectivePolicy = applyObjectivePolicy({
    ...industryPolicy,
    source: hasUserHistory ? "user_historical" : request.skus?.length ? "industry_benchmark" : "system_default",
    objective,
    industry,
    userBenchmark: benchmark
  }, objective, benchmark, request.constraints, hasUserHistory);
  const learnedPolicy = applyOptimizationOutcomeHistory(objectivePolicy, request.optimizationOutcomeHistory ?? []);
  return mergePolicy(learnedPolicy, request.workspacePolicy);
}

export function getOptimizationPolicyForInput(input: PortfolioOptimizationInput): OptimizationPolicy {
  return getOptimizationPolicy({
    industry: input.industry,
    objective: input.business_objective,
    skus: input.skus,
    ads: input.ads ?? [],
    constraints: input.constraints,
    optimizationOutcomeHistory: Array.isArray((input as { optimization_outcome_history?: OptimizationPolicyRequest["optimizationOutcomeHistory"] }).optimization_outcome_history)
      ? (input as { optimization_outcome_history?: OptimizationPolicyRequest["optimizationOutcomeHistory"] }).optimization_outcome_history
      : []
  });
}

function applyIndustryPolicy(base: OptimizationPolicy, industry: string): OptimizationPolicy {
  const policy = clonePolicy(base);
  const normalized = industry.toLowerCase();
  policy.industry = industry;
  policy.source = "industry_benchmark";

  if (/fashion|apparel|beauty/.test(normalized)) {
    policy.userBenchmark = { roas: 3.0, margin: 0.48, conversionRate: 0.025, inventoryTurnover: 0.2, cac: 32 };
    policy.thresholds.advertising.scaleAds.minimumMargin = 0.34;
    policy.thresholds.inventory.excessInventoryDays = 90;
  } else if (/home|furniture|decor/.test(normalized)) {
    policy.userBenchmark = { roas: 2.4, margin: 0.38, conversionRate: 0.018, inventoryTurnover: 0.11, cac: 55 };
    policy.thresholds.inventory.excessInventoryDays = 120;
  } else if (/electronics|gadget/.test(normalized)) {
    policy.userBenchmark = { roas: 2.8, margin: 0.24, conversionRate: 0.016, inventoryTurnover: 0.18, cac: 48 };
    policy.thresholds.advertising.scaleAds.minimumMargin = 0.2;
  }

  return policy;
}

function applyObjectivePolicy(
  policy: OptimizationPolicy,
  objective: OptimizationPolicy["objective"],
  benchmark: OptimizationPolicy["userBenchmark"],
  constraints?: PortfolioOptimizationInput["constraints"],
  useBenchmarkCalibration = false
) {
  const next = clonePolicy(policy);
  const adjustment = objectiveAdjustment(objective);
  if (objective !== "BALANCED") next.source = maxSource(next.source, "business_objective");
  next.thresholds.advertising.scaleAds.minimumMarginalRoas = useBenchmarkCalibration
    ? roundRatio(Math.max(1.15, benchmark.roas * 0.82 * adjustment.scale))
    : roundRatio(next.thresholds.advertising.scaleAds.minimumMarginalRoas * adjustment.scale);
  next.thresholds.advertising.scaleAds.minimumConfidence = useBenchmarkCalibration
    ? roundRatio(Math.max(0.48, Math.min(0.82, 0.58 + benchmark.conversionRate * 2.2)))
    : next.thresholds.advertising.scaleAds.minimumConfidence;
  next.thresholds.advertising.scaleAds.minimumMargin = useBenchmarkCalibration
    ? roundRatio(Math.max(0.16, Math.min(0.55, benchmark.margin * 0.82)))
    : next.thresholds.advertising.scaleAds.minimumMargin;
  next.thresholds.advertising.scaleAds.minimumInventoryCoverageDays = Math.round(next.thresholds.advertising.scaleAds.minimumInventoryCoverageDays * adjustment.inventory);
  next.thresholds.advertising.scaleAds.minimumCustomerQuality = roundRatio(Math.max(0.28, Math.min(0.72, 0.35 + benchmark.margin * 0.45)));
  next.thresholds.pricing.marketGap = roundRatio(next.thresholds.pricing.marketGap * adjustment.price);
  next.thresholds.pricing.minimumMarginHeadroom = useBenchmarkCalibration
    ? roundRatio(Math.max(0.12, benchmark.margin * 0.7))
    : next.thresholds.pricing.minimumMarginHeadroom;
  next.thresholds.pricing.minimumConversionStability = useBenchmarkCalibration
    ? roundRatio(Math.max(0.006, benchmark.conversionRate * 0.55))
    : next.thresholds.pricing.minimumConversionStability;
  next.thresholds.inventory.stockoutRiskDays = Math.round(next.thresholds.inventory.stockoutRiskDays * adjustment.inventory);
  next.thresholds.inventory.excessInventoryDays = Math.round(next.thresholds.inventory.excessInventoryDays * adjustment.cash);
  next.thresholds.inventory.minimumInventoryTurnover = useBenchmarkCalibration
    ? roundRatio(Math.max(0.05, benchmark.inventoryTurnover * 0.72))
    : next.thresholds.inventory.minimumInventoryTurnover;
  next.thresholds.portfolioHealth.minimumProfit = constraints?.minimum_profit ?? next.thresholds.portfolioHealth.minimumProfit;
  next.thresholds.portfolioHealth.minimumConfidence = objective === "CASH_RECOVERY" ? 0.4 : next.thresholds.portfolioHealth.minimumConfidence;
  next.thresholds.portfolioHealth.recoveryProbability = objective === "CASH_RECOVERY" ? 0.26 : next.thresholds.portfolioHealth.recoveryProbability;
  return next;
}

function applyOptimizationOutcomeHistory(policy: OptimizationPolicy, history: NonNullable<OptimizationPolicyRequest["optimizationOutcomeHistory"]>) {
  if (!history.length) return policy;
  const next = clonePolicy(policy);
  next.source = "optimization_outcome_history";
  const scaleAds = actionHistory(history, /scale|ads/i);
  const price = actionHistory(history, /price|promotion/i);
  const inventory = actionHistory(history, /inventory|restock|clear/i);

  if (scaleAds.length) {
    const scaleAccuracy = averageAccuracy(scaleAds);
    next.thresholds.advertising.scaleAds.minimumConfidence = roundRatio(Math.max(0.45, Math.min(0.88, next.thresholds.advertising.scaleAds.minimumConfidence + (0.72 - scaleAccuracy) * 0.18)));
    next.thresholds.advertising.scaleAds.minimumMarginalRoas = roundRatio(Math.max(0.9, next.thresholds.advertising.scaleAds.minimumMarginalRoas * actualPredictionRatio(scaleAds)));
  }

  if (price.length) {
    const priceAccuracy = averageAccuracy(price);
    next.thresholds.pricing.marketGap = roundRatio(Math.max(0.06, Math.min(0.22, next.thresholds.pricing.marketGap + (0.72 - priceAccuracy) * 0.04)));
  }

  if (inventory.length) {
    next.thresholds.inventory.excessInventoryDays = Math.round(Math.max(45, next.thresholds.inventory.excessInventoryDays * actualPredictionRatio(inventory)));
  }

  return next;
}

function mergePolicy(policy: OptimizationPolicy, override?: OptimizationPolicyOverride): OptimizationPolicy {
  if (!override) return policy;
  const merged = deepMerge(clonePolicy(policy), override) as OptimizationPolicy;
  merged.source = override.source ?? "workspace_policy";
  return merged;
}

function buildUserBenchmark(skus: PortfolioSkuInput[], ads: AdsCampaignInput[]) {
  const revenue = sum(skus.map((sku) => sku.revenue));
  const adsSpend = sum(skus.map((sku) => sku.ads_spend));
  const grossProfit = sum(skus.map((sku) => Math.max(0, sku.net_profit)));
  const weightedMargin = safeRatio(sum(skus.map((sku) => sku.margin * Math.max(1, sku.revenue))), Math.max(1, revenue));
  const weightedConversion = safeRatio(sum(skus.map((sku) => sku.conversion_rate * Math.max(1, sku.revenue))), Math.max(1, revenue));
  const inventoryTurnover = safeRatio(sum(skus.map((sku) => sku.sales_velocity * 30)), Math.max(1, sum(skus.map((sku) => sku.inventory))));
  const usableAds = ads.filter((campaign) => typeof campaign.roas === "number" && Number.isFinite(campaign.roas) && campaign.roas > 0);
  const adsRoas = usableAds.length
    ? safeRatio(sum(usableAds.map((campaign) => (campaign.roas ?? 0) * Math.max(1, campaign.spend))), Math.max(1, sum(usableAds.map((campaign) => campaign.spend))))
    : safeRatio(revenue, Math.max(1, adsSpend));
  const orders = sum(skus.map((sku) => sku.order_count ?? sku.quantity));
  const cac = safeRatio(adsSpend, Math.max(1, orders));

  return {
    roas: roundRatio(Math.max(0.5, adsRoas)),
    margin: roundRatio(weightedMargin || safeRatio(grossProfit, Math.max(1, revenue))),
    conversionRate: roundRatio(weightedConversion || 0.02),
    inventoryTurnover: roundRatio(inventoryTurnover || 0.12),
    cac: roundRatio(cac || 35)
  };
}

function objectiveAdjustment(objective: OptimizationPolicy["objective"]) {
  if (objective === "GROWTH") return { scale: 0.86, price: 1.05, inventory: 1.18, cash: 1.08 };
  if (objective === "PROFIT") return { scale: 1.02, price: 0.88, inventory: 1, cash: 0.95 };
  if (objective === "CASH_RECOVERY") return { scale: 1.18, price: 0.96, inventory: 0.9, cash: 0.72 };
  return { scale: 1, price: 1, inventory: 1, cash: 1 };
}

function maxSource(current: OptimizationPolicySource, fallback: OptimizationPolicySource) {
  return current === "system_default" ? fallback : current;
}

function inferIndustry(skus: PortfolioSkuInput[]) {
  return skus.find((sku) => sku.category)?.category ?? "general ecommerce";
}

function actionHistory(history: NonNullable<OptimizationPolicyRequest["optimizationOutcomeHistory"]>, pattern: RegExp) {
  return history.filter((row) => pattern.test(row.action));
}

function averageAccuracy(history: NonNullable<OptimizationPolicyRequest["optimizationOutcomeHistory"]>) {
  if (!history.length) return 1;
  return safeRatio(
    sum(history.map((row) => Math.max(0, 1 - Math.abs(row.actual - row.prediction) / Math.max(1, Math.abs(row.prediction))))),
    history.length
  );
}

function actualPredictionRatio(history: NonNullable<OptimizationPolicyRequest["optimizationOutcomeHistory"]>) {
  const predicted = sum(history.map((row) => Math.max(0, row.prediction)));
  const actual = sum(history.map((row) => Math.max(0, row.actual)));
  return roundRatio(Math.max(0.72, Math.min(1.28, safeRatio(actual, Math.max(1, predicted)) || 1)));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function clonePolicy(policy: OptimizationPolicy): OptimizationPolicy {
  return structuredClone(policy);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isRecord(value) && isRecord(target[key])) {
      target[key] = deepMerge(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
