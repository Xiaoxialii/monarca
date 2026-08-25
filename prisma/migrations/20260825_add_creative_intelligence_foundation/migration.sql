CREATE TYPE "CreativeAttributionLevel" AS ENUM ('AD', 'CREATIVE', 'ASSET', 'ASSET_GROUP', 'NOT_SEPARATELY_ATTRIBUTABLE');
CREATE TYPE "CreativeAssetType" AS ENUM ('IMAGE', 'VIDEO', 'PRIMARY_TEXT', 'HEADLINE', 'DESCRIPTION', 'CTA', 'CAROUSEL_CARD', 'OTHER');
CREATE TYPE "CreativeAssetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'NOT_SEPARATELY_ATTRIBUTABLE');
CREATE TYPE "AdvertisingMappingStatus" AS ENUM ('AUTO_CONFIRMED', 'NEEDS_REVIEW', 'MANUALLY_CONFIRMED', 'REJECTED', 'UNMAPPED', 'AMBIGUOUS');
CREATE TYPE "AdvertisingMappingMethod" AS ENUM ('CATALOG_PRODUCT_ID', 'SHOPIFY_PRODUCT_ID', 'SHOPIFY_VARIANT_ID', 'GOOGLE_MERCHANT_ITEM_ID', 'LANDING_PAGE_URL', 'URL_PRODUCT_HANDLE', 'UTM_SKU', 'URL_SKU_PARAMETER', 'AD_NAME_SKU', 'CREATIVE_NAME_SKU', 'DESTINATION_URL', 'MANUAL', 'MULTI_PRODUCT_AD', 'UNKNOWN');
CREATE TYPE "CreativeAnalysisReadiness" AS ENUM ('READY_FOR_CREATIVE_ANALYSIS', 'INSUFFICIENT_DATA', 'UNMAPPED_SKU', 'LOW_ATTRIBUTION_CONFIDENCE', 'MULTI_ASSET_NOT_ATTRIBUTABLE', 'MISSING_COST_DATA', 'INVENTORY_CONSTRAINED', 'LEARNING');

