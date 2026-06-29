import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Shopify dual mode analytics supports full and fallback data modes", () => {
  const engine = read("lib/analytics/shopify-dual-mode-engine.ts");
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(engine, /export type ShopifyDataMode = "FULL" \| "FALLBACK"/, "Engine should define full and fallback modes");
  assert.match(engine, /export async function detectShopifyDataMode/, "Engine should detect Shopify data mode");
  assert.match(engine, /orders\(first: 1, query: "status:any"\)/, "Detection should probe orders access");
  assert.match(engine, /lineItems\(first: 1\)/, "Detection should probe line item access");
  assert.match(engine, /refunds\s*\{\s*id/s, "Detection should probe refund access");
  assert.match(engine, /export async function fetchShopifyFallbackOrderCount/, "Fallback should try to read ordersCount");
  assert.match(engine, /ordersCount\(query: "status:any"\)/, "Fallback order count should use Shopify ordersCount");
  assert.match(engine, /export function runShopifyAnalytics/, "Engine should expose a unified analytics runner");
  assert.match(engine, /function runFullAnalytics/, "Full mode should calculate exact metrics");
  assert.match(engine, /function runFallbackAnalytics/, "Fallback mode should calculate estimated metrics");
  assert.match(engine, /orderCount \* aov/, "Fallback revenue should be order count times AOV");
  assert.match(engine, /estimation_used: true/, "Fallback output should mark estimation used");
  assert.match(engine, /data_quality: "partial"/, "Fallback output should mark partial data quality");
  assert.match(engine, /confidence: orderCount > 0 \? 0\.55 : 0\.35/, "Fallback should lower confidence");

  assert.match(syncEngine, /detectShopifyDataMode\(client\)/, "Sync should detect data mode before normalization");
  assert.match(syncEngine, /dataMode === "FALLBACK"/, "Sync should branch for fallback mode");
  assert.match(syncEngine, /fetchShopifyFallbackOrderCount\(client\)/, "Sync should use fallback order count");
  assert.match(syncEngine, /runShopifyAnalytics\(/, "Sync should run dual mode analytics");
  assert.match(syncEngine, /data_mode: analytics\.mode/, "Manifest should include data mode");
  assert.match(syncEngine, /confidence_score: analytics\.confidence/, "Manifest should include confidence score");
  assert.match(syncEngine, /missing_fields: analytics\.missingFields/, "Manifest should include missing fields");
  assert.match(syncEngine, /estimation_used: analytics\.estimation_used/, "Manifest should include estimation flag");
  assert.match(syncEngine, /analytics,/, "Sync should persist analytics output in lineage/config");
  assert.doesNotMatch(syncEngine, /throw protectedShopifyDataAccessError\("Order"\)/, "Protected order access should not crash sync in fallback mode");

  assert.match(dashboard, /Data Quality: Partial/, "Dashboard should show partial data quality");
  assert.match(dashboard, /Data Quality: Full/, "Dashboard should show full data quality");
  assert.match(dashboard, /Some metrics are estimated due to Shopify API limitations/, "Dashboard should explain fallback estimation");
});
