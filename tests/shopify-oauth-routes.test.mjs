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
  const fetchRoute = read("app/api/connectors/shopify/fetch/route.ts");
  const graphQLClient = read("lib/ecommerce-connectors/providers/shopify-graphql.ts");

  assert.match(schema, /ECOMMERCE_PLATFORM/, "DataSourceType should include ecommerce platform sources");
  assert.match(schema, /model OAuthState \{[\s\S]*stateHash\s+String\s+@unique/, "OAuthState should store a state hash");
  assert.doesNotMatch(schema, /stateToken|rawState/, "OAuthState should not store raw state tokens");
  assert.match(schema, /model EcommerceConnectorAccount \{[\s\S]*encryptedAccessToken\s+String/, "Connector account should store encrypted tokens");
  assert.match(schema, /model EcommerceConnectorAccount \{[\s\S]*grantedScopes\s+String\?/, "Connector account should store granted Shopify scopes");
  assert.match(schema, /model EcommerceConnectorAccount \{[\s\S]*requiredScopes\s+String\?/, "Connector account should store current required Shopify scopes");
  assert.match(schema, /model EcommerceConnectorAccount \{[\s\S]*scopeStatus\s+String\s+@default\("OK"\)/, "Connector account should store scope migration status");

  assert.match(helper, /const stateToken = base64Url\(32\)/, "State token should be high entropy");
  assert.match(helper, /crypto\.randomBytes\(bytes\)\.toString\("base64url"\)/, "State helper should use crypto random bytes");
  assert.match(helper, /createHash\("sha256"\)/, "State token should be hashed");
  assert.match(helper, /expiresAt = new Date\(Date\.now\(\) \+ 10 \* 60 \* 1000\)/, "State should expire in 10 minutes");
  assert.match(helper, /updateMany\([\s\S]*usedAt: null[\s\S]*expiresAt: \{ gt: now \}/, "State consumption should be conditional");
  assert.match(helper, /createCipheriv\("aes-256-gcm"/, "Access token should be encrypted");
  assert.match(helper, /timingSafeEqual/, "HMAC verification should use constant-time comparison");
  assert.match(helper, /REQUIRED_SHOPIFY_SCOPES = \["read_orders", "read_products", "read_customers"\]/, "Shopify OAuth should declare required Admin API data scopes");
  assert.match(helper, /function parseShopifyScopes/, "Shopify scopes should be normalized before authorization");
  assert.match(helper, /split\(\/\[\\s,\]\+\//, "Shopify scopes should accept comma or whitespace separated env values");
  assert.match(helper, /function shopifyScopeGranted/, "Shopify scope comparison should centralize implied scope handling");
  assert.match(helper, /requiredScope\.startsWith\("read_"\)/, "Shopify write scopes should satisfy matching read scope requirements");
  assert.match(helper, /assertRequiredShopifyScopes\(scopes\)/, "Shopify env validation should require orders, products, and customers scopes");
  assert.match(helper, /function isShopifyProtectedDataAccessError/, "Shopify connector should classify protected customer data access errors");
  assert.match(helper, /SHOPIFY_PROTECTED_CUSTOMER_DATA_REQUIRED/, "Shopify connector should expose a stable protected data access error code");
  assert.match(helper, /Shopify plan upgrade OR enable Protected Customer Data Access/, "Protected data access errors should explain the required remediation");

  assert.match(startRoute, /syncCurrentClerkUser\(\)/, "Start route should require Clerk user/workspace");
  assert.match(startRoute, /normalizeShopDomain\(url\.searchParams\.get\("shop"\)\)/, "Start route should normalize shop domain");
  assert.doesNotMatch(startRoute, /SHOPIFY_DEFAULT_SHOP_DOMAIN|NEXT_PUBLIC_SHOPIFY_DEFAULT_SHOP_DOMAIN|\|\|\s*process\.env/, "Start route must not use a default or fallback Shopify shop");
  assert.match(startRoute, /createOAuthState\(/, "Start route should create a persisted OAuth state");
  assert.doesNotMatch(startRoute, /workspaceId.*searchParams\.set|searchParams\.set\("workspaceId"/, "Start route should not put workspaceId in OAuth URL");

  assert.match(callbackRoute, /verifyShopifyCallbackHmac\(url, clientSecret\)/, "Callback should verify hmac before state consumption");
  assert.match(callbackRoute, /verifyAndConsumeOAuthState\(/, "Callback should verify and consume OAuth state");
  assert.match(callbackRoute, /exchangeShopifyCodeForToken\(/, "Callback should exchange code for token");
  assert.match(callbackRoute, /currentRequiredShopifyScopes\(\)/, "Callback should snapshot the app's current required Shopify scopes");
  assert.match(callbackRoute, /missingConfiguredShopifyScopes\(requiredScopes, grantedScopes\)/, "Callback should compare granted scopes against required scopes");
  assert.match(callbackRoute, /shopifyScopeStatus\(requiredScopes, grantedScopes\)/, "Callback should compute scope migration status");
  assert.match(callbackRoute, /formatShopifyScopes\(token\.scope\)/, "Callback should persist Shopify's normalized granted scopes");
  assert.match(callbackRoute, /grantedScopes[\s\S]*requiredScopes[\s\S]*scopeStatus/, "Callback should persist granted, required, and status scope metadata");
  assert.match(callbackRoute, /SHOPIFY_SCOPES_NOT_GRANTED/, "Callback should redirect with a stable scope migration code when permissions are incomplete");
  assert.match(callbackRoute, /after\(\(\) => runInitialShopifySync/, "Callback should enqueue initial Shopify sync after OAuth succeeds");
  assert.match(callbackRoute, /type: "SYNC_DATA_SOURCE"/, "Initial Shopify sync should be tracked as a background job");
  assert.match(callbackRoute, /runShopifyProductionSync\(prisma/, "Initial Shopify sync should generate canonical Shopify snapshots");
  assert.match(callbackRoute, /encryptConnectorToken\(token\.accessToken\)/, "Callback should encrypt token before storing");
  assert.match(callbackRoute, /DataSourceType\.ECOMMERCE_PLATFORM/, "Callback should create an ecommerce platform data source");
  assert.doesNotMatch(callbackRoute, /workspaceId\s*=\s*url\.searchParams|get\("workspaceId"\)/, "Callback must not trust workspaceId from query");
  assert.doesNotMatch(callbackRoute, /accessToken[^,\n]*config|encryptedAccessToken[^,\n]*config/, "DataSource config must not store tokens");

  assert.match(statusRoute, /workspaceId: session\.workspace\.id/, "Status should be workspace scoped");
  assert.match(statusRoute, /missingConfiguredShopifyScopes\(requiredScopes, grantedScopes\)/, "Status route should detect outdated granted scopes");
  assert.match(statusRoute, /scopeStatus/, "Status route should expose scope migration state without tokens");
  assert.doesNotMatch(statusRoute, /encryptedAccessToken|accessToken/, "Status response should not expose tokens");

  assert.match(graphQLClient, /X-Shopify-Access-Token/, "GraphQL client should authenticate with Shopify access token header");
  assert.match(graphQLClient, /shopifyApiVersion\(\)/, "GraphQL client should use a fixed configured Shopify API version");
  assert.match(fetchRoute, /decryptConnectorToken\(account\.encryptedAccessToken\)/, "Fetch route should decrypt token only in memory");
  assert.match(fetchRoute, /workspaceId: session\.workspace\.id/, "Fetch route should be workspace scoped");
  assert.match(fetchRoute, /orders\(first: \$first/, "Fetch route should read orders");
  assert.match(fetchRoute, /products\(first: \$first/, "Fetch route should read products");
  assert.match(fetchRoute, /customers\(first: \$first/, "Fetch route should read customers");
  assert.match(fetchRoute, /fetchOptionalConnection/, "Fetch route should allow protected optional resources to degrade with warnings");
  assert.match(fetchRoute, /warnings/, "Fetch route should return protected data access warnings");
  assert.doesNotMatch(fetchRoute, /prisma\.\w+\.(create|update|upsert|delete)|R2|manifest|generateWorkspaceMetrics|report/i, "Fetch route must not write data, generate artifacts, metrics, or reports");
  assert.doesNotMatch(fetchRoute, /accessToken[^,\n]*NextResponse|encryptedAccessToken[^,\n]*NextResponse/, "Fetch route must not return tokens");
});

test("Shopify scope migration supports reauthorization without uninstalling", () => {
  const migration = read("prisma/migrations/20260718_add_shopify_scope_migration_fields/migration.sql");
  const callbackRoute = read("app/api/connectors/shopify/callback/route.ts");
  const statusRoute = read("app/api/connectors/shopify/status/route.ts");
  const dataSourcesRoute = read("app/api/data-sources/route.ts");
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "grantedScopes"/, "Migration should add grantedScopes without requiring reinstall");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "requiredScopes"/, "Migration should add requiredScopes");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "scopeStatus"/, "Migration should add scopeStatus");
  assert.match(migration, /"grantedScopes" = COALESCE\("grantedScopes", "scopes"\)/, "Migration should backfill old granted scopes from existing scopes");

  assert.match(syncEngine, /missingConfiguredShopifyScopes\(requiredScopes, grantedScopes\)/, "Sync should compare current required scopes against merchant grants");
  assert.match(syncEngine, /scopeStatus[\s\S]*NEEDS_REAUTHORIZATION|SHOPIFY_NEEDS_REAUTHORIZATION/, "Sync should mark accounts that need reauthorization");
  assert.match(syncEngine, /lastErrorMessage: `Shopify permissions need update/, "Sync should store a user-actionable permission message");

  assert.match(callbackRoute, /update:\s*\{[\s\S]*encryptedAccessToken[\s\S]*grantedScopes[\s\S]*requiredScopes[\s\S]*scopeStatus/, "Reauthorization callback should update token and granted scopes");
  assert.match(callbackRoute, /dataSourceConnection\.create\([\s\S]*Shopify - \$\{state\.shopDomain\}/, "Callback should create a Shopify data source during authorization");
  assert.match(statusRoute, /const isConnected = scopeStatus === "OK" && hasConnectedDataSource/, "Status should require both current scopes and an active connected data source");
  assert.doesNotMatch(dataSourcesRoute, /repairConnectedShopifyDataSources\(session\.workspace\.id\)/, "Data source list should not trigger Shopify repair side effects");
  assert.doesNotMatch(dataSourcesRoute, /dataSourceConnection\.(create|update|upsert|delete)/, "Data source list should remain read-only");
  assert.match(dashboard, /const genericSources = ungrouped\.map/, "Connected source UI should not drop unknown active data sources");

  assert.match(dashboard, /Shopify permissions need update/, "UI should show a user-friendly permission migration title");
  assert.match(dashboard, /Update Shopify Permissions/, "UI should provide a reconnect authorization action");
  assert.match(dashboard, /Orders[\s\S]*Products[\s\S]*Customer data/, "UI should show business-readable missing permissions");
});
