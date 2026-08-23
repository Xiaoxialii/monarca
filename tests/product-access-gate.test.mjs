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

test("workspace authorization checks product access before workspace membership", () => {
  const context = read("lib/current-workspace-context.ts");
  const productAccessIndex = context.indexOf("assertProductAccessForUser(identity.user)");
  const membershipIndex = context.indexOf("const activeMemberships");

  assert.ok(productAccessIndex > 0, "product access check must be present");
  assert.ok(membershipIndex > productAccessIndex, "workspace lookup should happen after product access");
});

test("product access failure returns uniform 403 API payload", () => {
  const auth = read("lib/workspace-auth.ts");
  const access = read("lib/product-access.ts");

  assert.match(access, /PRODUCT_ACCESS_REQUIRED_CODE\s*=\s*"PRODUCT_ACCESS_REQUIRED"/);
  assert.match(access, /Your Monarca account has not been approved for product access\./);
  assert.match(auth, /productAccessErrorPayload\(\)/);
  assert.match(auth, /status:\s*403/);
});

test("protected product pages redirect unapproved users to access pending", () => {
  const dashboardLayout = read("app/dashboard/layout.tsx");
  const optimizationPage = read("app/optimization/page.tsx");
  const pendingPage = read("app/access-pending/page.tsx");

  assert.match(dashboardLayout, /productAccessEnabled !== true[\s\S]*redirect\("\/access-pending"\)/);
  assert.match(optimizationPage, /productAccessEnabled !== true[\s\S]*redirect\("\/access-pending"\)/);
  assert.match(pendingPage, /Your account is awaiting approval/);
  assert.match(pendingPage, /Please contact the Monarca AI team to request access\./);
  assert.match(pendingPage, /Sign out/);
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

test("sensitive direct runtime APIs and workspace member APIs are product-gated", () => {
  const routes = [
    "app/api/evolution/run/route.ts",
    "app/api/runtime/execute/route.ts",
    "app/api/actions/[actionId]/route.ts",
    "app/api/workspace/members/route.ts",
    "app/api/workspace/members/[id]/role/route.ts",
    "app/api/workspace/members/[id]/remove/route.ts"
  ];

  for (const route of routes) {
    assert.match(read(route), /assertProductAccessForUser\(session\.user\)|resolveActionSession\(request\)/, `${route} must check product access`);
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
