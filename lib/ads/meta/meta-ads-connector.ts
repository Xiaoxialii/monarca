import type { CanonicalMappedRecord } from "@/lib/semantic/mapper/canonical-schema-engine";

const DEFAULT_META_API_VERSION = "v20.0";
const META_GRAPH_BASE = "https://graph.facebook.com";

export type MetaAdsInsight = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  actions?: Array<{ action_type?: string; value?: string | number }>;
  action_values?: Array<{ action_type?: string; value?: string | number }>;
  conversions?: string | number;
  purchase_value?: string | number;
  date_start?: string;
  date_stop?: string;
  date?: string;
  [key: string]: unknown;
};

export type MetaCanonicalAdRow = {
  platform: "meta";
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attribution_revenue: number;
  purchase_value: number;
  date: string;
  source_id: string;
  canonical_key: string;
};

export type MetaAdsConnectorOptions = {
  accessToken: string;
  adAccountId: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

export class MetaAdsConnector {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MetaAdsConnectorOptions) {
    if (!options.accessToken) throw new Error("Meta access token is required.");
    if (!options.adAccountId) throw new Error("Meta ad account id is required.");

    this.accessToken = options.accessToken;
    this.adAccountId = normalizeAdAccountId(options.adAccountId);
    this.apiVersion = options.apiVersion || process.env.META_MARKETING_API_VERSION || DEFAULT_META_API_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchCampaigns() {
    return this.paginatedGet(`/${this.adAccountId}/campaigns`, {
      fields: "id,name,status,effective_status,created_time,updated_time",
      limit: "100"
    });
  }

  async fetchAdSets() {
    return this.paginatedGet(`/${this.adAccountId}/adsets`, {
      fields: "id,name,campaign_id,status,effective_status,created_time,updated_time",
      limit: "100"
    });
  }

  async fetchAds() {
    return this.paginatedGet(`/${this.adAccountId}/ads`, {
      fields: "id,name,campaign_id,adset_id,status,effective_status,created_time,updated_time",
      limit: "100"
    });
  }

  async fetchInsights(input: {
    since: string;
    until: string;
    level?: "campaign" | "adset" | "ad";
  }) {
    return this.paginatedGet<MetaAdsInsight>(`/${this.adAccountId}/insights`, {
      fields: [
        "campaign_id",
        "campaign_name",
        "adset_id",
        "adset_name",
        "ad_id",
        "ad_name",
        "spend",
        "impressions",
        "clicks",
        "actions",
        "action_values",
        "date_start",
        "date_stop"
      ].join(","),
      level: input.level ?? "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: input.since, until: input.until }),
      limit: "100"
    });
  }

  private async paginatedGet<T = Record<string, unknown>>(path: string, params: Record<string, string>) {
    const rows: T[] = [];
    let nextUrl: string | null = this.url(path, params);

    while (nextUrl) {
      const response = await this.fetchImpl(nextUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });
      const payload = await response.json().catch(() => null) as MetaGraphPage<T> | null;

      if (!response.ok) {
        throw new Error(metaErrorMessage(payload, response.status));
      }

      rows.push(...(Array.isArray(payload?.data) ? payload.data : []));
      nextUrl = typeof payload?.paging?.next === "string" ? payload.paging.next : null;
    }

    return rows;
  }

  private url(path: string, params: Record<string, string>) {
    const url = new URL(`${META_GRAPH_BASE}/${this.apiVersion}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }
}

type MetaGraphPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
};

export function normalizeMetaInsightsToCanonicalAds(insights: MetaAdsInsight[]): MetaCanonicalAdRow[] {
  return insights.map((insight, index) => {
    const campaignId = stringValue(insight.campaign_id) || "unknown-campaign";
    const adId = stringValue(insight.ad_id);
    const adsetId = stringValue(insight.adset_id);
    const date = stringValue(insight.date_start, insight.date) || "1970-01-01";
    const sourceId = [campaignId, adsetId, adId, date].filter(Boolean).join(":") || `meta-insight:${index}`;
    const spend = numberValue(insight.spend);
    const impressions = numberValue(insight.impressions);
    const clicks = numberValue(insight.clicks);
    const conversions = numberValue(insight.conversions, actionValue(insight.actions, ["purchase", "offsite_conversion.fb_pixel_purchase"]));
    const purchaseValue = numberValue(insight.purchase_value, actionValue(insight.action_values, ["purchase", "offsite_conversion.fb_pixel_purchase"]));

    return {
      platform: "meta",
      campaign_id: campaignId,
      campaign_name: stringValue(insight.campaign_name) || undefined,
      adset_id: adsetId || undefined,
      adset_name: stringValue(insight.adset_name) || undefined,
      ad_id: adId || undefined,
      ad_name: stringValue(insight.ad_name) || undefined,
      spend,
      impressions,
      clicks,
      conversions,
      attribution_revenue: purchaseValue,
      purchase_value: purchaseValue,
      date,
      source_id: sourceId,
      canonical_key: ["meta", sourceId, campaignId, adId || adsetId || date].join(":")
    };
  });
}

export function metaInsightsToCanonicalMappedRecords(insights: MetaAdsInsight[]): CanonicalMappedRecord[] {
  return normalizeMetaInsightsToCanonicalAds(insights).map((row) => ({
    platform: "meta",
    source_id: row.source_id,
    fields: {
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      ad_id: row.ad_id,
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
      ad_name: row.ad_name
    }
  }));
}

function normalizeAdAccountId(value: string) {
  return value.startsWith("act_") ? value : `act_${value}`;
}

function metaErrorMessage(payload: MetaGraphPage<unknown> | null, status: number) {
  const message = payload?.error?.message || `Meta Marketing API request failed with status ${status}`;

  return `META_ADS_API_ERROR: ${message}`;
}

function actionValue(actions: MetaAdsInsight["actions"], actionTypes: string[]) {
  if (!Array.isArray(actions)) return 0;

  const normalized = new Set(actionTypes.map((item) => item.toLowerCase()));
  const match = actions.find((action) => normalized.has(String(action.action_type ?? "").toLowerCase()));

  return numberValue(match?.value);
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}
