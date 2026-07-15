import { roundRatio } from "@/lib/optimization/objective";
import type { AdsCampaignInput, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { calculateLifecycleScore, dominantLifecycleStage, inventoryRunwayDays, lifecycleConfidence, type SkuLifecycleScore, type SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { LIFECYCLE_STAGE_STRATEGIES } from "@/lib/lifecycle/sku-stage-rules";

export type SkuLifecycleClassification = {
  sku: string;
  lifecycle_stage: SkuLifecycleStage;
  lifecycle_score: SkuLifecycleScore;
  confidence: number;
  signals: string[];
  optimization_goal: (typeof LIFECYCLE_STAGE_STRATEGIES)[SkuLifecycleStage]["goal"];
};

export function classifySkuLifecycle(input: {
  sku: PortfolioSkuInput;
  ads?: AdsCampaignInput[];
}): SkuLifecycleClassification {
  const skuAds = (input.ads ?? []).filter((row) => row.sku === input.sku.sku && row.spend > 0);
  const roas = skuAds.length
    ? roundRatio(skuAds.reduce((sum, row) => sum + row.roas * row.spend, 0) / Math.max(1, skuAds.reduce((sum, row) => sum + row.spend, 0)))
    : null;
  const score = calculateLifecycleScore({
    ...input.sku,
    roas,
    profit: input.sku.net_profit,
    inventory_runway_days: inventoryRunwayDays(input.sku)
  });
  const stage = dominantLifecycleStage(score);

  return {
    sku: input.sku.sku,
    lifecycle_stage: stage,
    lifecycle_score: score,
    confidence: lifecycleConfidence(score),
    signals: lifecycleSignals(input.sku, stage, roas),
    optimization_goal: LIFECYCLE_STAGE_STRATEGIES[stage].goal
  };
}

export function classifySkuLifecycles(input: {
  skus: PortfolioSkuInput[];
  ads?: AdsCampaignInput[];
}) {
  return input.skus.map((sku) => classifySkuLifecycle({ sku, ads: input.ads }));
}

function lifecycleSignals(sku: PortfolioSkuInput, stage: SkuLifecycleStage, roas: number | null) {
  const signals: string[] = [];
  const age = sku.product_age_days;
  const growth = sku.revenue_growth ?? 0;
  const confidence = sku.prediction_confidence ?? 0.55;
  const runway = inventoryRunwayDays(sku);

  if (age !== undefined && age < 30) signals.push("product_age_under_30_days");
  if (sku.quantity < 30) signals.push("sales_history_insufficient");
  if (confidence < 0.55) signals.push("low_prediction_confidence");
  if (growth > 0.03) signals.push("revenue_growth_positive");
  if (growth < -0.02) signals.push("revenue_declining");
  if (sku.net_profit > 0) signals.push("positive_profit");
  if (sku.net_profit < 0) signals.push("negative_profit");
  if (roas !== null && roas >= 3) signals.push("high_roas");
  if (roas !== null && roas < 1.5) signals.push("low_roas");
  if (sku.inventory > Math.max(10, sku.sales_velocity * 14)) signals.push("inventory_available");
  if (runway !== null && runway > 90) signals.push("inventory_accumulating");

  signals.push(`stage_${stage.toLowerCase()}`);
  return Array.from(new Set(signals));
}
