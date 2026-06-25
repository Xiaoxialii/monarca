import { interpretKpis, type KpiDirection, type KpiSemanticLabel, type KpiChangeType } from "@/lib/kpi-interpretation";
import { explainKpi, type KpiExplanation } from "@/lib/kpi-explanation";
import { buildKpiFrameworkTree, diagnoseQualityKpis, type KpiFrameworkTree, type QualityKpiDiagnostics } from "@/lib/kpi-framework";

type ReportSpecMetricResult = {
  metricId?: string | null;
  registryMetricId?: string | null;
  metricName?: string | null;
  displayName?: string | null;
  value?: unknown;
  currentValue?: unknown;
  previousValue?: unknown;
  rows?: unknown;
  status?: string | null;
  formula?: string | null;
  metricCategory?: string | null;
  businessType?: string | null;
  priority?: number | null;
  isBusinessMetric?: boolean | null;
  isDiagnosticMetric?: boolean | null;
  isInternalMetric?: boolean | null;
  warning?: string | null;
  definition?: string | null;
};

type DomainRegistryMetric = {
  metricId?: string | null;
  businessName?: string | null;
  displayName?: string | null;
  priority?: number | null;
  category?: string | null;
};

type ReportSpecKpi = {
  key: string;
  label: string;
  value: number;
  change: string;
  change_pct: number | null;
  change_type: KpiChangeType;
  raw_change: number | null;
  trend: "up" | "down" | "flat" | null;
  semantic_label: KpiSemanticLabel;
  insight: string;
  interpretation: string;
  explanation: KpiExplanation;
};

type ReportSpecSection =
  | { type: "kpi_grid" }
  | { type: "dimension_analysis"; title: string; dimensions: string[] }
  | { type: "insights"; items: string[] }
  | { type: "risks"; items: string[] }
  | { type: "opportunities"; items: string[] }
  | { type: "actions"; items: string[] };

export type ReportSpec = {
  domain: string;
  kpis: ReportSpecKpi[];
  kpi_framework: KpiFrameworkTree;
  quality_diagnostics: QualityKpiDiagnostics;
  sections: ReportSpecSection[];
};

type ReportSpecInput = {
  schemaSnapshot: unknown;
  domain: string;
  metricResults: ReportSpecMetricResult[];
  domainRegistry?: DomainRegistryMetric[];
  scoringModel?: unknown;
  impactModel?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, "");
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricKey(metric: ReportSpecMetricResult | DomainRegistryMetric) {
  return normalize(String(
    ("registryMetricId" in metric ? metric.registryMetricId : null) ??
    metric.metricId ??
    ("metricName" in metric ? metric.metricName : null) ??
    ""
  ));
}

function metricLabel(metric: ReportSpecMetricResult | DomainRegistryMetric) {
  return String(
    ("businessName" in metric ? metric.businessName : null) ??
    metric.displayName ??
    ("metricName" in metric ? metric.metricName : null) ??
    metric.metricId ??
    metricKey(metric)
  );
}

function metricCurrentValue(metric: ReportSpecMetricResult) {
  return numericValue(metric.currentValue ?? metric.value);
}

function metricPreviousValue(metric: ReportSpecMetricResult) {
  return numericValue(metric.previousValue);
}

function metricChange(metric: ReportSpecMetricResult) {
  const current = metricCurrentValue(metric);
  const previous = metricPreviousValue(metric);
  return current == null || previous == null ? null : current - previous;
}

function trendFromChange(change: number | null): ReportSpecKpi["trend"] {
  if (change == null) return null;
  if (Math.abs(change) < 1e-9) return "flat";
  return change > 0 ? "up" : "down";
}

function registryPriorityMap(registry: DomainRegistryMetric[] = []) {
  const map = new Map<string, number>();
  for (const metric of registry) {
    const key = metricKey(metric);
    if (!key) continue;
    map.set(key, typeof metric.priority === "number" ? metric.priority : 999);
  }
  return map;
}