CREATE TABLE "AdvertisingAccount" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "adAccountId" TEXT NOT NULL,
  "accountName" TEXT,
  "currency" TEXT,
  "timezone" TEXT,
  "status" TEXT,
  "metadataJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "adAccountId" TEXT NOT NULL,
  "sourceCampaignId" TEXT NOT NULL,
  "campaignName" TEXT,
  "objective" TEXT,
  "buyingType" TEXT,
  "status" TEXT,
  "effectiveStatus" TEXT,
  "startTime" TIMESTAMP(3),
  "stopTime" TIMESTAMP(3),
  "metadataJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingAdSet" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCampaignId" TEXT NOT NULL,
  "sourceAdSetId" TEXT NOT NULL,
  "adSetName" TEXT,
  "optimizationGoal" TEXT,
  "billingEvent" TEXT,
  "bidStrategy" TEXT,
  "dailyBudget" DOUBLE PRECISION,
  "lifetimeBudget" DOUBLE PRECISION,
  "targetingSummary" JSONB,
  "promotedObject" JSONB,
  "status" TEXT,
  "effectiveStatus" TEXT,
  "metadataJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingAdSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingAd" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCampaignId" TEXT,
  "sourceAdSetId" TEXT,
  "sourceAdId" TEXT NOT NULL,
  "sourceCreativeId" TEXT,
  "adName" TEXT,
  "status" TEXT,
  "effectiveStatus" TEXT,
  "createdTime" TIMESTAMP(3),
  "updatedTime" TIMESTAMP(3),
  "previewUrl" TEXT,
  "finalUrl" TEXT,
  "trackingParameters" JSONB,
  "urlTags" TEXT,
  "sourcePayloadHash" TEXT,
  "metadataJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingAd_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingCreative" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCreativeId" TEXT NOT NULL,
  "creativeName" TEXT,
  "creativeFormat" TEXT,
  "objectStorySpec" JSONB,
  "assetFeedSpec" JSONB,
  "imageHash" TEXT,
  "imageUrl" TEXT,
  "thumbnailUrl" TEXT,
  "videoId" TEXT,
  "videoThumbnailUrl" TEXT,
  "primaryText" TEXT,
  "headline" TEXT,
  "description" TEXT,
  "callToAction" TEXT,
  "destinationUrl" TEXT,
  "pageId" TEXT,
  "instagramActorId" TEXT,
  "catalogReference" JSONB,
  "sourcePayloadHash" TEXT,
  "metadataJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingCreativeAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCreativeId" TEXT,
  "sourceAssetId" TEXT NOT NULL,
  "assetType" "CreativeAssetType" NOT NULL,
  "role" TEXT,
  "textContent" TEXT,
  "imageUrl" TEXT,
  "thumbnailUrl" TEXT,
  "videoId" TEXT,
  "contentHash" TEXT NOT NULL,
  "sourcePayloadHash" TEXT,
  "metadataJson" JSONB,
  "status" "CreativeAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingCreativeAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingCreativeAssetLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceAdId" TEXT,
  "sourceCreativeId" TEXT NOT NULL,
  "creativeAssetId" TEXT NOT NULL,
  "assetRole" TEXT,
  "position" INTEGER,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingCreativeAssetLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingPerformanceDaily" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCampaignId" TEXT,
  "sourceAdSetId" TEXT,
  "sourceAdId" TEXT,
  "sourceCreativeId" TEXT,
  "creativeAssetId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "attributionLevel" "CreativeAttributionLevel" NOT NULL,
  "attributionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "attributionMethod" TEXT NOT NULL,
  "sourceMetricScope" TEXT NOT NULL,
  "impressions" INTEGER,
  "reach" INTEGER,
  "frequency" DOUBLE PRECISION,
  "clicks" INTEGER,
  "inlineLinkClicks" INTEGER,
  "outboundClicks" INTEGER,
  "spend" DOUBLE PRECISION,
  "cpm" DOUBLE PRECISION,
  "cpc" DOUBLE PRECISION,
  "ctr" DOUBLE PRECISION,
  "conversions" DOUBLE PRECISION,
  "purchases" DOUBLE PRECISION,
  "purchaseConversionValue" DOUBLE PRECISION,
  "addToCart" DOUBLE PRECISION,
  "initiateCheckout" DOUBLE PRECISION,
  "landingPageViews" DOUBLE PRECISION,
  "attributedRevenue" DOUBLE PRECISION,
  "attributionWindow" TEXT,
  "currency" TEXT,
  "rawMetricsJson" JSONB,
  "derivedMetricsJson" JSONB,
  "sourcePayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingPerformanceDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingProductMapping" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceCampaignId" TEXT,
  "sourceAdSetId" TEXT,
  "sourceAdId" TEXT,
  "sourceCreativeId" TEXT,
  "creativeAssetId" TEXT,
  "canonicalProductId" TEXT,
  "canonicalVariantId" TEXT,
  "sku" TEXT,
  "sourceProductId" TEXT,
  "mappingMethod" "AdvertisingMappingMethod" NOT NULL,
  "mappingConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceJson" JSONB,
  "status" "AdvertisingMappingStatus" NOT NULL,
  "manuallyConfirmedBy" TEXT,
  "manuallyConfirmedAt" TIMESTAMP(3),
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingProductMappingAudit" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "mappingId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" "AdvertisingMappingStatus",
  "nextStatus" "AdvertisingMappingStatus",
  "previousValue" JSONB,
  "nextValue" JSONB,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvertisingProductMappingAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisingProfitSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceAdId" TEXT,
  "sourceCreativeId" TEXT,
  "creativeAssetId" TEXT,
  "sku" TEXT,
  "metricScope" TEXT NOT NULL,
  "attributionLevel" "CreativeAttributionLevel" NOT NULL,
  "attributionMethod" TEXT NOT NULL,
  "attributionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mappingId" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "profitabilityEngineVersion" TEXT NOT NULL,
  "attributionVersion" TEXT NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "dateWindowStart" TIMESTAMP(3) NOT NULL,
  "dateWindowEnd" TIMESTAMP(3) NOT NULL,
  "adSpend" DOUBLE PRECISION,
  "attributedOrders" DOUBLE PRECISION,
  "attributedRevenue" DOUBLE PRECISION,
  "attributedCogs" DOUBLE PRECISION,
  "attributedOperatingCost" DOUBLE PRECISION,
  "attributedContributionProfit" DOUBLE PRECISION,
  "netProfitAfterAds" DOUBLE PRECISION,
  "netMargin" DOUBLE PRECISION,
  "roas" DOUBLE PRECISION,
  "contributionRoas" DOUBLE PRECISION,
  "profitPerAdDollar" DOUBLE PRECISION,
  "cac" DOUBLE PRECISION,
  "breakEvenRoas" DOUBLE PRECISION,
  "breakEvenCpa" DOUBLE PRECISION,
  "costCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "readiness" "CreativeAnalysisReadiness" NOT NULL,
  "canCompareAssets" BOOLEAN NOT NULL DEFAULT false,
  "comparisonBlockReason" TEXT,
  "warningsJson" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "staleAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertisingProfitSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_acct_identity_key" ON "AdvertisingAccount"("workspaceId", "provider", "sourceAccountId", "adAccountId");
