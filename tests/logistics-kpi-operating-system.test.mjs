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
const { compileLogisticsKpiOperatingSystem } = jiti("./lib/logistics-kpi-operating-system.ts");

const schemaSnapshot = {
  tables: [
    {
      name: "branch_kpi_daily",
      columns: [
        { name: "date", displayName: "考核日期", type: "date", nullable: false },
        { name: "branch_name", displayName: "网点名称", type: "text", nullable: false },
        { name: "total_score", displayName: "KPI总分", type: "number", nullable: false },
        { name: "pickup_score", displayName: "散件揽收(20)", type: "number", nullable: false },
        { name: "timeliness_score", displayName: "时效达成(20)", type: "number", nullable: false },
        { name: "problem_resolution_score", displayName: "问题解决(30)", type: "number", nullable: false }
      ]
    },
    {
      name: "ticket_unresolved_detail",
      columns: [
        { name: "ticket_id", displayName: "工单号", type: "text", nullable: false },
        { name: "ticket_type", displayName: "工单类型", type: "text", nullable: false },
        { name: "unresolved_reason", displayName: "未解决原因", type: "text", nullable: false }
      ]
    }
  ]
};

const registry = [
  {
    metricId: "pickup_score",
    businessName: "散件揽收得分",
    level: 1,
    category: "网点 KPI",
    formula: "AVG(branch_kpi_daily.pickup_score)",
    requiredFields: ["pickup_score"],
    displayFormat: "decimal",
    priority: 8,
    description: "score definition",
    allowedReports: ["daily", "weekly", "custom"],
    fallbackFormula: null,
    isEstimated: false
  },
  {
    metricId: "problem_resolution_score",
    businessName: "问题解决得分",
    level: 1,
    category: "网点 KPI",
    formula: "AVG(branch_kpi_daily.problem_resolution_score)",
    requiredFields: ["problem_resolution_score"],
    displayFormat: "decimal",
    priority: 5,
    description: "score definition",
    allowedReports: ["daily", "weekly", "custom"],
    fallbackFormula: null,
    isEstimated: false
  },
  {
    metricId: "unresolved_ticket_rate",
    businessName: "一次性未解决率",
    level: 1,
    category: "一次性解决率",
    formula: "SAFE_DIVIDE(COUNT_DISTINCT(ticket_unresolved_detail.ticket_id), COUNT_DISTINCT(ticket_resolution_denominator.ticket_id))",
    requiredFields: ["ticket_id"],
    displayFormat: "percent",
    priority: 14,
    description: "ratio definition",
    allowedReports: ["daily", "weekly", "custom"],
    fallbackFormula: null,
    isEstimated: false
  }
];

test("logistics KPI operating system compiles definitions without KPI calculations", () => {
  const result = compileLogisticsKpiOperatingSystem({
    schema_snapshot: schemaSnapshot,
    semantic_metrics: [],
    business_metric_registry: registry,
    raw_excel_sample: [
      { date: "2026-06-17", pickup_score: 18, problem_resolution_score: 26 },
      { date: "2026-06-18", pickup_score: 17, problem_resolution_score: 20 }
    ],
    workspace_id: "workspace_logistics_001"
  });

  assert.equal(result.layer, "logistics-kpi-operating-system");
  assert.equal(result.workspace_id, "workspace_logistics_001");
  assert.equal(Object.hasOwn(result, "kpi_root_cause"), false);
  assert.equal(Object.hasOwn(result, "governance_priority"), false);

  const pickupGroup = result.metric_tree.find((group) => group.group === "散件揽收");
  assert.equal(pickupGroup?.group_type, "scoring_kpi_group");
  assert.equal(pickupGroup?.total_score, 20);
  assert.equal(pickupGroup?.metrics[0]?.metric_key, "pickup_score");
  assert.equal(pickupGroup?.metrics[0]?.weight, 20);

  const resolutionGroup = result.metric_tree.find((group) => group.group === "问题解决");
  assert.equal(resolutionGroup?.total_score, 31);
  assert.equal(resolutionGroup?.metrics.some((metric) => metric.type === "ratio_metric"), true);

  const scoringRule = result.scoring_model.rules.find((rule) => rule.group === "散件揽收");
  assert.equal(result.scoring_model.formula_type, "weighted_sum");
  assert.equal(scoringRule?.calculation, "sum(metric_score × weight)");
  assert.equal(scoringRule?.metrics[0]?.weight, 20);

  const unresolvedImpact = result.impact_model.metrics.find((metric) => metric.metric_key === "unresolved_ticket_rate");
  assert.equal(unresolvedImpact?.impact_direction, "negative");
  assert.equal(unresolvedImpact?.kpi_sensitivity, "medium");
});
