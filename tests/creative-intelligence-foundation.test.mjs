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
const { normalizeMetaCreativeIntelligence } = jiti("./lib/ads/creative-intelligence/meta-creative-normalizer.ts");
const { resolveAdvertisingProductMapping } = jiti("./lib/ads/creative-intelligence/mapping-engine.ts");
const { calculateCreativeProfitSnapshot } = jiti("./lib/ads/creative-intelligence/profitability.ts");
const { evaluateCreativeReadiness } = jiti("./lib/ads/creative-intelligence/data-quality.ts");

const products = [
  {
    sku: "SKU-001",
    canonicalProductId: "prod-1",
    canonicalVariantId: "var-1",
    sourceProductId: "111",
    shopifyProductId: "111",
    shopifyVariantId: "222",
    googleMerchantItemId: "merchant-001",
    productHandle: "hero-bottle"
  },
  {
    sku: "SKU-002",
    canonicalProductId: "prod-2",
    productHandle: "travel-bottle"
  }
];

test("Meta normalizer parses single image creative without asset-level metric duplication", () => {
  const result = normalizeMetaCreativeIntelligence({
    workspaceId: "ws_1",
    dataSourceId: "ds_1",
    sourceAccountId: "act_1",
    adAccountId: "act_1",
    account: { id: "act_1", name: "Main", currency: "USD" },
    campaigns: [{ id: "camp_1", name: "Campaign", objective: "OUTCOME_SALES" }],
    adsets: [{ id: "set_1", campaign_id: "camp_1", name: "Ad set" }],
    ads: [{
      id: "ad_1",
      campaign_id: "camp_1",
      adset_id: "set_1",
      name: "SKU-001 image ad",
      creative: {
        id: "creative_1",
        name: "Creative SKU-001",
        object_story_spec: {
          page_id: "page_1",
          link_data: {
            message: "Primary text",
            name: "Headline",
            description: "Description",
            picture: "https://cdn.example.com/image.jpg",
            link: "https://store.example.com/products/hero-bottle"
          }
        }
      }
    }],
    insights: [{
      campaign_id: "camp_1",
      adset_id: "set_1",
      ad_id: "ad_1",
      spend: "120",
      impressions: "5000",
      clicks: "220",
      actions: [{ action_type: "purchase", value: "12" }],
      action_values: [{ action_type: "purchase", value: "840" }],
      date_start: "2026-08-01"
    }]
  });

  assert.equal(result.ads.length, 1);
  assert.equal(result.creatives.length, 1);
  assert.ok(result.assets.some((asset) => asset.assetType === "IMAGE"));
  assert.ok(result.assets.some((asset) => asset.assetType === "PRIMARY_TEXT"));
  assert.equal(result.performanceDaily.length, 1);
  assert.equal(result.performanceDaily[0].sourceMetricScope, "AD");
  assert.equal(result.performanceDaily[0].creativeAssetId, null);
});

test("Meta normalizer marks dynamic creative members as not separately attributable", () => {
  const result = normalizeMetaCreativeIntelligence({
    workspaceId: "ws_1",
    dataSourceId: "ds_1",
    sourceAccountId: "act_1",
    adAccountId: "act_1",
    campaigns: [],
    adsets: [],
    ads: [{
      id: "ad_dynamic",
      creative: {
        id: "creative_dynamic",
        name: "Dynamic",
        asset_feed_spec: {
          images: [{ hash: "img_1", url: "https://cdn.example.com/1.jpg" }, { hash: "img_2", url: "https://cdn.example.com/2.jpg" }],
          bodies: [{ text: "Text A" }, { text: "Text B" }],
          titles: [{ text: "Headline A" }]
        }
      }
    }],
    insights: [{ ad_id: "ad_dynamic", spend: "50", impressions: "4000", date_start: "2026-08-02" }]
  });

  assert.ok(result.assets.length >= 4);
  assert.ok(result.assets.every((asset) => asset.status === "NOT_SEPARATELY_ATTRIBUTABLE"));
  assert.equal(result.performanceDaily[0].sourceMetricScope, "AD");
  assert.equal(result.performanceDaily[0].derivedMetricsJson.assetPerformanceStatus, "NOT_SEPARATELY_ATTRIBUTABLE");
});

