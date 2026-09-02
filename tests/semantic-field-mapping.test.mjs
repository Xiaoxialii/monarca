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
const { SelfLearningSemanticRuntime, InMemorySemanticMemoryStore } = jiti("./lib/semantic/index.ts");
const { buildEcommerceSalesDashboardData } = jiti("./lib/dashboard/ecommerce-sales-dashboard-data.ts");
const { validateOptimizationData } = jiti("./lib/optimization/optimization-data-contract.ts");
const { buildSemanticMappingCache } = jiti("./lib/semantic/schema-mapping-cache.ts");

async function run(rawData, platform = "meta_ads") {
  const runtime = new SelfLearningSemanticRuntime({ memory: new InMemorySemanticMemoryStore() });
  return runtime.run({
    platform,
    rawData,
    persistInferredMappings: false
  });
}

test("advertising spend aliases map into canonical ad_spend", async () => {
  const cases = [
    { platform: "meta_ads", spend: 120 },
    { platform: "google_ads", cost: 130 },
    { platform: "amazon_ads", advertising_cost: 140 },
    { platform: "shopify_ads", total_ad_spend: 150 }
  ];

  for (const row of cases) {
    const { platform, ...spendField } = row;
    const result = await run([{
      campaign_name: "Prospecting",
      ad_date: "2026-08-01",
      impressions: 1000,
      clicks: 50,
      purchases: 5,
      ...spendField
    }], platform);
    const ads = result.canonical_schema.tables.ecommerce_ads;
    const detail = result.mappings.find((mapping) => mapping.canonical === "ad_spend");

    assert.equal(ads.length, 1, `${platform} should generate an ads row`);
    assert.equal(ads[0].spend, Object.values(spendField)[0]);
    assert.equal(detail?.mapping_method, "exact_alias");
    assert.equal(detail?.requires_confirmation, false);
  }
});

test("ambiguous unknown money fields require confirmation instead of silent mapping", async () => {
  const result = await run([{
    campaign_name: "Prospecting",
    ad_date: "2026-08-01",
    money_used: 120
  }], "custom_csv");
  const mapping = result.mappings.find((item) => item.field === "money_used");

  assert.equal(mapping?.canonical, "unknown");
  assert.equal(mapping?.requires_confirmation, true);
  assert.ok(mapping?.suggested_mappings?.length);
  assert.ok(mapping.suggested_mappings.some((candidate) => candidate.canonical_field === "ad_spend"));
  assert.ok(!result.canonical_schema.tables.ecommerce_ads.some((row) => row.spend === 120));
});

test("mapping metadata preserves source columns and canonical fields", async () => {
  const result = await run([{
    campaign_name: "Prospecting",
    spend: 120,
    clicks: 12,
    impressions: 100
  }], "meta_ads");
  const fieldMappings = result.canonical_schema.metadata.field_mappings ?? [];

  assert.ok(fieldMappings.some((mapping) =>
    mapping.source_column === "spend" &&
    mapping.canonical_field === "ad_spend" &&
    mapping.source_system === "meta_ads" &&
    mapping.mapping_confidence === 1
  ));
});

test("semantic mapping cache excludes canonical lineage system fields", () => {
  const cache = buildSemanticMappingCache({
    source: "schema_semantic_layer",
    tables: [{
      name: "ecommerce_products",
      columns: [
        { name: "data_source_id", semanticName: "revenue" },
        { name: "source_provider", semanticName: "revenue" },
        { name: "source_account_id", semanticName: "revenue" },
        { name: "source_record_id", semanticName: "revenue" },
        { name: "net_sales", semanticName: "revenue" }
      ]
    }],
    semanticLayer: {
      fields: [
        { table: "ecommerce_products", field: "data_source_id", displayField: "data_source_id", semanticType: "revenue", confidence: 0.87 },
        { table: "ecommerce_products", field: "source_provider", displayField: "source_provider", semanticType: "revenue", confidence: 0.87 },
        { table: "ecommerce_products", field: "source_account_id", displayField: "source_account_id", semanticType: "revenue", confidence: 0.92 },
        { table: "ecommerce_products", field: "source_record_id", displayField: "source_record_id", semanticType: "revenue", confidence: 0.87 },
        { table: "ecommerce_products", field: "net_sales", displayField: "net_sales", semanticType: "revenue", confidence: 0.96 }
      ]
    }
  });

  assert.deepEqual(cache.field_mappings.map((mapping) => mapping.source_column), ["net_sales"]);
  assert.equal(cache.field_mappings[0].canonical_field, "revenue");
});

