ALTER TABLE "SchemaSnapshot"
  ADD COLUMN IF NOT EXISTS "schemaStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "canonicalStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "canonicalVersion" TEXT;

UPDATE "SchemaSnapshot"
SET
  "schemaStatus" = CASE
    WHEN status = 'CONNECTED' THEN 'READY'
    WHEN status = 'FAILED' THEN 'FAILED'
    ELSE COALESCE("schemaStatus", 'PENDING')
  END,
  "canonicalStatus" = CASE
    WHEN "schemaJson"->>'schemaVersion' = 'ecommerce_canonical_v1'
      OR "schemaJson"->>'schema_version' = 'ecommerce_canonical_v1'
      THEN 'READY'
    WHEN "schemaJson"->'unifiedIngestion'->>'status' = 'failed'
      OR "schemaJson"->'rawUploadSchema'->'unifiedIngestion'->>'status' = 'failed'
      THEN 'FAILED'
    ELSE COALESCE("canonicalStatus", 'NOT_STARTED')
  END,
  "canonicalVersion" = COALESCE(
    "canonicalVersion",
    "schemaJson"->>'schemaVersion',
    "schemaJson"->>'schema_version'
  );

CREATE TABLE IF NOT EXISTS "UnifiedIngestionJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "fileId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "metadataJson" JSONB,
  CONSTRAINT "UnifiedIngestionJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UnifiedIngestionJob_workspaceId_fkey'
  ) THEN
    ALTER TABLE "UnifiedIngestionJob"
      ADD CONSTRAINT "UnifiedIngestionJob_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UnifiedIngestionJob_workspaceId_status_idx"
  ON "UnifiedIngestionJob"("workspaceId", "status");

CREATE INDEX IF NOT EXISTS "UnifiedIngestionJob_workspaceId_createdAt_idx"
  ON "UnifiedIngestionJob"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "UnifiedIngestionJob_dataSourceId_idx"
  ON "UnifiedIngestionJob"("dataSourceId");
