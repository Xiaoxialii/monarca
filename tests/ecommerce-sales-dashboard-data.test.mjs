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
const { buildEcommerceSalesDashboardData, emptyEcommerceCanonicalDataset } = jiti("./lib/dashboard/ecommerce-sales-dashboard-data.ts");

function dataset() {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
        { order_id: "2", revenue: 200, order_date: "2026-06-02", currency: "USD", platform: "amazon" },
        { order_id: "3", revenue: 50, order_date: "2026-06-10", currency: "USD", platform: "tiktok" }
      ],
      ecommerce_order_items: [
        { order_id: "1", product_id: "p1", sku: "A", price: 50, quantity: 2 },
        { order_id: "2", product_id: "p2", sku: "B", price: 100, quantity: 2 },
        { order_id: "3", product_id: "p1", sku: "A", price: 50, quantity: 1 }
      ],
      ecommerce_products: [
        { product_id: "p1", product_name: "Item A", sku: "A", price: 50 },
        { product_id: "p2", product_name: "Item B", sku: "B", price: 100 }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: [
        { refund_id: "r1", order_id: "1", amount: 10, refund_date: "2026-06-03" }
      ],
      ecommerce_inventory: [
        { sku: "A", warehouse_id: "WH1", stock_level: 12, available_stock: 10, reorder_point: 5, fulfillment_days: 3 },
        { sku: "B", warehouse_id: "WH1", stock_level: 20, available_stock: 18, reorder_point: 8, fulfillment_days: 2 }
      ]
    },
    metadata: {
      source_platforms: ["shopify", "amazon", "tiktok"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 9, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  };
}

test("ecommerce sales dashboard builds KPI, trend, SKU, refund, and catalog sections", () => {
  const result = buildEcommerceSalesDashboardData(dataset());

  assert.equal(result.metrics.revenue, 350);
  assert.equal(result.metrics.orders, 3);
  assert.equal(result.metrics.aov, 116.67);
  assert.equal(result.metrics.refund_rate, 0.0286);
  assert.equal(result.metrics.total_sku_count, 2);
  assert.deepEqual(result.trends.daily_revenue.map((row) => [row.period, row.revenue]), [
    ["2026-06-01", 100],
    ["2026-06-02", 200],
    ["2026-06-10", 50]
  ]);
  assert.equal(result.trends.weekly_revenue.length, 2);
  assert.equal(result.sku_analysis.top_skus[0].sku, "B");
  assert.equal(result.sku_analysis.top_skus[0].revenue, 200);
  assert.equal(result.refund_insights.refund_amount, 10);
  assert.equal(result.refund_insights.top_refunded_products[0].product_id, "p1");
  assert.equal(result.catalog_health.product_count, 2);
  assert.equal(result.catalog_health.variant_count, 2);
  assert.equal(result.catalog_health.tracked_sku_count, 2);
  assert.equal(result.catalog_health.untracked_sku_count, 0);
  assert.equal(result.catalog_health.catalog_row_count, 2);
  assert.equal(result.catalog_health.sku_density, 1);
});

test("ecommerce sales dashboard preserves inventory into SKU operating P&L", () => {
  const result = buildEcommerceSalesDashboardData(dataset());
  const skuA = result.decision_report.sku_breakdown.top_profit_skus.find((row) => row.sku === "A");

  assert.ok(skuA);
  assert.equal(skuA.stock_level, 12);
  assert.equal(skuA.available_stock, 10);
  assert.equal(skuA.inventory_confidence, 1);
});

test("ecommerce sales dashboard handles missing canonical data without crashing", () => {
  const result = buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset());

  assert.equal(result.metrics.revenue, 0);
  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.aov, 0);
  assert.equal(result.metrics.total_sku_count, 0);
  assert.ok(result.quality.missing_fields.includes("ecommerce_orders.*"));
  assert.ok(result.quality.estimated_metrics.includes("refund_rate"));
  assert.deepEqual(result.trends.daily_revenue, []);
});

test("ecommerce sales dashboard shows catalog preview without order items", () => {
  const result = buildEcommerceSalesDashboardData({
    ...emptyEcommerceCanonicalDataset(["shopify"]),
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: [],
      ecommerce_products: [
        {
          product_id: "shopify:123",
          variant_id: "shopify:456",
          product_name: "The Minimal Snowboard",
          sku: "snowboard-minimal",
          platform: "shopify"
        },
        {
          product_id: "shopify:123",
          variant_id: "shopify:789",
          product_name: "The Minimal Snowboard",
          sku: "",
          platform: "shopify"
        }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: []
    }
  });

  assert.equal(result.metrics.total_sku_count, 2);
  assert.equal(result.catalog_health.product_count, 1);
  assert.equal(result.catalog_health.variant_count, 2);
  assert.equal(result.catalog_health.sku_count, 2);
  assert.equal(result.catalog_health.tracked_sku_count, 1);
  assert.equal(result.catalog_health.untracked_sku_count, 1);
  assert.equal(result.catalog_health.catalog_row_count, 2);
  assert.equal(result.sku_analysis.top_skus.length, 0);
  assert.deepEqual(result.sku_analysis.catalog_preview[0], {
    product_name: "The Minimal Snowboard",
    sku: "SNOWBOARD-MINIMAL",
    variant_id: "shopify:456",
    product_id: "shopify:123"
  });
});

test("ecommerce dashboard data layer stays canonical-only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/dashboard/ecommerce-sales-dashboard-data.ts"), "utf8");

  assert.doesNotMatch(source, /GraphQL|Admin API|access_token|fetch\s*\(/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
