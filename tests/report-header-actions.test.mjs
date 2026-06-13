import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("report header export and share buttons have real client actions", () => {
  const dashboard = read("components/dashboard.tsx");

  assert.match(dashboard, /const handleExportReport = useCallback/, "Reports page should define an export handler");
  assert.match(dashboard, /new Blob\(\[JSON\.stringify\(payload, null, 2\)\]/, "Export should serialize the visible report payload");
  assert.match(dashboard, /anchor\.download = reportExportFileName/, "Export should download a named file");
  assert.match(dashboard, /onClick=\{handleExportReport\}/, "Export button should call the export handler");
  assert.match(dashboard, /const handleShareReport = useCallback/, "Reports page should define a share handler");
  assert.match(dashboard, /navigator\.share/, "Share should use the native share sheet when available");
  assert.match(dashboard, /navigator\.clipboard\?\.writeText/, "Share should copy a link when native share is unavailable");
  assert.match(dashboard, /onClick=\{\(\) => void handleShareReport\(\)\}/, "Share button should call the share handler");
});
