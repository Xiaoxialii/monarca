import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
const { computeCanonicalEcommerceMetrics } = jiti("./lib/metrics/canonical-ecommerce-metric-engine.ts");
const { buildDecisionIntelligenceReportV1 } = jiti("./lib/decision-intelligence/decision-intelligence-engine.ts");
const { buildSkuOptimizationAlgorithm } = jiti("./lib/sku/sku-optimization-engine.ts");

function metricOutput() {
  return computeCanonicalEcommerceMetrics({
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100, order_date: "2026-06-01", customer_id: "C1", ad_id: "A1", campaign_id: "CMP1" },
        { order_id: "2", revenue: 200, order_date: "2026-06-02", customer_id: "C1", ad_id: "A2", campaign_id: "CMP1" }
      ],
      ecommerce_order_items: [
        { order_id: "1", sku: "SKU-A", product_id: "P1", price: 50, quantity: 2, cogs: 60, ad_id: "A1", campaign_id: "CMP1" },
        { order_id: "2", sku: "SKU-B", product_id: "P2", price: 100, quantity: 2, cogs: 120, ad_id: "A2", campaign_id: "CMP1" }
      ],
      ecommerce_products: [
        { product_id: "P1", product_name: "Product A", sku: "SKU-A" },
        { product_id: "P2", product_name: "Product B", sku: "SKU-B" }
      ],
      ecommerce_customers: [{ customer_id: "C1", total_spent: 300 }],
      ecommerce_refunds: [],
      ecommerce_ads: [{ ad_id: "A1", campaign_id: "CMP1", spend: 30, impressions: 1000, clicks: 100, conversions: 2 }]
    },
    metadata: {
      source_platforms: ["shopify"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 8, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  });
}

test("decision intelligence report v1 converts metric output into report sections", () => {
  const metrics = metricOutput();
  const report = buildDecisionIntelligenceReportV1(metrics);

  assert.equal(report.metadata.report_version, "decision_intelligence_v1");
  assert.equal(report.metadata.input, "metric_engine_output_only");
  assert.equal(report.metadata.analysis_only, true);
  assert.equal(report.executive_summary.revenue, 300);
  assert.equal(report.performance_overview.orders, 2);
  assert.equal(report.sku_breakdown.top_revenue_skus[0].sku, "SKU-B");
  assert.equal(report.ads_breakdown.campaign_performance[0].campaign_id, "CMP1");
  assert.equal(report.customer_breakdown.customer_count, 1);
  assert.equal(report.customer_breakdown.median_ltv, 300);
  assert.equal(report.customer_breakdown.revenue_per_customer_segment[0].segment, "Top 1%");
  assert.equal(report.customer_breakdown.cohort_by_first_purchase_month[0].cohort_month, "2026-06");
  assert.ok(Array.isArray(report.profit_control_insights));
  assert.ok(report.profit_control_insights.length > 0);
  assert.equal(typeof report.profit_control_insights[0].insight_id, "string");
  assert.ok(Array.isArray(report.profit_control_insights[0].root_causes));
  assert.ok(Array.isArray(report.profit_control_insights[0].causal_chain));
  assert.ok(Array.isArray(report.profit_control_insights[0].decision_signals));
  assert.ok(Array.isArray(report.sku_classification_signals));
  assert.equal(report.decision_intelligence_v2.version, "decision_intelligence_v2");
  assert.ok(Array.isArray(report.decision_intelligence_v2.counterfactual_scenarios));
  assert.ok(Array.isArray(report.decision_intelligence_v2.action_rankings));
  assert.ok(Array.isArray(report.decision_intelligence_v2.profit_driver_decomposition));
  assert.equal(report.decision_intelligence_v2.learning_feedback_loop.status, "ready_for_tracking");
  assert.equal(report.autonomous_commerce_runtime.version, "autonomous_commerce_runtime_v1");
  assert.equal(report.autonomous_commerce_runtime.mode, "dry_run");
  assert.equal(report.autonomous_commerce_runtime.external_write_enabled, false);
  assert.equal(report.autonomous_commerce_runtime.requires_human_approval, true);
  assert.ok(Array.isArray(report.autonomous_commerce_runtime.modules.sku_optimization.actions));
  assert.ok(Array.isArray(report.autonomous_commerce_runtime.modules.ads_optimization.actions));
  assert.ok(Array.isArray(report.autonomous_commerce_runtime.modules.pricing_optimization.actions));
  assert.ok(Array.isArray(report.autonomous_commerce_runtime.modules.inventory_optimization.actions));
  assert.ok(Array.isArray(report.autonomous_commerce_runtime.execution_queue));
  assert.ok(report.autonomous_commerce_runtime.execution_queue.every((action) => action.guardrails.includes("no_external_write")));
  assert.equal(report.sku_optimization_algorithm.version, "sku_profit_maximization_v1");
  assert.equal(report.sku_optimization_algorithm.objective, "maximize_total_profit");
  assert.ok(Array.isArray(report.sku_optimization_algorithm.input_rows));
  assert.ok(Array.isArray(report.sku_optimization_algorithm.ranked_skus));
  assert.ok(Array.isArray(report.sku_optimization_algorithm.budget_allocation));
  assert.ok(report.sku_portfolio_optimization.optimization_summary.scenarios_tested > 0);
  assert.notEqual(report.sku_portfolio_optimization.optimization_summary.constraints_applied.includes("optimization_deferred_until_user_start"), true);
  assert.ok(report.sku_portfolio_optimization.optimization_confidence > 0);
  assert.ok(Array.isArray(report.sku_portfolio_optimization.assumptions));
  assert.equal(report.growth_overview.daily.length, 2);
  assert.ok(report.data_quality.estimated_metrics.includes("refund_rate"));
  assert.match(report.insight_summary, /Revenue is/);
});

