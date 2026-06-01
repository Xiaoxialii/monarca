-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('SQL_SERVER', 'MYSQL', 'POSTGRESQL', 'SNOWFLAKE', 'BIGQUERY', 'EXCEL', 'CSV', 'GOOGLE_ANALYTICS', 'STRIPE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MetricLayer" AS ENUM ('PRIMARY', 'DRIVER', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "MetricMaintainerRole" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "MetricStatus" AS ENUM ('AI_READY', 'NEEDS_MAPPING', 'NEEDS_VALIDATION');

-- CreateEnum
CREATE TYPE "MetricExpressionType" AS ENUM ('AGGREGATE', 'RATE', 'CALCULATION');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('DATA_CONNECTION', 'REPORT_GENERATION', 'BILLING', 'ACCOUNT_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'PROFESSIONAL', 'ENTERPRISE', 'DATABASE_SETUP');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'PENDING');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('ONE_TIME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "UserSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "UserCreditSourceType" AS ENUM ('ONE_TIME_PURCHASE', 'MONTHLY_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "UserCreditStatus" AS ENUM ('ACTIVE', 'USED_UP', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentOrderType" AS ENUM ('ONE_TIME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UsageActionType" AS ENUM ('GENERATE_REPORT', 'AI_FOLLOW_UP', 'DATABASE_CONNECTION', 'EXPORT_REPORT', 'HUMAN_SERVICE');

-- CreateEnum
CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'REMOVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "invitedEmail" TEXT,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedBy" TEXT,
    "clerk_invitation_id" TEXT,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "connectionMode" TEXT,
    "authMethod" TEXT,
    "config" JSONB,
    "schemas" JSONB,
    "lastErrorMessage" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSourceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemaSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "schemaJson" JSONB NOT NULL,
    "qualityReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "layer" "MetricLayer" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "expressionType" "MetricExpressionType" NOT NULL DEFAULT 'CALCULATION',
    "unit" TEXT,
    "window" TEXT,
    "sourceMetricIds" JSONB,
    "mappingJson" JSONB,
    "lineageJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maintainerRole" "MetricMaintainerRole" NOT NULL,
    "maintainerUserId" TEXT,
    "status" "MetricStatus" NOT NULL DEFAULT 'NEEDS_MAPPING',
    "tagsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "briefingDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" INTEGER,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "anomalyType" TEXT,
    "anomalyTypeNormalized" TEXT,
    "impactScore" DOUBLE PRECISION,
    "confidence" INTEGER,
    "dataQualityScore" INTEGER,
    "sampleSize" INTEGER,
    "relatedMetricIds" JSONB,
    "explanationJson" JSONB,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRecommendation" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerTeam" TEXT,
    "targetOwner" TEXT,
    "executionPriority" TEXT,
    "impactScore" DOUBLE PRECISION,
    "estimatedOutcome" TEXT,
    "workflowAction" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PLANNED',
    "dueDate" TIMESTAMP(3),
    "actualOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "interval" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "startPeriod" TIMESTAMP(3),
    "endPeriod" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "planVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "reportQuota" INTEGER NOT NULL DEFAULT 0,
    "aiTokenQuota" INTEGER NOT NULL DEFAULT 0,
    "databaseConnectionQuota" INTEGER NOT NULL DEFAULT 0,
    "includesHumanService" BOOLEAN NOT NULL DEFAULT false,
    "validDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "UserSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "paymentProvider" TEXT,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "paymentOrderId" TEXT,
    "sourceType" "UserCreditSourceType" NOT NULL,
    "reportCreditsTotal" INTEGER NOT NULL DEFAULT 0,
    "reportCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "aiTokenTotal" INTEGER NOT NULL DEFAULT 0,
    "aiTokenUsed" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "status" "UserCreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orderType" "PaymentOrderType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT,
    "providerPaymentId" TEXT,
    "providerSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" "UsageActionType" NOT NULL,
    "creditId" TEXT,
    "usageAmount" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "submitterId" TEXT,
    "assigneeId" TEXT,
    "type" "TicketType" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contextJson" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_invitedEmail_key" ON "WorkspaceMember"("workspaceId", "invitedEmail");

-- CreateIndex
CREATE INDEX "DataSourceConnection_workspaceId_status_idx" ON "DataSourceConnection"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchemaSnapshot_workspaceId_version_key" ON "SchemaSnapshot"("workspaceId", "version");

-- CreateIndex
CREATE INDEX "MetricDefinition_workspaceId_layer_idx" ON "MetricDefinition"("workspaceId", "layer");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDefinition_workspaceId_name_key" ON "MetricDefinition"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "DailyBriefing_workspaceId_briefingDate_idx" ON "DailyBriefing"("workspaceId", "briefingDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_workspaceId_briefingDate_key" ON "DailyBriefing"("workspaceId", "briefingDate");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_workspaceId_status_idx" ON "WorkspaceSubscription"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Plan_type_isActive_idx" ON "Plan"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_providerSubscriptionId_key" ON "UserSubscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "UserSubscription_planId_status_idx" ON "UserSubscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredit_paymentOrderId_key" ON "UserCredit"("paymentOrderId");

-- CreateIndex
CREATE INDEX "UserCredit_userId_status_validUntil_idx" ON "UserCredit"("userId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "UserCredit_planId_sourceType_idx" ON "UserCredit"("planId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerPaymentId_key" ON "PaymentOrder"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerSessionId_key" ON "PaymentOrder"("providerSessionId");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_status_idx" ON "PaymentOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_planId_orderType_idx" ON "PaymentOrder"("planId", "orderType");

-- CreateIndex
CREATE INDEX "UsageLog_userId_actionType_createdAt_idx" ON "UsageLog"("userId", "actionType", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_creditId_createdAt_idx" ON "UsageLog"("creditId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_workspaceId_status_idx" ON "SupportTicket"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_submitterId_createdAt_idx" ON "SupportTicket"("submitterId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_status_idx" ON "SupportTicket"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourceConnection" ADD CONSTRAINT "DataSourceConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaSnapshot" ADD CONSTRAINT "SchemaSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaSnapshot" ADD CONSTRAINT "SchemaSnapshot_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDefinition" ADD CONSTRAINT "MetricDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDefinition" ADD CONSTRAINT "MetricDefinition_maintainerUserId_fkey" FOREIGN KEY ("maintainerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "DailyBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionRecommendation" ADD CONSTRAINT "ActionRecommendation_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredit" ADD CONSTRAINT "UserCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredit" ADD CONSTRAINT "UserCredit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredit" ADD CONSTRAINT "UserCredit_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredit" ADD CONSTRAINT "UserCredit_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "UserCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
