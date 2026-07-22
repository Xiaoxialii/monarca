-- Unified asynchronous job and snapshot metadata layer.
-- Existing domain-specific job/snapshot tables remain in place during migration.

CREATE TABLE IF NOT EXISTS "AsyncJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "payload" JSONB,
  "resultReference" JSONB,
  "errorMessage" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "heartbeatAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Snapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceJobId" TEXT,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "dataReference" JSONB,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AsyncJob_workspaceId_fkey'
  ) THEN
    ALTER TABLE "AsyncJob"
      ADD CONSTRAINT "AsyncJob_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Snapshot_workspaceId_fkey'
  ) THEN
    ALTER TABLE "Snapshot"
      ADD CONSTRAINT "Snapshot_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Snapshot_sourceJobId_fkey'
  ) THEN
    ALTER TABLE "Snapshot"
      ADD CONSTRAINT "Snapshot_sourceJobId_fkey"
      FOREIGN KEY ("sourceJobId") REFERENCES "AsyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AsyncJob_workspaceId_type_status_idx"
  ON "AsyncJob"("workspaceId", "type", "status");

CREATE INDEX IF NOT EXISTS "AsyncJob_workspaceId_createdAt_idx"
  ON "AsyncJob"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "AsyncJob_status_heartbeatAt_idx"
  ON "AsyncJob"("status", "heartbeatAt");

CREATE INDEX IF NOT EXISTS "AsyncJob_status_updatedAt_idx"
  ON "AsyncJob"("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "Snapshot_workspaceId_type_createdAt_idx"
  ON "Snapshot"("workspaceId", "type", "createdAt");

CREATE INDEX IF NOT EXISTS "Snapshot_sourceJobId_idx"
  ON "Snapshot"("sourceJobId");

CREATE INDEX IF NOT EXISTS "Snapshot_workspaceId_status_idx"
  ON "Snapshot"("workspaceId", "status");
