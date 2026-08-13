import crypto from "node:crypto";
import { AmazonConnectorError } from "@/lib/connectors/amazon/amazon-errors";
import type {
  AmazonCatalogItem,
  AmazonFinancialEvent,
  AmazonInventorySummary,
  AmazonOrder,
  AmazonOrderItem
} from "@/lib/connectors/amazon/amazon-types";

type AmazonClientConfig = {
  accessToken: string;
  endpoint: string;
  awsSigningRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string | null;
};

type PageResult<T> = {
  records: T[];
  nextToken: string | null;
};

const MAX_RETRIES = 4;

export class AmazonSellingPartnerClient {
  readonly stats = {
    rateLimitRetries: 0,
    pagesFetched: 0
  };

  constructor(private readonly config: AmazonClientConfig) {}

  async listOrders(input: {
    marketplaceIds: string[];
    lastUpdatedAfter: string;
    nextToken?: string | null;
  }): Promise<PageResult<AmazonOrder>> {
    const query: Record<string, string> = input.nextToken
      ? { NextToken: input.nextToken }
      : {
          MarketplaceIds: input.marketplaceIds.join(","),
          LastUpdatedAfter: input.lastUpdatedAfter
        };
    const payload = await this.request<{ payload?: { Orders?: AmazonOrder[]; NextToken?: string } }>("/orders/v0/orders", query);

    return {
      records: payload.payload?.Orders ?? [],
      nextToken: payload.payload?.NextToken ?? null
    };
  }

  async listOrderItems(input: {
    amazonOrderId: string;
    nextToken?: string | null;
  }): Promise<PageResult<AmazonOrderItem>> {
    const payload = await this.request<{ payload?: { OrderItems?: AmazonOrderItem[]; NextToken?: string } }>(
      `/orders/v0/orders/${encodeURIComponent(input.amazonOrderId)}/orderItems`,
      input.nextToken ? { NextToken: input.nextToken } : {}
    );

    return {
      records: payload.payload?.OrderItems ?? [],
      nextToken: payload.payload?.NextToken ?? null
    };
  }

  async listInventorySummaries(input: {
    marketplaceIds: string[];
    startDateTime: string;
    nextToken?: string | null;
  }): Promise<PageResult<AmazonInventorySummary>> {
    const payload = await this.request<{ payload?: { inventorySummaries?: AmazonInventorySummary[]; nextToken?: string } }>(
      "/fba/inventory/v1/summaries",
      input.nextToken
        ? { nextToken: input.nextToken }
        : {
            granularityType: "Marketplace",
            granularityId: input.marketplaceIds[0] ?? "",
            marketplaceIds: input.marketplaceIds.join(","),
            startDateTime: input.startDateTime,
            details: "true"
          }
    );

    return {
      records: payload.payload?.inventorySummaries ?? [],
      nextToken: payload.payload?.nextToken ?? null
    };
  }

  async listFinancialEvents(input: {
    postedAfter: string;
    nextToken?: string | null;
  }): Promise<PageResult<AmazonFinancialEvent>> {
    const payload = await this.request<{ payload?: { FinancialEvents?: AmazonFinancialEvent; NextToken?: string } }>(
      "/finances/v0/financialEvents",
      input.nextToken ? { NextToken: input.nextToken } : { PostedAfter: input.postedAfter }
    );
    const events = flattenFinancialEvents(payload.payload?.FinancialEvents);

    return {
      records: events,
      nextToken: payload.payload?.NextToken ?? null
    };
  }

  async getCatalogItems(input: {
    asinList: string[];
    marketplaceIds: string[];
  }): Promise<AmazonCatalogItem[]> {
    if (input.asinList.length === 0) return [];
    const records: AmazonCatalogItem[] = [];

    for (let offset = 0; offset < input.asinList.length; offset += 20) {
      const identifiers = input.asinList.slice(offset, offset + 20);
      const payload = await this.request<{ items?: AmazonCatalogItem[] }>("/catalog/2022-04-01/items", {
        marketplaceIds: input.marketplaceIds.join(","),
        identifiers: identifiers.join(","),
        identifiersType: "ASIN",
        includedData: "summaries,attributes"
      });
      records.push(...(payload.items ?? []));
    }

    return records;
  }