function scoringMetricKeys(scoringModel: unknown) {
  const model = asRecord(scoringModel);
  const rules = Array.isArray(model.rules) ? model.rules : [];
  const keys = new Set<string>();
  for (const rule of rules) {
    const metrics = Array.isArray(asRecord(rule).metrics) ? asRecord(rule).metrics as unknown[] : [];
    for (const metric of metrics) {
      const key = normalize(String(asRecord(metric).metric_key ?? ""));
      if (key) keys.add(key);
    }
  }
  return keys;
}

function impactPriorityMap(impactModel: unknown) {
  const model = asRecord(impactModel);
  const metrics = Array.isArray(model.metrics) ? model.metrics : [];
  const map = new Map<string, number>();
  for (const metric of metrics) {
    const record = asRecord(metric);
    const key = normalize(String(record.metric_key ?? ""));
    if (!key) continue;
    const sensitivity = String(record.kpi_sensitivity ?? "");
    map.set(key, sensitivity === "high" ? 0 : sensitivity === "medium" ? 1 : 2);
  }
  return map;
}

function impactDirectionMap(impactModel: unknown) {
  const model = asRecord(impactModel);
  const metrics = Array.isArray(model.metrics) ? model.metrics : [];
  const map = new Map<string, string>();
  for (const metric of metrics) {
    const record = asRecord(metric);
    const key = normalize(String(record.metric_key ?? ""));
    const direction = String(record.impact_direction ?? "");
    if (key && direction) map.set(key, direction);
  }
  return map;
}

function kpiDirection(metric: ReportSpecMetricResult, impactDirections: Map<string, string>): KpiDirection {
  const key = metricKey(metric);
  const text = `${key} ${metricLabel(metric)}`;
  const impactDirection = impactDirections.get(key);

  if (impactDirection === "negative") return "lower_is_better";
  if (impactDirection === "positive") return "higher_is_better";
  if (/loss|unresolved|complaint|failed|error|rework|repeat|cancel|churn|退货|失败|错误|投诉|未解决|失分|重复|取消/.test(text)) return "lower_is_better";
  if (/revenue|sales|orders|resolved|completed|success|score|rating|收入|销售|订单|解决|完成|成功|得分|评分/.test(text)) return "higher_is_better";
  return "unknown";
}

function metricImportanceScore({
  metric,
  registryPriorities,
  scoringKeys,
  impactPriorities,
  domain
}: {
  metric: ReportSpecMetricResult;
  registryPriorities: Map<string, number>;
  scoringKeys: Set<string>;
  impactPriorities: Map<string, number>;
  domain: string;
}) {
  const key = metricKey(metric);
  const text = `${key} ${metricLabel(metric)}`;
  let score = 1000;

  if (registryPriorities.has(key)) score = Math.min(score, (registryPriorities.get(key) ?? 999) * 10);
  if (scoringKeys.has(key)) score -= 180;
  if (impactPriorities.has(key)) score -= 140 - (impactPriorities.get(key) ?? 2) * 40;
  if (metricChange(metric) != null) score -= 60;
  if (/rate|score|margin|conversion|retention|churn|率|得分|分/.test(text)) score -= 30;
  if (domain === "ecommerce" && /revenue|sales|paid|orders|profit|margin|净销售|销售|订单|利润/.test(text)) score -= 120;

  return score;
}

