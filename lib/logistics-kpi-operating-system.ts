import type { SchemaTable } from "@/lib/metric-validation";
import type { BusinessMetricDefinition } from "@/lib/metrics/ecommerce-metrics";

type SemanticMetricLike = {
  name?: string | null;
  metricId?: string | null;
  metricKey?: string | null;
  displayName?: string | null;
  businessName?: string | null;
  category?: string | null;
  formula?: string | null;
  requiredFields?: string[] | null;
};

export type LogisticsKpiOperatingSystemInput = {
  schema_snapshot: unknown;
  semantic_metrics: SemanticMetricLike[];
  business_metric_registry: BusinessMetricDefinition[];
  raw_excel_sample: Array<Record<string, unknown>>;
  workspace_id: string;
};

type MetricTreeMetric = {
  metric_key: string;
  type: "score_metric" | "ratio_metric" | "count_metric" | "rank_metric";
  weight: number;
  fields?: {
    numerator?: string;
    denominator?: string;
    rate?: string;
    score?: string;
  };
};

type MetricTreeGroup = {
  group: string;
  group_type: "metric_group" | "scoring_kpi_group";
  total_score: number;
  metrics: MetricTreeMetric[];
};

export type LogisticsKpiOperatingSystem = {
  workspace_id: string;
  layer: "logistics-kpi-operating-system";
  metric_tree: MetricTreeGroup[];
  scoring_model: {
    formula_type: "weighted_sum";
    rules: Array<{
      group: string;
      total_score: number;
      calculation: "sum(metric_score × weight)";
      metrics: Array<{
        metric_key: string;
        weight: number;
        score_field?: string;
      }>;
    }>;
  };
  impact_model: {
    metrics: Array<{
      metric_key: string;
      impact_direction: "positive" | "negative" | "neutral";
      kpi_sensitivity: "high" | "medium" | "low";
      weight: number;
      importance: number;
    }>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, "");
}

function schemaTables(schemaSnapshot: unknown): SchemaTable[] {
  const schema = asRecord(schemaSnapshot);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];

  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const tableName = typeof tableRecord.name === "string" ? tableRecord.name : "";
    const columns = Array.isArray(tableRecord.columns) ? tableRecord.columns : [];

    if (!tableName) return [];

    return [{
      name: tableName,
      schema: typeof tableRecord.schema === "string" ? tableRecord.schema : undefined,
      columns: columns.flatMap((column) => {
        const columnRecord = asRecord(column);
        const columnName = typeof columnRecord.name === "string" ? columnRecord.name : "";

        if (!columnName) return [];

        return [{
          name: columnName,
          type: typeof columnRecord.type === "string" ? columnRecord.type : "unknown",
          nullable: typeof columnRecord.nullable === "boolean" ? columnRecord.nullable : true
        }];
      })
    }];
  });
}

function metricKey(metric: BusinessMetricDefinition | SemanticMetricLike) {
  const candidate = "metricId" in metric
    ? metric.metricId
    : metric.metricKey ?? metric.metricId ?? metric.name;

  return normalize(String(candidate ?? ""));
}

function metricDisplay(metric: BusinessMetricDefinition | SemanticMetricLike) {
  const value = "businessName" in metric
    ? metric.businessName
    : metric.businessName ?? metric.displayName ?? metric.name ?? metric.metricKey ?? metric.metricId ?? "";

  return String(value ?? "");
}

function metricCategory(metric: BusinessMetricDefinition | SemanticMetricLike) {
  return String(metric.category ?? "未分组");
}

function metricFields(metric: BusinessMetricDefinition | SemanticMetricLike) {
  const requiredFields = Array.isArray(metric.requiredFields) ? metric.requiredFields : [];
  const formula = typeof metric.formula === "string" ? metric.formula : "";
  const formulaFields = Array.from(formula.matchAll(/\.([A-Za-z_][\w]*)/g)).map((match) => match[1]);

  return Array.from(new Set([...requiredFields, ...formulaFields].filter(Boolean)));
}

function extractWeightFromText(value: string) {
  const match = /[（(]\s*(\d+(?:\.\d+)?)\s*[）)]/.exec(value);
  return match ? Number(match[1]) : null;
}

function scoreWeight(metric: BusinessMetricDefinition | SemanticMetricLike, tables: SchemaTable[]) {
  const key = metricKey(metric);
  const display = metricDisplay(metric);
  const directWeight = extractWeightFromText(display);
  if (directWeight != null) return directWeight;

  for (const table of tables) {
    for (const column of table.columns) {
      const columnRecord = column as typeof column & { displayName?: string | null };
      const columnLabel = String(columnRecord.displayName ?? column.name);
      const columnWeight = extractWeightFromText(columnLabel);
      if (columnWeight != null && normalize(column.name) === key) return columnWeight;
    }
  }

  if (key === "problem_resolution_score" || key === "problem_resolution_score_loss") return 30;
  if (key === "pickup_score" || key === "timeliness_score" || key === "delivery_standard_score") return 20;
  if (key === "bonus_penalty_score") return 10;
  return 1;
}

