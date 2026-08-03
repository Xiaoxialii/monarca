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
const { buildCanonicalDatasetFromMappedRecords } = jiti("./lib/semantic/mapper/canonical-schema-engine.ts");
const { validateSemanticMapping } = jiti("./lib/semantic/mapper/mapping-validation.ts");
const { SemanticIntelligenceEngine } = jiti("./lib/semantic/engine/semantic-intelligence-engine.ts");

test("canonical engine normalizes Shopify-like adapter output into ecommerce tables", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "gid-order-1",
      fields: {
        order_id: "shopify-order-1",
        revenue: 120.5,
        order_date: "2026-06-01T00:00:00Z",
        currency: "USD",
        status: "paid",
        customer_id: "customer-1",
        product_id: "product-1",
        product_name: "Snowboard",
        sku: "SKU-1",
        quantity: 2,
        price: 60.25
      },
      unknown_fields: [{ path: "raw.admin_graphql_api_id", value: "gid-order-1" }]
    }
  ]);

  assert.equal(result.schema_version, "ecommerce_canonical_v1");
  assert.equal(result.tables.ecommerce_orders[0].order_id, "shopify-order-1");
  assert.equal(result.tables.ecommerce_order_items[0].sku, "SKU-1");
  assert.equal(result.tables.ecommerce_products[0].product_name, "Snowboard");
  assert.equal(result.tables.ecommerce_customers[0].customer_id, "customer-1");
  assert.equal(result.metadata.unknown_fields[0].path, "raw.admin_graphql_api_id");
});

test("semantic engine maps generic cost fields to product cost", () => {
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields([
    {
      field: "cost",
      path: "cost",
      valueType: "number",
      samples: [12.5, 14],
      context: []
    }
  ]);

  assert.equal(result.candidates[0]?.maps_to, "product_cost");
});

test("canonical engine normalizes Amazon-like and TikTok-like records without provider branches", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "amazon",
      source_id: "amazon-source-1",
      fields: {
        order_id: "amazon-order-1",
        revenue: 88,
        order_date: "2026-06-02",
        currency: "USD",
        status: "shipped",
        product_id: "ASIN-1",
        sku: "AMZ-SKU-1",
        quantity: 1,
        price: 88
      }
    },
    {
      platform: "tiktok",
      source_id: "tt-conversion-1",
      fields: {
        order_id: "tt-order-1",
        revenue: 45,
        order_date: "2026-06-03",
        currency: "USD",
        status: "converted",
        product_id: "TT-P-1",
        product_name: "Creator Bundle",
        sku: "TT-SKU-1",
        quantity: 1,
        price: 45
      }
    }
  ]);

  assert.deepEqual(result.metadata.source_platforms.sort(), ["amazon", "tiktok"]);
  assert.equal(result.tables.ecommerce_orders.length, 2);
  assert.equal(result.tables.ecommerce_order_items.length, 2);
  assert.equal(result.tables.ecommerce_orders.find((row) => row.platform === "amazon")?.revenue, 88);
  assert.equal(result.tables.ecommerce_orders.find((row) => row.platform === "tiktok")?.revenue, 45);
});

test("canonical engine validates required fields and preserves unknown schema", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "custom",
      source_id: "bad-1",
      fields: {
        order_id: "bad-order",
        revenue: "not-a-number",
        currency: "USD"
      },
      unknown_fields: [
        { path: "mystery_field", value: { nested: true } }
      ]
    }
  ]);

  assert.equal(result.tables.ecommerce_orders.length, 0);
  assert.ok(result.metadata.validation.rejected_rows >= 1);
  assert.ok(result.metadata.validation.rejected.some((row) => row.reason === "invalid_number" || row.reason === "missing_required_field"));
  assert.equal(result.metadata.unknown_fields[0].path, "mystery_field");
});

test("canonical engine dedupes repeated multi-platform rows using canonical keys", () => {
  const duplicate = {
    platform: "stripe",
    source_id: "payment-1",
    fields: {
      order_id: "payment-1",
      revenue: 33,
      order_date: "2026-06-04",
      currency: "USD",
      status: "paid"
    }
  };
  const result = buildCanonicalDatasetFromMappedRecords([duplicate, duplicate]);

  assert.equal(result.tables.ecommerce_orders.length, 1);
  assert.equal(result.metadata.dedupe.duplicate_count, 1);
  assert.equal(result.metadata.dedupe.canonical_key_strategy, "hash(platform + source_id + order_id)");
});

test("canonical engine normalizes ads mapped records into ecommerce_ads", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "meta",
      source_id: "camp-1:ad-1:2026-06-01",
      fields: {
        sku: "SKU-AD",
        campaign_id: "camp-1",
        adset_id: "adset-1",
        ad_id: "ad-1",
        ad_spend: 100,
        impressions: 10000,
        clicks: 500,
        conversions: 20,
        attribution_revenue: 250,
        event_date: "2026-06-01"
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_ads.length, 1);
  assert.equal(result.tables.ecommerce_ads[0].platform, "meta");
  assert.equal(result.tables.ecommerce_ads[0].sku, "SKU-AD");
  assert.equal(result.tables.ecommerce_ads[0].campaign_id, "camp-1");
  assert.equal(result.tables.ecommerce_ads[0].spend, 100);
  assert.equal(result.tables.ecommerce_ads[0].date, "2026-06-01");
  assert.equal(result.tables.ecommerce_ads[0].attribution_revenue, 250);
});

test("canonical engine preserves ecommerce profit fields on order items", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "order-1",
      fields: {
        order_id: "order-1",
        sku: "SKU-1",
        quantity: 3,
        revenue: 150,
        cogs: 60,
        shipping_cost: 12,
        fulfillment_cost: 8,
        payment_fee: 4
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 1);
  assert.equal(result.tables.ecommerce_order_items[0].net_sales, 150);
  assert.equal(result.tables.ecommerce_order_items[0].cogs, 60);
  assert.equal(result.tables.ecommerce_orders[0].shipping_cost, 12);
  assert.equal(result.tables.ecommerce_costs.length, 4);
});

test("canonical engine builds inventory rows from stock fields", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "inventory-1",
      fields: {
        sku: "SKU-1",
        stock_level: 20,
        available_stock: 18,
        inventory_cost: 320,
        warehouse_id: "WH-1",
        reorder_point: 5
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_inventory.length, 1);
  assert.equal(result.tables.ecommerce_inventory[0].stock_level, 20);
  assert.equal(result.tables.ecommerce_inventory[0].warehouse_id, "WH-1");
  assert.equal(result.tables.ecommerce_order_items.length, 0);
});

test("semantic mapping validation rejects corrupt memory mappings", () => {
  assert.equal(validateSemanticMapping("shipping_cost", "ad_spend").accepted, false);
  assert.equal(validateSemanticMapping("fulfillment_cost", "ad_spend").accepted, false);
  assert.equal(validateSemanticMapping("payment_fee", "revenue").accepted, false);
  assert.equal(validateSemanticMapping("stock_level", "sku").accepted, false);
  assert.equal(validateSemanticMapping("price", "revenue").accepted, false);
  assert.equal(validateSemanticMapping("month", "event_date").accepted, true);
});

test("canonical engine source stays platform agnostic", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/semantic/mapper/canonical-schema-engine.ts"), "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|stripe)/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
