import {
  createOAuthState,
  decryptConnectorToken,
  encryptConnectorToken,
  verifyAndConsumeOAuthState
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { GOOGLE_ADS_PROVIDER, GoogleAdsConnectorError } from "@/lib/connectors/google-ads/google-ads-errors";

export const GOOGLE_ADS_OAUTH_SUBJECT = "google_ads";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleAdsApiVersion() {
  return process.env.GOOGLE_ADS_API_VERSION || "v20";
}

export function googleAdsUseMock() {
  return process.env.GOOGLE_ADS_USE_MOCK === "true";
}

export function requiredGoogleAdsEnv() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "");

  if (!clientId) throw new GoogleAdsConnectorError("Missing GOOGLE_ADS_CLIENT_ID.", "MISSING_GOOGLE_ADS_CLIENT_ID", 500);
  if (!clientSecret) throw new GoogleAdsConnectorError("Missing GOOGLE_ADS_CLIENT_SECRET.", "MISSING_GOOGLE_ADS_CLIENT_SECRET", 500);
  if (!redirectUri) throw new GoogleAdsConnectorError("Missing GOOGLE_ADS_OAUTH_REDIRECT_URI.", "MISSING_GOOGLE_ADS_OAUTH_REDIRECT_URI", 500);
  if (!developerToken) throw new GoogleAdsConnectorError("Missing GOOGLE_ADS_DEVELOPER_TOKEN.", "MISSING_GOOGLE_ADS_DEVELOPER_TOKEN", 500);

  return { clientId, clientSecret, redirectUri, developerToken, loginCustomerId, apiVersion: googleAdsApiVersion() };
}

export async function createGoogleAdsOAuthState(input: {
  workspaceId: string;
  userId: string;
  redirectUri: string;
  returnPath?: string | null;
  selectedCustomerId?: string | null;
}) {
  return createOAuthState({
    provider: GOOGLE_ADS_PROVIDER,
    workspaceId: input.workspaceId,
    userId: input.userId,
    shopDomain: GOOGLE_ADS_OAUTH_SUBJECT,
    redirectUri: input.redirectUri,
    scopes: JSON.stringify({
      returnPath: input.returnPath ?? "/dashboard/import-data",
      selectedCustomerId: normalizeCustomerId(input.selectedCustomerId ?? "")
    })
  });
}

export function buildGoogleAdsAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  stateToken: string;
}) {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_ADS_SCOPE);
  url.searchParams.set("state", input.stateToken);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  return url;
}

export async function verifyAndConsumeGoogleAdsOAuthState(stateToken: string | null) {
  const state = await verifyAndConsumeOAuthState({
    stateToken,
    provider: GOOGLE_ADS_PROVIDER,
    shopDomain: GOOGLE_ADS_OAUTH_SUBJECT
  });

  return {
    ...state,
    metadata: parseGoogleAdsOAuthStateScopes(state.scopes)
  };
}

export function parseGoogleAdsOAuthStateScopes(scopes: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(scopes ?? "{}")) as {
      returnPath?: string;
      selectedCustomerId?: string;
    };

    return {
      returnPath: typeof parsed.returnPath === "string" && parsed.returnPath.startsWith("/") ? parsed.returnPath : "/dashboard/import-data",
      selectedCustomerId: normalizeCustomerId(parsed.selectedCustomerId ?? "")
    };
  } catch {
    return { returnPath: "/dashboard/import-data", selectedCustomerId: "" };
  }
}

export async function exchangeGoogleAdsAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
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
    throw new GoogleAdsConnectorError(payload?.error_description || "Google Ads authorization could not be completed.", "GOOGLE_ADS_TOKEN_EXCHANGE_FAILED", 502);
  }

  return {
    accessToken: payload.access_token ?? "",
    encryptedRefreshToken: encryptConnectorToken(payload.refresh_token),
    expiresIn: payload.expires_in ?? 3600
  };
}

export async function refreshGoogleAdsAccessToken(input: {
  encryptedRefreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const refreshToken = decryptConnectorToken(input.encryptedRefreshToken);
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
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
    throw new GoogleAdsConnectorError("Google Ads access expired. Please reconnect your account.", "GOOGLE_ADS_ACCESS_EXPIRED", response.status || 401, true);
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 3600
  };
}

export function googleAdsPublicAccountConfig(input: {
  customerId: string;
  loginCustomerId?: string | null;
  connectorAccountId: string;
  customerName?: string | null;
  currencyCode?: string | null;
  timeZone?: string | null;
  schemaVersion?: string;
}) {
  return {
    provider: GOOGLE_ADS_PROVIDER,
    businessType: "ads",
    customerId: normalizeCustomerId(input.customerId),
    loginCustomerId: normalizeCustomerId(input.loginCustomerId ?? ""),
    customerName: input.customerName ?? null,
    currencyCode: input.currencyCode ?? null,
    timeZone: input.timeZone ?? null,
    connectorAccountId: input.connectorAccountId,
    advertisingDataAvailable: true,
    skuAttributionAvailable: false,
    attributionConfidence: "campaign",
    schemaVersion: input.schemaVersion ?? "ecommerce_canonical_v1"
  };
}

export function normalizeCustomerId(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}