test("mapping engine uses deterministic URL, UTM, and strict SKU evidence", () => {
  assert.equal(resolveAdvertisingProductMapping({
    candidate: { provider: "meta_ads", dataSourceId: "ds", sourceAccountId: "act", destinationUrl: "https://store.example.com/products/hero-bottle" },
    products
  }).mappingMethod, "URL_PRODUCT_HANDLE");

  assert.equal(resolveAdvertisingProductMapping({
    candidate: { provider: "meta_ads", dataSourceId: "ds", sourceAccountId: "act", destinationUrl: "https://store.example.com/?utm_sku=SKU-001" },
    products
  }).mappingMethod, "UTM_SKU");

  assert.equal(resolveAdvertisingProductMapping({
    candidate: { provider: "meta_ads", dataSourceId: "ds", sourceAccountId: "act", adName: "Summer test SKU-001" },
    products
  }).mappingMethod, "AD_NAME_SKU");
});

test("fuzzy mapping requires review and manual mapping wins", () => {
  const fuzzy = resolveAdvertisingProductMapping({
    candidate: { provider: "meta_ads", dataSourceId: "ds", sourceAccountId: "act", adName: "hero bottle sale" },
    products
  });
  assert.equal(fuzzy.status, "NEEDS_REVIEW");

  const manual = resolveAdvertisingProductMapping({
    candidate: { provider: "meta_ads", dataSourceId: "ds", sourceAccountId: "act", adName: "SKU-002" },
    products,
    existingManualMapping: {
      status: "MANUALLY_CONFIRMED",
      mappingMethod: "MANUAL",
      mappingConfidence: 1,
      sku: "SKU-001",
      evidenceJson: {}
    }
  });
  assert.equal(manual.sku, "SKU-001");
  assert.equal(manual.evidenceJson.manualOverride, true);
});

test("creative profit uses canonical formula and does not double count ad spend", () => {
  const snapshot = calculateCreativeProfitSnapshot({
    workspaceId: "ws",
    dataSourceId: "ds",
    provider: "meta_ads",
    sourceAccountId: "act",
    sourceAdId: "ad_1",
    mapping: { id: "map_1", sku: "SKU-001", status: "AUTO_CONFIRMED", mappingConfidence: 0.95, mappingVersion: 1 },
    performanceRows: [{
      workspaceId: "ws",
      dataSourceId: "ds",
      provider: "meta_ads",
      sourceAccountId: "act",
      sourceAdId: "ad_1",
      date: new Date("2026-08-01"),
      attributionLevel: "AD",
      attributionConfidence: 0.95,
      attributionMethod: "META_AD_LEVEL",
      sourceMetricScope: "AD",
      impressions: 5000,
      outboundClicks: 200,
      spend: 100,
      purchases: 10,
      attributedRevenue: 1000
    }],
    skuEconomics: {
      sku: "SKU-001",
      revenue: 1000,
      cogs: 400,
      shippingCost: 30,
      fulfillmentCost: 20,
      platformFee: 40,
      paymentFee: 25,
      refundCost: 15,
      cogsStatus: "AVAILABLE",
      cogsConfidence: 1,
      costCompleteness: 1
    },
    dateWindowStart: new Date("2026-08-01"),
    dateWindowEnd: new Date("2026-08-03")
  });

  assert.equal(snapshot.attributedContributionProfit, 470);
  assert.equal(snapshot.netProfitAfterAds, 370);
  assert.equal(snapshot.profitabilityEngineVersion, "v2.1-profitability-reconciliation");
});

test("readiness blocks unmapped, missing cost, and non-attributable multi-asset cases", () => {
  assert.equal(evaluateCreativeReadiness({
    runningDays: 5,
    impressions: 5000,
    outboundClicks: 150,
    spend: 200,
    mappingStatus: "UNMAPPED",
    mappingConfidence: 0,
    attributionConfidence: 0.95,
    costCompleteness: 1
  }).readiness, "UNMAPPED_SKU");

  assert.equal(evaluateCreativeReadiness({
    runningDays: 5,
    impressions: 5000,
    outboundClicks: 150,
    spend: 200,
    mappingStatus: "AUTO_CONFIRMED",
    mappingConfidence: 0.95,
    attributionConfidence: 0.95,
    costCompleteness: 0,
    hasMissingCogs: true
  }).readiness, "MISSING_COST_DATA");

  assert.equal(evaluateCreativeReadiness({
    runningDays: 5,
    impressions: 5000,
    outboundClicks: 150,
    spend: 200,
    mappingStatus: "AUTO_CONFIRMED",
    mappingConfidence: 0.95,
    attributionConfidence: 0.95,
    costCompleteness: 1,
    multiAssetNotAttributable: true
  }).readiness, "MULTI_ASSET_NOT_ATTRIBUTABLE");
});
