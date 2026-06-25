import {
  MetricExpressionType,
  MetricLayer,
  MetricMaintainerRole,
  MetricStatus,
  PrismaClient,
  type Prisma
} from "@prisma/client";
import type { IntrospectedTable } from "@/lib/database-introspection";
import { generateIndustryAwareMetrics } from "@/lib/metric-generation/metric-generator";
import type {
  GeneratedMetricDefinition,
  MetricColumnType,
  MetricGenerationOutput
} from "@/lib/metric-generation/metric-types";

type SemanticField = {
  table: string;
  field: string;
  displayField?: string;
  dataType?: string | null;
  semanticType: string;
  businessMeaning: string;
  confidence: number;
};

type KpiAssetCategory = "business_scale" | "efficiency" | "quality" | "experience";

type KpiAsset = {
  kpi_id: string;
  kpi_name: string;
  group_name?: string;
  category: KpiAssetCategory;
  definition: string;
  direction: "higher_is_better" | "lower_is_better" | "unknown";
  source_columns: string[];
  formula: string;
  unit?: string;
  components?: Array<{
    role: "numerator" | "denominator" | "rate" | "score" | "value";
    source_column: string;
    raw_header_path: string[];
  }>;
};

type ExcludedKpiColumn = {
  column: string;
  reason: string;
};

type KpiAssetLibrary = {
  total_kpi_count: number;
  kpi_registry: KpiAsset[];
  column_mapping: Record<string, string>;
  excluded_columns: ExcludedKpiColumn[];
};

type BusinessEntity = {
  name: string;
  table: string;
  confidence: number;
  fields: string[];
};

type MetricDraft = {
  layer: MetricLayer;
  category: string;
  name: string;
  definition: string;
  formula: string;
  expressionType: MetricExpressionType;
  unit?: string;
  sourceFields: SemanticField[];
  tags: string[];
  status: MetricStatus;
  confidence?: number;
  riskLevel?: string;
  validationRules?: string[];
  warnings?: string[];
  displayName?: string;
  metricType?: string;
  metricCategory?: string;
  businessType?: string;
  sourceDataset?: string;
  isBenchmarkMetric?: boolean;
  isEstimated?: boolean;
  requiresDeduplication?: boolean;
  warning?: string;
  metricDirection?: "higher_is_better" | "lower_is_better" | "neutral";
  priority?: number;
};

type SemanticLayerResult = {
  fields: SemanticField[];
  entities: BusinessEntity[];
  metrics: MetricDraft[];
  metricGeneration?: MetricGenerationOutput;
  kpiAssetLibrary: KpiAssetLibrary;
};

type SemanticTransaction = Prisma.TransactionClient | PrismaClient;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeReadableHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, "")
    .trim();
}

function compactHeader(value: string) {
  return normalizeReadableHeader(value).replace(/[^\p{L}\p{N}%]+/gu, "");
}

function metricDedupeKey(name: string) {
  const normalized = normalize(name)
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const compact = compactHeader(name);
  const baseKey = /[^\x00-\x7F]/.test(name) ? compact || normalized : normalized || compact || name.trim();

  return baseKey
    .replace(/^(average|avg)_/, "avg_")
    .replace(/_average_/, "_avg_")
    .replace(/_polarity$/, "_sentiment_polarity")
    .replace(/_sentiment_sentiment_polarity$/, "_sentiment_polarity")
    .replace(/_score$/, "_sentiment_score");
}

function metricDisplayScore(metric: MetricDraft) {
  const normalizedName = normalize(metric.name);
  let score = 0;

  if (!normalizedName.includes("__") && !metric.name.includes("_")) score += 2;
  if (metric.riskLevel === "low") score += 2;
  if ((metric.confidence ?? 0) >= 0.9) score += 1;
  if (!metric.name.includes(metric.sourceFields[0]?.table ?? "__none__")) score += 1;

  return score;
}

function dedupeMetricDrafts(metrics: MetricDraft[]) {
  const byKey = new Map<string, MetricDraft>();

  for (const metric of metrics) {
    const key = metricDedupeKey(metric.name);
    const existing = byKey.get(key);

    if (!existing || metricDisplayScore(metric) > metricDisplayScore(existing)) {
      byKey.set(key, metric);
    }
  }

  return Array.from(byKey.values());
}

function safeIdentifier(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized) return normalized;

  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `field_${hash.toString(36)}`;
}

