export type Industry =
  | "app_marketplace"
  | "ecommerce"
  | "saas"
  | "finance_stock"
  | "ads"
  | "content"
  | "crm_sales"
  | "support"
  | "logistics"
  | "hr"
  | "review_sentiment"
  | "unknown";

export type MetricRiskLevel = "low" | "medium" | "high";

export type GeneratedMetricType =
  | "core_metric"
  | "comparison_metric"
  | "distribution_metric"
  | "concentration_metric"
  | "trend_metric"
  | "quality_metric"
  | "risk_metric"
  | "limitation_metric";

export type MetricColumnType = "string" | "number" | "date" | "boolean" | "unknown";

export type MetricInputColumn = {
  name: string;
  type: MetricColumnType;
  nullable?: boolean;
  sampleValues?: unknown[];
  uniqueRatio?: number;
  min?: number;
  max?: number;
  avg?: number;
};

export type MetricInputTable = {
  tableName: string;
  columns: MetricInputColumn[];
  rowCount?: number;
  sampleRows?: Record<string, unknown>[];
};

export type MetricGenerationInput = {
  tables: MetricInputTable[];
};

export type DetectedIndustry = {
  primary: Industry;
  confidence: number;
  reasons: string[];
  secondaryCandidates?: Array<{
    industry: Industry;
    confidence: number;
    reasons: string[];
  }>;
};

export type BusinessEntity = {
  entity: string;
  tableName: string;
  confidence: number;
  evidence: string[];
};

export type GeneratedMetricDefinition = {
  id: string;
  name: string;
  displayName?: string;
  category: string;
  description: string;
  formula: string;
  metricType?: GeneratedMetricType;
  metricCategory?: string;
  businessType?: string;
  sourceDataset?: string;
  requiredFields: string[];
  grain: "row" | "daily" | "weekly" | "monthly" | "user" | "order" | "product" | "account" | "unknown";
  aggregation: "sum" | "avg" | "count" | "count_distinct" | "ratio" | "derived";
  unit?: string;
  isBenchmarkMetric?: boolean;
  isEstimated?: boolean;
  requiresDeduplication?: boolean;
  warning?: string;
  confidence: number;
  riskLevel: MetricRiskLevel;
  validationRules: string[];
  warnings?: string[];
};

export type RejectedMetric = {
  name: string;
  reason: string;
  missingFields?: string[];
  riskLevel: "medium" | "high";
};

export type MetricGenerationOutput = {
  detectedIndustry: DetectedIndustry;
  businessEntities: BusinessEntity[];
  metrics: GeneratedMetricDefinition[];
  rejectedMetrics: RejectedMetric[];
};
