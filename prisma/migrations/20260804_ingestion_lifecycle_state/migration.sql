ALTER TABLE "UnifiedIngestionJob"
  ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "UnifiedIngestionJob"
SET
  "lastHeartbeatAt" = COALESCE("lastHeartbeatAt", "heartbeatAt"),
  "attemptCount" = GREATEST("attemptCount", "retryCount");

CREATE INDEX IF NOT EXISTS "UnifiedIngestionJob_status_lastHeartbeatAt_idx"
  ON "UnifiedIngestionJob"("status", "lastHeartbeatAt");
