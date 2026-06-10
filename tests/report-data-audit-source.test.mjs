import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("report generation has full-data audit and ecommerce industry guardrails", () => {
  const audit = read("lib/report-data-audit.ts");
  const industryDetector = read("lib/metric-generation/industry-detector.ts");
  const aggregationEngine = read("lib/analytics/aggregation-engine.ts");
  const reportRoute = read("app/api/dashboard/reports/route.ts");
  const generateRoute = read("app/api/dashboard/reports/generate/route.ts");
  const metricTemplates = read("lib/metric-generation/metric-templates.ts");

  assert.match(read("lib/skills/full-data-analysis-guardrail.ts"), /validateFullDataAnalysisContext/, "Mandatory full-data guardrail should exist");
  assert.match(read("lib/skills/full-data-analysis-guardrail.ts"), /schema_samplerows/, "Guardrail should reject schema.sampleRows after source normalization");
  assert.match(audit, /totalRows/, "Audit should expose analyzed row count");
  assert.match(audit, /latestDataDate/, "Audit should expose latest data date");
  assert.match(audit, /usesFullData/, "Audit should expose whether full data was used");
  assert.match(industryDetector, /hasEcommerceOrderShape/, "Ecommerce order shape should override generic app signals");
  assert.match(industryDetector, /order_id[\s\S]*order_date[\s\S]*customer_id[\s\S]*gross_sales[\s\S]*net_sales[\s\S]*total_paid/, "Ecommerce detector should include order and revenue fields");
  assert.match(aggregationEngine, /ecommerceSignalCount[\s\S]*return "ecommerce"/, "Aggregation business type should prioritize ecommerce before app_market");
  assert.match(reportRoute, /buildReportDataAudit/, "Report refresh route should run data audit");
  assert.match(generateRoute, /buildReportDataAudit/, "Report generate route should run data audit");
  assert.match(generateRoute, /if \(!preReportDataAudit\.passed\)/, "Report generation should stop before formal metric and insight generation when guardrail fails");
  assert.match(metricTemplates, /name: "Net Sales"[\s\S]*name: "Estimated GMV"/, "Real revenue metrics should be defined before Estimated GMV");
  assert.match(metricTemplates, /!revenue && price && quantity/, "Estimated GMV should only be generated when real revenue is missing");
});