function selectedKpis(input: ReportSpecInput): ReportSpecKpi[] {
  const registryPriorities = registryPriorityMap(input.domainRegistry);
  const scoringKeys = scoringMetricKeys(input.scoringModel);
  const impactPriorities = impactPriorityMap(input.impactModel);
  const impactDirections = impactDirectionMap(input.impactModel);
  const candidates = input.metricResults
    .filter((metric) => !metric.status || metric.status === "computed")
    .filter((metric) => metric.isBusinessMetric !== false && !metric.isDiagnosticMetric && !metric.isInternalMetric)
    .flatMap((metric) => {
      const value = metricCurrentValue(metric);
      const previous = metricPreviousValue(metric);
      const key = metricKey(metric);
      if (value == null || previous == null || !key) return [];
      const rawChange = metricChange(metric);
      const direction = kpiDirection(metric, impactDirections);
      const interpretation = interpretKpis([{
        name: metricLabel(metric),
        today: value,
        yesterday: previous,
        higher_is_better: direction === "unknown" ? null : direction === "higher_is_better"
      }]).results[0];
      const explanation = explainKpi({
        name: metricLabel(metric),
        today: value,
        yesterday: previous,
        change_pct: interpretation.change_pct,
        definition: metric.definition,
        formula: metric.formula,
        direction: direction === "unknown" ? null : direction
      });
      return [{
        metric,
        kpi: {
          key,
          label: metricLabel(metric),
          value,
          change: interpretation.change,
          change_pct: interpretation.change_pct,
          change_type: interpretation.change_type,
          raw_change: rawChange,
          trend: trendFromChange(rawChange),
          semantic_label: interpretation.semantic_label,
          insight: interpretation.insight,
          interpretation: interpretation.interpretation,
          explanation
        }
      }];
    })
    .sort((left, right) =>
      metricImportanceScore({
        metric: left.metric,
        registryPriorities,
        scoringKeys,
        impactPriorities,
        domain: input.domain
      }) - metricImportanceScore({
        metric: right.metric,
        registryPriorities,
        scoringKeys,
        impactPriorities,
        domain: input.domain
      })
    );

  return candidates.slice(0, Math.min(8, Math.max(3, candidates.length))).map((item) => item.kpi);
}

function schemaColumns(schemaSnapshot: unknown) {
  const schema = asRecord(schemaSnapshot);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];
  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const columns = Array.isArray(tableRecord.columns) ? tableRecord.columns : [];
    return columns.flatMap((column) => {
      const columnRecord = asRecord(column);
      const name = typeof columnRecord.name === "string" ? columnRecord.name : "";
      if (!name) return [];
      return [{
        name,
        displayName: typeof columnRecord.displayName === "string" ? columnRecord.displayName : name,
        type: typeof columnRecord.type === "string" ? columnRecord.type : "unknown"
      }];
    });
  });
}

function inferDimensions(schemaSnapshot: unknown, domain: string) {
  const columns = schemaColumns(schemaSnapshot);
  const hasColumn = (patterns: RegExp[]) => columns.find((column) =>
    patterns.some((pattern) => pattern.test(`${column.name} ${column.displayName}`))
  )?.name ?? null;
  const preferred = domain === "ecommerce"
    ? [
        hasColumn([/product|sku|商品/i]),
        hasColumn([/channel|渠道/i]),
        hasColumn([/category|品类|类别/i])
      ]
    : domain === "logistics" || domain === "logistics_service_kpi"
      ? [
          hasColumn([/branch|网点|责任网点/i]),
          hasColumn([/ticket_type|工单类型/i]),
          hasColumn([/region|province|省区|区域/i])
        ]
      : [];
  const fallback = columns
    .filter((column) => /char|text|string|unknown/i.test(column.type))
    .map((column) => column.name)
    .filter((name) => !/id$|_id$|date|time|email|phone|url/i.test(name));

  return Array.from(new Set([...preferred.filter((item): item is string => Boolean(item)), ...fallback])).slice(0, 5);
}

function sortedMovements(metricResults: ReportSpecMetricResult[]) {
  return metricResults
    .filter((metric) => !metric.status || metric.status === "computed")
    .flatMap((metric) => {
      const change = metricChange(metric);
      if (change == null) return [];
      return [{ metric, change }];
    });
}

