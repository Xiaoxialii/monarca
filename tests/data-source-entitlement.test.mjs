import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("registered users can connect data sources without a paid plan", () => {
  const entitlements = read("lib/billing/entitlements.ts");

  assert.match(entitlements, /const canConnectDataSource = true;/);
  assert.doesNotMatch(
    entitlements.match(/export async function requireCanConnectDataSource[\s\S]*?^}/m)?.[0] ?? "",
    /throw new BillingEntitlementError/,
    "Data-source connection guard should not require a paid plan"
  );
});

test("billing panel says data-source connections are available to registered users", () => {
  const dashboard = read("components/dashboard.tsx");

  assert.match(dashboard, /Registered users can connect data sources\. Report generation requires plan access\./);
  assert.match(dashboard, /Available to registered users/);
  assert.match(dashboard, /注册用户可连接数据源；报告生成需要套餐权限/);
  assert.match(dashboard, /注册用户可用/);
});
