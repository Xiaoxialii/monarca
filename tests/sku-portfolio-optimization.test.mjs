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
const {
  canonicalOptimizationAction,
  canonicalOptimizationGroup,
  inventoryRestockUnits,
  isInventoryRestockRequired,
  normalizeDecision
} = jiti("./lib/optimization/action-taxonomy.ts");
const { simulateGeneratedActions, simulatePortfolioActions, simulateSkuAction } = jiti("./lib/optimization/profit-simulation-engine.ts");
const { generateOptimizationActions } = jiti("./lib/optimization/action-generator.ts");
const { buildDynamicThresholdProfile } = jiti("./lib/optimization/dynamic-threshold-engine.ts");
const { solveGlobalPortfolio } = jiti("./lib/optimization/portfolio-solver.ts");
const { getOptimizationPolicy } = jiti("./lib/optimization/policy/policy-loader.ts");
const { evaluateActionEligibility } = jiti("./lib/optimization/policy/optimization-policy.ts");
const { DEFAULT_OPTIMIZATION_POLICY } = jiti("./lib/optimization/policy/default-policies.ts");
const { validateDecisionContract } = jiti("./lib/optimization/decision-contract-validator.ts");
const { assessSelectedInventoryMix, clearInventoryQualityScore } = jiti("./lib/optimization/inventory-health-score.ts");
const { generatePortfolioOptimizationReport } = jiti("./lib/optimization/optimization-report-generator.ts");
const { predictRevenue } = jiti("./lib/optimization/prediction/revenue-prediction-model.ts");
const { recordOptimizationFeedback } = jiti("./lib/optimization/feedback-learning-engine.ts");
const { classifySkuLifecycles } = jiti("./lib/lifecycle/sku-lifecycle-classifier.ts");
const { calculateAcceptedActionImpact } = jiti("./lib/optimization/accepted-action-impact.ts");
const { actionAllowedByDecisionConfidence, decisionConfidenceEvaluator } = jiti("./lib/optimization/decision-confidence-engine.ts");
const { governDecision } = jiti("./lib/optimization/decision-governance-engine.ts");
const { evaluateDecisionReadiness } = jiti("./lib/optimization/decision-readiness-engine.ts");

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
        order_period_count: 2,
        refund_rate: 0.04,
        customer_ltv: 180,
        conversion_rate: 0.04,
        prediction_confidence: 0.86,
        cac_confidence: "MEDIUM",
        customer_metric_confidence: "MEDIUM"
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
        order_period_count: 2,
        refund_rate: 0.05,
        customer_ltv: 150,
        conversion_rate: 0.035,
        prediction_confidence: 0.82,
        cac_confidence: "MEDIUM",
        customer_metric_confidence: "MEDIUM"
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
        order_period_count: 2,
        refund_rate: 0.02,
        customer_ltv: 220,
        conversion_rate: 0.06,
        prediction_confidence: 0.28,
        cac_confidence: "LOW",
        customer_metric_confidence: "LOW"
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
        order_period_count: 2,
        refund_rate: 0.03,
        customer_ltv: 130,
        conversion_rate: 0.045,
        prediction_confidence: 0.8,
        cac_confidence: "MEDIUM",
        customer_metric_confidence: "MEDIUM"
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
        order_period_count: 2,
        refund_rate: 0.12,
        customer_ltv: 60,
        conversion_rate: 0.01,
        prediction_confidence: 0.72,
        cac_confidence: "LOW",
        customer_metric_confidence: "LOW"
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

test("RESTOCK_AND_SCALE without inventory risk is classified as growth scale ads", () => {
  const action = canonicalOptimizationAction({
    sourceAction: "RESTOCK_AND_SCALE",
    action: "SCALE",
    unifiedAction: "RESTOCK",
    inventoryRisk: false,
    requiredInventory: 120,
    currentInventory: 180,
    recommendedText: "Inventory can support the simulated demand window."
  });

  assert.equal(action, "SCALE_ADS");
  assert.deepEqual(canonicalOptimizationGroup(action), {
    goal: "GROWTH",
    actionLabel: "Scale Ads"
  });
});

test("single period lifecycle is UNKNOWN and low confidence", () => {
  const [classification] = classifySkuLifecycles({
    skus: [{
      ...input().skus[0],
      sku: "SKU_SINGLE_PERIOD",
      order_period_count: 1,
      data_period_days: 0,
      revenue_growth: 0.5
    }],
    ads: []
  });

  assert.equal(classification.lifecycle_stage, "UNKNOWN");
  assert.notEqual(classification.lifecycle_stage, "GROWTH");
  assert.notEqual(classification.lifecycle_stage, "MATURE");
  assert.notEqual(classification.lifecycle_stage, "DECLINING");
  assert.equal(classification.lifecycle_confidence, "LOW");
  assert.match(classification.reason, /Insufficient historical periods/);
});

test("ROAS anomaly with low spend cannot trigger SCALE_ADS", () => {
  const base = input();
  const sku = {
    ...base.skus[0],
    sku: "SKU_ROAS_ANOMALY",
    revenue: 15000,
    ads_spend: 100,
    margin: 0.55,
    net_profit: 6500,
    inventory: 1000,
    sales_velocity: 8,
    order_period_count: 2,
    sales_velocity_confidence: "HIGH",
    attribution_confidence: 0.95,
    prediction_confidence: 0.9
  };
  const simulation = simulateSkuAction(sku, "SCALE_ADS", [{
    campaign_id: "CMP_ANOMALY",
    sku: "SKU_ROAS_ANOMALY",
    spend: 100,
    impressions: 1000,
    clicks: 200,
    conversions: 100,
    roas: 150,
    attribution_confidence: 0.95,
    attribution_status: "attributed",
    attribution_source: "campaign_attribution"
  }]);
  const confidence = decisionConfidenceEvaluator({ sku, simulation });

  assert.equal(confidence.roas_validation.confidence, "LOW");
  assert.match(confidence.roas_validation.reason, /ROAS anomaly/);
  assert.equal(actionAllowedByDecisionConfidence({ action: "SCALE_ADS", unifiedAction: "SCALE_ADS", confidence }), false);
});

