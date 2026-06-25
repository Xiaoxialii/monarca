export type KpiFormulaBreakdownComponent = {
  name: string;
  score: number | null;
  maxScore?: number | null;
  status: "valid" | "missing" | "zero" | "invalid";
};

export type KpiFormulaBreakdown = {
  title: string;
  expressionLabel: string;
  formulaText: string;
  valueText: string;
  resultText: string;
  components: KpiFormulaBreakdownComponent[];
  finalScore: number | null;
  maxScore?: number | null;
  consistencyStatus: "matched" | "mismatched" | "partial" | "missing";
  warning?: string;
};

type MetricLike = Record<string, unknown>;

type FormulaSpec = {
  id: string;
  title: string;
  parentAliases: readonly string[];
  groupAliases: readonly string[];
  maxScore?: number | null;
  components: ReadonlyArray<{
    name: string;
    aliases: readonly string[];
    maxScore?: number | null;
  }>;
};

export const logisticsFormulaBreakdownSpecs = [
  {
    id: "pickup_total",
    title: "散件揽收总得分",
    parentAliases: ["散件揽收总得分", "散件揽收得分"],
    groupAliases: ["散件揽收"],
    maxScore: 20,
    components: [
      { name: "首揽及时率得分", aliases: ["首揽及时率"] },
      { name: "及时揽收率得分", aliases: ["及时揽收率"] },
      { name: "网点取消率得分", aliases: ["网点取消率"] },
      { name: "发件端求助率得分", aliases: ["发件端求助率", "发件端求助"] },
      { name: "淘逆加分得分", aliases: ["淘逆加分"] }
    ]
  },
  {
    id: "timeliness_total",
    title: "时效达成总得分",
    parentAliases: ["时效达成总得分", "时效达成得分"],
    groupAliases: ["时效达成"],
    maxScore: 20,
    components: [
      { name: "交件及时率得分", aliases: ["交件及时率"] },
      { name: "24点签收率(含乡镇)得分", aliases: ["24点签收率(含乡镇)", "24点签收率", "24点签收率含乡镇"] }
    ]
  },
  {
    id: "delivery_total",
    title: "投递规范总得分",
    parentAliases: ["投递规范总得分", "投递规范得分"],
    groupAliases: ["投递规范"],
    maxScore: 30,
    components: [
      { name: "派签求助-外部平台得分", aliases: ["派签求助-外部平台", "派签求助外部平台"] },
      { name: "派签求助-增值件得分", aliases: ["派签求助-增值件", "派签求助增值件"] },
      { name: "遗失破损率得分", aliases: ["遗失破损率"] },
      { name: "拍照签收率最终得分", aliases: ["拍照签收率", "拍照签收率最终得分", "最终得分"] }
    ]
  },
  {
    id: "first_resolution_total",
    title: "工单一次性解决率总分",
    parentAliases: ["工单一次性解决率总分", "工单一次性解决率 总分"],
    groupAliases: ["问题解决"],
    maxScore: 25,
    components: [
      { name: "客户求助得分", aliases: ["客户求助"], maxScore: 13 },
      { name: "网点查件得分", aliases: ["网点查件"], maxScore: 7 },
      { name: "预警工单得分", aliases: ["预警工单"], maxScore: 5 }
    ]
  },
  {
    id: "problem_resolution_total",
    title: "问题解决率总得分",
    parentAliases: ["问题解决率总得分", "问题解决总得分", "问题解决得分"],
    groupAliases: ["问题解决"],
    maxScore: 30,
    components: [
      { name: "网点接通率得分", aliases: ["网点接通率"], maxScore: 5 },
      { name: "工单一次性解决率总分", aliases: ["工单一次性解决率总分", "工单一次性解决率 总分"], maxScore: 25 }
    ]
  },
  {
    id: "adjustment_total",
    title: "加减分项总得分",
    parentAliases: ["加减分项总得分", "加减分总得分", "总减分"],
    groupAliases: ["加减分项", "加减分"],
    maxScore: null,
    components: [
      { name: "申诉率减分", aliases: ["申诉率减分", "申诉率"] },
      { name: "不配合处理减分", aliases: ["不配合处理减分"] },
      { name: "逾期减分", aliases: ["逾期减分"] },
      { name: "内部人员申诉减分", aliases: ["内部人员申诉"] },
      { name: "其他减分", aliases: ["其他减分"] }
    ]
  },
  {
    id: "kpi_total",
    title: "KPI总分",
    parentAliases: ["KPI总分", "kpi_total_score", "total_score"],
    groupAliases: [],
    maxScore: 100,
    components: [
      { name: "散件揽收总得分", aliases: ["散件揽收总得分", "散件揽收得分"], maxScore: 20 },
      { name: "时效达成总得分", aliases: ["时效达成总得分", "时效达成得分"], maxScore: 20 },
      { name: "投递规范总得分", aliases: ["投递规范总得分", "投递规范得分"], maxScore: 30 },
      { name: "问题解决率总得分", aliases: ["问题解决率总得分", "问题解决总得分", "问题解决得分"], maxScore: 30 },
      { name: "加减分项总得分", aliases: ["加减分项总得分", "加减分总得分", "总减分"] }
    ]
  }
] as const satisfies readonly FormulaSpec[];

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compact(value: unknown) {
  return String(value ?? "")
    .replace(/[（(]\s*-?\d+(?:\.\d+)?\s*[)）]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function metricName(metric: MetricLike) {
  return String(metric.kpiName ?? metric.kpi_name ?? metric.displayName ?? metric.metricName ?? metric.kpiId ?? metric.metricId ?? "");
}

function metricTokens(metric: MetricLike) {
  return [
    metric.metricId,
    metric.kpiId,
    metric.metricName,
    metric.kpiName,
    metric.kpi_name,
    metric.displayName
  ].map(compact).filter(Boolean);
}

function metricScoreValue(metric: MetricLike | null | undefined) {
  if (!metric) return null;
  const explicitScore = asNumber(metric.score);
  if (explicitScore != null) return explicitScore;
  return asNumber(metric.currentValue ?? metric.value);
}

function isScoreLikeMetricKey(value: unknown) {
  const key = compact(value);
  return key === "总减分" || /(最终得分|总得分|总分|得分|减分)$/.test(key);
}

function exactMetric(metrics: MetricLike[], aliases: readonly string[]) {
  const targets = new Set(aliases.map(compact).filter(Boolean));
  return metrics.find((metric) => {
    if (metric.status && metric.status !== "computed" && metric.status !== "valid" && metric.status !== "zero") return false;
    return metricTokens(metric).some((token) => targets.has(token));
  }) ?? null;
}

function scoreMetric(metrics: MetricLike[], aliases: readonly string[]) {
  const aliasKeys = aliases.map(compact).filter(Boolean);
  const matched = metrics.find((metric) => {
    if (metric.status && metric.status !== "computed" && metric.status !== "valid" && metric.status !== "zero") return false;
    return metricTokens(metric).some((token) =>
      isScoreLikeMetricKey(token) &&
      aliasKeys.some((alias) => token === alias || token.includes(alias) || alias.includes(token))
    );
  });
  const matchedValue = metricScoreValue(matched);
  if (matchedValue != null) return matchedValue;

  const exact = exactMetric(metrics, aliases);
  if (exact && metricTokens(exact).some(isScoreLikeMetricKey)) {
    const exactValue = metricScoreValue(exact);
    if (exactValue != null) return exactValue;
  }

  return null;
}

function scoreText(value: number | null) {
  return value == null ? "缺失" : value.toFixed(2);
}

function componentStatus(score: number | null): KpiFormulaBreakdownComponent["status"] {
  if (score == null) return "missing";
  if (!Number.isFinite(score)) return "invalid";
  if (score === 0) return "zero";
  return "valid";
}

export function buildKpiFormulaBreakdown(
  spec: FormulaSpec,
  metricResults: MetricLike[]
): KpiFormulaBreakdown {
  const components = spec.components.map((component) => {
    const score = scoreMetric(metricResults, component.aliases);
    return {
      name: component.name,
      score,
      maxScore: component.maxScore ?? null,
      status: componentStatus(score)
    };
  });
  const finalScore = scoreMetric(metricResults, spec.parentAliases);
  const validSum = components.reduce((total, component) => total + (component.score ?? 0), 0);
  const hasMissing = components.some((component) => component.status === "missing" || component.status === "invalid");
  const consistencyStatus: KpiFormulaBreakdown["consistencyStatus"] = finalScore == null
    ? "missing"
    : hasMissing
      ? "partial"
      : Math.abs(validSum - finalScore) <= 0.01
        ? "matched"
        : "mismatched";

  return {
    title: spec.title,
    expressionLabel: spec.title,
    formulaText: `${spec.title} = ${components.map((component) => component.name).join(" + ")}`,
    valueText: `${spec.title} = ${components.map((component) => scoreText(component.score)).join(" + ")}`,
    resultText: `${spec.title} = ${scoreText(finalScore)}`,
    components,
    finalScore,
    maxScore: spec.maxScore ?? null,
    consistencyStatus,
    warning: consistencyStatus === "mismatched"
      ? `子项合计 ${validSum.toFixed(2)} 与父级得分 ${scoreText(finalScore)} 不一致`
      : consistencyStatus === "partial"
        ? "存在缺失子指标，公式只能展示部分拆解"
        : consistencyStatus === "missing"
          ? "父级汇总指标缺失"
          : undefined
  };
}

export function buildKpiFormulaBreakdowns(metricResults: MetricLike[]) {
  return logisticsFormulaBreakdownSpecs
    .map((spec) => buildKpiFormulaBreakdown(spec, metricResults))
    .filter((breakdown) => breakdown.finalScore != null || breakdown.components.some((component) => component.status !== "missing"));
}