function tableKey(table: IntrospectedTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function fieldIncludes(field: string, keywords: string[]) {
  const normalized = normalize(field);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasField(fields: SemanticField[], keywords: string[]) {
  return fields.some((field) => fieldIncludes(field.field, keywords) || fieldIncludes(field.displayField ?? "", keywords));
}

function fieldByName(fields: SemanticField[], keywords: string[]) {
  return fields.find((field) => fieldIncludes(field.field, keywords) || fieldIncludes(field.displayField ?? "", keywords));
}

function tableFields(fields: SemanticField[], table: string) {
  return fields.filter((field) => field.table === table);
}

function detectDatasetType(fields: SemanticField[]) {
  const hasStockShape =
    hasField(fields, ["date"]) &&
    hasField(fields, ["open"]) &&
    hasField(fields, ["high"]) &&
    hasField(fields, ["low"]) &&
    hasField(fields, ["close"]) &&
    hasField(fields, ["volume"]);

  if (hasStockShape) {
    return "stock_price";
  }

  const hasReviewSentimentShape =
    hasField(fields, ["app", "product"]) &&
    hasField(fields, ["translated_review", "review", "comment", "feedback"]) &&
    hasField(fields, ["sentiment"]) &&
    hasField(fields, ["sentiment_polarity", "polarity"]) &&
    hasField(fields, ["sentiment_subjectivity", "subjectivity"]);

  if (hasReviewSentimentShape) {
    return "review_sentiment";
  }

  const hasAppStoreShape =
    hasField(fields, ["app", "product"]) &&
    hasField(fields, ["category"]) &&
    hasField(fields, ["rating", "score"]) &&
    hasField(fields, ["reviews", "review_count"]) &&
    hasField(fields, ["installs"]) &&
    hasField(fields, ["price"]) &&
    hasField(fields, ["type"]);

  if (hasAppStoreShape) {
    return "app_store";
  }

  return "generic_business";
}

function inferSemanticType(field: string, tableName: string): Omit<SemanticField, "table" | "field" | "dataType"> | null {
  const normalizedField = normalize(field);
  const normalizedTable = normalize(tableName);

  if (fieldIncludes(normalizedField, ["customer_id", "account_id", "user_id", "client_id"])) {
    return {
      semanticType: "entity_identifier",
      businessMeaning: "Customer or user identity",
      confidence: 0.92
    };
  }

  if (fieldIncludes(normalizedField, [
    "revenue",
    "paid_amount",
    "order_amount",
    "payment_amount",
    "transaction_amount",
    "total_sales",
    "gmv",
    "invoice_amount",
    "mrr",
    "arr"
  ])) {
    return {
      semanticType: "revenue_value",
      businessMeaning: "Monetary value used for revenue analysis",
      confidence: normalizedTable.includes("subscription") || normalizedTable.includes("payment") ? 0.94 : 0.84
    };
  }

  if (normalizedField === "price" || fieldIncludes(normalizedField, ["unit_price", "list_price"])) {
    return {
      semanticType: "price_value",
      businessMeaning: "Catalog or listed product price, not confirmed revenue",
      confidence: 0.82
    };
  }

  if (fieldIncludes(normalizedField, ["installs", "install_count", "downloads", "download_count"])) {
    return {
      semanticType: "install_count",
      businessMeaning: "Install, download, or adoption volume",
      confidence: 0.86
    };
  }

  if (fieldIncludes(normalizedField, ["spend", "cost", "cac", "budget", "cpc", "cpa"])) {
    return {
      semanticType: "cost_value",
      businessMeaning: "Cost or acquisition efficiency signal",
      confidence: 0.86
    };
  }

  if (fieldIncludes(normalizedField, ["signup", "activation", "activated", "onboarding", "conversion", "converted"])) {
    return {
      semanticType: "activation_event",
      businessMeaning: "Lifecycle or conversion event",
      confidence: 0.88
    };
  }

  if (fieldIncludes(normalizedField, ["renew", "retention", "churn", "cancel", "status"])) {
    return {
      semanticType: "retention_signal",
      businessMeaning: "Retention, churn, or subscription state",
      confidence: 0.82
    };
  }

  if (fieldIncludes(normalizedField, ["country", "region", "market", "city", "geo"])) {
    return {
      semanticType: "geography_dimension",
      businessMeaning: "Geographic segmentation dimension",
      confidence: 0.9
    };
  }

  if (fieldIncludes(normalizedField, ["channel", "campaign", "source", "medium", "utm", "ad_group"])) {
    return {
      semanticType: "acquisition_dimension",
      businessMeaning: "Acquisition or marketing attribution dimension",
      confidence: 0.87
    };
  }

  if (fieldIncludes(normalizedField, ["date", "time", "created_at", "updated_at", "occurred_at", "timestamp", "day", "month"])) {
    return {
      semanticType: "time_dimension",
      businessMeaning: "Time grain for trend analysis",
      confidence: 0.91
    };
  }

  if (fieldIncludes(normalizedField, ["close", "open", "high", "low", "volume"])) {
    return {
      semanticType: "performance_value",
      businessMeaning: "Performance or market movement value",
      confidence: 0.78
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment_polarity", "polarity", "sentiment_score", "rating", "score"])) {
    return {
      semanticType: "sentiment_score",
      businessMeaning: "Numeric sentiment, rating, or satisfaction score",
      confidence: 0.9
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment_subjectivity", "subjectivity"])) {
    return {
      semanticType: "sentiment_subjectivity",
      businessMeaning: "Review subjectivity or opinion intensity score",
      confidence: 0.86
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment", "label", "category"])) {
    return {
      semanticType: "sentiment_label",
      businessMeaning: "Categorical sentiment label",
      confidence: 0.84
    };
  }

  if (fieldIncludes(normalizedField, ["review_count", "reviews"]) && !fieldIncludes(normalizedField, ["translated_review"])) {
    return {
      semanticType: "review_count",
      businessMeaning: "Numeric review count or feedback volume",
      confidence: 0.88
    };
  }

  if (fieldIncludes(normalizedField, ["review", "comment", "feedback", "message", "text"])) {
    return {
      semanticType: "feedback_text",
      businessMeaning: "Customer feedback or review text",
      confidence: 0.87
    };
  }

  if (fieldIncludes(normalizedField, ["app", "product", "sku", "item", "title"])) {
    return {
      semanticType: "product_dimension",
      businessMeaning: "Product, app, or item dimension",
      confidence: 0.78
    };
  }

  return null;
}

function inferBusinessEntities(tables: IntrospectedTable[], fields: SemanticField[]): BusinessEntity[] {
  return tables.map((table) => {
    const key = tableKey(table);
    const tableFields = fields.filter((field) => field.table === key);
    const normalizedTable = normalize(table.name);

    if (normalizedTable.includes("subscription") || normalizedTable.includes("billing")) {
      return {
        name: "Subscription",
        table: key,
        confidence: 0.9,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("customer") || normalizedTable.includes("account") || normalizedTable.includes("user")) {
      return {
        name: "Customer",
        table: key,
        confidence: 0.88,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("event") || normalizedTable.includes("activity")) {
      return {
        name: "Product Event",
        table: key,
        confidence: 0.84,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("campaign") || normalizedTable.includes("ad") || normalizedTable.includes("marketing")) {
      return {
        name: "Acquisition",
        table: key,
        confidence: 0.86,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("review") || normalizedTable.includes("feedback") || normalizedTable.includes("comment")) {
      return {
        name: "Customer Feedback",
        table: key,
        confidence: 0.9,
        fields: tableFields.map((field) => field.field)
      };
    }

    return {
      name: "Business Record",
      table: key,
      confidence: tableFields.length > 0 ? 0.7 : 0.45,
      fields: tableFields.map((field) => field.field)
    };
  });
}

function firstField(fields: SemanticField[], semanticType: string) {
  return fields.find((field) => field.semanticType === semanticType);
}

function fieldsByType(fields: SemanticField[], semanticType: string) {
  return fields.filter((field) => field.semanticType === semanticType);
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

function expressionTypeForGeneratedMetric(metric: GeneratedMetricDefinition) {
  if (metric.aggregation === "ratio") {
    return MetricExpressionType.RATE;
  }

  if (metric.aggregation === "derived") {
    return MetricExpressionType.CALCULATION;
  }

  return MetricExpressionType.AGGREGATE;
}

function layerForGeneratedMetric(metric: GeneratedMetricDefinition) {
  if (["Overview", "Revenue", "Sales", "Reach", "Price", "Liquidity"].includes(metric.category)) {
    return MetricLayer.PRIMARY;
  }

  if (["Growth", "Quality", "Engagement", "Efficiency", "Cost", "Conversion", "Return"].includes(metric.category)) {
    return MetricLayer.DRIVER;
  }

  return MetricLayer.DIAGNOSTIC;
}

function sourceFieldsForGeneratedMetric(metric: GeneratedMetricDefinition, semanticFields: SemanticField[]) {
  return metric.requiredFields.flatMap((reference) => {
    const separatorIndex = reference.lastIndexOf(".");
    const table = separatorIndex >= 0 ? reference.slice(0, separatorIndex) : "";
    const field = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : reference;
    const match = semanticFields.find((semanticField) =>
      semanticField.table === table && normalize(semanticField.field) === normalize(field)
    );

    if (match) {
      return [match];
    }

    return [{
      table,
      field,
      displayField: field,
      semanticType: "generated_metric_field",
      businessMeaning: "Field used by industry-aware metric generation",
      confidence: metric.confidence,
      dataType: null
    }];
  });
}

function metricDraftsFromIndustryGenerator(tables: IntrospectedTable[], semanticFields: SemanticField[]) {
  const metricGeneration = generateIndustryAwareMetrics({
    tables: tables.map((table) => ({
      tableName: tableKey(table),
      columns: table.columns.map((column) => ({
        name: column.name,
        type: toMetricColumnType(column.type),
        nullable: column.nullable
      }))
    }))
  });
  const metrics = dedupeMetricDrafts(metricGeneration.metrics.map((metric): MetricDraft => ({
    layer: layerForGeneratedMetric(metric),
    category: metric.category,
    name: metric.name,
    definition: metric.description,
    formula: metric.formula,
    expressionType: expressionTypeForGeneratedMetric(metric),
    unit: metric.aggregation === "ratio" ? "percent" : undefined,
    sourceFields: sourceFieldsForGeneratedMetric(metric, semanticFields),
    tags: [
      "AI Generated",
      metric.riskLevel === "medium" ? "Needs Review" : "Industry Aware",
      metric.metricType ?? "core_metric",
      metric.category
    ],
    status: MetricStatus.NEEDS_VALIDATION,
    confidence: metric.confidence,
    riskLevel: metric.riskLevel,
    validationRules: metric.validationRules,
    warnings: metric.warning ? [...(metric.warnings ?? []), metric.warning] : metric.warnings,
    displayName: metric.displayName,
    metricType: metric.metricType,
    metricCategory: metric.metricCategory,
    businessType: metric.businessType,
    sourceDataset: metric.sourceDataset,
    isBenchmarkMetric: metric.isBenchmarkMetric,
    isEstimated: metric.isEstimated,
    requiresDeduplication: metric.requiresDeduplication,
    warning: metric.warning
  })));

  return { metricGeneration, metrics };
}

function stableKpiId(name: string) {
  const compact = compactHeader(name);
  const ascii = normalize(name).replace(/^_+|_+$/g, "");

  if (/一次(?:性)?未解决|一次解决失败|首次处理失败|first.*resolution.*fail|unresolved/.test(compact)) {
    return "first_contact_unresolved";
  }
  if (/催单|urge|chasing|escalation/.test(compact)) return "urge_order_count";
  if (/回访未解决|followup.*unresolved/.test(compact)) return "followup_unresolved_count";
  if (/二次工单|second.*ticket/.test(compact)) return "second_ticket_count";
  if (/重复进线|repeat.*contact/.test(compact)) return "repeat_contact_count";
  if (/问题解决得分|problem.*resolution.*score/.test(compact)) return "problem_resolution_score";
  if (/时效.*得分|timeliness.*score/.test(compact)) return "timeliness_score";
  if (/投递.*得分|delivery.*standard.*score/.test(compact)) return "delivery_standard_score";
  if (/揽收.*得分|pickup.*score/.test(compact)) return "pickup_score";

  return ascii || `kpi_${Array.from(compact).map((char) => char.codePointAt(0)?.toString(36) ?? "").join("_")}`;
}

function classifyKpiAssetCategory(name: string): KpiAssetCategory {
  const compact = compactHeader(name);

  if (/时间|时效|及时|响应|处理时长|解决时长|sla|timeliness|response|resolutiontime|speed/.test(compact)) {
    return "efficiency";
  }
  if (/未解决|返工|重复|二次|回访未解决|失败|错误|合格|规范|质量|解决率|解决得分|unresolved|rework|repeat|second|failed|error|quality|resolution/.test(compact)) {
    return "quality";
  }
  if (/满意|投诉|差评|客户体验|评价|csat|complaint|satisfaction|negative|rating/.test(compact)) {
    return "experience";
  }
  return "business_scale";
}

function inferKpiDirection(name: string): KpiAsset["direction"] {
  const compact = compactHeader(name);

  if (/未解决|失败|错误|投诉|差评|取消|催单|二次|重复|失分|超时|unresolved|failed|error|complaint|cancel|urge|repeat|second|loss|timeout/.test(compact)) {
    return "lower_is_better";
  }
  if (/排名|rank/.test(compact)) return "lower_is_better";
  if (/率|分|得分|总分|完成|达成|合格|满意|解决|score|rate|completion|success|satisfaction|resolution/.test(compact)) {
    return "higher_is_better";
  }
  return "unknown";
}

function isGroupHeaderColumn(name: string) {
  const compact = compactHeader(name);
  return /^(散件揽收|时效达成|投递规范|问题解决|加减分项|加减分)\d*$/.test(compact);
}

function kpiComponentRole(value: string): NonNullable<KpiAsset["components"]>[number]["role"] | null {
  const compact = compactHeader(value);

  if (/^(分子|numerator)$/.test(compact)) return "numerator";
  if (/^(分母|denominator)$/.test(compact)) return "denominator";
  if (/^(率值|ratevalue|rate|ratio)$/.test(compact)) return "rate";
  if (/^(得分|分|score)$/.test(compact)) return "score";
  return null;
}

function kpiWeightFromGroup(value?: string) {
  if (!value) return null;
  const match = /[(（]\s*(\d+(?:\.\d+)?)\s*[)）]/.exec(value);
  return match ? Number(match[1]) : null;
}

function rawHeaderPath(column: IntrospectedTable["columns"][number]) {
  const record = column as typeof column & { rawHeaderPath?: unknown; displayName?: unknown };
  const path = Array.isArray(record.rawHeaderPath)
    ? record.rawHeaderPath.filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    : [];
  const displayName = typeof record.displayName === "string" && record.displayName.trim() ? record.displayName.trim() : column.name;

  return path.length ? path : [displayName];
}

function kpiAssetDisplayName(column: IntrospectedTable["columns"][number]) {
  const record = column as typeof column & { displayName?: unknown };
  return typeof record.displayName === "string" && record.displayName.trim() ? record.displayName.trim() : column.name;
}

function kpiColumnClassification(name: string): { kind: "business_kpi" | "derived" | "structural" | "group_header"; reason: string } {
  const compact = compactHeader(name);
  const ascii = normalize(name);

  if (!compact) {
    return { kind: "structural", reason: "空列名或不可识别列名，不作为业务 KPI。" };
  }

  if (/[（(]\s*\d+(?:\.\d+)?\s*[)）]/.test(name)) {
    return { kind: "business_kpi", reason: "该列包含 KPI 权重，属于一级或二级业务指标。" };
  }

  if (/(^|_)(numerator|denominator|zero_line|max_line|full_score_line|intermediate)($|_)/.test(ascii) ||
      /(分子|分母|零分线|满分线|中间计算字段)$/.test(compact) ||
      /^(分子|分母|零分线|满分线|中间计算字段)$/.test(compact)) {
    return { kind: "derived", reason: "计算辅助字段用于推导指标，不进入业务 KPI 资产库。" };
  }

  if (/^(区间|kpi总分|全国排名|省区排名|进步排名|业务量|签收量|日均业务量|日均签收量)$/.test(compact) ||
      /(全国排名|省区排名|进步排名)$/.test(compact)) {
    return { kind: "business_kpi", reason: "该列是业务排名、汇总或规模指标，可用于报表监控。" };
  }

  if (/^(订单量|ordercount|ordervolume)$/.test(compact)) {
    return { kind: "business_kpi", reason: "该列是指标组下的业务规模字段，可用于分组订单量展示。" };
  }

  if (/^(责任量|responsibilityvolume|responsibilitycount)$/.test(compact)) {
    return { kind: "business_kpi", reason: "该列是嵌套 KPI 下的责任量组件，可用于下钻解释。" };
  }

  if (/^(率值|占比)$/.test(compact)) {
    return { kind: "business_kpi", reason: "该列是宽表中的指标结果值，可直接进入 KPI 展示。" };
  }

  if (isGroupHeaderColumn(name)) {
    return { kind: "group_header", reason: "分组表头用于组织指标，不是可计算业务 KPI。" };
  }

  if (/(率|分|得分|总分|比率|完成率|时效率|合格率)$/.test(compact) ||
      /(sla|complaint.*rate|delivery.*rate|success.*rate|completion.*rate|score|rate|ratio)$/i.test(name)) {
    return { kind: "business_kpi", reason: "该列描述业务表现、比率或得分，可跨报表复用。" };
  }

  if (/(投诉率|妥投率|解决率|未解决率|及时率|达成率|取消率|完结率|满意度|准确率|规范率)/.test(compact)) {
    return { kind: "business_kpi", reason: "该列是管理关注的运营表现指标。" };
  }

  return { kind: "structural", reason: "该列更像维度、标签或原始业务字段，不计入业务 KPI。" };
}

function kpiFormulaForColumn(table: string, column: string, name: string) {
  const reference = `${table}.${safeIdentifier(column)}`;
  const compact = compactHeader(name);

  if (/排名|rank/i.test(name) || /排名/.test(compact)) return `AVG(${reference})`;
  if (/率|比率|rate|ratio/i.test(name) || /率|比率/.test(compact)) return `AVG(${reference})`;
  if (/分|得分|总分|score/i.test(name) || /分|得分|总分/.test(compact)) return `AVG(${reference})`;
  return `SUM(${reference})`;
}

function groupBaseName(name: string) {
  return name.replace(/[（(]\s*-?\d+(?:\.\d+)?\s*[)）]/g, "").trim();
}

function isGroupedHeaderScaffoldLeaf(name: string) {
  const compact = compactHeader(name);
  return /^(分子|分母|中间计算字段)$/.test(compact);
}

function isSummaryGroupedHeader(name: string) {
  const compact = compactHeader(name);
  return /^(kpi总分|核心模块总分)$/.test(compact);
}

function isFixedLogisticsKpiGroup(name: string | undefined) {
  const compact = compactHeader(name ?? "");
  return /^(散件揽收|时效达成|投递规范|问题解决|加减分项)$/.test(compact);
}

function groupedHeaderLeafUnit(path: string[]) {
  const text = path.join(" ");
  const leaf = compactHeader(path[path.length - 1] ?? "");

  if (/求助率|遗失破损率/.test(text) && /^(率值)$/.test(leaf)) return "basis_points";
  if (/^(得分|总分|最终得分|申诉率减分|总减分)$/.test(leaf)) return "score";
  if (/^(率值|占比|得分率|零分线|满分线)$/.test(leaf)) return "percent";
  if (/^(责任量|订单量|业务量|签收量|日均业务量|日均签收量)$/.test(leaf)) return "number";

  return undefined;
}

function groupedHeaderAssetName(path: string[]) {
  const leaf = path[path.length - 1] ?? "";
  const parentParts = path.slice(1, -1).map(groupBaseName).filter(Boolean);
  const parent = parentParts.join(" / ");
  const group = groupBaseName(path[0] ?? "");
  const compactLeaf = compactHeader(leaf);

  if (path.length === 2 && isSummaryGroupedHeader(group) && /^(总分|score|totalscore)$/.test(compactLeaf)) {
    return group;
  }

  if (/^(订单量|ordercount|ordervolume)$/.test(compactLeaf) && group) {
    return `${group} ${leaf}`;
  }

  if (!parent) return groupBaseName(leaf);

  if (/^(率值|得分|占比|总分|最终得分|零分线|满分线|责任量)$/.test(compactLeaf)) {
    return `${parent} ${leaf}`;
  }

  return groupBaseName(leaf);
}

function groupedHeaderAssetId(group: string | undefined, path: string[]) {
  const name = [groupBaseName(group ?? ""), ...path.slice(1).map(groupBaseName)].filter(Boolean).join("_");
  return stableKpiId(name);
}

function groupedHeaderComponentRole(leaf: string): NonNullable<KpiAsset["components"]>[number]["role"] {
  const explicit = kpiComponentRole(leaf);
  if (explicit) return explicit;

  const compact = compactHeader(leaf);
  if (/率|占比|ratio|rate/i.test(leaf) || /率|占比/.test(compact)) return "rate";
  if (/分|得分|减分|score/i.test(leaf) || /分|得分|减分/.test(compact)) return "score";
  return "value";
}

function groupedHeaderRollupName(path: string[]) {
  return groupBaseName(path[path.length - 1] ?? "");
}

function groupedHeaderRollupId(path: string[]) {
  return stableKpiId(path.map(groupBaseName).filter(Boolean).join("_"));
}

function groupedHeaderRollupFormula(tableName: string, columns: Array<{ column: string; name: string }>) {
  return columns
    .map((column) => kpiFormulaForColumn(tableName, column.column, column.name))
    .join(" + ");
}

function kpiExpressionType(name: string) {
  const compact = compactHeader(name);
  return /率|比率|rate|ratio/i.test(name) || /率|比率/.test(compact)
    ? MetricExpressionType.RATE
    : MetricExpressionType.AGGREGATE;
}

function buildGroupedHeaderKpiAssets(table: IntrospectedTable, tableName: string) {
  const assetsByKey = new Map<string, KpiAsset>();
  const rollupsByKey = new Map<string, {
    path: string[];
    group: string | undefined;
    columns: Array<{
      column: string;
      leaf: string;
      path: string[];
    }>;
  }>();
  const excluded: ExcludedKpiColumn[] = [];

  for (const column of table.columns) {
    const path = rawHeaderPath(column);

    if (path.length < 2) {
      const rawName = kpiAssetDisplayName(column);
      const classification = kpiColumnClassification(rawName);

      if (classification.kind === "business_kpi" && !/^区间$/.test(compactHeader(rawName))) {
        const assetId = stableKpiId(rawName);
        const key = `|${assetId}|${rawName}`;

        assetsByKey.set(key, {
          kpi_id: assetId,
          kpi_name: rawName,
          category: classifyKpiAssetCategory(rawName),
          definition: `${rawName} 是从 Excel 顶层字段识别出的可复用业务 KPI。`,
          direction: inferKpiDirection(rawName),
          source_columns: [`${tableName}.${column.name}`],
          formula: kpiFormulaForColumn(tableName, column.name, rawName),
          components: [{
            role: groupedHeaderComponentRole(rawName),
            source_column: column.name,
            raw_header_path: path.length ? path : [rawName]
          }]
        });
      } else if (rawName) {
        excluded.push({
          column: rawName,
          reason: classification.reason
        });
      }

      continue;
    }

    const group = path[0];
    const leaf = path[path.length - 1];
    const metricName = path.length > 2 ? path[path.length - 2] : leaf;
    const classification = kpiColumnClassification(leaf);
    const isScaffoldLeaf = isGroupedHeaderScaffoldLeaf(leaf);

    if (leaf && classification.kind === "business_kpi" && !isScaffoldLeaf && !isFixedLogisticsKpiGroup(group)) {
      for (let index = 1; index < path.length; index += 1) {
        const rollupPath = path.slice(0, index);
        const rollupName = groupedHeaderRollupName(rollupPath);

        if (!rollupName) {
          continue;
        }

        if (index === 1 && isSummaryGroupedHeader(rollupName)) {
          continue;
        }

        const rollupKey = `${group ?? ""}|${groupedHeaderRollupId(rollupPath)}|${rollupName}`;
        const existing = rollupsByKey.get(rollupKey);
        const nextColumn = {
          column: column.name,
          leaf,
          path
        };

        if (existing) {
          existing.columns.push(nextColumn);
        } else {
          rollupsByKey.set(rollupKey, {
            path: rollupPath,
            group,
            columns: [nextColumn]
          });
        }
      }
    }

    if (
      !leaf ||
      classification.kind === "structural" ||
      classification.kind === "group_header" ||
      isScaffoldLeaf
    ) {
      excluded.push({
        column: kpiAssetDisplayName(column),
        reason: classification.reason
      });
      continue;
    }

    const assetName = groupedHeaderAssetName(path);
    const assetId = groupedHeaderAssetId(group, path);
    const key = `${group ?? ""}|${assetId}|${assetName}`;
    const weight = kpiWeightFromGroup(metricName) ?? kpiWeightFromGroup(path[1]);

    assetsByKey.set(key, {
      kpi_id: assetId,
      kpi_name: assetName,
      group_name: group,
      category: classifyKpiAssetCategory(`${group ?? ""} ${assetName}`),
      definition: weight
        ? `${assetName} 属于「${group}」指标组，权重 ${weight} 分，可跨日报、周报、月报和看板复用。`
        : `${assetName} 是从 Excel 分组表头识别出的可复用业务 KPI。`,
      direction: inferKpiDirection(assetName),
      source_columns: [`${tableName}.${column.name}`],
      formula: kpiFormulaForColumn(tableName, column.name, assetName),
      unit: groupedHeaderLeafUnit(path),
      components: [{
        role: groupedHeaderComponentRole(leaf),
        source_column: column.name,
        raw_header_path: path
      }]
    });
  }

  for (const [key, rollup] of rollupsByKey) {
    if (assetsByKey.has(key) || rollup.columns.length === 0) {
      continue;
    }

    const assetName = groupedHeaderRollupName(rollup.path);
    const assetId = groupedHeaderRollupId(rollup.path);
    const weight = kpiWeightFromGroup(rollup.path[rollup.path.length - 1]) ?? kpiWeightFromGroup(rollup.group);
    const sourceColumns = rollup.columns.map((column) => `${tableName}.${column.column}`);

    assetsByKey.set(key, {
      kpi_id: assetId,
      kpi_name: assetName,
      group_name: rollup.group,
      category: classifyKpiAssetCategory(`${rollup.group ?? ""} ${assetName}`),
      definition: weight
        ? `${assetName} 是从 Excel 多级表头识别出的汇总 KPI，权重 ${weight} 分。`
        : `${assetName} 是从 Excel 多级表头识别出的一级或二级汇总 KPI。`,
      direction: inferKpiDirection(assetName),
      source_columns: Array.from(new Set(sourceColumns)),
      formula: groupedHeaderRollupFormula(tableName, rollup.columns.map((column) => ({
        column: column.column,
        name: `${assetName} ${column.leaf}`
      }))),
      components: rollup.columns.map((column) => ({
        role: groupedHeaderComponentRole(column.leaf),
        source_column: column.column,
        raw_header_path: column.path
      }))
    });
  }

  return {
    assets: Array.from(assetsByKey.values()),
    excluded
  };
}

function buildKpiAssetLibrary(tables: IntrospectedTable[]): KpiAssetLibrary {
  const registryById = new Map<string, KpiAsset>();
  const columnMapping: Record<string, string> = {};
  const excludedColumns: ExcludedKpiColumn[] = [];

  for (const table of tables) {
    const tableName = tableKey(table);
    const grouped = buildGroupedHeaderKpiAssets(table, tableName);

    if (grouped.assets.length > 0) {
      for (const asset of grouped.assets) {
        const key = `${asset.group_name ?? ""}|${asset.kpi_id}|${asset.kpi_name}`;
        registryById.set(key, asset);
        for (const component of asset.components ?? []) {
          columnMapping[component.raw_header_path.join(" / ")] = asset.kpi_id;
          columnMapping[component.source_column] = asset.kpi_id;
        }
      }
      excludedColumns.push(...grouped.excluded);
      continue;
    }

    for (const column of table.columns) {
      const rawName = kpiAssetDisplayName(column);
      const classification = kpiColumnClassification(rawName);

      if (classification.kind !== "business_kpi") {
        excludedColumns.push({
          column: rawName,
          reason: classification.reason
        });
        continue;
      }

      const kpiId = stableKpiId(rawName);
      columnMapping[rawName] = kpiId;
      columnMapping[column.name] = kpiId;

      const existing = registryById.get(kpiId);
      if (existing) {
        registryById.set(kpiId, {
          ...existing,
          source_columns: Array.from(new Set([...existing.source_columns, `${tableName}.${column.name}`]))
        });
        continue;
      }

      registryById.set(kpiId, {
        kpi_id: kpiId,
        kpi_name: rawName,
        category: classifyKpiAssetCategory(rawName),
        definition: `${rawName} 是可跨日报、周报、月报和看板复用的业务 KPI。`,
        direction: inferKpiDirection(rawName),
        source_columns: [`${tableName}.${column.name}`],
        formula: kpiFormulaForColumn(tableName, column.name, rawName)
      });
    }
  }

  const kpiRegistry = Array.from(registryById.values());

  return {
    total_kpi_count: kpiRegistry.length,
    kpi_registry: kpiRegistry,
    column_mapping: columnMapping,
    excluded_columns: excludedColumns
  };
}

function metricDraftsFromKpiAssetLibrary(kpiAssetLibrary: KpiAssetLibrary, semanticFields: SemanticField[]): MetricDraft[] {
  return kpiAssetLibrary.kpi_registry.map((asset): MetricDraft => {
    const sourceFields = asset.source_columns.flatMap((reference) => {
      const separatorIndex = reference.lastIndexOf(".");
      const table = separatorIndex >= 0 ? reference.slice(0, separatorIndex) : "";
      const rawField = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : reference;
      const safeField = safeIdentifier(rawField);
      const existing = semanticFields.find((field) => field.table === table && field.field === safeField);

      return existing ? [existing] : [{
        table,
        field: safeField,
        displayField: rawField,
        dataType: null,
        semanticType: "business_kpi_column",
        businessMeaning: asset.definition,
        confidence: 0.88
      }];
    });

    return {
      layer: MetricLayer.PRIMARY,
      category: asset.category,
      name: asset.kpi_name,
      definition: asset.definition,
      formula: asset.formula,
      expressionType: kpiExpressionType(asset.kpi_name),
      unit: asset.unit ?? (/率|ratio|rate|percent/i.test(asset.kpi_name) ? "percent" : /分|score/i.test(asset.kpi_name) ? "score" : undefined),
      sourceFields,
      tags: ["Semantic KPI Asset", asset.category, asset.direction],
      status: MetricStatus.AI_READY,
      confidence: 0.88,
      riskLevel: "low",
      displayName: asset.kpi_name,
      metricType: "core_metric",
      metricCategory: asset.category,
      businessType: "semantic_kpi_asset",
      isBenchmarkMetric: false,
      metricDirection: asset.direction === "unknown" ? "neutral" : asset.direction,
      priority: 10
    };
  });
}

export function createMetricDrafts(fields: SemanticField[]): MetricDraft[] {
  const drafts: MetricDraft[] = [];
  const fieldsByTable = new Map<string, SemanticField[]>();

  for (const field of fields) {
    fieldsByTable.set(field.table, [...(fieldsByTable.get(field.table) ?? []), field]);
  }

  for (const [table, currentFields] of fieldsByTable) {
    const datasetType = detectDatasetType(currentFields);
    const dateField = fieldByName(currentFields, ["date"]);
    const closeField = fieldByName(currentFields, ["close"]);
    const highField = fieldByName(currentFields, ["high"]);
    const lowField = fieldByName(currentFields, ["low"]);
    const volumeField = fieldByName(currentFields, ["volume"]);
    const appField = fieldByName(currentFields, ["app", "product"]);
    const categoryField = fieldByName(currentFields, ["category"]);
    const ratingField = fieldByName(currentFields, ["rating", "score"]);
    const reviewsField = fieldByName(currentFields, ["reviews", "review_count"]);
    const installsField = fieldByName(currentFields, ["installs", "downloads"]);
    const priceField = fieldByName(currentFields, ["price"]);
    const typeField = fieldByName(currentFields, ["type"]);
    const reviewTextField = fieldByName(currentFields, ["translated_review", "review", "comment", "feedback"]);
    const sentimentLabelField = fieldByName(currentFields, ["sentiment"]);
    const sentimentPolarityField = fieldByName(currentFields, ["sentiment_polarity", "polarity"]);
    const sentimentSubjectivityField = fieldByName(currentFields, ["sentiment_subjectivity", "subjectivity"]);

    if (datasetType === "stock_price" && closeField) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "Market Performance",
        name: `${table} Latest Close`,
        definition: "Latest closing price in the selected stock price dataset",
        formula: dateField ? `LAST(${closeField.table}.${closeField.field} BY ${dateField.table}.${dateField.field})` : `LAST(${closeField.table}.${closeField.field})`,
        expressionType: MetricExpressionType.AGGREGATE,
        unit: "currency",
        sourceFields: dateField ? [closeField, dateField] : [closeField],
        tags: ["Stock", "Close", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });

      drafts.push({
        layer: MetricLayer.DRIVER,
        category: "Market Performance",
        name: `${table} Average Close`,
        definition: "Average closing price across the selected period",
        formula: `AVG(${closeField.table}.${closeField.field})`,
        expressionType: MetricExpressionType.AGGREGATE,
        unit: "currency",
        sourceFields: [closeField],
        tags: ["Stock", "Average", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });

      if (dateField) {
        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "Market Performance",
          name: `${table} Close Change Rate`,
          definition: "Close price change from the first date to the latest date",
          formula: `(LAST(${closeField.table}.${closeField.field} BY ${dateField.table}.${dateField.field}) - FIRST(${closeField.table}.${closeField.field} BY ${dateField.table}.${dateField.field})) / FIRST(${closeField.table}.${closeField.field} BY ${dateField.table}.${dateField.field})`,
          expressionType: MetricExpressionType.RATE,
          unit: "percent",
          sourceFields: [closeField, dateField],
          tags: ["Stock", "Change", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      drafts.push({
        layer: MetricLayer.DIAGNOSTIC,
        category: "Market Performance",
        name: `${table} Close Range`,
        definition: "Highest and lowest close price range across the selected period",
        formula: `MAX(${closeField.table}.${closeField.field}) - MIN(${closeField.table}.${closeField.field})`,
        expressionType: MetricExpressionType.CALCULATION,
        unit: "currency",
        sourceFields: [closeField],
        tags: ["Stock", "Volatility", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });

      if (highField && lowField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "Market Performance",
          name: `${table} Volatility Range`,
          definition: "Average intraday range between high and low prices",
          formula: `AVG(${highField.table}.${highField.field} - ${lowField.table}.${lowField.field})`,
          expressionType: MetricExpressionType.CALCULATION,
          unit: "currency",
          sourceFields: [highField, lowField],
          tags: ["Stock", "Volatility", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (volumeField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "Market Performance",
          name: `${table} Average Volume`,
          definition: "Average trading volume across the selected period",
          formula: `AVG(${volumeField.table}.${volumeField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "count",
          sourceFields: [volumeField],
          tags: ["Stock", "Volume", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });

        if (dateField) {
          drafts.push({
            layer: MetricLayer.DIAGNOSTIC,
            category: "Market Performance",
            name: `${table} Max Volume Date`,
            definition: "Date with the highest trading volume",
            formula: `MAX_BY(${dateField.table}.${dateField.field}, ${volumeField.table}.${volumeField.field})`,
            expressionType: MetricExpressionType.CALCULATION,
            sourceFields: [dateField, volumeField],
            tags: ["Stock", "Volume", "AI Generated"],
            status: MetricStatus.NEEDS_VALIDATION
          });
        }
      }

      continue;
    }

    if (datasetType === "app_store" && appField) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "App Portfolio",
        name: `${table} App Count`,
        definition: "Total number of unique apps in the catalog dataset",
        formula: `COUNT_DISTINCT(${appField.table}.${appField.field})`,
        expressionType: MetricExpressionType.AGGREGATE,
        unit: "count",
        sourceFields: [appField],
        tags: ["App Store", "Portfolio", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });

      if (ratingField) {
        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "App Portfolio",
          name: `${table} Average Rating`,
          definition: "Average app rating across the catalog",
          formula: `AVG(${ratingField.table}.${ratingField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "score",
          sourceFields: [ratingField],
          tags: ["App Store", "Rating", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (reviewsField) {
        drafts.push({
          layer: MetricLayer.PRIMARY,
          category: "App Portfolio",
          name: `${table} Review Volume`,
          definition: "Total review volume reported in the app catalog",
          formula: `SUM(${reviewsField.table}.${reviewsField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "count",
          sourceFields: [reviewsField],
          tags: ["App Store", "Reviews", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (typeField) {
        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "App Portfolio",
          name: `${table} Free App Rate`,
          definition: "Share of apps marked as free in the catalog",
          formula: `SAFE_DIVIDE(COUNT_IF(${typeField.table}.${typeField.field} = 'Free'), COUNT_NON_EMPTY(${typeField.table}.${typeField.field}))`,
          expressionType: MetricExpressionType.RATE,
          unit: "percent",
          sourceFields: [typeField],
          tags: ["App Store", "Pricing", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (priceField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "App Portfolio",
          name: `${table} Average Price`,
          definition: "Average listed app price, not recognized revenue",
          formula: `AVG(${priceField.table}.${priceField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "currency",
          sourceFields: [priceField],
          tags: ["App Store", "Price", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (categoryField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "App Portfolio",
          name: `${table} Top Category`,
          definition: "Category distribution by app count",
          formula: `COUNT(${categoryField.table}.${categoryField.field}) BY ${categoryField.table}.${categoryField.field}`,
          expressionType: MetricExpressionType.CALCULATION,
          unit: "count",
          sourceFields: [categoryField],
          tags: ["App Store", "Category", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (installsField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "App Portfolio",
          name: `${table} Highest Install App`,
          definition: "App with the highest install count in the catalog",
          formula: `MAX_BY(${appField.table}.${appField.field}, ${installsField.table}.${installsField.field})`,
          expressionType: MetricExpressionType.CALCULATION,
          sourceFields: [appField, installsField],
          tags: ["App Store", "Installs", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (priceField && installsField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "App Portfolio",
          name: `${table} Estimated Revenue`,
          definition: "Estimated revenue proxy calculated from listed price and install count; not recognized revenue",
          formula: `SUM(${priceField.table}.${priceField.field} * ${installsField.table}.${installsField.field})`,
          expressionType: MetricExpressionType.CALCULATION,
          unit: "currency",
          sourceFields: [priceField, installsField],
          tags: ["App Store", "Estimated", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      continue;
    }

    if (datasetType === "review_sentiment") {
      const volumeField = reviewTextField ?? sentimentLabelField ?? sentimentPolarityField;

      if (volumeField) {
        drafts.push({
          layer: MetricLayer.PRIMARY,
          category: "Customer Feedback",
          name: `${table} Review Volume`,
          definition: "Total number of non-empty customer review or feedback records",
          formula: reviewTextField
            ? `COUNT_NON_EMPTY(${volumeField.table}.${volumeField.field})`
            : `COUNT(${volumeField.table}.${volumeField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "count",
          sourceFields: [volumeField],
          tags: ["Feedback", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (sentimentLabelField) {
        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "Customer Feedback",
          name: `${table} Positive Sentiment Rate`,
          definition: "Share of reviews classified as positive sentiment",
          formula: `SAFE_DIVIDE(COUNT_IF(${sentimentLabelField.table}.${sentimentLabelField.field} = 'Positive'), COUNT_NON_EMPTY(${sentimentLabelField.table}.${sentimentLabelField.field}))`,
          expressionType: MetricExpressionType.RATE,
          unit: "percent",
          sourceFields: [sentimentLabelField],
          tags: ["Sentiment", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });

        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "Customer Feedback",
          name: `${table} Negative Sentiment Rate`,
          definition: "Share of reviews classified as negative sentiment",
          formula: `SAFE_DIVIDE(COUNT_IF(${sentimentLabelField.table}.${sentimentLabelField.field} = 'Negative'), COUNT_NON_EMPTY(${sentimentLabelField.table}.${sentimentLabelField.field}))`,
          expressionType: MetricExpressionType.RATE,
          unit: "percent",
          sourceFields: [sentimentLabelField],
          tags: ["Sentiment", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (sentimentPolarityField) {
        drafts.push({
          layer: MetricLayer.DRIVER,
          category: "Customer Feedback",
          name: `${table} Average Sentiment Polarity`,
          definition: "Average sentiment polarity across review text",
          formula: `AVG(${sentimentPolarityField.table}.${sentimentPolarityField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "score",
          sourceFields: [sentimentPolarityField],
          tags: ["Sentiment", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (sentimentSubjectivityField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "Customer Feedback",
          name: `${table} Average Subjectivity`,
          definition: "Average subjectivity score across review text",
          formula: `AVG(${sentimentSubjectivityField.table}.${sentimentSubjectivityField.field})`,
          expressionType: MetricExpressionType.AGGREGATE,
          unit: "score",
          sourceFields: [sentimentSubjectivityField],
          tags: ["Feedback", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (appField && sentimentLabelField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "Customer Feedback",
          name: `${table} Negative Reviews by App`,
          definition: "Apps with the highest number of negative reviews",
          formula: `COUNT_IF(${sentimentLabelField.table}.${sentimentLabelField.field} = 'Negative') BY ${appField.table}.${appField.field}`,
          expressionType: MetricExpressionType.CALCULATION,
          unit: "count",
          sourceFields: [sentimentLabelField, appField],
          tags: ["Sentiment", "App", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      if (appField && sentimentPolarityField) {
        drafts.push({
          layer: MetricLayer.DIAGNOSTIC,
          category: "Customer Feedback",
          name: `${table} Lowest Sentiment App`,
          definition: "Apps with the lowest average sentiment polarity",
          formula: `AVG(${sentimentPolarityField.table}.${sentimentPolarityField.field}) BY ${appField.table}.${appField.field}`,
          expressionType: MetricExpressionType.CALCULATION,
          unit: "score",
          sourceFields: [sentimentPolarityField, appField],
          tags: ["Sentiment", "App", "AI Generated"],
          status: MetricStatus.NEEDS_VALIDATION
        });
      }

      continue;
    }
  }

  const genericFields = fields.filter((field) => detectDatasetType(tableFields(fields, field.table)) === "generic_business");
  const revenueField = firstField(genericFields, "revenue_value");
  const costField = firstField(genericFields, "cost_value");
  const customerField = firstField(genericFields, "entity_identifier");
  const activationField = firstField(genericFields, "activation_event");
  const retentionField = firstField(genericFields, "retention_signal");
  const performanceFields = fieldsByType(genericFields, "performance_value");
  const reviewCountField = firstField(genericFields, "review_count");
  const feedbackTextField = firstField(genericFields, "feedback_text");
  const sentimentScoreField = firstField(genericFields, "sentiment_score");
  const sentimentSubjectivityField = firstField(genericFields, "sentiment_subjectivity");
  const sentimentLabelField = firstField(genericFields, "sentiment_label");
  const productDimensionField = firstField(genericFields, "product_dimension");

  if (revenueField) {
    drafts.push({
      layer: MetricLayer.PRIMARY,
      category: "Revenue",
      name: "Revenue",
      definition: "Total monetary value recognized from mapped revenue fields",
      formula: `SUM(${revenueField.table}.${revenueField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "currency",
      sourceFields: [revenueField],
      tags: ["Revenue", "AI Generated", "Core KPI"],
      status: MetricStatus.NEEDS_VALIDATION
    });

    if (fieldIncludes(revenueField.field, ["mrr"])) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "Revenue",
        name: "ARR",
        definition: "Annual recurring revenue estimated from recurring monthly revenue",
        formula: `SUM(${revenueField.table}.${revenueField.field}) * 12`,
        expressionType: MetricExpressionType.CALCULATION,
        unit: "currency",
        sourceFields: [revenueField],
        tags: ["Revenue", "Recurring", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });
    }
  }

  if (customerField) {
    drafts.push({
      layer: MetricLayer.PRIMARY,
      category: "Customer",
      name: "Active Customers",
      definition: "Distinct active customer or user identities found in connected data",
      formula: `COUNT_DISTINCT(${customerField.table}.${customerField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "count",
      sourceFields: [customerField],
      tags: ["Customer", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (costField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Acquisition",
      name: "CAC",
      definition: "Acquisition cost divided by new customer count",
      formula: `SAFE_DIVIDE(SUM(${costField.table}.${costField.field}), COUNT_DISTINCT(${customerField.table}.${customerField.field}))`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: "currency",
      sourceFields: [costField, customerField],
      tags: ["Acquisition", "Cost", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (activationField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Activation",
      name: "Activation Rate",
      definition: "Share of users or accounts reaching an activation or onboarding milestone",
      formula: `SAFE_DIVIDE(COUNT(${activationField.table}.${activationField.field}), COUNT_DISTINCT(${customerField.table}.${customerField.field}))`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [activationField, customerField],
      tags: ["Activation", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (retentionField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Retention",
      name: "Retention",
      definition: "Customer continuity signal inferred from status, renewal, or churn fields",
      formula: `SAFE_DIVIDE(COUNT_ACTIVE(${retentionField.table}.${retentionField.field}), COUNT_DISTINCT(${customerField.table}.${customerField.field}))`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [retentionField, customerField],
      tags: ["Retention", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (performanceFields.length > 0) {
    const field = performanceFields[0];
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Performance",
      name: `Average ${field.field}`,
      definition: `Average movement of ${field.field} from uploaded or connected records`,
      formula: `AVG(${field.table}.${field.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      sourceFields: [field],
      tags: ["Performance", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (reviewCountField || feedbackTextField || sentimentLabelField || sentimentScoreField) {
    const field = reviewCountField ?? feedbackTextField ?? sentimentLabelField ?? sentimentScoreField;

    if (field) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "Customer Feedback",
        name: "Review Volume",
        definition: "Total number of non-empty customer review or feedback records",
        formula: reviewCountField
          ? `SUM(${field.table}.${field.field})`
          : `COUNT_NON_EMPTY(${field.table}.${field.field})`,
        expressionType: MetricExpressionType.AGGREGATE,
        unit: "count",
        sourceFields: [field],
        tags: ["Feedback", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });
    }
  }

  if (sentimentScoreField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Customer Feedback",
      name: "Average Sentiment Score",
      definition: "Average customer sentiment polarity or rating score",
      formula: `AVG(${sentimentScoreField.table}.${sentimentScoreField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "score",
      sourceFields: [sentimentScoreField],
      tags: ["Sentiment", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (sentimentLabelField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Customer Feedback",
      name: "Positive Sentiment Rate",
      definition: "Share of reviews classified as positive sentiment",
      formula: `SAFE_DIVIDE(COUNT_IF(${sentimentLabelField.table}.${sentimentLabelField.field} = 'Positive'), COUNT_NON_EMPTY(${sentimentLabelField.table}.${sentimentLabelField.field}))`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [sentimentLabelField],
      tags: ["Sentiment", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (sentimentSubjectivityField) {
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Customer Feedback",
      name: "Average Subjectivity",
      definition: "Average subjectivity score across review text",
      formula: `AVG(${sentimentSubjectivityField.table}.${sentimentSubjectivityField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "score",
      sourceFields: [sentimentSubjectivityField],
      tags: ["Feedback", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (productDimensionField && sentimentScoreField) {
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Customer Feedback",
      name: "Sentiment by Product",
      definition: "Average sentiment score grouped by product, app, or item",
      formula: `AVG(${sentimentScoreField.table}.${sentimentScoreField.field}) BY ${productDimensionField.table}.${productDimensionField.field}`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: "score",
      sourceFields: [sentimentScoreField, productDimensionField],
      tags: ["Sentiment", "Product", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  return drafts;
}

export function buildSemanticLayer(tables: IntrospectedTable[]): SemanticLayerResult {
  const kpiAssetLibrary = buildKpiAssetLibrary(tables);
  const inferredFields = tables.flatMap((table) => {
    const key = tableKey(table);

    return table.columns.flatMap((column) => {
      const semantic = inferSemanticType(column.name, table.name);

      if (!semantic) {
        return [];
      }

      return [{
        table: key,
        field: safeIdentifier(column.name),
        displayField: column.name,
        dataType: column.type,
        ...semantic
      }];
    });
  });
  const existingFieldKeys = new Set(inferredFields.map((field) => `${field.table}.${field.field}`));
  const kpiFields = kpiAssetLibrary.kpi_registry.flatMap((asset) =>
    asset.source_columns.flatMap((reference) => {
      const separatorIndex = reference.lastIndexOf(".");
      const table = separatorIndex >= 0 ? reference.slice(0, separatorIndex) : "";
      const rawField = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : reference;
      const field = safeIdentifier(rawField);
      const key = `${table}.${field}`;

      if (existingFieldKeys.has(key)) {
        return [];
      }

      existingFieldKeys.add(key);
      return [{
        table,
        field,
        displayField: rawField,
        dataType: null,
        semanticType: "business_kpi_column",
        businessMeaning: asset.definition,
        confidence: 0.88
      }];
    })
  );
  const fields = [...inferredFields, ...kpiFields];

  const entities = inferBusinessEntities(tables, fields);
  const { metricGeneration, metrics: generatedMetrics } = metricDraftsFromIndustryGenerator(tables, fields);
  const kpiAssetMetrics = metricDraftsFromKpiAssetLibrary(kpiAssetLibrary, fields);
  const metrics = dedupeMetricDrafts(kpiAssetMetrics.length > 0 ? kpiAssetMetrics : generatedMetrics);

  return { fields, entities, metrics, metricGeneration, kpiAssetLibrary };
}

export async function generateSemanticMetrics(
  tx: SemanticTransaction,
  {
    workspaceId,
    userId,
    semanticLayer,
    deactivateStale = true
  }: {
    workspaceId: string;
    userId?: string | null;
    semanticLayer: SemanticLayerResult;
    deactivateStale?: boolean;
  }
) {
  const dedupedMetrics = dedupeMetricDrafts(semanticLayer.metrics);
  const currentMetricNames = dedupedMetrics.map((metric) => metric.name);
  const currentMetricKeys = new Set(dedupedMetrics.map((metric) => metricDedupeKey(metric.name)));

  if (currentMetricNames.length === 0) {
    return 0;
  }

  if (deactivateStale) {
    await tx.metricDefinition.updateMany({
      where: {
        workspaceId,
        maintainerRole: MetricMaintainerRole.AI,
        isActive: true,
        name: {
          notIn: currentMetricNames
        }
      },
      data: {
        isActive: false
      }
    });
  }

  const existingAiMetrics = await tx.metricDefinition.findMany({
    where: {
      workspaceId,
      maintainerRole: MetricMaintainerRole.AI,
      isActive: true
    },
    select: {
      id: true,
      name: true
    }
  });
  const seenExistingKeys = new Set<string>();
  const duplicateExistingMetricIds: string[] = [];

  for (const metric of existingAiMetrics) {
    const key = metricDedupeKey(metric.name);

    if (!currentMetricKeys.has(key)) {
      continue;
    }

    if (seenExistingKeys.has(key) || !currentMetricNames.includes(metric.name)) {
      duplicateExistingMetricIds.push(metric.id);
      continue;
    }

    seenExistingKeys.add(key);
  }

  if (duplicateExistingMetricIds.length > 0) {
    await tx.metricDefinition.updateMany({
      where: {
        id: {
          in: duplicateExistingMetricIds
        }
      },
      data: {
        isActive: false
      }
    });
  }

  for (const metric of dedupedMetrics) {
    await tx.metricDefinition.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: metric.name
        }
      },
      create: {
        workspaceId,
        layer: metric.layer,
        category: metric.category,
        name: metric.name,
        definition: metric.definition,
        formula: metric.formula,
        expressionType: metric.expressionType,
        unit: metric.unit,
        mappingJson: {
          sourceFields: metric.sourceFields
        },
        lineageJson: {
          generatedFrom: metric.businessType === "semantic_kpi_asset" ? "semantic_kpi_asset_library" : "schema_semantic_detection",
          metricId: metricDedupeKey(metric.name),
          semanticTypes: metric.sourceFields.map((field) => field.semanticType),
          confidence: metric.confidence ?? null,
          riskLevel: metric.riskLevel ?? null,
          displayName: metric.displayName ?? metric.name,
          unit: metric.unit ?? null,
          metricType: metric.metricType ?? "core_metric",
          metricCategory: metric.metricCategory ?? metric.category,
          businessType: metric.businessType ?? null,
          metricDirection: metric.metricDirection ?? null,
          priority: metric.priority ?? null,
          isCoreMetric: metric.metricType === "core_metric",
          isBusinessMetric: true,
          sourceDataset: metric.sourceDataset ?? metric.sourceFields[0]?.table ?? null,
          isBenchmarkMetric: metric.isBenchmarkMetric ?? false,
          isEstimated: metric.isEstimated ?? false,
          requiresDeduplication: metric.requiresDeduplication ?? false,
          warning: metric.warning ?? null,
          validationRules: metric.validationRules ?? [],
          warnings: metric.warnings ?? []
        },
        maintainerRole: MetricMaintainerRole.AI,
        maintainerUserId: userId ?? null,
        status: metric.status,
        tagsJson: metric.tags
      },
      update: {
        isActive: true,
        layer: metric.layer,
        category: metric.category,
        definition: metric.definition,
        formula: metric.formula,
        expressionType: metric.expressionType,
        unit: metric.unit,
        mappingJson: {
          sourceFields: metric.sourceFields
        },
        lineageJson: {
          generatedFrom: metric.businessType === "semantic_kpi_asset" ? "semantic_kpi_asset_library" : "schema_semantic_detection",
          metricId: metricDedupeKey(metric.name),
          semanticTypes: metric.sourceFields.map((field) => field.semanticType),
          confidence: metric.confidence ?? null,
          riskLevel: metric.riskLevel ?? null,
          displayName: metric.displayName ?? metric.name,
          unit: metric.unit ?? null,
          metricType: metric.metricType ?? "core_metric",
          metricCategory: metric.metricCategory ?? metric.category,
          businessType: metric.businessType ?? null,
          metricDirection: metric.metricDirection ?? null,
          priority: metric.priority ?? null,
          isCoreMetric: metric.metricType === "core_metric",
          isBusinessMetric: true,
          sourceDataset: metric.sourceDataset ?? metric.sourceFields[0]?.table ?? null,
          isBenchmarkMetric: metric.isBenchmarkMetric ?? false,
          isEstimated: metric.isEstimated ?? false,
          requiresDeduplication: metric.requiresDeduplication ?? false,
          warning: metric.warning ?? null,
          validationRules: metric.validationRules ?? [],
          warnings: metric.warnings ?? []
        },
        maintainerRole: MetricMaintainerRole.AI,
        maintainerUserId: userId ?? null,
        status: metric.status,
        tagsJson: metric.tags
      }
    });
  }

  return semanticLayer.metrics.length;
}