test("low CAC confidence blocks acquisition budget increase", () => {
  const base = input();
  const sku = {
    ...base.skus[0],
    sku: "SKU_LOW_CAC_CONF",
    revenue: 5000,
    ads_spend: 800,
    margin: 0.5,
    net_profit: 1800,
    inventory: 2000,
    sales_velocity: 8,
    sales_velocity_confidence: "HIGH",
    order_period_count: 3,
    attribution_confidence: 0.92,
    prediction_confidence: 0.9,
    cac_confidence: "LOW",
    customer_metric_confidence: "LOW"
  };
  const simulation = simulateSkuAction(sku, "SCALE_ADS", [{
    campaign_id: "CMP_LOW_CAC",
    sku: "SKU_LOW_CAC_CONF",
    spend: 800,
    impressions: 10000,
    clicks: 700,
    conversions: 140,
    roas: 6.25,
    attribution_confidence: 0.92,
    attribution_status: "attributed",
    attribution_source: "campaign_attribution"
  }]);
  const confidence = decisionConfidenceEvaluator({ sku, simulation });

  assert.equal(confidence.signal_confidence.customer, "LOW");
  assert.equal(confidence.signal_quality.customer, "LOW");
  assert.equal(actionAllowedByDecisionConfidence({ action: "SCALE_ADS", unifiedAction: "SCALE_ADS", confidence }), false);
  assert.ok(confidence.blocked_signals.some((reason) => /CAC confidence LOW/.test(reason)));
  const governance = governDecision({ action: "SCALE_ADS", unifiedAction: "SCALE_ADS", simulation, confidence });
  const readiness = evaluateDecisionReadiness({ sku, action: "SCALE_ADS", unifiedAction: "SCALE_ADS", confidence, governance });
  assert.equal(governance.allowed, false);
  assert.ok(readiness.blocked_actions.includes("ACQUISITION_SCALING"));
  assert.ok(readiness.blocked_actions.includes("SCALE_ADS"));
  assert.equal(readiness.blocked_actions.includes("PRICE_CHANGE"), false);
  assert.equal(readiness.signal_readiness.customer.data_confidence, "LOW");
  assert.equal(readiness.signal_readiness.customer.signal_confidence, "LOW");
  assert.equal(typeof readiness.score, "number");
  assert.deepEqual(readiness.limitations, readiness.data_limitations);
  assert.deepEqual(readiness.allowed_actions, ["MONITOR"]);
});

test("missing CAC confidence prevents creating SCALE_ADS action", () => {
  const { cac_confidence, customer_metric_confidence, ...sku } = adsSimulationSku({
    sku: "SKU_MISSING_CAC_CONF",
    revenue: 5000,
    ads_spend: 800,
    margin: 0.5,
    net_profit: 1800,
    inventory: 2000,
    sales_velocity: 8,
    sales_velocity_confidence: "HIGH",
    order_period_count: 3,
    attribution_confidence: 0.92,
    prediction_confidence: 0.9
  });
  const actions = generateOptimizationActions({
    skus: [sku],
    opportunities: [unitOpportunity(sku, "GROWTH")]
  });

  assert.equal(cac_confidence, "MEDIUM");
  assert.equal(customer_metric_confidence, "MEDIUM");
  assert.equal(actions.some((action) => action.portfolio_action === "SCALE_ADS"), false);
  assert.ok(actions.some((action) => action.portfolio_action === "TEST_AD_SPEND" || action.portfolio_action === "HOLD"));
});

test("low inventory confidence blocks REDUCE_INVENTORY", () => {
  const base = input();
  const sku = {
    ...base.skus[0],
    sku: "SKU_LOW_INV_CONF",
    revenue: 8000,
    quantity: 40,
    ads_spend: 200,
    margin: 0.42,
    net_profit: 2500,
    inventory: 1200,
    sales_velocity: 1,
    normalized_daily_sales_velocity: 1,
    sales_velocity_confidence: "LOW",
    inventory_risk_status: "EXCESS_INVENTORY",
    order_period_count: 2,
    attribution_confidence: 0.8,
    prediction_confidence: 0.82
  };
  const simulation = simulateSkuAction(sku, "REDUCE_INVENTORY", []);
  const confidence = decisionConfidenceEvaluator({ sku, simulation });

  assert.equal(confidence.signal_confidence.inventory, "LOW");
  assert.equal(actionAllowedByDecisionConfidence({ action: "REDUCE_INVENTORY", unifiedAction: "REDUCE_INVENTORY", confidence }), false);
  const governance = governDecision({ action: "REDUCE_INVENTORY", unifiedAction: "REDUCE_INVENTORY", simulation, confidence });
  const readiness = evaluateDecisionReadiness({ sku, action: "REDUCE_INVENTORY", unifiedAction: "REDUCE_INVENTORY", confidence, governance });
  assert.ok(readiness.blocked_actions.includes("REDUCE_INVENTORY"));
  assert.ok(readiness.blocked_actions.includes("RESTOCK"));
  assert.equal(readiness.blocked_actions.includes("PRICE_CHANGE"), false);
  assert.equal(readiness.signal_readiness.inventory.data_confidence, "LOW");
  assert.equal(readiness.signal_readiness.inventory.signal_confidence, "LOW");
  assert.ok(readiness.allowed_actions.includes("MONITOR"));
});

test("accepted SKU impact compares actual against expected profit lift", () => {
  const impact = calculateAcceptedActionImpact({
    baseline_metrics: {
      revenue: 1000,
      profit: 250,
      margin: 0.25,
      ad_spend: 100,
      inventory: 50
    },
    predicted_metrics: {
      revenue: 1200,
      profit: 330,
      profit_delta: 80,
      margin: 0.275,
      ad_spend: 140,
      inventory: 45
    },
    actual_metrics: {
      revenue: 1230,
      profit: 370,
      margin: 0.28,
      ad_spend: 138,
      inventory: 43
    }
  });

  assert.equal(impact.expected_profit_delta, 80);
  assert.equal(impact.actual_profit_delta, 120);
  assert.equal(impact.performance_status, "OUTPERFORMED");
  assert.equal(impact.ads_change, 38);
  assert.equal(impact.inventory_change, -7);
});

test("high confidence SKU can still generate SCALE_ADS", () => {
  const base = input();
  const sku = {
    ...base.skus[0],
    sku: "SKU_HIGH_CONF_SCALE",
    revenue: 5000,
    ads_spend: 800,
    margin: 0.5,
    net_profit: 1800,
    inventory: 2000,
    sales_velocity: 8,
    sales_velocity_confidence: "HIGH",
    order_period_count: 3,
    attribution_confidence: 0.92,
    prediction_confidence: 0.9
  };
  const simulation = simulateSkuAction(sku, "SCALE_ADS", [{
    campaign_id: "CMP_SCALE",
    sku: "SKU_HIGH_CONF_SCALE",
    spend: 800,
    impressions: 10000,
    clicks: 700,
    conversions: 140,
    roas: 6.25,
    attribution_confidence: 0.92,
    attribution_status: "attributed",
    attribution_source: "campaign_attribution"
  }], undefined, undefined, 30, [sku], {
    sku: sku.sku,
    lifecycle_stage: "GROWTH",
    lifecycle_confidence: "HIGH",
    confidence: 0.9,
    reason: "Multiple order periods with profitable growth",
    signals: ["growth_trend"],
    scores: {}
  });
  const confidence = decisionConfidenceEvaluator({ sku, simulation });

  assert.notEqual(confidence.confidence_level, "LOW");
  assert.equal(actionAllowedByDecisionConfidence({ action: "SCALE_ADS", unifiedAction: "SCALE_ADS", confidence }), true);
});

