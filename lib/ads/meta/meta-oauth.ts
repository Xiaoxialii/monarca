import { createOAuthState, encryptConnectorToken, verifyAndConsumeOAuthState } from "@/lib/ecommerce-connectors/shopify-oauth";

export const META_ADS_PROVIDER = "meta_ads";
export const META_OAUTH_STATE_SUBJECT = "meta_ads";

const DEFAULT_META_AUTH_VERSION = "v20.0";
const DEFAULT_META_SCOPES = ["ads_read", "read_insights", "business_management"] as const;

export class MetaConnectorError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400) {
    super(message);
  }
}

export function metaApiVersion() {
  return process.env.META_MARKETING_API_VERSION || process.env.META_API_VERSION || DEFAULT_META_AUTH_VERSION;
}

export function parseMetaScopes(input: string | null | undefined) {
  const scopes = String(input || DEFAULT_META_SCOPES.join(","))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(scopes));

  if (!unique.length) {
    throw new MetaConnectorError("Missing META_SCOPES.", "MISSING_META_SCOPES", 500);
  }

  return unique;
}

export function requiredMetaEnv() {
  const clientId = process.env.META_CLIENT_ID || process.env.FACEBOOK_CLIENT_ID;
  const clientSecret = process.env.META_CLIENT_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI || process.env.FACEBOOK_REDIRECT_URI;
  const scopes = parseMetaScopes(process.env.META_SCOPES || process.env.FACEBOOK_SCOPES).join(",");

  if (!clientId) throw new MetaConnectorError("Missing META_CLIENT_ID.", "MISSING_META_CLIENT_ID", 500);
  if (!clientSecret) throw new MetaConnectorError("Missing META_CLIENT_SECRET.", "MISSING_META_CLIENT_SECRET", 500);
  if (!redirectUri) throw new MetaConnectorError("Missing META_REDIRECT_URI.", "MISSING_META_REDIRECT_URI", 500);

  return { clientId, clientSecret, redirectUri, scopes };
}

export async function createMetaOAuthState(input: {
  workspaceId: string;
  userId: string;
  redirectUri: string;
  scopes: string;
}) {
  return createOAuthState({
    provider: META_ADS_PROVIDER,
    workspaceId: input.workspaceId,
    userId: input.userId,
    shopDomain: META_OAUTH_STATE_SUBJECT,
    redirectUri: input.redirectUri,
    scopes: input.scopes
  });
}

export function buildMetaOAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes: string;
  stateToken: string;
}) {
  const url = new URL(`https://www.facebook.com/${metaApiVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.stateToken);
  url.searchParams.set("scope", input.scopes);
  url.searchParams.set("response_type", "code");

  return url;
}

export async function verifyAndConsumeMetaOAuthState(stateToken: string | null) {
  return verifyAndConsumeOAuthState({
    stateToken,
    provider: META_ADS_PROVIDER,
    shopDomain: META_OAUTH_STATE_SUBJECT
  });
}

export async function exchangeMetaCodeForToken(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL(`https://graph.facebook.com/${metaApiVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("client_secret", input.clientSecret);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code", input.code);

  const response = await fetchImpl(url, { method: "GET" });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string; code?: number; type?: string };
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new MetaConnectorError(payload?.error?.message || "Meta token exchange failed.", "META_TOKEN_EXCHANGE_FAILED", 502);
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? "bearer",
    expiresIn: payload.expires_in ?? null,
    encryptedAccessToken: encryptConnectorToken(payload.access_token)
  };
}

export async function fetchMetaAdAccounts(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL(`https://graph.facebook.com/${metaApiVersion()}/me/adaccounts`);
  url.searchParams.set("fields", "id,account_id,name,account_status,currency,timezone_name");
  url.searchParams.set("limit", "50");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    }
  });
  const payload = await response.json().catch(() => null) as {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string; code?: number; type?: string };
  } | null;

  if (!response.ok) {
    throw new MetaConnectorError(payload?.error?.message || "Meta ad account lookup failed.", "META_AD_ACCOUNT_LOOKUP_FAILED", 502);
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}

export function normalizeMetaAdAccountId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

export function publicMetaError(error: unknown) {
  if (error instanceof MetaConnectorError) {
    return { message: error.message, code: error.code, status: error.status };
  }

  return { message: "Meta Ads connector request failed.", code: "META_CONNECTOR_ERROR", status: 500 };
}
