import type { CanonicalMappedRecord } from "@/lib/semantic/mapper/canonical-schema-engine";
import type { GoogleAdsCanonicalAdRow, GoogleAdsKeywordPerformanceRow } from "@/lib/connectors/google-ads/google-ads-types";

export function normalizeGoogleAdsPerformanceToCanonicalAds(rows: GoogleAdsKeywordPerformanceRow[]): GoogleAdsCanonicalAdRow[] {
  return rows.map((row, index) => {
    const spend = row.costMicros / 1_000_000;
    const conversionValue = row.conversionValue;
    const sourceId = [
      row.customerId,
      row.campaignId,
      row.adGroupId ?? "",
      row.keywordText ?? "",
      row.date
    ].filter(Boolean).join(":") || `google-ads:${index}`;

    return {
      platform: "google_ads",
      campaign_id: row.campaignId,
      campaign_name: row.campaignName,
      adset_id: row.adGroupId ?? null,
      adset_name: row.adGroupName ?? null,
      ad_id: null,
      ad_name: null,
      keyword_text: row.keywordText ?? null,
      channel_type: row.channelType,
      status: row.campaignStatus,
      spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      conversion_value: conversionValue,
      revenue: conversionValue,
      roas: spend > 0 ? conversionValue / spend : null,
      cpa: row.conversions > 0 ? spend / row.conversions : null,
      attribution_revenue: conversionValue,
      advertising_data_available: true,
      sku_attribution_available: false,
      attribution_confidence: "campaign",
      date: row.date,
      source_id: sourceId,
      canonical_key: ["google_ads", sourceId].join(":")
    };
  });
}

export function googleAdsPerformanceToCanonicalMappedRecords(rows: GoogleAdsKeywordPerformanceRow[]): CanonicalMappedRecord[] {
  return normalizeGoogleAdsPerformanceToCanonicalAds(rows).map((row) => ({
    platform: "google_ads",
    source_id: row.source_id,
    fields: {
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      ad_spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      attribution_revenue: row.attribution_revenue,
      event_date: row.date
    },
    metadata: {
      mapping_confidence: 1,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
      channel_type: row.channel_type,
      roas: row.roas,
      cpa: row.cpa,
      advertising_data_available: true,
      sku_attribution_available: false,
      attribution_confidence: "campaign"
    }
  }));
}

export function googleAdsCanonicalColumns(tableName: string) {
  const columns: Record<string, string[]> = {
    ecommerce_ads: [
      "platform",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "keyword_text",
      "channel_type",
      "status",
      "spend",
      "impressions",
      "clicks",
      "conversions",
      "conversion_value",
      "revenue",
      "roas",
      "cpa",
      "attribution_revenue",
      "advertising_data_available",
      "sku_attribution_available",
      "attribution_confidence",
      "date",
      "source_id",
      "canonical_key"
    ]
  };

  return (columns[tableName] ?? []).map((name) => ({ name, type: "canonical" }));
}