function insightItems(metricResults: ReportSpecMetricResult[]) {
  const movements = sortedMovements(metricResults);
  const positive = [...movements].filter((item) => item.change > 0).sort((left, right) => right.change - left.change)[0];
  const negative = [...movements].filter((item) => item.change < 0).sort((left, right) => left.change - right.change)[0];
  const anomaly = [...movements].sort((left, right) => Math.abs(right.change) - Math.abs(left.change))[0];
  return [
    positive ? `${metricLabel(positive.metric)} increased by ${positive.change}.` : null,
    negative ? `${metricLabel(negative.metric)} decreased by ${Math.abs(negative.change)}.` : null,
    anomaly ? `${metricLabel(anomaly.metric)} had the largest movement among computed metrics.` : null
  ].filter((item): item is string => Boolean(item)).slice(0, 3);
}

function riskItems(metricResults: ReportSpecMetricResult[]) {
  const negative = sortedMovements(metricResults)
    .filter((item) => item.change < 0)
    .sort((left, right) => left.change - right.change)
    .slice(0, 3)
    .map((item) => `${metricLabel(item.metric)} is degrading; change ${item.change}.`);
  const failed = metricResults
    .filter((metric) => metric.status && metric.status !== "computed")
    .slice(0, 2)
    .map((metric) => `${metricLabel(metric)} is missing or unstable.`);

  return [...negative, ...failed].slice(0, 5);
}

function opportunityItems(metricResults: ReportSpecMetricResult[]) {
  return sortedMovements(metricResults)
    .filter((item) => item.change > 0)
    .sort((left, right) => right.change - left.change)
    .slice(0, 3)
    .map((item) => `${metricLabel(item.metric)} is improving; extend the operating pattern behind this movement.`);
}

function actionItems(metricResults: ReportSpecMetricResult[], dimensions: string[]) {
  const primaryDimension = dimensions[0] ?? "available dimension";
  const negative = sortedMovements(metricResults)
    .filter((item) => item.change < 0)
    .sort((left, right) => left.change - right.change)
    .slice(0, 3)
    .map((item) => `Review ${metricLabel(item.metric)} by ${primaryDimension} and prioritize the segments contributing to the decline.`);
  const failed = metricResults
    .filter((metric) => metric.status && metric.status !== "computed")
    .slice(0, 2)
    .map((metric) => `Fix the metric input for ${metricLabel(metric)} before relying on this report section.`);

  return [...negative, ...failed].slice(0, 5);
}

export function buildReportSpec(input: ReportSpecInput): ReportSpec {
  const domain = normalize(input.domain) === "logistics_service_kpi" ? "logistics" : input.domain || "generic";
  const kpis = selectedKpis({ ...input, domain });
  const dimensions = inferDimensions(input.schemaSnapshot, domain);
  const frameworkKpis = input.metricResults
    .filter((metric) => !metric.status || metric.status === "computed")
    .filter((metric) => metric.isBusinessMetric !== false && !metric.isInternalMetric)
    .flatMap((metric) => {
      const name = metricLabel(metric);
      const value = metricCurrentValue(metric);
      if (!name || value == null) return [];
      return [{
        name,
        value,
        today: value,
        yesterday: metricPreviousValue(metric),
        definition: metric.definition ?? null
      }];
    });

  return {
    domain,
    kpis,
    kpi_framework: buildKpiFrameworkTree(frameworkKpis),
    quality_diagnostics: diagnoseQualityKpis(frameworkKpis),
    sections: [
      { type: "kpi_grid" },
      {
        type: "dimension_analysis",
        title: "Dimension Analysis",
        dimensions
      },
      {
        type: "insights",
        items: insightItems(input.metricResults)
      },
      {
        type: "risks",
        items: riskItems(input.metricResults)
      },
      {
        type: "opportunities",
        items: opportunityItems(input.metricResults)
      },
      {
        type: "actions",
        items: actionItems(input.metricResults, dimensions)
      }
    ]
  };
}