test("decision contract validator accepts valid restock evidence", () => {
  const result = validateDecisionContract({
    action: "RESTOCK_AND_SCALE",
    current_inventory: 43,
    required_inventory: 124,
    inventory_gap: 81,
    current_profit: 100,
    predicted_profit: 140,
    predicted_profit_delta: 40,
    predicted_revenue: 400,
    predicted_margin: 0.35,
    required_cash: 81
  }, {
    constraints: input().constraints
  });

  assert.equal(result.valid, true);
  assert.ok(result.checked_rules.includes("inventory_evidence_present"));
});

test("decision contract validator rejects restock missing current inventory", () => {
  const result = validateDecisionContract({
    action: "RESTOCK_AND_SCALE",
    required_inventory: 124,
    inventory_gap: 81,
    current_profit: 100,
    predicted_profit: 140,
    predicted_profit_delta: 40
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "current_inventory"));
});

test("decision contract validator rejects zero inventory gap restock", () => {
  const result = validateDecisionContract({
    action: "RESTOCK_AND_SCALE",
    current_inventory: 124,
    required_inventory: 124,
    inventory_gap: 0,
    current_profit: 100,
    predicted_profit: 100,
    predicted_profit_delta: 0
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "inventory_gap"));
});

test("decision contract validator rejects restock with inconsistent inventory evidence", () => {
  const result = validateDecisionContract({
    action: "RESTOCK_AND_SCALE",
    current_inventory: 43,
    required_inventory: 124,
    inventory_gap: 124,
    current_profit: 100,
    predicted_profit: 140,
    predicted_profit_delta: 40
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.map((error) => error.message).join(" "), /required_inventory - current_inventory/);
});

test("decision contract validator accepts valid scale ads evidence", () => {
  const result = validateDecisionContract({
    action: "SCALE_ADS",
    ads_spend: 500,
    estimated_roas: 3.8,
    margin: 0.42,
    prediction_confidence: 0.78,
    inventory_coverage_days: 45,
    current_profit: 1000,
    predicted_profit: 1280,
    predicted_profit_delta: 280,
    predicted_revenue: 3200,
    predicted_margin: 0.4,
    required_cash: 150
  }, {
    constraints: input().constraints
  });

  assert.equal(result.valid, true);
  assert.ok(result.checked_rules.includes("advertising_evidence_present"));
});

test("decision contract validator rejects scale ads without ROAS", () => {
  const result = validateDecisionContract({
    action: "SCALE_ADS",
    ads_spend: 500,
    margin: 0.42,
    prediction_confidence: 0.78,
    inventory_coverage_days: 45
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "estimated_roas"));
});

test("decision contract validator rejects scale ads below margin threshold", () => {
  const result = validateDecisionContract({
    action: "SCALE_ADS",
    ads_spend: 500,
    estimated_roas: 3.8,
    margin: 0.2,
    prediction_confidence: 0.78,
    inventory_coverage_days: 45
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "margin"));
});

test("decision contract validator accepts valid price adjustment evidence", () => {
  const result = validateDecisionContract({
    action: "PRICE_UP_5",
    current_price: 100,
    new_price: 105,
    price_change_percentage: 0.05,
    price_elasticity_confidence: 0.76,
    conversion_stability: 0.74,
    market_reference_price: 112,
    current_profit: 1000,
    predicted_profit: 1100,
    predicted_profit_delta: 100,
    predicted_revenue: 2500,
    predicted_margin: 0.44,
    required_cash: 0
  });

  assert.equal(result.valid, true);
});

test("decision contract validator rejects price adjustment missing elasticity", () => {
  const result = validateDecisionContract({
    action: "PRICE_UP_5",
    current_price: 100,
    new_price: 105,
    price_change_percentage: 0.05,
    conversion_stability: 0.74
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "price_elasticity_confidence"));
});

test("decision contract validator rejects inconsistent profit delta", () => {
  const result = validateDecisionContract({
    action: "HOLD",
    current_profit: 100,
    predicted_profit: 150,
    predicted_profit_delta: 20
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "predicted_profit_delta"));
});

test("normalizes stale restock canonical action with no inventory evidence to scale ads when budget grows", () => {
  const decision = normalizeDecision({
    canonicalAction: "RESTOCK_INVENTORY",
    inventoryGap: 0,
    inventoryDelta: 0,
    displayTitle: "Scale Ads",
    adBudgetChange: 255.14,
    expectedProfitImpact: 1014.71,
    roas: 3.2
  });

  assert.deepEqual({
    action: decision.action,
    category: decision.category,
    title: decision.title,
    rejected: decision.trace.rejectedActions[0]?.action
  }, {
    action: "SCALE_ADS",
    category: "GROWTH",
    title: "Scale Ads",
    rejected: "RESTOCK_INVENTORY"
  });
});

test("generic inventory risk does not create restock evidence when stock covers required inventory", () => {
  const decision = normalizeDecision({
    canonicalAction: "RESTOCK_INVENTORY",
    currentInventory: 135,
    requiredInventory: 135,
    inventoryRisk: true
  });

  assert.notEqual(decision.action, "RESTOCK_INVENTORY");
  assert.equal(isInventoryRestockRequired({
    currentInventory: 135,
    requiredInventory: 135,
    inventoryRisk: true
  }), false);
});

test("stockout copy does not create restock evidence when inventory units do not change", () => {
  const decision = normalizeDecision({
    canonicalAction: "RESTOCK_INVENTORY",
    currentInventory: 124,
    requiredInventory: 124,
    inventoryDelta: 0,
    recommendedInventoryChange: 0,
    stockoutRisk: "high",
    recommendedText: "Add inventory to prevent stockout risk",
    adBudgetChange: 260.66,
    expectedProfitImpact: 485.59,
    roas: 3.4
  });

  assert.deepEqual({
    action: decision.action,
    category: decision.category,
    units: inventoryRestockUnits({ currentInventory: 124, requiredInventory: 124 }),
    inventoryEvidence: decision.hasInventoryEvidence
  }, {
    action: "SCALE_ADS",
    category: "GROWTH",
    units: 0,
    inventoryEvidence: false
  });
});

test("keeps restock canonical action when inventory gap is positive", () => {
  const decision = normalizeDecision({
    canonicalAction: "RESTOCK_INVENTORY",
    currentInventory: 100,
    requiredInventory: 235
  });

  assert.deepEqual({
    action: decision.action,
    category: decision.category,
    units: inventoryRestockUnits({ currentInventory: 100, requiredInventory: 235 })
  }, {
    action: "RESTOCK_INVENTORY",
    category: "INVENTORY",
    units: 135
  });
});

test("missing current inventory does not assume restock from generic risk", () => {
  const decision = normalizeDecision({
    canonicalAction: "RESTOCK_INVENTORY",
    requiredInventory: 135,
    inventoryRisk: true
  });

  assert.deepEqual({
    action: decision.action,
    category: decision.category,
    units: inventoryRestockUnits({ requiredInventory: 135, currentInventory: null })
  }, {
    action: "HOLD",
    category: "PORTFOLIO_HEALTH",
    units: 0
  });
  assert.equal(decision.trace.validationReason, "No inventory gap or stronger alternative evidence detected.");
});

test("ignores conflicting backend display title when canonical action is scale ads", () => {
  const decision = normalizeDecision({
    canonicalAction: "SCALE_ADS",
    displayTitle: "Restock Inventory"
  });

  assert.deepEqual({
    action: decision.action,
    category: decision.category,
    title: decision.title
  }, {
    action: "SCALE_ADS",
    category: "GROWTH",
    title: "Scale Ads"
  });
});

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
  assert.ok(result.skuDecisions[0].decision_quality);
  assert.ok(Array.isArray(result.skuDecisions[0].decision_quality.decision_allowed));
  assert.ok(result.skuDecisions[0].decision_readiness);
  assert.equal(typeof result.skuDecisions[0].decision_readiness.decision_readiness_score, "number");
  assert.ok(Array.isArray(result.skuDecisions[0].decision_readiness.blocked_actions));
  assert.ok(result.recommended_portfolio[0].decision_quality);
  assert.ok(result.recommended_portfolio[0].sku_decision_object.decision_quality);
  assert.ok(result.recommended_portfolio[0].sku_decision_object.decision_readiness);
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
  assert.ok(result.recommended_portfolio[0].scenarios.length >= 2);
  assert.ok(result.recommended_portfolio.every((row) => row.validation?.status === "PASSED"));
  assert.ok(result.recommended_portfolio.every((row) => row.decision_contract.validation?.status === "PASSED"));
  assert.equal(result.recommended_portfolio[0].policy_trace.policyVersion, result.optimization_policy.version);
  assert.ok(result.recommended_portfolio[0].selected_scenario.selected);
  assert.equal(result.recommended_portfolio[0].decision_explanation.selected_action, result.recommended_portfolio[0].selected_scenario.action);
  assert.ok(result.recommended_portfolio[0].decision_explanation.alternatives_considered.length >= 1);
  assert.equal(result.recommended_portfolio[0].sku_decision_object.sku, result.recommended_portfolio[0].sku);
  assert.equal(result.recommended_portfolio[0].sku_decision_object.tracking_status, "RECOMMENDED");
  assert.ok(result.skuDecisions[0].ai_evidence.length >= 4);
  assert.ok(result.skuDecisions[0].scenarios.length >= 2);
  assert.ok(result.skuDecisions.every((row) => row.validation?.status === "PASSED"));
  assert.equal(result.skuDecisions[0].policy_trace.policyVersion, result.optimization_policy.version);
  assert.equal(result.skuDecisions[0].tracking_status, "RECOMMENDED");
  assert.equal(result.skuDecisions[0].feedback.learned, false);
});