test("decision intelligence source stays metric-output only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/decision-intelligence/decision-intelligence-engine.ts"), "utf8");

  assert.doesNotMatch(source, /GraphQL|Admin API|access_token|fetch\s*\(/i);
  assert.match(source, /CanonicalEcommerceMetricOutput/);
  assert.match(source, /buildDecisionIntelligenceV2/);
  assert.match(source, /buildAutonomousCommerceRuntime/);
  assert.match(source, /buildSkuOptimizationAlgorithm/);
});

test("counterfactual engine exists and exposes v2 primitives", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/insight/counterfactual-engine.ts"), "utf8");

  assert.match(source, /CounterfactualScenario/);
  assert.match(source, /ActionRanking/);
  assert.match(source, /ProfitDriverDecomposition/);
  assert.match(source, /LearningFeedbackLoop/);
  assert.match(source, /buildDecisionIntelligenceV2/);
});

test("autonomous commerce runtime exposes execution modules without external writes", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/runtime/autonomous-commerce-runtime.ts"), "utf8");

  assert.match(source, /sku_optimization/);
  assert.match(source, /ads_optimization/);
  assert.match(source, /pricing_optimization/);
  assert.match(source, /inventory_optimization/);
  assert.match(source, /external_write_enabled: false/);
  assert.match(source, /requires_human_approval: true/);
  assert.doesNotMatch(source, /fetch\s*\(|GraphQL|access_token|Admin API/i);
});

test("SKU optimization algorithm ranks SKU actions and allocates constrained budget", () => {
  const result = buildSkuOptimizationAlgorithm({
    total_ad_budget: 300,
    rows: [
      { sku: "SCALE", revenue: 1000, quantity: 100, price: 10, cogs: 400, ads_spend: 100, inventory: 500, sales_velocity: 10, margin: 0.5 },
      { sku: "STOP", revenue: 400, quantity: 40, price: 10, cogs: 300, ads_spend: 180, inventory: 200, sales_velocity: 4, margin: -0.2 },
      { sku: "PRICE", revenue: 500, quantity: 50, price: 10, cogs: 460, ads_spend: 20, inventory: 120, sales_velocity: 6, margin: 0.04 },
      { sku: "RESTOCK", revenue: 800, quantity: 80, price: 10, cogs: 360, ads_spend: 80, inventory: 20, sales_velocity: 8, margin: 0.45 }
    ]
  });

  assert.equal(result.version, "sku_profit_maximization_v1");
  assert.equal(result.objective, "maximize_total_profit");
  assert.ok(result.scale_ads_skus.some((row) => row.sku === "SCALE"));
  assert.ok(result.reduce_or_stop_ads_skus.some((row) => row.sku === "STOP"));
  assert.ok(result.raise_price_skus.some((row) => row.sku === "PRICE"));
  assert.ok(result.replenish_inventory_skus.some((row) => row.sku === "RESTOCK"));
  assert.ok(result.budget_allocation.length > 0);
  assert.ok(result.budget_allocation.reduce((sum, row) => sum + row.allocated_budget, 0) <= 300);
  assert.ok(result.expected_portfolio_profit > 0);
});
