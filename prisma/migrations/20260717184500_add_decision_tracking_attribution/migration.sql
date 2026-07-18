ALTER TABLE "DecisionOutcome"
  ADD COLUMN "baselineProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "expectedProfitChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "actualProfitChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "attributedProfitChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "organicProfitChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "profitVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "outcomeStatus" TEXT NOT NULL DEFAULT 'NEUTRAL',
  ADD COLUMN "attributionJson" JSONB;

ALTER TABLE "OptimizationDecision"
  ADD COLUMN "attributedProfitChange" DOUBLE PRECISION,
  ADD COLUMN "organicProfitChange" DOUBLE PRECISION,
  ADD COLUMN "outcomeStatus" TEXT,
  ADD COLUMN "attributionJson" JSONB;

CREATE TABLE "DecisionTrackingSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "dayIndex" INTEGER NOT NULL,
  "baselineMetrics" JSONB NOT NULL,
  "expectedMetrics" JSONB NOT NULL,
  "actualMetrics" JSONB NOT NULL,
  "attributedMetrics" JSONB,
  "organicMetrics" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionTrackingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionTrackingSnapshot_decisionId_snapshotDate_key" ON "DecisionTrackingSnapshot"("decisionId", "snapshotDate");
CREATE INDEX "DecisionTrackingSnapshot_workspaceId_snapshotDate_idx" ON "DecisionTrackingSnapshot"("workspaceId", "snapshotDate");
CREATE INDEX "DecisionTrackingSnapshot_workspaceId_decisionId_idx" ON "DecisionTrackingSnapshot"("workspaceId", "decisionId");

ALTER TABLE "DecisionTrackingSnapshot"
  ADD CONSTRAINT "DecisionTrackingSnapshot_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "DecisionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionTrackingSnapshot"
  ADD CONSTRAINT "DecisionTrackingSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
