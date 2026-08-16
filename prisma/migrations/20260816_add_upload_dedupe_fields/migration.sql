ALTER TABLE "DataSourceConnection"
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "sourceFingerprint" TEXT,
ADD COLUMN "supersedesDataSourceId" TEXT;

CREATE INDEX "DataSourceConnection_workspaceId_contentHash_idx"
ON "DataSourceConnection"("workspaceId", "contentHash");

CREATE INDEX "DataSourceConnection_workspaceId_sourceFingerprint_idx"
ON "DataSourceConnection"("workspaceId", "sourceFingerprint");