  private async request<T>(path: string, query: Record<string, string>) {
    const url = new URL(path, this.config.endpoint);
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const headers = this.sign("GET", url);
      const response = await fetch(url, { method: "GET", headers });
      if (response.status === 429 || response.status === 503) {
        this.stats.rateLimitRetries += 1;
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
      if (response.status === 401 || response.status === 403) {
        throw new AmazonConnectorError("Amazon authorization needs to be renewed.", "AUTHORIZATION_EXPIRED", response.status, true);
      }
      const payload = await response.json().catch(() => null) as T | { errors?: Array<{ code?: string; message?: string }> } | null;
      if (!response.ok) {
        const message = Array.isArray((payload as { errors?: unknown[] } | null)?.errors)
          ? ((payload as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? "Amazon SP-API request failed.")
          : "Amazon SP-API request failed.";
        throw new AmazonConnectorError(message, response.status === 429 ? "RATE_LIMITED" : "SP_API_ERROR", response.status);
      }
      this.stats.pagesFetched += 1;

      return payload as T;
    }

    throw new AmazonConnectorError("Amazon SP-API retry limit reached.", "RATE_LIMITED", 429);
  }

  private sign(method: string, url: URL) {
    const amzDate = timestamp();
    const dateStamp = amzDate.slice(0, 8);
    const service = "execute-api";
    const payloadHash = sha256Hex("");
    const canonicalQuery = canonicalQueryString(url.searchParams);
    const canonicalHeaders = [
      `host:${url.host}`,
      `x-amz-access-token:${this.config.accessToken}`,
      `x-amz-date:${amzDate}`,
      ...(this.config.awsSessionToken ? [`x-amz-security-token:${this.config.awsSessionToken}`] : [])
    ].join("\n") + "\n";
    const signedHeaders = this.config.awsSessionToken
      ? "host;x-amz-access-token;x-amz-date;x-amz-security-token"
      : "host;x-amz-access-token;x-amz-date";
    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.config.awsSigningRegion}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");
    const signature = hmac(signingKey(this.config.awsSecretAccessKey, dateStamp, this.config.awsSigningRegion, service), stringToSign).toString("hex");

    return {
      "x-amz-access-token": this.config.accessToken,
      "x-amz-date": amzDate,
      ...(this.config.awsSessionToken ? { "x-amz-security-token": this.config.awsSessionToken } : {}),
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    };
  }
}

export async function fetchAllAmazonPages<T>(input: {
  fetchPage: (nextToken: string | null) => Promise<PageResult<T>>;
  maxPages?: number;
}) {
  const records: T[] = [];
  let nextToken: string | null = null;
  let page = 0;
  const maxPages = input.maxPages ?? 500;

  do {
    const result = await input.fetchPage(nextToken);
    records.push(...result.records);
    nextToken = result.nextToken;
    page += 1;
  } while (nextToken && page < maxPages);

  return { records, completed: !nextToken, lastCursor: nextToken, pageCount: page };
}

function flattenFinancialEvents(events: AmazonFinancialEvent | null | undefined) {
  if (!events || typeof events !== "object") return [];
  const rows: AmazonFinancialEvent[] = [];

  for (const [eventType, value] of Object.entries(events)) {
    if (!Array.isArray(value)) continue;
    for (const event of value) {
      if (event && typeof event === "object") rows.push({ eventType, ...event as Record<string, unknown> });
    }
  }

  return rows;
}

function canonicalQueryString(params: URLSearchParams) {
  return Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function timestamp() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function backoffMs(attempt: number) {
  const base = Math.min(30_000, 500 * (2 ** attempt));
  return base + Math.floor(Math.random() * 250);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
