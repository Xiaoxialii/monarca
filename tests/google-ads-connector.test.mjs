import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => fs.readFileSync(join(root, path), "utf8");

test("Google Ads connector exposes OAuth routes and required environment", () => {
  const env = read(".env.example");
  const connectRoute = read("app/api/connectors/google-ads/connect/route.ts");
  const callbackRoute = read("app/api/connectors/google-ads/callback/route.ts");
  const oauth = read("lib/connectors/google-ads/google-ads-oauth.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(env, /GOOGLE_ADS_CLIENT_ID/);
  assert.match(env, /GOOGLE_ADS_CLIENT_SECRET/);
  assert.match(env, /GOOGLE_ADS_OAUTH_REDIRECT_URI/);
  assert.match(env, /GOOGLE_ADS_DEVELOPER_TOKEN/);
  assert.match(env, /GOOGLE_ADS_LOGIN_CUSTOMER_ID/);
  assert.match(oauth, /https:\/\/www\.googleapis\.com\/auth\/adwords/);
  assert.match(connectRoute, /buildGoogleAdsAuthorizationUrl/);
  assert.match(callbackRoute, /exchangeGoogleAdsAuthorizationCode/);
  assert.match(dashboard, /Connect Google Ads|连接 Google Ads/);
  assert.match(dashboard, /provider:\s*"google_ads"/);
});

test("Google Ads credentials are encrypted and workspace scoped", () => {
  const callbackRoute = read("app/api/connectors/google-ads/callback/route.ts");
  const disconnectRoute = read("app/api/connectors/google-ads/disconnect/route.ts");
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /model GoogleAdsConnection \{/);
  assert.match(schema, /encryptedRefreshToken\s+String/);
  assert.match(schema, /@@unique\(\[workspaceId,\s*customerId\]\)/);
  assert.match(callbackRoute, /encryptedRefreshToken:\s*token\.encryptedRefreshToken/);
  assert.match(callbackRoute, /workspaceId:\s*input\.workspaceId/);
  assert.match(callbackRoute, /workspaceId_provider_shopDomain/);
  assert.match(disconnectRoute, /workspaceId:\s*session\.workspace\.id/);
  assert.doesNotMatch(callbackRoute, /refresh_token\s*:/i);
});

test("Google Ads sync normalizes campaign performance without SKU attribution", () => {
  const sync = read("lib/connectors/google-ads/google-ads-sync.ts");
  const client = read("lib/connectors/google-ads/google-ads-client.ts");
  const normalizer = read("lib/connectors/google-ads/google-ads-normalizer.ts");

  assert.match(client, /customers:listAccessibleCustomers/);
  assert.match(client, /googleAds:searchStream/);
  assert.match(client, /developer-token/);
  assert.match(client, /login-customer-id/);
  assert.match(client, /googleAdsUseMock\(\)/);
  assert.match(sync, /runGoogleAdsProductionSync/);
  assert.match(sync, /provider:\s*GOOGLE_ADS_PROVIDER/);
  assert.match(normalizer, /platform:\s*"google_ads"/);
  assert.match(normalizer, /advertising_data_available:\s*true/);
  assert.match(normalizer, /sku_attribution_available:\s*false/);
  assert.match(normalizer, /roas/);
  assert.match(normalizer, /cpa/);
});

test("Google Ads participates in shared connector scheduler and async job path", () => {
  const scheduler = read("lib/ecommerce-connectors/shopify-sync-scheduler.ts");
  const runner = read("lib/jobs/async-job-runner.ts");

  assert.match(scheduler, /SHOPIFY_PROVIDER,\s*AMAZON_PROVIDER,\s*GOOGLE_ADS_PROVIDER/);
  assert.match(scheduler, /payload:\s*\{[\s\S]*provider:\s*account\.provider[\s\S]*type:\s*"SYNC_CONNECTOR"/);
  assert.match(runner, /GOOGLE_ADS_PROVIDER/);
  assert.match(runner, /runGoogleAdsProductionSync/);
});

test("Google Ads sync settings route supports historical days and selected customer", () => {
  const settings = read("app/api/connectors/google-ads/sync-settings/route.ts");

  assert.match(settings, /historicalSyncDays/);
  assert.match(settings, /selectedCustomerId/);
  assert.match(settings, /isSupportedShopifySyncInterval/);
  assert.match(settings, /provider:\s*GOOGLE_ADS_PROVIDER/);
});
