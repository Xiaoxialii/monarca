import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const SHOPIFY_PROVIDER = "shopify";

export class ShopifyConnectorError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400) {
    super(message);
  }
}

function base64Url(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function normalizeShopDomain(input: string | null | undefined) {
  const raw = String(input ?? "").trim().toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, "");
  const domain = withoutProtocol.replace(/\/+$/, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new ShopifyConnectorError("Invalid Shopify shop domain. Use a valid *.myshopify.com domain.", "INVALID_SHOP_DOMAIN");
  }

  return domain;
}

export function requiredShopifyEnv() {
  const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const scopes = process.env.SHOPIFY_SCOPES;

  if (!clientId) throw new ShopifyConnectorError("Missing SHOPIFY_CLIENT_ID.", "MISSING_SHOPIFY_CLIENT_ID", 500);
  if (!clientSecret) throw new ShopifyConnectorError("Missing SHOPIFY_CLIENT_SECRET.", "MISSING_SHOPIFY_CLIENT_SECRET", 500);
  if (!redirectUri) throw new ShopifyConnectorError("Missing SHOPIFY_REDIRECT_URI.", "MISSING_SHOPIFY_REDIRECT_URI", 500);
  if (!scopes) throw new ShopifyConnectorError("Missing SHOPIFY_SCOPES.", "MISSING_SHOPIFY_SCOPES", 500);

  return { clientId, clientSecret, redirectUri, scopes };
}

export function shopifyApiVersion() {
  const version = process.env.SHOPIFY_API_VERSION;

  if (!version || version === "latest") {
    throw new ShopifyConnectorError("Missing or invalid SHOPIFY_API_VERSION. Use a fixed version, not latest.", "MISSING_SHOPIFY_API_VERSION", 500);
  }

  return version;
}

function encryptionKey() {
  const encoded = process.env.CONNECTOR_TOKEN_ENCRYPTION_KEY;

  if (!encoded) {
    throw new ShopifyConnectorError("Missing CONNECTOR_TOKEN_ENCRYPTION_KEY.", "MISSING_CONNECTOR_TOKEN_ENCRYPTION_KEY", 500);
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new ShopifyConnectorError("CONNECTOR_TOKEN_ENCRYPTION_KEY must be a 32 byte base64 key.", "INVALID_CONNECTOR_TOKEN_ENCRYPTION_KEY", 500);
  }

  return key;
}

export function encryptConnectorToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function hashOAuthState(stateToken: string) {
  return crypto.createHash("sha256").update(stateToken).digest("hex");
}

export async function createOAuthState(input: {
  provider: typeof SHOPIFY_PROVIDER;
  workspaceId: string;
  userId: string;
  shopDomain: string;
  redirectUri: string;
  scopes: string;
}) {
  const stateToken = base64Url(32);
  const nonce = base64Url(16);
  const stateHash = hashOAuthState(stateToken);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.oAuthState.create({
    data: {
      stateHash,
      provider: input.provider,
      workspaceId: input.workspaceId,
      userId: input.userId,
      shopDomain: input.shopDomain,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      nonce,
      expiresAt
    }
  });

  return { stateToken, stateHashPrefix: stateHash.slice(0, 8), expiresAt };
}

export async function verifyAndConsumeOAuthState(input: {
  stateToken: string | null;
  provider: typeof SHOPIFY_PROVIDER;
  shopDomain: string;
  now?: Date;
}) {
  if (!input.stateToken) {
    throw new ShopifyConnectorError("Missing OAuth state.", "MISSING_STATE");
  }

  const stateHash = hashOAuthState(input.stateToken);
  const state = await prisma.oAuthState.findUnique({ where: { stateHash } });
  const now = input.now ?? new Date();

  if (!state) throw new ShopifyConnectorError("OAuth state not found.", "STATE_NOT_FOUND");
  if (state.provider !== input.provider) throw new ShopifyConnectorError("OAuth state provider mismatch.", "STATE_PROVIDER_MISMATCH");
  if (state.shopDomain !== input.shopDomain) throw new ShopifyConnectorError("OAuth state shop mismatch.", "STATE_SHOP_MISMATCH");
  if (state.expiresAt.getTime() <= now.getTime()) throw new ShopifyConnectorError("OAuth state expired.", "STATE_EXPIRED");
  if (state.usedAt) throw new ShopifyConnectorError("OAuth state already used.", "STATE_ALREADY_USED");

  const consumed = await prisma.oAuthState.updateMany({
    where: {
      id: state.id,
      usedAt: null,
      expiresAt: { gt: now }
    },
    data: { usedAt: now }
  });

  if (consumed.count !== 1) {
    throw new ShopifyConnectorError("OAuth state already used.", "STATE_ALREADY_USED");
  }

  return {
    id: state.id,
    workspaceId: state.workspaceId,
    userId: state.userId,
    shopDomain: state.shopDomain,
    redirectUri: state.redirectUri,
    scopes: state.scopes,
    stateHashPrefix: stateHash.slice(0, 8)
  };
}

export function verifyShopifyCallbackHmac(url: URL, clientSecret: string) {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) throw new ShopifyConnectorError("Missing Shopify hmac.", "MISSING_HMAC");

  const message = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  const actual = Buffer.from(hmac, "hex");
  const expected = Buffer.from(digest, "hex");

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new ShopifyConnectorError("Invalid Shopify hmac.", "INVALID_HMAC");
  }
}

export async function exchangeShopifyCodeForToken(input: {
  shopDomain: string;
  code: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch(`https://${input.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code
    })
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; scope?: string; error?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new ShopifyConnectorError("Shopify token exchange failed.", "TOKEN_EXCHANGE_FAILED", 502);
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? ""
  };
}

export function publicShopifyError(error: unknown) {
  if (error instanceof ShopifyConnectorError) {
    return { message: error.message, code: error.code, status: error.status };
  }

  return { message: "Shopify connector request failed.", code: "SHOPIFY_CONNECTOR_ERROR", status: 500 };
}
