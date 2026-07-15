import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const { optimizeSkuPortfolio } = jiti("./lib/optimization/portfolio-optimizer.ts");
const { simulateGeneratedActions, simulatePortfolioActions } = jiti("./lib/optimization/profit-simulation-engine.ts");
const { generateOptimizationActions } = jiti("./lib/optimization/action-generator.ts");
const { generatePortfolioOptimizationReport } = jiti("./lib/optimization/optimization-report-generator.ts");
const { predictRevenue } = jiti("./lib/optimization/prediction/revenue-prediction-model.ts");
const { recordOptimizationFeedback } = jiti("./lib/optimization/feedback-learning-engine.ts");
const { classifySkuLifecycles } = jiti("./lib/lifecycle/sku-lifecycle-classifier.ts");

function input() {
  return {
    skus: [
      {
        sku: "SKU_A",
        category: "evergreen apparel",
        channel: "shopify",
        revenue: 5000,
        quantity: 100,
        price: 50,
        cogs: 18,
        ads_spend: 800,
        margin: 0.48,
        net_profit: 1500,
        inventory: 300,
        sales_velocity: 8,
        refund_rate: 0.04,
        customer_ltv: 180,
        conversion_rate: 0.04,
        prediction_confidence: 0.86
      },
      {
        sku: "SKU_B",
        category: "seasonal home",
        channel: "amazon",
        revenue: 4200,
        quantity: 90,
        price: 46,
        cogs: 17,
        ads_spend: 650,
        margin: 0.45,
        net_profit: 1260,
        inventory: 240,
        sales_velocity: 7,
        refund_rate: 0.05,
        customer_ltv: 150,
        conversion_rate: 0.035,
        prediction_confidence: 0.82
      },
      {
        sku: "SKU_LOW_CONF",
        category: "test",
        channel: "shopify",
        revenue: 9000,
        quantity: 200,
        price: 45,
        cogs: 12,
        ads_spend: 500,
        margin: 0.6,
        net_profit: 400,
        inventory: 900,
        sales_velocity: 20,
        refund_rate: 0.02,
        customer_ltv: 220,
        conversion_rate: 0.06,
        prediction_confidence: 0.28
      },
      {
        sku: "SKU_STOCK_LIMITED",
        category: "fashion",
        channel: "shopify",
        revenue: 3000,
        quantity: 80,
        price: 38,
        cogs: 11,
        ads_spend: 350,
        margin: 0.5,
        net_profit: 980,
        inventory: 5,
        sales_velocity: 12,
        refund_rate: 0.03,
        customer_ltv: 130,
        conversion_rate: 0.045,
        prediction_confidence: 0.8
      },
      {
        sku: "SKU_NEGATIVE",
        category: "clearance",
        channel: "amazon",
        revenue: 1500,
        quantity: 60,
        price: 25,
        cogs: 19,
        ads_spend: 900,
        margin: 0.08,
        net_profit: -500,
        inventory: 500,
        sales_velocity: 3,
        refund_rate: 0.12,
        customer_ltv: 60,
        conversion_rate: 0.01,
        prediction_confidence: 0.72
      }
    ],
    ads: [
      { campaign_id: "CMP_A", sku: "SKU_A", spend: 800, impressions: 10000, clicks: 600, conversions: 100, roas: 4.2 },
      { campaign_id: "CMP_B", sku: "SKU_B", spend: 650, impressions: 9000, clicks: 480, conversions: 90, roas: 3.8 },
      { campaign_id: "CMP_NEG", sku: "SKU_NEGATIVE", spend: 900, impressions: 12000, clicks: 400, conversions: 30, roas: 0.8 }
    ],
    constraints: {
      total_ads_budget: 2500,
      inventory_capacity: 700,
      available_cash: 5000,
      target_margin: 0.18,
      max_price_change: 0.1,
      minimum_profit: 0,
      minimum_confidence: 0.55,
      simulation_horizon_days: 30
    }
  };
}

