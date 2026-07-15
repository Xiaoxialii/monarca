import type { Opportunity } from "@/lib/optimization/opportunity-engine";
import type { PortfolioAction, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { roundCurrency } from "@/lib/optimization/objective";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { isActionAllowedForLifecycle, lifecycleActionReason } from "@/lib/lifecycle/lifecycle-optimization-router";

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
}): GeneratedAction[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));

  return input.opportunities.flatMap((opportunity) => {
    const sku = skuById.get(opportunity.sku);
    if (!sku) return [];

    return generateSkuActions(sku, opportunity, input.lifecycleBySku?.get(sku.sku));
  });
}

function generateSkuActions(sku: PortfolioSkuInput, opportunity: Opportunity, lifecycle?: SkuLifecycleClassification): GeneratedAction[] {
  const actions: GeneratedAction[] = [buildAction(sku, opportunity, "HOLD", "HOLD", 0, 0, 0, lifecycle)];
  const baseScaleBudget = roundCurrency(Math.max(10, Math.min(1000, Math.max(sku.ads_spend * 0.45, sku.revenue * 0.006))));

  if (lifecycle?.lifecycle_stage === "LAUNCH") {
    actions.push(buildAction(sku, opportunity, "TEST_AD_SPEND", "TEST_AD_SPEND", Math.min(500, Math.max(50, baseScaleBudget)), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "COLLECT_DATA", "HOLD", 0, 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "TEST_PRICE", "PROMOTION_TEST", 0, -0.05, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "MONITOR_CONVERSION", "HOLD", 0, 0, 0, lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (lifecycle?.lifecycle_stage === "MATURE") {
    actions.push(buildAction(sku, opportunity, "OPTIMIZE_MARGIN", "PRICE_UP_5", 0, 0.05, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_10", 0, 0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "SCALE_CHANNEL", "SHIFT_CHANNEL", Math.max(10, baseScaleBudget * 0.25), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "INVENTORY_BALANCE", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.12), lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (lifecycle?.lifecycle_stage === "DECLINING") {
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.5), 0, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "CLEAR_INVENTORY", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.2), lifecycle));
    actions.push(buildAction(sku, opportunity, "DISCOUNT_TEST", "PRICE_DOWN_10", 0, -0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "STOP_SKU", "STOP", -sku.ads_spend, 0, -sku.inventory, lifecycle));
    return filterLifecycleActions(uniqueActions(actions), lifecycle);
  }

  if (opportunity.opportunity_type === "GROWTH") {
    if (sku.ads_spend > 0 && (sku.prediction_confidence ?? 0.55) > 0.6) {
      actions.push(buildAction(sku, opportunity, "INCREASE_AD_SPEND", "SCALE_ADS", baseScaleBudget, 0, 0, lifecycle));
      actions.push(buildAction(sku, opportunity, "INCREASE_AD_SPEND", "SCALE_ADS_PRICE_UP_5", baseScaleBudget, 0.05, 0, lifecycle));
    } else {
      actions.push(buildAction(sku, opportunity, "TEST_AD_SPEND", "TEST_AD_SPEND", Math.min(50, baseScaleBudget), 0, 0, lifecycle));
    }
    actions.push(buildAction(sku, opportunity, "CREATE_BUNDLE", "CREATE_BUNDLE", 0, 0, 0, lifecycle));
  }

  if (opportunity.opportunity_type === "MARGIN_IMPROVEMENT") {
    actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_5", 0, 0.05, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_10", 0, 0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "LOWER_PRICE", "PRICE_DOWN_10", 0, -0.1, 0, lifecycle));
    actions.push(buildAction(sku, opportunity, "PROMOTION_TEST", "PROMOTION_TEST", 0, -0.1, 0, lifecycle));
  }

  if (opportunity.opportunity_type === "INVENTORY") {
    const requiredStock = Math.max(0, Math.ceil(sku.sales_velocity * 30 - sku.inventory));
    actions.push(buildAction(sku, opportunity, "RESTOCK", "RESTOCK_AND_SCALE", baseScaleBudget, 0, requiredStock, lifecycle));
  }

  if (opportunity.opportunity_type === "AD_EFFICIENCY") {
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.45), 0, 0, lifecycle));
  }

  if (opportunity.opportunity_type === "CHANNEL_OPTIMIZATION") {
    actions.push(buildAction(sku, opportunity, "SHIFT_CHANNEL", "SHIFT_CHANNEL", baseScaleBudget * 0.25, 0, 0, lifecycle));
  }

  if (sku.inventory > sku.sales_velocity * 90 && sku.sales_velocity > 0) {
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
