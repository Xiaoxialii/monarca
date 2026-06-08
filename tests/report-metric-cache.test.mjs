import assert from "node:assert/strict";
import test from "node:test";
import jitiFactory from "jiti";

const jiti = jitiFactory(process.cwd() + "/");
const {
  cachedReportDateRangePresets,
  isCacheableReportRange,
  reportMetricCacheKey,
  staleAtForRange
} = jiti("./lib/report-metric-cache.ts");

test("common report ranges are cacheable", () => {
  assert.deepEqual([...cachedReportDateRangePresets], ["7D", "30D", "90D", "12M"]);
  assert.equal(isCacheableReportRange({ preset: "90D" }), true);
  assert.equal(isCacheableReportRange({ preset: "CUSTOM" }), false);
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
  assert.notEqual(reportMetricCacheKey(base), reportMetricCacheKey({ ...base, filters: { channel: "web" } }));
});

test("cache staleAt is later than generated time", () => {
  const now = new Date("2026-06-07T00:00:00.000Z");
  assert.ok(staleAtForRange({ preset: "7D" }, now).getTime() > now.getTime());
});
