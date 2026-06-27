import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { filterRowsByReportDateRange, resolveReportDateRange } from "../lib/report-date-range.ts";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("CSV report metrics require the full uploaded file and do not fallback to schema samples", () => {
  const metricResults = read("lib/metric-results.ts");
  const aggregationEngine = read("lib/analytics/aggregation-engine.ts");
  const csvUploadRows = read("lib/csv-upload-rows.ts");
  const uploadRoute = read("app/api/data-sources/upload/route.ts");

  assert.match(csvUploadRows, /readCsvRowsFromStorageConfig/, "Shared CSV reader should read persisted CSV uploads");
  assert.match(csvUploadRows, /readR2ObjectText/, "Shared CSV reader should support full CSV reads from R2 storage");
  assert.match(csvUploadRows, /readSupabaseObjectText/, "Shared CSV reader should support full CSV reads from Supabase storage");
  assert.match(csvUploadRows, /csvRowsCache/, "Shared CSV reader should cache parsed upload rows");
  assert.match(metricResults, /const storedRows = await readCsvRowsFromStorageConfig\(config\)/, "CSV rows should read persisted full uploads");
  assert.match(metricResults, /throw new Error\("DATA_SOURCE_FULL_DATA_UNAVAILABLE"\)/, "Schema samples should not be a formal metric fallback");
  assert.doesNotMatch(metricResults, /const sampleRows = getSchemaTables/, "Metric results should not read schema sample rows for formal CSV calculations");
  assert.match(uploadRoute, /storeUploadLocally/, "Upload route should persist the original file locally when cloud storage is unavailable");
  assert.match(uploadRoute, /storedFilePath:\s*localStoredFile\?\.path/, "Upload route should save a local file path for metric recalculation");
  assert.match(aggregationEngine, /async function storedRowsForContext/, "Aggregation engine should read persisted CSV uploads");
  assert.match(aggregationEngine, /const allRows = await rowsForAggregationTable\(context\)/, "Aggregation trends should use full CSV rows");
  assert.match(aggregationEngine, /readCsvRowsFromStorageConfig/, "Aggregation engine should use the shared full CSV reader");
  assert.match(aggregationEngine, /DATA_SOURCE_FULL_DATA_UNAVAILABLE/, "Aggregation engine should fail clearly when full source data is unavailable");
});

