import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("ReportRun is the scoped report display record", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260627_add_report_run/migration.sql");

  assert.match(schema, /model ReportRun \{[\s\S]*workspaceId\s+String/, "ReportRun should belong to a workspace");
  assert.match(schema, /generatedByUserId\s+String\?/, "ReportRun should audit the generating user");
  assert.match(schema, /primaryDataSourceId\s+String\?/, "ReportRun should record the primary data source");
  assert.match(schema, /dataSourceIds\s+Json/, "ReportRun should record all scoped data sources");
  assert.match(schema, /reportMode\s+String/, "ReportRun should scope by report mode");
  assert.match(schema, /dateRangeStart\s+DateTime\?[\s\S]*dateRangeEnd\s+DateTime\?/, "ReportRun should scope by date range");
  assert.match(schema, /sourceSnapshotVersion\s+Int\?/, "ReportRun should scope by schema snapshot version");
  assert.match(schema, /schemaSnapshotId\s+String\?/, "ReportRun should bind the schema snapshot");
  assert.match(schema, /semanticSnapshotVersion\s+String\?[\s\S]*semanticSchemaHash\s+String\?/, "ReportRun should bind semantic snapshot identity");
  assert.match(schema, /cacheKey\s+String/, "ReportRun should bind the cache key");
  assert.match(schema, /@@unique\(\[workspaceId, cacheKey\]\)/, "ReportRun cache key should be unique inside a workspace");
  assert.match(schema, /@@index\(\[workspaceId, primaryDataSourceId\]\)/, "ReportRun should be queryable by workspace and source");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "ReportRun"/, "Migration should create ReportRun");
});

test("report generate and read paths use ReportRun scope instead of workspace DailyBriefing fallback", () => {
  const reportsRoute = read("app/api/dashboard/reports/route.ts");
  const generateRoute = read("app/api/dashboard/reports/generate/route.ts");

  assert.match(generateRoute, /selectKpiExecutionDataSources\(connectedDataSources\)/, "Generate should scope to selected execution data sources");
  assert.match(generateRoute, /findCompletedReportRun\(prisma, reportRunScope\)/, "Generate should reuse a completed ReportRun for the same scope");
  assert.match(generateRoute, /upsertCompletedReportRun\(prisma/, "Generate should write a ReportRun after cache or calculation success");
  assert.match(generateRoute, /reportRunId: reportRun\.id/, "Generate response should include the ReportRun id");

  assert.match(reportsRoute, /selectKpiExecutionDataSources\(activeDataSources\)/, "Read should use the same selected data-source scope as generation");
  assert.match(reportsRoute, /findCompletedReportRun\(prisma, reportRunScope\)/, "Read should load the matching ReportRun");
  assert.match(reportsRoute, /reportRunId: reportRun\?\.id/, "Read response should include ReportRun identity");
  assert.match(reportsRoute, /reportScope: reportRunScopeMetadata\(reportRunScope\)/, "Read response should include scope metadata");

  assert.doesNotMatch(
    reportsRoute,
    /prisma\.dailyBriefing\.findFirst/,
    "Report read path must not fallback to the latest workspace DailyBriefing"
  );
  assert.doesNotMatch(
    reportsRoute,
    /baseBriefing|selectedBriefing/,
    "Report read path must not merge workspace-level briefing payloads into scoped reports"
  );
});
