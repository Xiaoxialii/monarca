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

function canonicalDataset({ platform = "shopify", orders = [], items = [], products = [], customers = [], refunds = [], ads = [] }) {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: orders,
      ecommerce_order_items: items,
      ecommerce_products: products,
      ecommerce_customers: customers,
      ecommerce_refunds: refunds,
      ecommerce_ads: ads
    },
    metadata: {
      source_platforms: [platform],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: orders.length + items.length + products.length + customers.length + refunds.length + ads.length,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0.93
    }
  };
}

test("metric engine computes Shopify canonical ecommerce metrics", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "shopify",
    orders: [
      { order_id: "S-1", revenue: 120, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
      { order_id: "S-2", revenue: 80, order_date: "2026-06-02", currency: "USD", platform: "shopify" }
    ],
    items: [
      { order_id: "S-1", product_id: "P-1", sku: "SKU-1", quantity: 2, price: 50, platform: "shopify" },
      { order_id: "S-1", product_id: "P-2", sku: "SKU-2", quantity: 1, price: 20, platform: "shopify" },
      { order_id: "S-2", product_id: "P-1", sku: "SKU-1", quantity: 1, price: 80, platform: "shopify" }
    ],
    products: [
      { product_id: "P-1", product_name: "Core Product", sku: "SKU-1", price: 50, platform: "shopify" },
      { product_id: "P-2", product_name: "Addon", sku: "SKU-2", price: 20, platform: "shopify" }
    ],
    customers: [
      { customer_id: "C-1", email_hash: "hash", country: "US", platform: "shopify" }
    ],
    refunds: [
      { refund_id: "R-1", order_id: "S-1", amount: 20, reason: "customer_return", platform: "shopify" }
    ]
  }));

  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.aov, 100);
  assert.equal(result.metrics.refund_rate, 0.1);
  assert.equal(result.metrics.core.revenue, 200);
  assert.equal(result.metrics.core.orders, 2);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue]), [["SKU-1", 180], ["SKU-2", 20]]);
  assert.equal(result.metrics.product_performance[0].product_id, "P-1");
  assert.equal(result.metadata.audit.canonical_input_only, true);
});

