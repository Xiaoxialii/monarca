CREATE TYPE "DecisionActionType" AS ENUM ('SCALE', 'REDUCE', 'OPTIMIZE', 'MONITOR');

CREATE TYPE "DecisionActionStatus" AS ENUM ('RECOMMENDED', 'ACCEPTED', 'EXECUTING', 'COMPLETED', 'EVALUATED', 'REJECTED');

CREATE TABLE "DecisionAction" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "actionType" "DecisionActionType" NOT NULL,
  "decisionDrivers" JSONB NOT NULL,
  "expectedImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualImpact" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "DecisionActionStatus" NOT NULL DEFAULT 'RECOMMENDED',
  "actionPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "evaluatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DecisionAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionOutcome" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "predictedProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "realizedProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "profitDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "accuracy" DOUBLE PRECISION,
  "learningSignals" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DecisionOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionOutcome_decisionId_key" ON "DecisionOutcome"("decisionId");
CREATE INDEX "DecisionAction_workspaceId_status_idx" ON "DecisionAction"("workspaceId", "status");
CREATE INDEX "DecisionAction_workspaceId_skuId_idx" ON "DecisionAction"("workspaceId", "skuId");
CREATE INDEX "DecisionAction_createdAt_idx" ON "DecisionAction"("createdAt");

ALTER TABLE "DecisionAction"
  ADD CONSTRAINT "DecisionAction_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionOutcome"
  ADD CONSTRAINT "DecisionOutcome_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "DecisionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
