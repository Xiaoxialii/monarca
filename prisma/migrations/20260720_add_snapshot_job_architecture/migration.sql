-- Snapshot/cache-driven dashboard architecture.

ALTER TABLE "DecisionSnapshot"
  ALTER COLUMN "skuId" SET DEFAULT 'workspace',
  ALTER COLUMN "acceptedAction" SET DEFAULT 'snapshot',
  ALTER COLUMN "baselineMetrics" SET DEFAULT '{}',
  ALTER COLUMN "predictedMetrics" SET DEFAULT '{}',
  ALTER COLUMN "alternatives" SET DEFAULT '[]';

ALTER TABLE "DecisionSnapshot"
  ADD COLUMN IF NOT EXISTS "optimizationType" TEXT,
  ADD COLUMN IF NOT EXISTS "assumptions" JSONB,
  ADD COLUMN IF NOT EXISTS "recommendationsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "expectedProfitImpact" DOUBLE PRECISION;

ALTER TABLE "MetricSnapshot"
  ADD COLUMN IF NOT EXISTS "dimensions" JSONB,
  ADD COLUMN IF NOT EXISTS "period" TEXT,
  ADD COLUMN IF NOT EXISTS "dataSourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "cacheKey" TEXT;

CREATE TABLE IF NOT EXISTS "ReportSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "contentJson" JSONB NOT NULL,
  "sourceSnapshotId" TEXT,
  "sourceSnapshotVersion" INTEGER,
  "cacheKey" TEXT,
  "warning" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BackgroundJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportSnapshot_workspaceId_fkey'
  ) THEN
    ALTER TABLE "ReportSnapshot"
      ADD CONSTRAINT "ReportSnapshot_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BackgroundJob_workspaceId_fkey'
  ) THEN
    ALTER TABLE "BackgroundJob"
      ADD CONSTRAINT "BackgroundJob_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DecisionSnapshot_workspaceId_optimizationType_createdAt_idx"
  ON "DecisionSnapshot"("workspaceId", "optimizationType", "createdAt");

CREATE INDEX IF NOT EXISTS "MetricSnapshot_workspaceId_dataSourceId_schemaVersion_period_idx"
  ON "MetricSnapshot"("workspaceId", "dataSourceId", "schemaVersion", "period");

CREATE UNIQUE INDEX IF NOT EXISTS "MetricSnapshot_workspaceId_cacheKey_key"
  ON "MetricSnapshot"("workspaceId", "cacheKey");

CREATE INDEX IF NOT EXISTS "ReportSnapshot_workspaceId_reportType_createdAt_idx"
  ON "ReportSnapshot"("workspaceId", "reportType", "createdAt");

CREATE INDEX IF NOT EXISTS "ReportSnapshot_workspaceId_periodStart_periodEnd_idx"
  ON "ReportSnapshot"("workspaceId", "periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "ReportSnapshot_sourceSnapshotId_idx"
  ON "ReportSnapshot"("sourceSnapshotId");

CREATE UNIQUE INDEX IF NOT EXISTS "ReportSnapshot_workspaceId_reportType_cacheKey_key"
  ON "ReportSnapshot"("workspaceId", "reportType", "cacheKey");

CREATE INDEX IF NOT EXISTS "BackgroundJob_workspaceId_type_status_idx"
  ON "BackgroundJob"("workspaceId", "type", "status");

CREATE INDEX IF NOT EXISTS "BackgroundJob_workspaceId_createdAt_idx"
  ON "BackgroundJob"("workspaceId", "createdAt");
