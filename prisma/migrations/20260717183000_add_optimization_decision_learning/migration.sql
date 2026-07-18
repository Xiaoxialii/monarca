CREATE TABLE "OptimizationDecision" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "skuId" TEXT NOT NULL,
  "decisionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recommendedAction" TEXT NOT NULL,
  "optimizationGoal" TEXT NOT NULL,
  "lifecycleStage" TEXT,
  "expectedProfitImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedRevenueImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedCostChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedAdSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "alternativeActions" JSONB NOT NULL,
  "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "acceptedBy" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "executionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "executionStartDate" TIMESTAMP(3),
  "executionEndDate" TIMESTAMP(3),
  "actualRevenueChange" DOUBLE PRECISION,
  "actualProfitChange" DOUBLE PRECISION,
  "actualCostChange" DOUBLE PRECISION,
  "actualAdSpendChange" DOUBLE PRECISION,
  "predictionError" DOUBLE PRECISION,
  "learningStatus" TEXT NOT NULL DEFAULT 'PENDING_OUTCOME',
  "trackingActionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OptimizationDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OptimizationLearningRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "skuCategory" TEXT,
  "industry" TEXT,
  "lifecycle" TEXT,
  "action" TEXT NOT NULL,
  "prediction" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "error" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "confidence" DOUBLE PRECISION,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OptimizationLearningRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OptimizationDecision_workspaceId_decisionStatus_idx" ON "OptimizationDecision"("workspaceId", "decisionStatus");
CREATE INDEX "OptimizationDecision_workspaceId_skuId_idx" ON "OptimizationDecision"("workspaceId", "skuId");
CREATE INDEX "OptimizationDecision_workspaceId_recommendedAction_idx" ON "OptimizationDecision"("workspaceId", "recommendedAction");
CREATE INDEX "OptimizationDecision_trackingActionId_idx" ON "OptimizationDecision"("trackingActionId");
CREATE INDEX "OptimizationLearningRecord_workspaceId_action_idx" ON "OptimizationLearningRecord"("workspaceId", "action");
CREATE INDEX "OptimizationLearningRecord_workspaceId_lifecycle_idx" ON "OptimizationLearningRecord"("workspaceId", "lifecycle");
CREATE INDEX "OptimizationLearningRecord_createdAt_idx" ON "OptimizationLearningRecord"("createdAt");

ALTER TABLE "OptimizationDecision"
  ADD CONSTRAINT "OptimizationDecision_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OptimizationLearningRecord"
  ADD CONSTRAINT "OptimizationLearningRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
