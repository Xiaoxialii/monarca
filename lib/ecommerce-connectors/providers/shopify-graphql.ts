import { ShopifyConnectorError, shopifyApiVersion } from "@/lib/ecommerce-connectors/shopify-oauth";

type ShopifyGraphQLError = {
  message?: string;
  extensions?: {
    code?: string;
  };
};

type ShopifyGraphQLResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[];
};

type PageInfo = {
  hasNextPage?: boolean;
  endCursor?: string | null;
};

type Connection<T> = {
  edges?: Array<{ node?: T | null; cursor?: string | null } | null>;
  pageInfo?: PageInfo | null;
};

export class ShopifyGraphQLClient {
  private readonly endpoint: string;

  constructor(private readonly input: { shopDomain: string; accessToken: string; apiVersion?: string }) {
    const apiVersion = input.apiVersion ?? shopifyApiVersion();

    this.endpoint = `https://${input.shopDomain}/admin/api/${apiVersion}/graphql.json`;
  }

  async fetchGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.input.accessToken
        },
        body: JSON.stringify({ query, variables: variables ?? {} })
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) {
        if (attempt < maxAttempts) {
          await wait(backoffMs(attempt));
          continue;
        }
        throw new ShopifyConnectorError("Shopify GraphQL request failed.", "SHOPIFY_GRAPHQL_NETWORK_ERROR", 502);
      }

      const retryAfterMs = retryAfter(response);
      if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
        await wait(retryAfterMs ?? backoffMs(attempt));
        continue;
      }

      const payload = await response.json().catch(() => null) as ShopifyGraphQLResponse<T> | null;

      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? "SHOPIFY_TOKEN_INVALID"
          : response.status === 429
            ? "SHOPIFY_RATE_LIMITED"
            : "SHOPIFY_GRAPHQL_HTTP_ERROR";
        throw new ShopifyConnectorError("Shopify GraphQL request failed.", code, response.status === 429 ? 429 : 502);
      }

      if (!payload) {
        throw new ShopifyConnectorError("Shopify GraphQL returned an invalid JSON response.", "SHOPIFY_GRAPHQL_INVALID_RESPONSE", 502);
      }

      if (payload.errors?.length) {
        const isThrottled = payload.errors.some((error) => error.extensions?.code === "THROTTLED");
        if (isThrottled && attempt < maxAttempts) {
          await wait(backoffMs(attempt));
          continue;
        }

        throw new ShopifyConnectorError(
          payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "Shopify GraphQL returned errors.",
          isThrottled ? "SHOPIFY_RATE_LIMITED" : "SHOPIFY_GRAPHQL_ERROR",
          isThrottled ? 429 : 502
        );
      }

      if (!payload.data) {
        throw new ShopifyConnectorError("Shopify GraphQL response did not include data.", "SHOPIFY_GRAPHQL_EMPTY_DATA", 502);
      }

      return payload.data;
    }

    throw lastError instanceof ShopifyConnectorError
      ? lastError
      : new ShopifyConnectorError("Shopify GraphQL request failed.", "SHOPIFY_GRAPHQL_ERROR", 502);
  }

  async fetchConnection<T>(
    query: string,
    connectionKey: string,
    variables: Record<string, unknown> = {},
    maxNodes = 50
  ): Promise<T[]> {
    const nodes: T[] = [];
    let cursor: string | null = null;

    while (nodes.length < maxNodes) {
      const data: Record<string, Connection<T> | undefined> = await this.fetchGraphQL<Record<string, Connection<T> | undefined>>(query, {
        ...variables,
        first: Math.min(50, maxNodes - nodes.length),
        after: cursor
      });
      const connection: Connection<T> | undefined = data[connectionKey];

      for (const edge of connection?.edges ?? []) {
        if (edge?.node) {
          nodes.push(edge.node);
        }
      }

      if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) {
        break;
      }

      cursor = connection.pageInfo.endCursor;
    }

    return nodes;
  }
}

function retryAfter(response: Response) {
  const raw = response.headers.get("retry-after");
  const seconds = raw ? Number(raw) : NaN;

  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function backoffMs(attempt: number) {
  return 300 * 2 ** (attempt - 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