test("v2 multi-path optimization exposes scenario mix and alternatives", () => {
  const result = optimizeSkuPortfolio(input());
  const distribution = result.optimization_summary.action_distribution;

  assert.equal(result.algorithm, "prediction_driven_global_portfolio_solver");
  assert.equal(result.optimization_summary.total_opportunities, result.recommended_portfolio.length);
  assert.equal(result.optimization_summary.scenarios_tested, result.simulations.length);
  assert.equal(result.optimization_summary.expected_profit_gain, result.total_expected_profit_gain);
  assert.ok(result.optimization_summary.scenarios_tested >= result.optimization_summary.total_opportunities * 2);
  assert.ok(Object.values(distribution).reduce((sum, value) => sum + value, 0) === result.recommended_portfolio.length);
  assert.ok((distribution.SCALE_ADS ?? 0) < result.recommended_portfolio.length);

  for (const decision of result.skuDecisions) {
    assert.equal(decision.expectedProfitImpact, decision.estimatedProfitImpact);
    assert.equal(typeof decision.action_score, "number");
    assert.ok(decision.scenarios.length >= 2);
    assert.equal(decision.policy_trace.policyVersion, result.optimization_policy.version);
    assert.ok(decision.alternative_actions.length >= 1);
    assert.equal(decision.sku_decision_object.expected_profit_impact, decision.expectedProfitImpact);
    assert.equal(decision.sku_decision_object.simulation.profit_delta, decision.expectedProfitImpact);
  }
});

test("adaptive threshold profile uses user history and business objective", () => {
  const growthInput = input();
  growthInput.business_objective = "GROWTH";
  growthInput.industry = "fashion ecommerce";
  growthInput.ads = [
    { campaign_id: "A", sku: "SKU_A", spend: 200, impressions: 10000, clicks: 420, conversions: 40, roas: 4.2 },
    { campaign_id: "B", sku: "SKU_B", spend: 160, impressions: 8200, clicks: 330, conversions: 28, roas: 3.6 },
    { campaign_id: "C", sku: "SKU_STOCK_LIMITED", spend: 90, impressions: 4200, clicks: 150, conversions: 12, roas: 2.8 }
  ];
  growthInput.skus = growthInput.skus.map((sku, index) => ({
    ...sku,
    order_count: sku.quantity,
    customer_count: Math.max(1, Math.floor(sku.quantity * 0.72)),
    revenue_growth: index === 0 ? 0.22 : sku.revenue_growth ?? 0.08
  }));

  const cashInput = {
    ...growthInput,
    business_objective: "CASH_RECOVERY"
  };

  const growthResult = optimizeSkuPortfolio(growthInput);
  const cashResult = optimizeSkuPortfolio(cashInput);

  assert.equal(growthResult.threshold_profile.source, "user_historical");
  assert.equal(growthResult.threshold_profile.business_objective, "GROWTH");
  assert.ok(growthResult.threshold_profile.scale_ads_threshold.marginal_roas > 0);
  assert.ok(growthResult.threshold_profile.price_threshold.margin_headroom > 0);
  assert.notEqual(
    growthResult.threshold_profile.scale_ads_threshold.marginal_roas,
    cashResult.threshold_profile.scale_ads_threshold.marginal_roas
  );
  assert.ok(growthResult.simulations.every((row) => typeof row.action_score === "number"));
});

test("default expert baseline policy is conservative when merchant history is unavailable", () => {
  const policy = getOptimizationPolicy();

  assert.equal(policy.objective, "BALANCED");
  assert.equal(policy.source, "system_default");
  assert.equal(policy.thresholds.advertising.scaleAds.minimumMarginalRoas, 3);
  assert.equal(policy.thresholds.advertising.scaleAds.minimumMargin, 0.35);
  assert.equal(policy.thresholds.advertising.scaleAds.minimumConfidence, 0.7);
  assert.equal(policy.thresholds.advertising.scaleAds.minimumInventoryCoverageDays, 7);
  assert.equal(policy.thresholds.advertising.scaleAds.maximumBudgetIncreasePct, 0.3);
  assert.equal(policy.thresholds.advertising.reduceAds.roasThreshold, 1.5);
  assert.equal(policy.thresholds.pricing.maximumIncreasePct, 0.05);
  assert.equal(policy.thresholds.pricing.maximumDecreasePct, 0.1);
  assert.equal(policy.thresholds.pricing.minimumElasticityConfidence, 0.7);
  assert.equal(policy.thresholds.inventory.stockoutRiskDays, 14);
  assert.equal(policy.thresholds.inventory.excessInventoryDays, 30);
  assert.equal(policy.lifecycle.newProductDays, 30);
  assert.equal(policy.lifecycle.growthRevenueThreshold, 0.15);
  assert.equal(policy.lifecycle.declineRevenueThreshold, -0.1);
  assert.equal(policy.portfolioConstraints.SCALE_ADS.maxSkuShare, 0.25);
  assert.equal(policy.portfolioConstraints.PRICE_CHANGE.maxSkuShare, 0.15);
  assert.equal(policy.portfolioConstraints.CLEARANCE.maxSkuShare, 0.1);
});

