import type { Opportunity } from "@/lib/optimization/opportunity-engine";
import type { PortfolioAction, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import { roundCurrency } from "@/lib/optimization/objective";

export type GeneratedActionType =
  | "INCREASE_AD_SPEND"
  | "REDUCE_AD_SPEND"
  | "RAISE_PRICE"
  | "LOWER_PRICE"
  | "RESTOCK"
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
};

export function generateOptimizationActions(input: {
  skus: PortfolioSkuInput[];
  opportunities: Opportunity[];
}): GeneratedAction[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));

  return input.opportunities.flatMap((opportunity) => {
    const sku = skuById.get(opportunity.sku);
    if (!sku) return [];

    return generateSkuActions(sku, opportunity);
  });
}

function generateSkuActions(sku: PortfolioSkuInput, opportunity: Opportunity): GeneratedAction[] {
  const actions: GeneratedAction[] = [buildAction(sku, opportunity, "HOLD", "HOLD", 0, 0, 0)];
  const baseScaleBudget = roundCurrency(Math.max(10, Math.min(1000, Math.max(sku.ads_spend * 0.45, sku.revenue * 0.006))));

  if (opportunity.opportunity_type === "GROWTH") {
    actions.push(buildAction(sku, opportunity, "INCREASE_AD_SPEND", "SCALE_ADS", baseScaleBudget, 0, 0));
    actions.push(buildAction(sku, opportunity, "INCREASE_AD_SPEND", "SCALE_ADS_PRICE_UP_5", baseScaleBudget, 0.05, 0));
    actions.push(buildAction(sku, opportunity, "CREATE_BUNDLE", "CREATE_BUNDLE", 0, 0, 0));
  }

  if (opportunity.opportunity_type === "MARGIN_IMPROVEMENT") {
    actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_5", 0, 0.05, 0));
    actions.push(buildAction(sku, opportunity, "RAISE_PRICE", "PRICE_UP_10", 0, 0.1, 0));
    actions.push(buildAction(sku, opportunity, "LOWER_PRICE", "PRICE_DOWN_10", 0, -0.1, 0));
    actions.push(buildAction(sku, opportunity, "PROMOTION_TEST", "PROMOTION_TEST", 0, -0.1, 0));
  }

  if (opportunity.opportunity_type === "INVENTORY") {
    const requiredStock = Math.max(0, Math.ceil(sku.sales_velocity * 30 - sku.inventory));
    actions.push(buildAction(sku, opportunity, "RESTOCK", "RESTOCK_AND_SCALE", baseScaleBudget, 0, requiredStock));
  }

  if (opportunity.opportunity_type === "AD_EFFICIENCY") {
    actions.push(buildAction(sku, opportunity, "REDUCE_AD_SPEND", "REDUCE_ADS", -roundCurrency(sku.ads_spend * 0.45), 0, 0));
  }

  if (opportunity.opportunity_type === "CHANNEL_OPTIMIZATION") {
    actions.push(buildAction(sku, opportunity, "SHIFT_CHANNEL", "SHIFT_CHANNEL", baseScaleBudget * 0.25, 0, 0));
  }

  if (sku.inventory > sku.sales_velocity * 90 && sku.sales_velocity > 0) {
    actions.push(buildAction(sku, opportunity, "REDUCE_INVENTORY", "REDUCE_INVENTORY", 0, 0, -Math.ceil(sku.inventory * 0.15)));
  }

  return uniqueActions(actions);
}

function buildAction(
  sku: PortfolioSkuInput,
  opportunity: Opportunity,
  action: GeneratedActionType,
  portfolioAction: PortfolioAction,
  budgetDelta: number,
  priceDelta: number,
  inventoryDelta: number
): GeneratedAction {
  return {
    action_id: `${sku.sku}:${portfolioAction}`,
    sku: sku.sku,
    action,
    portfolio_action: portfolioAction,
    budget_delta: roundCurrency(budgetDelta),
    price_delta: priceDelta,
    inventory_delta: inventoryDelta,
    opportunity_type: opportunity.opportunity_type,
    signals: opportunity.signals,
    feasibility: opportunity.feasibility
  };
}

function uniqueActions(actions: GeneratedAction[]) {
  const map = new Map<string, GeneratedAction>();
  for (const action of actions) map.set(action.action_id, action);
  return Array.from(map.values());
}
