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
  assert.equal(result.metadata.validation.rejected_rows, 1);
  assert.equal(result.metadata.validation.rejected[0].reason, "missing_required_field");
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
  assert.equal(result.tables.ecommerce_ads[0].campaign_id, "camp-1");
  assert.equal(result.tables.ecommerce_ads[0].spend, 100);
  assert.equal(result.tables.ecommerce_ads[0].date, "2026-06-01");
  assert.equal(result.tables.ecommerce_ads[0].attribution_revenue, 250);
});

test("canonical engine source stays platform agnostic", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/semantic/mapper/canonical-schema-engine.ts"), "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|stripe)/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
