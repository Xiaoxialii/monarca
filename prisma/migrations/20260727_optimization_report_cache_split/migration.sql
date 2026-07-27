CREATE TABLE "OptimizationReportCache" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "hasConnectedDataSource" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT,
  "warning" TEXT,
  "generatedAt" TIMESTAMP(3),
  "sourcePlatforms" JSONB NOT NULL DEFAULT '[]',
  "lineageJson" JSONB,
  "profitDataCoverage" INTEGER,
  "optimizationLevel" TEXT,
  "confidenceScore" DOUBLE PRECISION,
  "missingDataRequirements" JSONB NOT NULL DEFAULT '[]',
  "reportShellJson" JSONB NOT NULL DEFAULT '{}',
  "portfolioOptimizationJson" JSONB NOT NULL DEFAULT '{}',
  "queueRowsJson" JSONB NOT NULL DEFAULT '[]',
  "portfolioRowsJson" JSONB NOT NULL DEFAULT '[]',
  "portfolioSummaryJson" JSONB,
  "allocationRecommendationJson" JSONB,
  "riskAlertsJson" JSONB NOT NULL DEFAULT '[]',
  "executionPlanJson" JSONB NOT NULL DEFAULT '[]',
  "algorithmVersion" TEXT,
  "optimizationVersion" TEXT,
  "canonicalSnapshotVersion" TEXT,
  "metricSnapshotVersion" TEXT,
  "simulationVersion" TEXT,
  "inputHash" TEXT,
  "sourceReportSnapshotId" TEXT,
  "sourceDecisionSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OptimizationReportCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OptimizationReportCache_workspaceId_mode_key" ON "OptimizationReportCache"("workspaceId", "mode");
CREATE INDEX "OptimizationReportCache_workspaceId_mode_updatedAt_idx" ON "OptimizationReportCache"("workspaceId", "mode", "updatedAt");
CREATE INDEX "OptimizationReportCache_workspaceId_inputHash_idx" ON "OptimizationReportCache"("workspaceId", "inputHash");

ALTER TABLE "OptimizationReportCache"
  ADD CONSTRAINT "OptimizationReportCache_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
