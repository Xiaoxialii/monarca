import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const adminAuth = readFileSync("lib/system-admin-auth.ts", "utf8");
const adminPage = readFileSync("app/admin/partnership-applications/page.tsx", "utf8");
const statusRoute = readFileSync("app/api/partnership-applications/[id]/route.ts", "utf8");
const bootstrapScript = readFileSync("scripts/set-super-admin.mjs", "utf8");
const dashboard = readFileSync("components/dashboard.tsx", "utf8");

test("users have a server-side system role with safe default", () => {
  assert.match(schema, /enum SystemRole \{[\s\S]*USER[\s\S]*SUPER_ADMIN[\s\S]*\}/);
  assert.match(schema, /model User \{[\s\S]*systemRole\s+SystemRole\s+@default\(USER\)/);
});

test("super admin guard uses server session identity and database role", () => {
  assert.match(adminAuth, /syncCurrentClerkUserIdentity\(\)/);
  assert.match(adminAuth, /identity\.user\.systemRole\s*!==\s*SystemRole\.SUPER_ADMIN/);
  assert.doesNotMatch(adminAuth, /localStorage|URLSearchParams|searchParams|process\.env\.SUPER_ADMIN_EMAILS/);
});

test("internal admin surfaces require super admin role", () => {
  assert.match(adminPage, /requireSuperAdmin\(\)/);
  assert.match(statusRoute, /requireSuperAdmin\(request\)/);
  assert.doesNotMatch(adminPage, /requireWorkspaceRole\(\[WorkspaceRole\.OWNER,\s*WorkspaceRole\.ADMIN\]\)/);
  assert.doesNotMatch(statusRoute, /requireWorkspaceRole\(\[WorkspaceRole\.OWNER,\s*WorkspaceRole\.ADMIN\]/);
});

test("super admin bootstrap script is explicit and does not manage passwords", () => {
  assert.match(bootstrapScript, /--email=user@example\.com|SUPER_ADMIN_EMAILS/);
  assert.match(bootstrapScript, /SystemRole\.SUPER_ADMIN/);
  assert.doesNotMatch(bootstrapScript, /password|localStorage|momina\.g\.khan19@gmail\.com/);
});

test("workspace selector is not exposed in dashboard client", () => {
  assert.doesNotMatch(dashboard, /WorkspaceSelector|workspace selector|workspace-switcher|switchWorkspace|availableWorkspaces/);
});
