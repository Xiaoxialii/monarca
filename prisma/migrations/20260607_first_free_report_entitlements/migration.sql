CREATE TABLE IF NOT EXISTS "ReportEntitlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "firstFreeReportUsed" BOOLEAN NOT NULL DEFAULT false,
    "firstFreeReportUsedAt" TIMESTAMP(3),
    "oneTimeReportAvailable" BOOLEAN NOT NULL DEFAULT false,
    "oneTimeReportPurchasedAt" TIMESTAMP(3),
    "oneTimeReportUsedAt" TIMESTAMP(3),
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'free',
    "subscriptionPlan" TEXT DEFAULT 'free',
    "monthlyUnlimited" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportGenerationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportId" TEXT,
    "reportType" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportEntitlement_workspaceId_key" ON "ReportEntitlement"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportGenerationLog_idempotencyKey_key" ON "ReportGenerationLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ReportGenerationLog_workspaceId_status_createdAt_idx" ON "ReportGenerationLog"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportGenerationLog_reportId_idx" ON "ReportGenerationLog"("reportId");

ALTER TABLE "ReportEntitlement"
  ADD CONSTRAINT "ReportEntitlement_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportGenerationLog"
  ADD CONSTRAINT "ReportGenerationLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ReportEntitlement" (
    "id",
    "workspaceId",
    "firstFreeReportUsed",
    "firstFreeReportUsedAt",
    "oneTimeReportAvailable",
    "subscriptionStatus",
    "subscriptionPlan",
    "monthlyUnlimited",
    "currentPeriodStart",
    "currentPeriodEnd",
    "createdAt",
    "updatedAt"
)
SELECT
    're_' || md5(random()::text || clock_timestamp()::text || w."id"),
    w."id",
    EXISTS (
      SELECT 1
      FROM "DailyBriefing" b
      WHERE b."workspaceId" = w."id"
    ),
    (
      SELECT MIN(b."createdAt")
      FROM "DailyBriefing" b
      WHERE b."workspaceId" = w."id"
    ),
    EXISTS (
      SELECT 1
      FROM "WorkspaceUsageAllowance" a
      WHERE a."workspaceId" = w."id"
        AND a."reportGenerationsAllowed" > a."reportGenerationsUsed"
    ),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM "WorkspaceSubscription" s
        WHERE s."workspaceId" = w."id"
          AND s."planType" = 'MONTHLY'
          AND s."status" IN ('ACTIVE', 'TRIALING')
          AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > CURRENT_TIMESTAMP)
      ) THEN 'active'
      ELSE 'free'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM "WorkspaceSubscription" s
        WHERE s."workspaceId" = w."id"
          AND s."planType" = 'MONTHLY'
          AND s."status" IN ('ACTIVE', 'TRIALING')
          AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > CURRENT_TIMESTAMP)
      ) THEN 'monthly'
      WHEN EXISTS (
        SELECT 1
        FROM "WorkspaceUsageAllowance" a
        WHERE a."workspaceId" = w."id"
          AND a."reportGenerationsAllowed" > a."reportGenerationsUsed"
      ) THEN 'one_time'
      ELSE 'free'
    END,
    EXISTS (
      SELECT 1
      FROM "WorkspaceSubscription" s
      WHERE s."workspaceId" = w."id"
        AND s."planType" = 'MONTHLY'
        AND s."status" IN ('ACTIVE', 'TRIALING')
        AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > CURRENT_TIMESTAMP)
    ),
    (
      SELECT s."currentPeriodStart"
      FROM "WorkspaceSubscription" s
      WHERE s."workspaceId" = w."id"
        AND s."planType" = 'MONTHLY'
      ORDER BY s."currentPeriodEnd" DESC NULLS LAST, s."createdAt" DESC
      LIMIT 1
    ),
    (
      SELECT s."currentPeriodEnd"
      FROM "WorkspaceSubscription" s
      WHERE s."workspaceId" = w."id"
        AND s."planType" = 'MONTHLY'
      ORDER BY s."currentPeriodEnd" DESC NULLS LAST, s."createdAt" DESC
      LIMIT 1
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1
  FROM "ReportEntitlement" e
  WHERE e."workspaceId" = w."id"
);
