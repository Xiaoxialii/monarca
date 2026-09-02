ALTER TABLE "DecisionSnapshot"
  ADD COLUMN IF NOT EXISTS "profitabilityEngineVersion" TEXT;

ALTER TABLE "OptimizationReportCache"
  ADD COLUMN IF NOT EXISTS "profitabilityEngineVersion" TEXT;

CREATE INDEX IF NOT EXISTS "DecisionSnapshot_workspaceId_profitabilityEngineVersion_idx"
  ON "DecisionSnapshot"("workspaceId", "profitabilityEngineVersion");

CREATE INDEX IF NOT EXISTS "OptimizationReportCache_workspaceId_profitabilityEngineVersion_idx"
  ON "OptimizationReportCache"("workspaceId", "profitabilityEngineVersion");
