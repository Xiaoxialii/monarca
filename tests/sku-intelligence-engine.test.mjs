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
const {
  buildCanonicalSku,
  enrichOrderItemsWithCanonicalSku,
  parseShopifyGid,
  runSkuIntelligence
} = jiti("./lib/sku/sku-intelligence-engine.ts");
const { computeSkuPerformance } = jiti("./lib/sku/sku-performance-engine.ts");
const { computeCanonicalEcommerceMetrics } = jiti("./lib/metrics/canonical-ecommerce-metric-engine.ts");

test("SKU intelligence parses Shopify gids and normalizes explicit SKU values", () => {
  assert.deepEqual(parseShopifyGid("gid://shopify/ProductVariant/456"), {
    resource: "ProductVariant",
    id: "456"
  });

  assert.deepEqual(buildCanonicalSku({
    sku: "tshirt black m",
    product_id: "gid://shopify/Product/123",
    variant_id: "gid://shopify/ProductVariant/456",
    platform: "shopify"
  }), {
    sku: "TSHIRT_BLACK_M",
    product_id: "shopify:123",
    variant_id: "shopify:456",
    platform: "shopify",
    unmapped: false
  });
});

test("SKU intelligence falls back when Shopify SKU is missing or raw gid-like", () => {
  const missing = buildCanonicalSku({
    sku: "",
    product_id: "gid://shopify/Product/123",
    variant_id: "gid://shopify/ProductVariant/456",
    platform: "shopify"
  });
  const rawGid = buildCanonicalSku({
    sku: "gid://shopify/ProductVariant/456",
    product_id: "gid://shopify/Product/123",
    variant_id: "gid://shopify/ProductVariant/456",
    platform: "shopify"
  });

  assert.equal(missing.sku, "SKU-UNTRACKED-456");
  assert.equal(rawGid.sku, "SKU-UNTRACKED-456");
  assert.equal(missing.unmapped, true);
  assert.equal(rawGid.unmapped, true);
});

test("SKU intelligence joins order items to product variant SKU mapping", () => {
  const items = enrichOrderItemsWithCanonicalSku([
    {
      order_id: "1",
      product_id: "shopify:123",
      variant_id: "shopify:456",
      quantity: 2,
      price: 50,
      platform: "shopify"
    }
  ], [
    {
      product_id: "shopify:123",
      variant_id: "shopify:456",
      sku: "shirt-blue-l",
      platform: "shopify"
    }
  ]);

  assert.equal(items[0].sku, "SHIRT-BLUE-L");
  assert.equal(items[0].sku_unmapped, false);
});

test("SKU performance computes revenue, rank, share, coverage, and reconciliation", () => {
  const result = computeSkuPerformance({
    orderItems: [
      { order_id: "1", product_id: "shopify:123", variant_id: "shopify:456", price: 50, quantity: 2, platform: "shopify" },
      { order_id: "2", product_id: "shopify:123", variant_id: "shopify:456", price: 25, quantity: 1, platform: "shopify" },
      { order_id: "3", product_id: "shopify:999", variant_id: "shopify:9991", sku: "", price: 10, quantity: 1, platform: "shopify" }
    ],
    products: [
      { product_id: "shopify:123", variant_id: "shopify:456", sku: "shirt-blue-l", platform: "shopify" }
    ]
  });

  assert.equal(result.sku_metrics[0].sku, "SHIRT-BLUE-L");
  assert.equal(result.sku_metrics[0].revenue, 125);
  assert.equal(result.sku_metrics[0].quantity, 3);
  assert.equal(result.sku_metrics[0].rank, 1);
  assert.equal(result.sku_metrics[1].sku, "SKU-UNTRACKED-9991");
  assert.equal(result.metadata.unmapped_skus, 1);
  assert.equal(result.metadata.revenue_reconciled, true);
});

test("metric engine uses SKU intelligence instead of exposing Shopify gids", () => {
  const result = computeCanonicalEcommerceMetrics({
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [{ order_id: "1", revenue: 100, platform: "shopify" }],
      ecommerce_order_items: [
        {
          order_id: "1",
          product_id: "gid://shopify/Product/123",
          variant_id: "gid://shopify/ProductVariant/456",
          sku: "gid://shopify/ProductVariant/456",
          price: 50,
          quantity: 2,
          platform: "shopify"
        }
      ],
      ecommerce_products: [
        {
          product_id: "gid://shopify/Product/123",
          variant_id: "gid://shopify/ProductVariant/456",
          sku: "",
          platform: "shopify"
        }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: []
    },
    metadata: {
      source_platforms: ["shopify"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 3, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  });

  assert.equal(result.metrics.sku_revenue[0].sku, "SKU-UNTRACKED-456");
  assert.equal(result.metrics.sku_revenue[0].revenue, 100);
  assert.ok(!result.metrics.sku_revenue[0].sku.startsWith("gid://shopify/"));
});
