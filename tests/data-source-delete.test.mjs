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
  assert.match(listRoute, /status:\s*ConnectionStatus\.CONNECTED/, "Data source list should only return connected sources");
  assert.doesNotMatch(listRoute, /OR:\s*\[/, "Deleted sources must not be included through an active-or-connected query");
  assert.match(deleteRoute, /isActive:\s*false/, "Deleting a source should deactivate it");
  assert.match(deleteRoute, /status:\s*ConnectionStatus\.DISCONNECTED/, "Deleting a source should mark it disconnected");
  assert.match(deleteRoute, /dataSource:\s*removedDataSource/, "Delete API should return the removed source state");
  assert.match(dashboard, /!response\.ok \|\| !payload\?\.ok/, "Frontend should treat ok:false delete responses as failures");
  assert.match(dashboard, /monarca-data-sources-updated/, "Frontend should refresh connected sources after deletion");
});
