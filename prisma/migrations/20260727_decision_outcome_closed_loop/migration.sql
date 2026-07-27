-- Decision outcome closed loop.
-- Integrates with existing OptimizationDecision and DecisionAction tables.

CREATE TYPE "OptimizationRecommendationType" AS ENUM (
  'AD_OPTIMIZATION',
  'SKU_OPTIMIZATION',
  'INVENTORY_OPTIMIZATION'
);

CREATE TYPE "DecisionExecutionMetricType" AS ENUM (
  'AD',
  'SKU',
  'INVENTORY'
);

CREATE TYPE "DecisionOutcomeStatus" AS ENUM (
  'PENDING',
  'CALCULATED',
  'CONFIRMED',
  'INSUFFICIENT_DATA'
);

ALTER TABLE "OptimizationDecision"
  ADD COLUMN "recommendationType" "OptimizationRecommendationType" NOT NULL DEFAULT 'SKU_OPTIMIZATION',
  ADD COLUMN "targetEntityType" TEXT NOT NULL DEFAULT 'sku',
  ADD COLUMN "targetEntityId" TEXT,
  ADD COLUMN "recommendationJson" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "expectedMetricsJson" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "sourceDecisionSnapshotId" TEXT,
  ADD COLUMN "sourceReportSnapshotId" TEXT;

ALTER TABLE "DecisionAction"
  ADD COLUMN "recommendationId" TEXT;

CREATE TABLE "DecisionBaselineSnapshot" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "metricsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionBaselineSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionExecutionMetric" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "metricType" "DecisionExecutionMetricType" NOT NULL,
  "metricsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionExecutionMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionLearning" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "expectedProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "predictionError" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "accuracyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "learningJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionLearning_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DecisionOutcome"
  ADD COLUMN "recommendationId" TEXT,
  ADD COLUMN "baselineSnapshotId" TEXT,
  ADD COLUMN "evaluationPeriodStart" TIMESTAMP(3),
  ADD COLUMN "evaluationPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "expectedMetricsJson" JSONB,
  ADD COLUMN "actualMetricsJson" JSONB,
  ADD COLUMN "impactJson" JSONB,
  ADD COLUMN "status" "DecisionOutcomeStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "OptimizationDecision_workspaceId_recommendationType_idx" ON "OptimizationDecision"("workspaceId", "recommendationType");
CREATE INDEX "OptimizationDecision_workspaceId_targetEntityType_targetEntityId_idx" ON "OptimizationDecision"("workspaceId", "targetEntityType", "targetEntityId");
CREATE INDEX "DecisionAction_recommendationId_idx" ON "DecisionAction"("recommendationId");

CREATE INDEX "DecisionBaselineSnapshot_workspaceId_periodEnd_idx" ON "DecisionBaselineSnapshot"("workspaceId", "periodEnd");
CREATE INDEX "DecisionBaselineSnapshot_workspaceId_recommendationId_idx" ON "DecisionBaselineSnapshot"("workspaceId", "recommendationId");
CREATE UNIQUE INDEX "DecisionBaselineSnapshot_recommendationId_periodStart_periodEnd_key" ON "DecisionBaselineSnapshot"("recommendationId", "periodStart", "periodEnd");

CREATE UNIQUE INDEX "DecisionExecutionMetric_recommendationId_date_metricType_key" ON "DecisionExecutionMetric"("recommendationId", "date", "metricType");
CREATE INDEX "DecisionExecutionMetric_workspaceId_date_idx" ON "DecisionExecutionMetric"("workspaceId", "date");
CREATE INDEX "DecisionExecutionMetric_workspaceId_recommendationId_idx" ON "DecisionExecutionMetric"("workspaceId", "recommendationId");

CREATE INDEX "DecisionOutcome_recommendationId_idx" ON "DecisionOutcome"("recommendationId");
CREATE INDEX "DecisionOutcome_baselineSnapshotId_idx" ON "DecisionOutcome"("baselineSnapshotId");
CREATE INDEX "DecisionOutcome_evaluationPeriodEnd_idx" ON "DecisionOutcome"("evaluationPeriodEnd");

CREATE INDEX "DecisionLearning_workspaceId_recommendationId_idx" ON "DecisionLearning"("workspaceId", "recommendationId");
CREATE INDEX "DecisionLearning_workspaceId_accuracyScore_idx" ON "DecisionLearning"("workspaceId", "accuracyScore");
CREATE INDEX "DecisionLearning_createdAt_idx" ON "DecisionLearning"("createdAt");

ALTER TABLE "DecisionAction"
  ADD CONSTRAINT "DecisionAction_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "OptimizationDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DecisionBaselineSnapshot"
  ADD CONSTRAINT "DecisionBaselineSnapshot_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "OptimizationDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DecisionBaselineSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionExecutionMetric"
  ADD CONSTRAINT "DecisionExecutionMetric_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "OptimizationDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DecisionExecutionMetric_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionOutcome"
  ADD CONSTRAINT "DecisionOutcome_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "OptimizationDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DecisionOutcome_baselineSnapshotId_fkey"
  FOREIGN KEY ("baselineSnapshotId") REFERENCES "DecisionBaselineSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DecisionLearning"
  ADD CONSTRAINT "DecisionLearning_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "OptimizationDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DecisionLearning_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
