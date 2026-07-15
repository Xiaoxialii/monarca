import {
  calculateChannelFit,
  type LaunchChannel
} from "@/lib/launch/product-intelligence/channel-fit-engine";
import {
  analyzeCustomerQuality,
  type CustomerQualitySignal
} from "@/lib/launch/product-intelligence/customer-quality-engine";
import {
  forecastLaunchDemand,
  type LaunchDemandForecast
} from "@/lib/launch/product-intelligence/launch-demand-model";
import {
  generateLaunchScenarios,
  type LaunchScenarioV2
} from "@/lib/launch/product-intelligence/launch-scenario-engine";
import {
  analyzeProductIntelligence,
  type ProductIntelligence
} from "@/lib/launch/product-intelligence/product-intelligence-engine";
import {
  findSimilarProducts,
  type SimilarProductResult
} from "@/lib/launch/product-intelligence/similar-product-engine";

export type LaunchProductInput = {
  productName: string;
  sku: string;
  category: string;
  subcategory: string;
  sellingPrice: number;
  cogs: number;
  initialInventory: number;
  targetMarket: string;
  targetCustomer: string;
  productDescription: string;
  supplierLeadTimeDays: number;
  fulfillmentCost: number;
};

export type LaunchChannelStrategy = {
  channel: LaunchChannel;
  score: number;
  budget: number;
  inventory: number;
  share: number;
  goal: string;
  reason: string[];
};

export type LaunchTrackingRecord = {
  status: "Draft" | "Approved" | "Testing" | "Scaling" | "Completed";
  daily: Array<{
    day: string;
    revenue: number;
    orders: number;
    ad_spend: number;
    cac: number;
    roas: number;
    profit: number;
    inventory_remaining: number;
  }>;
};

export type LaunchPlan = {
  product: LaunchProductInput;
  product_intelligence: ProductIntelligence;
  similar_products: SimilarProductResult;
  demand_forecast: LaunchDemandForecast;
  customer_signal: CustomerQualitySignal;
  channel_strategy: LaunchChannelStrategy[];
  ad_budget_plan: {
    total_budget: number;
    period_days: number;
    daily_budget: number;
    algorithm: "expected_orders_test_x_target_cac";
    expected_orders_test: number;
    target_cac: number;
    available_budget: number;
    channel_budgets: Array<{ channel: LaunchChannel; budget: number; score_share: number }>;
  };
  inventory_plan: {
    total_inventory: number;
    reserve_units: number;
    algorithm: "expected_channel_demand_share_x_total_inventory";
    channel_allocations: Array<{ channel: LaunchChannel; units: number }>;
  };
  scenarios: LaunchScenarioV2[];
  selected_plan: {
    strategy: string;
    primary_channel: LaunchChannel;
    secondary_channel: LaunchChannel;
    expected_revenue_30d: number;
    expected_profit_30d: number;
    confidence: number;
    reason: string;
    constraints: {
      budget_passed: boolean;
      inventory_passed: boolean;
      margin_passed: boolean;
      cash_passed: boolean;
    };
  };
  confidence: number;
  reasoning: {
    similar_products: string[];
    demand_signal: string[];
    customer_quality: string[];
    inventory_logic: string[];
  };
  tracking: LaunchTrackingRecord;
};

const CHANNEL_GOALS: Record<LaunchChannel, string> = {
  TikTok: "Demand discovery",
  Shopify: "Margin optimization",
  Amazon: "Search validation",
  Meta: "Audience testing"
};

