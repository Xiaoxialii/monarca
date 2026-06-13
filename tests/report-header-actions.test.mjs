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
  assert.match(dashboard, /onClick=\{\(\) => generateReport\(activeReportMode === "history" \? "custom_report" : activeReportMode\)\}/, "Primary report button should always generate a report");
  assert.doesNotMatch(dashboard, /<a href="\/checkout\/professional">\{isReportsZh \? "升级套餐" : "Upgrade plan"\}<\/a>/, "Primary report button should not turn into an upgrade button");
  assert.match(dashboard, /window\.print\(\)/, "Export should open browser print for PDF export");
  assert.match(dashboard, /reportPdfTitle/, "PDF export should set a report-specific document title");
  assert.match(dashboard, /导出 PDF/, "Export button should be labeled as PDF export in Chinese");
  assert.match(dashboard, /onClick=\{handleExportReport\}/, "Export button should call the export handler");
  assert.match(dashboard, /const handleShareReport = useCallback/, "Reports page should define a share handler");
  assert.match(dashboard, /fetch\(\"\/api\/workspace\/invite-links\"/, "Share should create a workspace invite link");
  assert.match(dashboard, /navigator\.clipboard\?\.writeText\(payload\.inviteUrl\)/, "Share should copy the generated invite link");
  assert.match(dashboard, /观察者权限|viewer/i, "Share copy should make the viewer permission clear");
  assert.match(dashboard, /aria-label=\{isReportsZh \? "关闭提示" : "Dismiss message"\}/, "Share message should have a dismiss control");
  assert.match(dashboard, /setReportActionMessage\(null\);\s+setReportActionLink\(null\);/, "Dismissing the share message should clear the invite link");
  assert.match(dashboard, /message\.includes\("请先升级套餐后再连接数据源"\)/, "Localized data-source entitlement errors should recognize cached Chinese copy");
  assert.match(dashboard, /"Please choose a plan to connect data sources\."/,
    "English data-source entitlement errors should render in English");
  assert.match(dashboard, /const previousLabel = isZh \? "昨日" : "Previous"/, "Report cards should localize previous-value labels");
  assert.match(dashboard, /const evidenceLabel = isZh \? "证据" : "Evidence"/, "Report cards should localize evidence labels");
  assert.match(dashboard, /const judgmentLabel = isZh \? "业务判断" : "Business judgment"/, "Report cards should localize judgment labels");
  assert.match(dashboard, /const actionLabel = isZh \? "建议决策" : "Recommended action"/, "Report cards should localize action labels");
  assert.doesNotMatch(dashboard, />业务判断：\{item\.businessJudgment\}</, "Report card labels should not hardcode Chinese judgment text");
  assert.doesNotMatch(dashboard, />建议决策：\{item\.recommendedAction\}</, "Report card labels should not hardcode Chinese action text");
  assert.match(dashboard, /onClick=\{\(\) => void handleShareReport\(\)\}/, "Share button should call the share handler");
});
