import type { SchemaTable } from "@/lib/metric-validation";
import type { BusinessMetricDefinition } from "@/lib/metrics/ecommerce-metrics";

const allReports: BusinessMetricDefinition["allowedReports"] = ["daily", "weekly", "custom"];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tableLabel(table: SchemaTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function q(table: SchemaTable, field: string) {
  return `${tableLabel(table)}.${field}`;
}

function hasColumn(table: SchemaTable | null | undefined, field: string) {
  if (!table) return false;
  return table.columns.some((column) => normalize(column.name) === normalize(field));
}

function hasAnyColumn(table: SchemaTable | null | undefined, fields: string[]) {
  return fields.some((field) => hasColumn(table, field));
}

function tableScore(table: SchemaTable, fields: string[]) {
  const columns = new Set(table.columns.map((column) => normalize(column.name)));
  return fields.filter((field) => columns.has(normalize(field))).length;
}

function findBestTable(tables: SchemaTable[], names: string[], fields: string[]) {
  const named = tables.find((table) => names.some((name) => normalize(table.name) === normalize(name)));
  if (named) return named;

  const ranked = tables
    .map((table) => ({ table, score: tableScore(table, fields) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].table : null;
}

function metric(input: Omit<BusinessMetricDefinition, "allowedReports" | "fallbackFormula" | "isEstimated"> & Partial<Pick<BusinessMetricDefinition, "allowedReports" | "fallbackFormula" | "isEstimated">>): BusinessMetricDefinition {
  return {
    allowedReports: allReports,
    fallbackFormula: null,
    isEstimated: false,
    ...input
  };
}

function addIf(output: BusinessMetricDefinition[], definition: BusinessMetricDefinition, tables: Array<SchemaTable | null>) {
  const missing = definition.requiredFields.filter((field) => !tables.some((table) => hasColumn(table, field)));

  if (missing.length === 0) {
    output.push(definition);
  }
}

export function logisticsBranchKpiResolutionRegistry(tables: SchemaTable[]) {
  const kpi = findBestTable(tables, ["branch_kpi_daily"], [
    "date",
    "branch_name",
    "total_score",
    "rating",
    "national_rank",
    "province_rank",
    "pickup_score",
    "timeliness_score",
    "delivery_standard_score",
    "problem_resolution_score",
    "bonus_penalty_score"
  ]);
  const denominator = findBestTable(tables, ["ticket_resolution_denominator"], [
    "ticket_id",
    "date",
    "branch_name",
    "ticket_type",
    "customer_request_type",
    "service_scene",
    "is_counted_in_resolution_rate"
  ]);
  const unresolved = findBestTable(tables, ["ticket_unresolved_detail"], [
    "ticket_id",
    "date",
    "branch_name",
    "ticket_type",
    "unresolved_reason",
    "customer_request_type",
    "service_scene",
    "is_followup_unresolved",
    "is_second_ticket",
    "is_repeat_contact",
    "is_urge_order"
  ]);
  const output: BusinessMetricDefinition[] = [];

  if (kpi) {
    addIf(output, metric({
      metricId: "total_kpi_score",
      businessName: "KPI 总分",
      level: 1,
      category: "网点 KPI",
      formula: `AVG(${q(kpi, "total_score")})`,
      requiredFields: ["total_score"],
      displayFormat: "decimal",
      priority: 1,
      description: "衡量网点综合经营与服务质量表现的核心总分。"
    }), [kpi]);
    addIf(output, metric({
      metricId: "kpi_score_change_vs_previous_day",
      businessName: "KPI 日环比变化",
      level: 1,
      category: "网点 KPI",
      formula: `AVG(${q(kpi, "total_score")})`,
      requiredFields: ["date", "total_score"],
      displayFormat: "decimal",
      priority: 2,
      description: "判断网点 KPI 是否出现明显下滑或改善；报告层按 latest_by_date 与 previous_day 计算。"
    }), [kpi]);
    addIf(output, metric({
      metricId: "national_rank",
      businessName: "全国排名",
      level: 1,
      category: "网点 KPI",
      formula: `MIN(${q(kpi, "national_rank")})`,
      requiredFields: ["national_rank"],
      displayFormat: "number",
      priority: 3,
      description: "网点在全国范围内的排名，数值越小越好。"
    }), [kpi]);
    addIf(output, metric({
      metricId: "province_rank",
      businessName: "省区排名",
      level: 1,
      category: "网点 KPI",
      formula: `MIN(${q(kpi, "province_rank")})`,
      requiredFields: ["province_rank"],
      displayFormat: "number",
      priority: 4,
      description: "网点在省区范围内的排名，数值越小越好。"
    }), [kpi]);
    addIf(output, metric({
      metricId: "problem_resolution_score",
      businessName: "问题解决得分",
      level: 1,
      category: "网点 KPI",
      formula: `AVG(${q(kpi, "problem_resolution_score")})`,
      requiredFields: ["problem_resolution_score"],
      displayFormat: "decimal",
      priority: 5,
      description: "衡量客户问题处理闭环能力，是影响 KPI 的关键模块。"
    }), [kpi]);
    addIf(output, metric({
      metricId: "problem_resolution_score_loss",
      businessName: "问题解决失分",
      level: 1,
      category: "网点 KPI",
      formula: `30 - AVG(${q(kpi, "problem_resolution_score")})`,
      requiredFields: ["problem_resolution_score"],
      displayFormat: "decimal",
      priority: 6,
      description: "衡量问题解决模块距离满分的差距。"
    }), [kpi]);
    for (const item of [
      ["timeliness_score", "时效达成得分", "衡量网点派送、处理、履约等时效表现。"],
      ["delivery_standard_score", "投递规范得分", "衡量投递过程是否符合规范。"],
      ["pickup_score", "散件揽收得分", "衡量散件揽收业务表现。"],
      ["bonus_penalty_score", "加减分", "额外加分或扣分项，可能对最终 KPI 产生直接影响。"]
    ] as const) {
      addIf(output, metric({
        metricId: item[0],
        businessName: item[1],
        level: 1,
        category: "网点 KPI",
        formula: `AVG(${q(kpi, item[0])})`,
        requiredFields: [item[0]],
        displayFormat: "decimal",
        priority: output.length + 1,
        description: item[2]
      }), [kpi]);
    }
  }

  if (denominator) {
    addIf(output, metric({
      metricId: "ticket_denominator_count",
      businessName: "工单分母数",
      level: 1,
      category: "一次性解决率",
      formula: `COUNT_DISTINCT(${q(denominator, "ticket_id")})`,
      requiredFields: ["ticket_id"],
      displayFormat: "number",
      priority: 11,
      description: "纳入一次性解决率考核的客户求助工单总量。"
    }), [denominator]);
  }

  if (unresolved) {
    addIf(output, metric({
      metricId: "unresolved_ticket_count",
      businessName: "一次性未解决工单数",
      level: 1,
      category: "一次性解决率",
      formula: `COUNT_DISTINCT(${q(unresolved, "ticket_id")})`,
      requiredFields: ["ticket_id"],
      displayFormat: "number",
      priority: 12,
      description: "首次处理后未能一次性解决的工单数量。"
    }), [unresolved]);
  }

  if (denominator && unresolved) {
    addIf(output, metric({
      metricId: "first_contact_resolution_rate",
      businessName: "一次性解决率",
      level: 1,
      category: "一次性解决率",
      formula: `1 - SAFE_DIVIDE(COUNT_DISTINCT(${q(unresolved, "ticket_id")}), COUNT_DISTINCT(${q(denominator, "ticket_id")}))`,
      requiredFields: ["ticket_id"],
      displayFormat: "percent",
      priority: 13,
      description: "衡量客户问题是否在首次处理中被有效解决，是问题解决模块的核心指标。"
    }), [denominator, unresolved]);
    addIf(output, metric({
      metricId: "unresolved_ticket_rate",
      businessName: "一次性未解决率",
      level: 1,
      category: "一次性解决率",
      formula: `SAFE_DIVIDE(COUNT_DISTINCT(${q(unresolved, "ticket_id")}), COUNT_DISTINCT(${q(denominator, "ticket_id")}))`,
      requiredFields: ["ticket_id"],
      displayFormat: "percent",
      priority: 14,
      description: "衡量首次处理失败比例，越高说明客户问题闭环越差。"
    }), [denominator, unresolved]);
  }

  if (unresolved) {
    addIf(output, metric({
      metricId: "unresolved_ticket_count_by_ticket_type",
      businessName: "按工单类型未解决数",
      level: 2,
      category: "工单类型",
      formula: `COUNT_DISTINCT(${q(unresolved, "ticket_id")}) BY ${q(unresolved, "ticket_type")}`,
      requiredFields: ["ticket_id", "ticket_type"],
      dimension: "ticket_type",
      displayFormat: "number",
      priority: 15,
      description: "识别哪些工单类型贡献了最多未解决问题。"
    }), [unresolved]);
    if (denominator) {
      addIf(output, metric({
        metricId: "unresolved_ticket_rate_by_ticket_type",
        businessName: "按工单类型未解决率",
        level: 2,
        category: "工单类型",
        formula: `SAFE_DIVIDE(COUNT_DISTINCT(${q(unresolved, "ticket_id")}), COUNT_DISTINCT(${q(denominator, "ticket_id")})) BY ${q(unresolved, "ticket_type")}`,
        requiredFields: ["ticket_id", "ticket_type"],
        dimension: "ticket_type",
        displayFormat: "percent",
        priority: 16,
        description: "识别哪些工单类型最容易一次性处理失败。"
      }), [denominator, unresolved]);
    }
    addIf(output, metric({
      metricId: "unresolved_ticket_count_by_branch",
      businessName: "按责任网点未解决数",
      level: 2,
      category: "责任网点",
      formula: `COUNT_DISTINCT(${q(unresolved, "ticket_id")}) BY ${q(unresolved, "branch_name")}`,
      requiredFields: ["ticket_id", "branch_name"],
      dimension: "branch_name",
      displayFormat: "number",
      priority: 17,
      description: "识别未解决问题最多的责任网点。"
    }), [unresolved]);
    if (denominator) {
      addIf(output, metric({
        metricId: "unresolved_ticket_rate_by_branch",
        businessName: "按责任网点未解决率",
        level: 2,
        category: "责任网点",
        formula: `SAFE_DIVIDE(COUNT_DISTINCT(${q(unresolved, "ticket_id")}), COUNT_DISTINCT(${q(denominator, "ticket_id")})) BY ${q(unresolved, "branch_name")}`,
        requiredFields: ["ticket_id", "branch_name"],
        dimension: "branch_name",
        displayFormat: "percent",
        priority: 18,
        description: "识别哪些责任网点的问题处理质量较差。"
      }), [denominator, unresolved]);
    }
  }

  if (unresolved) {
    const reason = hasColumn(unresolved, "unresolved_reason");
    const conditionalMetrics = [
      ["urge_order_count", "催单数", "is_urge_order", "催单", "衡量客户重复催促的数量，反映处理时效和客户焦虑程度。"],
      ["followup_unresolved_count", "回访未解决数", "is_followup_unresolved", "回访未解决", "衡量处理完成后客户仍认为问题未解决的数量。"],
      ["second_ticket_count", "二次工单数", "is_second_ticket", "二次工单", "衡量同一问题是否重复生成工单，反映首次处理闭环质量。"],
      ["repeat_contact_count", "重复进线数", "is_repeat_contact", "重复进线", "衡量客户因问题未解决而再次联系的情况。"]
    ] as const;

    for (const [metricId, businessName, flagField, reasonValue, description] of conditionalMetrics) {
      const formula = hasColumn(unresolved, flagField)
        ? `COUNT_IF(${q(unresolved, flagField)} = 1)`
        : `COUNT_IF(${q(unresolved, "unresolved_reason")} = '${reasonValue}')`;
      addIf(output, metric({
        metricId,
        businessName,
        level: 2,
        category: "未解决原因",
        formula,
        requiredFields: [hasColumn(unresolved, flagField) ? flagField : "unresolved_reason"],
        displayFormat: "number",
        priority: output.length + 1,
        description
      }), [unresolved]);
    }

    if (reason && hasAnyColumn(unresolved, ["ticket_id", "unresolved_reason"])) {
      addIf(output, metric({
        metricId: "unresolved_reason_count",
        businessName: "按未解决原因统计",
        level: 2,
        category: "未解决原因",
        formula: `COUNT_DISTINCT(${q(unresolved, "ticket_id")}) BY ${q(unresolved, "unresolved_reason")}`,
        requiredFields: ["ticket_id", "unresolved_reason"],
        dimension: "unresolved_reason",
        displayFormat: "number",
        priority: output.length + 1,
        description: "按未解决原因统计数量，用于识别响应慢、闭环差、派件责任、客户重复反馈或流程问题。"
      }), [unresolved]);
    }
  }

  return output;
}

export function missingLogisticsCoreMetrics(definitions: BusinessMetricDefinition[]) {
  const present = new Set(definitions.map((definition) => definition.metricId));
  const required = [
    ["total_kpi_score", "KPI 总分"],
    ["first_contact_resolution_rate", "一次性解决率"],
    ["unresolved_ticket_count", "一次性未解决工单数"],
    ["ticket_denominator_count", "工单分母数"],
    ["unresolved_ticket_count_by_ticket_type", "按工单类型未解决数"],
    ["unresolved_ticket_count_by_branch", "按责任网点未解决数"]
  ];

  return required.flatMap(([metricId, businessName]) =>
    present.has(metricId) ? [] : [{ metricId, businessName, reason: "字段缺失或对应数据源尚未上传，未生成该物流核心指标。" }]
  );
}
