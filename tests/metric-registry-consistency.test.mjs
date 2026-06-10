import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const { inferTablesFromCsvText } = jiti("./lib/file-upload-schema.ts");
const { buildBusinessMetricRegistry } = jiti("./lib/metrics/metric-registry.ts");
const { validateMetricConsistency } = jiti("./lib/metrics/metric-consistency-validator.ts");
const { reportMetricTimeWindow } = jiti("./lib/metrics/time-window-builder.ts");

const june10Path = "/Users/apple/Downloads/ecommerce_dataset_2026_jan_to_jun10_83561_rows.csv";

function localDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function registryForJune10(t) {
  if (!existsSync(june10Path)) {
    t.skip("local June 10 ecommerce fixture is not present");
    return null;
  }
  const text = readFileSync(june10Path, "utf8");
  const tables = inferTablesFromCsvText("ecommerce_dataset_2026_jan_to_jun10_83561_rows.csv", text);

  return buildBusinessMetricRegistry({ tables });
}

test("ecommerce dataset builds one shared registry with stable core metric definitions", (t) => {
  const registry = registryForJune10(t);
  if (!registry) return;

  assert.equal(registry.industry, "ecommerce");
  assert.ok(registry.metricRegistryId.startsWith("ecommerce:"));

  const byId = new Map(registry.definitions.map((definition) => [definition.metricId, definition]));
  const coreMetricIds = [
    "net_sales",
    "orders",
    "customers",
    "aov",
    "total_paid",
    "units_sold",
    "return_rate",
    "average_rating",
    "fulfillment_days"
  ];

  for (const metricId of coreMetricIds) {
    assert.equal(byId.get(metricId)?.level, 1, `${metricId} should be a level-1 registry metric`);
    assert.deepEqual(byId.get(metricId)?.allowedReports, ["daily", "weekly", "custom"]);
  }

  assert.equal(byId.get("net_sales")?.formula, "SUM(ecommerce_dataset_2026_jan_to_jun10_83561_rows.net_sales)");
  assert.equal(byId.get("aov")?.formula, "SAFE_DIVIDE(SUM(ecommerce_dataset_2026_jan_to_jun10_83561_rows.net_sales), COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun10_83561_rows.order_id))");
  assert.equal(byId.get("average_rating")?.formula, "AVG(ecommerce_dataset_2026_jan_to_jun10_83561_rows.customer_rating)");
  assert.equal(byId.has("estimated_gmv"), false, "Estimated GMV must not be generated when net_sales exists");

  const visibleText = JSON.stringify(registry);
  assert.doesNotMatch(visibleText, /AverageRating Share|Install Value|Objects|COMMUNICATION app|Paid App/i);
});

test("daily weekly and custom reports validate against the same metric registry", (t) => {
  const registry = registryForJune10(t);
  if (!registry) return;
  const definitions = registry.definitions.map((definition) => ({
    metricId: definition.metricId,
    businessName: definition.businessName,
    formula: definition.formula,
    requiredFields: definition.requiredFields
  }));
  const validation = validateMetricConsistency([
    { reportType: "daily", metricRegistryId: registry.metricRegistryId, definitions },
    { reportType: "weekly", metricRegistryId: registry.metricRegistryId, definitions },
    { reportType: "custom", metricRegistryId: registry.metricRegistryId, definitions }
  ]);

  assert.equal(validation.passed, true);

  const broken = validateMetricConsistency([
    { reportType: "daily", metricRegistryId: registry.metricRegistryId, definitions },
    { reportType: "weekly", metricRegistryId: `${registry.metricRegistryId}:different`, definitions },
    { reportType: "custom", metricRegistryId: registry.metricRegistryId, definitions }
  ]);

  assert.equal(broken.passed, false);
  assert.match(broken.failures.join(" "), /指标一致性校验/);
});

test("report modes change only time windows, not metric definitions", () => {
  const latestDataDate = "2026-06-10";
  const daily = reportMetricTimeWindow({
    reportMode: "daily_brief",
    requestedRange: { preset: "ALL" },
    latestDataDate
  });
  const weekly = reportMetricTimeWindow({
    reportMode: "weekly_report",
    requestedRange: { preset: "ALL" },
    latestDataDate
  });
  const custom = reportMetricTimeWindow({
    reportMode: "custom_report",
    requestedRange: { preset: "CUSTOM", startDate: "2026-05-01", endDate: "2026-06-10" },
    latestDataDate
  });

  assert.equal(daily.preset, "DAILY");
  assert.equal(daily.startDate, "2026-06-10");
  assert.equal(daily.endDate, "2026-06-10");
  assert.equal(localDate(daily.previousStart), "2026-06-09");
  assert.equal(localDate(daily.previousEnd), "2026-06-09");
  assert.equal(weekly.preset, "WEEKLY");
  assert.equal(weekly.startDate, "2026-06-04");
  assert.equal(weekly.endDate, "2026-06-10");
  assert.equal(custom.startDate, "2026-05-01");
  assert.equal(custom.endDate, "2026-06-10");
});

test("monthly report defaults to previous month same-day comparison", () => {
  const monthly = reportMetricTimeWindow({
    reportMode: "custom_report",
    requestedRange: { preset: "ALL" },
    latestDataDate: "2026-06-09"
  });

  assert.equal(monthly.preset, "CUSTOM");
  assert.equal(monthly.startDate, "2026-06-01");
  assert.equal(monthly.endDate, "2026-06-09");
  assert.equal(localDate(monthly.previousStart), "2026-05-01");
  assert.equal(localDate(monthly.previousEnd), "2026-05-09");
});
