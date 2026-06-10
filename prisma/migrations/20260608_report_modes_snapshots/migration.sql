CREATE TABLE IF NOT EXISTS "MetricSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metricId" TEXT,
  "metricName" TEXT NOT NULL,
  "displayName" TEXT,
  "value" DOUBLE PRECISION,
  "valueJson" JSONB,
  "unit" TEXT,
  "scope" TEXT,
  "grain" TEXT,
  "businessModule" TEXT,
  "sourceDataset" TEXT,
  "dateField" TEXT,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "dateRangePreset" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "metricId" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "metricName" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "valueJson" JSONB;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "grain" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "businessModule" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "sourceDataset" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "dateField" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "snapshotDate" TIMESTAMP(3);
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "dateRangePreset" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "calculatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ReportHistory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reportMode" TEXT NOT NULL,
  "reportTimeMode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summaryJson" JSONB,
  "contentJson" JSONB,
  "selectedDateRange" JSONB,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReportHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "reportMode" TEXT;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "reportTimeMode" TEXT;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "summaryJson" JSONB;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "contentJson" JSONB;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "selectedDateRange" JSONB;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'completed';
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ReportHistory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "MetricSnapshot_workspaceId_metricName_snapshotDate_idx" ON "MetricSnapshot"("workspaceId", "metricName", "snapshotDate");
CREATE INDEX IF NOT EXISTS "MetricSnapshot_workspaceId_snapshotDate_idx" ON "MetricSnapshot"("workspaceId", "snapshotDate");
CREATE INDEX IF NOT EXISTS "MetricSnapshot_workspaceId_dateRangePreset_startDate_endDate_idx" ON "MetricSnapshot"("workspaceId", "dateRangePreset", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "ReportHistory_workspaceId_reportMode_generatedAt_idx" ON "ReportHistory"("workspaceId", "reportMode", "generatedAt");
CREATE INDEX IF NOT EXISTS "ReportHistory_workspaceId_generatedAt_idx" ON "ReportHistory"("workspaceId", "generatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MetricSnapshot_workspaceId_fkey'
  ) THEN
    ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportHistory_workspaceId_fkey'
  ) THEN
    ALTER TABLE "ReportHistory" ADD CONSTRAINT "ReportHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
