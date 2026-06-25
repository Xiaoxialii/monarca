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
const { buildKpiFrameworkTree, diagnoseQualityKpis } = jiti("./lib/kpi-framework.ts");

test("buildKpiFrameworkTree classifies every KPI into one standard group without changing values", () => {
  const kpis = [
    { name: "ticket_volume", value: 120 },
    { name: "avg_response_time", value: 3.2 },
    { name: "一次性未解决工单数", value: 18 },
    { name: "csat_score", value: 4.5 }
  ];

  const tree = buildKpiFrameworkTree(kpis);
  const assigned = tree.level1_groups.flatMap((group) => group.kpis);

  assert.equal(assigned.length, 4);
  assert.equal(new Set(assigned.map((kpi) => kpi.name)).size, 4);
  assert.equal(tree.level1_groups.find((group) => group.group_name === "Volume").kpis[0].value, 120);
  assert.equal(tree.level1_groups.find((group) => group.group_name === "Speed").kpis[0].name, "avg_response_time");
  assert.equal(tree.level1_groups.find((group) => group.group_name === "Quality").kpis[0].name, "一次性未解决工单数");
  assert.equal(tree.level1_groups.find((group) => group.group_name === "Experience").kpis[0].name, "csat_score");
  assert.deepEqual(tree.missing_groups, []);
});

test("buildKpiFrameworkTree reports missing standard groups", () => {
  const tree = buildKpiFrameworkTree([{ name: "工单分母数", value: 30 }]);

  assert.deepEqual(tree.level1_groups.find((group) => group.group_name === "Volume").kpis.map((kpi) => kpi.name), ["工单分母数"]);
  assert.deepEqual(tree.missing_groups, ["Speed", "Quality", "Experience"]);
});

test("diagnoseQualityKpis classifies quality subtypes and causal direction", () => {
  const diagnostics = diagnoseQualityKpis([
    { name: "一次性未解决工单数", today: 18, yesterday: 6 },
    { name: "二次工单数", today: 4, yesterday: 2 },
    { name: "催单数", today: 8, yesterday: 0 },
    { name: "回访未解决数", today: 5, yesterday: 4 }
  ]);

  assert.deepEqual(diagnostics.quality_kpis.map((kpi) => kpi.category), [
    "First-touch failure",
    "Rework / repetition",
    "Customer escalation",
    "Follow-up failure"
  ]);
  assert.equal(diagnostics.quality_kpis.find((kpi) => kpi.name === "催单数").risk_level, "high");
  assert.match(diagnostics.quality_kpis[0].what_it_indicates, /training|SOP|first-line/i);
});
