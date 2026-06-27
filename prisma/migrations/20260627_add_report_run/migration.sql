CREATE TABLE IF NOT EXISTS "ReportRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "generatedByUserId" TEXT,
  "primaryDataSourceId" TEXT,
  "dataSourceIds" JSONB NOT NULL,
  "reportMode" TEXT NOT NULL,
  "dateRangeStart" TIMESTAMP(3),
  "dateRangeEnd" TIMESTAMP(3),
  "sourceSnapshotVersion" INTEGER,
  "schemaSnapshotId" TEXT,
  "semanticSnapshotVersion" TEXT,
  "semanticSchemaHash" TEXT,
  "domain" TEXT,
  "cacheKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "payloadJson" JSONB NOT NULL,
  "composedReportJson" JSONB,
  "briefingPayloadJson" JSONB,
  "reportHistoryId" TEXT,
  "dailyBriefingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportRun_workspaceId_cacheKey_key" ON "ReportRun"("workspaceId", "cacheKey");
CREATE INDEX IF NOT EXISTS "ReportRun_workspaceId_primaryDataSourceId_idx" ON "ReportRun"("workspaceId", "primaryDataSourceId");
CREATE INDEX IF NOT EXISTS "ReportRun_workspaceId_reportMode_idx" ON "ReportRun"("workspaceId", "reportMode");
CREATE INDEX IF NOT EXISTS "ReportRun_workspaceId_createdAt_idx" ON "ReportRun"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportRun_workspaceId_sourceSnapshotVersion_idx" ON "ReportRun"("workspaceId", "sourceSnapshotVersion");

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_generatedByUserId_fkey"
  FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_primaryDataSourceId_fkey"
  FOREIGN KEY ("primaryDataSourceId") REFERENCES "DataSourceConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_schemaSnapshotId_fkey"
  FOREIGN KEY ("schemaSnapshotId") REFERENCES "SchemaSnapshot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
