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
const { inferTablesFromCsvText, tableNameFromFile } = jiti("./lib/file-upload-schema.ts");
const { buildBusinessMetricRegistry } = jiti("./lib/metrics/metric-registry.ts");

test("Chinese logistics upload names map to dedicated logical datasets", () => {
  assert.equal(tableNameFromFile("KPI网点-网点综合KPI考核.xlsx"), "branch_kpi_daily");
  assert.equal(tableNameFromFile("网点工单一次性解决分母-考核明细.xlsx"), "ticket_resolution_denominator");
  assert.equal(tableNameFromFile("网点工单一次性未解决-考核明细.xlsx"), "ticket_unresolved_detail");
});

test("Chinese logistics headers are canonicalized for registry formulas", () => {
  const [kpi] = inferTablesFromCsvText(
    "KPI网点-网点综合KPI考核.csv",
    [
      "考核日期,网点名称,KPI总分,评级,全国排名,省区排名,散件揽收得分,时效达成得分,投递规范得分,问题解决得分,加减分",
      "2026-06-17,大庆明湖分部,91.2,A,105,8,18,19,20,24,1"
    ].join("\n")
  );
  const columns = kpi.columns.map((column) => column.name);

  assert.deepEqual(columns, [
    "date",
    "branch_name",
    "total_score",
    "rating",
    "national_rank",
    "province_rank",
    "pickup_score",
    "timeliness_score",
    "delivery_standard_score",
    "problem_resolution_score",
    "bonus_penalty_score"
  ]);
  assert.equal(kpi.columns.find((column) => column.name === "total_score")?.displayName, "KPI总分");
});

test("logistics workspace builds a dedicated non-ecommerce business metric registry", () => {
  const tables = [
    inferTablesFromCsvText(
      "KPI网点-网点综合KPI考核.csv",
      [
        "考核日期,网点名称,KPI总分,评级,全国排名,省区排名,散件揽收得分,时效达成得分,投递规范得分,问题解决得分,加减分",
        "2026-06-17,大庆明湖分部,91.2,A,105,8,18,19,20,24,1"
      ].join("\n")
    )[0],
    inferTablesFromCsvText(
      "网点工单一次性解决分母-考核明细.csv",
      [
        "工单号,考核日期,责任网点,工单类型,客户求助类型,服务场景,是否纳入分母",
        "T1,2026-06-17,大庆明湖分部,签收未收到,查件,派件,1"
      ].join("\n")
    )[0],
    inferTablesFromCsvText(
      "网点工单一次性未解决-考核明细.csv",
      [
        "工单号,考核日期,责任网点,工单类型,未解决原因,客户求助类型,服务场景,是否回访未解决,是否二次工单,是否重复进线,是否催单",
        "T1,2026-06-17,大庆明湖分部,签收未收到,催单,查件,派件,0,0,1,1"
      ].join("\n")
    )[0]
  ];
  const registry = buildBusinessMetricRegistry({
    tables,
    workspaceId: "workspace_logistics_001"
  });
  const ids = new Set(registry.definitions.map((definition) => definition.metricId));
  const requiredIds = [
    "total_kpi_score",
    "kpi_score_change_vs_previous_day",
    "national_rank",
    "province_rank",
    "problem_resolution_score",
    "problem_resolution_score_loss",
    "timeliness_score",
    "delivery_standard_score",
    "pickup_score",
    "bonus_penalty_score",
    "ticket_denominator_count",
    "unresolved_ticket_count",
    "first_contact_resolution_rate",
    "unresolved_ticket_rate",
    "unresolved_ticket_count_by_ticket_type",
    "unresolved_ticket_rate_by_ticket_type",
    "unresolved_ticket_count_by_branch",
    "unresolved_ticket_rate_by_branch",
    "urge_order_count",
    "followup_unresolved_count",
    "second_ticket_count",
    "repeat_contact_count"
  ];

  assert.equal(registry.industry, "logistics_service_kpi");
  assert.equal(registry.metricRegistryId, "logistics_branch_kpi_resolution:workspace_logistics_001");
  for (const id of requiredIds) {
    assert.equal(ids.has(id), true, `${id} should be in the logistics registry`);
  }
  assert.equal(ids.has("net_sales"), false);
  assert.equal(ids.has("aov"), false);
  assert.equal(registry.missingCoreMetrics.length, 0);
});
