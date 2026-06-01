import type {
  AggregationResult,
  BusinessModuleReport,
  GeneratedInsights,
  ReportMetricDefinitionInput,
  ReportMetricResultInput,
  StructuredAiReport
} from "@/lib/report-generation/report-types";
import { generateStructuredInsights } from "@/lib/insights/insight-generator";
import { buildCoreSummary, buildModuleSummary, metricBusinessInsight } from "@/lib/report-generation/insight-generator";
import { selectReportMetrics, groupMetricsByBusinessType, isRequiredKeyMetric } from "@/lib/report-generation/metric-selector";
import { detectMetricRisks } from "@/lib/report-generation/risk-detector";
import { generateRecommendations } from "@/lib/report-generation/recommendation-generator";
import { skillForBusinessType } from "@/lib/report-generation/skill-registry";

function buildModuleReports(selectedMetrics: ReturnType<typeof selectReportMetrics>): BusinessModuleReport[] {
  return groupMetricsByBusinessType(selectedMetrics).map(({ businessType, metrics }) => {
    const skill = skillForBusinessType(businessType);
    const risks = detectMetricRisks(metrics);
    const coreMetrics = uniqueMetrics([
      ...metrics.slice(0, 3),
      ...metrics.filter(isRequiredKeyMetric)
    ]).slice(0, 4);

    return {
      businessType,
      title: skill.title,
      summary: buildModuleSummary(skill.title, coreMetrics),
      coreMetrics,
      metricExplanation: coreMetrics.map(metricBusinessInsight),
      businessMeaning: coreMetrics.map((metric) =>
        `${metric.displayName} 为 ${metric.displayValue}，按${metric.grain}解释${skill.title}表现`
      ),
      risks: risks.length > 0
        ? risks
        : [],
      nextBreakdowns: skill.breakdownDimensions.map((dimension) => `按${dimension}拆解 ${coreMetrics[0]?.displayName ?? "核心指标"}`)
    };
  });
}

function uniqueMetrics(metrics: ReturnType<typeof selectReportMetrics>) {
  const byKey = new Map<string, ReturnType<typeof selectReportMetrics>[number]>();

  for (const metric of metrics) {
    const key = metric.metricId || `${metric.displayName}:${metric.formula}`;
    if (!byKey.has(key)) {
      byKey.set(key, metric);
    }
  }

  return Array.from(byKey.values());
}

function dataOverview(metrics: ReturnType<typeof selectReportMetrics>, sourceCount: number) {
  if (metrics.length === 0) {
    return ["当前没有成功计算的指标，数据不足以支持报告生成"];
  }

  return [
    `本次报告基于 ${sourceCount} 个已连接数据源的安全聚合结果生成`,
    `${metrics.length} 个指标完成计算，主页面只展示业务优先级最高的关键指标`,
    "估算值、未去重或口径受限指标会在卡片上单独标记"
  ];
}

function trendAnalysis(modules: BusinessModuleReport[]) {
  const trendModules = modules.filter((module) =>
    module.coreMetrics.some((metric) => /daily|monthly|date|return|volume|close|trend/i.test(`${metric.name} ${metric.formula}`))
  );

  if (trendModules.length === 0) {
    return ["当前数据不足以支持趋势分析：缺少可用时间字段、历史周期或趋势类指标"];
  }

  return trendModules.map((module) =>
    `${module.title}存在可用于趋势观察的指标：${module.coreMetrics.slice(0, 3).map((metric) => `${metric.displayName}=${metric.displayValue}`).join("、")}。需要补充明确时间字段和周期聚合后，再判断增长、下滑或季节性变化`
  );
}

function structureAnalysis(modules: BusinessModuleReport[]) {
  const structured = modules.filter((module) =>
    module.coreMetrics.some((metric) => metric.topRows?.length || /distinct|ratio|category|app|product/i.test(`${metric.name} ${metric.formula}`))
  );

  if (structured.length === 0) {
    return ["当前数据不足以支持结构分析：缺少分组指标或 Top/Bottom 聚合结果"];
  }

  return structured.map((module) =>
    `${module.title}可按 ${skillForBusinessType(module.businessType).breakdownDimensions.slice(0, 3).join("、")} 做结构拆解，优先观察头部集中度和低表现分组`
  );
}

function topObjectAnalysis(modules: BusinessModuleReport[]) {
  const rows = modules.flatMap((module) =>
    module.coreMetrics.filter((metric) => metric.explanation.includes("头部对象")).map((metric) => `${module.title}：${metric.explanation}`)
  );

  return rows.length > 0
    ? rows.slice(0, 6)
    : ["当前数据不足以支持头部对象分析：没有可用的 Top/Bottom 分组结果"];
}

function limitations(metrics: ReturnType<typeof selectReportMetrics>, failedCount: number) {
  const warnings = metrics.flatMap((metric) => metric.warning ? [`${metric.displayName}：${metric.warning}`] : []);

  return [
    failedCount > 0 ? `${failedCount} 个指标计算失败，已从本次报告结论中排除` : "",
    warnings.length > 0 ? warnings.join("；") : "",
    "若缺少时间字段、用户 ID、订单 ID 或业务阈值，报告不会强行生成留存率、转化率、同比环比或异常判断"
  ].filter(Boolean);
}

