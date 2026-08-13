import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => fs.readFileSync(join(root, path), "utf8");

test("Amazon connector exposes official OAuth routes and never asks for Seller Central passwords", () => {
  const connectRoute = read("app/api/connectors/amazon/connect/route.ts");
  const callbackRoute = read("app/api/connectors/amazon/callback/route.ts");
  const oauth = read("lib/connectors/amazon/amazon-oauth.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(connectRoute, /buildAmazonAuthorizationUrl/);
  assert.match(connectRoute, /dashboardRedirect\(request,\s*publicError\.code\)/);
  assert.match(oauth, /sellerCentralAuthorizeUrl/);
  assert.match(oauth, /application_id/);
  assert.match(callbackRoute, /spapi_oauth_code/);
  assert.match(callbackRoute, /selling_partner_id/);
  assert.match(callbackRoute, /exchangeAmazonAuthorizationCode/);
  assert.match(dashboard, /Connect Amazon|连接 Amazon/);
  assert.match(dashboard, /lowerName\.includes\("amazon"\)[\s\S]*provider === "amazon"/);
  assert.match(dashboard, /amazonConnectorErrorMessage/);
  assert.doesNotMatch(dashboard, /Seller Central password|amazon password|Amazon password/i);
});

test("Amazon credentials are encrypted server-side and scoped by workspace/provider/seller", () => {
  const callbackRoute = read("app/api/connectors/amazon/callback/route.ts");
  const oauth = read("lib/connectors/amazon/amazon-oauth.ts");
  const disconnectRoute = read("app/api/connectors/amazon/disconnect/route.ts");

  assert.match(oauth, /encryptedRefreshToken:\s*encryptConnectorToken/);
  assert.match(callbackRoute, /workspaceId_provider_shopDomain/);
  assert.match(callbackRoute, /workspaceId:\s*state\.workspaceId/);
  assert.match(callbackRoute, /provider:\s*AMAZON_PROVIDER/);
  assert.match(disconnectRoute, /workspaceId:\s*session\.workspace\.id/);
  assert.match(disconnectRoute, /provider:\s*AMAZON_PROVIDER/);
});

test("Amazon sync uses SP-API client, canonical normalization, idempotency, and does not advance lastSyncedAt on failure", () => {
  const sync = read("lib/connectors/amazon/amazon-sync.ts");
  const client = read("lib/connectors/amazon/amazon-client.ts");
  const normalizer = read("lib/connectors/amazon/amazon-normalizer.ts");

  assert.match(client, /x-amz-access-token/);
  assert.match(client, /AWS4-HMAC-SHA256/);
  assert.match(client, /fetchAllAmazonPages/);
  assert.match(sync, /idempotencyKey/);
  assert.match(sync, /runAmazonProductionSync/);
  assert.match(sync, /lastSyncedAt:\s*successfulSyncTime/);
  assert.match(sync, /catch \(error\)[\s\S]*ecommerceSyncRun\.update[\s\S]*status:\s*"failed"/);
  assert.doesNotMatch(sync, /catch \(error\)[\s\S]*lastSyncedAt:/);
  assert.match(normalizer, /source_provider:\s*AMAZON_PROVIDER/);
  assert.match(normalizer, /source_order_id/);
  assert.match(normalizer, /source_line_item_id/);
  assert.match(normalizer, /ecommerce_inventory/);
  assert.match(normalizer, /platform_fee/);
  assert.match(normalizer, /cogs_status:\s*"missing"/);
});

test("Amazon participates in the shared scheduled connector job path", () => {
  const scheduler = read("lib/ecommerce-connectors/shopify-sync-scheduler.ts");
  const runner = read("lib/jobs/async-job-runner.ts");
  const cronRoute = read("app/api/cron/shopify-sync/route.ts");

  assert.match(scheduler, /provider:\s*\{\s*in:\s*\[SHOPIFY_PROVIDER,\s*AMAZON_PROVIDER\]/);
  assert.match(scheduler, /payload:\s*\{[\s\S]*provider:\s*account\.provider[\s\S]*type:\s*"SYNC_CONNECTOR"/);
  assert.match(runner, /provider === AMAZON_PROVIDER[\s\S]*runAmazonProductionSync/);
  assert.match(runner, /provider,\s*[\s\S]*dataSourceId[\s\S]*connectorAccountId[\s\S]*shopDomain/);
  assert.match(cronRoute, /enqueueDueShopifySyncs\(prisma/);
});

test("Amazon sync settings API validates allowlisted frequency and calculates nextSyncAt", () => {
  const settings = read("app/api/connectors/amazon/sync-settings/route.ts");

  assert.match(settings, /requireWorkspace/);
  assert.match(settings, /provider:\s*AMAZON_PROVIDER/);
  assert.match(settings, /isSupportedShopifySyncInterval\(interval\)/);
  assert.match(settings, /nextShopifySyncAt/);
  assert.match(settings, /nextSyncAt:\s*updated\.nextSyncAt/);
});
