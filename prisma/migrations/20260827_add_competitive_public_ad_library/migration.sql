DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompetitiveBrandStatus') THEN
    CREATE TYPE "CompetitiveBrandStatus" AS ENUM ('USER_CONFIRMED', 'NEEDS_REVIEW', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PublicAdProvider') THEN
    CREATE TYPE "PublicAdProvider" AS ENUM ('META_AD_LIBRARY');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PublicAdSyncStatus') THEN
    CREATE TYPE "PublicAdSyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'UNSUPPORTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CompetitiveSkuBrand" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "normalizedBrandName" TEXT NOT NULL,
  "category" TEXT,
  "status" "CompetitiveBrandStatus" NOT NULL DEFAULT 'USER_CONFIRMED',
  "source" TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "evidenceJson" JSONB,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitiveSkuBrand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitiveSkuBrand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CompetitivePublicAd" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "PublicAdProvider" NOT NULL,
  "sku" TEXT NOT NULL,
  "brandId" TEXT,
  "brandName" TEXT NOT NULL,
  "normalizedBrandName" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "sourceAdArchiveId" TEXT NOT NULL,
  "pageId" TEXT,
  "pageName" TEXT,
  "adSnapshotUrl" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publisherPlatforms" JSONB,
  "displayFormat" TEXT,
  "creativeBodies" JSONB,
  "creativeTitles" JSONB,
  "creativeDescriptions" JSONB,
  "ctaText" TEXT,
  "landingUrls" JSONB,
  "assetUrls" JSONB,
  "rawPayloadHash" TEXT NOT NULL,
  "metadataJson" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitivePublicAd_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitivePublicAd_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitivePublicAd_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "CompetitiveSkuBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CompetitivePublicAdSyncRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "PublicAdProvider" NOT NULL,
  "sku" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "status" "PublicAdSyncStatus" NOT NULL DEFAULT 'QUEUED',
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "requestedBrands" JSONB NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitivePublicAdSyncRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitivePublicAdSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_sku_brand_identity_key"
  ON "CompetitiveSkuBrand" ("workspaceId", "sku", "normalizedBrandName", "validTo");

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_sku_brand_active_identity_key"
  ON "CompetitiveSkuBrand" ("workspaceId", "sku", "normalizedBrandName") WHERE "validTo" IS NULL;

CREATE INDEX IF NOT EXISTS "competitive_sku_brand_sku_status_idx"
  ON "CompetitiveSkuBrand" ("workspaceId", "sku", "status");

CREATE INDEX IF NOT EXISTS "competitive_sku_brand_name_idx"
  ON "CompetitiveSkuBrand" ("workspaceId", "normalizedBrandName");

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_public_ad_identity_key"
  ON "CompetitivePublicAd" ("workspaceId", "provider", "country", "normalizedBrandName", "sourceAdArchiveId");

CREATE INDEX IF NOT EXISTS "competitive_public_ad_sku_idx"
  ON "CompetitivePublicAd" ("workspaceId", "sku", "provider", "country");

CREATE INDEX IF NOT EXISTS "competitive_public_ad_brand_idx"
  ON "CompetitivePublicAd" ("workspaceId", "normalizedBrandName", "provider");

CREATE INDEX IF NOT EXISTS "competitive_public_ad_start_idx"
  ON "CompetitivePublicAd" ("workspaceId", "provider", "startDate");

CREATE INDEX IF NOT EXISTS "competitive_ad_sync_sku_status_idx"
  ON "CompetitivePublicAdSyncRun" ("workspaceId", "sku", "provider", "status");

CREATE INDEX IF NOT EXISTS "competitive_ad_sync_created_idx"
  ON "CompetitivePublicAdSyncRun" ("workspaceId", "provider", "createdAt");
