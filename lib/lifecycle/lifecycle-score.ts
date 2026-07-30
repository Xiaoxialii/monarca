import { roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";

export type SkuLifecycleStage = "LAUNCH" | "GROWTH" | "MATURE" | "DECLINING";

export type SkuLifecycleScore = {
  launch_score: number;
  growth_score: number;
  mature_score: number;
  decline_score: number;
};

export type SkuLifecycleInput = Pick<
  PortfolioSkuInput,
  | "sku"
  | "revenue"
  | "quantity"
  | "sales_velocity"
  | "net_profit"
  | "margin"
  | "ads_spend"
  | "inventory"
  | "prediction_confidence"
  | "conversion_rate"
  | "customer_ltv"
> & {
  revenue_growth?: number;
  order_count?: number;
  profit?: number;
  roas?: number | null;
  inventory_runway_days?: number | null;
  customer_count?: number;
  repeat_rate?: number;
  product_age_days?: number;
};

export function calculateLifecycleScore(input: SkuLifecycleInput, policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY): SkuLifecycleScore {
  const lifecycle = policy.lifecycle;
  const age = input.product_age_days;
  const growth = input.revenue_growth ?? 0;
  const roas = input.roas ?? null;
  const confidence = input.prediction_confidence ?? lifecycle.lowConfidence;
  const profit = input.profit ?? input.net_profit;
  const orderCount = input.order_count ?? input.quantity;
  const inventoryRunway = input.inventory_runway_days ?? inventoryRunwayDays(input);
  const hasStableHistory = (age === undefined || age >= lifecycle.stableProductDays) &&
    orderCount >= lifecycle.insufficientOrders &&
    confidence >= lifecycle.lowConfidence;
  const hasAdsHistory = input.ads_spend > 0 && roas !== null && Number.isFinite(roas);
  const inventoryAvailable = input.inventory > Math.max(10, input.sales_velocity * lifecycle.inventoryAvailableDays);
  const inventoryAccumulating = inventoryRunway !== null && inventoryRunway > lifecycle.matureCoverageMaxDays;

  const launch = clamp01(
    (age !== undefined && age < lifecycle.newProductDays ? 0.42 : 0) +
      (orderCount < lifecycle.insufficientOrders ? 0.24 : 0) +
      (!hasAdsHistory ? 0.16 : 0) +
      (confidence < lifecycle.lowConfidence ? 0.18 : 0)
  );
  const growthScore = clamp01(
    (growth > lifecycle.strongGrowthRevenueThreshold ? 0.32 : growth > lifecycle.growthRevenueThreshold ? 0.18 : 0) +
      (profit > 0 ? 0.2 : 0) +
      (roas !== null && roas >= lifecycle.highRoas ? 0.22 : roas !== null && roas >= lifecycle.acceptableRoas ? 0.12 : 0) +
      (inventoryAvailable ? 0.16 : 0) +
      (confidence >= lifecycle.highConfidence ? 0.1 : 0)
  );
  const mature = clamp01(
    (hasStableHistory ? 0.24 : 0) +
      (growth >= lifecycle.strongDeclineRevenueThreshold && growth <= lifecycle.strongGrowthRevenueThreshold * 0.67 ? 0.24 : 0) +
      (profit > 0 ? 0.18 : 0) +
      (input.margin >= lifecycle.matureMargin ? 0.16 : 0) +
      (input.repeat_rate !== undefined && input.repeat_rate >= lifecycle.matureRepeatRate ? 0.1 : 0.04) +
      (inventoryRunway !== null && inventoryRunway >= lifecycle.matureCoverageMinDays && inventoryRunway <= lifecycle.matureCoverageMaxDays ? 0.08 : 0)
  );
  const decline = clamp01(
    (growth < lifecycle.strongDeclineRevenueThreshold ? 0.3 : growth < lifecycle.declineRevenueThreshold ? 0.14 : 0) +
      (profit < 0 ? 0.22 : 0) +
      (roas !== null && roas < lifecycle.lowRoas && input.ads_spend > 0 ? 0.2 : 0) +
      (inventoryAccumulating ? 0.16 : 0) +
      (input.sales_velocity <= 0 && input.inventory > 0 ? 0.12 : 0)
  );

  return {
    launch_score: roundRatio(launch),
    growth_score: roundRatio(growthScore),
    mature_score: roundRatio(mature),
    decline_score: roundRatio(decline)
  };
}

export function inventoryRunwayDays(input: Pick<SkuLifecycleInput, "inventory" | "sales_velocity">) {
  if (input.sales_velocity <= 0) return input.inventory > 0 ? 999 : null;
  return roundRatio(safeRatio(input.inventory, input.sales_velocity));
}

export function dominantLifecycleStage(score: SkuLifecycleScore): SkuLifecycleStage {
  const entries: Array<[SkuLifecycleStage, number]> = [
    ["LAUNCH", score.launch_score],
    ["GROWTH", score.growth_score],
    ["MATURE", score.mature_score],
    ["DECLINING", score.decline_score]
  ];

  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "MATURE";
}

export function lifecycleConfidence(score: SkuLifecycleScore) {
  const values = [score.launch_score, score.growth_score, score.mature_score, score.decline_score].sort((left, right) => right - left);
  const top = values[0] ?? 0;
  const runnerUp = values[1] ?? 0;
  return roundRatio(Math.max(0.35, Math.min(0.95, top * 0.72 + Math.max(0, top - runnerUp) * 0.28)));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
