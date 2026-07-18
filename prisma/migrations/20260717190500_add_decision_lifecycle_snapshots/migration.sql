ALTER TYPE "DecisionActionStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "DecisionActionStatus" ADD VALUE IF NOT EXISTS 'LEARNED';

CREATE TABLE "DecisionSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "snapshotType" TEXT NOT NULL,
  "acceptedAction" TEXT NOT NULL,
  "lifecycle" TEXT,
  "optimizationGoal" TEXT,
  "baselineMetrics" JSONB NOT NULL,
  "predictedMetrics" JSONB NOT NULL,
  "alternatives" JSONB NOT NULL,
  "reasoning" JSONB,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DecisionAction"
  ADD COLUMN "recommendedAction" TEXT,
  ADD COLUMN "optimizationGoal" TEXT,
  ADD COLUMN "lifecycleStage" TEXT,
  ADD COLUMN "baselineSnapshotId" TEXT,
  ADD COLUMN "predictionSnapshotId" TEXT,
  ADD COLUMN "executionStartedAt" TIMESTAMP(3),
  ADD COLUMN "executionCompletedAt" TIMESTAMP(3);

CREATE INDEX "DecisionSnapshot_workspaceId_skuId_idx" ON "DecisionSnapshot"("workspaceId", "skuId");
CREATE INDEX "DecisionSnapshot_workspaceId_snapshotType_idx" ON "DecisionSnapshot"("workspaceId", "snapshotType");
CREATE INDEX "DecisionSnapshot_createdAt_idx" ON "DecisionSnapshot"("createdAt");
CREATE INDEX "DecisionAction_baselineSnapshotId_idx" ON "DecisionAction"("baselineSnapshotId");
CREATE INDEX "DecisionAction_predictionSnapshotId_idx" ON "DecisionAction"("predictionSnapshotId");

ALTER TABLE "DecisionSnapshot"
  ADD CONSTRAINT "DecisionSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionAction"
  ADD CONSTRAINT "DecisionAction_baselineSnapshotId_fkey"
  FOREIGN KEY ("baselineSnapshotId") REFERENCES "DecisionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DecisionAction"
  ADD CONSTRAINT "DecisionAction_predictionSnapshotId_fkey"
  FOREIGN KEY ("predictionSnapshotId") REFERENCES "DecisionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