function selectKeyMetrics(modules: BusinessModuleReport[]) {
  const moduleCount = modules.length;
  const perModuleLimit = moduleCount >= 3 ? 2 : 3;
  const requiredMetrics = modules.flatMap((module) => module.coreMetrics.filter(isRequiredKeyMetric));
  const keyMetrics = uniqueMetrics([
    ...requiredMetrics,
    ...modules.flatMap((module) => module.coreMetrics.slice(0, perModuleLimit))
  ]);

  return keyMetrics.slice(0, 8);
}

function coreSummaryBullets(modules: BusinessModuleReport[], generatedInsights?: GeneratedInsights) {
  if (generatedInsights?.executiveSummary.length) {
    return generatedInsights.executiveSummary.slice(0, 3).map((insight) =>
      insight.summary
    );
  }

  const bullets = modules.flatMap((module) =>
    module.metricExplanation.slice(0, 2).map((item) => item)
  );

  return bullets.slice(0, 3);
}

function keyFindings(modules: BusinessModuleReport[], generatedInsights?: GeneratedInsights) {
  if (generatedInsights?.keyFindings.length) {
    return generatedInsights.keyFindings.slice(0, 5).map((insight) =>
      `${insight.title}：${insight.summary}。${insight.businessMeaning}`
    );
  }

  const findings = modules.flatMap((module) =>
    module.metricExplanation.map((item) => item)
  );

  return Array.from(new Set(findings)).slice(0, 5);
}

function recommendationsFromInsights(generatedInsights?: GeneratedInsights) {
  return generatedInsights?.recommendedActions.map((action) => ({
    title: action.title,
    type: action.type,
    basedOn: action.basedOn.join("、") || "结构化洞察",
    action: action.action,
    reason: action.expectedOutcome,
    priorityDimension: action.referencedFields?.slice(0, 3).join("、") || action.suggestedBreakdowns?.slice(0, 3).join("、") || "关键业务维度",
    priority: action.priority === "high" ? "High" as const : action.priority === "low" ? "Low" as const : "Medium" as const,
    referencedObjects: action.referencedObjects,
    referencedFields: action.referencedFields
  })) ?? [];
}

function limitationsWithAggregations(
  metrics: ReturnType<typeof selectReportMetrics>,
  failedCount: number,
  aggregationResults?: AggregationResult[],
  generatedInsights?: GeneratedInsights
) {
  return [
    ...limitations(metrics, failedCount),
    ...(generatedInsights?.dataLimitations.map((item) => item.message) ?? []),
    ...(aggregationResults?.flatMap((aggregation) => aggregation.warnings.map((warning) =>
      `${aggregation.datasetName}：${warning.message}`
    )) ?? [])
  ];
}

export function buildStructuredAiReport({
  dataSourceCount,
  metricResults,
  metrics,
  aggregationResults
}: {
  dataSourceCount: number;
  metricResults: ReportMetricResultInput[];
  metrics: ReportMetricDefinitionInput[];
  aggregationResults?: AggregationResult[];
}): StructuredAiReport {
  const selectedMetrics = selectReportMetrics({ metricResults, metrics });
  const modules = buildModuleReports(selectedMetrics);
  const failedCount = metricResults.filter((result) => result.status === "failed").length;
  const coreMetricOverview = selectKeyMetrics(modules);
  const generatedInsights = generateStructuredInsights({
    selectedMetrics,
    metricResults,
    aggregationResults: aggregationResults ?? []
  });
  const insightRecommendations = recommendationsFromInsights(generatedInsights);

  return {
    title: "AI 数据分析报告",
    generatedAt: new Date().toISOString(),
    coreSummary: buildCoreSummary(modules),
    coreSummaryBullets: coreSummaryBullets(modules, generatedInsights),
    dataOverview: dataOverview(selectedMetrics, dataSourceCount),
    coreMetricOverview,
    keyFindings: keyFindings(modules, generatedInsights),
    modules,
    trendAnalysis: trendAnalysis(modules),
    structureAnalysis: structureAnalysis(modules),
    topObjectAnalysis: topObjectAnalysis(modules),
    risks: [],
    opportunities: [],
    risksAndOpportunities: [],
    businessRisks: generatedInsights.businessRisks,
    growthOpportunities: generatedInsights.growthOpportunities,
    dataLimitations: generatedInsights.dataLimitations,
    recommendations: insightRecommendations.length ? insightRecommendations : generateRecommendations(modules),
    limitations: limitationsWithAggregations(selectedMetrics, failedCount, aggregationResults, generatedInsights),
    evidence: [
      ...coreMetricOverview.map((metric) =>
        `${metric.displayName}: ${metric.displayValue}；公式：${metric.formula}；口径：${metric.grain}`
      ),
      ...(aggregationResults?.flatMap((aggregation) => [
        ...aggregation.groupBys.slice(0, 2).map((groupBy) =>
          `${aggregation.datasetName} 已生成 ${groupBy.title}，包含 ${groupBy.rows.length} 个分组`
        ),
        ...aggregation.topRankings.slice(0, 2).map((ranking) =>
          `${aggregation.datasetName} 已生成 ${ranking.title}，包含 ${ranking.rows.length} 个对象`
        )
      ]) ?? [])
    ],
    aggregationResults,
    generatedInsights
  };
}