CREATE INDEX "ad_acct_source_idx" ON "AdvertisingAccount"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "ad_acct_status_idx" ON "AdvertisingAccount"("workspaceId", "provider", "status");

CREATE UNIQUE INDEX "ad_campaign_identity_key" ON "AdvertisingCampaign"("workspaceId", "provider", "sourceAccountId", "sourceCampaignId");
CREATE INDEX "ad_campaign_source_idx" ON "AdvertisingCampaign"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "ad_campaign_status_idx" ON "AdvertisingCampaign"("workspaceId", "provider", "effectiveStatus");

CREATE UNIQUE INDEX "ad_set_identity_key" ON "AdvertisingAdSet"("workspaceId", "provider", "sourceAccountId", "sourceAdSetId");
CREATE INDEX "ad_set_campaign_idx" ON "AdvertisingAdSet"("workspaceId", "provider", "sourceCampaignId");
CREATE INDEX "ad_set_source_idx" ON "AdvertisingAdSet"("workspaceId", "dataSourceId", "provider");

CREATE UNIQUE INDEX "ad_identity_key" ON "AdvertisingAd"("workspaceId", "provider", "sourceAccountId", "sourceAdId");
CREATE INDEX "ad_campaign_idx" ON "AdvertisingAd"("workspaceId", "provider", "sourceCampaignId");
CREATE INDEX "ad_adset_idx" ON "AdvertisingAd"("workspaceId", "provider", "sourceAdSetId");
CREATE INDEX "ad_creative_idx" ON "AdvertisingAd"("workspaceId", "provider", "sourceCreativeId");

CREATE UNIQUE INDEX "ad_creative_identity_key" ON "AdvertisingCreative"("workspaceId", "provider", "sourceAccountId", "sourceCreativeId");
CREATE INDEX "ad_creative_source_idx" ON "AdvertisingCreative"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "ad_creative_format_idx" ON "AdvertisingCreative"("workspaceId", "provider", "creativeFormat");

CREATE UNIQUE INDEX "ad_asset_identity_key" ON "AdvertisingCreativeAsset"("workspaceId", "provider", "sourceAccountId", "sourceAssetId", "contentHash");
CREATE INDEX "ad_asset_source_idx" ON "AdvertisingCreativeAsset"("workspaceId", "dataSourceId", "provider");
CREATE INDEX "ad_asset_type_idx" ON "AdvertisingCreativeAsset"("workspaceId", "provider", "assetType");
CREATE INDEX "ad_asset_hash_idx" ON "AdvertisingCreativeAsset"("workspaceId", "provider", "contentHash");

CREATE UNIQUE INDEX "ad_asset_link_identity_key" ON "AdvertisingCreativeAssetLink"("workspaceId", "provider", "sourceAccountId", "sourceAdId", "sourceCreativeId", "creativeAssetId", "assetRole", "position");
CREATE INDEX "ad_asset_link_ad_idx" ON "AdvertisingCreativeAssetLink"("workspaceId", "provider", "sourceAdId");
CREATE INDEX "ad_asset_link_creative_idx" ON "AdvertisingCreativeAssetLink"("workspaceId", "provider", "sourceCreativeId");
CREATE INDEX "ad_asset_link_asset_idx" ON "AdvertisingCreativeAssetLink"("workspaceId", "creativeAssetId");

