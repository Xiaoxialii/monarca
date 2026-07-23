ALTER TABLE "DecisionSnapshot"
  ADD COLUMN IF NOT EXISTS "algorithmVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "optimizationVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "canonicalSnapshotVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "metricSnapshotVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "simulationVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "inputHash" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DecisionSnapshot_workspaceId_optimizationType_inputHash_idx"
  ON "DecisionSnapshot"("workspaceId", "optimizationType", "inputHash");

CREATE INDEX IF NOT EXISTS "DecisionSnapshot_workspaceId_algorithmVersion_idx"
  ON "DecisionSnapshot"("workspaceId", "algorithmVersion");

CREATE TABLE IF NOT EXISTS "DecisionGenerationLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceJobId" TEXT,
  "decisionSnapshotId" TEXT,
  "optimizationType" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "optimizationVersion" TEXT NOT NULL,
  "canonicalSnapshotVersion" TEXT,
  "metricSnapshotVersion" TEXT,
  "simulationVersion" TEXT,
  "inputHash" TEXT,
  "simulationCount" INTEGER NOT NULL DEFAULT 0,
  "executionTimeMs" INTEGER NOT NULL DEFAULT 0,
  "resultSummary" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DecisionGenerationLog_workspaceId_optimizationType_createdAt_idx"
  ON "DecisionGenerationLog"("workspaceId", "optimizationType", "createdAt");

CREATE INDEX IF NOT EXISTS "DecisionGenerationLog_workspaceId_inputHash_idx"
  ON "DecisionGenerationLog"("workspaceId", "inputHash");

CREATE INDEX IF NOT EXISTS "DecisionGenerationLog_decisionSnapshotId_idx"
  ON "DecisionGenerationLog"("decisionSnapshotId");

CREATE INDEX IF NOT EXISTS "DecisionGenerationLog_sourceJobId_idx"
  ON "DecisionGenerationLog"("sourceJobId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DecisionGenerationLog_workspaceId_fkey'
  ) THEN
    ALTER TABLE "DecisionGenerationLog"
      ADD CONSTRAINT "DecisionGenerationLog_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
