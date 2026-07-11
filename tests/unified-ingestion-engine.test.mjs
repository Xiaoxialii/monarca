import assert from "node:assert/strict";
import fs from "node:fs";
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

const jiti = jitiFactory(new URL("../", import.meta.url).pathname);
const { runUnifiedIngestionPipeline } = jiti("./lib/ingestion/unified-ingestion-engine.ts");
const { InMemorySemanticMemoryStore } = jiti("./lib/semantic/memory/semantic-memory-store.ts");

test("unified ingestion maps Excel-like rows into canonical schema and metrics", async () => {
  const result = await runUnifiedIngestionPipeline({
    source: "excel",
    workspace_id: "ws_excel",
    payload: [
      {
        order_id: "E-1",
        order_total: 120,
        created_at: "2026-06-01",
        currency: "USD",
        sku: "SKU-A",
        product_id: "P-A",
        product_name: "Item A",
        unit_price: 60,
        quantity: 2,
        customer_id: "C-1",
        status: "paid"
      }
    ]
  });

  assert.equal(result.detected_schema.detected_type, "order");
  assert.equal(result.canonical_data.schema_version, "ecommerce_canonical_v1");
  assert.equal(result.canonical_data.tables.ecommerce_orders.length, 1);
  assert.equal(result.metrics.metrics.revenue, 120);
  assert.equal(result.metrics.metrics.orders, 1);
  assert.equal(result.metrics.metrics.aov, 120);
  assert.equal(result.metadata.audit.raw_bypasses_canonical, false);
});

test("unified ingestion handles Amazon and TikTok style payloads through the same entrypoint", async () => {
  const amazon = await runUnifiedIngestionPipeline({
    source: "amazon",
    workspace_id: "ws_marketplaces",
    payload: [{
      order_number: "A-1",
      gmv: 88,
      purchase_time: "2026-06-02",
      currency_code: "USD",
      seller_sku: "AMZ-SKU",
      asin: "ASIN-1",
      item_name: "Amazon Product",
      item_price: 44,
      qty: 2,
      buyer_id: "B-1",
      order_status: "shipped"
    }]
  });
  const tiktok = await runUnifiedIngestionPipeline({
    source: "tiktok",
    workspace_id: "ws_marketplaces",
    payload: [{
      purchase_id: "TT-1",
      total_amount: 45,
      purchase_time: "2026-06-03",
      currency: "USD",
      item_sku: "TT-SKU",
      item_id: "TT-P-1",
      title: "TikTok Product",
      unit_price: 45,
      unit_count: 1,
      user_id: "U-1",
      status: "paid"
    }]
  });

  assert.equal(amazon.metrics.metrics.revenue, 88);
  assert.equal(amazon.canonical_data.tables.ecommerce_orders[0].platform, "amazon");
  assert.equal(tiktok.metrics.metrics.revenue, 45);
  assert.equal(tiktok.canonical_data.tables.ecommerce_orders[0].platform, "tiktok");
});

test("unified ingestion maps Meta Ads style rows into canonical ads without sales metrics reading raw data", async () => {
  const result = await runUnifiedIngestionPipeline({
    source: "meta_ads",
    workspace_id: "ws_ads",
    payload: [{
      campaign_id: "CAMP-1",
      adset_id: "SET-1",
      ad_id: "AD-1",
      spend: "100.50",
      impressions: "10000",
      clicks: "500",
      conversions: "20",
      purchase_value: "250",
      date_start: "2026-06-04"
    }]
  });

  assert.equal(result.detected_schema.detected_type, "ads");
  assert.equal(result.canonical_data.tables.ecommerce_ads.length, 1);
  assert.equal(result.canonical_data.tables.ecommerce_ads[0].spend, 100.5);
  assert.equal(result.metrics.metadata.audit.canonical_input_only, true);
});

test("unified ingestion learns feedback into semantic memory and reuses it at runtime", async () => {
  const memory = new InMemorySemanticMemoryStore();
  const first = await runUnifiedIngestionPipeline({
    source: "custom_api",
    workspace_id: "ws_memory",
    memory,
    payload: [{ weird_sales_number: 33, order_id: "M-1", created_at: "2026-06-05", currency: "USD" }],
    feedbackEvents: [{
      field_name: "weird_sales_number",
      corrected_mapping: "revenue",
      feedback: "edit"
    }]
  });
  const second = await runUnifiedIngestionPipeline({
    source: "custom_api",
    workspace_id: "ws_memory",
    memory,
    payload: [{ weird_sales_number: 44, order_id: "M-2", created_at: "2026-06-06", currency: "USD" }]
  });

  assert.equal(first.learning.feedback_updates, 1);
  assert.ok(second.semantic.memory_hits >= 1);
  assert.equal(second.metrics.metrics.revenue, 44);
});

test("unified ingestion preserves unknown fields and does not crash on unknown payloads", async () => {
  const result = await runUnifiedIngestionPipeline({
    source: "custom_api",
    workspace_id: "ws_unknown",
    payload: [{ opaque_field: "abc", nested: { unrecognized_value: true } }]
  });

  assert.equal(result.detected_schema.detected_type, "unknown");
  assert.equal(result.metrics.metrics.revenue, 0);
  assert.ok(result.semantic.unknown_fields.length > 0);
  assert.ok(result.canonical_data.metadata.unknown_fields.length > 0);
});

test("unified ingestion source stays platform agnostic", () => {
  const source = fs.readFileSync("lib/ingestion/unified-ingestion-engine.ts", "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|meta_ads|stripe)/i);
  assert.doesNotMatch(source, /switch\s*\([^)]*source/i);
});