test("workspace policy override wins over default expert baseline", () => {
  const policy = getOptimizationPolicy({
    workspacePolicy: {
      thresholds: {
        advertising: {
          scaleAds: {
            minimumMarginalRoas: 4.5
          }
        }
      },
      portfolioConstraints: {
        SCALE_ADS: {
          maxSkuShare: 0.1
        }
      }
    }
  });

  assert.equal(policy.source, "workspace_policy");
  assert.equal(policy.thresholds.advertising.scaleAds.minimumMarginalRoas, 4.5);
  assert.equal(policy.portfolioConstraints.SCALE_ADS.maxSkuShare, 0.1);
});

test("policy eligibility rejects scale ads below expert thresholds", () => {
  const policy = getOptimizationPolicy();
  const sku = adsSimulationSku({
    sku: "SKU_POLICY_REJECT_SCALE",
    revenue: 3000,
    ads_spend: 1000,
    margin: 0.25,
    inventory: 300,
    sales_velocity: 8,
    order_period_count: 2,
    prediction_confidence: 0.62
  });
  const eligibility = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy,
    marginalRoas: 2.2,
    confidence: 0.62
  });

  assert.equal(eligibility.allowed, false);
  assert.ok(eligibility.rejectedReasons.includes("ROAS below scale ads threshold."));
  assert.ok(eligibility.rejectedReasons.includes("Margin below scale ads threshold."));
  assert.ok(eligibility.rejectedReasons.includes("Confidence below scale ads threshold."));
});

test("low attribution confidence blocks SCALE_ADS but allows controlled ad test", () => {
  const sku = {
    sku: "SKU_LOW_ATTRIBUTION",
    revenue: 5000,
    quantity: 100,
    price: 50,
    cogs: 1500,
    ads_spend: 500,
    margin: 0.45,
    net_profit: 1800,
    inventory: 500,
    sales_velocity: 5,
    refund_rate: 0.01,
    customer_ltv: 120,
    conversion_rate: 0.04,
    prediction_confidence: 0.8,
    attribution_confidence: 0.45,
    ad_allocation_method: "revenue_share",
    optimization_allowed: true
  };

  const scale = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 100
  });
  const testSpend = evaluateActionEligibility({
    sku,
    action: "TEST_AD_SPEND",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 100
  });

  assert.equal(scale.allowed, false);
  assert.ok(scale.rejectedReasons.includes("Ad attribution confidence below scale ads threshold."));
  assert.equal(testSpend.allowed, true);
});

test("SCALE_ADS eligibility requires margin ROAS confidence inventory coverage and v2 profit", () => {
  const sku = adsSimulationSku({
    sku: "SKU_SCALE_INVARIANT",
    revenue: 10000,
    ads_spend: 500,
    margin: 0.42,
    net_profit: 3200,
    inventory: 900,
    sales_velocity: 12,
    prediction_confidence: 0.82,
    attribution_confidence: 0.82,
    profitability_confidence: 0.9,
    cogs_status: "AVAILABLE",
    optimization_allowed: true
  });

  assert.equal(evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 45,
    marginalRoas: 12,
    confidence: 0.82
  }).allowed, true);

  const lowRoas = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 45,
    marginalRoas: 1.2,
    confidence: 0.82
  });
  assert.equal(lowRoas.allowed, false);
  assert.ok(lowRoas.rejectedReasons.some((reason) => /ROAS below/i.test(reason)));

  const lowMargin = evaluateActionEligibility({
    sku: { ...sku, margin: 0.12 },
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 45,
    marginalRoas: 12,
    confidence: 0.82
  });
  assert.equal(lowMargin.allowed, false);
  assert.ok(lowMargin.rejectedReasons.some((reason) => /Margin below/i.test(reason)));

  const lowCoverage = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 5,
    marginalRoas: 12,
    confidence: 0.82
  });
  assert.equal(lowCoverage.allowed, false);
  assert.ok(lowCoverage.rejectedReasons.some((reason) => /Inventory coverage below/i.test(reason)));
});

test("ROAS anomaly blocks SCALE_ADS eligibility", () => {
  const sku = adsSimulationSku({
    sku: "SKU_ROAS_ANOMALY",
    revenue: 13000,
    ads_spend: 100,
    margin: 0.45,
    net_profit: 5000,
    inventory: 900,
    sales_velocity: 8,
    prediction_confidence: 0.84,
    attribution_confidence: 0.9,
    profitability_confidence: 0.9,
    cogs_status: "AVAILABLE",
    optimization_allowed: true
  });

  const eligibility = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 90,
    marginalRoas: 130,
    confidence: 0.84
  });

  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.metrics.roasConfidence, "LOW");
  assert.ok(eligibility.rejectedReasons.includes("ROAS anomaly requires attribution validation."));
});

test("RESTOCK_AND_SCALE eligibility requires low inventory coverage and positive sales velocity", () => {
  const sku = adsSimulationSku({
    sku: "SKU_RESTOCK_INVARIANT",
    margin: 0.38,
    net_profit: 1800,
    inventory: 12,
    sales_velocity: 4,
    sales_velocity_confidence: "HIGH",
    prediction_confidence: 0.78
  });

  assert.equal(evaluateActionEligibility({
    sku,
    action: "RESTOCK_AND_SCALE",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 3
  }).allowed, true);

  const enoughCoverage = evaluateActionEligibility({
    sku,
    action: "RESTOCK_AND_SCALE",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 45
  });
  assert.equal(enoughCoverage.allowed, false);
  assert.ok(enoughCoverage.rejectedReasons.some((reason) => /coverage does not indicate/i.test(reason)));

  const noVelocity = evaluateActionEligibility({
    sku: { ...sku, sales_velocity: 0 },
    action: "RESTOCK_AND_SCALE",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 3
  });
  assert.equal(noVelocity.allowed, false);
  assert.ok(noVelocity.rejectedReasons.some((reason) => /Sales velocity does not support/i.test(reason)));

  const lowVelocityConfidence = evaluateActionEligibility({
    sku: { ...sku, sales_velocity_confidence: "LOW" },
    action: "RESTOCK_AND_SCALE",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 3
  });
  assert.equal(lowVelocityConfidence.allowed, false);
  assert.ok(lowVelocityConfidence.rejectedReasons.some((reason) => /confidence too low/i.test(reason)));
});

