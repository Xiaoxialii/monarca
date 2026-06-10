import { detectIndustry } from "@/lib/metric-generation/industry-detector";
import { normalizeMetricToken } from "@/lib/metric-generation/metric-safety-rules";
import type { MetricColumnType, MetricGenerationInput } from "@/lib/metric-generation/metric-types";
import type {
  DataQualityIssue,
  ReportInputTable,
  ReportMetric,
  UniversalDataAnalysisReport
} from "@/lib/report-generation/report-types";

type ColumnProfile = {
  name: string;
  normalizedName: string;
  type: MetricColumnType;
  missingCount: number;
  nonEmptyCount: number;
  numericValues: number[];
  dateValues: Date[];
  topValues: Array<{ value: string; count: number; ratio: number }>;
};

const scenarioLabels: Record<string, string> = {
  app_marketplace: "App / 产品市场分析",
  ecommerce: "电商 / 订单分析",
  saas: "SaaS / 订阅分析",
  finance_stock: "股票 / 金融时序分析",
  ads: "广告投放分析",
  content: "内容平台分析",
  crm_sales: "CRM / 销售分析",
  support: "客服 / 工单分析",
  logistics: "物流 / 履约分析",
  hr: "人力资源分析",
  review_sentiment: "用户评论 / 情绪分析",
  unknown: "通用业务数据分析"
};

