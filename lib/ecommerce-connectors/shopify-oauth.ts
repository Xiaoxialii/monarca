import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const SHOPIFY_PROVIDER = "shopify";
export const REQUIRED_SHOPIFY_SCOPES = ["read_orders", "read_products", "read_customers"] as const;

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

export function parseShopifyScopes(input: string | null | undefined) {
  const scopes = String(input ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim().replace(/^["'\[]+|["'\]]+$/g, "").toLowerCase())
    .filter(Boolean);
  const uniqueScopes = Array.from(new Set(scopes));

  if (uniqueScopes.length === 0) {
    throw new ShopifyConnectorError("Missing SHOPIFY_SCOPES.", "MISSING_SHOPIFY_SCOPES", 500);
  }

  const invalidScope = uniqueScopes.find((scope) => !/^[a-z][a-z0-9_]*$/.test(scope));
  if (invalidScope) {
    throw new ShopifyConnectorError(`Invalid Shopify scope: ${invalidScope}.`, "INVALID_SHOPIFY_SCOPES", 500);
  }

  return uniqueScopes;
}

export function formatShopifyScopes(input: string | string[] | null | undefined) {
  return parseShopifyScopes(Array.isArray(input) ? input.join(",") : input).join(",");
}

export function missingRequiredShopifyScopes(grantedScopes: string | string[]) {
  const granted = new Set(Array.isArray(grantedScopes) ? grantedScopes : parseShopifyScopes(grantedScopes));

  return REQUIRED_SHOPIFY_SCOPES.filter((scope) => !granted.has(scope));
}

export function assertRequiredShopifyScopes(grantedScopes: string | string[]) {
  const missing = missingRequiredShopifyScopes(grantedScopes);

  if (missing.length > 0) {
    throw new ShopifyConnectorError(
      `Shopify did not grant required Admin API scopes: ${missing.join(", ")}.`,
      "SHOPIFY_SCOPES_NOT_GRANTED",
      400
    );
  }
}

export function isShopifyProtectedDataAccessError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return normalized.includes("protected-customer-data")
    || normalized.includes("not approved to access the order object")
    || normalized.includes("not approved to access the customer object")
    || normalized.includes("not approved to access the draftorder object");
}

export function protectedShopifyDataAccessError(resource = "Order") {
  return new ShopifyConnectorError(
    `This Shopify store does not allow ${resource} API access due to plan restrictions. Required: Shopify plan upgrade OR enable Protected Customer Data Access.`,
    "SHOPIFY_PROTECTED_CUSTOMER_DATA_REQUIRED",
    403
  );
}

export function requiredShopifyEnv() {
  const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const scopes = formatShopifyScopes(process.env.SHOPIFY_SCOPES);

  if (!clientId) throw new ShopifyConnectorError("Missing SHOPIFY_CLIENT_ID.", "MISSING_SHOPIFY_CLIENT_ID", 500);
  if (!clientSecret) throw new ShopifyConnectorError("Missing SHOPIFY_CLIENT_SECRET.", "MISSING_SHOPIFY_CLIENT_SECRET", 500);
  if (!redirectUri) throw new ShopifyConnectorError("Missing SHOPIFY_REDIRECT_URI.", "MISSING_SHOPIFY_REDIRECT_URI", 500);
  assertRequiredShopifyScopes(scopes);

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

export function decryptConnectorToken(encryptedToken: string) {
  const [version, ivValue, tagValue, encryptedValue] = encryptedToken.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new ShopifyConnectorError("Invalid encrypted connector token.", "INVALID_ENCRYPTED_CONNECTOR_TOKEN", 500);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function hashOAuthState(stateToken: string) {
  return crypto.createHash("sha256").update(stateToken).digest("hex");
}

export async function createOAuthState(input: {
  provider: string;
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
  provider: string;
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
