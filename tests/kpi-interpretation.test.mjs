import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const { interpretKpis, interpretKpiItems } = jiti("./lib/kpi-interpretation.ts");

test("interprets zero baselines without misleading percentages", () => {
  const { results } = interpretKpis([
    { name: "new_complaints", today: 8, yesterday: 0, higher_is_better: false },
    { name: "resolved_cases", today: 0, yesterday: 0, higher_is_better: true }
  ]);

  assert.equal(results[0].change_type, "new_activity");
  assert.equal(results[0].change_pct, null);
  assert.equal(results[0].change, "NEW +8");
  assert.equal(results[0].semantic_label, "new_activity");
  assert.match(results[0].insight, /previously none/);
  assert.equal(results[1].change_type, "no_activity");
  assert.equal(results[1].change_pct, null);
  assert.equal(results[1].change, "0 (no activity)");
  assert.equal(results[1].semantic_label, "no_activity");
});

test("uses KPI direction before assigning business sentiment", () => {
  const { results } = interpretKpis([
    { name: "unresolved_cases", today: 18, yesterday: 6, higher_is_better: false },
    { name: "resolution_count", today: 2, yesterday: 4, higher_is_better: true },
    { name: "neutral_index", today: 12, yesterday: 10, higher_is_better: null }
  ]);

  assert.equal(results[0].change_type, "pct");
  assert.equal(results[0].change_pct, 2);
  assert.equal(results[0].change, "+200.0%");
  assert.equal(results[0].semantic_label, "deterioration");
  assert.match(results[0].insight, /deterioration/);
  assert.equal(results[1].semantic_label, "deterioration");
  assert.equal(results[2].semantic_label, "stable");
  assert.match(results[2].insight, /direction is unknown/);
});

test("keeps legacy interpretKpiItems compatibility", () => {
  const { kpis } = interpretKpiItems([
    { name: "resolution_count", today_value: 6, yesterday_value: 3, direction: "higher_is_better" }
  ]);

  assert.equal(kpis[0].change_type, "pct");
  assert.equal(kpis[0].change_pct, 1);
  assert.equal(kpis[0].semantic_label, "improvement");
});
