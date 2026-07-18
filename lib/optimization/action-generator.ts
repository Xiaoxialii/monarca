import type { Opportunity } from "@/lib/optimization/opportunity-engine";
import type { PortfolioAction, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { roundCurrency } from "@/lib/optimization/objective";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { isActionAllowedForLifecycle, lifecycleActionReason } from "@/lib/lifecycle/lifecycle-optimization-router";
import type { DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";
import { clearInventoryQualityScore } from "@/lib/optimization/inventory-health-score";

export type GeneratedActionType =
  | "TEST_AD_SPEND"
  | "COLLECT_DATA"
  | "TEST_PRICE"
  | "MONITOR_CONVERSION"
  | "INCREASE_AD_SPEND"
  | "REDUCE_AD_SPEND"
  | "RAISE_PRICE"
  | "LOWER_PRICE"
  | "RESTOCK"
  | "SCALE_CHANNEL"
  | "OPTIMIZE_MARGIN"
  | "INVENTORY_BALANCE"
  | "CLEAR_INVENTORY"
  | "DISCOUNT_TEST"
  | "STOP_SKU"
  | "REDUCE_INVENTORY"
  | "SHIFT_CHANNEL"
  | "CREATE_BUNDLE"
  | "PROMOTION_TEST"
  | "HOLD";

export type GeneratedAction = {
  action_id: string;
  sku: string;
  action: GeneratedActionType;
  portfolio_action: PortfolioAction;
  budget_delta: number;
  price_delta: number;
  inventory_delta: number;
  opportunity_type: Opportunity["opportunity_type"];
  signals: string[];
  feasibility: number;
  lifecycle_stage?: SkuLifecycleStage;
  lifecycle_confidence?: number;
  lifecycle_signals?: string[];
};

export function generateOptimizationActions(input: {
  skus: PortfolioSkuInput[];
  opportunities: Opportunity[];
  lifecycleBySku?: Map<string, SkuLifecycleClassification>;
  thresholdProfile?: DynamicThresholdProfile;
}): GeneratedAction[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));

  return input.opportunities.flatMap((opportunity) => {
    const sku = skuById.get(opportunity.sku);
    if (!sku) return [];

    return generateSkuActions(sku, opportunity, input.lifecycleBySku?.get(sku.sku), input.thresholdProfile);
  });
}

