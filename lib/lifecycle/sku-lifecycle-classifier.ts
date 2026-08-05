import { roundRatio } from "@/lib/optimization/objective";
import type { AdsCampaignInput, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { calculateLifecycleScore, dominantLifecycleStage, inventoryRunwayDays, lifecycleConfidence, type SkuLifecycleScore, type SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { LIFECYCLE_STAGE_STRATEGIES } from "@/lib/lifecycle/sku-stage-rules";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";

export type SkuLifecycleClassification = {
  sku: string;
  lifecycle_stage: SkuLifecycleStage;
  lifecycle_score: SkuLifecycleScore;
  confidence: number;
  lifecycle_confidence: "HIGH" | "MEDIUM" | "LOW";
  reason?: string;
  signals: string[];
  optimization_goal: (typeof LIFECYCLE_STAGE_STRATEGIES)[SkuLifecycleStage]["goal"];
  policy_version?: string;
};

export function classifySkuLifecycle(input: {
  sku: PortfolioSkuInput;
  ads?: AdsCampaignInput[];
  policy?: OptimizationPolicy;
}): SkuLifecycleClassification {
  const policy = input.policy ?? DEFAULT_OPTIMIZATION_POLICY;
  const skuAds = (input.ads ?? []).filter((row) =>
    row.sku === input.sku.sku &&
    row.spend > 0 &&
    typeof row.roas === "number" &&
    Number.isFinite(row.roas) &&
    row.roas > 0
  );
  const roas = skuAds.length
    ? roundRatio(skuAds.reduce((sum, row) => sum + (row.roas ?? 0) * row.spend, 0) / Math.max(1, skuAds.reduce((sum, row) => sum + row.spend, 0)))
    : null;
  const orderPeriodCount = orderPeriodCountForSku(input.sku);
  if (orderPeriodCount < 2) {
    const stage: SkuLifecycleStage = "UNKNOWN";
    const score: SkuLifecycleScore = {
      launch_score: 0.08,
      growth_score: 0,
      mature_score: 0.08,
      decline_score: 0
    };
    return {
      sku: input.sku.sku,
      lifecycle_stage: stage,
      lifecycle_score: score,
      confidence: 0.35,
      lifecycle_confidence: "LOW",
      reason: "Insufficient historical periods",
      signals: Array.from(new Set([
        "single_order_period",
        "insufficient_history_for_trend",
        ...(input.sku.net_profit > 0 ? ["positive_profit"] : []),
        "stage_unknown"
      ])),
      policy_version: policy.version,
      optimization_goal: LIFECYCLE_STAGE_STRATEGIES[stage].goal
    };
  }
  const score = calculateLifecycleScore({
    ...input.sku,
    roas,
    profit: input.sku.net_profit,
    inventory_runway_days: inventoryRunwayDays(input.sku)
  }, policy);
  const stage = dominantLifecycleStage(score);
  const confidence = lifecycleConfidence(score);

  return {
    sku: input.sku.sku,
    lifecycle_stage: stage,
    lifecycle_score: score,
    confidence,
    lifecycle_confidence: periodAwareConfidenceLabel(orderPeriodCount, confidence, policy),
    signals: lifecycleSignals(input.sku, stage, roas, policy),
    policy_version: policy.version,
    optimization_goal: LIFECYCLE_STAGE_STRATEGIES[stage].goal
  };
}

export function classifySkuLifecycles(input: {
  skus: PortfolioSkuInput[];
  ads?: AdsCampaignInput[];
  policy?: OptimizationPolicy;
}) {
  return input.skus.map((sku) => classifySkuLifecycle({ sku, ads: input.ads, policy: input.policy }));
}

function lifecycleSignals(sku: PortfolioSkuInput, stage: SkuLifecycleStage, roas: number | null, policy: OptimizationPolicy) {
  const signals: string[] = [];
  const lifecycle = policy.lifecycle;
  const age = sku.product_age_days;
  const growth = sku.revenue_growth ?? 0;
  const confidence = sku.prediction_confidence ?? lifecycle.lowConfidence;
  const runway = inventoryRunwayDays(sku);

  if (age !== undefined && age < lifecycle.newProductDays) signals.push("product_age_under_30_days");
  if (sku.quantity < lifecycle.insufficientOrders) signals.push("sales_history_insufficient");
  if (confidence < lifecycle.lowConfidence) signals.push("low_prediction_confidence");
  if (orderPeriodCountForSku(sku) >= 2 && growth > lifecycle.growthRevenueThreshold) signals.push("revenue_growth_positive");
  if (orderPeriodCountForSku(sku) >= 2 && growth < lifecycle.declineRevenueThreshold) signals.push("revenue_declining");
  if (sku.net_profit > 0) signals.push("positive_profit");
  if (sku.net_profit < 0) signals.push("negative_profit");
  if (roas !== null && roas >= lifecycle.highRoas) signals.push("high_roas");
  if (roas !== null && roas < lifecycle.lowRoas) signals.push("low_roas");
  if (sku.inventory > Math.max(10, sku.sales_velocity * lifecycle.inventoryAvailableDays)) signals.push("inventory_available");
  if (runway !== null && runway > lifecycle.matureCoverageMaxDays) signals.push("inventory_accumulating");

  signals.push(`stage_${stage.toLowerCase()}`);
  return Array.from(new Set(signals));
}

function orderPeriodCountForSku(sku: PortfolioSkuInput) {
  if (typeof sku.order_period_count === "number" && Number.isFinite(sku.order_period_count)) {
    return Math.max(0, Math.floor(sku.order_period_count));
  }
  if ((sku.data_period_days ?? 0) > 0) return 2;
  return 1;
}

function confidenceLabel(value: number, policy: OptimizationPolicy): "HIGH" | "MEDIUM" | "LOW" {
  if (value >= policy.lifecycle.highConfidence) return "HIGH";
  if (value >= policy.lifecycle.lowConfidence) return "MEDIUM";
  return "LOW";
}

function periodAwareConfidenceLabel(orderPeriodCount: number, value: number, policy: OptimizationPolicy): "HIGH" | "MEDIUM" | "LOW" {
  if (orderPeriodCount < 2) return "LOW";
  if (orderPeriodCount < 4) return "MEDIUM";
  return confidenceLabel(Math.max(value, policy.lifecycle.highConfidence), policy);
}
