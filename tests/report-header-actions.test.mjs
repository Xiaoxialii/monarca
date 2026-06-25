import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("report header share button has real client actions and PDF export is removed", () => {
  const dashboard = read("components/dashboard.tsx");
  const reportsRoute = read("app/api/dashboard/reports/route.ts");

  assert.match(dashboard, /const reportModesGeneratedTogether[\s\S]*"daily_brief"[\s\S]*"weekly_report"[\s\S]*"custom_report"/, "Primary report generation should refresh daily, weekly, and monthly reports together");
  assert.match(dashboard, /const sharedIdempotencyKey[\s\S]*idempotencyKey: sharedIdempotencyKey/, "Combined report generation should share one idempotency key");
  assert.match(dashboard, /for \(const reportMode of reportModesGeneratedTogether\)/, "Primary report generation should iterate over all report modes");
  assert.match(dashboard, /onClick=\{\(\) => generateReport\(\)\}/, "Primary report button should generate all report modes");
  assert.match(dashboard, /const hasAnyGeneratedReport = Boolean\(reportData\?\.briefing\)[\s\S]*Boolean\(data\?\.briefing\) \|\| Boolean\(data\?\.reportHistory\?\.length\)/, "Reports page should detect any generated report before deciding whether to show demo content");
  assert.match(dashboard, /const shouldShowEmptyReportState = !hasConnectedDatabase && hasAnyGeneratedReport && !isLoadingConnectedSources/, "Reports page should show an empty state when generated reports exist but all data sources were removed");
  assert.doesNotMatch(dashboard, /showDemoReport|demoReportContent|buildDemoReportMetricEvidence/, "Reports page should not render demo report content");
  assert.match(dashboard, /function ReportPage\(\{ locale, hasConnectedDatabase \}: \{ locale: Locale; hasConnectedDatabase: boolean \}\)/, "Legacy report page should receive connected data-source state");
  assert.doesNotMatch(dashboard, /shouldShowDemoReport|demoMetricEvidence/, "Legacy report page should not render demo report content");
  assert.match(dashboard, /const \[reportTimeZone, setReportTimeZone\] = useState<string \| null>\(null\)/, "Report updated dates should track the user's timezone");
  assert.match(dashboard, /fetch\(\"\/api\/geo\/country\", \{ cache: \"no-store\" \}\)/, "Reports page should load the IP-derived timezone from the geo endpoint");
  assert.match(dashboard, /formatReportDate\(value, \{ locale, timeZone: reportTimeZone \}\)/, "Report updated dates should be formatted in the user's timezone");
  assert.match(dashboard, /当前没有已连接的数据源[\s\S]*No data source is currently connected/, "Report pages should explain the empty state after data sources are removed");
  assert.doesNotMatch(dashboard, /<a href="\/checkout\/professional">\{isReportsZh \? "升级套餐" : "Upgrade plan"\}<\/a>/, "Primary report button should not turn into an upgrade button");
  assert.doesNotMatch(dashboard, /const handleExportReport = useCallback/, "Reports page should not define a PDF export handler");
  assert.doesNotMatch(dashboard, /window\.print\(\)/, "Reports page should not open browser print for PDF export");
  assert.doesNotMatch(dashboard, /导出 PDF|Export PDF/, "Reports page should not show a PDF export button");
  assert.doesNotMatch(dashboard, /onClick=\{handleExportReport\}/, "Reports page should not wire a PDF export button");
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
  assert.doesNotMatch(
    reportsRoute.match(/export async function GET[\s\S]*?^}/m)?.[0] ?? "",
    /refreshReportMetricCache|prewarmCommonReportMetricCaches/,
    "Report GET should only read the last generated report/cache and must not refresh metrics unless the user clicks generate"
  );
});