test("growth os metric layers compute profit customer growth and ads metrics", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "canonical-growth",
    orders: [
      { order_id: "O-1", customer_id: "C-1", revenue: 100, order_date: "2026-06-01", shipping_cost: 5 },
      { order_id: "O-2", customer_id: "C-1", revenue: 200, order_date: "2026-06-02", shipping_cost: 5 },
      { order_id: "O-3", customer_id: "C-2", revenue: 300, order_date: "2026-06-02", shipping_cost: 10 }
    ],
    items: [
      { order_id: "O-1", product_id: "P-1", sku: "SKU-A", quantity: 2, price: 50, unit_cost: 20 },
      { order_id: "O-2", product_id: "P-2", sku: "SKU-B", quantity: 2, price: 100, unit_cost: 40 },
      { order_id: "O-3", product_id: "P-3", sku: "SKU-C", quantity: 1, price: 300, unit_cost: 120 }
    ],
    products: [
      { product_id: "P-1", product_name: "One", sku: "SKU-A" },
      { product_id: "P-2", product_name: "Two", sku: "SKU-B" },
      { product_id: "P-3", product_name: "Three", sku: "SKU-C" }
    ],
    customers: [
      { customer_id: "C-1", total_orders: 2, total_spent: 300 },
      { customer_id: "C-2", total_orders: 1, total_spent: 300 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 150, impressions: 1000, clicks: 100, conversions: 3 }
    ],
    refunds: [
      { refund_id: "RF-1", order_id: "O-2", amount: 30 }
    ]
  }));

  assert.equal(result.metrics.core.revenue, 600);
  assert.equal(result.metrics.business.cogs, 240);
  assert.equal(result.metrics.business.gross_profit, 360);
  assert.equal(result.metrics.business.net_profit, 124.6);
  assert.equal(result.metrics.business.margin, 0.2077);
  assert.equal(result.metrics.business.refund_amount, 30);
  assert.equal(result.metrics.business.platform_fee, 18);
  assert.equal(result.metrics.business.payment_fee, 17.4);
  assert.equal(result.metrics.business.sku_unit_economics.length, 3);
  assert.equal(result.metrics.business.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.net_profit) * 100) / 100, 0), 124.6);
  assert.ok(result.metrics.business.profit_confidence < 1);
  assert.equal(result.metrics.growth.growth_window_days, 7);
  assert.equal(result.metrics.growth.revenue_growth_rate, 0);
  assert.equal(result.metrics.growth.order_growth_rate, 0);
  assert.equal(result.metrics.growth.sku_growth_rate, 0);
  assert.deepEqual(result.metrics.growth.daily.map((row) => [row.period, row.revenue, row.orders]), [
    ["2026-06-01", 100, 1],
    ["2026-06-02", 500, 2]
  ]);
  assert.equal(result.metrics.customer.ltv, 300);
  assert.equal(result.metrics.customer.customer_revenue_ltv, 300);
  assert.ok(result.metrics.customer.customer_profit_ltv > 0);
  assert.ok(Number.isFinite(result.metrics.customer.customer_contribution_ltv));
  assert.equal(result.metrics.customer.avg_order_value_per_customer, 300);
  assert.equal(result.metrics.customer.repeat_purchase_rate, 0.5);
  assert.equal(result.metrics.customer.customer_count, 2);
  assert.equal(result.metrics.customer.new_vs_returning_ratio, 0.5);
  assert.equal(result.metrics.customer.acquisition_cost, 150);
  assert.equal(result.metrics.customer.median_ltv, 300);
  assert.equal(result.metrics.customer.p90_ltv, 300);
  assert.equal(result.metrics.customer.top_10_percent_revenue_share, 0.5);
  assert.equal(result.metrics.customer.top_1_percent_revenue_share, 0.5);
  assert.equal(result.metrics.customer.active_customers, 2);
  assert.equal(result.metrics.customer.inactive_customers, 0);
  assert.equal(result.metrics.customer.avg_orders_per_customer, 1.5);
  assert.equal(result.metrics.customer.purchase_frequency, 1.5);
  assert.equal(result.metrics.customer.new_customers, 1);
  assert.equal(result.metrics.customer.dormant_customers, 0);
  assert.equal(result.metrics.customer.churned_customers, 0);
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 1.5);
  assert.equal(result.metrics.customer.cohort_by_first_purchase_month[0].cohort_month, "2026-06");
  assert.equal(result.metrics.customer.cohort_by_first_purchase_month[0].retention_7d, 0.5);
  assert.equal(result.metrics.customer.cohort_retention_30d, 0.5);
  assert.equal(result.metrics.customer.revenue_per_customer_segment[0].segment, "Top 1%");
  assert.equal(result.metrics.customer.ltv_cac_ratio, 2);
  assert.equal(result.metrics.customer.payback_period_days, 0.75);
  assert.equal(result.metrics.ads.roas, 4);
  assert.equal(result.metrics.ads.cac, 150);
  assert.equal(result.metrics.ads.cpa, 50);
  assert.equal(result.metrics.ads.mer, 4);
  assert.equal(result.metadata.audit.canonical_input_only, true);
});

