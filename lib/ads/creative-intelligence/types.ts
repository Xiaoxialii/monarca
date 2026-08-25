import type {
  AdvertisingMappingMethod,
  AdvertisingMappingStatus,
  CreativeAnalysisReadiness,
  CreativeAssetStatus,
  CreativeAssetType,
  CreativeAttributionLevel
} from "@prisma/client";

export const CREATIVE_ATTRIBUTION_VERSION = "creative_attribution_v1" as const;
export const CREATIVE_DATA_VERSION = "creative_intelligence_v1" as const;
export const GOOGLE_CREATIVE_UNSUPPORTED_REASON =
  "Google Ads connector currently synchronizes campaign/ad group keyword performance only. Creative asset data is not enabled in this workspace connector.";

export type CreativeIntelligenceAccount = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  adAccountId: string;
  accountName?: string | null;
  currency?: string | null;
  timezone?: string | null;
  status?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CreativeIntelligenceCampaign = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  adAccountId: string;
  sourceCampaignId: string;
  campaignName?: string | null;
  objective?: string | null;
  buyingType?: string | null;
  status?: string | null;
  effectiveStatus?: string | null;
  startTime?: Date | null;
  stopTime?: Date | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CreativeIntelligenceAdSet = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCampaignId: string;
  sourceAdSetId: string;
  adSetName?: string | null;
  optimizationGoal?: string | null;
  billingEvent?: string | null;
  bidStrategy?: string | null;
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
  targetingSummary?: Record<string, unknown> | null;
  promotedObject?: Record<string, unknown> | null;
  status?: string | null;
  effectiveStatus?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CreativeIntelligenceAd = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCampaignId?: string | null;
  sourceAdSetId?: string | null;
  sourceAdId: string;
  sourceCreativeId?: string | null;
  adName?: string | null;
  status?: string | null;
  effectiveStatus?: string | null;
  createdTime?: Date | null;
  updatedTime?: Date | null;
  previewUrl?: string | null;
  finalUrl?: string | null;
  trackingParameters?: Record<string, unknown> | null;
  urlTags?: string | null;
  sourcePayloadHash?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CreativeIntelligenceCreative = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCreativeId: string;
  creativeName?: string | null;
  creativeFormat?: string | null;
  objectStorySpec?: Record<string, unknown> | null;
  assetFeedSpec?: Record<string, unknown> | null;
  imageHash?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
  videoThumbnailUrl?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  callToAction?: string | null;
  destinationUrl?: string | null;
  pageId?: string | null;
  instagramActorId?: string | null;
  catalogReference?: Record<string, unknown> | null;
  sourcePayloadHash?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CreativeIntelligenceAsset = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCreativeId?: string | null;
  sourceAssetId: string;
  assetType: CreativeAssetType;
  role?: string | null;
  textContent?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
  contentHash: string;
  sourcePayloadHash?: string | null;
  metadataJson?: Record<string, unknown> | null;
  status: CreativeAssetStatus;
};

export type CreativeIntelligenceAssetLink = {
  workspaceId: string;
  provider: string;
  sourceAccountId: string;
  sourceAdId?: string | null;
  sourceCreativeId: string;
  sourceAssetId: string;
  contentHash: string;
  assetRole?: string | null;
  position?: number | null;
  isActive: boolean;
};

export type CreativeIntelligencePerformanceDaily = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCampaignId?: string | null;
  sourceAdSetId?: string | null;
  sourceAdId?: string | null;
  sourceCreativeId?: string | null;
  creativeAssetId?: string | null;
  date: Date;
  attributionLevel: CreativeAttributionLevel;
  attributionConfidence: number;
  attributionMethod: string;
  sourceMetricScope: string;
  impressions?: number | null;
  reach?: number | null;
  frequency?: number | null;
  clicks?: number | null;
  inlineLinkClicks?: number | null;
  outboundClicks?: number | null;
  spend?: number | null;
  cpm?: number | null;
  cpc?: number | null;
  ctr?: number | null;
  conversions?: number | null;
  purchases?: number | null;
  purchaseConversionValue?: number | null;
  addToCart?: number | null;
  initiateCheckout?: number | null;
  landingPageViews?: number | null;
  attributedRevenue?: number | null;
  attributionWindow?: string | null;
  currency?: string | null;
  rawMetricsJson?: Record<string, unknown> | null;
  derivedMetricsJson?: Record<string, unknown> | null;
  sourcePayloadHash?: string | null;
};

export type CreativeMappingCandidate = {
  provider: string;
  dataSourceId: string;
  sourceAccountId: string;
  sourceCampaignId?: string | null;
  sourceAdSetId?: string | null;
  sourceAdId?: string | null;
  sourceCreativeId?: string | null;
  creativeAssetId?: string | null;
  adName?: string | null;
  creativeName?: string | null;
  destinationUrl?: string | null;
  sourceProductIds?: string[];
};

export type CanonicalProductCandidate = {
  sku: string;
  canonicalProductId?: string | null;
  canonicalVariantId?: string | null;
  sourceProductId?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  googleMerchantItemId?: string | null;
  productHandle?: string | null;
};

export type MappingDecision = {
  status: AdvertisingMappingStatus;
  mappingMethod: AdvertisingMappingMethod;
  mappingConfidence: number;
  sku?: string | null;
  canonicalProductId?: string | null;
  canonicalVariantId?: string | null;
  sourceProductId?: string | null;
  evidenceJson: Record<string, unknown>;
};

export type CreativeReadinessDecision = {
  readiness: CreativeAnalysisReadiness;
  canCompareAssets: boolean;
  comparisonBlockReason?: string | null;
  warnings: string[];
};
