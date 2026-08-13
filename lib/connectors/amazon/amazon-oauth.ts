import {
  createOAuthState,
  decryptConnectorToken,
  encryptConnectorToken,
  verifyAndConsumeOAuthState
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { AmazonConnectorError, AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import { amazonRegionConfig, normalizeAmazonRegion } from "@/lib/connectors/amazon/amazon-regions";
import { marketplaceSummary, normalizeMarketplaceIds, type AmazonRegionCode } from "@/lib/connectors/amazon/amazon-marketplaces";

export const AMAZON_OAUTH_STATE_DOMAIN = "amazon";
export const AMAZON_LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export function amazonFirstSyncDays() {
  return numberEnv("AMAZON_FIRST_SYNC_DAYS", 90);
}

export function amazonSafetyOverlapMs() {
  return numberEnv("AMAZON_SYNC_SAFETY_OVERLAP_MS", 5 * 60 * 1000);
}

function numberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AmazonConnectorError(`Invalid ${name}.`, `INVALID_${name}`, 500);
  }

  return parsed;
}

export function requiredAmazonEnv() {
  const appId = process.env.AMAZON_SP_API_APP_ID;
  const clientId = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  const redirectUri = process.env.AMAZON_OAUTH_REDIRECT_URI;
  const awsAccessKeyId = process.env.AMAZON_AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AMAZON_AWS_SECRET_ACCESS_KEY;

  if (!appId) throw new AmazonConnectorError("Missing AMAZON_SP_API_APP_ID.", "MISSING_AMAZON_SP_API_APP_ID", 500);
  if (!clientId) throw new AmazonConnectorError("Missing AMAZON_LWA_CLIENT_ID.", "MISSING_AMAZON_LWA_CLIENT_ID", 500);
  if (!clientSecret) throw new AmazonConnectorError("Missing AMAZON_LWA_CLIENT_SECRET.", "MISSING_AMAZON_LWA_CLIENT_SECRET", 500);
  if (!redirectUri) throw new AmazonConnectorError("Missing AMAZON_OAUTH_REDIRECT_URI.", "MISSING_AMAZON_OAUTH_REDIRECT_URI", 500);
  if (!awsAccessKeyId) throw new AmazonConnectorError("Missing AMAZON_AWS_ACCESS_KEY_ID.", "MISSING_AMAZON_AWS_ACCESS_KEY_ID", 500);
  if (!awsSecretAccessKey) throw new AmazonConnectorError("Missing AMAZON_AWS_SECRET_ACCESS_KEY.", "MISSING_AMAZON_AWS_SECRET_ACCESS_KEY", 500);

  return {
    appId,
    clientId,
    clientSecret,
    redirectUri,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken: process.env.AMAZON_AWS_SESSION_TOKEN || null
  };
}

export async function createAmazonOAuthState(input: {
  workspaceId: string;
  userId: string;
  redirectUri: string;
  region: AmazonRegionCode;
  marketplaceIds: string[];
  returnPath?: string | null;
}) {
  return createOAuthState({
    provider: AMAZON_PROVIDER,
    workspaceId: input.workspaceId,
    userId: input.userId,
    shopDomain: AMAZON_OAUTH_STATE_DOMAIN,
    redirectUri: input.redirectUri,
    scopes: JSON.stringify({
      region: input.region,
      marketplaceIds: input.marketplaceIds,
      returnPath: input.returnPath ?? "/dashboard/settings?section=data-sources"
    })
  });
}

export function parseAmazonOAuthStateScopes(scopes: string | null | undefined) {
  const fallback = {
    region: "na" as AmazonRegionCode,
    marketplaceIds: normalizeMarketplaceIds(null, "na"),
    returnPath: "/dashboard/settings?section=data-sources"
  };

  try {
    const parsed = JSON.parse(String(scopes ?? "{}")) as {
      region?: string;
      marketplaceIds?: string[];
      returnPath?: string;
    };
    const region = normalizeAmazonRegion(parsed.region);

    return {
      region,
      marketplaceIds: normalizeMarketplaceIds(parsed.marketplaceIds, region),
      returnPath: typeof parsed.returnPath === "string" && parsed.returnPath.startsWith("/") ? parsed.returnPath : fallback.returnPath
    };
  } catch {
    return fallback;
  }
}

export async function verifyAndConsumeAmazonOAuthState(stateToken: string | null) {
  const state = await verifyAndConsumeOAuthState({
    stateToken,
    provider: AMAZON_PROVIDER,
    shopDomain: AMAZON_OAUTH_STATE_DOMAIN
  });

  return {
    ...state,
    metadata: parseAmazonOAuthStateScopes(state.scopes)
  };
}

export function buildAmazonAuthorizationUrl(input: {
  appId: string;
  stateToken: string;
  region: AmazonRegionCode;
}) {
  const region = amazonRegionConfig(input.region);
  const url = new URL(region.sellerCentralAuthorizeUrl);
  url.searchParams.set("application_id", input.appId);
  url.searchParams.set("state", input.stateToken);

  return url;
}

export async function exchangeAmazonAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(AMAZON_LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri
    })
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.refresh_token) {
    throw new AmazonConnectorError("Amazon authorization could not be completed.", "TOKEN_EXCHANGE_FAILED", 502);
  }

  return {
    accessToken: payload.access_token ?? "",
    encryptedRefreshToken: encryptConnectorToken(payload.refresh_token),
    expiresIn: payload.expires_in ?? 3600
  };
}

export async function refreshAmazonAccessToken(input: {
  encryptedRefreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const refreshToken = decryptConnectorToken(input.encryptedRefreshToken);
  const response = await fetch(AMAZON_LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret
    })
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new AmazonConnectorError("Amazon authorization needs to be renewed.", "TOKEN_REFRESH_FAILED", response.status || 401, true);
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 3600
  };
}

export function amazonPublicAccountConfig(input: {
  sellerId: string;
  connectorAccountId: string;
  region: AmazonRegionCode;
  marketplaceIds: string[];
  schemaVersion?: string;
  authorizationStatus?: string;
}) {
  const marketplaces = marketplaceSummary(input.marketplaceIds);

  return {
    provider: AMAZON_PROVIDER,
    businessType: "ecommerce",
    sellerId: input.sellerId,
    sellingPartnerId: input.sellerId,
    sellerDisplay: input.sellerId ? `...${input.sellerId.slice(-4)}` : null,
    connectorAccountId: input.connectorAccountId,
    amazonRegion: input.region,
    marketplaceIds: input.marketplaceIds,
    marketplaces,
    countries: marketplaces.map((marketplace) => marketplace.country),
    currencies: Array.from(new Set(marketplaces.map((marketplace) => marketplace.currency))),
    authorizationStatus: input.authorizationStatus ?? "connected",
    schemaVersion: input.schemaVersion ?? "ecommerce_canonical_v1"
  };
}
