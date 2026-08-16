ALTER TABLE "AsyncJob"
  ADD COLUMN IF NOT EXISTS "identity" TEXT,
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);

UPDATE "AsyncJob"
SET "failedAt" = COALESCE("failedAt", "completedAt")
WHERE "status" = 'FAILED'
  AND "completedAt" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AsyncJob_workspaceId_type_identity_key"
  ON "AsyncJob"("workspaceId", "type", "identity")
  WHERE "identity" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "AsyncJob_workspaceId_type_identity_status_idx"
  ON "AsyncJob"("workspaceId", "type", "identity", "status");

CREATE INDEX IF NOT EXISTS "AsyncJob_status_leaseExpiresAt_idx"
  ON "AsyncJob"("status", "leaseExpiresAt");
