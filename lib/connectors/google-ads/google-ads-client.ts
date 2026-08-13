import { GoogleAdsConnectorError } from "@/lib/connectors/google-ads/google-ads-errors";
import { googleAdsApiVersion, googleAdsUseMock, normalizeCustomerId } from "@/lib/connectors/google-ads/google-ads-oauth";
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsCampaignRow,
  GoogleAdsCustomer,
  GoogleAdsKeywordPerformanceRow
} from "@/lib/connectors/google-ads/google-ads-types";

type GoogleAdsClientConfig = {
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string | null;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

type SearchStreamResponse = Array<{
  results?: Array<Record<string, unknown>>;
}>;

export class GoogleAdsClient {
  private readonly accessToken: string;
  private readonly developerToken: string;
  private readonly loginCustomerId: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GoogleAdsClientConfig) {
    if (!config.accessToken) throw new GoogleAdsConnectorError("Google Ads access expired. Please reconnect your account.", "GOOGLE_ADS_ACCESS_EXPIRED", 401, true);
    if (!config.developerToken) throw new GoogleAdsConnectorError("Missing GOOGLE_ADS_DEVELOPER_TOKEN.", "MISSING_GOOGLE_ADS_DEVELOPER_TOKEN", 500);

    this.accessToken = config.accessToken;
    this.developerToken = config.developerToken;
    this.loginCustomerId = normalizeCustomerId(config.loginCustomerId ?? "");
    this.apiVersion = config.apiVersion || googleAdsApiVersion();
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listAccessibleCustomers(): Promise<GoogleAdsCustomer[]> {
    if (googleAdsUseMock()) return mockCustomers();

    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers:listAccessibleCustomers`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.headers()
    });
    const payload = await response.json().catch(() => null) as {
      resourceNames?: string[];
      error?: GoogleAdsApiError;
    } | null;

    if (!response.ok) {
      throw googleAdsApiError(payload?.error, response.status);
    }

    return (payload?.resourceNames ?? [])
      .map((resourceName) => normalizeCustomerId(resourceName))
      .filter(Boolean)
      .map((id) => ({ id, resourceName: `customers/${id}` }));
  }

  async fetchCustomer(customerId: string): Promise<GoogleAdsCustomer | null> {
    if (googleAdsUseMock()) {
      return mockCustomers().find((customer) => customer.id === normalizeCustomerId(customerId)) ?? mockCustomers()[0] ?? null;
    }

    const rows = await this.search(customerId, `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.test_account,
        customer.manager
      FROM customer
      LIMIT 1
    `);
    const customer = objectValue(rows[0]?.customer);
    const id = normalizeCustomerId(stringValue(customer.id, customer.resourceName));
    if (!id) return null;

    return {
      id,
      resourceName: stringValue(customer.resourceName) || `customers/${id}`,
      descriptiveName: stringValue(customer.descriptiveName, customer.descriptive_name) || null,
      currencyCode: stringValue(customer.currencyCode, customer.currency_code) || null,
      timeZone: stringValue(customer.timeZone, customer.time_zone) || null,
      testAccount: booleanValue(customer.testAccount, customer.test_account),
      manager: booleanValue(customer.manager)
    };
  }

  async fetchCampaigns(customerId: string): Promise<GoogleAdsCampaignRow[]> {
    if (googleAdsUseMock()) return mockCampaigns(customerId);

    const rows = await this.search(customerId, `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `);

    return rows.map((row) => {
      const customer = objectValue(row.customer);
      const campaign = objectValue(row.campaign);

      return {
        customerId: normalizeCustomerId(stringValue(customer.id)) || normalizeCustomerId(customerId),
        campaignId: stringValue(campaign.id),
        campaignName: stringValue(campaign.name),
        status: stringValue(campaign.status),
        channelType: stringValue(campaign.advertisingChannelType, campaign.advertising_channel_type)
      };
    }).filter((row) => row.campaignId);
  }

  async fetchAdGroups(customerId: string): Promise<GoogleAdsAdGroupRow[]> {
    if (googleAdsUseMock()) return mockAdGroups(customerId);

    const rows = await this.search(customerId, `
      SELECT
        customer.id,
        campaign.id,
        ad_group.id,
        ad_group.name,
        ad_group.status
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
    `);

    return rows.map((row) => {
      const customer = objectValue(row.customer);
      const campaign = objectValue(row.campaign);
      const adGroup = objectValue(row.adGroup, row.ad_group);

      return {
        customerId: normalizeCustomerId(stringValue(customer.id)) || normalizeCustomerId(customerId),
        campaignId: stringValue(campaign.id),
        adGroupId: stringValue(adGroup.id),
        adGroupName: stringValue(adGroup.name),
        status: stringValue(adGroup.status)
      };
    }).filter((row) => row.adGroupId);
  }

  async fetchKeywordPerformance(input: {
    customerId: string;
    since: string;
    until: string;
  }): Promise<GoogleAdsKeywordPerformanceRow[]> {
    if (googleAdsUseMock()) return mockKeywordPerformance(input.customerId, input.since, input.until);

    const rows = await this.search(input.customerId, `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        ad_group.id,
        ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM keyword_view
      WHERE segments.date BETWEEN '${input.since}' AND '${input.until}'
    `);

    return rows.map((row) => {
      const customer = objectValue(row.customer);
      const campaign = objectValue(row.campaign);
      const adGroup = objectValue(row.adGroup, row.ad_group);
      const criterion = objectValue(row.adGroupCriterion, row.ad_group_criterion);
      const keyword = objectValue(criterion.keyword);
      const segments = objectValue(row.segments);
      const metrics = objectValue(row.metrics);

      return {
        customerId: normalizeCustomerId(stringValue(customer.id)) || normalizeCustomerId(input.customerId),
        campaignId: stringValue(campaign.id),
        campaignName: stringValue(campaign.name),
        campaignStatus: stringValue(campaign.status),
        channelType: stringValue(campaign.advertisingChannelType, campaign.advertising_channel_type),
        adGroupId: stringValue(adGroup.id) || null,
        adGroupName: stringValue(adGroup.name) || null,
        keywordText: stringValue(keyword.text) || null,
        keywordMatchType: stringValue(keyword.matchType, keyword.match_type) || null,
        date: stringValue(segments.date),
        impressions: numberValue(metrics.impressions),
        clicks: numberValue(metrics.clicks),
        costMicros: numberValue(metrics.costMicros, metrics.cost_micros),
        conversions: numberValue(metrics.conversions),
        conversionValue: numberValue(metrics.conversionsValue, metrics.conversions_value)
      };
    }).filter((row) => row.campaignId && row.date);
  }

  private async search(customerId: string, query: string) {
    const normalizedCustomerId = normalizeCustomerId(customerId);
    if (!normalizedCustomerId) {
      throw new GoogleAdsConnectorError("Google Ads customer account is not accessible.", "GOOGLE_ADS_CUSTOMER_NOT_ACCESSIBLE", 403);
    }

    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers/${normalizedCustomerId}/googleAds:searchStream`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });
    const payload = await response.json().catch(() => null) as SearchStreamResponse | { error?: GoogleAdsApiError } | null;

    if (!response.ok) {
      throw googleAdsApiError(!Array.isArray(payload) ? payload?.error : undefined, response.status);
    }

    return Array.isArray(payload) ? payload.flatMap((chunk) => Array.isArray(chunk.results) ? chunk.results : []) : [];
  }

  private headers() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "developer-token": this.developerToken
    };
    if (this.loginCustomerId) headers["login-customer-id"] = this.loginCustomerId;

    return headers;
  }
}

