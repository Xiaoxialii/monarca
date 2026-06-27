import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Shopify OAuth routes and persistence use scoped state and encrypted token storage", () => {
  const schema = read("prisma/schema.prisma");
  const helper = read("lib/ecommerce-connectors/shopify-oauth.ts");
  const startRoute = read("app/api/connectors/shopify/start/route.ts");
  const callbackRoute = read("app/api/connectors/shopify/callback/route.ts");
  const statusRoute = read("app/api/connectors/shopify/status/route.ts");

  assert.match(schema, /ECOMMERCE_PLATFORM/, "DataSourceType should include ecommerce platform sources");
  assert.match(schema, /model OAuthState \{[\s\S]*stateHash\s+String\s+@unique/, "OAuthState should store a state hash");
  assert.doesNotMatch(schema, /stateToken|rawState/, "OAuthState should not store raw state tokens");
  assert.match(schema, /model EcommerceConnectorAccount \{[\s\S]*encryptedAccessToken\s+String/, "Connector account should store encrypted tokens");

  assert.match(helper, /const stateToken = base64Url\(32\)/, "State token should be high entropy");
  assert.match(helper, /crypto\.randomBytes\(bytes\)\.toString\("base64url"\)/, "State helper should use crypto random bytes");
  assert.match(helper, /createHash\("sha256"\)/, "State token should be hashed");
  assert.match(helper, /expiresAt = new Date\(Date\.now\(\) \+ 10 \* 60 \* 1000\)/, "State should expire in 10 minutes");
  assert.match(helper, /updateMany\([\s\S]*usedAt: null[\s\S]*expiresAt: \{ gt: now \}/, "State consumption should be conditional");
  assert.match(helper, /createCipheriv\("aes-256-gcm"/, "Access token should be encrypted");
  assert.match(helper, /timingSafeEqual/, "HMAC verification should use constant-time comparison");

  assert.match(startRoute, /syncCurrentClerkUser\(\)/, "Start route should require Clerk user/workspace");
  assert.match(startRoute, /normalizeShopDomain\(url\.searchParams\.get\("shop"\)\)/, "Start route should normalize shop domain");
  assert.match(startRoute, /createOAuthState\(/, "Start route should create a persisted OAuth state");
  assert.doesNotMatch(startRoute, /workspaceId.*searchParams\.set|searchParams\.set\("workspaceId"/, "Start route should not put workspaceId in OAuth URL");

  assert.match(callbackRoute, /verifyShopifyCallbackHmac\(url, clientSecret\)/, "Callback should verify hmac before state consumption");
  assert.match(callbackRoute, /verifyAndConsumeOAuthState\(/, "Callback should verify and consume OAuth state");
  assert.match(callbackRoute, /exchangeShopifyCodeForToken\(/, "Callback should exchange code for token");
  assert.match(callbackRoute, /encryptConnectorToken\(token\.accessToken\)/, "Callback should encrypt token before storing");
  assert.match(callbackRoute, /DataSourceType\.ECOMMERCE_PLATFORM/, "Callback should create an ecommerce platform data source");
  assert.doesNotMatch(callbackRoute, /workspaceId\s*=\s*url\.searchParams|get\("workspaceId"\)/, "Callback must not trust workspaceId from query");
  assert.doesNotMatch(callbackRoute, /accessToken[^,\n]*config|encryptedAccessToken[^,\n]*config/, "DataSource config must not store tokens");

  assert.match(statusRoute, /workspaceId: session\.workspace\.id/, "Status should be workspace scoped");
  assert.doesNotMatch(statusRoute, /encryptedAccessToken|accessToken/, "Status response should not expose tokens");
});