test("report data changes invalidate stale report caches", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const uploadCompleteRoute = read("app/api/data-sources/upload/complete/route.ts");
  const rescanRoute = read("app/api/data-sources/[id]/rescan/route.ts");
  const reportRoute = read("app/api/dashboard/reports/route.ts");
  const reportGenerateRoute = read("app/api/dashboard/reports/generate/route.ts");
  const metricGeneration = read("lib/workspace-metric-generation.ts");
  const reportCache = read("lib/report-metric-cache.ts");
  const metricVisibility = read("lib/metric-visibility.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(uploadRoute, /clearWorkspaceReportCaches/, "Direct uploads should clear stale DailyBriefing and report metric cache data");
  assert.match(uploadCompleteRoute, /clearWorkspaceReportCaches/, "Signed uploads should clear stale DailyBriefing and report metric cache data");
  assert.match(rescanRoute, /clearWorkspaceReportCaches/, "Data source rescans should clear stale report caches");
  assert.match(reportRoute, /sourceSnapshotVersion/, "Report cache reads should be scoped to the latest schema snapshot version");
  assert.match(reportRoute, /dataSourceId:\s*\{\s*in:\s*activeSourceIds\s*\}/, "Report loading should scope schema snapshots to currently connected data sources");
  assert.match(reportGenerateRoute, /dataSourceId:\s*\{\s*in:\s*dataSources\.map/, "Report generation should execute against connected-source snapshots");
  assert.match(reportGenerateRoute, /latestWorkspaceSnapshotMeta\(session\.workspace\.id,\s*activeSourceIds\)/, "Report generation cache lookup should use connected-source snapshot metadata");
  assert.match(metricGeneration, /dataSourceIds\?:\s*string\[\]/, "Metric generation should accept source-scoped training");
  assert.match(metricGeneration, /id:\s*\{\s*in:\s*scopedDataSourceIds\s*\}/, "Metric generation should only load selected connected data sources when provided");
  assert.match(reportCache, /sourceSnapshotVersion/, "Report cache keys should include the schema snapshot version");
  assert.match(metricVisibility, /average\\s\*rating\\s\*share|averagerating\\s\*share/, "AverageRating Share should not be displayable");
  assert.match(dashboard, /selectedAnalysisDateRange[\s\S]*useState<SelectedReportDateRange>\(\{ preset: "ALL" \}\)/, "Dashboard analysis report API calls should default to full-data ALL range");
  assert.match(dashboard, /function analysisReportModeForRange[\s\S]*TODAY[\s\S]*daily_brief[\s\S]*7D[\s\S]*weekly_report[\s\S]*custom_report/, "Dashboard analysis report API calls should map report mode from the selected range");
});

test("new data source training is scoped to the uploaded or rescanned source", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const uploadCompleteRoute = read("app/api/data-sources/upload/complete/route.ts");
  const rescanRoute = read("app/api/data-sources/[id]/rescan/route.ts");
  const connectRoute = read("app/api/data-sources/connect/route.ts");
  const introspectRoute = read("app/api/data-sources/introspect/route.ts");
  const reportGenerateRoute = read("app/api/dashboard/reports/generate/route.ts");

  assert.match(uploadRoute, /dataSourceIds:\s*\[result\.dataSource\.id\]/, "Direct upload should train only the uploaded data source");
  assert.match(uploadCompleteRoute, /dataSourceIds:\s*\[result\.dataSource\.id\]/, "Signed upload completion should train only the uploaded data source");
  assert.match(rescanRoute, /dataSourceIds:\s*\[updatedSource\.id\]/, "Rescan should train only the rescanned data source");
  assert.match(connectRoute, /dataSourceIds:\s*\[dataSource\.id\]/, "Database connect should train only the connected source");
  assert.match(introspectRoute, /dataSourceIds:\s*\[dataSource\.id\]/, "Introspection should train only the introspected source");
  assert.match(reportGenerateRoute, /dataSourceIds:\s*dataSources\.map\(\(source\) => source\.id\)/, "Report auto-training should train only selected execution sources");
});

test("daily CSV date filtering treats YYYY-MM-DD as business date", () => {
  const rows = [
    { order_date: "2026-06-08", order_id: "o-1" },
    { order_date: "2026-06-09", order_id: "o-2" },
    { order_date: "2026-06-09", order_id: "o-3" },
    { order_date: "2026-06-10", order_id: "o-4" }
  ];
  const range = resolveReportDateRange({ preset: "DAILY", endDate: "2026-06-09" });
  const filtered = filterRowsByReportDateRange(rows, "order_date", range);

  assert.deepEqual(filtered.map((row) => row.order_id), ["o-2", "o-3"]);
  assert.equal(range.startDate, "2026-06-09");
  assert.equal(range.endDate, "2026-06-09");
});

test("report audit reuses metric result execution instead of independent ecommerce formulas", () => {
  const reportDataAudit = read("lib/report-data-audit.ts");
  const reportComposers = read("lib/report-composers.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(reportDataAudit, /computeMetricResultsForContexts/, "AuditValidation should reuse the shared metric result engine");
  assert.doesNotMatch(reportDataAudit, /function addMetricMismatchFailures/, "AuditValidation should not keep a separate ecommerce mismatch calculator");
  assert.doesNotMatch(reportDataAudit, /当日完整数据聚合值/, "Audit errors should not compare against an independently calculated daily aggregate label");
  assert.match(reportComposers, /数据源总行数/, "Report failure copy should show total source rows");
  assert.match(reportComposers, /日报分析行数/, "Report failure copy should show daily analysis rows");
  assert.match(reportComposers, /日期过滤/, "Report failure copy should show the applied date filter");
  assert.match(dashboard, /数据源总行数/, "Dashboard failure view should show total source rows");
  assert.match(dashboard, /日报分析行数/, "Dashboard failure view should show daily analysis rows");
  assert.doesNotMatch(dashboard, /预期完整行数/, "Dashboard failure view should not present total rows as expected rows for daily reports");
});
