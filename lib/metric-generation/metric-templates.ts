import type {
  GeneratedMetricDefinition,
  GeneratedMetricType,
  Industry,
  MetricInputColumn,
  MetricInputTable,
  RejectedMetric
} from "@/lib/metric-generation/metric-types";
import {
  directRevenueColumn,
  findColumn,
  findNumericColumn,
  missingFields,
  qualifiedField,
  safeDivide,
  safeIdentifier
} from "@/lib/metric-generation/metric-safety-rules";

type TemplateResult = {
  metrics: GeneratedMetricDefinition[];
  rejectedMetrics: RejectedMetric[];
};

function metricId(table: MetricInputTable, name: string) {
  return `${safeIdentifier(table.tableName)}_${safeIdentifier(name)}`.toLowerCase();
}

function makeMetric(
  table: MetricInputTable,
  metric: Omit<GeneratedMetricDefinition, "id" | "requiredFields"> & { requiredFields: MetricInputColumn[] }
): GeneratedMetricDefinition {
  return {
    ...metric,
    id: metricId(table, metric.name),
    displayName: metric.displayName ?? metric.name,
    metricType: metric.metricType ?? "core_metric",
    metricCategory: metric.metricCategory ?? metric.category,
    businessType: metric.businessType,
    sourceDataset: metric.sourceDataset ?? table.tableName,
    requiredFields: metric.requiredFields.map((field) => `${table.tableName}.${safeIdentifier(field.name)}`)
  };
}

function reject(name: string, reason: string, missing: string[] = [], riskLevel: "medium" | "high" = "high"): RejectedMetric {
  return { name, reason, missingFields: missing, riskLevel };
}

function addIfDefined<T>(items: T[], item: T | null | undefined) {
  if (item) items.push(item);
}

