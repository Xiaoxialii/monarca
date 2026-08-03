import assert from "node:assert/strict";
import test from "node:test";
import jitiFactory from "jiti";

const jiti = jitiFactory(process.cwd() + "/");
const {
  CANONICAL_PROFITABILITY_ENGINE_VERSION,
  cachedReportDateRangePresets,
  isCacheableReportRange,
  reportMetricCacheKey,
  staleAtForRange
} = jiti("./lib/report-metric-cache.ts");

test("common report ranges are cacheable", () => {
  assert.deepEqual([...cachedReportDateRangePresets], ["DAILY", "WEEKLY", "7D", "30D", "90D", "12M", "ALL", "CUSTOM"]);
  assert.equal(isCacheableReportRange({ preset: "DAILY" }), true);
  assert.equal(isCacheableReportRange({ preset: "WEEKLY" }), true);
  assert.equal(isCacheableReportRange({ preset: "90D" }), true);
  assert.equal(isCacheableReportRange({ preset: "CUSTOM" }), true);
});

test("cache key includes workspace, metric, date field, range and filters", () => {
  const base = {
    workspaceId: "workspace-a",
    metricIds: ["orders", "gmv"],
    dataSourceIds: ["source-a"],
    dateField: "order_date",
    dateRange: { preset: "30D", startDate: "2026-05-09", endDate: "2026-06-07" },
    filters: { channel: "app" }
  };

  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, workspaceId: "workspace-b" }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, metricIds: ["orders"] }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, dateField: "created_at" }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, dateRange: { ...base.dateRange, preset: "90D" } }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, dateRange: { ...base.dateRange, previousStartDate: "2026-05-01", previousEndDate: "2026-05-31" } }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, filters: { channel: "web" } }));
});

test("cache key is bound to canonical profitability engine version", () => {
  const base = {
    workspaceId: "workspace-a",
    metricIds: ["orders", "gmv"],
    dataSourceIds: ["source-a"],
    dateField: "order_date",
    dateRange: { preset: "30D", startDate: "2026-05-09", endDate: "2026-06-07" },
    filters: { channel: "app" }
  };

  assert.equal(CANONICAL_PROFITABILITY_ENGINE_VERSION, "v2");
  assert.notEqual(
    reportMetricCacheKey(base),
    reportMetricCacheKey({ ...base, profitabilityEngineVersion: "v1" })
  );
});

test("cache key is bound to semantic source, domain and snapshot", () => {
  const base = {
    workspaceId: "workspace-a",
    metricIds: ["orders", "gmv"],
    dataSourceIds: ["source-ecommerce"],
    dateField: "order_date",
    dateRange: { preset: "ALL" },
    domain: "ecommerce",
    semanticSnapshotVersion: "3",
    semanticSchemaHash: "schema-hash-a",
    queryHash: "query-hash-a"
  };

  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, dataSourceIds: ["source-logistics"] }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, domain: "logistics" }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, semanticSnapshotVersion: "4" }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, semanticSchemaHash: "schema-hash-b" }));
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, queryHash: "query-hash-b" }));
});

test("cache staleAt is later than generated time", () => {
  const now = new Date("2026-06-07T00:00:00.000Z");
  assert.ok(staleAtForRange({ preset: "7D" }, now).getTime() > now.getTime());
});
