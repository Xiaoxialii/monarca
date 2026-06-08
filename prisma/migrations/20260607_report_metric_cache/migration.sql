CREATE TABLE "ReportMetricCache" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceIds" JSONB,
  "metricIds" JSONB,
  "dateField" TEXT,
  "dateRangePreset" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "filtersHash" TEXT NOT NULL DEFAULT 'none',
  "cacheKey" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "sourceSnapshotVersion" INTEGER,
  "refreshStatus" TEXT NOT NULL DEFAULT 'fresh',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "staleAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportMetricCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportMetricCache_cacheKey_key" ON "ReportMetricCache"("cacheKey");
CREATE INDEX "ReportMetricCache_workspaceId_dateRangePreset_startDate_endDate_idx" ON "ReportMetricCache"("workspaceId", "dateRangePreset", "startDate", "endDate");
CREATE INDEX "ReportMetricCache_workspaceId_refreshStatus_staleAt_idx" ON "ReportMetricCache"("workspaceId", "refreshStatus", "staleAt");

ALTER TABLE "ReportMetricCache"
  ADD CONSTRAINT "ReportMetricCache_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