function generateSkuActions(sku: PortfolioSkuInput, opportunity: Opportunity, lifecycle?: SkuLifecycleClassification, thresholdProfile?: DynamicThresholdProfile): GeneratedAction[] {
  const actions: GeneratedAction[] = [buildAction(sku, opportunity, "HOLD", "HOLD", 0, 0, 0, lifecycle)];
  const baseScaleBudget = roundCurrency(Math.max(10, Math.min(1000, Math.max(sku.ads_spend * 0.45, sku.revenue * 0.006))));
  const opportunityTypes = new Set(opportunity.opportunity_types?.length ? opportunity.opportunity_types : [opportunity.opportunity_type]);
  const coverageDays = sku.sales_velocity > 0 ? sku.inventory / Math.max(0.1, sku.sales_velocity) : 999;
  const restockThreshold = thresholdProfile?.inventory_threshold.restock_coverage_days ?? 21;
  const excessThreshold = thresholdProfile?.inventory_threshold.excess_coverage_days ?? 90;
  const priceStep = thresholdProfile?.business_objective === "PROFIT" ? 0.1 : 0.05;
  const canIncreasePrice = isPriceIncreaseEligible(sku, thresholdProfile, coverageDays);
  const canScaleAds = isScaleAdsEligible(sku, thresholdProfile, coverageDays);
  const hasHighInventoryPressure = coverageDays > excessThreshold;
  const hasStockoutRisk = coverageDays < restockThreshold;
  const clearInventoryQuality = clearInventoryQualityScore(sku, thresholdProfile);

  if (lifecycle?.lifecycle_stage === "LAUNCH") {
    actions.push(buildAction(sku, opportunity, "TEST_AD_SPEND", "TEST_AD_SPEND", Math.min(500, Math.max(50, baseScaleBudget)), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "SHIFT_CHANNEL", "SHIFT_CHANNEL", Math.max(10, baseScaleBudget * 0.35), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "COLLECT_DATA", "HOLD", 0, 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "TEST_PRICE", "PROMOTION_TEST", 0, -0.05, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "MONITOR_CONVERSION", "HOLD", 0, 0, 0, lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (lifecycle?.lifecycle_stage === "MATURE") {
    if (canIncreasePrice) {
      actions.push(buildAction(sku, opportunity, "OPTIMIZE_MARGIN", priceStep >= 0.1 ? "PRICE_UP_10" : "PRICE_UP_5", 0, priceStep, 0, lifecycle));
      actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_10", 0, 0.1, 0, lifecycle));
    }
    if (hasHighInventoryPressure) {
      actions.push(buildAction(sku, opportunity, "PROMOTION_TEST", "PROMOTION_TEST", 0, -0.1, 0, lifecycle));
      if (clearInventoryQuality.eligible) {
        actions.push(buildAction(sku, opportunity, "INVENTORY_BALANCE", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.15), lifecycle));
      }
    }
    if (hasStockoutRisk) {
      const requiredStock = Math.max(0, Math.ceil(sku.sales_velocity * 30 - sku.inventory));
      actions.push(buildAction(sku, opportunity, "RESTOCK", "RESTOCK_AND_SCALE", baseScaleBudget, 0, requiredStock, lifecycle));
    }
    actions.push(buildAction(sku, opportunity, "SCALE_CHANNEL", "SHIFT_CHANNEL", Math.max(10, baseScaleBudget * 0.25), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.22), 0, 0, lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (lifecycle?.lifecycle_stage === "DECLINING") {
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.5), 0, 0, lifecycle));
    if (clearInventoryQuality.eligible) {
      actions.push(buildAction(sku, opportunity, "CLEAR_INVENTORY", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.2), lifecycle));
    }
    actions.push(buildAction(sku, opportunity, "DISCOUNT_TEST", "PRICE_DOWN_10", 0, -0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "STOP_SKU", "STOP", -sku.ads_spend, 0, -sku.inventory, lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (opportunityTypes.has("GROWTH")) {
    if (canScaleAds) {
      actions.push(buildAction(sku, opportunity, "INCREASE_AD_SPEND", "SCALE_ADS", baseScaleBudget, 0, 0, lifecycle));
    } else {
      actions.push(buildAction(sku, opportunity, "TEST_AD_SPEND", "TEST_AD_SPEND", Math.min(50, baseScaleBudget), 0, 0, lifecycle));
    }
    actions.push(buildAction(sku, opportunity, "SCALE_CHANNEL", "SHIFT_CHANNEL", Math.max(10, baseScaleBudget * 0.35), 0, 0, lifecycle));
    if (canIncreasePrice) {
      actions.push(buildAction(sku, opportunity, "OPTIMIZE_MARGIN", priceStep >= 0.1 ? "PRICE_UP_10" : "PRICE_UP_5", 0, priceStep, 0, lifecycle));
    }
  }

  if (opportunityTypes.has("PROFIT") || opportunityTypes.has("MARGIN_IMPROVEMENT")) {
    if (canIncreasePrice) {
      actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_5", 0, 0.05, 0, lifecycle));
      actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_10", 0, 0.1, 0, lifecycle));
    }
    actions.push(buildAction(sku, opportunity, "LOWER_PRICE", "PRICE_DOWN_10", 0, -0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "PROMOTION_TEST", "PROMOTION_TEST", 0, -0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.2), 0, 0, lifecycle));
  }

  if (opportunityTypes.has("INVENTORY")) {
    const requiredStock = Math.max(0, Math.ceil(sku.sales_velocity * 30 - sku.inventory));
    if (coverageDays < restockThreshold) {
      actions.push(buildAction(sku, opportunity, "RESTOCK", "RESTOCK_AND_SCALE", baseScaleBudget, 0, requiredStock, lifecycle));
    }
    if (coverageDays > excessThreshold && clearInventoryQuality.eligible) {
      actions.push(buildAction(sku, opportunity, "REDUCE_INVENTORY", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.15), lifecycle));
    }
  }

  if (opportunityTypes.has("PORTFOLIO") || opportunityTypes.has("AD_EFFICIENCY")) {
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.45), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "STOP_SKU", "STOP", -sku.ads_spend, 0, -sku.inventory, lifecycle));
  }

  if (opportunityTypes.has("CHANNEL") || opportunityTypes.has("CHANNEL_OPTIMIZATION")) {
    actions.push(buildAction(sku, opportunity, "SHIFT_CHANNEL", "SHIFT_CHANNEL", baseScaleBudget * 0.25, 0, 0, lifecycle));
  }

  if (coverageDays > excessThreshold && sku.sales_velocity > 0 && clearInventoryQuality.eligible) {
    actions.push(buildAction(sku, opportunity, "REDUCE_INVENTORY", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.15), lifecycle));
  }

  return filterLifecycleActions(uniqueActions(actions), lifecycle);
}

