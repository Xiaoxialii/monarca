import type { CanonicalMappedRecord } from "@/lib/semantic/mapper/canonical-schema-engine";

const DEFAULT_META_API_VERSION = "v20.0";
const META_GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_META_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_META_FETCH_RETRIES = 1;

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
  timeoutMs?: number;
  retries?: number;
};

export class MetaAdsConnector {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: MetaAdsConnectorOptions) {
    if (!options.accessToken) throw new Error("Meta access token is required.");
    if (!options.adAccountId) throw new Error("Meta ad account id is required.");

    this.accessToken = options.accessToken;
    this.adAccountId = normalizeAdAccountId(options.adAccountId);
    this.apiVersion = options.apiVersion || process.env.META_MARKETING_API_VERSION || DEFAULT_META_API_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? numberFromEnv(process.env.META_MARKETING_API_TIMEOUT_MS, DEFAULT_META_FETCH_TIMEOUT_MS);
    this.retries = options.retries ?? numberFromEnv(process.env.META_MARKETING_API_RETRIES, DEFAULT_META_FETCH_RETRIES);
  }

  async fetchAccount() {
    return this.singleGet(`/${this.adAccountId}`, {
      fields: "id,account_id,name,currency,timezone_name,account_status,business_name"
    });
  }

  async fetchCampaigns() {
    return this.paginatedGet(`/${this.adAccountId}/campaigns`, {
      fields: "id,name,objective,buying_type,status,effective_status,start_time,stop_time,created_time,updated_time",
      limit: "100"
    });
  }

  async fetchAdSets() {
    return this.paginatedGet(`/${this.adAccountId}/adsets`, {
      fields: "id,name,campaign_id,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,targeting,promoted_object,status,effective_status,created_time,updated_time",
      limit: "100"
    });
  }

  async fetchAds() {
    return this.paginatedGet(`/${this.adAccountId}/ads`, {
      fields: [
        "id",
        "name",
        "campaign_id",
        "adset_id",
        "status",
        "effective_status",
        "created_time",
        "updated_time",
        "tracking_specs",
        "url_tags",
        "preview_shareable_link",
        "creative{id,name,object_type,object_story_spec,asset_feed_spec,image_hash,image_url,thumbnail_url,video_id,video_thumbnail_url,body,title,description,call_to_action_type,effective_object_story_id,instagram_actor_id,product_set_id,template_url_spec,url_tags}"
      ].join(","),
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
        "reach",
        "frequency",
        "clicks",
        "inline_link_clicks",
        "outbound_clicks",
        "cpm",
        "cpc",
        "ctr",
        "actions",
        "action_values",
        "conversions",
        "purchase_roas",
        "attribution_setting",
        "date_start",
        "date_stop"
      ].join(","),
      level: input.level ?? "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: input.since, until: input.until }),
      limit: "100"
    });
  }

  private async singleGet<T = Record<string, unknown>>(path: string, params: Record<string, string>) {
    const response = await this.fetchWithRetry(this.url(path, params), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    });
    const payload = await response.json().catch(() => null) as (T & MetaGraphPage<T>) | null;

    if (!response.ok) {
      throw new Error(metaErrorMessage(payload, response.status));
    }

    return (payload ?? {}) as T;
  }

  private async paginatedGet<T = Record<string, unknown>>(path: string, params: Record<string, string>) {
    const rows: T[] = [];
    let nextUrl: string | null = this.url(path, params);

    while (nextUrl) {
      const response = await this.fetchWithRetry(nextUrl, {
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

  private async fetchWithRetry(url: string, init: RequestInit) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal
        });
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.retries) {
            clearTimeout(timeout);
            await delay(backoffMs(attempt));
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= this.retries) break;
        await delay(backoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    const message = lastError instanceof Error ? lastError.message : "Meta Marketing API request failed.";
    throw new Error(`META_ADS_NETWORK_ERROR: ${message}`);
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

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function backoffMs(attempt: number) {
  return Math.min(5_000, 500 * Math.pow(2, attempt));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
