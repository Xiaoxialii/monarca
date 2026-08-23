CREATE TYPE "StorePartnershipApplicationStatus" AS ENUM (
  'NEW',
  'UNDER_REVIEW',
  'QUALIFIED',
  'CONTACTED',
  'ACCEPTED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE "StorePartnershipBusinessStage" AS ENUM (
  'OVERSEAS_STORE',
  'DOMESTIC_READY_OVERSEAS',
  'FACTORY_OR_SUPPLIER',
  'OVERSEAS_EXPANDING_CHANNELS',
  'OTHER'
);

CREATE TYPE "StorePartnershipFulfillmentCapability" AS ENUM (
  'OVERSEAS_WAREHOUSE',
  'DOMESTIC_DIRECT_SHIPPING',
  'THIRD_PARTY_CROSS_BORDER_LOGISTICS',
  'NEED_MONARCA_SUPPORT',
  'UNSURE_DISCUSS'
);

CREATE TABLE "StorePartnershipApplication" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "wechat" TEXT,
  "businessStage" "StorePartnershipBusinessStage" NOT NULL,
  "storeOrProductUrl" TEXT,
  "salesChannels" JSONB NOT NULL,
  "otherSalesChannel" TEXT,
  "fulfillmentCapability" "StorePartnershipFulfillmentCapability" NOT NULL,
  "requestedServices" JSONB NOT NULL,
  "otherRequestedService" TEXT,
  "businessDescription" TEXT,
  "consentAccepted" BOOLEAN NOT NULL,
  "status" "StorePartnershipApplicationStatus" NOT NULL DEFAULT 'NEW',
  "source" TEXT NOT NULL DEFAULT 'PUBLIC_APPLICATION_PAGE',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorePartnershipApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorePartnershipApplication_contact_check" CHECK ("email" IS NOT NULL OR "wechat" IS NOT NULL),
  CONSTRAINT "StorePartnershipApplication_consent_check" CHECK ("consentAccepted" = TRUE)
);

CREATE INDEX "StorePartnershipApplication_submittedAt_idx" ON "StorePartnershipApplication"("submittedAt");
CREATE INDEX "StorePartnershipApplication_status_submittedAt_idx" ON "StorePartnershipApplication"("status", "submittedAt");
CREATE INDEX "StorePartnershipApplication_businessStage_submittedAt_idx" ON "StorePartnershipApplication"("businessStage", "submittedAt");
CREATE INDEX "StorePartnershipApplication_email_submittedAt_idx" ON "StorePartnershipApplication"("email", "submittedAt");
CREATE INDEX "StorePartnershipApplication_wechat_submittedAt_idx" ON "StorePartnershipApplication"("wechat", "submittedAt");
