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
const { simulatePortfolioActions } = jiti("./lib/optimization/profit-simulation-engine.ts");
const { generatePortfolioOptimizationReport } = jiti("./lib/optimization/optimization-report-generator.ts");
const { predictRevenue } = jiti("./lib/optimization/prediction/revenue-prediction-model.ts");
const { recordOptimizationFeedback } = jiti("./lib/optimization/feedback-learning-engine.ts");

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
  assert.equal(result.recommended_portfolio[0].prediction_type, "rule_based");
});

test("prediction model output feeds model-driven simulation", () => {
  const simulations = simulatePortfolioActions(input());
  const scaled = simulations.find((row) => row.sku === "SKU_A" && row.action === "SCALE_ADS");

  assert.equal(scaled?.simulation_source, "prediction_model");
  assert.ok(scaled?.prediction_models.includes("ads-response-model"));
  assert.ok((scaled?.revenue_prediction.predicted_revenue ?? 0) > input().skus[0].revenue);
  assert.notEqual(scaled?.predicted_revenue, input().skus[0].revenue * 1.1);
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