function normalizedColumnName(column: MetricInputColumn) {
  return column.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isInternalBooleanColumn(column: MetricInputColumn) {
  const name = normalizedColumnName(column);

  return column.type === "boolean" ||
    [
      "isactive",
      "is_active",
      "active_flag",
      "deleted",
      "enabled",
      "flag",
      "row_id",
      "system_id",
      "internal_id",
      "internal_status"
    ].includes(name);
}

function benchmarkMetric(
  table: MetricInputTable,
  column: MetricInputColumn,
  name: string,
  category: string,
  formula: string,
  metricType: GeneratedMetricType,
  description: string,
  confidence = 0.82,
  businessType?: Industry
) {
  return makeMetric(table, {
    name,
    category,
    description,
    formula,
    requiredFields: [column],
    grain: "row",
    aggregation: metricType === "distribution_metric" ? "derived" : "ratio",
    metricType,
    metricCategory: category,
    businessType,
    isBenchmarkMetric: true,
    confidence,
    riskLevel: "low",
    validationRules: ["benchmark metric uses an existing numeric field"]
  });
}

function numericDistributionMetrics(
  table: MetricInputTable,
  column: MetricInputColumn,
  label: string,
  category: string,
  businessType: Industry
) {
  const field = qualifiedField(table, column);

  return [
    benchmarkMetric(table, column, `Median ${label}`, category, `MEDIAN(${field})`, "distribution_metric", `Median ${label} used as a baseline against the average`, 0.84, businessType),
    benchmarkMetric(table, column, `${label} P75`, category, `PERCENTILE(${field}, 0.75)`, "distribution_metric", `75th percentile of ${label}`, 0.82, businessType),
    benchmarkMetric(table, column, `${label} P90`, category, `PERCENTILE(${field}, 0.90)`, "distribution_metric", `90th percentile of ${label}`, 0.82, businessType),
    benchmarkMetric(table, column, `${label} Mean Median Ratio`, category, safeDivide(`AVG(${field})`, `MEDIAN(${field})`), "comparison_metric", `Average-to-median ratio for judging long-tail concentration`, 0.8, businessType),
    benchmarkMetric(table, column, `Minimum ${label}`, category, `MIN(${field})`, "distribution_metric", `Minimum observed ${label}`, 0.78, businessType),
    benchmarkMetric(table, column, `Maximum ${label}`, category, `MAX(${field})`, "distribution_metric", `Maximum observed ${label}`, 0.78, businessType),
    benchmarkMetric(table, column, `${label} StdDev`, category, `STDDEV(${field})`, businessType === "finance_stock" ? "risk_metric" : "distribution_metric", `Standard deviation of ${label}`, 0.78, businessType)
  ];
}

function topShareMetrics(
  table: MetricInputTable,
  entity: MetricInputColumn,
  value: MetricInputColumn,
  label: string,
  category: string
) {
  const field = qualifiedField(table, value);
  const dimension = qualifiedField(table, entity);

  return [1, 5, 10].map((count) => makeMetric(table, {
    name: `Top ${count} ${entity.name} ${label} Share`,
    category,
    description: `Share of total ${label} contributed by the top ${count} ${entity.name}`,
    formula: `TOP_N_SHARE(SUM(${field}) BY ${dimension}, ${count})`,
    requiredFields: [value, entity],
    grain: "product",
    aggregation: "ratio",
    metricType: "concentration_metric",
    metricCategory: category,
    isBenchmarkMetric: true,
    confidence: 0.78,
    riskLevel: "medium",
    validationRules: ["entity field and numeric value field must exist", "used for concentration analysis"],
    warnings: count === 1
      ? ["system_default_threshold: top1_share > 0.5 indicates single-object concentration risk"]
      : count === 5
        ? ["system_default_threshold: top5_share > 0.8 indicates head concentration risk"]
        : undefined
  }));
}

function groupComparisonMetrics(
  table: MetricInputTable,
  dimension: MetricInputColumn | undefined,
  value: MetricInputColumn | undefined,
  label: string,
  category: string
) {
  if (!dimension || !value) return [];
  const field = qualifiedField(table, value);
  const group = qualifiedField(table, dimension);

  return [
    makeMetric(table, {
      name: `${label} by ${dimension.name}`,
      category,
      description: `${label} grouped by ${dimension.name} for contribution and segment comparison`,
      formula: `SUM(${field}) BY ${group}`,
      requiredFields: [value, dimension],
      grain: "product",
      aggregation: "sum",
      metricType: "comparison_metric",
      metricCategory: category,
      isBenchmarkMetric: true,
      confidence: 0.8,
      riskLevel: "low",
      validationRules: ["group field should be categorical", "value field must be numeric"]
    }),
    makeMetric(table, {
      name: `Average ${label} by ${dimension.name}`,
      category,
      description: `Average ${label} grouped by ${dimension.name}`,
      formula: `AVG(${field}) BY ${group}`,
      requiredFields: [value, dimension],
      grain: "product",
      aggregation: "avg",
      metricType: "comparison_metric",
      metricCategory: category,
      isBenchmarkMetric: true,
      confidence: 0.78,
      riskLevel: "low",
      validationRules: ["group field should be categorical", "value field must be numeric"]
    })
  ];
}

function appMarketplaceMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const rejectedMetrics: RejectedMetric[] = [];
  const app = findColumn(table, ["app", "app_id", "package_name"]);
  const rating = findNumericColumn(table, ["rating", "score"]);
  const reviews = findNumericColumn(table, ["reviews", "review_count"]);
  const installs = findNumericColumn(table, ["installs", "downloads"]);
  const price = findNumericColumn(table, ["price", "unit_price", "list_price"]);
  const category = findColumn(table, ["category", "product_category"]);
  const type = findColumn(table, ["type", "free_paid"]);

  addIfDefined(metrics, app && makeMetric(table, {
    name: "Total Apps",
    category: "Overview",
    description: "Total number of unique apps in the marketplace dataset",
    formula: `COUNT_DISTINCT(${qualifiedField(table, app)})`,
    requiredFields: [app],
    grain: "product",
    aggregation: "count_distinct",
    metricType: "core_metric",
    businessType: "app_marketplace",
    confidence: 0.92,
    riskLevel: "low",
    validationRules: ["app field must exist", "formula uses count distinct"]
  }));

  addIfDefined(metrics, rating && makeMetric(table, {
    name: "Average Rating",
    category: "Quality",
    description: "Average rating across all apps",
    formula: `AVG(${qualifiedField(table, rating)})`,
    requiredFields: [rating],
    grain: "product",
    aggregation: "avg",
    metricType: "quality_metric",
    businessType: "app_marketplace",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["rating field must be numeric"]
  }));

  addIfDefined(metrics, reviews && makeMetric(table, {
    name: "Total Reviews",
    category: "Engagement",
    description: "Total review volume across apps",
    formula: `SUM(${qualifiedField(table, reviews)})`,
    requiredFields: [reviews],
    grain: "product",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "app_marketplace",
    requiresDeduplication: Boolean(app),
    warning: app ? "该指标基于原始记录聚合，如果同一 App 重复出现，可能被放大。" : undefined,
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["reviews field must be numeric", "review count uses SUM, not COUNT"]
  }));

  addIfDefined(metrics, installs && makeMetric(table, {
    name: "Total Installs",
    category: "Growth",
    description: "Total install count across apps",
    formula: `SUM(${qualifiedField(table, installs)})`,
    requiredFields: [installs],
    grain: "product",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "app_marketplace",
    requiresDeduplication: Boolean(app),
    warning: app ? "该指标基于原始记录聚合，如果同一 App 重复出现，可能被放大。" : undefined,
    confidence: 0.86,
    riskLevel: "low",
    validationRules: ["installs field must be numeric"]
  }));

  addIfDefined(metrics, installs && app && makeMetric(table, {
    name: "Average Installs per App",
    category: "Growth",
    description: "Average install count per app",
    formula: safeDivide(`SUM(${qualifiedField(table, installs)})`, `COUNT_DISTINCT(${qualifiedField(table, app)})`),
    requiredFields: [installs, app],
    grain: "product",
    aggregation: "ratio",
    metricType: "comparison_metric",
    businessType: "app_marketplace",
    confidence: 0.84,
    riskLevel: "low",
    validationRules: ["installs field must be numeric", "app field must exist", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, price && app && makeMetric(table, {
    name: "Paid App Ratio",
    category: "Monetization",
    description: "Share of unique apps with a listed price above zero",
    formula: safeDivide(
      `COUNT_DISTINCT_IF(${qualifiedField(table, app)}, ${qualifiedField(table, price)} > 0)`,
      `COUNT_DISTINCT(${qualifiedField(table, app)})`
    ),
    requiredFields: [price, app],
    grain: "product",
    aggregation: "ratio",
    metricType: "quality_metric",
    businessType: "app_marketplace",
    confidence: 0.84,
    riskLevel: "low",
    validationRules: [
      "price field must be numeric",
      "app field must exist",
      "uses unique app denominator",
      "uses SAFE_DIVIDE"
    ]
  }));

  addIfDefined(metrics, price && installs && makeMetric(table, {
    name: "Estimated Paid App Install Value",
    category: "Monetization",
    description: "Estimated value from listed price multiplied by installs; not recognized revenue",
    formula: `SUM(${qualifiedField(table, price)} * ${qualifiedField(table, installs)})`,
    requiredFields: [price, installs],
    grain: "product",
    aggregation: "derived",
    metricType: "limitation_metric",
    businessType: "app_marketplace",
    isEstimated: true,
    warning: "该指标为估算值，不代表真实收入或真实业务结果。",
    confidence: 0.78,
    riskLevel: "medium",
    validationRules: ["price and installs fields must be numeric", "must remain labeled as estimated"],
    warnings: ["Estimated only. Installs may not represent actual paid purchases."]
  }));

  if (rating) {
    metrics.push(...numericDistributionMetrics(table, rating, "Rating", "Quality", "app_marketplace"));
  }

  if (installs) {
    metrics.push(...numericDistributionMetrics(table, installs, "Installs", "Growth", "app_marketplace"));
  }

  if (reviews) {
    metrics.push(...numericDistributionMetrics(table, reviews, "Reviews", "Engagement", "app_marketplace"));
  }

  if (price) {
    metrics.push(...numericDistributionMetrics(table, price, "Price", "Monetization", "app_marketplace"));
  }

  if (app && installs) {
    metrics.push(...topShareMetrics(table, app, installs, "Installs", "Growth"));
  }

  if (app && reviews) {
    metrics.push(...topShareMetrics(table, app, reviews, "Reviews", "Engagement"));
  }

  metrics.push(...groupComparisonMetrics(table, category, installs, "Installs", "Growth"));
  metrics.push(...groupComparisonMetrics(table, category, reviews, "Reviews", "Engagement"));
  metrics.push(...groupComparisonMetrics(table, category, rating, "Rating", "Quality"));
  metrics.push(...groupComparisonMetrics(table, type, installs, "Installs", "Growth"));

  rejectedMetrics.push(reject(
    "Revenue",
    "Price alone does not represent actual revenue or paid transaction amount.",
    ["paid_amount", "order_amount", "transaction_amount", "revenue"]
  ));

  return { metrics, rejectedMetrics };
}

function financeStockMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const rejectedMetrics: RejectedMetric[] = [];
  const date = findColumn(table, ["date", "timestamp"]);
  const close = findNumericColumn(table, ["close", "adj_close", "adjusted_close"]);
  const high = findNumericColumn(table, ["high"]);
  const low = findNumericColumn(table, ["low"]);
  const volume = findNumericColumn(table, ["volume"]);

  addIfDefined(metrics, close && makeMetric(table, {
    name: "Average Close Price",
    category: "Price",
    description: "Average close price across the available period",
    formula: `AVG(${qualifiedField(table, close)})`,
    requiredFields: [close],
    grain: date ? "daily" : "row",
    aggregation: "avg",
    metricType: "core_metric",
    businessType: "finance_stock",
    confidence: 0.92,
    riskLevel: "low",
    validationRules: ["close field must be numeric"]
  }));

  addIfDefined(metrics, volume && makeMetric(table, {
    name: "Total Trading Volume",
    category: "Liquidity",
    description: "Total trading volume across the available period",
    formula: `SUM(${qualifiedField(table, volume)})`,
    requiredFields: [volume],
    grain: date ? "daily" : "row",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "finance_stock",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["volume field must be numeric"]
  }));

  addIfDefined(metrics, close && date && makeMetric(table, {
    name: "Daily Return",
    category: "Return",
    description: "Daily return calculated from close price movement",
    formula: safeDivide(`(${qualifiedField(table, close)} - LAG(${qualifiedField(table, close)}))`, `LAG(${qualifiedField(table, close)})`),
    requiredFields: [close, date],
    grain: "daily",
    aggregation: "derived",
    metricType: "trend_metric",
    businessType: "finance_stock",
    confidence: 0.86,
    riskLevel: "medium",
    validationRules: ["close and date fields must exist", "uses SAFE_DIVIDE"],
    warnings: ["Requires ordered time series calculation."]
  }));

  addIfDefined(metrics, close && makeMetric(table, {
    name: "Close Price StdDev",
    category: "Risk",
    description: "Standard deviation of close price; not annualized return volatility",
    formula: `STDDEV(${qualifiedField(table, close)})`,
    requiredFields: [close],
    grain: date ? "daily" : "row",
    aggregation: "derived",
    metricType: "distribution_metric",
    businessType: "finance_stock",
    confidence: 0.82,
    riskLevel: "medium",
    validationRules: ["close field must be numeric"],
    warnings: ["This is close price dispersion. Financial volatility should be based on daily returns."]
  }));

  addIfDefined(metrics, high && low && makeMetric(table, {
    name: "Average Daily Range",
    category: "Volatility",
    description: "Average daily range between high and low prices",
    formula: `AVG(${qualifiedField(table, high)} - ${qualifiedField(table, low)})`,
    requiredFields: [high, low],
    grain: date ? "daily" : "row",
    aggregation: "derived",
    metricType: "risk_metric",
    businessType: "finance_stock",
    confidence: 0.88,
    riskLevel: "low",
    validationRules: ["high and low fields must be numeric"]
  }));

  if (close) {
    metrics.push(...numericDistributionMetrics(table, close, "Close Price", "Price", "finance_stock"));
  }

  if (volume) {
    metrics.push(...numericDistributionMetrics(table, volume, "Trading Volume", "Liquidity", "finance_stock"));
  }

  if (date && close) {
    metrics.push(makeMetric(table, {
      name: "Close Price by Date",
      category: "Price",
      description: "Close price by date for trend comparison",
      formula: `AVG(${qualifiedField(table, close)}) BY ${qualifiedField(table, date)}`,
      requiredFields: [close, date],
      grain: "daily",
      aggregation: "avg",
      metricType: "trend_metric",
      metricCategory: "Price",
      businessType: "finance_stock",
      isBenchmarkMetric: true,
      confidence: 0.84,
      riskLevel: "low",
      validationRules: ["date and close fields must exist"]
    }));
  }

  if (date && volume) {
    metrics.push(makeMetric(table, {
      name: "Trading Volume by Date",
      category: "Liquidity",
      description: "Trading volume by date for volume trend comparison",
      formula: `SUM(${qualifiedField(table, volume)}) BY ${qualifiedField(table, date)}`,
      requiredFields: [volume, date],
      grain: "daily",
      aggregation: "sum",
      metricType: "trend_metric",
      metricCategory: "Liquidity",
      businessType: "finance_stock",
      isBenchmarkMetric: true,
      confidence: 0.84,
      riskLevel: "low",
      validationRules: ["date and volume fields must exist"]
    }));
  }

  if (!date) {
    rejectedMetrics.push(reject("Daily Return", "Time series metrics require a date or timestamp field.", ["date"], "medium"));
  }

  rejectedMetrics.push(reject("Revenue", "Stock price datasets do not contain business revenue fields.", ["revenue", "paid_amount"], "high"));
  rejectedMetrics.push(reject("Users", "Stock price datasets do not contain user identity fields.", ["user_id", "customer_id"], "high"));

  return { metrics, rejectedMetrics };
}

function ecommerceMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const rejectedMetrics: RejectedMetric[] = [];
  const order = findColumn(table, ["order_id", "transaction_id", "invoice_id"]);
  const customer = findColumn(table, ["customer_id", "user_id", "client_id"]);
  const price = findNumericColumn(table, ["price", "unit_price"]);
  const quantity = findNumericColumn(table, ["quantity", "units"]);
  const revenue = directRevenueColumn(table);
  const product = findColumn(table, ["product_id", "product", "sku", "item"]);
  const category = findColumn(table, ["category", "product_category"]);

  addIfDefined(metrics, order && makeMetric(table, {
    name: "Total Orders",
    category: "Sales",
    description: "Total unique orders",
    formula: `COUNT_DISTINCT(${qualifiedField(table, order)})`,
    requiredFields: [order],
    grain: "order",
    aggregation: "count_distinct",
    metricType: "core_metric",
    businessType: "ecommerce",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["order identifier must exist"]
  }));

  addIfDefined(metrics, customer && makeMetric(table, {
    name: "Total Customers",
    category: "Customer",
    description: "Total unique customers",
    formula: `COUNT_DISTINCT(${qualifiedField(table, customer)})`,
    requiredFields: [customer],
    grain: "user",
    aggregation: "count_distinct",
    metricType: "core_metric",
    businessType: "ecommerce",
    confidence: 0.88,
    riskLevel: "low",
    validationRules: ["customer identifier must exist"]
  }));

  addIfDefined(metrics, revenue && makeMetric(table, {
    name: "Revenue",
    category: "Revenue",
    description: "Recognized revenue based on explicit paid or transaction amount",
    formula: `SUM(${qualifiedField(table, revenue)})`,
    requiredFields: [revenue],
    grain: "order",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "ecommerce",
    confidence: 0.91,
    riskLevel: "low",
    validationRules: ["revenue field must be an explicit paid or transaction amount"]
  }));

  addIfDefined(metrics, !revenue && price && quantity && makeMetric(table, {
    name: "Estimated GMV",
    category: "Revenue",
    description: "Estimated merchandise value from price and quantity",
    formula: `SUM(${qualifiedField(table, price)} * ${qualifiedField(table, quantity)})`,
    requiredFields: [price, quantity],
    grain: "order",
    aggregation: "derived",
    metricType: "limitation_metric",
    businessType: "ecommerce",
    isEstimated: true,
    warning: "该指标为估算值，因为没有明确的 paid_amount / order_amount / transaction_amount 字段。",
    confidence: 0.78,
    riskLevel: "medium",
    validationRules: ["price and quantity fields must be numeric", "must remain labeled as estimated"],
    warnings: ["Estimated GMV because no explicit paid amount field was found."]
  }));

  if (!revenue && !(price && quantity)) {
    rejectedMetrics.push(reject("Revenue", "No explicit revenue field or price plus quantity pair was found.", missingFields(["paid_amount", "order_amount", "price", "quantity"])));
  }

  const valueField = revenue ?? price;

  if (valueField) {
    metrics.push(...numericDistributionMetrics(table, valueField, revenue ? "Revenue" : "Price", "Revenue", "ecommerce"));
  }

  if (quantity) {
    metrics.push(...numericDistributionMetrics(table, quantity, "Quantity", "Sales", "ecommerce"));
  }

  if (product && valueField) {
    metrics.push(...topShareMetrics(table, product, valueField, revenue ? "Revenue" : "Price", "Revenue"));
  }

  metrics.push(...groupComparisonMetrics(table, category, valueField, revenue ? "Revenue" : "Price", "Revenue"));

  return { metrics, rejectedMetrics };
}

function saasMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const account = findColumn(table, ["account_id", "customer_id", "client_id"]);
  const mrr = findNumericColumn(table, ["mrr"]);
  const arr = findNumericColumn(table, ["arr"]);

  addIfDefined(metrics, mrr && makeMetric(table, {
    name: "Monthly Recurring Revenue",
    category: "Revenue",
    description: "Total monthly recurring revenue",
    formula: `SUM(${qualifiedField(table, mrr)})`,
    requiredFields: [mrr],
    grain: "account",
    aggregation: "sum",
    confidence: 0.93,
    riskLevel: "low",
    validationRules: ["mrr field must be numeric"]
  }));

  addIfDefined(metrics, arr && makeMetric(table, {
    name: "Annual Recurring Revenue",
    category: "Revenue",
    description: "Total annual recurring revenue",
    formula: `SUM(${qualifiedField(table, arr)})`,
    requiredFields: [arr],
    grain: "account",
    aggregation: "sum",
    confidence: 0.93,
    riskLevel: "low",
    validationRules: ["arr field must be numeric"]
  }));

  addIfDefined(metrics, mrr && account && makeMetric(table, {
    name: "ARPA",
    category: "Revenue",
    description: "Average recurring revenue per account",
    formula: safeDivide(`SUM(${qualifiedField(table, mrr)})`, `COUNT_DISTINCT(${qualifiedField(table, account)})`),
    requiredFields: [mrr, account],
    grain: "account",
    aggregation: "ratio",
    confidence: 0.86,
    riskLevel: "low",
    validationRules: ["mrr and account identifier must exist", "uses SAFE_DIVIDE"]
  }));

  return { metrics, rejectedMetrics: [] };
}

function adsMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const impressions = findNumericColumn(table, ["impressions"]);
  const clicks = findNumericColumn(table, ["clicks"]);
  const spend = findNumericColumn(table, ["spend", "cost"]);
  const conversions = findNumericColumn(table, ["conversions", "conversion"]);

  addIfDefined(metrics, impressions && makeMetric(table, {
    name: "Impressions",
    category: "Reach",
    description: "Total ad impressions",
    formula: `SUM(${qualifiedField(table, impressions)})`,
    requiredFields: [impressions],
    grain: "unknown",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "ads",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["impressions field must be numeric"]
  }));

  addIfDefined(metrics, clicks && makeMetric(table, {
    name: "Clicks",
    category: "Engagement",
    description: "Total ad clicks",
    formula: `SUM(${qualifiedField(table, clicks)})`,
    requiredFields: [clicks],
    grain: "unknown",
    aggregation: "sum",
    metricType: "core_metric",
    businessType: "ads",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["clicks field must be numeric"]
  }));

  addIfDefined(metrics, clicks && impressions && makeMetric(table, {
    name: "CTR",
    category: "Efficiency",
    description: "Click-through rate",
    formula: safeDivide(`SUM(${qualifiedField(table, clicks)})`, `SUM(${qualifiedField(table, impressions)})`),
    requiredFields: [clicks, impressions],
    grain: "unknown",
    aggregation: "ratio",
    metricType: "quality_metric",
    businessType: "ads",
    isBenchmarkMetric: true,
    confidence: 0.88,
    riskLevel: "low",
    validationRules: ["clicks and impressions must be numeric", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, spend && clicks && makeMetric(table, {
    name: "CPC",
    category: "Cost",
    description: "Cost per click",
    formula: safeDivide(`SUM(${qualifiedField(table, spend)})`, `SUM(${qualifiedField(table, clicks)})`),
    requiredFields: [spend, clicks],
    grain: "unknown",
    aggregation: "ratio",
    metricType: "comparison_metric",
    businessType: "ads",
    isBenchmarkMetric: true,
    confidence: 0.86,
    riskLevel: "low",
    validationRules: ["spend and clicks must be numeric", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, spend && conversions && makeMetric(table, {
    name: "CPA",
    category: "Cost",
    description: "Cost per conversion",
    formula: safeDivide(`SUM(${qualifiedField(table, spend)})`, `SUM(${qualifiedField(table, conversions)})`),
    requiredFields: [spend, conversions],
    grain: "unknown",
    aggregation: "ratio",
    metricType: "comparison_metric",
    businessType: "ads",
    isBenchmarkMetric: true,
    confidence: 0.84,
    riskLevel: "low",
    validationRules: ["spend and conversions must be numeric", "uses SAFE_DIVIDE"]
  }));

  if (impressions) metrics.push(...numericDistributionMetrics(table, impressions, "Impressions", "Reach", "ads"));
  if (clicks) metrics.push(...numericDistributionMetrics(table, clicks, "Clicks", "Engagement", "ads"));
  if (spend) metrics.push(...numericDistributionMetrics(table, spend, "Spend", "Cost", "ads"));
  if (conversions) metrics.push(...numericDistributionMetrics(table, conversions, "Conversions", "Conversion", "ads"));

  return { metrics, rejectedMetrics: [] };
}

function genericMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const numericColumns = table.columns
    .filter((column) => column.type === "number" && !isInternalBooleanColumn(column))
    .slice(0, 4);
  const dimension = findColumn(table, ["category", "type", "segment", "region", "country", "channel", "source", "status", "product", "app"]);

  for (const column of numericColumns) {
    const label = column.name.replace(/_/g, " ");

    metrics.push(makeMetric(table, {
      name: `Average ${label}`,
      category: "Overview",
      description: `Average value for ${label}`,
      formula: `AVG(${qualifiedField(table, column)})`,
      requiredFields: [column],
      grain: "row",
      aggregation: "avg",
      metricType: "core_metric",
      businessType: "unknown",
      confidence: 0.72,
      riskLevel: "medium",
      validationRules: ["numeric field must exist"],
      warnings: ["Missing business-specific context; treat as a generic numeric metric."]
    }));
    metrics.push(...numericDistributionMetrics(table, column, label, "Overview", "unknown"));
    metrics.push(...groupComparisonMetrics(table, dimension, column, label, "Overview"));
  }

  if (metrics.length === 0) {
    return {
      metrics: [],
      rejectedMetrics: [reject("Business Metrics", "No reliable numeric or business fields were found for metric generation.", [], "medium")]
    };
  }

  return { metrics, rejectedMetrics: [] };
}

function reviewSentimentMetrics(table: MetricInputTable): TemplateResult {
  const metrics: GeneratedMetricDefinition[] = [];
  const review = findColumn(table, ["translated_review", "review", "comment", "feedback"]);
  const sentiment = findColumn(table, ["sentiment"]);
  const polarity = findNumericColumn(table, ["sentiment_polarity", "polarity"]);
  const subjectivity = findNumericColumn(table, ["sentiment_subjectivity", "subjectivity"]);
  const app = findColumn(table, ["app", "product", "sku", "entity"]);

  addIfDefined(metrics, review && makeMetric(table, {
    name: "Review Volume",
    category: "Feedback",
    description: "Total number of non-empty review text records",
    formula: `COUNT_NON_EMPTY(${qualifiedField(table, review)})`,
    requiredFields: [review],
    grain: "row",
    aggregation: "count",
    metricType: "core_metric",
    businessType: "review_sentiment",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["review text field must exist", "counts only non-empty review text"]
  }));

  addIfDefined(metrics, sentiment && makeMetric(table, {
    name: "Sentiment Sample Size",
    category: "Feedback",
    description: "Number of records with a non-empty sentiment label",
    formula: `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`,
    requiredFields: [sentiment],
    grain: "row",
    aggregation: "count",
    metricType: "quality_metric",
    businessType: "review_sentiment",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["sentiment field must exist", "counts only non-empty sentiment labels"]
  }));

  addIfDefined(metrics, sentiment && makeMetric(table, {
    name: "Positive Sentiment Rate",
    category: "Feedback",
    description: "Share of reviews marked as positive",
    formula: safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Positive')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`),
    requiredFields: [sentiment],
    grain: "row",
    aggregation: "ratio",
    metricType: "quality_metric",
    businessType: "review_sentiment",
    isBenchmarkMetric: true,
    confidence: 0.88,
    riskLevel: "low",
    validationRules: ["sentiment field must exist", "uses non-empty sentiment denominator", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, sentiment && makeMetric(table, {
    name: "Negative Sentiment Rate",
    category: "Feedback",
    description: "Share of reviews marked as negative",
    formula: safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Negative')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`),
    requiredFields: [sentiment],
    grain: "row",
    aggregation: "ratio",
    metricType: "risk_metric",
    businessType: "review_sentiment",
    isBenchmarkMetric: true,
    warning: "system_default_threshold: negative_rate > 0.20 indicates a user feedback concern.",
    confidence: 0.88,
    riskLevel: "low",
    validationRules: ["sentiment field must exist", "uses non-empty sentiment denominator", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, sentiment && makeMetric(table, {
    name: "Neutral Sentiment Rate",
    category: "Feedback",
    description: "Share of reviews marked as neutral",
    formula: safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Neutral')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`),
    requiredFields: [sentiment],
    grain: "row",
    aggregation: "ratio",
    metricType: "quality_metric",
    businessType: "review_sentiment",
    isBenchmarkMetric: true,
    confidence: 0.86,
    riskLevel: "low",
    validationRules: ["sentiment field must exist", "uses non-empty sentiment denominator", "uses SAFE_DIVIDE"]
  }));

  addIfDefined(metrics, polarity && makeMetric(table, {
    name: "Average Sentiment Polarity",
    category: "Feedback",
    description: "Average sentiment polarity score",
    formula: `AVG(${qualifiedField(table, polarity)})`,
    requiredFields: [polarity],
    grain: "row",
    aggregation: "avg",
    metricType: "quality_metric",
    businessType: "review_sentiment",
    confidence: 0.9,
    riskLevel: "low",
    validationRules: ["sentiment polarity field must be numeric"]
  }));

  addIfDefined(metrics, subjectivity && makeMetric(table, {
    name: "Average Sentiment Subjectivity",
    category: "Feedback",
    description: "Average subjectivity score",
    formula: `AVG(${qualifiedField(table, subjectivity)})`,
    requiredFields: [subjectivity],
    grain: "row",
    aggregation: "avg",
    metricType: "quality_metric",
    businessType: "review_sentiment",
    confidence: 0.86,
    riskLevel: "low",
    validationRules: ["sentiment subjectivity field must be numeric"]
  }));

  if (polarity) {
    metrics.push(...numericDistributionMetrics(table, polarity, "Sentiment Polarity", "Feedback", "review_sentiment"));
  }

  if (subjectivity) {
    metrics.push(...numericDistributionMetrics(table, subjectivity, "Sentiment Subjectivity", "Feedback", "review_sentiment"));
  }

  if (app && sentiment) {
    metrics.push(makeMetric(table, {
      name: `Negative Sentiment Rate by ${app.name}`,
      category: "Feedback",
      description: `Negative sentiment rate grouped by ${app.name}`,
      formula: `${safeDivide(`COUNT_IF(${qualifiedField(table, sentiment)} = 'Negative')`, `COUNT_NON_EMPTY(${qualifiedField(table, sentiment)})`)} BY ${qualifiedField(table, app)}`,
      requiredFields: [sentiment, app],
      grain: "product",
      aggregation: "ratio",
      metricType: "comparison_metric",
      metricCategory: "Feedback",
      businessType: "review_sentiment",
      isBenchmarkMetric: true,
      confidence: 0.82,
      riskLevel: "medium",
      validationRules: ["sentiment and entity fields must exist", "uses non-empty sentiment denominator"]
    }));
  }

  return { metrics, rejectedMetrics: [] };
}

export function generateMetricsForIndustry(table: MetricInputTable, industry: Industry): TemplateResult {
  if (industry === "finance_stock") return financeStockMetrics(table);
  if (industry === "app_marketplace") return appMarketplaceMetrics(table);
  if (industry === "review_sentiment") return reviewSentimentMetrics(table);
  if (industry === "ecommerce") return ecommerceMetrics(table);
  if (industry === "saas") return saasMetrics(table);
  if (industry === "ads") return adsMetrics(table);

  return genericMetrics(table);
}
