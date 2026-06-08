const dimensionKeywords = [
  "channel",
  "sales_channel",
  "category",
  "segment",
  "customer_segment",
  "region",
  "country",
  "city",
  "source",
  "campaign",
  "device",
  "platform",
  "status",
  "type",
  "plan",
  "product_name",
  "app_name",
  "app",
  "name"
];

const systemFieldKeywords = ["created_at", "updated_at", "deleted_at", "loaded_at", "ingested_at", "synced_at"];
const metricKeywords = [
  "revenue",
  "gmv",
  "sales",
  "amount",
  "orders",
  "order_count",
  "total_orders",
  "customers",
  "total_customers",
  "aov",
  "average_order_value",
  "conversion",
  "conversion_rate",
  "retention",
  "retention_rate",
  "installs",
  "reviews",
  "review_volume",
  "rating",
  "average_rating",
  "sentiment_rate",
  "negative_sentiment_rate",
  "spend",
  "impressions",
  "clicks",
  "conversions",
  "cvr",
  "roas",
  "mrr",
  "arr",
  "churn_rate",
  "active_accounts",
  "active_users",
  "trial_to_paid_rate",
  "close",
  "close_price",
  "daily_return",
  "trading_volume",
  "volume",
  "drawdown",
  "tickets",
  "sessions",
  "usage"
];

const metricPriorityByBusinessType = {
  ecommerce: ["total_orders", "orders", "estimated_gmv", "gmv", "revenue", "total_customers", "customers", "average_order_value", "aov", "conversion_rate"],
  sales: ["total_orders", "orders", "estimated_gmv", "gmv", "revenue", "total_customers", "customers", "average_order_value", "aov", "conversion_rate"],
  orders: ["total_orders", "orders", "estimated_gmv", "gmv", "revenue", "total_customers", "customers", "average_order_value", "aov"],
  marketing: ["spend", "impressions", "clicks", "conversions", "cvr", "roas"],
  product_usage: ["active_users", "sessions", "usage", "conversion_rate", "retention_rate"],
  user_growth: ["active_users", "users", "installs", "conversion_rate", "retention_rate"],
  app_market: ["installs", "reviews", "review_volume", "rating", "average_rating", "sentiment_rate", "negative_sentiment_rate", "active_users"],
  reviews: ["reviews", "review_volume", "rating", "average_rating", "sentiment_rate", "negative_sentiment_rate"],
  finance_timeseries: ["close_price", "close", "daily_return", "trading_volume", "volume", "drawdown"],
  customer_support: ["tickets", "negative_sentiment_rate", "response_time", "resolution_time"],
  operations: ["orders", "volume", "tickets", "sessions"],
  inventory: ["quantity", "stock", "inventory_value"],
  generic: metricKeywords
};

