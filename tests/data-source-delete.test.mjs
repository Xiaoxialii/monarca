import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("data source deletion is reflected by the backend list and frontend error handling", () => {
  const listRoute = read("app/api/data-sources/route.ts");
  const deleteRoute = read("app/api/data-sources/[id]/route.ts");
  const dashboard = read("components/dashboard.tsx");

  assert.match(listRoute, /isActive:\s*true/, "Data source list should only return active sources");
  assert.match(listRoute, /in:\s*\[ConnectionStatus\.CONNECTED,\s*ConnectionStatus\.PENDING,\s*ConnectionStatus\.FAILED\]/, "Data source list should return only active non-disconnected sources");
  assert.match(listRoute, /deletedDataSources/, "Data source list should return recently deleted sources separately");
  assert.match(listRoute, /30 \* 24 \* 60 \* 60 \* 1000/, "Deleted sources should expose a 30-day retention window");
  assert.doesNotMatch(listRoute, /OR:\s*\[/, "Deleted sources must not be included through an active-or-connected query");
  assert.match(deleteRoute, /export async function PATCH/, "Deleted sources should support restore through PATCH");
  assert.match(deleteRoute, /payload\.action !== "restore"/, "Restore API should require an explicit restore action");
  assert.match(deleteRoute, /isActive:\s*true/, "Restoring a source should reactivate it");
  assert.match(deleteRoute, /status:\s*ConnectionStatus\.CONNECTED/, "Restoring a source should mark it connected");
  assert.match(deleteRoute, /isActive:\s*false/, "Deleting a source should deactivate it");
  assert.match(deleteRoute, /status:\s*ConnectionStatus\.DISCONNECTED/, "Deleting a source should mark it disconnected");
  assert.match(deleteRoute, /permanent.*delete/s, "Deleted sources should support permanent deletion");
  assert.match(deleteRoute, /function schemaTableLabels/, "Deleting a source should derive table labels from its schema snapshot");
  assert.match(deleteRoute, /prisma\.schemaSnapshot\.findFirst[\s\S]*dataSourceId/, "Deleting a source should inspect the deleted source schema snapshot");
  assert.match(deleteRoute, /prisma\.metricDefinition\.findMany[\s\S]*isActive:\s*true/, "Deleting a source should find active metric definitions before cleanup");
  assert.match(deleteRoute, /prisma\.metricDefinition\.updateMany[\s\S]*isActive:\s*false/, "Deleting a source should deactivate metrics that reference deleted source tables");
  assert.match(deleteRoute, /deactivatedMetricCount/, "Delete API should return how many metric definitions were deactivated");
  assert.match(deleteRoute, /tx\.unifiedIngestionJob\.deleteMany[\s\S]*dataSourceId/, "Permanent deletion should remove ingestion jobs for the source");
  assert.match(deleteRoute, /tx\.reportRun\.updateMany[\s\S]*primaryDataSourceId:\s*null/, "Permanent deletion should detach report runs from the source");
  assert.match(deleteRoute, /tx\.metricSnapshot\.deleteMany[\s\S]*dataSourceId/, "Permanent deletion should remove metric snapshots for the source");
  assert.match(deleteRoute, /dataSource:\s*removedDataSource/, "Delete API should return the removed source state");
  assert.match(dashboard, /!response\.ok \|\| !payload\?\.ok/, "Frontend should treat ok:false delete responses as failures");
  assert.match(dashboard, /已删除数据源|Deleted data sources/, "Frontend should show deleted data sources");
  assert.match(dashboard, /Sync source/, "Every non-connector source card should expose a manual sync action");
  assert.match(dashboard, /void rescanSource\(source\.id\)/, "Manual source sync should call the rescan API");
  assert.match(dashboard, /保留 30 天|retained for 30 days/i, "Frontend should explain deleted source retention");
  assert.match(dashboard, /onRestoreDeletedSource/, "Frontend should wire restore actions");
  assert.match(dashboard, /onPermanentlyDeleteSource/, "Frontend should wire permanent delete actions");
  assert.match(dashboard, /permanentlyDeletedSourceIds/, "Frontend should locally suppress permanently deleted sources during refresh");
  assert.match(dashboard, /withoutPermanentlyDeletedSources/, "Frontend should filter refreshed deleted-source payloads after permanent deletion");
  assert.match(dashboard, /monarca-data-sources-updated/, "Frontend should refresh connected sources after deletion");
});
