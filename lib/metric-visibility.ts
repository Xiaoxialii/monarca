function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function sourceTableLabels(mappingJson: unknown) {
  const mapping = asRecord(mappingJson);
  const sourceFields = Array.isArray(mapping?.sourceFields) ? mapping.sourceFields : [];

  return sourceFields.flatMap((field) => {
    const fieldRecord = asRecord(field);
    const table = typeof fieldRecord?.table === "string" ? fieldRecord.table : "";

    return table ? [table] : [];
  });
}

export function metricBelongsToTables(metric: { mappingJson: unknown }, activeTableLabels: Set<string>) {
  if (activeTableLabels.size === 0) {
    return true;
  }

  const labels = sourceTableLabels(metric.mappingJson);
  return labels.length > 0 && labels.some((label) => activeTableLabels.has(label));
}

function normalizeMetricName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const internalMetricTokens = [
  "confidence",
  "impact_score",
  "impactscore",
  "data_quality_score",
  "dataqualityscore",
  "quality_score",
  "version",
  "applied_steps_count",
  "appliedstepscount",
  "status",
  "anomaly_type",
  "anomalytype",
  "internal_score",
  "internalscore",
  "sample_size",
  "samplesize",
  "sample_count",
  "samplecount",
  "minimum_sample_size",
  "minimumsamplesize",
  "average_sample_size",
  "averagesamplesize",
  "debug",
  "debug_score",
  "technical",
  "metadata",
  "diagnostic",
  "system_score",
  "system_field",
  "row_id",
  "rowid",
  "system_id",
  "internal_id",
  "internalstatus"
];

const internalMetricPatterns = [
  /\b(avg|average|sum|min|max|count|median|stddev)_?(confidence|impactscore|impact_score|dataqualityscore|data_quality_score)\b/,
  /\b(confidence|impactscore|impact_score|dataqualityscore|data_quality_score)_?(avg|average|sum|min|max|count|median|stddev)\b/,
  /\b(avg|average|min|minimum|max|maximum|median)_?(sample|samplesize|sample_size|samplecount|sample_count)\b/,
  /\b(sample|samplesize|sample_size|samplecount|sample_count)_?(avg|average|min|minimum|max|maximum|median)\b/,
  /\baverage_?(status|anomalytype|anomaly_type|version)\b/,
  /\b(avg|average|min|minimum|max|maximum)\([^)]*(confidence|impactscore|impact_score|dataqualityscore|data_quality_score|sample_size|samplesize|samplecount|sample_count|status|anomalytype|anomaly_type|version|applied_steps_count)[^)]*\)/
];

const objectLevelDimensions = [
  "app",
  "apps",
  "category",
  "categories",
  "product",
  "products",
  "sku",
  "customer",
  "customers",
  "user",
  "users",
  "account",
  "accounts",
  "region",
  "country",
  "city",
  "channel",
  "source",
  "segment",
  "type",
  "status",
  "campaign",
  "campaigns",
  "date",
  "month",
  "year"
];

function compactMetricText(parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function hasDisplayableMetricValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "bigint") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    return ![
      "",
      "-",
      "na",
      "n/a",
      "nan",
      "null",
      "undefined",
      "infinity",
      "-infinity"
    ].includes(normalized);
  }

  return false;
}

export function hasDisplayableMetricResult(metric: {
  value?: unknown;
  rows?: Array<{ value?: unknown }> | unknown;
}) {
  if (hasDisplayableMetricValue(metric.value)) {
    return true;
  }

  return Array.isArray(metric.rows) && metric.rows.some((row) =>
    row && typeof row === "object" && hasDisplayableMetricValue((row as { value?: unknown }).value)
  );
}

