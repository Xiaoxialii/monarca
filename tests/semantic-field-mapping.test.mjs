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
