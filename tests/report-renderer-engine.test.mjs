import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("report renderer is driven by decision_report props", () => {
  const source = fs.readFileSync(join(process.cwd(), "components/report-renderer-engine.tsx"), "utf8");

  assert.match(source, /type ReportRendererEngineProps/);
  assert.match(source, /report: DecisionIntelligenceReportV1 \| null/);
  assert.match(source, /Performance Overview/);
  assert.match(source, /SKU Breakdown/);
  assert.match(source, /Inventory Breakdown/);
  assert.match(source, /Inventory levels, sell-through, and stock coverage across SKUs/);
  assert.match(source, /Ads Breakdown/);
  assert.match(source, /Customer Intelligence Engine/);
  assert.match(source, /LTV Distribution/);
  assert.match(source, /Lifecycle Structure/);
  assert.match(source, /CustomerCohortTable/);
  assert.match(source, /CustomerSegmentTable/);
  assert.match(source, /SkuPortfolioOptimizationPanel/);
  assert.match(source, /Profit Decision Intelligence/);
  assert.match(source, /利润决策智能系统/);
  assert.match(source, /Monarca AI determines how to allocate advertising, inventory, and capital across SKUs to maximize total profit/);
  assert.match(source, /Portfolio Decision Summary/);
  assert.match(source, /Optimization Simulation/);
  assert.match(source, /优化模拟/);
  assert.match(source, /Portfolio Impact/);
  assert.match(source, /Top Decisions/);
  assert.doesNotMatch(source, /AI模拟了/);
  assert.doesNotMatch(source, /Simulation 检测/);
  assert.doesNotMatch(source, /Simulation Check/);
  assert.doesNotMatch(source, /AI Profit Optimization/);
  assert.doesNotMatch(source, /Top AI Opportunities/);
  assert.doesNotMatch(source, /AI Recommended Portfolio/);
  assert.doesNotMatch(source, /AI Simulation Explorer/);
  assert.doesNotMatch(source, /AI Confidence/);
  assert.doesNotMatch(source, /当前没有可用于优化的 SKU 数据/);
  assert.match(source, /Current vs Optimized/);
  assert.doesNotMatch(source, /Optimization Layer v2 Flow/);
  assert.doesNotMatch(source, /Optimization Layer v2 流程/);
  assert.doesNotMatch(source, /Profit Opportunity Summary/);
  assert.doesNotMatch(source, /利润机会摘要/);
  assert.doesNotMatch(source, /Expected vs Actual/);
  assert.doesNotMatch(source, /变化逻辑/);
  assert.doesNotMatch(source, /Feedback learning: waiting/);
  assert.doesNotMatch(source, /优先级/);
  assert.doesNotMatch(source, /当前状态/);
  assert.doesNotMatch(source, /AI建议动作/);
  assert.doesNotMatch(source, /为什么推荐/);
  assert.doesNotMatch(source, /模拟方案/);
  assert.doesNotMatch(source, /影响指标/);
  assert.doesNotMatch(source, /约束检查/);
  assert.match(source, /Estimated Profit Impact/);
  assert.match(source, /Why This Action/);
  assert.match(source, /DecisionDriversCell/);
  assert.match(source, /Why Scale/);
  assert.match(source, /Why Reduce \/ Stop/);
  assert.match(source, /Why Optimize/);
  assert.match(source, /buildFallbackDecisionDrivers/);
  assert.doesNotMatch(source, /Portfolio Actions/);
  assert.doesNotMatch(source, /PortfolioActionGroups/);
  assert.match(source, /Portfolio Role/);
  assert.match(source, /Recommended Action/);
  assert.match(source, /RoleBadge/);
  assert.match(source, /skuRole/);
  assert.match(source, /recommendedActions/);
  assert.doesNotMatch(source, /保留 \/ 新增/);
  assert.doesNotMatch(source, /移出（共/);
  assert.doesNotMatch(source, /Added \/ Kept/);
  assert.doesNotMatch(source, /Removed \(/);
  assert.doesNotMatch(source, /Trade-off/);
  assert.match(source, /const selectedRows = optimization\.recommended_portfolio;/);
  assert.doesNotMatch(source, /recommended_portfolio\.slice\(0, 12\)/);
  assert.doesNotMatch(source, /显示 8/);
  assert.doesNotMatch(source, /showing 8/);
  assert.match(source, /DecisionBadge/);
  assert.match(source, /PortfolioAllocationPanel/);
  assert.match(source, /Confidence/);
  assert.match(source, /Status/);
  assert.match(source, /操作/);
  assert.match(source, /onActionChange/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /ScenarioExplorer/);
  assert.doesNotMatch(source, /<th className="px-3 py-3">\\{isZh \\? "Evidence"/);
  assert.match(source, /Simulation Details/);
  assert.doesNotMatch(source, /AI Selected/);
  assert.match(source, /Action Outcome Tracker/);
  assert.match(source, /Accept/);
  assert.match(source, /Reject/);
  assert.match(source, /Details/);
  assert.match(source, /\/api\/actions\/accept/);
  assert.match(source, /\/api\/actions\/reject/);
  assert.match(source, /prediction_summary\.prediction_confidence/);
  assert.doesNotMatch(source, /prediction_summary\.simulation_source/);
  assert.doesNotMatch(source, /xl:grid-cols-\[0\.95fr_1\.05fr\]/);
  assert.match(source, /lg:grid-cols-2/);
  assert.match(source, /rounded-xl border border-slate-200 bg-white p-5 shadow-sm/);
  assert.match(source, /break-words text-\[34px\]/);
  assert.match(source, /增加广告/);
  assert.doesNotMatch(source, /Profit Control Insight Engine/);
  assert.doesNotMatch(source, /ProfitControlInsightList/);
  assert.doesNotMatch(source, /DecisionIntelligenceV2Panel/);
  assert.doesNotMatch(source, /ActionRankingTable/);
  assert.doesNotMatch(source, /CounterfactualTable/);
  assert.doesNotMatch(source, /AutonomousCommerceRuntimePanel/);
  assert.doesNotMatch(source, /AutonomousExecutionQueue/);
  assert.doesNotMatch(source, /Autonomous Commerce Runtime/);
  assert.doesNotMatch(source, /Dry-run execution plan for SKU, Ads, Pricing, and Inventory optimization/);
  assert.doesNotMatch(source, /SkuOptimizationAlgorithmPanel/);
  assert.doesNotMatch(source, /SKU Profit Maximization Algorithm/);
  assert.doesNotMatch(source, /SkuBudgetAllocationTable/);
  assert.doesNotMatch(source, /SkuOptimizationRankTable/);
  assert.doesNotMatch(source, /LearningFeedbackPanel/);
  assert.doesNotMatch(source, /Action → Outcome → Learning Feedback Loop/);
  assert.match(source, /id="report-sku"/);
  assert.match(source, /id="report-ads"/);
  assert.match(source, /id="report-warehouse"/);
  assert.match(source, /id="report-customers"/);
  assert.doesNotMatch(source, /AI Insight Summary/);
  assert.match(source, /All channels/);
  assert.match(source, /channelTags/);
  assert.match(source, /function InventoryChart/);
  assert.match(source, /function InventoryTable/);
  assert.match(source, /buildInventoryRows/);
  assert.ok(source.indexOf("<InventoryChart rows={visibleInventoryRows} />") < source.indexOf("placeholder=\"Search SKU or product\""));
  assert.match(source, /Runway Days/);
  assert.match(source, /Sell-through Rate/);
  assert.match(source, /max-h-\[460px\] overflow-auto/);
  assert.match(source, /sticky top-0 z-10 bg-slate-50/);
  assert.doesNotMatch(source, /rows\.slice\(0, 12\)\.map/);
  assert.match(source, /product_name/);
  assert.match(source, /variant_name/);
  assert.match(source, /Size \{row\.size\}/);
  assert.match(source, /displayProductName/);
  assert.match(source, /No product name/);
  assert.match(source, /`\$\{normalizedSku\}product`/);
  assert.doesNotMatch(source, /productName: row\.product_name \|\| row\.sku/);
  assert.match(source, /xl:grid-cols-7/);
  assert.match(source, /min-h-\[108px\]/);
  assert.match(source, /text-\[24px\]/);
  assert.doesNotMatch(source, /<span id="report-warehouse"/);
  assert.doesNotMatch(source, /min-w-0 truncate text-\[15px\] font-semibold text-slate-600/);
  assert.doesNotMatch(source, /Showing all available SKU rows/);
  assert.doesNotMatch(source, /Profit and margin are calculated/);
  assert.doesNotMatch(source, /经营分析报表|Decision Report JSON|decision_intelligence_v1/);
  assert.doesNotMatch(source, /DataQualityPanel|Metric confidence and coverage from the report payload/);
  assert.match(source, /fetch\s*\("\/api\/actions\/accept"/);
  assert.doesNotMatch(source, /computeCanonicalEcommerceMetrics|loadEcommerceSalesDashboardData|ShopifyGraphQL|GraphQL|access_token/);
});

test("dashboard report page exposes section navigation links", () => {
  const source = fs.readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");

  assert.match(source, /function ReportSectionNav/);
  assert.match(source, /#report-sku/);
  assert.match(source, /#report-ads/);
  assert.match(source, /#report-warehouse/);
  assert.match(source, /#report-customers/);
  assert.match(source, /报表板块导航|Report section navigation/);
  assert.match(source, /DecisionAnalysisEnginePanel/);
  assert.ok(source.indexOf("isAnalysisCacheMiss") < source.indexOf("<DecisionAnalysisEnginePanel"));
});

test("dashboard AI chat rail defaults collapsed with readable label layout", () => {
  const source = fs.readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");

  assert.match(source, /const \[isChatCollapsed, setIsChatCollapsed\] = useState\(true\)/);
  assert.match(source, /const \[isSidebarCollapsed, setIsSidebarCollapsed\] = useState\(true\)/);
  assert.match(source, /setIsSidebarCollapsed\(true\)/);
  assert.match(source, /const collapsedTitle = isZh/);
  assert.match(source, /writing-mode:vertical-rl/);
  assert.doesNotMatch(source, /writing-mode:vertical-rl\] rotate-180/);
});

test("dashboard report page reads the ecommerce decision report endpoint", () => {
  const source = fs.readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");
  const reportPageStart = source.indexOf("function ReportPage(");
  const dashboardStart = source.indexOf("export function Dashboard(");
  const reportPageSource = source.slice(reportPageStart, dashboardStart);

  assert.match(reportPageSource, /\/api\/dashboard\/ecommerce\/decision-report/);
  assert.match(reportPageSource, /<ReportRendererEngine/);
  assert.match(reportPageSource, /Date\.now\(\)/);
  assert.match(reportPageSource, /cache: "no-store"/);
  assert.doesNotMatch(source, /decisionReportPageDataCache/);
  assert.match(reportPageSource, /loadDecisionReport\(\)/);
  assert.match(reportPageSource, /isLoadingDecisionReport && !decisionReportPayload/);
});

test("decision report API reuses dashboard data loader and returns decision_report", () => {
  const source = fs.readFileSync(join(process.cwd(), "app/api/dashboard/ecommerce/decision-report/route.ts"), "utf8");
  const proxy = fs.readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

  assert.match(source, /syncCurrentClerkUser/);
  assert.match(source, /loadEcommerceSalesDashboardData/);
  const localFallbackBlock = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("let session:")
  );
  assert.ok(
    localFallbackBlock.includes("ENABLE_LOCAL_ARTIFACT_STORE") &&
      localFallbackBlock.includes("loadLatestLocalEcommerceSalesDashboardData"),
    "Local canonical artifact fallback should run before Clerk workspace sync in local development"
  );
  assert.match(source, /decision_report/);
  assert.doesNotMatch(source, /composeReport|computeCanonicalEcommerceMetrics|ShopifyGraphQL|GraphQL|access_token/);
  assert.match(proxy, /allowLocalDecisionReportFallback/);
  assert.match(proxy, /ENABLE_LOCAL_ARTIFACT_STORE/);
  assert.match(proxy, /\/api\/dashboard\/ecommerce\/decision-report/);
});