test("metric engine validation fixture is mathematically correct and deterministic", () => {
  const input = {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100 },
        { order_id: "2", revenue: 200 }
      ],
      ecommerce_order_items: [
        { order_id: "1", sku: "A", price: 50, quantity: 2 },
        { order_id: "2", sku: "B", price: 100, quantity: 2 }
      ],
      ecommerce_products: [
        { product_id: "p1", product_name: "Item A" }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: [
        { refund_id: "r1", order_id: "1", amount: 10 }
      ],
      ecommerce_ads: []
    },
    metadata: {
      source_platforms: ["canonical-fixture"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: 6,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 1
    }
  };

  const runs = [
    computeCanonicalEcommerceMetrics(input),
    computeCanonicalEcommerceMetrics(input),
    computeCanonicalEcommerceMetrics(input)
  ];
  const skuRevenue = Object.fromEntries(runs[0].metrics.sku_revenue.map((row) => [row.sku, row.revenue]));

  assert.equal(runs[0].metrics.revenue, 300);
  assert.equal(runs[0].metrics.orders, 2);
  assert.equal(runs[0].metrics.aov, 150);
  assert.equal(runs[0].metrics.refund_rate, 0.0333);
  assert.deepEqual(skuRevenue, { B: 200, A: 100 });
  assert.ok(runs[0].metadata.confidence_score < 1);
  assert.ok(runs[0].metadata.missing_fields.includes("ecommerce_order_items.cogs"));
  assert.ok(runs[0].metadata.estimated_metrics.includes("business.net_profit"));
  assert.equal(JSON.stringify(runs[0]), JSON.stringify(runs[1]));
  assert.equal(JSON.stringify(runs[1]), JSON.stringify(runs[2]));
});

test("metric engine computes Amazon canonical input without raw provider data", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "amazon",
    orders: [
      { order_id: "A-1", revenue: 70, order_date: "2026-06-03", currency: "USD", platform: "amazon" }
    ],
    items: [
      { order_id: "A-1", product_id: "ASIN-1", sku: "AMZ-1", quantity: 2, price: 35, platform: "amazon" }
    ],
    products: [
      { product_id: "ASIN-1", product_name: "Amazon Product", sku: "AMZ-1", price: 35, platform: "amazon" }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 70);
  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.sku_revenue[0].sku, "AMZ-1");
  assert.ok(result.metadata.estimated_metrics.includes("refund_rate"));
});

test("metric engine computes TikTok canonical conversion input", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "tiktok",
    orders: [
      { order_id: "TT-1", revenue: 45, order_date: "2026-06-04", currency: "USD", platform: "tiktok" }
    ],
    items: [
      { order_id: "TT-1", product_id: "TT-P-1", sku: "TT-SKU", quantity: 1, price: 45, platform: "tiktok" }
    ],
    products: [
      { product_id: "TT-P-1", product_name: "Creator Bundle", sku: "TT-SKU", price: 45, platform: "tiktok" }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 45);
  assert.equal(result.metrics.aov, 45);
  assert.equal(result.metrics.product_performance[0].revenue, 45);
});

test("metric engine supports mixed multi-platform canonical data", () => {
  const dataset = canonicalDataset({
    platform: "mixed",
    orders: [
      { order_id: "S-1", revenue: 100, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
      { order_id: "A-1", revenue: 60, order_date: "2026-06-02", currency: "USD", platform: "amazon" },
      { order_id: "TT-1", revenue: 40, order_date: "2026-06-03", currency: "USD", platform: "tiktok" }
    ],
    items: [
      { order_id: "S-1", product_id: "P-1", sku: "SKU", quantity: 1, price: 100, platform: "shopify" },
      { order_id: "A-1", product_id: "P-2", sku: "SKU", quantity: 2, price: 30, platform: "amazon" },
      { order_id: "TT-1", product_id: "P-3", sku: "TT", quantity: 1, price: 40, platform: "tiktok" }
    ],
    products: [
      { product_id: "P-1", product_name: "One", platform: "shopify" },
      { product_id: "P-2", product_name: "Two", platform: "amazon" },
      { product_id: "P-3", product_name: "Three", platform: "tiktok" }
    ],
    refunds: [
      { refund_id: "RF-1", order_id: "A-1", amount: 10, platform: "amazon" }
    ]
  });
  dataset.metadata.source_platforms = ["shopify", "amazon", "tiktok"];

  const result = computeCanonicalEcommerceMetrics(dataset);

  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.orders, 3);
  assert.equal(result.metrics.refund_rate, 0.05);
  assert.deepEqual(result.metadata.source_platforms.sort(), ["amazon", "shopify", "tiktok"]);
});

