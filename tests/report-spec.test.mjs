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
const { buildReportSpec } = jiti("./lib/report-spec.ts");

test("ecommerce ReportSpec selects only computed metrics and ecommerce dimensions", () => {
  const spec = buildReportSpec({
    domain: "ecommerce",
    schemaSnapshot: {
      tables: [{
        name: "orders",
        columns: [
          { name: "product_name", type: "text" },
          { name: "sales_channel", type: "text" },
          { name: "category", type: "text" },
          { name: "net_sales", type: "number" }
        ]
      }]
    },
    domainRegistry: [
      { metricId: "net_sales", businessName: "Net Sales", priority: 1 },
      { metricId: "orders", businessName: "Orders", priority: 2 },
      { metricId: "aov", businessName: "AOV", priority: 3 }
    ],
    metricResults: [
      { registryMetricId: "orders", displayName: "Orders", value: 120, previousValue: 100, status: "computed" },
      { registryMetricId: "net_sales", displayName: "Net Sales", value: 5000, previousValue: 4500, status: "computed" },
      { registryMetricId: "failed_margin", displayName: "Margin", status: "failed" }
    ]
  });

  assert.equal(spec.domain, "ecommerce");
  assert.deepEqual(spec.kpis.map((kpi) => kpi.key), ["net_sales", "orders"]);
  assert.equal(spec.kpis[0].change, "+11.1%");
  assert.equal(spec.kpis[0].change_type, "pct");
  assert.equal(Number(spec.kpis[0].change_pct.toFixed(4)), 0.1111);
  assert.equal(spec.kpis[0].semantic_label, "improvement");
  assert.equal(spec.kpis[0].explanation.title, "Net Sales");
  assert.equal(spec.kpis[0].explanation.note, "An increase indicates improvement in performance.");
  assert.equal(spec.kpis.some((kpi) => kpi.key === "aov"), false);
  assert.equal(spec.sections[0].type, "kpi_grid");
  const dimensionSection = spec.sections.find((section) => section.type === "dimension_analysis");
  assert.deepEqual(dimensionSection.dimensions.slice(0, 3), ["product_name", "sales_channel", "category"]);
  assert.equal(spec.kpi_framework.level1_groups.find((group) => group.group_name === "Volume").kpis.some((kpi) => kpi.name === "Orders"), true);
});

test("logistics ReportSpec uses scoring and impact models without changing output shape", () => {
  const spec = buildReportSpec({
    domain: "logistics_service_kpi",
    schemaSnapshot: {
      tables: [{
        name: "ticket_unresolved_detail",
        columns: [
          { name: "branch_name_2", displayName: "责任网点", type: "text" },
          { name: "ticket_type", displayName: "工单类型", type: "text" },
          { name: "province", displayName: "省区", type: "text" }
        ]
      }]
    },
    domainRegistry: [
      { metricId: "total_kpi_score", businessName: "KPI 总分", priority: 1 },
      { metricId: "unresolved_ticket_rate", businessName: "一次性未解决率", priority: 14 }
    ],
    scoringModel: {
      formula_type: "weighted_sum",
      rules: [{ group: "问题解决", metrics: [{ metric_key: "problem_resolution_score", weight: 30 }] }]
    },
    impactModel: {
      metrics: [
        { metric_key: "problem_resolution_score", impact_direction: "positive", kpi_sensitivity: "high" },
        { metric_key: "unresolved_ticket_rate", impact_direction: "negative", kpi_sensitivity: "medium" }
      ]
    },
    metricResults: [
      { registryMetricId: "unresolved_ticket_rate", displayName: "一次性未解决率", value: 0.22, previousValue: 0.18, status: "computed" },
      { registryMetricId: "urge_order_count", displayName: "催单数", value: 8, previousValue: 0, status: "computed" },
      { registryMetricId: "problem_resolution_score", displayName: "问题解决得分", value: 24, previousValue: 26, status: "computed" },
      { registryMetricId: "total_kpi_score", displayName: "KPI 总分", value: 82, previousValue: 92, status: "computed" }
    ]
  });

  assert.equal(spec.domain, "logistics");
  assert.equal(spec.kpis[0].key, "total_kpi_score");
  const unresolvedRate = spec.kpis.find((kpi) => kpi.key === "unresolved_ticket_rate");
  assert.equal(unresolvedRate.change, "+22.2%");
  assert.equal(unresolvedRate.change_type, "pct");
  assert.equal(unresolvedRate.semantic_label, "deterioration");
  assert.equal(unresolvedRate.explanation.note, "该指标越低越好，上升表示表现变差。");
  assert.equal(spec.kpis.some((kpi) => kpi.key === "fake_metric"), false);
  assert.equal(spec.sections[0].type, "kpi_grid");
  const dimensionSection = spec.sections.find((section) => section.type === "dimension_analysis");
  assert.deepEqual(dimensionSection.dimensions.slice(0, 3), ["branch_name_2", "ticket_type", "province"]);
  assert.equal(spec.sections.some((section) => section.type === "actions"), true);
  assert.equal(spec.kpi_framework.level1_groups.find((group) => group.group_name === "Quality").kpis.some((kpi) => kpi.name === "催单数"), true);
  assert.equal(spec.quality_diagnostics.quality_kpis.find((kpi) => kpi.name === "催单数").category, "Customer escalation");
});
