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
  normalizeMetaInsightsToCanonicalAds,
  metaInsightsToCanonicalMappedRecords
} = jiti("./lib/ads/meta/meta-ads-connector.ts");
const { buildCanonicalDatasetFromMappedRecords } = jiti("./lib/semantic/mapper/canonical-schema-engine.ts");
const { runMetaShopifyAttribution } = jiti("./lib/ads/attribution/meta-shopify-attribution-engine.ts");

function dataset({ orders = [], ads = [] }) {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: orders,
      ecommerce_order_items: [],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: ads
    },
    metadata: {
      source_platforms: ["shopify", "meta"],
      normalized_at: "2026-06-30T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: orders.length + ads.length, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  };
}

test("Meta Ads insights normalize to canonical ads rows", () => {
  const rows = normalizeMetaInsightsToCanonicalAds([
    {
      campaign_id: "camp-1",
      adset_id: "adset-1",
      ad_id: "ad-1",
      spend: "100",
      impressions: "10000",
      clicks: "500",
      actions: [{ action_type: "purchase", value: "20" }],
      action_values: [{ action_type: "purchase", value: "2000" }],
      date_start: "2026-06-01"
    }
  ]);

  assert.equal(rows[0].platform, "meta");
  assert.equal(rows[0].campaign_id, "camp-1");
  assert.equal(rows[0].spend, 100);
  assert.equal(rows[0].conversions, 20);
  assert.equal(rows[0].attribution_revenue, 2000);
});

test("Meta Ads mapped records enter ecommerce_ads through canonical schema", () => {
  const result = buildCanonicalDatasetFromMappedRecords(metaInsightsToCanonicalMappedRecords([
    {
      campaign_id: "camp-1",
      ad_id: "ad-1",
      spend: 80,
      impressions: 9000,
      clicks: 450,
      conversions: 10,
      purchase_value: 300,
      date_start: "2026-06-01"
    }
  ]));

  assert.equal(result.tables.ecommerce_ads.length, 1);
  assert.equal(result.tables.ecommerce_ads[0].campaign_id, "camp-1");
  assert.equal(result.tables.ecommerce_ads[0].spend, 80);
  assert.equal(result.tables.ecommerce_ads[0].conversions, 10);
});

test("attribution engine matches Shopify orders to Meta campaigns by UTM", () => {
  const result = runMetaShopifyAttribution({
    dataset: dataset({
      orders: [
        { order_id: "S-1", revenue: 250, customer_id: "C-1", utm_source: "meta", utm_campaign: "camp-1" },
        { order_id: "S-2", revenue: 100, customer_id: "C-2", utm_source: "email", utm_campaign: "newsletter" }
      ],
      ads: [
        { platform: "meta", campaign_id: "camp-1", ad_id: "ad-1", spend: 100, impressions: 10000, clicks: 500, conversions: 20, date: "2026-06-01" }
      ]
    })
  });

  assert.equal(result.total_revenue, 350);
  assert.equal(result.total_ad_spend, 100);
  assert.equal(result.campaign_performance[0].revenue, 250);
  assert.equal(result.campaign_performance[0].roas, 2.5);
  assert.equal(result.cac, 100);
  assert.equal(result.cpa, 5);
  assert.equal(result.mer, 3.5);
  assert.equal(result.metadata.canonical_input_only, true);
});

test("attribution engine falls back to proportional revenue when UTM is unavailable", () => {
  const result = runMetaShopifyAttribution({
    dataset: dataset({
      orders: [
        { order_id: "S-1", revenue: 300 },
        { order_id: "S-2", revenue: 100 }
      ],
      ads: [
        { platform: "meta", campaign_id: "camp-a", ad_id: "ad-a", spend: 75, impressions: 1000, clicks: 100, conversions: 5, date: "2026-06-01" },
        { platform: "meta", campaign_id: "camp-b", ad_id: "ad-b", spend: 25, impressions: 500, clicks: 50, conversions: 5, date: "2026-06-01" }
      ]
    })
  });

  assert.equal(result.metadata.fallback_attribution_used, true);
  assert.equal(result.campaign_performance.find((row) => row.campaign_id === "camp-a")?.revenue, 300);
  assert.equal(result.campaign_performance.find((row) => row.campaign_id === "camp-b")?.revenue, 100);
  assert.equal(result.roas, 4);
});

test("Meta attribution source stays canonical-only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/ads/attribution/meta-shopify-attribution-engine.ts"), "utf8");

  assert.doesNotMatch(source, /GraphQL|Marketing API|access_token|fetch\s*\(/i);
  assert.match(source, /ecommerce_ads/);
  assert.match(source, /ecommerce_orders/);
});

test("Meta OAuth routes support production start callback and status flow", () => {
  const fs = require("node:fs");
  const startRoute = fs.readFileSync(join(process.cwd(), "app/api/connectors/meta/start/route.ts"), "utf8");
  const callbackRoute = fs.readFileSync(join(process.cwd(), "app/api/connectors/meta/callback/route.ts"), "utf8");
  const statusRoute = fs.readFileSync(join(process.cwd(), "app/api/connectors/meta/status/route.ts"), "utf8");
  const oauth = fs.readFileSync(join(process.cwd(), "lib/ads/meta/meta-oauth.ts"), "utf8");

  assert.match(startRoute, /export async function POST/);
  assert.match(startRoute, /createMetaOAuthState/);
  assert.match(startRoute, /workspace_id/);
  assert.match(oauth, /ads_read/);
  assert.match(oauth, /read_insights/);
  assert.match(oauth, /business_management/);
  assert.match(callbackRoute, /verifyAndConsumeMetaOAuthState/);
  assert.match(callbackRoute, /exchangeMetaCodeForToken/);
  assert.match(callbackRoute, /encryptedAccessToken/);
  assert.match(callbackRoute, /fetchMetaAdAccounts/);
  assert.match(statusRoute, /ad_account/);
  assert.match(statusRoute, /last_sync_at/);
  assert.doesNotMatch(statusRoute, /encryptedAccessToken|accessToken/);
});

test("Meta sync route writes ecommerce_ads canonical artifacts without raw token exposure", () => {
  const fs = require("node:fs");
  const route = fs.readFileSync(join(process.cwd(), "app/api/connectors/meta/sync/route.ts"), "utf8");
  const engine = fs.readFileSync(join(process.cwd(), "lib/ads/meta/meta-sync-engine.ts"), "utf8");

  assert.match(route, /runMetaAdsProductionSync/);
  assert.match(engine, /fetchCampaigns/);
  assert.match(engine, /fetchAdSets/);
  assert.match(engine, /fetchAds/);
  assert.match(engine, /fetchInsights/);
  assert.match(engine, /ecommerce_ads/);
  assert.match(engine, /buildCanonicalDatasetFromMappedRecords/);
  assert.match(engine, /storeCanonicalSchemaSnapshot/);
  assert.match(engine, /EcommerceSyncRun|ecommerceSyncRun/);
  assert.doesNotMatch(route, /accessToken|encryptedAccessToken/);
  assert.doesNotMatch(engine, /console\.log|NextResponse/);
});