function metricType(metric: BusinessMetricDefinition | SemanticMetricLike): MetricTreeMetric["type"] {
  const key = metricKey(metric);
  const display = metricDisplay(metric);
  const text = `${key} ${display}`;
  const fields = metricFields(metric).map(normalize);

  if (/rank|排名/.test(text)) return "rank_metric";
  if (/rate|率/.test(text) || fields.some((field) => /numerator|denominator|分子|分母/.test(field))) return "ratio_metric";
  if (/count|数|单量/.test(text)) return "count_metric";
  return "score_metric";
}

function metricGroup(metric: BusinessMetricDefinition | SemanticMetricLike) {
  const key = metricKey(metric);
  const display = metricDisplay(metric);

  if (/pickup|散件|揽收/.test(`${key} ${display}`)) return "散件揽收";
  if (/timeliness|时效/.test(`${key} ${display}`)) return "时效达成";
  if (/delivery|投递/.test(`${key} ${display}`)) return "投递规范";
  if (/problem|resolution|未解决|解决/.test(`${key} ${display}`)) return "问题解决";
  if (/bonus|penalty|加减/.test(`${key} ${display}`)) return "加减分";
  if (/ticket|工单/.test(`${key} ${display}`)) return "一次性解决率";
  return metricCategory(metric);
}

function impactDirection(metric: BusinessMetricDefinition | SemanticMetricLike): "positive" | "negative" | "neutral" {
  const key = metricKey(metric);
  const display = metricDisplay(metric);
  const text = `${key} ${display}`;

  if (/loss|unresolved|cancel|urge|second|repeat|失分|未解决|取消|催单|二次|重复/.test(text)) return "negative";
  if (/rank|排名/.test(text)) return "negative";
  if (/count|分母|denominator/.test(text)) return "neutral";
  return "positive";
}

function sensitivity(weight: number, metric: BusinessMetricDefinition | SemanticMetricLike) {
  const priority = "priority" in metric && typeof metric.priority === "number" ? metric.priority : 99;
  if (weight >= 20 || priority <= 6) return "high";
  if (weight >= 5 || priority <= 15) return "medium";
  return "low";
}

function fieldsForMetric(metric: BusinessMetricDefinition | SemanticMetricLike): MetricTreeMetric["fields"] {
  const fields = metricFields(metric);
  const score = fields.find((field) => /score|得分|分$/.test(field));
  const numerator = fields.find((field) => /numerator|分子/.test(field));
  const denominator = fields.find((field) => /denominator|分母/.test(field));
  const rate = fields.find((field) => /rate|率值|率$/.test(field));

  if (!score && !numerator && !denominator && !rate) return undefined;

  return {
    numerator,
    denominator,
    rate,
    score
  };
}

function registryFirstMetrics(input: LogisticsKpiOperatingSystemInput) {
  if (input.business_metric_registry.length > 0) return input.business_metric_registry;
  if (input.semantic_metrics.length > 0) return input.semantic_metrics;

  return schemaTables(input.schema_snapshot).flatMap((table) =>
    table.columns.flatMap((column) => /score|rate|count|得分|率|数|分$/.test(`${column.name}`) ? [{
      metricKey: column.name,
      displayName: column.name,
      category: table.name,
      requiredFields: [column.name]
    }] : [])
  );
}

export function compileLogisticsKpiOperatingSystem(input: LogisticsKpiOperatingSystemInput): LogisticsKpiOperatingSystem {
  const tables = schemaTables(input.schema_snapshot);
  const metrics = registryFirstMetrics(input).filter((metric) => metricKey(metric));
  const grouped = new Map<string, MetricTreeMetric[]>();

  for (const metric of metrics) {
    const key = metricKey(metric);
    const weight = scoreWeight(metric, tables);
    const treeMetric: MetricTreeMetric = {
      metric_key: key,
      type: metricType(metric),
      weight,
      fields: fieldsForMetric(metric)
    };
    const group = metricGroup(metric);
    grouped.set(group, [...(grouped.get(group) ?? []), treeMetric]);
  }

  const metricTree = Array.from(grouped.entries()).map(([group, metricsForGroup]) => {
    const totalScore = metricsForGroup.reduce((sum, metric) => sum + metric.weight, 0);

    return {
      group,
      group_type: totalScore > metricsForGroup.length ? "scoring_kpi_group" as const : "metric_group" as const,
      total_score: totalScore,
      metrics: metricsForGroup
    };
  });

  return {
    workspace_id: input.workspace_id,
    layer: "logistics-kpi-operating-system",
    metric_tree: metricTree,
    scoring_model: {
      formula_type: "weighted_sum",
      rules: metricTree.map((group) => ({
        group: group.group,
        total_score: group.total_score,
        calculation: "sum(metric_score × weight)",
        metrics: group.metrics.map((metric) => ({
          metric_key: metric.metric_key,
          weight: metric.weight,
          score_field: metric.fields?.score
        }))
      }))
    },
    impact_model: {
      metrics: metrics.map((metric) => {
        const weight = scoreWeight(metric, tables);

        return {
          metric_key: metricKey(metric),
          impact_direction: impactDirection(metric),
          kpi_sensitivity: sensitivity(weight, metric),
          weight,
          importance: weight
        };
      })
    }
  };
}
