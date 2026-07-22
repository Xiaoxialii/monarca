ALTER TABLE "UnifiedIngestionJob"
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "UnifiedIngestionJob_status_heartbeatAt_idx"
  ON "UnifiedIngestionJob"("status", "heartbeatAt");
