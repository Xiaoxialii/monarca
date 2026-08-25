import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("User model has independent product access gate defaulting to false", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /model User \{[\s\S]*productAccessEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model UserProductAccessAudit \{/);
  assert.match(schema, /USER_PRODUCT_ACCESS_ENABLED|eventType/);
});

test("product access migration is fail-closed for existing and new users", () => {
  const migration = read("prisma/migrations/20260823_add_product_access_gate/migration.sql");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "productAccessEnabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /UPDATE\s+"User"[\s\S]*productAccessEnabled"\s*=\s*true/i);
});

test("workspace authorization does not block registered users on product access", () => {
  const context = read("lib/current-workspace-context.ts");

  assert.doesNotMatch(context, /assertProductAccessForUser\(identity\.user\)/);
  assert.match(context, /const activeMemberships/);
});

test("product access failure returns uniform 403 API payload", () => {
  const auth = read("lib/workspace-auth.ts");
  const access = read("lib/product-access.ts");

  assert.match(access, /PRODUCT_ACCESS_REQUIRED_CODE\s*=\s*"PRODUCT_ACCESS_REQUIRED"/);
  assert.match(access, /Your Monarca account has not been approved to connect data sources\./);
  assert.match(auth, /productAccessErrorPayload\(\)/);
  assert.match(auth, /status:\s*403/);
});

test("protected product pages allow signed-in users without product access approval", () => {
  const dashboardLayout = read("app/dashboard/layout.tsx");
  const optimizationPage = read("app/optimization/page.tsx");
  const pendingPage = read("app/access-pending/page.tsx");

  assert.doesNotMatch(dashboardLayout, /redirect\("\/access-pending"\)/);
  assert.doesNotMatch(optimizationPage, /redirect\("\/access-pending"\)/);
  assert.match(pendingPage, /AccessApprovalCard/);
  const approvalCard = read("components/access-approval-card.tsx");
  assert.match(approvalCard, /Data connection access is not enabled/);
  assert.match(approvalCard, /Sign out/);
});

test("connector OAuth initiation and callbacks are product-gated", () => {
  const routes = [
    "app/api/connectors/shopify/start/route.ts",
    "app/api/connectors/amazon/connect/route.ts",
    "app/api/connectors/google-ads/connect/route.ts",
    "app/api/connectors/meta/start/route.ts"
  ];

  for (const route of routes) {
    assert.match(read(route), /assertProductAccessForUser\(session\.user\)/, `${route} must gate OAuth initiation`);
  }

  const callbacks = [
    "app/api/connectors/shopify/callback/route.ts",
    "app/api/connectors/amazon/callback/route.ts",
    "app/api/connectors/google-ads/callback/route.ts",
    "app/api/connectors/meta/callback/route.ts"
  ];

  for (const route of callbacks) {
    assert.match(read(route), /assertProductAccessForUserId\(state\.userId\)/, `${route} must gate OAuth callback state`);
  }
});

test("non-connection runtime and workspace member APIs are not product-gated", () => {
  const routes = [
    "app/api/evolution/run/route.ts",
    "app/api/runtime/execute/route.ts",
    "app/api/workspace/members/route.ts",
    "app/api/workspace/members/[id]/role/route.ts",
    "app/api/workspace/members/[id]/remove/route.ts"
  ];

  for (const route of routes) {
    assert.doesNotMatch(read(route), /assertProductAccessForUser\(session\.user\)/, `${route} should not check product access`);
  }
});

test("direct data-source connection APIs are product-gated at connection time", () => {
  const routes = [
    "app/api/data-sources/connect/route.ts",
    "app/api/data-sources/introspect/route.ts",
    "app/api/data-sources/upload/route.ts",
    "app/api/data-sources/upload/complete/route.ts",
    "app/api/uploads/presign/route.ts"
  ];

  for (const route of routes) {
    assert.match(read(route), /requireCanConnectDataSource\(session\.workspace\.id,\s*session\.user\)/, `${route} must gate data connection`);
  }
});

test("admin approval path is an internal dry-run script with audit writes", () => {
  const script = read("scripts/set-product-access.mjs");

  assert.match(script, /--enabled=true or --enabled=false/);
  assert.match(script, /const apply = args\.get\("apply"\) === "true"/);
  assert.match(script, /userProductAccessAudit\.create/);
  assert.match(script, /USER_PRODUCT_ACCESS_ENABLED/);
  assert.match(script, /USER_PRODUCT_ACCESS_DISABLED/);
});
