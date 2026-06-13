import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("workspace share links invite recipients as viewers", () => {
  const schema = read("prisma/schema.prisma");
  const createRoute = read("app/api/workspace/invite-links/route.ts");
  const acceptRoute = read("app/api/workspace/invite-links/accept/route.ts");
  const joinPage = read("components/join-workspace-page.tsx");
  const sync = read("lib/clerk-user-sync.ts");

  assert.match(schema, /model WorkspaceInviteLink/, "Prisma schema should persist workspace invite links");
  assert.match(schema, /tokenHash\s+String\s+@unique/, "Invite links should store hashed tokens only");
  assert.match(createRoute, /WorkspaceRole\.VIEWER/, "Created share links should grant viewer role");
  assert.match(createRoute, /hashWorkspaceInviteToken\(token\)/, "Create route should hash the invite token");
  assert.match(acceptRoute, /WorkspaceRole\.VIEWER/, "Accept route should add users as viewers");
  assert.match(acceptRoute, /workspaceInviteCookieName/, "Accept route should remember the invited workspace");
  assert.match(joinPage, /\/api\/workspace\/invite-links\/accept/, "Join page should accept the invite after login");
  assert.match(joinPage, /redirect_url/, "Join page should preserve redirect through sign-in/sign-up");
  assert.match(sync, /workspaceInviteCookieName/, "Workspace sync should prefer the accepted invite workspace");
});

test("billing copy uses Professional and upgrades to Enterprise", () => {
  const dashboard = read("components/dashboard.tsx");

  assert.doesNotMatch(dashboard, /月付无限版|Monthly Unlimited/, "Billing UI should not show Monthly Unlimited");
  assert.match(dashboard, /\? isZh \? "专业版" : "Professional"/, "Monthly paid plan should display as Professional");
  assert.match(dashboard, /升级企业版/, "Chinese upgrade action should say Enterprise");
  assert.match(dashboard, /Upgrade to Enterprise/, "English upgrade action should say Enterprise");
});