type GoogleAdsApiError = {
  code?: number;
  message?: string;
  status?: string;
  details?: unknown[];
};

function googleAdsApiError(error: GoogleAdsApiError | undefined, httpStatus: number) {
  const message = error?.message || `Google Ads API request failed with status ${httpStatus}.`;
  const status = error?.status || "";
  const lower = `${message} ${status}`.toLowerCase();

  if (httpStatus === 401 || lower.includes("invalid_grant") || lower.includes("unauthorized")) {
    return new GoogleAdsConnectorError("Google Ads access expired. Please reconnect your account.", "GOOGLE_ADS_ACCESS_EXPIRED", 401, true);
  }
  if (httpStatus === 403 && lower.includes("developer")) {
    return new GoogleAdsConnectorError("Google Ads developer token is not approved or is not allowed for this account.", "GOOGLE_ADS_DEVELOPER_TOKEN_ERROR", 403);
  }
  if (httpStatus === 403) {
    return new GoogleAdsConnectorError("Google Ads customer account is not accessible.", "GOOGLE_ADS_CUSTOMER_NOT_ACCESSIBLE", 403);
  }
  if (httpStatus === 429 || lower.includes("quota")) {
    return new GoogleAdsConnectorError("Google Ads API quota was exceeded. Sync will retry later.", "GOOGLE_ADS_QUOTA_EXCEEDED", 429);
  }

  return new GoogleAdsConnectorError(message, "GOOGLE_ADS_API_ERROR", httpStatus || 502);
}

