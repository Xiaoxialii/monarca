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
  assert.match(dashboard, /window\.print\(\)/, "Export should open browser print for PDF export");
  assert.match(dashboard, /reportPdfTitle/, "PDF export should set a report-specific document title");
  assert.match(dashboard, /导出 PDF/, "Export button should be labeled as PDF export in Chinese");
  assert.match(dashboard, /onClick=\{handleExportReport\}/, "Export button should call the export handler");
  assert.match(dashboard, /const handleShareReport = useCallback/, "Reports page should define a share handler");
  assert.match(dashboard, /fetch\(\"\/api\/workspace\/invite-links\"/, "Share should create a workspace invite link");
  assert.match(dashboard, /navigator\.clipboard\?\.writeText\(payload\.inviteUrl\)/, "Share should copy the generated invite link");
  assert.match(dashboard, /观察者权限|viewer/i, "Share copy should make the viewer permission clear");
  assert.match(dashboard, /onClick=\{\(\) => void handleShareReport\(\)\}/, "Share button should call the share handler");
});