test("metric engine degrades confidence and marks estimates when canonical fields are missing", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "custom",
    orders: [
      { order_id: "C-1", revenue: 20, order_date: "2026-06-05", currency: "USD", platform: "custom" }
    ],
    items: [
      { order_id: "C-1", sku: "UNKNOWN-SKU", platform: "custom" }
    ],
    products: [],
    customers: [],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 20);
  assert.equal(result.metrics.orders, 1);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_order_items.price"));
  assert.ok(result.metadata.estimated_metrics.includes("sku_revenue"));
  assert.ok(result.metadata.confidence_score < 1);
});

test("customer layer does not use revenue as LTV proxy without real customer identity", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "customer-guardrail",
    orders: [
      { order_id: "NO-CUSTOMER-1", revenue: 125, order_date: "2026-06-01" },
      { order_id: "NO-CUSTOMER-2", revenue: 175, order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "NO-CUSTOMER-1", sku: "SKU-A", price: 125, quantity: 1 },
      { order_id: "NO-CUSTOMER-2", sku: "SKU-B", price: 175, quantity: 1 }
    ],
    customers: [],
    refunds: []
  }));

  assert.equal(result.metrics.customer.customer_count, 0);
  assert.equal(result.metrics.customer.ltv, 0);
  assert.notEqual(result.metrics.customer.ltv, result.metrics.core.revenue);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_orders.customer_id"));
  assert.ok(result.metadata.estimated_metrics.includes("customer.ltv"));
  assert.equal(result.metadata.data_quality_components.customer_availability, 0);
});

test("attribution layer does not report order-level coverage from aggregate ads alone", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "attribution-guardrail",
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-06-01" },
      { order_id: "O-2", revenue: 200, order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-A", price: 100, quantity: 1 },
      { order_id: "O-2", sku: "SKU-B", price: 200, quantity: 1 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 50, impressions: 1000, clicks: 100, conversions: 3 }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.attribution.attribution_model, "none");
  assert.equal(result.metrics.attribution.order_attribution_coverage, 0);
  assert.equal(result.metrics.attribution.sku_attribution_coverage, 0);
  assert.equal(result.metrics.ads.roas, 6);
  assert.equal(result.metrics.ads.cac, null);
  assert.equal(result.metrics.ads.mer, 6);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_orders.utm_campaign"));
  assert.ok(result.metadata.estimated_metrics.includes("attribution.order_to_ad"));
});

test("attribution layer uses event-level order to campaign mapping when present", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "attribution-direct",
    orders: [
      { order_id: "O-1", customer_id: "C-1", revenue: 100, order_date: "2026-06-01", campaign_id: "CAMP-1", ad_id: "AD-1", utm_source: "meta" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-A", price: 100, quantity: 1 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 25, impressions: 1000, clicks: 100, conversions: 1 }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.attribution.attribution_model, "last_click");
  assert.equal(result.metrics.attribution.order_attribution_coverage, 1);
  assert.equal(result.metrics.attribution.sku_attribution_coverage, 1);
  assert.equal(result.metrics.attribution.roas_by_sku, true);
  assert.deepEqual(result.metrics.attribution.campaign_performance.map((row) => [row.campaign_id, row.revenue, row.ad_spend, row.roas]), [
    ["CAMP-1", 100, 25, 4]
  ]);
  assert.deepEqual(result.metrics.attribution.sku_attribution.map((row) => [row.sku, row.campaign_id, row.revenue, row.ad_spend_allocated, row.roas]), [
    ["SKU-A", "CAMP-1", 100, 25, 4]
  ]);
  assert.equal(result.metrics.ads.roas, 4);
});

test("metric engine source stays platform agnostic and canonical-only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/metrics/canonical-ecommerce-metric-engine.ts"), "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|stripe)/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
  assert.doesNotMatch(source, /raw[A-Z_]|GraphQL|Admin API|access_token/i);
});