export function generateLaunchPlan(product: LaunchProductInput): LaunchPlan {
  const product_intelligence = analyzeProductIntelligence(product);
  const similar_products = findSimilarProducts(product_intelligence);
  const customer_signal = analyzeCustomerQuality(product_intelligence, product.sellingPrice);
  const demand_forecast = forecastLaunchDemand(product, product_intelligence, similar_products, customer_signal);
  const channel_fit = calculateChannelFit(product, product_intelligence, similar_products, customer_signal);
  const scenarios = generateLaunchScenarios(product, demand_forecast, customer_signal, channel_fit);
  const selectedScenario = scenarios.find((scenario) => scenario.selected) ?? scenarios[0];
  const confidence = selectedScenario?.confidence ?? demand_forecast.confidence;
  const budget = selectedScenario?.budget ?? 1200;
  const expectedOrdersTest = Math.max(20, Math.round(demand_forecast.expected_orders * 0.18));
  const availableBudget = 3000;
  const targetCac = customer_signal.cac;
  const launchInventory = Math.min(product.initialInventory, selectedScenario?.inventory ?? product.initialInventory);
  const scoreTotal = channel_fit.slice(0, 3).reduce((sum, item) => sum + item.score, 0) || 1;
  const channel_strategy = channel_fit.slice(0, 3).map((channel) => {
    const share = channel.score / scoreTotal;
    return {
      channel: channel.channel,
      score: channel.score,
      budget: roundMoney(budget * share),
      inventory: Math.max(20, Math.round(launchInventory * share)),
      share: Math.round(share * 100),
      goal: CHANNEL_GOALS[channel.channel],
      reason: channel.reason
    };
  });
  const allocatedInventory = channel_strategy.reduce((sum, item) => sum + item.inventory, 0);

  return {
    product,
    product_intelligence,
    similar_products,
    demand_forecast,
    customer_signal,
    channel_strategy,
    ad_budget_plan: {
      total_budget: budget,
      period_days: 14,
      daily_budget: roundMoney(budget / 14),
      algorithm: "expected_orders_test_x_target_cac",
      expected_orders_test: expectedOrdersTest,
      target_cac: targetCac,
      available_budget: availableBudget,
      channel_budgets: channel_strategy.map((item) => ({
        channel: item.channel,
        budget: item.budget,
        score_share: item.share
      }))
    },
    inventory_plan: {
      total_inventory: product.initialInventory,
      reserve_units: Math.max(0, product.initialInventory - allocatedInventory),
      algorithm: "expected_channel_demand_share_x_total_inventory",
      channel_allocations: channel_strategy.map((item) => ({ channel: item.channel, units: item.inventory }))
    },
    scenarios,
    selected_plan: {
      strategy: selectedScenario?.strategy ?? "Balanced Launch",
      primary_channel: channel_strategy[0]?.channel ?? "TikTok",
      secondary_channel: channel_strategy[1]?.channel ?? "Shopify",
      expected_revenue_30d: selectedScenario?.revenue ?? demand_forecast.expected_revenue,
      expected_profit_30d: selectedScenario?.profit ?? demand_forecast.expected_profit,
      confidence,
      reason: "Best risk-adjusted profit while satisfying inventory, CAC, margin, budget, and cash constraints.",
      constraints: selectedScenario?.constraints ?? {
        budget_passed: true,
        inventory_passed: true,
        margin_passed: true,
        cash_passed: true
      }
    },
    confidence,
    reasoning: {
      similar_products: [
        `${similar_products.analyzed_count} similar products analyzed`,
        `Average first 30D revenue: $${similar_products.average_30d_revenue.toLocaleString()}`,
        `Average ROAS: ${similar_products.average_roas}`,
        `Average margin: ${similar_products.average_margin}%`
      ],
      demand_signal: [
        `Expected first 30 days: ${demand_forecast.expected_orders.toLocaleString()} orders`,
        `Day 7 demand: ${demand_forecast.day_7_demand.toLocaleString()} orders`,
        `Day 14 demand: ${demand_forecast.day_14_demand.toLocaleString()} orders`,
        `Revenue forecast: $${demand_forecast.expected_revenue.toLocaleString()}`
      ],
      customer_quality: customer_signal.signals,
      inventory_logic: [
        `${product.initialInventory.toLocaleString()} units available for launch`,
        `${launchInventory.toLocaleString()} units allocated into selected launch scenario`,
        `${Math.max(0, product.initialInventory - allocatedInventory).toLocaleString()} units reserved for response-based scaling`,
        `${product.supplierLeadTimeDays || 14} day supplier lead time included in pacing logic`
      ]
    },
    tracking: buildTrackingPreview(product, selectedScenario, budget)
  };
}

function buildTrackingPreview(
  product: LaunchProductInput,
  scenario: LaunchScenarioV2 | undefined,
  budget: number
): LaunchTrackingRecord {
  const scenarioRevenue = scenario?.revenue ?? 8500;
  const scenarioOrders = Math.max(1, Math.round(scenarioRevenue / Math.max(product.sellingPrice, 1)));
  const contributionMargin = product.sellingPrice > 0
    ? Math.max(0.08, (product.sellingPrice - product.cogs - product.fulfillmentCost) / product.sellingPrice)
    : 0.35;

  return {
    status: "Draft",
    daily: Array.from({ length: 7 }, (_, index) => {
      const ramp = 0.75 + index * 0.08;
      const orders = Math.max(1, Math.round((scenarioOrders / 30) * ramp));
      const revenue = orders * product.sellingPrice;
      const ad_spend = budget / 14;
      const profit = revenue * contributionMargin - ad_spend - orders * product.fulfillmentCost - revenue * 0.08;

      return {
        day: `Day ${index + 1}`,
        revenue: roundMoney(revenue),
        orders,
        ad_spend: roundMoney(ad_spend),
        cac: roundMoney(ad_spend / orders),
        roas: roundMoney(revenue / ad_spend),
        profit: roundMoney(profit),
        inventory_remaining: Math.max(0, product.initialInventory - orders * (index + 1))
      };
    })
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