export function isObjectLevelMetricText(parts: Array<string | null | undefined>) {
  const raw = parts.filter(Boolean).join(" ");
  const words = raw
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = compactMetricText(parts);

  if (!words && !compact) {
    return false;
  }

  const hasGroupedFormula = /\s+BY\s+[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?/i.test(raw);
  const hasByDimension = objectLevelDimensions.some((dimension) =>
    new RegExp(`\\bby\\s+${dimension}\\b`, "i").test(words)
  );
  const hasCompactByDimension = objectLevelDimensions.some((dimension) =>
    compact.includes(`_by_${dimension}`) || compact.endsWith(`by_${dimension}`)
  );
  const isRankingLabel = /\b(top|bottom|highest|lowest)\b/.test(words) && /\bby\b/.test(words);
  const hasObjectScope = /\b(group|entity|ranking|object)\b/.test(words) &&
    /\b(metric|result|scope|level)\b/.test(words);

  return hasGroupedFormula || hasByDimension || hasCompactByDimension || isRankingLabel || hasObjectScope;
}

export function isGlobalBusinessMetricResult(metric: {
  metricName?: string | null;
  name?: string | null;
  displayName?: string | null;
  formula?: string | null;
  metricCategory?: string | null;
  metricType?: string | null;
  scope?: string | null;
  sourceDataset?: string | null;
  rows?: unknown;
}) {
  if (metric.scope && metric.scope !== "global") {
    return false;
  }

  if (Array.isArray(metric.rows) && metric.rows.length > 0) {
    return false;
  }

  if (["group_comparison_metric", "ranking_metric", "entity_metric", "diagnostic_metric", "internal_metric", "warning_metric"].includes(metric.metricType ?? "")) {
    return false;
  }

  return !isObjectLevelMetricText([
    metric.metricName,
    metric.name,
    metric.displayName,
    metric.formula,
    metric.metricCategory,
    metric.sourceDataset
  ]);
}

export function isBusinessFacingMetricText(parts: Array<string | null | undefined>) {
  const compact = compactMetricText(parts);

  if (!compact) {
    return true;
  }

  if (internalMetricTokens.some((token) => compact.split("_").includes(token) || compact.includes(token))) {
    return false;
  }

  return !internalMetricPatterns.some((pattern) => pattern.test(compact));
}

export function isBusinessFacingMetricDefinition(metric: {
  name?: string | null;
  displayName?: string | null;
  formula?: string | null;
  category?: string | null;
  definition?: string | null;
  unit?: string | null;
  lineageJson?: unknown;
  mappingJson?: unknown;
}) {
  const lineage = asRecord(metric.lineageJson);
  const mapping = asRecord(metric.mappingJson);

  return isBusinessFacingMetricText([
    metric.name,
    metric.displayName,
    metric.formula,
    metric.category,
    metric.definition,
    metric.unit,
    typeof lineage?.displayName === "string" ? lineage.displayName : undefined,
    typeof lineage?.metricCategory === "string" ? lineage.metricCategory : undefined,
    typeof lineage?.sourceDataset === "string" ? lineage.sourceDataset : undefined,
    typeof mapping?.sourceLabel === "string" ? mapping.sourceLabel : undefined
  ]);
}

export function metricDedupeKey(metric: { name: string; formula: string }) {
  const normalizedFormula = normalizeMetricName(metric.formula)
    .replace(/^safe_divide_/, "")
    .replace(/count_non_empty/g, "count");

  return normalizeMetricName(metric.name)
    .replace(/_+/g, "_")
    .replace(/^(average|avg)_/, "avg_")
    .replace(/_average_/, "_avg_")
    .replace(/_polarity$/, "_sentiment_polarity")
    .replace(/_sentiment_sentiment_polarity$/, "_sentiment_polarity")
    .replace(/_score$/, "_sentiment_score") || normalizedFormula;
}

function metricDisplayScore(metric: {
  name: string;
  status: string;
  maintainerRole: string;
  formula: string;
}) {
  let score = 0;

  if (!metric.name.includes("_")) score += 4;
  if (metric.status === "AI_READY") score += 3;
  if (metric.maintainerRole === "AI") score += 1;
  if (/COUNT_NON_EMPTY/i.test(metric.formula)) score += 1;

  return score;
}

export function dedupeVisibleMetrics<T extends {
  id: string;
  name: string;
  status: string;
  maintainerRole: string;
  formula: string;
}>(metrics: T[]) {
  const byKey = new Map<string, T>();

  for (const metric of metrics) {
    const key = metricDedupeKey(metric);
    const existing = byKey.get(key);

    if (!existing || metricDisplayScore(metric) > metricDisplayScore(existing)) {
      byKey.set(key, metric);
    }
  }

  return metrics.filter((metric) => byKey.get(metricDedupeKey(metric))?.id === metric.id);
}