CREATE UNIQUE INDEX "ad_perf_daily_identity_key" ON "AdvertisingPerformanceDaily"("workspaceId", "provider", "sourceAccountId", "sourceMetricScope", "attributionLevel", "date", "sourceCampaignId", "sourceAdSetId", "sourceAdId", "sourceCreativeId", "creativeAssetId");
CREATE INDEX "ad_perf_daily_source_idx" ON "AdvertisingPerformanceDaily"("workspaceId", "dataSourceId", "provider", "date");
CREATE INDEX "ad_perf_daily_ad_idx" ON "AdvertisingPerformanceDaily"("workspaceId", "provider", "sourceAdId", "date");
CREATE INDEX "ad_perf_daily_creative_idx" ON "AdvertisingPerformanceDaily"("workspaceId", "provider", "sourceCreativeId", "date");

CREATE UNIQUE INDEX "ad_product_mapping_identity_key" ON "AdvertisingProductMapping"("workspaceId", "provider", "sourceAccountId", "sourceAdId", "sourceCreativeId", "creativeAssetId", "validTo");
CREATE INDEX "ad_product_mapping_status_idx" ON "AdvertisingProductMapping"("workspaceId", "dataSourceId", "provider", "status");
CREATE INDEX "ad_product_mapping_sku_idx" ON "AdvertisingProductMapping"("workspaceId", "provider", "sku");
CREATE INDEX "ad_product_mapping_ad_idx" ON "AdvertisingProductMapping"("workspaceId", "provider", "sourceAdId");

CREATE INDEX "ad_product_mapping_audit_idx" ON "AdvertisingProductMappingAudit"("workspaceId", "mappingId", "createdAt");

CREATE UNIQUE INDEX "ad_profit_snapshot_identity_key" ON "AdvertisingProfitSnapshot"("workspaceId", "provider", "sourceAccountId", "metricScope", "sourceAdId", "sourceCreativeId", "creativeAssetId", "sku", "dateWindowStart", "dateWindowEnd", "mappingVersion", "profitabilityEngineVersion", "attributionVersion");
CREATE INDEX "ad_profit_snapshot_source_idx" ON "AdvertisingProfitSnapshot"("workspaceId", "dataSourceId", "provider", "generatedAt");
CREATE INDEX "ad_profit_snapshot_sku_idx" ON "AdvertisingProfitSnapshot"("workspaceId", "provider", "sku");
CREATE INDEX "ad_profit_snapshot_ready_idx" ON "AdvertisingProfitSnapshot"("workspaceId", "provider", "readiness");

ALTER TABLE "AdvertisingAccount" ADD CONSTRAINT "AdvertisingAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingAccount" ADD CONSTRAINT "AdvertisingAccount_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingAdSet" ADD CONSTRAINT "AdvertisingAdSet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingAdSet" ADD CONSTRAINT "AdvertisingAdSet_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingAd" ADD CONSTRAINT "AdvertisingAd_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingAd" ADD CONSTRAINT "AdvertisingAd_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreative" ADD CONSTRAINT "AdvertisingCreative_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreative" ADD CONSTRAINT "AdvertisingCreative_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreativeAsset" ADD CONSTRAINT "AdvertisingCreativeAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreativeAsset" ADD CONSTRAINT "AdvertisingCreativeAsset_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreativeAssetLink" ADD CONSTRAINT "AdvertisingCreativeAssetLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingCreativeAssetLink" ADD CONSTRAINT "AdvertisingCreativeAssetLink_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "AdvertisingCreativeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingPerformanceDaily" ADD CONSTRAINT "AdvertisingPerformanceDaily_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingPerformanceDaily" ADD CONSTRAINT "AdvertisingPerformanceDaily_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProductMapping" ADD CONSTRAINT "AdvertisingProductMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProductMapping" ADD CONSTRAINT "AdvertisingProductMapping_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProductMappingAudit" ADD CONSTRAINT "AdvertisingProductMappingAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProductMappingAudit" ADD CONSTRAINT "AdvertisingProductMappingAudit_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "AdvertisingProductMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProfitSnapshot" ADD CONSTRAINT "AdvertisingProfitSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvertisingProfitSnapshot" ADD CONSTRAINT "AdvertisingProfitSnapshot_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