test("portfolio optimization result beats single SKU ranking baseline", () => {
  const result = optimizeSkuPortfolio(input());

  assert.equal(result.version, "sku_portfolio_optimization_v2");
  assert.equal(result.prediction_summary.simulation_source, "prediction_model");
  assert.ok(result.prediction_summary.models_used.includes("revenue-prediction-model"));
  assert.ok(result.total_expected_profit_gain > result.greedy_single_sku_baseline.profit_delta);
  assert.ok(result.recommended_portfolio.length > 1);
  assert.ok(result.skuDecisions[0].decisionDrivers.length >= 2);
  assert.ok(["SCALE", "REDUCE", "OPTIMIZE", "MONITOR"].includes(result.skuDecisions[0].action));
  assert.ok(["ACQUISITION", "PROFIT", "GROWTH", "DRAIN"].includes(result.skuDecisions[0].skuRole));
  assert.ok(result.skuDecisions[0].recommendedActions.length >= 1);
  assert.equal(typeof result.skuDecisions[0].expectedProfitImpact, "number");
  assert.equal(result.skuDecisions[0].simulation_horizon.days, 30);
  assert.equal(result.skuDecisions[0].timing.simulation_window_days, 30);
  assert.equal(result.skuDecisions[0].timing.timing_source, "report_generated_at");
  assert.equal(
    daysBetween(result.skuDecisions[0].timing.action_start_at.slice(0, 10), result.skuDecisions[0].timing.simulation_window_end),
    29
  );
  assert.equal(
    daysBetween(result.skuDecisions[0].timing.baseline_period_start, result.skuDecisions[0].timing.action_start_at.slice(0, 10)),
    30
  );
  assert.equal(
    daysBetween(result.skuDecisions[0].timing.baseline_period_end, result.skuDecisions[0].timing.action_start_at.slice(0, 10)),
    1
  );
  assert.equal(typeof result.skuDecisions[0].confidence_breakdown.overall_confidence, "number");
  assert.ok(result.skuDecisions[0].constraints_passed.includes("cash"));
  assert.equal(typeof result.portfolioSummary.reduceCount, "number");
  assert.equal(typeof result.portfolioSummary.optimizeCount, "number");
  assert.equal(result.portfolioSummary.inventoryRisk, result.skuDecisions.filter((row) => row.inventoryRisk).length);
  assert.equal(typeof result.skuDecisions[0].budgetOpportunity, "boolean");
  assert.equal(typeof result.skuDecisions[0].decisionDrivers[0].category, "string");
  assert.ok(["positive", "negative", "risk"].includes(result.skuDecisions[0].decisionDrivers[0].impact));
  assert.equal(typeof result.skuDecisions[0].causalExplanation.businessMeaning, "string");
  assert.ok(result.recommended_portfolio[0].decisionDrivers.length >= 2);
  assert.equal(result.recommended_portfolio[0].simulation_horizon.days, 30);
  assert.equal(result.recommended_portfolio[0].timing.simulation_window_days, 30);
  assert.equal(result.recommended_portfolio[0].prediction_type, "rule_based");
  assert.ok(result.recommended_portfolio[0].ai_evidence.length >= 4);
  assert.ok(result.recommended_portfolio[0].ai_evidence.some((row) => row.type === "profit_signal"));
  assert.ok(result.recommended_portfolio[0].ai_evidence.some((row) => row.type === "inventory_signal"));
  assert.ok(result.recommended_portfolio[0].scenarios.length >= 3);
  assert.ok(result.recommended_portfolio[0].selected_scenario.selected);
  assert.equal(result.recommended_portfolio[0].decision_explanation.selected_action, result.recommended_portfolio[0].selected_scenario.action);
  assert.ok(result.recommended_portfolio[0].decision_explanation.alternatives_considered.length >= 2);
  assert.equal(result.recommended_portfolio[0].sku_decision_object.sku, result.recommended_portfolio[0].sku);
  assert.equal(result.recommended_portfolio[0].sku_decision_object.tracking_status, "RECOMMENDED");
  assert.ok(result.skuDecisions[0].ai_evidence.length >= 4);
  assert.ok(result.skuDecisions[0].scenarios.length >= 3);
  assert.equal(result.skuDecisions[0].tracking_status, "RECOMMENDED");
  assert.equal(result.skuDecisions[0].feedback.learned, false);
});

