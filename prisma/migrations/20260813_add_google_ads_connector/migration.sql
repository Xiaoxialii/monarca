CREATE TABLE "GoogleAdsConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT,
  "customerId" TEXT NOT NULL,
  "loginCustomerId" TEXT,
  "encryptedRefreshToken" TEXT NOT NULL,
  "accessTokenLastRefreshedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'connected',
  "lastSyncedAt" TIMESTAMP(3),
  "syncCursor" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleAdsConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAdsConnection_workspaceId_customerId_key" ON "GoogleAdsConnection"("workspaceId", "customerId");
CREATE INDEX "GoogleAdsConnection_workspaceId_dataSourceId_idx" ON "GoogleAdsConnection"("workspaceId", "dataSourceId");
CREATE INDEX "GoogleAdsConnection_workspaceId_status_idx" ON "GoogleAdsConnection"("workspaceId", "status");

ALTER TABLE "GoogleAdsConnection"
ADD CONSTRAINT "GoogleAdsConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleAdsConnection"
ADD CONSTRAINT "GoogleAdsConnection_dataSourceId_fkey"
FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