function mockCustomers(): GoogleAdsCustomer[] {
  return [{
    id: "1234567890",
    resourceName: "customers/1234567890",
    descriptiveName: "Mock Google Ads Account",
    currencyCode: "USD",
    timeZone: "America/Los_Angeles",
    testAccount: true,
    manager: false
  }];
}

function mockCampaigns(customerId: string): GoogleAdsCampaignRow[] {
  const normalized = normalizeCustomerId(customerId) || "1234567890";
  return [
    { customerId: normalized, campaignId: "9001", campaignName: "Search - Profit Drivers", status: "ENABLED", channelType: "SEARCH" },
    { customerId: normalized, campaignId: "9002", campaignName: "Shopping - Core SKUs", status: "ENABLED", channelType: "SHOPPING" }
  ];
}

function mockAdGroups(customerId: string): GoogleAdsAdGroupRow[] {
  const normalized = normalizeCustomerId(customerId) || "1234567890";
  return [
    { customerId: normalized, campaignId: "9001", adGroupId: "3001", adGroupName: "High margin keywords", status: "ENABLED" },
    { customerId: normalized, campaignId: "9002", adGroupId: "3002", adGroupName: "Shopping products", status: "ENABLED" }
  ];
}

function mockKeywordPerformance(customerId: string, since: string, until: string): GoogleAdsKeywordPerformanceRow[] {
  const normalized = normalizeCustomerId(customerId) || "1234567890";
  return [
    {
      customerId: normalized,
      campaignId: "9001",
      campaignName: "Search - Profit Drivers",
      campaignStatus: "ENABLED",
      channelType: "SEARCH",
      adGroupId: "3001",
      adGroupName: "High margin keywords",
      keywordText: "profitable skincare bundle",
      keywordMatchType: "PHRASE",
      date: until || since,
      impressions: 2400,
      clicks: 132,
      costMicros: 184000000,
      conversions: 18,
      conversionValue: 1420
    },
    {
      customerId: normalized,
      campaignId: "9002",
      campaignName: "Shopping - Core SKUs",
      campaignStatus: "ENABLED",
      channelType: "SHOPPING",
      adGroupId: "3002",
      adGroupName: "Shopping products",
      keywordText: null,
      keywordMatchType: null,
      date: until || since,
      impressions: 5100,
      clicks: 211,
      costMicros: 326000000,
      conversions: 27,
      conversionValue: 2630
    }
  ];
}

function objectValue(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }

  return {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return 0;
}

function booleanValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }

  return null;
}
