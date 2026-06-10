import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("CSV report metrics use the full uploaded file before schema samples", () => {
  const metricResults = read("lib/metric-results.ts");
  const aggregationEngine = read("lib/analytics/aggregation-engine.ts");
  const csvUploadRows = read("lib/csv-upload-rows.ts");
  const uploadRoute = read("app/api/data-sources/upload/route.ts");

  assert.match(csvUploadRows, /readCsvRowsFromStorageConfig/, "Shared CSV reader should read persisted CSV uploads");
  assert.match(csvUploadRows, /readR2ObjectText/, "Shared CSV reader should support full CSV reads from R2 storage");
  assert.match(csvUploadRows, /readSupabaseObjectText/, "Shared CSV reader should support full CSV reads from Supabase storage");
  assert.match(csvUploadRows, /csvRowsCache/, "Shared CSV reader should cache parsed upload rows");
  assert.match(metricResults, /const storedRows = await readCsvRowsFromStorageConfig\(config\)/, "CSV rows should try persisted storage before sample rows");
  assert.match(metricResults, /if \(storedRows\?\.length\)[\s\S]*return storedRows;[\s\S]*if \(sampleRows\.length > 0\)/, "Schema sample rows should only be a fallback");
  assert.match(uploadRoute, /storeUploadLocally/, "Upload route should persist the original file locally when cloud storage is unavailable");
  assert.match(uploadRoute, /storedFilePath:\s*localStoredFile\?\.path/, "Upload route should save a local file path for metric recalculation");
  assert.match(aggregationEngine, /async function storedRowsForContext/, "Aggregation engine should read persisted CSV uploads");
  assert.match(aggregationEngine, /const allRows = await rowsForAggregationTable\(context, table\.name\)/, "Aggregation trends should use full CSV rows before schema samples");
  assert.match(aggregationEngine, /readCsvRowsFromStorageConfig/, "Aggregation engine should use the shared full CSV reader");
});

test("report data changes invalidate stale report caches", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const uploadCompleteRoute = read("app/api/data-sources/upload/complete/route.ts");
  const rescanRoute = read("app/api/data-sources/[id]/rescan/route.ts");
  const reportRoute = read("app/api/dashboard/reports/route.ts");
  const reportCache = read("lib/report-metric-cache.ts");
  const metricVisibility = read("lib/metric-visibility.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(uploadRoute, /clearWorkspaceReportCaches/, "Direct uploads should clear stale DailyBriefing and report metric cache data");
  assert.match(uploadCompleteRoute, /clearWorkspaceReportCaches/, "Signed uploads should clear stale DailyBriefing and report metric cache data");
  assert.match(rescanRoute, /clearWorkspaceReportCaches/, "Data source rescans should clear stale report caches");
  assert.match(reportRoute, /sourceSnapshotVersion/, "Report cache reads should be scoped to the latest schema snapshot version");
  assert.match(reportCache, /sourceSnapshotVersion/, "Report cache keys should include the schema snapshot version");
  assert.match(metricVisibility, /average\\s\*rating\\s\*share|averagerating\\s\*share/, "AverageRating Share should not be displayable");
  assert.match(dashboard, /reportModeDefaultDateRange[\s\S]*preset: "ALL"[\s\S]*useState<SelectedReportDateRange>\(\{ preset: "ALL" \}\)/, "Dashboard report API calls should default to full-data ALL range");
});
