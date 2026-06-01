import type { MetricInputColumn, MetricInputTable } from "@/lib/metric-generation/metric-types";

export function normalizeMetricToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function safeIdentifier(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

export function qualifiedField(table: MetricInputTable, column: MetricInputColumn) {
  return `${table.tableName}.${safeIdentifier(column.name)}`;
}

export function hasColumn(table: MetricInputTable, signals: string[]) {
  return Boolean(findColumn(table, signals));
}

export function findColumn(table: MetricInputTable, signals: string[]) {
  const normalizedSignals = signals.map(normalizeMetricToken);
  const exactMatch = normalizedSignals
    .map((signal) => table.columns.find((column) => normalizeMetricToken(column.name) === signal))
    .find(Boolean);

  if (exactMatch) {
    return exactMatch;
  }

  return normalizedSignals
    .map((signal) => table.columns.find((column) => normalizeMetricToken(column.name).includes(signal)))
    .find(Boolean);
}

export function findNumericColumn(table: MetricInputTable, signals: string[]) {
  const normalizedSignals = signals.map(normalizeMetricToken);
  const exactMatch = normalizedSignals
    .map((signal) => table.columns.find((column) => normalizeMetricToken(column.name) === signal))
    .find(Boolean);
  const partialMatch = normalizedSignals
    .map((signal) => table.columns.find((column) => normalizeMetricToken(column.name).includes(signal)))
    .find(Boolean);
  const column = exactMatch ?? partialMatch;

  if (!column) {
    return undefined;
  }

  if (column.type === "number" || column.type === "unknown") {
    return column;
  }

  // CSV uploads can infer text when files contain extra header rows or formatted
  // values. Keep generation conservative by only allowing known quantitative
  // business field names through this fallback.
  const normalized = normalizeMetricToken(column.name);
  const isKnownQuantitativeName = [
    "amount",
    "score",
    "polarity",
    "subjectivity",
    "rating",
    "price",
    "cost",
    "revenue",
    "income",
    "mrr",
    "arr",
    "installs",
    "reviews",
    "volume",
    "open",
    "high",
    "low",
    "close",
    "adj_close",
    "quantity",
    "spend",
    "clicks",
    "impressions",
    "conversions",
    "views",
    "likes",
    "shares",
    "comments"
  ].some((keyword) => normalized.includes(keyword));

  return isKnownQuantitativeName ? column : undefined;
}

export function safeDivide(numerator: string, denominator: string) {
  return `SAFE_DIVIDE(${numerator}, ${denominator})`;
}

export const directRevenueFields = [
  "revenue",
  "net_revenue",
  "gross_revenue",
  "sales_amount",
  "paid_amount",
  "payment_amount",
  "order_amount",
  "transaction_amount",
  "gmv",
  "total_sales",
  "invoice_amount"
];

export const unsafeRevenueFields = [
  "price",
  "unit_price",
  "list_price",
  "cost",
  "fee",
  "install",
  "quantity",
  "volume"
];

export function directRevenueColumn(table: MetricInputTable) {
  return findNumericColumn(table, directRevenueFields);
}

export function missingFields(names: string[]) {
  return names.filter(Boolean);
}