test("Shopify order structure fields do not map to revenue", async () => {
  const result = await run([{
    source_order_id: "gid://shopify/Order/1",
    customer_id: "gid://shopify/Customer/1",
    order_date: "2026-08-13T00:00:00Z",
    order_status: "open",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    net_sales: 120
  }], "shopify");
  const byField = new Map(result.mappings.map((mapping) => [mapping.source_field || mapping.field, mapping]));

  assert.equal(byField.get("source_order_id")?.canonical, "source_order_id");
  assert.equal(byField.get("customer_id")?.canonical, "customer_id");
  assert.equal(byField.get("order_date")?.canonical, "order_date");
  assert.equal(byField.get("order_status")?.canonical, "order_status");
  assert.equal(byField.get("financial_status")?.canonical, "financial_status");
  assert.equal(byField.get("fulfillment_status")?.canonical, "fulfillment_status");
  assert.equal(byField.get("net_sales")?.canonical, "net_sales");
  assert.equal(result.canonical_schema.tables.ecommerce_orders[0]?.source_order_id, "gid://shopify/Order/1");
});

test("semantic engine preserves explicit order status, refund, and inventory value concepts", async () => {
  const result = await run([{
    amazon_order_id: "AMZ-1",
    financial_status: "paid",
    payment_status: "captured",
    fulfillment_status: "fulfilled",
    cancelled_at: "",
    refund_date: "2026-08-02",
    source_line_item_id: "LINE-1",
    inventory_value: 35204.85,
    snapshot_date: "2026-08-09"
  }], "amazon");
  const byField = new Map(result.mappings.map((mapping) => [mapping.source_field || mapping.field, mapping]));

  assert.equal(byField.get("financial_status")?.canonical, "financial_status");
  assert.equal(byField.get("payment_status")?.canonical, "payment_status");
  assert.equal(byField.get("fulfillment_status")?.canonical, "fulfillment_status");
  assert.equal(byField.get("cancelled_at")?.canonical, "cancelled_at_source");
  assert.equal(byField.get("refund_date")?.canonical, "refund_date");
  assert.equal(byField.get("source_line_item_id")?.canonical, "source_line_item_id");
  assert.equal(byField.get("inventory_value")?.canonical, "inventory_value");
  assert.equal(byField.get("snapshot_date")?.canonical, "snapshot_date");
});

test("semantic engine maps human-readable inventory value headers", async () => {
  const result = await run([{
    sku: "SKU_0050",
    available: 954,
    "Inventory value": 48129.06,
    "Snapshot Date": "2026-08-09"
  }], "excel");
  const byField = new Map(result.mappings.map((mapping) => [mapping.source_field || mapping.field, mapping]));
  const inventory = result.canonical_schema.tables.ecommerce_inventory[0];

  assert.equal(byField.get("Inventory value")?.canonical, "inventory_value");
  assert.equal(byField.get("Snapshot Date")?.canonical, "snapshot_date");
  assert.equal(inventory.inventory_value, 48129.06);
  assert.equal(inventory.snapshot_date, "2026-08-09");
});


test("Meta Ads spend maps through canonical metrics and readiness without date blocking ad_spend", async () => {
  const result = await run([{
    campaign_id: "META_00001",
    sku: "SKU_00001",
    date: "2024-01-02",
    channel: "meta_ads",
    spend: 51,
    impressions: 1010,
    clicks: 51,
    conversions: 6
  }], "meta_ads");
  const canonicalAd = result.canonical_schema.tables.ecommerce_ads[0];
  const dashboardData = buildEcommerceSalesDashboardData(result.canonical_schema);
  const readiness = validateOptimizationData(dashboardData);
  const advertisingModule = readiness.moduleReadiness.find((module) => module.id === "advertising");
  const debugMapping = dashboardData.metadata.field_mappings.find((mapping) => mapping.canonical_field === "ad_spend");
  const dateMapping = result.mappings.find((mapping) => (mapping.source_field || mapping.field) === "date");

  assert.equal(canonicalAd.spend, 51);
  assert.equal(dateMapping?.canonical, "event_date");
  assert.equal(canonicalAd.date, "2024-01-02");
  assert.equal(dashboardData.metrics.ads.ad_spend, 51);
  assert.equal(advertisingModule?.status, "READY");
  assert.deepEqual({
    canonical_field: debugMapping?.canonical_field,
    source_field: debugMapping?.source_field,
    source_file: debugMapping?.source_file,
    status: debugMapping?.status
  }, {
    canonical_field: "ad_spend",
    source_field: "spend",
    source_file: "Meta Ads",
    status: "AVAILABLE"
  });
});

test("Meta Ads spend remains available when ad date is missing", async () => {
  const result = await run([{
    campaign_id: "META_NO_DATE",
    sku: "SKU_NO_DATE",
    spend: 75,
    impressions: 1200,
    clicks: 80,
    conversions: 4
  }], "meta_ads");
  const dashboardData = buildEcommerceSalesDashboardData(result.canonical_schema);
  const readiness = validateOptimizationData(dashboardData);
  const advertisingModule = readiness.moduleReadiness.find((module) => module.id === "advertising");

  assert.equal(result.canonical_schema.tables.ecommerce_ads[0].spend, 75);
  assert.equal(dashboardData.metrics.ads.ad_spend, 75);
  assert.equal(readiness.missingRequiredFields.includes("ad_spend"), false);
  assert.equal(advertisingModule?.status, "READY");
  assert.ok(advertisingModule.confidence < 1);
  assert.ok(readiness.missingRecommendedFields.includes("ad_date"));
});