function buildAction(
  sku: PortfolioSkuInput,
  opportunity: Opportunity,
  action: GeneratedActionType,
  portfolioAction: PortfolioAction,
  budgetDelta: number,
  priceDelta: number,
  inventoryDelta: number,
  lifecycle?: SkuLifecycleClassification
): GeneratedAction {
  return {
    action_id: `${sku.sku}:${portfolioAction}:${action}`,
    sku: sku.sku,
    action,
    portfolio_action: portfolioAction,
    budget_delta: roundCurrency(budgetDelta),
    price_delta: priceDelta,
    inventory_delta: inventoryDelta,
    opportunity_type: opportunity.opportunity_type,
    signals: lifecycle ? [...opportunity.signals, ...lifecycle.signals, lifecycleActionReason(portfolioAction, lifecycle)] : opportunity.signals,
    feasibility: opportunity.feasibility,
    lifecycle_stage: lifecycle?.lifecycle_stage,
    lifecycle_confidence: lifecycle?.confidence,
    lifecycle_signals: lifecycle?.signals
  };
}

function uniqueActions(actions: GeneratedAction[]) {
  const map = new Map<string, GeneratedAction>();
  for (const action of actions) map.set(action.action_id, action);
  return Array.from(map.values());
}

function filterLifecycleActions(actions: GeneratedAction[], lifecycle?: SkuLifecycleClassification) {
  if (!lifecycle) return actions;
  return actions.filter((action) => isActionAllowedForLifecycle(action.portfolio_action, lifecycle));
}

function isPriceIncreaseEligible(sku: PortfolioSkuInput, thresholdProfile?: DynamicThresholdProfile, coverageDays = 0) {
  const marketPrice = marketReasonablePrice(sku);
  if (!marketPrice) return false;

  const marketGapThreshold = thresholdProfile?.price_threshold.market_gap ?? 0.1;
  const priceGap = (marketPrice - sku.price) / Math.max(1, marketPrice);
  if (priceGap < marketGapThreshold) return false;

  const revenueTrend = sku.revenue_growth ?? 0;
  const orderTrend = sku.order_growth ?? revenueTrend;
  const conversionTrend = sku.conversion_trend ?? 0;
  if (revenueTrend < 0 || orderTrend < 0 || conversionTrend < -0.05) return false;

  const elasticity = estimatedPriceElasticity(sku);
  if (elasticity < -1) return false;

  const restockThreshold = thresholdProfile?.inventory_threshold.restock_coverage_days ?? 21;
  const excessThreshold = thresholdProfile?.inventory_threshold.excess_coverage_days ?? 90;
  if (coverageDays < restockThreshold || coverageDays > excessThreshold) return false;

  return true;
}

function isScaleAdsEligible(sku: PortfolioSkuInput, thresholdProfile?: DynamicThresholdProfile, coverageDays = 0) {
  if (sku.ads_spend <= 0) return false;

  const confidenceThreshold = thresholdProfile?.scale_ads_threshold.confidence ?? 0.6;
  const coverageThreshold = thresholdProfile?.scale_ads_threshold.inventory_coverage_days ?? 30;
  const marginThreshold = thresholdProfile?.scale_ads_threshold.margin ?? 0.3;
  const marginalRoasThreshold = thresholdProfile?.scale_ads_threshold.marginal_roas ?? 2.2;
  const estimatedRoas = sku.revenue / Math.max(1, sku.ads_spend);
  const stableDemand = (sku.revenue_growth ?? 0) >= -0.04 &&
    (sku.order_growth ?? sku.revenue_growth ?? 0) >= -0.04 &&
    (sku.conversion_trend ?? 0) >= -0.04;

  return sku.margin >= marginThreshold &&
    sku.net_profit > 0 &&
    coverageDays >= coverageThreshold &&
    (sku.prediction_confidence ?? 0.55) >= confidenceThreshold &&
    estimatedRoas >= marginalRoasThreshold &&
    stableDemand;
}

function marketReasonablePrice(sku: PortfolioSkuInput) {
  const prices = [
    sku.market_median_price,
    sku.competitor_price,
    sku.similar_sku_price,
    sku.market_price_high && sku.market_price_low ? (sku.market_price_high + sku.market_price_low) / 2 : undefined
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (!prices.length) return null;
  return prices.reduce((sum, value) => sum + value, 0) / prices.length;
}

function estimatedPriceElasticity(sku: PortfolioSkuInput) {
  if (typeof sku.price_elasticity === "number") return sku.price_elasticity;
  const ltvBuffer = Math.min(0.25, sku.customer_ltv / Math.max(1, sku.price * 12) * 0.08);
  const stableDemandBuffer = (sku.revenue_growth ?? 0) >= 0 && (sku.conversion_trend ?? 0) >= 0 ? 0.18 : 0;
  return -0.95 + ltvBuffer + stableDemandBuffer;
}
