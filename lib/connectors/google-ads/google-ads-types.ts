export type GoogleAdsCustomer = {
  resourceName?: string;
  id: string;
  descriptiveName?: string | null;
  currencyCode?: string | null;
  timeZone?: string | null;
  testAccount?: boolean | null;
  manager?: boolean | null;
};

export type GoogleAdsCampaignRow = {
  customerId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  channelType: string;
};

export type GoogleAdsAdGroupRow = {
  customerId: string;
  campaignId: string;
  adGroupId: string;
  adGroupName: string;
  status: string;
};

export type GoogleAdsKeywordPerformanceRow = {
  customerId: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  channelType: string;
  adGroupId?: string | null;
  adGroupName?: string | null;
  keywordText?: string | null;
  keywordMatchType?: string | null;
  date: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionValue: number;
};

export type GoogleAdsCanonicalAdRow = {
  platform: "google_ads";
  campaign_id: string;
  campaign_name: string;
  adset_id?: string | null;
  adset_name?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  keyword_text?: string | null;
  channel_type: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  revenue: number;
  roas: number | null;
  cpa: number | null;
  attribution_revenue: number;
  advertising_data_available: true;
  sku_attribution_available: false;
  attribution_confidence: "campaign";
  date: string;
  source_id: string;
  canonical_key: string;
};
