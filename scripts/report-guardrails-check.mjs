import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

function countNonEmpty(rows, field) {
  return rows.filter((row) => {
    const value = row[field];
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
}

function countIf(rows, field, expected) {
  return rows.filter((row) => row[field] === expected).length;
}

function safeTopShare(rows, totalValue, metricField, count = 3) {
  const numerator = rows.slice(0, count).reduce((sum, row) => {
    const value = Number(row[metricField]);

    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const share = totalValue > 0 ? numerator / totalValue : null;

  return share !== null && Number.isFinite(share) && share >= 0 && share <= 1 ? share : null;
}

function safeRate(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) return null;
  if (number <= 1) return number;
  if (number <= 100) return number / 100;
  return null;
}

{
  const rows = [
    { Translated_Review: "Great app", Sentiment: "Positive" },
    { Translated_Review: "", Sentiment: "" },
    { Translated_Review: null, Sentiment: null },
    { Translated_Review: "Bad update", Sentiment: "Negative" },
    { Translated_Review: "Works", Sentiment: "Positive" }
  ];

  assert.equal(rows.length, 5, "COUNT(*) should count all records");
  assert.equal(countNonEmpty(rows, "Translated_Review"), 3, "COUNT_NON_EMPTY(review_text) should ignore blanks");
  assert.equal(countNonEmpty(rows, "Sentiment"), 3, "COUNT_NON_EMPTY(sentiment) should ignore blanks");
  assert.equal(countIf(rows, "Sentiment", "Positive") / countNonEmpty(rows, "Sentiment"), 2 / 3);
  assert.equal(countIf(rows, "Sentiment", "Negative") / countNonEmpty(rows, "Sentiment"), 1 / 3);
}

{
  const topCategories = [
    { Category: "GAME", Installs: 35086.02 },
    { Category: "COMMUNICATION", Installs: 32650 },
    { Category: "PRODUCTIVITY", Installs: 14180 }
  ];
  const totalInstalls = 167633.43;
  const top3CategoryShare = safeTopShare(topCategories, totalInstalls, "Installs", 3);

  assert.ok(
    top3CategoryShare > 0.48 && top3CategoryShare < 0.50,
    "Top 3 Category Installs Share should be computed with one consistent unit and be around 48.9%"
  );
  assert.equal(
    safeTopShare([{ Category: "BAD", Installs: 35086024415 }], totalInstalls, "Installs", 1),
    null,
    "Top share guardrail should reject mixed-unit or impossible shares above 100%"
  );
}

{
  assert.equal(safeRate(0.221), 0.221, "Raw rate values between 0 and 1 are valid");
  assert.equal(safeRate(22.1), 0.221, "Percent values between 0 and 100 are normalized");
  assert.equal(safeRate(35086024415), null, "Scale values such as installs must never be rendered as negative sentiment rates");
}

const metricResults = read("lib/metric-results.ts");
assert.match(metricResults, /if \(fn === "COUNT" && inner === "\*"\)[\s\S]*return rows\.length;/, "COUNT(*) must stay total rows");
assert.match(metricResults, /if \(fn === "COUNT"\)[\s\S]*isBlankishValue\(value\) \? \[\] : \[1\]/, "COUNT(column) must count non-empty values");
assert.match(metricResults, /scope\?: "global" \| "group" \| "entity" \| "ranking" \| "comparison" \| "diagnostic" \| "internal"/, "Metric results must carry scope");
assert.match(metricResults, /warningTypes\?: string\[\]/, "Metric results must carry structured warningTypes");
assert.match(metricResults, /validationStatus\?: string \| null/, "Metric results must carry validationStatus");
assert.match(metricResults, /isBusinessMetric\?: boolean/, "Metric results must carry business/internal flags");
assert.match(metricResults, /sampleSize\?: number \| null/, "Metric results must carry sample size metadata");
assert.match(metricResults, /function isRatingColumn/, "Metric engine must identify rating/score fields before aggregation");
assert.match(metricResults, /value < 0 \|\| value > 5/, "Metric engine must reject impossible rating values such as 19");
assert.match(metricResults, /CASE WHEN \$\{numericSql\} BETWEEN 0 AND 5 THEN \$\{numericSql\} ELSE NULL END/, "SQL metric execution must exclude invalid rating values before MAX/AVG/percentiles");
assert.match(metricResults, /cleanMetricNumber\(parseNumber\(rowFieldValue\(row, column\)\), column\)/, "CSV metric execution must clean numeric rating values before aggregate math");
assert.match(metricResults, /cleanNumericSqlExpression\(type, tables, inner\)/, "SQL aggregate functions must use cleaned numeric expressions");
assert.match(metricResults, /function metricScope/, "Metric result scope classifier must exist");
assert.match(metricResults, /sample\(_\|\\s\)\?size\|samplecount[\s\S]*return "diagnostic"/, "Sample size helper metrics must be diagnostic scoped");
assert.match(metricResults, /validationFromLineage\(metric\.lineageJson\)/, "Metric result metadata must expose validation status from validation lineage");

const metricTemplates = read("lib/metric-generation/metric-templates.ts");
assert.ok(
  metricTemplates.includes("safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Positive')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`)"),
  "Positive sentiment denominator must use COUNT_NON_EMPTY(sentiment)"
);
assert.ok(
  metricTemplates.includes("safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Negative')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`)"),
  "Negative sentiment denominator must use COUNT_NON_EMPTY(sentiment)"
);

const suggestionsRoute = read("app/api/metrics/suggestions/route.ts");
assert.match(suggestionsRoute, /SAFE_DIVIDE\(COUNT_IF\(\$\{qualifiedField\(labelField\)\} = target\), COUNT_NON_EMPTY\(\$\{qualifiedField\(labelField\)\}\)\)/, "Custom rate suggestions must use explicit non-empty denominator");
assert.doesNotMatch(suggestionsRoute, /COUNT_IF\([^`]+target\) \/ COUNT\(/, "Custom rate suggestions must not divide by COUNT(column)");

const semanticLayer = read("lib/semantic-layer.ts");
assert.match(semanticLayer, /Free'\), COUNT_NON_EMPTY\(\$\{typeField\.table\}\.\$\{typeField\.field\}\)\)/, "Free app rate denominator must use COUNT_NON_EMPTY");

const visibility = read("lib/metric-visibility.ts");
for (const token of ["impactscore", "dataqualityscore", "applied_steps_count", "anomalytype", "samplesize", "sample_size", "debug", "diagnostic", "internal_id"]) {
  assert.ok(visibility.includes(token), `System metric token should be filtered: ${token}`);
}
for (const invalidValue of ['"-"', '"nan"', '"null"', '"undefined"']) {
  assert.ok(visibility.includes(invalidValue), `Undisplayable metric value should be rejected: ${invalidValue}`);
}
assert.match(visibility, /metric\.scope && metric\.scope !== "global"/, "Non-global metrics must be blocked from global report slots");
assert.match(visibility, /isObjectLevelMetricText/, "Object-level metric text classifier must exist");
assert.match(visibility, /isRankingLabel/, "Top/Bottom ranking labels must be treated as object-level evidence");
assert.match(visibility, /ranking_metric/, "Ranking metrics must be blocked from global report slots");
assert.match(visibility, /diagnostic_metric/, "Diagnostic metrics must be blocked from global report slots");
assert.match(visibility, /warning_metric/, "Warning metrics must be blocked from global report slots");

const nameNormalizer = read("lib/report-generation/metric-name-normalizer.ts");
assert.match(nameNormalizer, /Top \$\{count\} \$\{dimensionLabel\} \$\{metricLabel\} Share/, "Top share names must include the dimension grain");

const metricSelector = read("lib/report-generation/metric-selector.ts");
assert.match(metricSelector, /isObjectLevelMetricText/, "Metric selector must explicitly filter object-level metrics from core KPI slots");
assert.match(metricSelector, /isSampleQualityMetric/, "Metric selector must filter sample quality helper metrics from business KPI slots");
assert.match(metricSelector, /validationPassed/, "Metric selector must enforce validation status before selecting key metrics");
assert.match(metricSelector, /isBusinessMetricAllowed/, "Metric selector must enforce business/internal/diagnostic flags");
assert.match(metricSelector, /metric\.isInternalMetric \|\| metric\.isDiagnosticMetric/, "Metric selector must reject internal and diagnostic metrics");
assert.match(metricSelector, /metric\.scope === "internal" \|\| metric\.scope === "diagnostic"/, "Metric selector must reject internal and diagnostic scopes");
assert.match(metricSelector, /isRequiredKeyMetric/, "Metric selector must define required key business metrics");
assert.match(metricSelector, /negativesentimentrate/, "Negative Sentiment Rate must be a required key metric");
assert.match(metricSelector, /positive sentiment rate[\s\S]*score \+= 18/, "Positive Sentiment Rate should be boosted into key metrics");
assert.match(metricSelector, /negative sentiment rate[\s\S]*score \+= 34/, "Negative Sentiment Rate should be boosted into key metrics");
assert.match(metricSelector, /Average Sample|averagesamplesize|minimumsamplesize/i, "Average/minimum sample size metrics must be guarded");
assert.match(metricSelector, /cumulative return[\s\S]*score \+= 42/, "Finance key metric priority must prefer cumulative return");
assert.match(metricSelector, /max drawdown[\s\S]*score \+= 40/, "Finance key metric priority must prefer max drawdown");
assert.match(metricSelector, /annualized volatility[\s\S]*score \+= 38/, "Finance key metric priority must prefer annualized volatility");
assert.match(metricSelector, /trading volume stddev\|close price stddev[\s\S]*score -= 24/, "Finance diagnostic stddev metrics must be demoted");
assert.match(metricSelector, /原始记录口径，可能未按 App \/ Product 等实体去重/, "Raw SUM scale metrics must carry deduplication warning");
assert.match(metricSelector, /installs\|reviews\|usage\|volume/, "Raw scale SUM metrics should be guarded for deduplication risk");
assert.match(metricSelector, /small_sample_warning/, "Small sample warning must be surfaced as a limitation/warning");

const reportSectionBuilder = read("lib/report-generation/report-section-builder.ts");
assert.match(reportSectionBuilder, /isRequiredKeyMetric/, "Report section builder must preserve required review metrics");
assert.match(reportSectionBuilder, /requiredMetrics/, "Key metric selection must inject required metrics before slicing");

const reportRoute = read("app/api/dashboard/reports/generate/route.ts");
assert.match(reportRoute, /isGlobalBusinessMetricResult\(result\)/, "Report generation must filter global metric results");
assert.match(reportRoute, /!result\.isInternalMetric[\s\S]*!result\.isDiagnosticMetric/, "Report brief summary must filter internal and diagnostic metrics");
assert.match(reportRoute, /isBusinessFacingMetricText/, "Report brief summary must filter non-business metric text");
assert.match(reportRoute, /hasDisplayableMetricValue\(result\.value\)/, "Report generation must hide missing scalar values from summary");
assert.match(reportRoute, /hasDisplayableMetricResult\(result\)/, "Report generation must hide missing metric results");

const apiErrors = read("lib/api-errors.ts");
for (const token of [
  "pool timeout",
  "failed to retrieve a connection from pool",
  "can't connect to mysql server on",
  "connection timed out",
  "server has gone away",
  "econnrefused",
  "econnreset"
]) {
  assert.ok(apiErrors.toLowerCase().includes(token), `Database unavailable errors should be classified clearly: ${token}`);
}
assert.match(apiErrors, /DATABASE_UNAVAILABLE/, "Database unavailable errors should return a structured error code");
assert.match(apiErrors, /DATABASE_AUTH_FAILED/, "Database auth errors should return a structured error code");
assert.match(apiErrors, /数据库暂时无法连接/, "Database unavailable errors should not fall through to generic report generation errors");

const dashboard = read("components/dashboard.tsx");
assert.doesNotMatch(dashboard, /字段：\{[^}]+referencedFields/, "Main dashboard cards should not render referencedFields as a business-facing field list");
assert.match(dashboard, /isObjectLevelReportMetricText/, "Dashboard must hide object-level metrics from global KPI cards");
assert.match(dashboard, /function isRatingReportMetric/, "Dashboard must identify rating metrics for display guardrails");
assert.match(dashboard, /function isInvalidRatingMetricValue/, "Dashboard must hide invalid scalar rating values");
assert.match(dashboard, /isRatingReportMetric\(result\) && \(value < 0 \|\| value > 5\)/, "Dashboard chart/ranking rows must filter impossible rating values");
assert.match(dashboard, /Number\.isFinite\(rowValue\) && rowValue >= 0 && rowValue <= 5/, "Object-level rating display must choose only valid rating rows");
assert.match(dashboard, /normalizedReportMetricDedupeKey/, "Dashboard must dedupe duplicate readable/snake_case metrics");
assert.match(dashboard, /sentiment_polarity[\s\S]*sentiment polarity/, "Dashboard metric dedupe must collapse Average Sentiment_Polarity and Average Sentiment Polarity");
assert.match(dashboard, /样本量/, "Object-level evidence should display sample size context");
assert.doesNotMatch(dashboard, /建议动作：/, "Key findings should not use task-style action labels");
assert.match(dashboard, /进一步分析结论/, "Key findings should render deeper system analysis results");
assert.match(dashboard, /建议决策/, "Key findings should render decision copy instead of suggested analysis tasks");
assert.match(dashboard, /currentConclusion/, "Key findings should consume currentConclusion");
assert.match(dashboard, /deeperAnalysisResult/, "Key findings should consume deeperAnalysisResult");
assert.match(dashboard, /recommendedDecision/, "Key findings should consume recommendedDecision");
assert.match(dashboard, /technicalLineagePattern/, "Dashboard should detect technical lineage text");
assert.match(dashboard, /跨表关联/, "Dashboard technical text filter should catch cross-table wording");
assert.ok(dashboard.includes("Top\\/Bottom\\s*排名"), "Dashboard technical text filter should catch Top/Bottom ranking wording");
assert.match(dashboard, /threshold/, "Dashboard technical text filter should catch threshold wording");
assert.match(dashboard, /指标口径限制/, "Dashboard technical text filter should catch metric-lineage wording");
assert.doesNotMatch(dashboard, /item\.confidenceReason \? \(/, "Confidence reasons should not render as main insight copy");
assert.match(dashboard, /visibleSummaryBullets/, "Core summary must render business-safe summary bullets");
assert.match(dashboard, /businessSummaryBullets/, "Core summary must sanitize backend summary bullets before display");
assert.match(dashboard, /visibleSummaryBullets\.map/, "Core summary should render sanitized bullets, not raw backend bullets");
assert.doesNotMatch(dashboard, /summaryBullets\.map/, "Raw report summary bullets must not be rendered directly");
assert.match(dashboard, /查看口径 \/ 关联逻辑/, "Technical join details should be collapsed behind a business-facing control");
assert.doesNotMatch(dashboard, /App 维度已经具备规模、评分和用户反馈信息/, "Main findings must not use capability-style App dimension copy");
assert.match(dashboard, /高安装但评分或反馈偏弱的 App 应优先进入排查清单/, "Dashboard fallback findings should be business conclusions, not capability descriptions");
assert.match(dashboard, /下一步行动/, "Main report page should promote next actions");
assert.doesNotMatch(dashboard, />系统已自动分析</, "Next action module should not render auto-generated analysis as a standalone section");
assert.match(dashboard, /业务行动/, "Next action module should separate business actions");
assert.match(dashboard, /数据补强/, "Next action module should separate data strengthening actions");
assert.match(dashboard, /5 - businessNextActions\.length/, "Next action module should cap total visible actions at five");
assert.match(dashboard, /Math\.min\(2, Math\.max\(0, 5 - businessNextActions\.length\)\)/, "Data strengthening actions should be capped at two and respect the total action cap");
assert.match(dashboard, /actionTitleText/, "Next action card titles should be normalized for business copy");
assert.match(dashboard, /conciseCaveats/, "Next action caveats should be displayed as concise badges");
assert.doesNotMatch(dashboard, /function actionTypeLabel/, "Next action cards should not show internal action type labels");
assert.match(dashboard, /查看口径与限制/, "Data limitations should be folded behind a details section");
assert.doesNotMatch(dashboard, /<CardTitle className="text-base">数据口径与限制<\/CardTitle>/, "Data limitations should not be a primary report card");
assert.doesNotMatch(dashboard, /<CardTitle className="text-base">数据口径修正<\/CardTitle>/, "Data quality actions should be folded into priority actions, not a primary warning card");
assert.doesNotMatch(dashboard, /当前发现：/, "Business action cards should not repeat analysis process copy in the main card");
assert.doesNotMatch(dashboard, /业务含义：/, "Business action cards should keep business meaning implicit in evidence/action/impact copy");
assert.match(dashboard, /对象：/, "Business action cards should show target objects when available");
assert.match(dashboard, /依据：/, "Business action cards should show evidence");
assert.match(dashboard, /证据：/, "Business action cards should bind actions to concrete metric evidence");
assert.match(dashboard, /当前洞察/, "Business action cards should foreground generated insight before action copy");
assert.match(dashboard, /业务含义/, "Business action cards should explain business meaning when available");
assert.match(dashboard, /系统判断/, "Business action cards should show system-generated conclusions");
assert.match(dashboard, /筛选头部类别中的高质量增长候选/, "Head-category growth action should use the precise high-quality growth candidate title");
assert.match(dashboard, /conciseBusinessCaveats/, "Business action badges should filter data-quality caveats");
assert.match(dashboard, /businessActionCaveatText/, "Business action dedup caveats should render as explanatory copy, not primary badges");
assert.match(dashboard, /安装量为原始口径，正式判断前建议参考去重版本/, "Deduplication caveat should not dominate business action badges");
assert.match(dashboard, /paid_amount、order_amount、transaction_amount、revenue、cost、ad_spend、acquisition_cost/, "ROI data strengthening should request both revenue and cost fields");
assert.match(dashboard, /真实 ROI \/ ROAS/, "ROI data strengthening should clearly mention true ROI / ROAS");
assert.doesNotMatch(dashboard, />执行步骤</, "Business action cards should not foreground task-style execution steps");
assert.match(dashboard, /查看执行清单/, "Execution details should be collapsed behind a details control");
assert.match(dashboard, /executionStepsFor/, "Business action cards should keep executionSteps available as optional detail");
assert.match(dashboard, /产出物：/, "Business action cards should show the expected business deliverable");
assert.match(dashboard, /deliverableForDisplay/, "Business action cards should render concrete deliverables");
assert.match(dashboard, /预期影响：/, "Priority action cards should show expected impact");
assert.match(dashboard, /caveats/, "Priority action cards should surface warning caveats as badges");
assert.match(dashboard, /requiredDataIfAny/, "Priority action cards should show required data only as action context");
assert.match(dashboard, /为什么需要：/, "Data strengthening cards should explain why the data is needed");
assert.match(dashboard, /输出物：/, "Data strengthening cards should show the output artifact");
assert.match(dashboard, /决策影响：/, "Data strengthening cards should explain the business decision impact");
assert.match(dashboard, /metricWarningLabel/, "Metric warning badges should distinguish estimated and deduplication warnings");
assert.match(dashboard, /业务 KPI 看板/, "Report page should render an industry-aware KPI board instead of a calculation log");
assert.match(dashboard, /selectReportCoreKpis/, "Report page should select core KPIs from real metric results");
assert.match(dashboard, /inferReportMetricBusinessModule/, "Report metrics should be grouped by business module");
assert.match(dashboard, /reportMetricStatusFilters/, "Report page should provide status filters");
assert.match(dashboard, /reportMetricTypeFilters/, "Report page should provide metric type filters");
assert.match(dashboard, /全部模块/, "Report page should provide dynamic business module filtering");
assert.match(dashboard, /查看口径/, "Formula, source and calculation time should be folded behind metric detail controls");
assert.match(dashboard, /isNonInternalReportMetricResult/, "Report page should hide internal/debug metrics while allowing object/ranking evidence in groups");
assert.match(dashboard, /typeFilter !== "all" \|\| reportMetricDisplayType\(result\) !== "ranking"/, "Object/ranking metrics must not appear in default global metric card lists");
assert.match(dashboard, /!\["comparison", "distribution", "auxiliary"\]\.includes\(reportMetricDisplayType\(result\)\)/, "Comparison/distribution/auxiliary metrics must be folded by default");
assert.match(dashboard, /\.slice\(0, 8\)/, "Each metric module should cap primary visible metrics before details expansion");
assert.match(dashboard, /reportCoreKpiPriority/, "Report KPI strip should not follow database return order");
assert.match(dashboard, /Estimated Paid|estimated_paid|估算值/, "Report metric badges should preserve estimated-value context");
assert.match(dashboard, /requiresDedupedReportMetric/, "Report metric badges should preserve raw/deduplication context");
assert.doesNotMatch(dashboard, /const metricCards = \[/, "Report page should not render a hard-coded demo metric card array");
assert.match(dashboard, /type ReportTimeRange = "7D" \| "30D" \| "90D" \| "12M" \| "ALL" \| "CUSTOM"/, "Report page should support real time range selection");
assert.match(dashboard, /ReportTrendAnalysisSection/, "Report page should render a dedicated trend analysis section");
assert.match(dashboard, /当前数据缺少时间字段，无法生成趋势分析/, "Report page should explain missing business time fields instead of showing fake trends");
assert.match(dashboard, /reportTrendChartsFromPayload/, "Trend charts should consume backend trend metrics/charts rather than demo arrays");
assert.match(dashboard, /trendMetricForReportMetric/, "KPI cards should be able to show previous-period trend context when available");
assert.doesNotMatch(dashboard, /calculationTime.*xAxis|computedAt.*xAxis/, "Trend charts must not use calculation time as the X axis");
assert.doesNotMatch(dashboard, /ReportDonutChart[\s\S]*md:grid-cols-\[220px_1fr\]/, "Donut charts must not use a fixed side-by-side legend layout that can overflow narrow cards");
assert.doesNotMatch(dashboard, /ReportDonutChart[\s\S]*sm:grid-cols-3/, "Donut chart legends should not split into cramped columns inside narrow cards");
assert.match(dashboard, /ReportDonutChart[\s\S]*justify-between[\s\S]*truncate[\s\S]*tabular-nums/, "Donut chart legend labels and values should be separated in full-width rows");
assert.match(dashboard, /shouldShowInviteHint = !isLoading && !errorMessage/, "Team member invite empty state must be suppressed when the member API fails");
assert.match(dashboard, /shouldShowMemberList = isLoading \|\| members\.length > 0/, "Team member list empty state should not duplicate the invite empty state");
assert.equal(
  countMatches(dashboard, /\{copy\.settingsPage\.teamMembersEmpty\}/g),
  1,
  "Team member invite empty copy should render from one place only"
);
assert.ok(dashboard.includes("blockedFindingAction"), "Business findings must define blocked template wording for the main report");
for (const blockedText of ["当前可以", "可用于判断", "缺少业务基准支撑强判断"]) {
  assert.ok(
    dashboard.includes(blockedText),
    `Business findings must block conservative template wording: ${blockedText}`
  );
}
assert.ok(dashboard.includes("technicalLineagePattern"), "Business findings must define technical lineage filtering");
for (const technicalText of ["CSV\\s*-", "join\\s+key", "置信度依据"]) {
  assert.ok(
    dashboard.includes(technicalText),
    `Business findings must hide technical lineage wording behind details: ${technicalText}`
  );
}

const aggregationEngine = read("lib/analytics/aggregation-engine.ts");
assert.match(aggregationEngine, /function candidatesFromGroupBys/, "Aggregation engine must generate group-level risk and opportunity candidates");
assert.match(aggregationEngine, /topRankings: \[\.\.\.groupRankings\.top, \.\.\.rankings\.top, \.\.\.metricRowRankings\.top\]/, "Group rankings should be surfaced before raw object rankings");
assert.match(aggregationEngine, /Top 5 \$\{objectColumn\.name\} \$\{readableMetricName\(rankingMetric\)\} Share/, "Top share evidence must include object grain");
assert.match(aggregationEngine, /positive_feedback_cluster/, "Positive feedback clusters should create opportunity evidence");
assert.match(aggregationEngine, /sentimentSampleSize/, "Object-level sentiment rankings must carry sample size");
assert.match(aggregationEngine, /top3Share/, "Ranking results should include Top 3 share for business evidence");
assert.match(aggregationEngine, /order_date[\s\S]*transaction_date[\s\S]*event_time[\s\S]*review_date/, "Aggregation engine should detect business time fields");
assert.match(aggregationEngine, /bucket: "day" \| "week" \| "month" \| "year"/, "Aggregation engine should produce day/week/month/year trend buckets");
assert.match(aggregationEngine, /businessType === "finance_timeseries"[\s\S]*\? "day"/, "Finance time series should keep daily trend granularity");

const insightGenerator = read("lib/insights/insight-generator.ts");
const reportTypes = read("lib/report-generation/report-types.ts");
const reportGenerateRoute = read("app/api/dashboard/reports/generate/route.ts");
assert.match(reportTypes, /dateField\?: string/, "TimeTrendResult should preserve the business date field used for trends");
assert.match(reportGenerateRoute, /buildReportTimeArtifacts/, "Report generation should persist timeConfig, trendMetrics, and trendCharts");
assert.match(reportGenerateRoute, /timeConfig: reportTimeArtifacts\.timeConfig/, "Report payload should include timeConfig");
assert.match(reportGenerateRoute, /trendMetrics: reportTimeArtifacts\.trendMetrics/, "Report payload should include trendMetrics");
assert.match(reportGenerateRoute, /trendCharts: reportTimeArtifacts\.trendCharts/, "Report payload should include trendCharts");
assert.match(reportTypes, /currentConclusion\?: string/, "GeneratedInsight must carry currentConclusion");
assert.match(reportTypes, /supportingEvidence\?: string/, "GeneratedInsight must carry supportingEvidence");
assert.match(reportTypes, /deeperAnalysisResult\?: string/, "GeneratedInsight must carry deeperAnalysisResult");
assert.match(reportTypes, /recommendedDecision\?: string/, "GeneratedInsight must carry recommendedDecision");
assert.match(reportTypes, /findingType\?:/, "GeneratedInsight must carry structured findingType");
assert.match(reportTypes, /"category_comparison"/, "GeneratedInsight findingType must support category comparison insights");
assert.match(reportTypes, /"joined_table_insight"/, "GeneratedInsight findingType must support joined table insights");
assert.match(reportTypes, /comparedGroups\?:/, "GeneratedInsight must carry compared groups for categorical evidence");
assert.match(reportTypes, /joinedTables\?: string\[\]/, "GeneratedInsight must carry joined table names");
assert.match(reportTypes, /joinKey\?: string/, "GeneratedInsight must carry join key metadata");
assert.match(reportTypes, /technicalDetails\?:/, "GeneratedInsight must carry technical lineage only in technicalDetails");
assert.match(insightGenerator, /function findPreferredRanking/, "Insight generator must prefer available ranking evidence");
assert.match(insightGenerator, /function categoricalComparisonInsight/, "Insight generator must create categorical comparison findings");
assert.match(insightGenerator, /function joinedTableInsight/, "Insight generator must create cross-table joined findings");
assert.match(insightGenerator, /function findJoinKey/, "Insight generator must detect cross-table join keys");
assert.match(insightGenerator, /findingType: "category_comparison"/, "Categorical comparison findings must be explicitly typed");
assert.match(insightGenerator, /findingType: "joined_table_insight"/, "Joined table findings must be explicitly typed");
assert.doesNotMatch(insightGenerator, /currentConclusion:\s*`系统已通过/, "Joined insight currentConclusion must be a business conclusion, not technical lineage");
assert.doesNotMatch(insightGenerator, /evidence:\s*\[[\s\S]*Joined tables:/, "Joined insight business evidence must not expose joined table debug text");
assert.match(insightGenerator, /technicalDetails:\s*\{[\s\S]*joinedTables/, "Joined table lineage should be preserved only in technicalDetails");
assert.match(insightGenerator, /joinedTableInsight\(usableMetrics, aggregationResults\),\s*categoricalComparisonInsight/s, "Joined and categorical findings must run before generic metric findings");
assert.match(insightGenerator, /ranking\.rankingType === "top_group"/, "Insight generator should prefer group rankings when available");
assert.doesNotMatch(insightGenerator, /建议查看 Top\/Bottom/, "Insights must not tell users to view Top/Bottom when ranking evidence exists");
assert.doesNotMatch(insightGenerator, /建议按类别拆解|建议 join|建议继续分析/, "Insights must not ask users to do category or join analysis that the system can run");
assert.match(insightGenerator, /rankingObjectsText/, "Insight generator should render ranking evidence in business-readable form");
assert.match(insightGenerator, /negativeRankingObjectsText/, "Insight generator should include sample size for object-level negative rates");
assert.match(insightGenerator, /rankingShareLabel\(scaleRanking,\s*3\)/, "Top share evidence should include object/group grain");
assert.doesNotMatch(insightGenerator, /shareText\("Top 3 Share"/, "Top share should not be displayed without grain");
assert.doesNotMatch(insightGenerator, /topShareForRanking\(scaleRanking,\s*3,\s*metricNumber\(primary\)\)/, "Top share must be computed from ranking numerator / denominator, not mixed-unit fallbacks");
assert.match(insightGenerator, /\[top3ShareLabel\]/, "Top share evidence values should use the grain-specific label");
assert.match(insightGenerator, /id !== "generic-directional"/, "Generic benchmark limitation should be downgraded when specific findings exist");
assert.match(insightGenerator, /尚未生成评论主题聚类/, "Negative object findings should say when topic clustering is unavailable");
assert.match(insightGenerator, /无法验证估算值和真实收入/, "Estimated value findings should not ask users to analyze revenue; they should state ROI cannot be validated");
assert.match(insightGenerator, /当前尚未生成去重版本/, "Raw scale findings should state when deduped metrics are missing");
assert.match(insightGenerator, /头部类别具备增长验证价值/, "Group rankings should create group-level opportunities");
assert.match(insightGenerator, /currentFinding/, "Recommended actions should carry currentFinding");
assert.match(insightGenerator, /whyItMatters/, "Recommended actions should carry whyItMatters");
assert.match(insightGenerator, /actionType: "reduce_negative_feedback"/, "Recommended actions should carry business action types");
assert.match(insightGenerator, /actionType: "collect_revenue_field"/, "Estimated value warnings should convert into revenue-field actions");
assert.match(insightGenerator, /actionType: "create_deduped_metric"/, "Deduplication warnings should convert into deduped metric actions");
assert.match(insightGenerator, /roiConfidence/, "Recommended actions should carry ROI confidence");
assert.match(insightGenerator, /caveats:/, "Recommended actions should carry caveats instead of primary warning cards");
assert.match(insightGenerator, /requiredDataIfAny:/, "Recommended actions should list required data when needed");
assert.match(insightGenerator, /evidenceRankings:/, "Recommended actions should reference ranking evidence");
assert.match(insightGenerator, /Installs Mean Median Ratio|Mean \/ Median Ratio/, "Mean/median ratio should be interpreted as distribution evidence");
assert.match(insightGenerator, /const recommendedActions = actionsFromEvidence/, "Report writer must consume structured recommended actions");
assert.match(insightGenerator, /nextActionPlan/, "Generated insights must expose a structured next action plan");
assert.match(insightGenerator, /small-sample-limitation/, "Small sample warnings must go to data limitations");
assert.match(insightGenerator, /estimatedWarningResults/, "Estimated warning metrics must be classified as data limitations");
assert.match(insightGenerator, /deduplicationWarningResults/, "Deduplication warning metrics must be classified as data limitations");
assert.match(insightGenerator, /diagnosticMetrics: metricResults\.filter/, "Generated insights must expose diagnostic metrics separately");

assert.match(reportTypes, /actionType\?:/, "Recommended action type should be part of the shared report contract");
assert.match(reportTypes, /estimatedRoiOrValue\?: number \| string/, "Recommended actions should support estimated ROI/value");
assert.match(reportTypes, /caveats\?: string\[\]/, "Recommended actions should support caveats");
assert.match(reportTypes, /requiredDataIfAny\?: string\[\]/, "Recommended actions should support required data");
assert.match(reportTypes, /export type GeneratedNextActionPlan/, "Shared report contract should include the next action plan");
assert.match(reportTypes, /autoGeneratedResults: AutoGeneratedResult\[\]/, "Next action plan should include auto-generated results");
assert.match(reportTypes, /actionInsights: ActionInsight\[\]/, "Next action plan should expose ActionInsight output");
assert.match(reportTypes, /currentFinding: string/, "ActionInsight should include currentFinding");
assert.match(reportTypes, /businessMeaning: string/, "ActionInsight should include businessMeaning");
assert.match(reportTypes, /missingDataRequests: MissingDataRequest\[\]/, "Next action plan should include missing data requests");
assert.match(reportTypes, /caveats: ActionCaveat\[\]/, "Next action plan should include caveats");

const nextActionGenerator = read("lib/insights/next-action-generator.ts");
assert.match(nextActionGenerator, /INDUSTRY_ACTION_RULES/, "Next action generator should use industry-specific action rules");
assert.match(nextActionGenerator, /autoGeneratedResultsFromInput/, "Next action generator should expose auto-generated analysis results");
assert.match(nextActionGenerator, /actionInsightsFromRecommended/, "Next action generator should compose ActionInsight records from existing actions");
assert.match(nextActionGenerator, /actionFromRisk/, "Next action generator should turn structured risks into business actions");
assert.match(nextActionGenerator, /actionFromOpportunity/, "Next action generator should turn structured opportunities into business actions");
assert.match(nextActionGenerator, /actionFromRanking/, "Next action generator should use existing rankings directly");
assert.match(nextActionGenerator, /missingRequestFromLimitation/, "Next action generator should convert true missing fields into requests");
assert.match(nextActionGenerator, /limitationToCaveat/, "Warnings should become caveats instead of primary cards");
assert.match(nextActionGenerator, /筛选头部类别中的高质量增长候选/, "Duplicate top-category growth actions should be merged into one business action");
assert.match(nextActionGenerator, /小样本线索/, "Negative feedback object actions should surface small-sample caveats");
assert.match(nextActionGenerator, /筛选头部类别中的高质量增长候选/, "Next action generator should use the high-quality growth candidate title");
assert.match(nextActionGenerator, /Rating 高于整体平均或 ≥ 4\.5/, "Growth action should include an explicit rating filter");
assert.match(nextActionGenerator, /Negative Sentiment Rate 低于整体平均/, "Growth action should include an explicit negative sentiment filter");
assert.match(nextActionGenerator, /Reviews \/ Sentiment 样本量足够/, "Growth action should require sufficient reviews/sentiment sample size");
assert.match(dashboard, /function evidenceRowNumber/, "Dashboard should read object-level sample size across key variants");
assert.match(dashboard, /function explicitNegativeRateFromRow/, "Negative feedback cards must read only explicit negative-rate fields");
assert.match(dashboard, /boundedRateValue/, "Negative feedback cards must reject impossible rate values above 100%");
assert.match(dashboard, /function negativeCountFromRow/, "Negative feedback cards must read explicit negative count fields");
assert.match(dashboard, /function sentimentSampleSizeFromRow/, "Negative feedback cards must read explicit sentiment sample size fields");
assert.doesNotMatch(dashboard, /const negativeRate = rowNumberByPattern\(row, \[[^\]]*\/\^value\$\//, "Negative feedback cards must not treat generic value or install totals as negative rate");
assert.match(dashboard, /样本量缺失，无法判断可靠性/, "Missing object-level sentiment sample size should be shown as reliability caveat, not 未返回");
assert.match(dashboard, /负向数/, "Dashboard should label object-level negative count");
assert.match(dashboard, /小样本线索/, "Dashboard should surface small-sample caveats for object-level rates");
assert.match(dashboard, /filter\(\(item\) => item\.id !== "generic-directional"\)/, "Dashboard should hide generic limitation cards from core findings");
assert.match(nextActionGenerator, /对象级负向率仅作为排查线索，不作为强风险结论/, "Negative feedback action should clarify object-level rates are investigation signals");
assert.match(nextActionGenerator, /样本量：/, "Negative feedback action evidence should preserve per-object sample size when available");
assert.match(nextActionGenerator, /cost、ad_spend、acquisition_cost/, "Revenue-field action should also request cost fields for ROI/ROAS");
assert.match(nextActionGenerator, /真实 ROI \/ ROAS/, "Revenue-field action should enable true ROI / ROAS");
assert.match(nextActionGenerator, /negativeExecution/, "Negative feedback actions should include concrete execution steps");
assert.match(nextActionGenerator, /categoryQualityExecution/, "Head category quality actions should include concrete execution steps");
assert.match(nextActionGenerator, /categoryGrowthExecution/, "Growth candidate actions should include concrete execution steps");
assert.match(nextActionGenerator, /deliverableFor/, "Next action generator should output concrete business deliverables");
assert.match(nextActionGenerator, /keyEvidence/, "Next action generator should bind actions to concrete evidence values");
assert.match(nextActionGenerator, /objectOverlapRatio/, "Next action generator should deduplicate highly similar actions by target overlap");
assert.match(nextActionGenerator, /Raw vs Deduped 对比表/, "Data strengthening actions should output Raw vs Deduped comparison artifacts");
assert.match(nextActionGenerator, /真实收入和成本字段映射表 \+ ROI \/ ROAS 验证结果/, "Revenue data strengthening actions should output ROI/ROAS validation artifacts");
assert.match(nextActionGenerator, /slice\(0, 2\)/, "Data strengthening actions should be capped at two in the generator");
assert.match(nextActionGenerator, /app_market[\s\S]*验证头部类别质量风险/, "App market actions should be industry-aware");
assert.match(nextActionGenerator, /ecommerce[\s\S]*放大高收入高利润产品/, "Ecommerce actions should be industry-aware");
assert.match(nextActionGenerator, /finance_timeseries[\s\S]*评估收益和回撤/, "Finance actions should be industry-aware");

const reportPromptBuilder = read("lib/report-generation/report-prompt-builder.ts");
assert.match(reportPromptBuilder, /查看口径与限制（折叠）/, "Prompt should treat limitations as folded details");
assert.match(reportPromptBuilder, /下一步行动必须只分为：业务行动、数据补强/, "Prompt should require the simplified next action sections");
assert.match(reportPromptBuilder, /不要单独展示“系统已自动分析”/, "Prompt should prevent the old auto-analysis section from returning");
assert.match(reportPromptBuilder, /nextActionPlan\.actionInsights/, "Prompt should require report writer to consume ActionInsight output");
assert.match(reportPromptBuilder, /warningMetrics 默认只能转成 action caveat/, "Prompt should route warnings into action caveats or folded details");
assert.match(reportPromptBuilder, /主页面要优先回答下一步经营动作/, "Prompt should prioritize operating actions over warning lists");

console.log("Report guardrails passed");
