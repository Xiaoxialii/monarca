-- Decision intelligence runtime learning fields.

ALTER TABLE "DecisionLearning"
  ADD COLUMN "actionType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "featureSnapshot" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incrementalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "learningPattern" TEXT;

CREATE INDEX "DecisionLearning_workspaceId_actionType_idx" ON "DecisionLearning"("workspaceId", "actionType");
CREATE INDEX "DecisionLearning_workspaceId_actionType_createdAt_idx" ON "DecisionLearning"("workspaceId", "actionType", "createdAt");
