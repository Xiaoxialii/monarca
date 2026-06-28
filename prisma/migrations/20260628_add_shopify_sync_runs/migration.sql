CREATE TABLE "EcommerceSyncRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "syncWindowStart" TIMESTAMP(3),
  "syncWindowEnd" TIMESTAMP(3),
  "cursorJson" JSONB,
  "rowsPulled" INTEGER NOT NULL DEFAULT 0,
  "rowsNormalized" INTEGER NOT NULL DEFAULT 0,
  "rowsRejected" INTEGER NOT NULL DEFAULT 0,
  "manifestKey" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EcommerceSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EcommerceSyncArtifact" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "tableName" TEXT,
  "artifactKey" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EcommerceSyncArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcommerceSyncRun_syncRunId_key" ON "EcommerceSyncRun"("syncRunId");
CREATE UNIQUE INDEX "EcommerceSyncRun_workspaceId_dataSourceId_provider_shopDomain_idempotencyKey_key" ON "EcommerceSyncRun"("workspaceId", "dataSourceId", "provider", "shopDomain", "idempotencyKey");
CREATE INDEX "EcommerceSyncRun_workspaceId_dataSourceId_provider_idx" ON "EcommerceSyncRun"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "EcommerceSyncRun_connectorAccountId_startedAt_idx" ON "EcommerceSyncRun"("connectorAccountId", "startedAt");

CREATE INDEX "EcommerceSyncArtifact_workspaceId_dataSourceId_provider_idx" ON "EcommerceSyncArtifact"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "EcommerceSyncArtifact_syncRunId_idx" ON "EcommerceSyncArtifact"("syncRunId");
CREATE UNIQUE INDEX "EcommerceSyncArtifact_syncRunId_artifactKey_key" ON "EcommerceSyncArtifact"("syncRunId", "artifactKey");

ALTER TABLE "EcommerceSyncRun" ADD CONSTRAINT "EcommerceSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceSyncRun" ADD CONSTRAINT "EcommerceSyncRun_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceSyncRun" ADD CONSTRAINT "EcommerceSyncRun_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "EcommerceConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EcommerceSyncArtifact" ADD CONSTRAINT "EcommerceSyncArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceSyncArtifact" ADD CONSTRAINT "EcommerceSyncArtifact_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceSyncArtifact" ADD CONSTRAINT "EcommerceSyncArtifact_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "EcommerceConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceSyncArtifact" ADD CONSTRAINT "EcommerceSyncArtifact_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "EcommerceSyncRun"("syncRunId") ON DELETE CASCADE ON UPDATE CASCADE;