test("REDUCE_INVENTORY eligibility requires reliable sales velocity confidence", () => {
  const sku = adsSimulationSku({
    sku: "SKU_CLEAR_CONFIDENCE",
    margin: 0.18,
    net_profit: 400,
    inventory: 900,
    sales_velocity: 2,
    sales_velocity_confidence: "LOW",
    prediction_confidence: 0.72
  });

  const lowVelocityConfidence = evaluateActionEligibility({
    sku,
    action: "REDUCE_INVENTORY",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 450,
    clearInventoryEligible: true
  });
  assert.equal(lowVelocityConfidence.allowed, false);
  assert.ok(lowVelocityConfidence.rejectedReasons.some((reason) => /confidence too low for inventory reduction/i.test(reason)));

  const highVelocityConfidence = evaluateActionEligibility({
    sku: { ...sku, sales_velocity_confidence: "HIGH" },
    action: "REDUCE_INVENTORY",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 450,
    clearInventoryEligible: true
  });
  assert.equal(highVelocityConfidence.allowed, true);
});

test("inventory action generator suppresses restock and reduction when velocity confidence is low", () => {
  const restockSku = adsSimulationSku({
    sku: "SKU_LOW_CONF_RESTOCK",
    inventory: 4,
    sales_velocity: 4,
    sales_velocity_confidence: "LOW",
    margin: 0.45,
    net_profit: 1200
  });
  const reduceSku = adsSimulationSku({
    sku: "SKU_LOW_CONF_REDUCE",
    inventory: 1200,
    sales_velocity: 2,
    sales_velocity_confidence: "LOW",
    margin: 0.16,
    net_profit: 300
  });

  const actions = generateOptimizationActions({
    skus: [restockSku, reduceSku],
    opportunities: [unitOpportunity(restockSku, "INVENTORY"), unitOpportunity(reduceSku, "INVENTORY")]
  });

  assert.equal(actions.some((action) => action.portfolio_action === "RESTOCK_AND_SCALE"), false);
  assert.equal(actions.some((action) => action.portfolio_action === "REDUCE_INVENTORY"), false);
});

test("ad scale simulation uses canonical v2 SKU net profit as current profit baseline", () => {
  const sku = adsSimulationSku({
    sku: "SKU_V2_PROFIT_BASELINE",
    revenue: 16267.4,
    cogs: 5,
    ads_spend: 1520.59,
    margin: 0.8,
    net_profit: 8000,
    inventory: 5000,
    conversion_rate: 0.08,
    refund_rate: 0.01,
    prediction_confidence: 0.95,
    attribution_confidence: 0.95,
    shipping_cost: 0,
    fulfillment_cost: 0,
    fees: 0,
    profitabilityEngineVersion: "v2"
  });
  const [result] = simulateGeneratedActions({
    skus: [sku],
    ads: [{ campaign_id: "CMP_V2", sku: sku.sku, spend: sku.ads_spend, roas: 20, attribution_confidence: 0.95 }],
    actions: [adsSimulationAction(sku.sku, 50, "SCALE_ADS")],
    simulationHorizonDays: 30
  });

  assert.equal(result.current_profit, sku.net_profit);
  assert.equal(result.before_state.profit, sku.net_profit);
  assert.equal(result.predicted_profit, roundCurrency(sku.net_profit + result.profit_delta));
  assert.ok(result.simulation_estimate.profit_simulation.expected_profit_impact > 0);
});

test("HOLD simulation is a no-op baseline and contributes no profit lift", () => {
  const sku = adsSimulationSku({
    sku: "SKU_HOLD_BASELINE",
    revenue: 10000,
    ads_spend: 800,
    margin: 0.4,
    net_profit: 3000,
    inventory: 500,
    sales_velocity: 8
  });
  const [result] = simulateGeneratedActions({
    skus: [sku],
    ads: [],
    actions: [adsSimulationAction(sku.sku, 0, "HOLD")],
    simulationHorizonDays: 30
  });

  assert.equal(result.action, "HOLD");
  assert.equal(result.current_profit, sku.net_profit);
  assert.equal(result.predicted_profit, sku.net_profit);
  assert.equal(result.profit_delta, 0);
  assert.equal(result.revenue_delta, 0);
  assert.equal(result.inventory_impact, 0);
  assert.equal(result.cost_delta, 0);
});

