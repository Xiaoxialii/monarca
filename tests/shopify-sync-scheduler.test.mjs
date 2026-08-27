import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Shopify sync scheduler has production scheduling fields, API, and cron guardrails", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260813_add_shopify_sync_scheduler/migration.sql");
  const scheduler = read("lib/ecommerce-connectors/shopify-sync-scheduler.ts");
  const settingsRoute = read("app/api/connectors/shopify/sync-settings/route.ts");
  const cronRoute = read("app/api/cron/shopify-sync/route.ts");
  const callbackRoute = read("app/api/connectors/shopify/callback/route.ts");
  const vercelConfig = read("vercel.json");

  assert.match(schema, /autoSyncEnabled\s+Boolean\s+@default\(true\)/, "Connector account should store auto-sync enablement");
  assert.match(schema, /syncIntervalMinutes\s+Int\s+@default\(360\)/, "Connector account should default to a six-hour interval");
  assert.match(schema, /nextSyncAt\s+DateTime\?/, "Connector account should store next scheduled sync time");
  assert.match(schema, /lastAutoSyncAttemptAt\s+DateTime\?/, "Connector account should track automatic attempts");
  assert.match(schema, /lastAutoSyncSuccessAt\s+DateTime\?/, "Connector account should track automatic successes");
  assert.match(schema, /autoSyncFailureCount\s+Int\s+@default\(0\)/, "Connector account should store bounded backoff state");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true/, "Migration should add autoSyncEnabled safely");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 360/, "Migration should add interval safely");
  assert.match(migration, /"nextSyncAt" = "lastSyncedAt" \+ \("syncIntervalMinutes" \|\| ' minutes'\)::interval/, "Migration should derive nextSyncAt from lastSyncedAt");
  assert.match(migration, /WHERE provider = 'shopify'/, "Backfill should be scoped to Shopify accounts");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "EcommerceConnectorAccount_shopify_auto_sync_idx"/, "Migration should index scheduler scans");

  assert.match(callbackRoute, /autoSyncEnabled:\s*true/, "New Shopify OAuth accounts should enable automatic sync by default");
  assert.match(callbackRoute, /syncIntervalMinutes:\s*DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES/, "New Shopify OAuth accounts should default to six hours");

  assert.match(scheduler, /SHOPIFY_SYNC_INTERVAL_OPTIONS = \[60, 180, 360, 720, 1440\]/, "Scheduler should use the allowlisted intervals only");
  assert.match(scheduler, /SHOPIFY_SYNC_BATCH_SIZE = 50/, "Scheduler should scan due accounts in bounded batches");
  assert.match(scheduler, /provider:\s*\{\s*in:\s*\[SHOPIFY_PROVIDER,\s*AMAZON_PROVIDER,\s*GOOGLE_ADS_PROVIDER,\s*META_ADS_PROVIDER\]\s*\}[\s\S]*status:\s*"connected"[\s\S]*autoSyncEnabled:\s*true/, "Scheduler should select only enabled connected connector accounts");
  assert.match(scheduler, /dataSource:\s*\{[\s\S]*isActive:\s*true[\s\S]*status:\s*ConnectionStatus\.CONNECTED/, "Scheduler should require an active connected data source");
  assert.match(scheduler, /OR:\s*\[\s*\{\s*nextSyncAt:\s*null\s*\},\s*\{\s*nextSyncAt:\s*\{\s*lte:\s*now\s*\}\s*\}/, "Scheduler should select null-or-due nextSyncAt accounts");
  assert.match(scheduler, /activeSyncJobForAccount/, "Scheduler should check for active sync jobs before enqueueing");
  assert.match(scheduler, /activeSyncRunForAccount/, "Scheduler should check for active sync runs before enqueueing");
  assert.match(scheduler, /status:\s*\{\s*in:\s*\[\.\.\.ACTIVE_JOB_STATUSES\]\s*\}/, "Scheduler should treat queued/processing jobs as active");
  assert.match(scheduler, /status:\s*"running"/, "Scheduler should treat running sync runs as active");
  assert.match(scheduler, /updateMany\(\{[\s\S]*lastAutoSyncAttemptAt:\s*now/, "Scheduler should atomically claim due accounts");
  assert.match(scheduler, /claimed\.count !== 1/, "Scheduler should tolerate duplicate cron workers losing the claim");
  assert.match(scheduler, /type:\s*"SYNC_CONNECTOR"[\s\S]*trigger:\s*"scheduled"/, "Scheduler should enqueue shared connector sync jobs");
  assert.match(scheduler, /maxRetries:\s*0/, "Scheduled jobs should use account-level backoff rather than immediate worker retries");
  assert.match(scheduler, /FAILURE_BACKOFF_MINUTES = \[30, 60, 180\]/, "Scheduler should apply bounded failure backoff");
  assert.match(scheduler, /SHOPIFY_SYNC_SCHEDULER_STARTED/, "Scheduler should log start events");
  assert.match(scheduler, /SHOPIFY_SYNC_ACCOUNT_DUE/, "Scheduler should log due accounts");
  assert.match(scheduler, /SHOPIFY_SYNC_ENQUEUED/, "Scheduler should log enqueues");
  assert.match(scheduler, /SHOPIFY_SYNC_SKIPPED_ACTIVE_JOB/, "Scheduler should log duplicate skips");
  assert.match(scheduler, /SHOPIFY_SYNC_AUTH_REVOKED/, "Scheduler should log revoked auth");
  assert.match(scheduler, /status:\s*"needs_reconnection"/, "Revoked Shopify credentials should stop automatic retries");
  assert.match(scheduler, /ConnectionStatus\.PENDING/, "Revoked credentials should surface reconnection status to the UI");

  assert.match(settingsRoute, /requireWorkspace\(\)/, "Settings API should require authenticated workspace context");
  assert.match(settingsRoute, /dataSourceId/, "Settings API should address the Shopify source by dataSourceId");
  assert.match(settingsRoute, /isSupportedShopifySyncInterval/, "Settings API should validate frequencies server-side");
  assert.doesNotMatch(settingsRoute, /workspaceId.*body|body.*workspaceId/, "Settings API must not trust client-supplied workspaceId");
  assert.match(scheduler, /workspaceId:\s*input\.workspaceId[\s\S]*dataSourceId:\s*input\.dataSourceId/, "Settings update should be workspace and source scoped");
  assert.match(scheduler, /lastSyncedAt[\s\S]*nextShopifySyncAt/, "Settings update should recalculate nextSyncAt from lastSyncedAt");
  assert.match(scheduler, /input\.autoSyncEnabled[\s\S]*:\s*null/, "Manual-only settings should clear nextSyncAt");

  assert.match(cronRoute, /process\.env\.CRON_SECRET/, "Cron endpoint should require a server-side secret");
  assert.match(cronRoute, /authorization === `Bearer \$\{secret\}`/, "Cron endpoint should accept bearer cron secret");
  assert.match(cronRoute, /enqueueDueShopifySyncs\(prisma/, "Cron endpoint should delegate to the scheduler service");
  assert.match(cronRoute, /after\(\(\) =>[\s\S]*processJob\(item\.jobId\)/, "Cron endpoint should return quickly and process queued jobs asynchronously");
  assert.match(vercelConfig, /"path":\s*"\/api\/cron\/shopify-sync"/, "Vercel Cron should call the global Shopify scheduler entrypoint");
  assert.match(vercelConfig, /"0 0 \* \* \*"/, "Vercel Cron should use a Hobby-compatible daily schedule while per-account nextSyncAt controls actual sync cadence");
});

test("Scheduled Shopify sync reuses the existing production sync engine and preserves workspace isolation", () => {
  const runner = read("lib/jobs/async-job-runner.ts");
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const dataSourcesRoute = read("app/api/data-sources/route.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(runner, /case "SYNC_CONNECTOR":\s*return processConnectorSyncAsyncJob/, "Async worker should handle scheduled connector sync jobs");
  assert.match(runner, /runShopifyProductionSync\(client,\s*\{[\s\S]*workspaceId:\s*input\.workspaceId[\s\S]*dataSourceId[\s\S]*trigger[\s\S]*force:\s*false/, "Scheduled jobs should reuse the existing Shopify production sync engine while preserving sync-level idempotency");
  assert.match(runner, /workspaceId:\s*input\.workspaceId[\s\S]*provider,\s*[\s\S]*shopDomain[\s\S]*dataSourceId/, "Worker should scope connector account lookup by workspace/provider/source/shop");
  assert.match(runner, /dataSource:\s*\{[\s\S]*workspaceId:\s*input\.workspaceId[\s\S]*isActive:\s*true/, "Worker should verify the source belongs to the same workspace");
  assert.match(runner, /markShopifyScheduledSyncFailure/, "Worker should delegate scheduled failure handling to scheduler service");
  assert.match(runner, /SHOPIFY_SYNC_SUCCESS/, "Worker should log successful scheduled syncs");
  assert.match(runner, /SHOPIFY_SYNC_FAILED/, "Worker should log failed scheduled syncs");

  assert.match(syncEngine, /trigger\?:\s*"initial" \| "manual" \| "scheduled"/, "Sync engine should accept the scheduled trigger without a second ingestion path");
  assert.match(syncEngine, /updated_at:>=/, "Scheduled sync should preserve incremental updated_at filtering");
  assert.match(syncEngine, /SAFETY_OVERLAP_MS/, "Scheduled sync should preserve safety overlap semantics");
  assert.match(syncEngine, /lastSyncedAt:\s*successfulSyncTime/, "Successful sync should advance lastSyncedAt");
  assert.match(syncEngine, /lastAutoSyncSuccessAt:\s*successfulSyncTime/, "Scheduled success should track last automatic success");
  assert.match(syncEngine, /nextSyncAt:\s*new Date\(successfulSyncTime\.getTime\(\) \+ account\.syncIntervalMinutes \* 60 \* 1000\)/, "Successful sync should calculate nextSyncAt from success time plus interval");
  assert.match(syncEngine, /type:\s*"CALCULATE_METRICS"/, "Shopify sync should keep metrics enqueueing in the existing pipeline");
  assert.doesNotMatch(syncEngine, /OPTIMIZATION|SIMULATION|runOptimization/i, "Shopify sync must not blindly trigger full optimization");

  assert.match(dataSourcesRoute, /ecommerceConnectorAccounts:\s*\{[\s\S]*autoSyncEnabled[\s\S]*syncIntervalMinutes[\s\S]*nextSyncAt/, "Data source API should expose Shopify sync settings");
  assert.match(dashboard, /SHOPIFY_SYNC_FREQUENCY_OPTIONS/, "Dashboard should render allowlisted Shopify sync frequencies");
  assert.match(dashboard, /\/api\/connectors\/shopify\/sync-settings/, "Dashboard should save Shopify sync settings through the scoped API");
  assert.match(dashboard, /labels\.syncSettings/, "Dashboard should add a compact Sync Settings section");
  assert.match(dashboard, /labels\.manualOnly/, "Dashboard should support Manual only display");
  assert.match(dashboard, /savingShopifySyncSettingsSourceId/, "Dashboard should disable settings controls while saving");
  assert.match(dashboard, /disabled=\{syncingShopifySourceId === source\.id\}/, "Dashboard should disable repeated Sync now clicks for an active source sync");
});
