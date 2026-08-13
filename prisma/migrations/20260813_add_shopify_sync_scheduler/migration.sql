ALTER TABLE "EcommerceConnectorAccount"
  ADD COLUMN IF NOT EXISTS "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAutoSyncAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAutoSyncSuccessAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "autoSyncFailureCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "EcommerceConnectorAccount"
SET
  "autoSyncEnabled" = COALESCE("autoSyncEnabled", true),
  "autoSyncFailureCount" = COALESCE("autoSyncFailureCount", 0),
  "syncIntervalMinutes" = CASE
    WHEN "syncIntervalMinutes" IN (60, 180, 360, 720, 1440) THEN "syncIntervalMinutes"
    ELSE 360
  END
WHERE provider = 'shopify';

UPDATE "EcommerceConnectorAccount"
SET "nextSyncAt" = "lastSyncedAt" + ("syncIntervalMinutes" || ' minutes')::interval
WHERE provider = 'shopify'
  AND "autoSyncEnabled" = true
  AND "nextSyncAt" IS NULL
  AND "lastSyncedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "EcommerceConnectorAccount_shopify_auto_sync_idx"
  ON "EcommerceConnectorAccount"("provider", "autoSyncEnabled", "nextSyncAt");

CREATE INDEX IF NOT EXISTS "EcommerceConnectorAccount_workspace_dataSource_shop_idx"
  ON "EcommerceConnectorAccount"("workspaceId", "dataSourceId", "shopDomain");