test("portfolio solver enforces hard SCALE_ADS cap from policy", () => {
  const policy = getOptimizationPolicy({
    workspacePolicy: {
      portfolioConstraints: {
        SCALE_ADS: {
          maxSkuShare: 0.25
        }
      }
    }
  });
  const skus = Array.from({ length: 8 }, (_, index) => `SKU_CAP_${index + 1}`);
  const bySku = new Map(skus.map((sku, index) => [
    sku,
    [
      fakeSimulationRow(sku, "SCALE_ADS", 500 - index),
      fakeSimulationRow(sku, "HOLD", 0)
    ]
  ]));
  const selected = solveGlobalPortfolio(bySku, {
    skus: skus.map((sku) => ({ sku })),
    constraints: {
      total_ads_budget: 10000,
      inventory_capacity: 10000,
      target_margin: 0,
      max_price_change: 0.1,
      minimum_profit: -1000,
      minimum_confidence: 0
    }
  }, policy);
  const scaleCount = selected.rows.filter((row) => row.action === "SCALE_ADS").length;

  assert.equal(scaleCount, 2);
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
    cac_confidence: "MEDIUM",
    customer_metric_confidence: "MEDIUM",
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
        order_period_count: 2,
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
        order_period_count: 2,
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
        order_period_count: 2,
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
        order_period_count: 2,
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

test("single-period dataset cannot generate growth or declining lifecycle", () => {
  const sku = adsSimulationSku({
    sku: "SKU_SINGLE_PERIOD",
    order_period_count: 1,
    product_age_days: 120,
    revenue_growth: 0.42,
    order_growth: 0.3,
    ads_spend: 300,
    net_profit: 500,
    margin: 0.32,
    quantity: 18,
    prediction_confidence: 0.5
  });
  const [classification] = classifySkuLifecycles({
    skus: [sku],
    ads: [{ campaign_id: "CMP_SINGLE", sku: sku.sku, spend: 300, impressions: 5000, clicks: 300, conversions: 30, roas: 4.5 }]
  });

  assert.notEqual(classification.lifecycle_stage, "GROWTH");
  assert.notEqual(classification.lifecycle_stage, "DECLINING");
  assert.equal(classification.lifecycle_stage, "UNKNOWN");
  assert.equal(classification.lifecycle_confidence, "LOW");
  assert.equal(classification.reason, "Insufficient historical periods");
});

test("low confidence lifecycle does not drive optimizer actions", () => {
  const sku = adsSimulationSku({
    sku: "SKU_LOW_LIFECYCLE_SIGNAL",
    revenue: 5000,
    ads_spend: 600,
    margin: 0.46,
    net_profit: 1600,
    inventory: 500,
    sales_velocity: 6,
    sales_velocity_confidence: "HIGH",
    prediction_confidence: 0.82,
    attribution_confidence: 0.88
  });
  const lifecycleBySku = new Map([[sku.sku, {
    sku: sku.sku,
    lifecycle_stage: "DECLINING",
    lifecycle_confidence: "LOW",
    confidence: 0.35,
    reason: "Insufficient historical periods",
    signals: ["insufficient_history"],
    scores: {}
  }]]);
  const actions = generateOptimizationActions({
    skus: [sku],
    opportunities: [unitOpportunity(sku, "GROWTH")],
    lifecycleBySku
  });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.equal(actionSet.includes("REDUCE_ADS"), false);
  assert.equal(actionSet.includes("STOP"), false);
  assert.equal(actions.some((action) => action.lifecycle_stage === "DECLINING"), false);
});

test("unknown lifecycle can still create controlled experimental opportunities", () => {
  const sku = adsSimulationSku({
    sku: "SKU_UNKNOWN_LIFECYCLE_TEST",
    order_period_count: 1,
    revenue: 7200,
    ads_spend: 120,
    margin: 0.44,
    net_profit: 2200,
    inventory: 900,
    sales_velocity: 6,
    sales_velocity_confidence: "LOW",
    prediction_confidence: 0.58,
    attribution_confidence: 0.42,
    cac_confidence: "LOW",
    customer_metric_confidence: "LOW"
  });
  const lifecycleBySku = new Map([[sku.sku, {
    sku: sku.sku,
    lifecycle_stage: "UNKNOWN",
    lifecycle_confidence: "LOW",
    confidence: 0.35,
    reason: "Insufficient historical periods",
    signals: ["single_order_period", "insufficient_history_for_trend"],
    scores: {}
  }]]);
  const actions = generateOptimizationActions({
    skus: [sku],
    opportunities: [unitOpportunity(sku, "PORTFOLIO")],
    lifecycleBySku
  });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.ok(actionSet.includes("TEST_AD_SPEND"));
  assert.equal(actionSet.includes("SCALE_ADS"), false);
  assert.equal(actions.some((action) => action.lifecycle_stage === "UNKNOWN"), false);
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
  assert.ok(bySku("SKU_MATURE").includes("SHIFT_CHANNEL") || bySku("SKU_MATURE").includes("REDUCE_ADS"));
  assert.ok(bySku("SKU_DECLINING").includes("REDUCE_ADS") || bySku("SKU_DECLINING").includes("STOP"));
  assert.equal(bySku("SKU_DECLINING").includes("SCALE_ADS"), false);
});

function matureLifecycle(stage = "MATURE") {
  return {
    sku: "SKU_PRICE_TEST",
    lifecycle_stage: stage,
    confidence: 0.86,
    signals: [`stage=${stage}`],
    scores: {}
  };
}

function unitOpportunity(sku, type = "PROFIT") {
  return {
    sku: sku.sku,
    opportunity_type: type,
    opportunity_types: [type, "MARGIN_IMPROVEMENT"],
    opportunity_score: 80,
    score_components: {
      demand_growth: 0.6,
      customer_quality: 0.6,
      channel_fit: 0.6,
      margin_headroom: 0.6,
      inventory_capacity: 0.6,
      competition_risk: 0.1
    },
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
    feasibility: 0.86
  };
}

function priceTestInput(sku) {
  return {
    skus: [sku],
    ads: [],
    business_objective: "PROFIT",
    industry: "fashion ecommerce",
    constraints: {
      total_ads_budget: 1000,
      inventory_capacity: 5000,
      available_cash: 5000,
      target_margin: 0.05,
      max_price_change: 0.12,
      minimum_profit: -1000,
      minimum_confidence: 0.3,
      simulation_horizon_days: 30
    }
  };
}

function fakeSimulationRow(sku, action, profitDelta, overrides = {}) {
  const inventory = overrides.inventory ?? 120;
  const requiredInventory = overrides.requiredInventory ?? 95;
  const price = overrides.price ?? 50;
  const margin = overrides.margin ?? 0.35;

  return {
    sku,
    category: "test",
    channel: "shopify",
    action,
    unified_action: action === "REDUCE_INVENTORY" ? "REDUCE_INVENTORY" : action === "SCALE_ADS" ? "SCALE_ADS" : action === "SHIFT_CHANNEL" ? "EXPAND_CHANNEL" : action === "REDUCE_ADS" ? "REALLOCATE_BUDGET" : "OPTIMIZE_PRICE",
    lifecycle_stage: "MATURE",
    predicted_profit: 1000 + profitDelta,
    profit_delta: profitDelta,
    confidence: 0.8,
    risk: 0.1,
    action_score: profitDelta,
    opportunity_score: profitDelta,
    required_inventory: requiredInventory,
    current_inventory: inventory,
    current_price: price,
    recommended_ads_spend: 0,
    current_ads_spend: 0,
    required_cash: 0,
    inventory_impact: action === "REDUCE_INVENTORY" ? -Math.round(inventory * 0.15) : requiredInventory - inventory,
    simulation_horizon: { days: 30, label: "30 days" },
    before_state: {
      revenue: 5000,
      profit: 1000,
      ad_spend: 0,
      price,
      inventory,
      margin
    }
  };
}

test("mature SKU at market average does not generate PRICE_UP", () => {
  const sku = adsSimulationSku({
    sku: "SKU_PRICE_MARKET_AVG",
    product_age_days: 260,
    price: 50,
    competitor_price: 50,
    market_median_price: 50,
    similar_sku_price: 50,
    price_elasticity: -0.6,
    revenue_growth: 0.06,
    order_growth: 0.04,
    conversion_trend: 0.01,
    inventory: 200,
    sales_velocity: 8,
    conversion_rate: 0.04,
    margin: 0.42
  });
  const lifecycleBySku = new Map([[sku.sku, { ...matureLifecycle("MATURE"), sku: sku.sku }]]);
  const thresholdProfile = buildDynamicThresholdProfile(priceTestInput(sku));
  const actions = generateOptimizationActions({ skus: [sku], opportunities: [unitOpportunity(sku, "PRICING")], lifecycleBySku, thresholdProfile });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.equal(actionSet.includes("PRICE_UP_5"), false);
  assert.equal(actionSet.includes("PRICE_UP_10"), false);
});

test("mature underpriced SKU with stable demand allows PRICE_UP", () => {
  const sku = adsSimulationSku({
    sku: "SKU_UNDERPRICED",
    product_age_days: 260,
    price: 48,
    competitor_price: 60,
    market_median_price: 60,
    similar_sku_price: 58,
    price_elasticity: -0.55,
    revenue_growth: 0.08,
    order_growth: 0.05,
    conversion_trend: 0.01,
    inventory: 200,
    sales_velocity: 8,
    conversion_rate: 0.045,
    margin: 0.42
  });
  const lifecycleBySku = new Map([[sku.sku, { ...matureLifecycle("MATURE"), sku: sku.sku }]]);
  const thresholdProfile = buildDynamicThresholdProfile(priceTestInput(sku));
  const actions = generateOptimizationActions({ skus: [sku], opportunities: [unitOpportunity(sku, "PRICING")], lifecycleBySku, thresholdProfile });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.ok(actionSet.includes("PRICE_UP_5") || actionSet.includes("PRICE_UP_10"));
});

test("high inventory SKU prioritizes clearance over PRICE_UP", () => {
  const sku = adsSimulationSku({
    sku: "SKU_HIGH_INVENTORY",
    product_age_days: 260,
    price: 48,
    competitor_price: 64,
    market_median_price: 64,
    similar_sku_price: 62,
    price_elasticity: -0.55,
    revenue_growth: 0.03,
    order_growth: 0.02,
    conversion_trend: 0,
    inventory: 720,
    sales_velocity: 4,
    conversion_rate: 0.04,
    margin: 0.42
  });
  const lifecycleBySku = new Map([[sku.sku, { ...matureLifecycle("MATURE"), sku: sku.sku }]]);
  const thresholdProfile = buildDynamicThresholdProfile(priceTestInput(sku));
  const actions = generateOptimizationActions({ skus: [sku], opportunities: [unitOpportunity(sku, "INVENTORY")], lifecycleBySku, thresholdProfile });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.equal(actionSet.includes("PRICE_UP_5"), false);
  assert.equal(actionSet.includes("PRICE_UP_10"), false);
  assert.ok(actionSet.includes("PROMOTION_TEST") || actionSet.includes("REDUCE_INVENTORY"));
});

test("healthy portfolio flags excess clear inventory mix above dynamic limit", () => {
  const rows = [
    fakeSimulationRow("SKU_CLEAR_A", "REDUCE_INVENTORY", 120),
    fakeSimulationRow("SKU_CLEAR_B", "REDUCE_INVENTORY", 110),
    fakeSimulationRow("SKU_SCALE_A", "SCALE_ADS", 180),
    fakeSimulationRow("SKU_SCALE_B", "SHIFT_CHANNEL", 160),
    fakeSimulationRow("SKU_SCALE_C", "PRICE_DOWN_10", 130),
    fakeSimulationRow("SKU_SCALE_D", "REDUCE_ADS", 100)
  ];
  const mix = assessSelectedInventoryMix(rows);

  assert.equal(mix.inventory_risk_level, "LOW");
  assert.ok(mix.clear_inventory_ratio > mix.max_clear_inventory_ratio);
});

test("portfolio inventory crisis allows high clear inventory allocation", () => {
  const rows = [
    fakeSimulationRow("SKU_CLEAR_A", "REDUCE_INVENTORY", 120, { inventory: 1600, requiredInventory: 80 }),
    fakeSimulationRow("SKU_CLEAR_B", "REDUCE_INVENTORY", 110, { inventory: 1500, requiredInventory: 75 }),
    fakeSimulationRow("SKU_CLEAR_C", "REDUCE_INVENTORY", 100, { inventory: 1450, requiredInventory: 70 }),
    fakeSimulationRow("SKU_CLEAR_D", "REDUCE_INVENTORY", 95, { inventory: 1400, requiredInventory: 65 }),
    fakeSimulationRow("SKU_CLEAR_E", "REDUCE_INVENTORY", 90, { inventory: 1350, requiredInventory: 60 }),
    fakeSimulationRow("SKU_SCALE_A", "REDUCE_ADS", 80, { inventory: 1200, requiredInventory: 90 }),
    fakeSimulationRow("SKU_SCALE_B", "PRICE_DOWN_10", 90, { inventory: 1150, requiredInventory: 85 }),
    fakeSimulationRow("SKU_SCALE_C", "SHIFT_CHANNEL", 70, { inventory: 1250, requiredInventory: 95 }),
    fakeSimulationRow("SKU_SCALE_D", "SCALE_ADS", 60, { inventory: 1100, requiredInventory: 80 })
  ];
  const mix = assessSelectedInventoryMix(rows);

  assert.equal(mix.inventory_risk_level, "HIGH");
  assert.ok(mix.max_clear_inventory_ratio >= 0.5);
  assert.ok(mix.clear_inventory_ratio <= mix.max_clear_inventory_ratio);
});

test("single high inventory SKU with strong demand does not qualify for clear inventory", () => {
  const sku = adsSimulationSku({
    sku: "SKU_HIGH_INVENTORY_STRONG_DEMAND",
    inventory: 700,
    sales_velocity: 8,
    revenue_growth: 0.28,
    order_growth: 0.24,
    conversion_trend: 0.04,
    margin: 0.42,
    cogs: 18
  });
  const quality = clearInventoryQualityScore(sku, buildDynamicThresholdProfile(priceTestInput(sku)));

  assert.equal(quality.eligible, false);
});

test("low velocity high inventory SKU qualifies for clear excess inventory", () => {
  const sku = adsSimulationSku({
    sku: "SKU_LOW_VELOCITY_HIGH_INVENTORY",
    inventory: 900,
    sales_velocity: 3,
    sales_velocity_confidence: "HIGH",
    revenue_growth: -0.08,
    order_growth: -0.06,
    conversion_trend: -0.02,
    margin: 0.35,
    cogs: 14
  });
  const thresholdProfile = buildDynamicThresholdProfile(priceTestInput(sku));
  const lifecycleBySku = new Map([[sku.sku, { ...matureLifecycle("DECLINING"), sku: sku.sku }]]);
  const actions = generateOptimizationActions({ skus: [sku], opportunities: [unitOpportunity(sku, "INVENTORY")], lifecycleBySku, thresholdProfile });

  assert.equal(clearInventoryQualityScore(sku, thresholdProfile).eligible, true);
  assert.ok(actions.some((action) => action.portfolio_action === "REDUCE_INVENTORY"));
});

test("declining low conversion SKU routes to PRICE_DOWN or EXIT, not PRICE_UP", () => {
  const sku = adsSimulationSku({
    sku: "SKU_DECLINING_PRICE",
    product_age_days: 260,
    price: 50,
    competitor_price: 60,
    market_median_price: 60,
    price_elasticity: -1.4,
    revenue_growth: -0.18,
    order_growth: -0.15,
    conversion_trend: -0.08,
    conversion_rate: 0.006,
    inventory: 600,
    sales_velocity: 3,
    margin: 0.08,
    net_profit: -240,
    ads_spend: 500
  });
  const lifecycleBySku = new Map([[sku.sku, { ...matureLifecycle("DECLINING"), sku: sku.sku }]]);
  const thresholdProfile = buildDynamicThresholdProfile(priceTestInput(sku));
  const actions = generateOptimizationActions({ skus: [sku], opportunities: [unitOpportunity(sku, "PORTFOLIO")], lifecycleBySku, thresholdProfile });
  const actionSet = actions.map((action) => action.portfolio_action);

  assert.equal(actionSet.includes("PRICE_UP_5"), false);
  assert.equal(actionSet.includes("PRICE_UP_10"), false);
  assert.ok(actionSet.includes("PRICE_DOWN_10") || actionSet.includes("STOP"));
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