function tableKey(table: ReportInputTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function toMetricColumnType(type: string): MetricColumnType {
  const normalized = type.toLowerCase();

  if (["int", "decimal", "double", "float", "number", "numeric", "real"].some((keyword) => normalized.includes(keyword))) {
    return "number";
  }

  if (["date", "time", "timestamp"].some((keyword) => normalized.includes(keyword))) {
    return "date";
  }

  if (["bool", "bit"].some((keyword) => normalized.includes(keyword))) {
    return "boolean";
  }

  if (["char", "text", "string", "varchar"].some((keyword) => normalized.includes(keyword))) {
    return "string";
  }

  return "unknown";
}

function toMetricInput(tables: ReportInputTable[]): MetricGenerationInput {
  return {
    tables: tables.map((table) => ({
      tableName: tableKey(table),
      rowCount: table.rowCount,
      sampleRows: table.sampleRows,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: toMetricColumnType(String(column.type)),
        nullable: column.nullable
      }))
    }))
  };
}

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim().toLowerCase();
  if (!raw || ["nan", "null", "undefined", "n/a", "na", "none"].includes(raw)) {
    return null;
  }

  const cleaned = value.replace(/[$,%+,\s]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  if (Math.abs(value) < 1 && value !== 0) {
    return value.toFixed(3);
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fieldValue(row: Record<string, unknown>, columnName: string) {
  if (columnName in row) {
    return row[columnName];
  }

  const normalizedColumn = normalizeMetricToken(columnName);
  const match = Object.keys(row).find((key) => normalizeMetricToken(key) === normalizedColumn);
  return match ? row[match] : undefined;
}

function profileColumns(table: ReportInputTable): ColumnProfile[] {
  const rows = table.sampleRows ?? [];

  return table.columns.map((column) => {
    const type = toMetricColumnType(String(column.type));
    const counts = new Map<string, number>();
    const numericValues: number[] = [];
    const dateValues: Date[] = [];
    let missingCount = 0;

    for (const row of rows) {
      const rawValue = fieldValue(row, column.name);
      const stringValue = rawValue == null ? "" : String(rawValue).trim();

      if (!stringValue) {
        missingCount += 1;
        continue;
      }

      counts.set(stringValue, (counts.get(stringValue) ?? 0) + 1);

      const numericValue = parseNumber(rawValue);
      if (numericValue !== null) {
        numericValues.push(numericValue);
      }

      const dateValue = parseDateValue(rawValue);
      if (dateValue) {
        dateValues.push(dateValue);
      }
    }

    const nonEmptyCount = Math.max(0, rows.length - missingCount);

    return {
      name: column.name,
      normalizedName: normalizeMetricToken(column.name),
      type,
      missingCount,
      nonEmptyCount,
      numericValues,
      dateValues,
      topValues: Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({
          value,
          count,
          ratio: nonEmptyCount > 0 ? count / nonEmptyCount : 0
        }))
    };
  });
}

function findProfile(profiles: ColumnProfile[], signals: string[]) {
  const normalizedSignals = signals.map(normalizeMetricToken);
  const exact = normalizedSignals
    .map((signal) => profiles.find((profile) => profile.normalizedName === signal))
    .find(Boolean);

  if (exact) {
    return exact;
  }

  return normalizedSignals
    .map((signal) => profiles.find((profile) => profile.normalizedName.includes(signal)))
    .find(Boolean);
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function minMax(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return { min: Math.min(...values), max: Math.max(...values) };
}

function addMetric(metrics: ReportMetric[], label: string, value: string, explanation: string) {
  metrics.push({ label, value, explanation });
}

function buildCoreMetrics(industry: string, table: ReportInputTable, profiles: ColumnProfile[]) {
  const metrics: ReportMetric[] = [];
  const rowCount = table.rowCount ?? table.sampleRows?.length ?? 0;

  addMetric(metrics, "总记录数", formatNumber(rowCount), "当前数据集中可用于分析的记录规模");

  if (industry === "finance_stock") {
    const close = findProfile(profiles, ["close"]);
    const volume = findProfile(profiles, ["volume"]);
    const date = findProfile(profiles, ["date", "timestamp", "price"]);

    if (close?.numericValues.length) {
      const range = minMax(close.numericValues);
      const first = close.numericValues[0];
      const latest = close.numericValues.at(-1);
      const change = first && latest != null ? (latest - first) / first : null;
      addMetric(metrics, "平均收盘价", formatNumber(average(close.numericValues) ?? 0), "观察期内收盘价的平均水平");
      if (range) addMetric(metrics, "价格区间", `${formatNumber(range.min)} - ${formatNumber(range.max)}`, "观察期内最低与最高收盘价");
      if (change !== null) addMetric(metrics, "区间涨跌幅", formatPercent(change), "最新收盘价相对起始收盘价的变化");
    }

    if (volume?.numericValues.length) {
      addMetric(metrics, "平均成交量", formatNumber(average(volume.numericValues) ?? 0), "观察期内成交量均值");
    }

    if (date?.dateValues.length) {
      const sorted = [...date.dateValues].sort((a, b) => a.getTime() - b.getTime());
      addMetric(metrics, "时间范围", `${sorted[0].toISOString().slice(0, 10)} - ${sorted.at(-1)?.toISOString().slice(0, 10)}`, "数据覆盖的时间窗口");
    }
  }

  if (industry === "app_marketplace") {
    const app = findProfile(profiles, ["app", "product"]);
    const rating = findProfile(profiles, ["rating", "score"]);
    const reviews = findProfile(profiles, ["reviews", "review_count"]);
    const installs = findProfile(profiles, ["installs", "downloads"]);
    const price = findProfile(profiles, ["price"]);

    if (app) addMetric(metrics, "App 数量", formatNumber(new Set(app.topValues.map((item) => item.value)).size || rowCount), "产品或 App 维度的规模");
    if (rating?.numericValues.length) addMetric(metrics, "平均评分", formatNumber(average(rating.numericValues) ?? 0), "衡量整体产品质量和用户评价");
    if (reviews?.numericValues.length) addMetric(metrics, "评论总量", formatNumber(sum(reviews.numericValues)), "反映市场反馈规模");
    if (installs?.numericValues.length) addMetric(metrics, "安装总量", formatNumber(sum(installs.numericValues)), "反映整体触达和采用规模");
    if (price?.numericValues.length) addMetric(metrics, "平均价格", formatNumber(average(price.numericValues) ?? 0), "价格字段代表标价，不等同真实收入");
  }

  if (industry === "review_sentiment") {
    const sentiment = findProfile(profiles, ["sentiment"]);
    const polarity = findProfile(profiles, ["sentiment_polarity", "polarity"]);

    if (sentiment) {
      const positive = sentiment.topValues.find((item) => normalizeMetricToken(item.value).includes("positive"));
      const negative = sentiment.topValues.find((item) => normalizeMetricToken(item.value).includes("negative"));
      if (positive) addMetric(metrics, "正向评论占比", formatPercent(positive.ratio), "正向反馈在评论中的占比");
      if (negative) addMetric(metrics, "负向评论占比", formatPercent(negative.ratio), "负向反馈在评论中的占比");
    }

    if (polarity?.numericValues.length) {
      addMetric(metrics, "平均情绪分数", formatNumber(average(polarity.numericValues) ?? 0), "情绪倾向的平均水平");
    }
  }

  for (const profile of profiles.filter((item) => item.numericValues.length > 0).slice(0, 4)) {
    if (metrics.some((metric) => normalizeMetricToken(metric.label).includes(profile.normalizedName))) {
      continue;
    }

    addMetric(metrics, `${profile.name} 平均值`, formatNumber(average(profile.numericValues) ?? 0), `字段 ${profile.name} 的样本平均水平`);
  }

  return metrics.slice(0, 10);
}

function dataQuality(table: ReportInputTable, profiles: ColumnProfile[]) {
  const issues: DataQualityIssue[] = [];
  const sampleSize = table.sampleRows?.length ?? 0;

  for (const profile of profiles) {
    if (sampleSize > 0 && profile.missingCount / sampleSize > 0.2) {
      issues.push({
        issue: `${profile.name} 缺失率较高`,
        impact: "可能影响该维度下的分布判断和指标稳定性"
      });
    }
  }

  if (sampleSize === 0) {
    issues.push({
      issue: "当前只保存了字段结构，缺少样本数据",
      impact: "只能生成结构型报告，无法输出真实数值洞察"
    });
  }

  return issues;
}

function structuralFindings(table: ReportInputTable, profiles: ColumnProfile[]) {
  const findings: string[] = [];
  const categoryProfiles = profiles.filter((profile) => profile.topValues.length > 1 && profile.topValues.length <= 5);

  for (const profile of categoryProfiles.slice(0, 3)) {
    const top = profile.topValues[0];
    if (top) {
      findings.push(`${profile.name} 中「${top.value}」占比最高，约为 ${formatPercent(top.ratio)}`);
    }
  }

  const numericProfiles = profiles.filter((profile) => profile.numericValues.length > 0);
  for (const profile of numericProfiles.slice(0, 2)) {
    const range = minMax(profile.numericValues);
    if (range) {
      findings.push(`${profile.name} 的样本范围为 ${formatNumber(range.min)} 到 ${formatNumber(range.max)}`);
    }
  }

  return findings.length > 0 ? findings : [`${table.name} 当前可用于基础结构分析，但需要更多样本或聚合结果支持深度洞察`];
}

export function generateUniversalDataAnalysisReport(tables: ReportInputTable[]): UniversalDataAnalysisReport {
  const metricInput = toMetricInput(tables);
  const detectedIndustry = detectIndustry(metricInput);
  const primaryTable = tables[0] ?? { name: "dataset", columns: [] };
  const profiles = profileColumns(primaryTable);
  const qualityIssues = dataQuality(primaryTable, profiles);
  const coreMetrics = buildCoreMetrics(detectedIndustry.primary, primaryTable, profiles);
  const tableRows = primaryTable.rowCount ?? primaryTable.sampleRows?.length ?? 0;
  const scenarioLabel = scenarioLabels[detectedIndustry.primary] ?? scenarioLabels.unknown;
  const hasDate = Boolean(findProfile(profiles, ["date", "created_at", "updated_at", "timestamp", "time"]));
  const numericProfiles = profiles.filter((profile) => profile.numericValues.length > 0);
  const categoryProfiles = profiles.filter((profile) => profile.topValues.length > 1);
  const structureFindings = structuralFindings(primaryTable, profiles);

  return {
    title: "数据分析报告",
    generatedAt: new Date().toISOString(),
    detectedScenario: {
      primary: detectedIndustry.primary,
      label: scenarioLabel,
      confidence: detectedIndustry.confidence,
      reasons: detectedIndustry.reasons
    },
    overview: tables.map((table) => ({
      dataset: tableKey(table),
      originalRows: table.rowCount ?? table.sampleRows?.length ?? 0,
      cleanedRows: table.rowCount ?? table.sampleRows?.length ?? 0,
      fieldCount: table.columns.length,
      mainContent: scenarioLabel,
      dataQuality: qualityIssues.length > 0 ? qualityIssues.map((issue) => issue.issue).join("；") : "未发现明显结构性质量问题"
    })),
    coreMetrics,
    businessQuestions: {
      canAnswer: [
        "当前数据的整体规模和主要分布是什么",
        "哪些字段或分类值得优先关注",
        "哪些数值字段存在明显高低差异"
      ],
      cannotAnswer: hasDate
        ? ["无法判断未接入字段之外的外部原因"]
        : ["缺少时间字段时，无法稳定分析趋势和周期变化", "无法判断未接入字段之外的外部原因"]
    },
    overallAnalysis: [
      `当前数据更接近「${scenarioLabel}」场景，样本记录数约 ${formatNumber(tableRows)}，字段数 ${primaryTable.columns.length}`,
      coreMetrics.length > 1
        ? `核心指标已经覆盖 ${coreMetrics.slice(0, 4).map((metric) => metric.label).join("、")} 等方向`
        : "当前可用指标较少，建议继续补充可计算字段或样本数据"
    ],
    trendAnalysis: hasDate
      ? ["数据包含时间字段，可以继续按日、周或月生成趋势、峰值和低谷分析"]
      : ["当前未识别到稳定时间字段，暂时无法生成可靠趋势分析"],
    structureAnalysis: structureFindings,
    topObjectAnalysis: categoryProfiles.slice(0, 3).flatMap((profile) => {
      const top = profile.topValues[0];
      return top ? [`${profile.name} 的头部值是「${top.value}」，占比约 ${formatPercent(top.ratio)}`] : [];
    }),
    risks: [
      ...qualityIssues.map((issue) => `${issue.issue}：${issue.impact}`),
      ...(numericProfiles.length === 0 ? ["当前缺少可计算数值字段，报告无法输出稳定的业务指标"] : [])
    ].slice(0, 5),
    opportunities: [
      ...structureFindings.slice(0, 3).map((finding) => `基于「${finding}」做分组对比，可以找到更具体的业务机会`),
      hasDate ? "基于时间字段建立周期监控，可以识别异常波动和阶段性变化" : "补充时间字段后，可以建立周期性经营监控"
    ].slice(0, 5),
    conclusions: [
      `数据已被识别为「${scenarioLabel}」场景`,
      numericProfiles.length > 0 ? "数据中存在可用于计算核心指标的数值字段" : "当前数据更偏结构或文本，需要更多数值字段支撑量化分析",
      categoryProfiles.length > 0 ? "数据具备类别拆解能力，可以做结构分布分析" : "当前类别维度较少，结构拆解空间有限"
    ],
    recommendations: [
      "优先确认核心指标口径，避免后续报告使用错误公式",
      hasDate ? "按时间窗口建立趋势监控和异常检测" : "补充日期或时间字段，以便生成趋势分析",
      categoryProfiles.length > 0 ? "优先拆解占比最高的类别或对象，识别头部贡献和集中风险" : "补充产品、客户、渠道或地区等维度字段"
    ],
    nextAnalysisDirections: [
      "生成通过校验的指标结果",
      "对 Top / Bottom 维度进行进一步拆解",
      "将报告结果接入 AI Brief 和报表页"
    ],
    evidence: [
      `数据集：${tableKey(primaryTable)}`,
      `可用数据列（详情）：${primaryTable.columns.map((column) => column.name).slice(0, 12).join("、")}`,
      `场景判断依据：${detectedIndustry.reasons.slice(0, 5).join("；") || "通用字段结构"}`
    ],
    dataQualityIssues: qualityIssues
  };
}
