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

type ReportLocale = "en" | "zh";

function joinList(items: string[], locale: ReportLocale) {
  return items.join(locale === "zh" ? "、" : ", ");
}

function cjkText(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function safeLocaleText(text: string | undefined, fallback: string, locale: ReportLocale) {
  const value = text?.trim();

  if (!value) return fallback;
  if (locale === "en" && cjkText(value)) return fallback;

  return value;
}

function buildModuleReports(selectedMetrics: ReturnType<typeof selectReportMetrics>, locale: ReportLocale): BusinessModuleReport[] {
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
      summary: locale === "zh"
        ? buildModuleSummary(skill.title, coreMetrics)
        : `${skill.title} is summarized from ${coreMetrics.length} validated business metrics.`,
      coreMetrics,
      metricExplanation: locale === "zh"
        ? coreMetrics.map(metricBusinessInsight)
        : coreMetrics.map((metric) => `${metric.displayName} is ${metric.displayValue}.`),
      businessMeaning: coreMetrics.map((metric) =>
        locale === "zh"
          ? `${metric.displayName} 为 ${metric.displayValue}，按${metric.grain}解释${skill.title}表现`
          : `${metric.displayName} is ${metric.displayValue}, interpreted at ${metric.grain} grain for ${skill.title}.`
      ),
      risks: risks.length > 0
        ? risks
        : [],
      nextBreakdowns: skill.breakdownDimensions.map((dimension) =>
        locale === "zh"
          ? `按${dimension}拆解 ${coreMetrics[0]?.displayName ?? "核心指标"}`
          : `Break down ${coreMetrics[0]?.displayName ?? "core metrics"} by ${dimension}`
      )
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

function dataOverview(metrics: ReturnType<typeof selectReportMetrics>, sourceCount: number, locale: ReportLocale) {
  if (metrics.length === 0) {
    return [locale === "zh"
      ? "当前没有成功计算的指标，数据不足以支持报告生成"
      : "No successfully computed metrics are available, so the data is not sufficient for report generation."];
  }

  return locale === "zh"
    ? [
      `本次报告基于 ${sourceCount} 个已连接数据源的安全聚合结果生成`,
      `${metrics.length} 个指标完成计算，主页面只展示业务优先级最高的关键指标`,
      "估算值、未去重或口径受限指标会在卡片上单独标记"
    ]
    : [
      `This report is generated from secure aggregations across ${sourceCount} connected data source${sourceCount === 1 ? "" : "s"}.`,
      `${metrics.length} metrics were computed; the main page only highlights the highest-priority business KPIs.`,
      "Estimated, raw, deduplication-limited, or caveated metrics are marked with badges."
    ];
}

function trendAnalysis(modules: BusinessModuleReport[], locale: ReportLocale) {
  const trendModules = modules.filter((module) =>
    module.coreMetrics.some((metric) => /daily|monthly|date|return|volume|close|trend/i.test(`${metric.name} ${metric.formula}`))
  );

  if (trendModules.length === 0) {
    return [locale === "zh"
      ? "当前数据不足以支持趋势分析：缺少可用时间字段、历史周期或趋势类指标"
      : "The current data is not sufficient for trend analysis because no usable time field, historical period, or trend metric is available."];
  }

  return trendModules.map((module) =>
    locale === "zh"
      ? `${module.title}存在可用于趋势观察的指标：${module.coreMetrics.slice(0, 3).map((metric) => `${metric.displayName}=${metric.displayValue}`).join("、")}。需要补充明确时间字段和周期聚合后，再判断增长、下滑或季节性变化`
      : `${module.title} has trend-relevant metrics: ${joinList(module.coreMetrics.slice(0, 3).map((metric) => `${metric.displayName}=${metric.displayValue}`), locale)}. A clear time field and period aggregation are required before making growth, decline, or seasonality claims.`
  );
}

function structureAnalysis(modules: BusinessModuleReport[], locale: ReportLocale) {
  const structured = modules.filter((module) =>
    module.coreMetrics.some((metric) => metric.topRows?.length || /distinct|ratio|category|app|product/i.test(`${metric.name} ${metric.formula}`))
  );

  if (structured.length === 0) {
    return [locale === "zh"
      ? "当前数据不足以支持结构分析：缺少分组指标或 Top/Bottom 聚合结果"
      : "The current data is not sufficient for structure analysis because group metrics or Top/Bottom aggregations are missing."];
  }

  return structured.map((module) =>
    locale === "zh"
      ? `${module.title}可按 ${skillForBusinessType(module.businessType).breakdownDimensions.slice(0, 3).join("、")} 做结构拆解，优先观察头部集中度和低表现分组`
      : `${module.title} can be reviewed by ${joinList(skillForBusinessType(module.businessType).breakdownDimensions.slice(0, 3), locale)}, with attention to concentration and low-performing groups.`
  );
}

function topObjectAnalysis(modules: BusinessModuleReport[], locale: ReportLocale) {
  const rows = modules.flatMap((module) =>
    module.coreMetrics.filter((metric) => metric.explanation.includes("头部对象")).map((metric) => `${module.title}：${metric.explanation}`)
  );

  return rows.length > 0
    ? rows.slice(0, 6)
    : [locale === "zh"
      ? "当前数据不足以支持头部对象分析：没有可用的 Top/Bottom 分组结果"
      : "The current data is not sufficient for top-object analysis because no Top/Bottom grouping result is available."];
}

function limitations(metrics: ReturnType<typeof selectReportMetrics>, failedCount: number, locale: ReportLocale) {
  const warnings = metrics.flatMap((metric) => metric.warning ? [`${metric.displayName}: ${metric.warning}`] : []);

  return [
    failedCount > 0
      ? locale === "zh"
        ? `${failedCount} 个指标计算失败，已从本次报告结论中排除`
        : `${failedCount} metrics failed and were excluded from this report's conclusions.`
      : "",
    warnings.length > 0 ? warnings.join("；") : "",
    locale === "zh"
      ? "若缺少时间字段、用户 ID、订单 ID 或业务阈值，报告不会强行生成留存率、转化率、同比环比或异常判断"
      : "If time fields, user IDs, order IDs, or business thresholds are missing, the report will not force retention, conversion, period comparison, or anomaly conclusions."
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

function zhMetricName(metric: { displayName: string; name?: string }) {
  const raw = `${metric.displayName} ${metric.name ?? ""}`.toLowerCase();

  if (/total\s*customers?|customer\s*count|customers?\s*total|unique\s*customers?/.test(raw)) return "客户总数";
  if (/total\s*orders?|order\s*count|orders?\s*total/.test(raw)) return "订单总数";
  if (/revenue|sales\s*amount|total\s*sales|gmv/.test(raw)) return "销售额";
  if (/\baov\b|average\s*order\s*value|客单价/.test(raw)) return "客单价";
  if (/repeat\s*purchase\s*rate|repurchase|复购/.test(raw)) return "复购率";
  if (/products?|sku|商品/.test(raw)) return "商品数";

  return metric.displayName;
}

function metricValueText(metric?: { displayValue: string }) {
  return metric?.displayValue?.trim();
}

function findMetricByName(metrics: BusinessModuleReport["coreMetrics"], patterns: RegExp[]) {
  return metrics.find((metric) => {
    const text = `${metric.name} ${metric.displayName}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(text));
  });
}

function zhCommerceSummary(module: BusinessModuleReport) {
  if (!["ecommerce", "sales", "orders"].includes(module.businessType)) {
    return null;
  }

  const metrics = module.coreMetrics;
  const customers = findMetricByName(metrics, [/total\s*customers?/, /customer\s*count/, /unique\s*customers?/]);
  const orders = findMetricByName(metrics, [/total\s*orders?/, /order\s*count/]);
  const revenue = findMetricByName(metrics, [/revenue/, /sales\s*amount/, /total\s*sales/, /gmv/]);
  const aov = findMetricByName(metrics, [/\baov\b/, /average\s*order\s*value/]);
  const repeatRate = findMetricByName(metrics, [/repeat\s*purchase\s*rate/, /repurchase/]);
  const product = findMetricByName(metrics, [/products?/, /\bsku\b/]);

  if (customers && orders) {
    const parts = [
      `本次数据覆盖 ${metricValueText(customers)} 位客户和 ${metricValueText(orders)} 笔订单`,
      revenue ? `销售额为 ${metricValueText(revenue)}` : "",
      aov ? `客单价为 ${metricValueText(aov)}` : "",
      repeatRate ? `复购率为 ${metricValueText(repeatRate)}` : ""
    ].filter(Boolean);

    return `${parts.join("，")}，样本规模可以支持基础的电商经营分析。后续可重点分析客户贡献、订单规模、商品表现、复购情况和销售趋势。`;
  }

  if (customers) {
    return `本次数据覆盖 ${metricValueText(customers)} 位客户，可用于分析客户结构、订单贡献和复购情况。`;
  }

  if (orders) {
    return `当前共有 ${metricValueText(orders)} 笔订单，说明数据可以支持订单规模、商品表现和销售趋势分析。`;
  }

  if (revenue) {
    return `当前${zhMetricName(revenue)}为 ${metricValueText(revenue)}，可作为判断销售规模、订单贡献和后续增长趋势的核心入口。`;
  }

  if (aov) {
    return `当前${zhMetricName(aov)}为 ${metricValueText(aov)}，可用于观察客户消费水平，并结合订单数和销售额判断增长质量。`;
  }

  if (repeatRate) {
    return `当前${zhMetricName(repeatRate)}为 ${metricValueText(repeatRate)}，可用于判断客户回购表现和长期经营稳定性。`;
  }

  if (product) {
    return `当前${zhMetricName(product)}为 ${metricValueText(product)}，后续可结合订单和销售额分析商品贡献与头部集中度。`;
  }

  return null;
}

function zhBusinessSummaryForMetric(module: BusinessModuleReport, metric: BusinessModuleReport["coreMetrics"][number]) {
  const label = zhMetricName(metric);
  const value = metric.displayValue;

  if (module.businessType === "ecommerce" || module.businessType === "sales" || module.businessType === "orders") {
    if (label === "客户总数") {
      return `本次数据覆盖 ${value} 位客户，可用于分析客户结构、订单贡献和复购情况。`;
    }

    if (label === "订单总数") {
      return `当前共有 ${value} 笔订单，说明数据可以支持订单规模、商品表现和销售趋势分析。`;
    }

    if (label === "销售额") {
      return `当前销售额为 ${value}，可用于判断销售规模，并结合订单数、客单价和商品表现分析增长来源。`;
    }

    if (label === "客单价") {
      return `当前客单价为 ${value}，反映客户单次消费水平，建议结合订单量和商品结构判断增长质量。`;
    }

    if (label === "复购率") {
      return `当前复购率为 ${value}，反映客户持续购买能力，建议结合客户分层和订单周期分析留存质量。`;
    }
  }

  return `${label}为 ${value}，可作为${module.title}的核心观察点，后续应结合关键业务维度拆解主要贡献来源。`;
}

function coreSummaryBullets(modules: BusinessModuleReport[], generatedInsights: GeneratedInsights | undefined, locale: ReportLocale) {
  if (locale === "zh" && generatedInsights?.executiveSummary.length) {
    return generatedInsights.executiveSummary.slice(0, 3).map((insight) =>
      insight.summary
    );
  }

  const bullets = modules.flatMap((module) =>
    module.metricExplanation.slice(0, 2).map((item) => item)
  );

  if (locale === "en") {
    return modules.flatMap((module) =>
      module.coreMetrics.slice(0, 2).map((metric) =>
        `${metric.displayName} is ${metric.displayValue}, giving a business-level signal for ${module.title}.`
      )
    ).slice(0, 3);
  }

  const commerceSummaries = modules.flatMap((module) => {
    const summary = zhCommerceSummary(module);
    return summary ? [summary] : [];
  });
  const metricSummaries = modules.flatMap((module) =>
    module.coreMetrics.slice(0, 2).map((metric) => zhBusinessSummaryForMetric(module, metric))
  );

  return Array.from(new Set([...commerceSummaries, ...metricSummaries, ...bullets])).slice(0, 3);
}

export function buildZhCoreSummaryBulletsForTest(modules: BusinessModuleReport[]) {
  return coreSummaryBullets(modules, undefined, "zh");
}

function keyFindings(modules: BusinessModuleReport[], generatedInsights: GeneratedInsights | undefined, locale: ReportLocale) {
  if (locale === "zh" && generatedInsights?.keyFindings.length) {
    return generatedInsights.keyFindings.slice(0, 5).map((insight) =>
      `${insight.title}：${insight.summary}。${insight.businessMeaning}`
    );
  }

  if (locale === "en") {
    return modules.flatMap((module) =>
      module.coreMetrics.slice(0, 2).map((metric) =>
        `${metric.displayName} is ${metric.displayValue}. This is the main business signal currently available for ${module.title}.`
      )
    ).slice(0, 5);
  }

  const findings = modules.flatMap((module) =>
    module.metricExplanation.map((item) => item)
  );

  return Array.from(new Set(findings)).slice(0, 5);
}

function recommendationsFromInsights(generatedInsights: GeneratedInsights | undefined, locale: ReportLocale) {
  if (locale === "en") {
    return [];
  }

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
  locale: ReportLocale,
  aggregationResults?: AggregationResult[],
  generatedInsights?: GeneratedInsights
) {
  return [
    ...limitations(metrics, failedCount, locale),
    ...(locale === "zh" ? (generatedInsights?.dataLimitations.map((item) => item.message) ?? []) : []),
    ...(aggregationResults?.flatMap((aggregation) => aggregation.warnings.map((warning) =>
      locale === "zh"
        ? `${aggregation.datasetName}：${warning.message}`
        : `${aggregation.datasetName}: ${safeLocaleText(warning.message, "A caveat exists for this aggregation.", locale)}`
    )) ?? [])
  ];
}

export function buildStructuredAiReport({
  dataSourceCount,
  metricResults,
  metrics,
  aggregationResults,
  locale = "zh"
}: {
  dataSourceCount: number;
  metricResults: ReportMetricResultInput[];
  metrics: ReportMetricDefinitionInput[];
  aggregationResults?: AggregationResult[];
  locale?: ReportLocale;
}): StructuredAiReport {
  const selectedMetrics = selectReportMetrics({ metricResults, metrics });
  const modules = buildModuleReports(selectedMetrics, locale);
  const failedCount = metricResults.filter((result) => result.status === "failed").length;
  const coreMetricOverview = selectKeyMetrics(modules);
  const generatedInsights = generateStructuredInsights({
    selectedMetrics,
    metricResults,
    aggregationResults: aggregationResults ?? []
  });
  const insightRecommendations = recommendationsFromInsights(generatedInsights, locale);
  const localizedCoreSummary = locale === "zh"
    ? buildCoreSummary(modules)
    : modules.length
      ? `This report highlights ${modules.flatMap((module) => module.coreMetrics.slice(0, 2).map((metric) => `${metric.displayName} (${metric.displayValue})`)).slice(0, 4).join(", ")} across ${modules.length} business module${modules.length === 1 ? "" : "s"}.`
      : "No computed business metrics are available yet.";

  return {
    title: locale === "zh" ? "AI 数据分析报告" : "AI Data Analysis Report",
    generatedAt: new Date().toISOString(),
    coreSummary: localizedCoreSummary,
    coreSummaryBullets: coreSummaryBullets(modules, generatedInsights, locale),
    dataOverview: dataOverview(selectedMetrics, dataSourceCount, locale),
    coreMetricOverview,
    keyFindings: keyFindings(modules, generatedInsights, locale),
    modules,
    trendAnalysis: trendAnalysis(modules, locale),
    structureAnalysis: structureAnalysis(modules, locale),
    topObjectAnalysis: topObjectAnalysis(modules, locale),
    risks: [],
    opportunities: [],
    risksAndOpportunities: [],
    businessRisks: generatedInsights.businessRisks,
    growthOpportunities: generatedInsights.growthOpportunities,
    dataLimitations: generatedInsights.dataLimitations,
    recommendations: insightRecommendations.length ? insightRecommendations : locale === "zh" ? generateRecommendations(modules) : [],
    limitations: limitationsWithAggregations(selectedMetrics, failedCount, locale, aggregationResults, generatedInsights),
    evidence: [
      ...coreMetricOverview.map((metric) =>
        locale === "zh"
          ? `${metric.displayName}: ${metric.displayValue}；公式：${metric.formula}；口径：${metric.grain}`
          : `${metric.displayName}: ${metric.displayValue}; formula: ${metric.formula}; grain: ${metric.grain}`
      ),
      ...(aggregationResults?.flatMap((aggregation) => [
        ...aggregation.groupBys.slice(0, 2).map((groupBy) =>
          locale === "zh"
            ? `${aggregation.datasetName} 已生成 ${groupBy.title}，包含 ${groupBy.rows.length} 个分组`
            : `${aggregation.datasetName} includes ${groupBy.title} with ${groupBy.rows.length} groups.`
        ),
        ...aggregation.topRankings.slice(0, 2).map((ranking) =>
          locale === "zh"
            ? `${aggregation.datasetName} 已生成 ${ranking.title}，包含 ${ranking.rows.length} 个对象`
            : `${aggregation.datasetName} includes ${ranking.title} with ${ranking.rows.length} objects.`
        )
      ]) ?? [])
    ],
    aggregationResults,
    generatedInsights
  };
}
