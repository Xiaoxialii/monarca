import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Shopify production sync has isolated artifacts, manifest lineage, and integrity guardrails", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260628_add_shopify_sync_runs/migration.sql");
  const syncRoute = read("app/api/connectors/shopify/sync/route.ts");
  const fetchRoute = read("app/api/connectors/shopify/fetch/route.ts");
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const graphQLClient = read("lib/ecommerce-connectors/providers/shopify-graphql.ts");
  const guardrails = read("lib/sync/guards/shopifySyncGuardrail.ts");

  assert.match(schema, /model EcommerceSyncRun \{[\s\S]*syncRunId\s+String\s+@unique/, "SyncRun should persist a stable syncRunId");
  assert.match(schema, /@@unique\(\[workspaceId, dataSourceId, provider, shopDomain, idempotencyKey\]\)/, "SyncRun should have a scoped idempotency key");
  assert.match(schema, /model EcommerceSyncArtifact \{[\s\S]*artifactKey\s+String[\s\S]*checksum\s+String/, "Sync artifacts should persist artifact key and checksum");
  assert.match(migration, /CREATE TABLE "EcommerceSyncRun"/, "Migration should create EcommerceSyncRun");
  assert.match(migration, /CREATE TABLE "EcommerceSyncArtifact"/, "Migration should create EcommerceSyncArtifact");

  assert.match(syncRoute, /requireWorkspace\(\)/, "Sync route must require workspace auth");
  assert.match(syncRoute, /workspaceId: session\.workspace\.id/, "Sync route must pass current workspace only");
  assert.match(syncEngine, /workspaceId: input\.workspaceId[\s\S]*provider: SHOPIFY_PROVIDER[\s\S]*status: "connected"/, "Connector account lookup must be workspace/provider scoped");
  assert.match(syncEngine, /account\.dataSource\.workspaceId !== input\.workspaceId/, "Sync must reject data source workspace mismatch");
  assert.match(syncEngine, /workspaces\/\$\{input\.workspaceId\}\/connectors\/shopify\/\$\{account\.dataSourceId\}\/\$\{syncRunId\}/, "R2 paths must include workspaceId/dataSourceId/syncRunId");

  assert.match(syncEngine, /updated_at:>=/, "Sync should use Shopify updated_at filter for incremental reads");
  assert.match(syncEngine, /SAFETY_OVERLAP_MS/, "Incremental sync should include safety overlap");
  assert.match(syncEngine, /idempotencyKey = sha256/, "Sync should build an idempotency key");
  assert.match(syncEngine, /dedupeCanonicalArtifact/, "Sync should dedupe canonical artifacts before writing");
  assert.match(syncEngine, /canonicalKey/, "Sync should use stable canonical unique keys");
  assert.match(syncEngine, /manifest_key/, "Manifest should include manifest key lineage");
  assert.match(syncEngine, /checksum/, "Manifest and artifacts should include checksums");
  assert.match(syncEngine, /schemaJson: buildSchemaSnapshotJson/, "Sync should bind SchemaSnapshot to the manifest");
  assert.doesNotMatch(syncEngine, /generateWorkspaceMetrics|report composer|DailyBriefing|ReportRun/i, "Sync engine must not generate metrics or reports");

  assert.match(graphQLClient, /fetchConnectionWithPageInfo/, "GraphQL client should support cursor pagination");
  assert.match(graphQLClient, /hasNextPage/, "GraphQL client should check pageInfo.hasNextPage");
  assert.match(graphQLClient, /rateLimitRetries/, "GraphQL client should track rate limit retries");
  assert.match(graphQLClient, /backoffMs/, "GraphQL client should retry with backoff");
  assert.doesNotMatch(graphQLClient, /console\.(log|warn|error)\([^)]*accessToken/, "GraphQL client must not log tokens");

  for (const required of [
    "duplicateOrdersDetected",
    "paginationIncomplete",
    "orderUpdatesDetected",
    "missingRefunds",
    "lineItemIssues",
    "testOrdersFiltered",
    "cancelledOrdersFiltered",
    "currencyMismatch",
    "discountIssues",
    "shippingIssues",
    "guestCustomersDetected",
    "rateLimitRetries"
  ]) {
    assert.match(guardrails, new RegExp(required), `Guardrail report should include ${required}`);
  }
  assert.match(guardrails, /aggregationBlocked: currencyMismatch \|\| paginationIncomplete/, "Currency mismatch or incomplete pagination should block aggregation");
  assert.match(guardrails, /seenOrders = new Map/, "Duplicate orders should be deduped before normalization");

  assert.doesNotMatch(fetchRoute, /prisma\.\w+\.(create|update|upsert|delete)|writeR2ObjectText|manifest|runShopifyProductionSync/, "Fetch-only API must remain read-only");
});
