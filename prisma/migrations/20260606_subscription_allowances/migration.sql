-- Workspace subscription entitlements.
-- This migration is intentionally non-destructive: legacy credit/subscription
-- tables and legacy WorkspaceSubscription columns are preserved for audit/backfill.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'FREE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'FREE';

DO $$
BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('NONE', 'ONE_TIME', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReportGenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WorkspaceSubscription" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "planType" "PlanType" NOT NULL DEFAULT 'FREE';
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "status" "SubscriptionStatus" NOT NULL DEFAULT 'FREE';
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" NOT NULL DEFAULT 'NONE';
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "provider" "BillingProvider" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "providerCustomerId" TEXT;
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "providerSubscriptionId" TEXT;
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "providerPaymentIntentId" TEXT;
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceSubscription" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceSubscription" ALTER COLUMN "planType" SET DEFAULT 'FREE';
ALTER TABLE "WorkspaceSubscription" ALTER COLUMN "billingCycle" SET DEFAULT 'NONE';
ALTER TABLE "WorkspaceSubscription" ALTER COLUMN "provider" SET DEFAULT 'MANUAL';
ALTER TABLE "WorkspaceSubscription" ALTER COLUMN "cancelAtPeriodEnd" SET DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'WorkspaceSubscription'
      AND column_name = 'plan'
  ) THEN
    EXECUTE '
      UPDATE "WorkspaceSubscription"
      SET
        "planType" = CASE
          WHEN "plan" IN (''PROFESSIONAL'', ''ENTERPRISE'', ''TRIAL'') THEN ''MONTHLY''::"PlanType"
          WHEN "plan" = ''DATABASE_SETUP'' THEN ''ONE_TIME''::"PlanType"
          ELSE "planType"
        END,
        "billingCycle" = CASE
          WHEN "plan" IN (''PROFESSIONAL'', ''ENTERPRISE'', ''TRIAL'') THEN ''MONTHLY''::"BillingCycle"
          WHEN "plan" = ''DATABASE_SETUP'' THEN ''ONE_TIME''::"BillingCycle"
          ELSE "billingCycle"
        END,
        "currentPeriodStart" = COALESCE("currentPeriodStart", "startPeriod", "startedAt"),
        "currentPeriodEnd" = COALESCE("currentPeriodEnd", "endPeriod", "endedAt", "trialEndsAt"),
        "canceledAt" = COALESCE("canceledAt", "cancelAt")
    ';
  END IF;
END $$;

UPDATE "WorkspaceSubscription"
SET "status" = 'FREE'::"SubscriptionStatus"
WHERE "status"::TEXT = 'PENDING';

ALTER TABLE "WorkspaceSubscription" ALTER COLUMN "status" SET DEFAULT 'FREE';

CREATE TABLE IF NOT EXISTS "WorkspaceUsageAllowance" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reportGenerationsAllowed" INTEGER NOT NULL DEFAULT 0,
  "reportGenerationsUsed" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceUsageAllowance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportGenerationJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reportId" TEXT,
  "status" "ReportGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportGenerationJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceSubscription_providerSubscriptionId_key" ON "WorkspaceSubscription"("providerSubscriptionId");
CREATE INDEX IF NOT EXISTS "WorkspaceSubscription_workspaceId_status_idx" ON "WorkspaceSubscription"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "WorkspaceSubscription_workspaceId_planType_idx" ON "WorkspaceSubscription"("workspaceId", "planType");
CREATE INDEX IF NOT EXISTS "WorkspaceSubscription_providerPaymentIntentId_idx" ON "WorkspaceSubscription"("providerPaymentIntentId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceUsageAllowance_workspaceId_referenceId_key" ON "WorkspaceUsageAllowance"("workspaceId", "referenceId");
CREATE INDEX IF NOT EXISTS "WorkspaceUsageAllowance_workspaceId_createdAt_idx" ON "WorkspaceUsageAllowance"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportGenerationJob_workspaceId_status_createdAt_idx" ON "ReportGenerationJob"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportGenerationJob_reportId_idx" ON "ReportGenerationJob"("reportId");
CREATE INDEX IF NOT EXISTS "PaymentOrder_workspaceId_status_idx" ON "PaymentOrder"("workspaceId", "status");

DO $$
BEGIN
  ALTER TABLE "WorkspaceSubscription"
    ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "WorkspaceUsageAllowance"
    ADD CONSTRAINT "WorkspaceUsageAllowance_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ReportGenerationJob"
    ADD CONSTRAINT "ReportGenerationJob_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