export function normalizeTrendFieldName(value = "") {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fieldTokens(value = "") {
  return normalizeTrendFieldName(value).split("_").filter(Boolean);
}

function hasToken(value, token) {
  return fieldTokens(value).includes(normalizeTrendFieldName(token));
}

function includesPhrase(value, phrase) {
  const normalized = normalizeTrendFieldName(value);
  const normalizedPhrase = normalizeTrendFieldName(phrase);
  return normalized === normalizedPhrase || normalized.includes(`_${normalizedPhrase}_`) || normalized.startsWith(`${normalizedPhrase}_`) || normalized.endsWith(`_${normalizedPhrase}`);
}

export function isCategoricalDimensionName(name = "") {
  const normalized = normalizeTrendFieldName(name);
  return dimensionKeywords.some((keyword) => {
    const normalizedKeyword = normalizeTrendFieldName(keyword);
    return normalized === normalizedKeyword || includesPhrase(normalized, normalizedKeyword);
  });
}

export function isIdentifierName(name = "") {
  const normalized = normalizeTrendFieldName(name);
  return normalized === "id" || normalized.endsWith("_id") || normalized.includes("_uuid") || normalized.includes("_key");
}

export function isSystemFieldName(name = "") {
  const normalized = normalizeTrendFieldName(name);
  return systemFieldKeywords.includes(normalized) || normalized.startsWith("_") || normalized.includes("etl_");
}

export function isNumericFieldType(type) {
  return /number|numeric|decimal|double|float|integer|int|bigint|real|money/.test(String(type ?? "").toLowerCase());
}

export function detectFieldSemanticType(field = {}) {
  const name = field.name ?? field.metricName ?? field.yAxis ?? "";
  const type = field.type ?? field.fieldType;

  if (field.semanticType) return field.semanticType;
  if (field.isSystemField || isSystemFieldName(name)) return "system_field";
  if (field.isIdentifier || isIdentifierName(name)) return "identifier";
  if (/bool/.test(String(type ?? "").toLowerCase())) return "boolean";
  if (/date|time|timestamp/.test(String(type ?? "").toLowerCase()) || hasToken(name, "date") || hasToken(name, "time")) return "time_dimension";
  if (field.isDimension || isCategoricalDimensionName(name)) return "categorical_dimension";
  if (isNumericFieldType(type) && metricKeywords.some((keyword) => includesPhrase(name, keyword))) return "numeric_metric";
  if (isNumericFieldType(type)) return "numeric_metric";
  if (/text|string|char|varchar/.test(String(type ?? "").toLowerCase())) return "text";

  return "text";
}

export function isLikelyDimensionMetricName(name = "", category = "") {
  const normalizedCategory = normalizeTrendFieldName(category);
  return isCategoricalDimensionName(name) ||
    ["dimension", "categorical", "category", "identifier"].includes(normalizedCategory);
}

export function canUseAsTrendMetric(fieldOrMetric = {}) {
  const semanticType = detectFieldSemanticType(fieldOrMetric);
  const type = fieldOrMetric.type ?? fieldOrMetric.fieldType;
  const name = fieldOrMetric.name ?? fieldOrMetric.metricName ?? fieldOrMetric.yAxis ?? "";

  return Boolean(
    isNumericFieldType(type) &&
    semanticType === "numeric_metric" &&
    !fieldOrMetric.isDimension &&
    !fieldOrMetric.isIdentifier &&
    !fieldOrMetric.isSystemField &&
    !isLikelyDimensionMetricName(name, fieldOrMetric.metricCategory)
  );
}

export function isValidTrendMetricName(name = "", category = "") {
  return !isLikelyDimensionMetricName(name, category);
}

/**
 * @param {{ metricName?: string; metricCategory?: string; yAxis?: string; values?: unknown[] }} input
 */
export function isValidTrendSeries({ metricName = "", metricCategory = "", yAxis = "", values = [] } = {}) {
  const label = yAxis || metricName;
  const finiteValues = values.map(Number).filter(Number.isFinite);

  if (!isValidTrendMetricName(label, metricCategory)) return false;
  if (finiteValues.length < 2) return false;
  if (finiteValues.every((value) => value === 0) && isLikelyDimensionMetricName(label, metricCategory)) return false;

  return true;
}

function priorityScore(name, businessType = "generic") {
  const normalized = normalizeTrendFieldName(name);
  const priority = metricPriorityByBusinessType[businessType] ?? metricPriorityByBusinessType.generic;
  const index = priority.findIndex((candidate) => includesPhrase(normalized, candidate));

  if (index >= 0) return 1000 - index * 10;
  if (metricKeywords.some((keyword) => includesPhrase(normalized, keyword))) return 200;
  return 0;
}

export function selectTrendMetricCandidates(columns = [], businessType = "generic", limit = 3) {
  return columns
    .filter((column) => canUseAsTrendMetric(column))
    .map((column) => ({ column, score: priorityScore(column.name, businessType) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.column);
}

export function canUseRecordsAsDerivedTrendMetric(columns = [], businessType = "generic") {
  const names = columns.map((column) => column.name ?? "").join(" ");
  return ["ecommerce", "orders", "sales", "app_market", "reviews", "customer_support", "marketing", "product_usage", "user_growth"].includes(businessType) ||
    /order|transaction|event|review|ticket|session|install|user/i.test(names);
}