function daysBetween(startDateOnly, endDateOnly) {
  const start = new Date(`${startDateOnly}T00:00:00.000Z`);
  const end = new Date(`${endDateOnly}T00:00:00.000Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function adsSimulationSku(overrides = {}) {
  return {
    sku: "SKU_SIM_TARGET",
    category: "evergreen apparel",
    channel: "shopify",
    revenue: 10000,
    quantity: 200,
    price: 50,
    cogs: 18,
    ads_spend: 500,
    margin: 0.48,
    net_profit: 3000,
    inventory: 1000,
    sales_velocity: 8,
    refund_rate: 0.04,
    customer_ltv: 180,
    conversion_rate: 0.04,
    prediction_confidence: 0.86,
    shipping_cost: 2,
    fulfillment_cost: 1,
    fees: 350,
    ...overrides
  };
}

function adsSimulationAction(sku = "SKU_SIM_TARGET", budgetDelta = 300, portfolioAction = "SCALE_ADS") {
  return {
    action_id: `${sku}:${portfolioAction}`,
    sku,
    action: portfolioAction === "TEST_AD_SPEND" ? "TEST_AD_SPEND" : "INCREASE_AD_SPEND",
    portfolio_action: portfolioAction,
    budget_delta: budgetDelta,
    price_delta: 0,
    inventory_delta: 0,
    opportunity_type: "GROWTH",
    signals: ["unit_test"],
    feasibility: 0.9
  };
}

function simulateSingleAdAction({ sku = adsSimulationSku(), ads = [], allSkus = [sku], budgetDelta = 300, portfolioAction = "SCALE_ADS", days } = {}) {
  const [row] = simulateGeneratedActions({
    skus: allSkus,
    ads,
    actions: [adsSimulationAction(sku.sku, budgetDelta, portfolioAction)],
    simulationHorizonDays: days
  });
  return row;
}

test("prediction model output feeds model-driven simulation", () => {
  const simulations = simulatePortfolioActions(input());
  const scaled = simulations.find((row) => row.sku === "SKU_A" && row.action === "SCALE_ADS");

  assert.equal(scaled?.simulation_source, "prediction_model");
  assert.ok(scaled?.prediction_models.includes("ads-response-model"));
  assert.ok((scaled?.revenue_prediction.predicted_revenue ?? 0) > input().skus[0].revenue);
  assert.notEqual(scaled?.predicted_revenue, input().skus[0].revenue * 1.1);
});

test("incremental profit simulation uses SKU historical ads when available", () => {
  const sku = adsSimulationSku();
  const row = simulateSingleAdAction({
    sku,
    ads: [{ campaign_id: "CMP_TARGET", sku: sku.sku, spend: 500, impressions: 10000, clicks: 500, conversions: 120, roas: 4.2 }],
    allSkus: [sku],
    budgetDelta: 300
  });

  assert.equal(row.simulation_estimate?.prediction_source, "sku_historical_ads");
  assert.equal(row.simulation_estimate?.simulation_window.days, 30);
  assert.equal(row.simulation_estimate?.investment.additional_ad_spend, 300);
  assert.equal(row.simulation_estimate?.investment.ad_budget_period, "simulation_window");
  assert.equal(row.profit_delta, row.simulation_estimate?.profit_simulation.expected_profit_impact);
});

test("incremental profit simulation falls back to similar SKU benchmark before store fallback", () => {
  const target = adsSimulationSku({ sku: "SKU_NO_ADS", ads_spend: 0 });
  const similar = adsSimulationSku({ sku: "SKU_SIMILAR", ads_spend: 600, margin: 0.5 });
  const row = simulateSingleAdAction({
    sku: target,
    allSkus: [target, similar],
    ads: [{ campaign_id: "CMP_SIMILAR", sku: similar.sku, spend: 600, impressions: 9000, clicks: 450, conversions: 90, roas: 3.6 }],
    budgetDelta: 50,
    portfolioAction: "TEST_AD_SPEND"
  });

  assert.equal(row.action, "TEST_AD_SPEND");
  assert.equal(row.simulation_estimate?.prediction_source, "similar_sku_benchmark");
  assert.equal(row.simulation_estimate?.revenue_simulation.attribution_confidence_factor, 0.55);
  assert.ok(row.simulation_estimate?.warnings.includes("prediction_source=similar_sku_benchmark"));
});

test("incremental profit simulation uses conservative fallback when ads evidence is unavailable", () => {
  const target = adsSimulationSku({ sku: "SKU_UNKNOWN", ads_spend: 0, category: "new", channel: "tiktok" });
  const row = simulateSingleAdAction({
    sku: target,
    allSkus: [target],
    ads: [],
    budgetDelta: 50,
    portfolioAction: "TEST_AD_SPEND"
  });
  const estimate = row.simulation_estimate;

  assert.equal(estimate?.prediction_source, "rule_based_conservative_fallback");
  assert.equal(estimate?.revenue_simulation.base_roas, 1.5);
  assert.equal(estimate?.revenue_simulation.attribution_confidence_factor, 0.35);
  assert.ok((estimate?.confidence_breakdown.overall_confidence ?? 1) < 0.6);
});

test("diminishing return factor declines as additional ad spend grows", () => {
  const sku = adsSimulationSku();
  const ads = [{ campaign_id: "CMP_TARGET", sku: sku.sku, spend: 500, impressions: 10000, clicks: 500, conversions: 120, roas: 4.2 }];
  const small = simulateSingleAdAction({ sku, ads, allSkus: [sku], budgetDelta: 100 }).simulation_estimate;
  const large = simulateSingleAdAction({ sku, ads, allSkus: [sku], budgetDelta: 900 }).simulation_estimate;

  assert.ok((large?.revenue_simulation.diminishing_return_factor ?? 1) < (small?.revenue_simulation.diminishing_return_factor ?? 0));
});

test("attribution fallback discounts incremental revenue", () => {
  const sku = adsSimulationSku({ sku: "SKU_FALLBACK", ads_spend: 0 });
  const estimate = simulateSingleAdAction({
    sku,
    allSkus: [sku],
    ads: [],
    budgetDelta: 50,
    portfolioAction: "TEST_AD_SPEND"
  }).simulation_estimate;
  assert.ok(estimate);

  const revenueWithoutAttributionDiscount = roundCurrency(
    estimate.investment.additional_ad_spend *
      estimate.revenue_simulation.marginal_roas *
      estimate.revenue_simulation.diminishing_return_factor *
      estimate.revenue_simulation.inventory_capacity_factor
  );

  assert.equal(estimate.revenue_simulation.attribution_confidence_factor, 0.35);
  assert.ok(estimate.revenue_simulation.incremental_revenue < revenueWithoutAttributionDiscount);
});

test("inventory capacity limits expected profit impact when stock cannot support demand", () => {
  const ads = [{ campaign_id: "CMP_TARGET", sku: "SKU_STOCK_TEST", spend: 500, impressions: 10000, clicks: 500, conversions: 120, roas: 20 }];
  const stocked = adsSimulationSku({ sku: "SKU_STOCK_TEST", inventory: 1000, price: 10, shipping_cost: 0.2, fulfillment_cost: 0.1, fees: 100, refund_rate: 0.01 });
  const constrained = adsSimulationSku({ sku: "SKU_STOCK_TEST", inventory: 1, price: 10, shipping_cost: 0.2, fulfillment_cost: 0.1, fees: 100, refund_rate: 0.01 });
  const stockedEstimate = simulateSingleAdAction({ sku: stocked, ads, allSkus: [stocked], budgetDelta: 900 }).simulation_estimate;
  const constrainedEstimate = simulateSingleAdAction({ sku: constrained, ads, allSkus: [constrained], budgetDelta: 900 }).simulation_estimate;

  assert.ok((constrainedEstimate?.revenue_simulation.inventory_capacity_factor ?? 1) < 1);
  assert.ok((constrainedEstimate?.revenue_simulation.incremental_revenue ?? 0) < (stockedEstimate?.revenue_simulation.incremental_revenue ?? 0));
  assert.ok((constrainedEstimate?.profit_simulation.expected_profit_impact ?? 0) < (stockedEstimate?.profit_simulation.expected_profit_impact ?? 0));
  assert.ok(constrainedEstimate?.warnings.includes("inventory_capacity_limited"));
});

test("incremental profit subtracts ads, shipping, fees, refund, and fulfillment costs", () => {
  const sku = adsSimulationSku({
    shipping_cost: 2.5,
    fulfillment_cost: 1.25,
    fees: 500,
    refund_rate: 0.08
  });
  const estimate = simulateSingleAdAction({
    sku,
    ads: [{ campaign_id: "CMP_TARGET", sku: sku.sku, spend: 500, impressions: 10000, clicks: 500, conversions: 120, roas: 4.2 }],
    allSkus: [sku],
    budgetDelta: 300
  }).simulation_estimate;
  assert.ok(estimate);

  const costs = estimate.cost_simulation;
  assert.ok(costs.additional_ad_spend > 0);
  assert.ok(costs.incremental_shipping_cost > 0);
  assert.ok(costs.incremental_platform_fee > 0);
  assert.ok(costs.incremental_payment_fee > 0);
  assert.ok(costs.expected_refund_cost > 0);
  assert.ok(costs.incremental_fulfillment_cost > 0);
  assert.equal(
    estimate.profit_simulation.incremental_profit,
    roundCurrency(
      estimate.profit_simulation.gross_incremental_profit -
        costs.additional_ad_spend -
        costs.incremental_shipping_cost -
        costs.incremental_platform_fee -
        costs.incremental_payment_fee -
        costs.expected_refund_cost -
        costs.incremental_fulfillment_cost
    )
  );
});

test("growth SKUs without historical ads receive TEST_AD_SPEND instead of SCALE_ADS", () => {
  const sku = adsSimulationSku({ sku: "SKU_NEW_ADS", ads_spend: 0, prediction_confidence: 0.58 });
  const actions = generateOptimizationActions({
    skus: [sku],
    opportunities: [{
      sku: sku.sku,
      opportunity_type: "GROWTH",
      score: 0.8,
      signals: ["growth_candidate"],
      feasibility: 0.82
    }]
  });

  assert.ok(actions.some((action) => action.portfolio_action === "TEST_AD_SPEND"));
  assert.equal(actions.some((action) => action.portfolio_action === "SCALE_ADS"), false);
});

function lifecycleInput() {
  return {
    skus: [
      adsSimulationSku({
        sku: "SKU_LAUNCH",
        product_age_days: 12,
        quantity: 12,
        order_count: 12,
        ads_spend: 0,
        revenue_growth: 0.02,
        prediction_confidence: 0.42,
        net_profit: 120,
        inventory: 200
      }),
      adsSimulationSku({
        sku: "SKU_GROWTH",
        product_age_days: 80,
        revenue_growth: 0.26,
        ads_spend: 700,
        net_profit: 3200,
        margin: 0.42,
        inventory: 900,
        prediction_confidence: 0.82
      }),
      adsSimulationSku({
        sku: "SKU_MATURE",
        product_age_days: 260,
        revenue_growth: 0.01,
        ads_spend: 420,
        net_profit: 2800,
        margin: 0.32,
        inventory: 320,
        repeat_rate: 0.22,
        prediction_confidence: 0.78
      }),
      adsSimulationSku({
        sku: "SKU_DECLINING",
        product_age_days: 220,
        revenue_growth: -0.24,
        ads_spend: 650,
        net_profit: -180,
        margin: 0.08,
        inventory: 1400,
        sales_velocity: 3,
        prediction_confidence: 0.72
      })
    ],
    ads: [
      { campaign_id: "CMP_GROWTH", sku: "SKU_GROWTH", spend: 700, impressions: 10000, clicks: 500, conversions: 120, roas: 4.4 },
      { campaign_id: "CMP_MATURE", sku: "SKU_MATURE", spend: 420, impressions: 8000, clicks: 350, conversions: 70, roas: 2.4 },
      { campaign_id: "CMP_DECLINING", sku: "SKU_DECLINING", spend: 650, impressions: 9000, clicks: 200, conversions: 20, roas: 0.8 }
    ],
    constraints: {
      total_ads_budget: 2400,
      inventory_capacity: 5000,
      available_cash: 6000,
      target_margin: 0.05,
      max_price_change: 0.12,
      minimum_profit: -1000,
      minimum_confidence: 0.35,
      simulation_horizon_days: 30
    }
  };
}

test("SKU lifecycle classifier assigns every SKU a lifecycle stage", () => {
  const inputData = lifecycleInput();
  const classifications = classifySkuLifecycles({ skus: inputData.skus, ads: inputData.ads });

  assert.equal(classifications.length, inputData.skus.length);
  assert.equal(classifications.find((row) => row.sku === "SKU_LAUNCH")?.lifecycle_stage, "LAUNCH");
  assert.equal(classifications.find((row) => row.sku === "SKU_GROWTH")?.lifecycle_stage, "GROWTH");
  assert.equal(classifications.find((row) => row.sku === "SKU_MATURE")?.lifecycle_stage, "MATURE");
  assert.equal(classifications.find((row) => row.sku === "SKU_DECLINING")?.lifecycle_stage, "DECLINING");
});

test("lifecycle action spaces route launch, growth, mature, and declining SKUs differently", () => {
  const inputData = lifecycleInput();
  const classifications = classifySkuLifecycles({ skus: inputData.skus, ads: inputData.ads });
  const lifecycleBySku = new Map(classifications.map((row) => [row.sku, row]));
  const opportunities = inputData.skus.map((sku) => ({
    sku: sku.sku,
    opportunity_type: "GROWTH",
    signals: ["unit_test"],
    evidence: {
      margin: sku.margin,
      net_profit: sku.net_profit,
      ads_spend: sku.ads_spend,
      inventory: sku.inventory,
      sales_velocity: sku.sales_velocity,
      conversion_rate: sku.conversion_rate,
      confidence: sku.prediction_confidence ?? 0.55
    },
    feasibility: 0.82
  }));
  const actions = generateOptimizationActions({ skus: inputData.skus, opportunities, lifecycleBySku });
  const bySku = (sku) => actions.filter((action) => action.sku === sku).map((action) => action.portfolio_action);

  assert.ok(bySku("SKU_LAUNCH").includes("TEST_AD_SPEND"));
  assert.equal(bySku("SKU_LAUNCH").includes("SCALE_ADS"), false);
  assert.ok(bySku("SKU_GROWTH").includes("SCALE_ADS"));
  assert.ok(bySku("SKU_MATURE").includes("PRICE_UP_5") || bySku("SKU_MATURE").includes("SHIFT_CHANNEL"));
  assert.ok(bySku("SKU_DECLINING").includes("REDUCE_ADS") || bySku("SKU_DECLINING").includes("STOP"));
  assert.equal(bySku("SKU_DECLINING").includes("SCALE_ADS"), false);
});

test("optimization result and report expose lifecycle intelligence", () => {
  const result = optimizeSkuPortfolio(lifecycleInput());
  const report = generatePortfolioOptimizationReport(result);

  assert.equal(result.lifecycleClassifications.length, lifecycleInput().skus.length);
  assert.equal(result.lifecycleSummary.totalSkus, lifecycleInput().skus.length);
  assert.ok(result.skuDecisions.every((row) => row.lifecycle_stage));
  assert.ok(report.top_actions.some((action) => action.lifecycle_stage || action.evidence.some((item) => item.includes("lifecycle:"))));
});

test("feedback learning records lifecycle stage", () => {
  const feedback = recordOptimizationFeedback({
    sku: "SKU_GROWTH",
    lifecycle_stage: "GROWTH",
    action: "SCALE_ADS",
    predicted_profit: 5000,
    actual_profit: 4200,
    confidence: 0.82
  });

  assert.equal(feedback.lifecycle_stage, "GROWTH");
});

test("standalone revenue prediction model is deterministic and confidence-scored", () => {
  const output = predictRevenue({
    sku: "SKU_A",
    historical_revenue: 5000,
    sales_velocity: 8,
    price: 50,
    ads_spend: 800,
    channel: "shopify",
    scenario: "increase_ads",
    ads_response: {
      additional_spend: 300,
      incremental_revenue: 900,
      incremental_profit: 160,
      marginal_roas: 3,
      confidence: 0.78
    },
    pricing_elasticity: {
      price_change: 0,
      demand_change: 0,
      profit_change: 0,
      confidence: 0.8
    },
    demand_forecast: {
      future_demand: 260,
      sales_velocity: 8,
      demand_trend: 1.6,
      inventory_consumption: 260,
      confidence: 0.76
    },
    base_confidence: 0.86
  });

  assert.ok(output.predicted_revenue > 5000);
  assert.ok(output.confidence > 0.6);
  assert.equal(output.model, "historical_response_weighted_regression");
});

test("budget and inventory constraints are respected", () => {
  const result = optimizeSkuPortfolio(input());

  assert.ok(result.optimization_summary.ads_budget_used <= input().constraints.total_ads_budget);
  assert.ok(result.optimization_summary.inventory_required <= input().constraints.inventory_capacity);
  assert.ok(result.optimization_summary.cash_required <= input().constraints.available_cash);
  assert.equal(result.optimization_summary.simulation_horizon_days, 30);
});

test("portfolio objective applies penalties beyond simple positive delta sum", () => {
  const result = optimizeSkuPortfolio(input());
  const positiveDeltaSum = result.simulations
    .filter((row) => row.profit_delta > 0)
    .reduce((sum, row) => sum + row.profit_delta, 0);

  assert.ok(result.total_expected_profit_gain < positiveDeltaSum);
  assert.ok(result.optimization_summary.constraints_applied.some((row) => row.includes("available_cash")));
  assert.ok(result.optimization_summary.constraints_applied.some((row) => row.includes("simulation_horizon_days=30")));
});

test("price simulation changes profit and produces pricing plan", () => {
  const result = optimizeSkuPortfolio(input());

  assert.ok(result.pricing_plan.length > 0);
  assert.ok(result.pricing_plan.some((row) => row.expected_profit_delta > 0 && row.optimal_price !== row.current_price));
});

test("low confidence predictions do not enter best portfolio", () => {
  const result = optimizeSkuPortfolio(input());

  assert.equal(result.recommended_portfolio.some((row) => row.sku === "SKU_LOW_CONF"), false);
});

test("inventory constraint prevents scaling stock-limited SKU without enough capacity", () => {
  const constrained = input();
  constrained.constraints.inventory_capacity = 250;
  const result = optimizeSkuPortfolio(constrained);
  const limited = result.recommended_portfolio.find((row) => row.sku === "SKU_STOCK_LIMITED");

  assert.notEqual(limited?.action, "SCALE_ADS");
  assert.notEqual(limited?.action, "SCALE_ADS_PRICE_UP_5");
});

test("simulation results are reproducible", () => {
  assert.deepEqual(simulatePortfolioActions(input()), simulatePortfolioActions(input()));
});

test("optimization report matches algorithm result", () => {
  const result = optimizeSkuPortfolio(input());
  const report = generatePortfolioOptimizationReport(result);

  assert.equal(report.executive_summary.current_profit, result.optimization_summary.current_portfolio_profit);
  assert.equal(report.executive_summary.optimized_profit, result.optimization_summary.optimized_portfolio_profit);
  assert.equal(report.executive_summary.profit_lift, result.total_expected_profit_gain);
  assert.equal(report.executive_summary.simulation_source, "prediction_model");
  assert.equal(report.executive_summary.prediction_confidence, result.prediction_summary.prediction_confidence);
  assert.ok(report.top_actions.every((action) => action.reason && action.evidence.length && typeof action.confidence === "number"));
});

test("feedback learning records prediction error", () => {
  const feedback = recordOptimizationFeedback({
    action: "SCALE_ADS",
    sku: "SKU_A",
    predicted_profit: 3000,
    predicted_revenue: 8000,
    confidence: 0.82,
    actual_profit: 2100,
    actual_revenue: 7200
  });

  assert.equal(feedback.error, -900);
  assert.equal(feedback.absolute_error, 900);
  assert.ok(feedback.confidence_adjustment < 0);
});

test("optimization API exposes SKU portfolio optimization and report", () => {
  const route = fs.readFileSync(join(process.cwd(), "app/api/optimization/run/route.ts"), "utf8");
  const optimizer = fs.readFileSync(join(process.cwd(), "lib/optimization/portfolio-optimizer.ts"), "utf8");

  assert.match(route, /sku_portfolio_optimization/);
  assert.match(route, /sku_portfolio_report/);
  assert.match(optimizer, /prediction_driven_global_portfolio_solver/);
  assert.doesNotMatch(optimizer, /greedy ranking only|openai|gpt|prompt/i);
});

test("optimization UI labels estimates as simulation estimates with breakdown", () => {
  const renderer = fs.readFileSync(join(process.cwd(), "components/report-renderer-engine.tsx"), "utf8");

  assert.match(renderer, /Simulation Estimate/);
  assert.match(renderer, /模拟增量利润/);
  assert.match(renderer, /Simulation Breakdown/);
  assert.match(renderer, /simulationEstimateSourceLabel/);
});
