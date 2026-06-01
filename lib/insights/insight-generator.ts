import type {
  AggregationResult,
  CandidateResult,
  DataLimitation,
  GeneratedInsight,
  GeneratedInsights,
  GeneratedRecommendedAction,
  RankingResult,
  ReportMetricResultInput,
  ReportBusinessType,
  SelectedReportMetric
} from "@/lib/report-generation/report-types";
import {
  hasDisplayableMetricResult,
  hasDisplayableMetricValue
} from "@/lib/metric-visibility";
import { generateNextActionPlan } from "@/lib/insights/next-action-generator";

type Comparison = NonNullable<GeneratedInsight["comparison"]>;

const MODULE_LABELS: Record<ReportBusinessType, string> = {
  sales: "销售",
  orders: "订单",
  ecommerce: "电商",
  app_market: "App 市场",
  user_growth: "用户增长",
  finance_timeseries: "金融时序",
  reviews: "用户反馈",
  customer_support: "客服",
  marketing: "营销",
  product_usage: "产品使用",
  operations: "运营",
  inventory: "库存",
  generic: "业务"
};

function uniqueByName(metrics: SelectedReportMetric[]) {
  const seen = new Set<string>();

  return metrics.filter((metric) => {
    const key = metric.displayName.toLowerCase().replace(/[_\s]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metricNumber(metric?: SelectedReportMetric) {
  if (!metric) return null;
  if (typeof metric.value === "number") return metric.value;
  if (typeof metric.value === "string") {
    const parsed = Number(metric.value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function metricValue(metric?: SelectedReportMetric) {
  return metric?.displayValue ?? "-";
}

function validInsightValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim().toLowerCase();

  return Boolean(text) && !["-", "nan", "null", "undefined"].includes(text);
}

function metricText(metric: SelectedReportMetric) {
  return `${metric.displayName} ${metric.name} ${metric.formula} ${metric.category}`.toLowerCase();
}

function metricNameText(metric: SelectedReportMetric) {
  return `${metric.displayName} ${metric.name}`.toLowerCase();
}

function metricMatch(metrics: SelectedReportMetric[], pattern: RegExp) {
  return metrics.find((metric) => pattern.test(metricText(metric)));
}

function isGlobalSummaryMetric(metric: SelectedReportMetric) {
  return !/(^|\b)(top|bottom|ranking|rank|highest|lowest|by|group|category|object|entity|threshold|check|share|p75|p90|p95|percentile|mean median|vs overall|previous period)(\b|_|-)/i.test(metricNameText(metric));
}

function metricNameMatches(metric: SelectedReportMetric, pattern: RegExp) {
  return pattern.test(metric.displayName.toLowerCase()) || pattern.test(metric.name.toLowerCase());
}

function metricMatchByName(metrics: SelectedReportMetric[], pattern: RegExp) {
  return metrics.find((metric) =>
    metric.metricType === "core_metric" &&
    isGlobalSummaryMetric(metric) &&
    metricNameMatches(metric, pattern)
  ) ?? metrics.find((metric) =>
    isGlobalSummaryMetric(metric) &&
    metricNameMatches(metric, pattern)
  ) ?? metrics.find((metric) => metricNameMatches(metric, pattern));
}

function metricsByType(metrics: SelectedReportMetric[], type: string) {
  return metrics.filter((metric) => metric.metricType === type);
}

function comparisonFor(metrics: SelectedReportMetric[]): Comparison {
  const explicit = metrics.find((metric) => metric.benchmarkContext?.comparisonType && metric.benchmarkContext.comparisonType !== "none");

  if (explicit?.benchmarkContext) {
    return {
      comparisonType: explicit.benchmarkContext.comparisonType,
      baselineValue: explicit.benchmarkContext.baselineValue ?? null,
      delta: explicit.benchmarkContext.delta ?? null,
      deltaPercent: explicit.benchmarkContext.deltaPercent ?? null,
      status: explicit.benchmarkContext.status ?? "unknown",
      interpretation: explicit.benchmarkContext.interpretation ?? `${explicit.displayName} 提供了 ${explicit.benchmarkContext.comparisonType} 对比基准`
    };
  }

  const concentration = metrics.find((metric) => metric.metricType === "concentration_metric");
  if (concentration) {
    return {
      comparisonType: "topN_share",
      status: "unknown",
      interpretation: `${concentration.displayName} 用于判断头部集中度`
    };
  }

  const distribution = metrics.find((metric) => metric.metricType === "distribution_metric");
  if (distribution) {
    return {
      comparisonType: "distribution",
      status: "unknown",
      interpretation: `${distribution.displayName} 用于判断均值是否被长尾或极端值影响`
    };
  }

  const warning = metrics.find((metric) => metric.warning);
  if (warning) {
    return {
      comparisonType: "warning",
      status: "risk",
      interpretation: warning.warning
    };
  }

  return {
    comparisonType: "none",
    status: "unknown",
    interpretation: "当前缺少历史、目标、分布或分组基准，只能做方向性观察"
  };
}

function hasAggregationEvidence(aggregations: AggregationResult[], businessType?: ReportBusinessType) {
  const scoped = businessType ? aggregations.filter((aggregation) => aggregation.businessType === businessType) : aggregations;

  return scoped.some((aggregation) =>
    aggregation.groupBys.length > 0 ||
    aggregation.topRankings.length > 0 ||
    aggregation.bottomRankings.length > 0 ||
    aggregation.timeTrends.length > 0 ||
    aggregation.distributions.length > 0
  );
}

function scopedAggregationCounts(aggregations: AggregationResult[], businessType?: ReportBusinessType) {
  const scoped = businessType ? aggregations.filter((aggregation) => aggregation.businessType === businessType) : aggregations;

  return {
    groupBy: scoped.reduce((sum, aggregation) => sum + aggregation.groupBys.length, 0),
    ranking: scoped.reduce((sum, aggregation) => sum + aggregation.topRankings.length + aggregation.bottomRankings.length, 0),
    trend: scoped.reduce((sum, aggregation) => sum + aggregation.timeTrends.length, 0),
    distribution: scoped.reduce((sum, aggregation) => sum + aggregation.distributions.length, 0)
  };
}

function allRankings(aggregations: AggregationResult[], businessType?: ReportBusinessType) {
  const scoped = businessType ? aggregations.filter((aggregation) => aggregation.businessType === businessType) : aggregations;

  return scoped.flatMap((aggregation) => [...aggregation.topRankings, ...aggregation.bottomRankings]);
}

function rankingObjects(ranking?: RankingResult, count = 3) {
  if (!ranking) return [];

  return ranking.rows.slice(0, count);
}

function rankingObjectNames(ranking?: RankingResult, count = 3) {
  if (!ranking) return "";
  const field = ranking.entityField ?? ranking.dimension;

  return ranking.rows
    .slice(0, count)
    .map((row) => String(row[field] ?? row.dimension ?? ""))
    .filter(Boolean)
    .join("、");
}

function rankingMetricValue(row: Record<string, string | number | null>, ranking?: RankingResult) {
  const metricField = ranking?.metricField ?? ranking?.metric;
  if (metricField && row[metricField] != null) return row[metricField];

  const fallbackKey = Object.keys(row).find((key) =>
    !["dimension", ranking?.entityField, ranking?.dimension].filter(Boolean).includes(key) &&
    typeof row[key] === "number"
  );

  return fallbackKey ? row[fallbackKey] : null;
}

function compactNumber(value: number) {
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function businessMetricUnit(metricName?: string) {
  const normalized = (metricName ?? "").toLowerCase();

  if (normalized.includes("install")) return "installs";
  if (normalized.includes("review")) return "reviews";
  if (normalized.includes("rating")) return "rating";
  if (normalized.includes("negative")) return "negative rate";
  if (normalized.includes("positive")) return "positive rate";
  if (normalized.includes("sentiment")) return "sentiment";

  return "";
}

function formatRankingValue(value: string | number | null, metricName?: string) {
  if (value == null) return "";
  const unit = businessMetricUnit(metricName);

  if (typeof value === "number") {
    if (/rate|share|ratio/i.test(metricName ?? "") && Math.abs(value) <= 1) return `${(value * 100).toFixed(1)}%`;
    return `${compactNumber(value)}${unit ? ` ${unit}` : ""}`;
  }

  return String(value);
}

function readableRankingLabel(value?: string) {
  return (value ?? "Metric")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rankingShareLabel(ranking: RankingResult | undefined, count = 3) {
  const grain = readableRankingLabel(ranking?.entityField ?? ranking?.dimension ?? "Object");
  const metric = readableRankingLabel(ranking?.metricField ?? ranking?.metric ?? "Metric");

  return `Top ${count} ${grain} ${metric} Share`;
}

function rankingObjectsText(ranking?: RankingResult, count = 3) {
  if (!ranking) return "";
  const field = ranking.entityField ?? ranking.dimension;

  return ranking.rows
    .slice(0, count)
    .map((row) => {
      const name = String(row[field] ?? row.dimension ?? "").trim();
      const value = rankingMetricValue(row, ranking);
      const valueText = formatRankingValue(value, ranking.metricField ?? ranking.metric);

      return name && valueText ? `${name}：${valueText}` : name;
    })
    .filter(Boolean)
    .join("、");
}

function hasQualityOrSentimentByDimension(aggregations: AggregationResult[], dimension?: string, businessType?: ReportBusinessType) {
  if (!dimension) return false;
  const normalizedDimension = dimension.toLowerCase();
  const scoped = businessType ? aggregations.filter((aggregation) => aggregation.businessType === businessType) : aggregations;

  return scoped.some((aggregation) =>
    aggregation.groupBys.some((groupBy) =>
      groupBy.dimension.toLowerCase() === normalizedDimension &&
      groupBy.metrics.some((metric) => /rating|score|sentiment|negative|positive|review/i.test(metric))
    ) ||
    [...aggregation.topRankings, ...aggregation.bottomRankings].some((ranking) =>
      (ranking.dimension.toLowerCase() === normalizedDimension || ranking.entityField?.toLowerCase() === normalizedDimension) &&
      /rating|score|sentiment|negative|positive|quality/i.test(`${ranking.metricField ?? ranking.metric} ${ranking.title}`)
    )
  );
}

function rankingHasTextThemes(ranking?: RankingResult) {
  if (!ranking) return false;

  return ranking.rows.some((row) =>
    Object.keys(row).some((key) => /theme|topic|issue|keyword|cluster/i.test(key))
  );
}

function rankingThemesText(ranking?: RankingResult) {
  if (!ranking) return "";
  const themeKeys = ["theme", "themes", "topic", "topics", "issue", "issueTheme", "problemTheme", "keywords", "cluster"];
  const themes = ranking.rows
    .flatMap((row) => themeKeys.map((key) => row[key]).filter(Boolean))
    .flatMap((value) => Array.isArray(value) ? value : String(value).split(/[,，、]/))
    .map((value) => String(value).trim())
    .filter(Boolean);

  return Array.from(new Set(themes)).slice(0, 5).join("、");
}

function realRevenueMetric(metrics: SelectedReportMetric[]) {
  return metrics.find((metric) =>
    !metric.isEstimated &&
    /(^|\b)(revenue|paid amount|paid_amount|order amount|order_amount|transaction amount|transaction_amount|payment amount|payment_amount|gmv|sales amount|sales_amount)(\b|$)/i.test(`${metric.displayName} ${metric.name}`)
  );
}

function dedupedMetricFor(metrics: SelectedReportMetric[], pattern: RegExp) {
  return metrics.find((metric) =>
    /dedup|去重/i.test(`${metric.displayName} ${metric.name}`) &&
    pattern.test(`${metric.displayName} ${metric.name}`)
  );
}

function supportingEvidenceText(metrics: SelectedReportMetric[], objectsText?: string, extra?: string) {
  const metricText = uniqueByName(metrics)
    .filter((metric) => validInsightValue(metric.value))
    .slice(0, 4)
    .map((metric) => `${metric.displayName} = ${metric.displayValue}`)
    .join("；");
  const parts = [metricText, objectsText, extra].filter(Boolean);

  return parts.join("；");
}

function nonTaskDecision(text: string) {
  return text
    .replace(/^建议(比较|分析|查看|提取)/, "")
    .replace(/^下一步[:：]?/, "")
    .replace(/^后续可以/, "")
    .replace(/^继续拆解/, "")
    .trim();
}

function boundedShare(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;

  return value >= 0 && value <= 1 ? value : null;
}

function topShareForRanking(ranking: RankingResult | undefined, count = 3) {
  if (!ranking) return null;

  const numerator = ranking.rows
    .slice(0, count)
    .reduce((sum, row) => {
      const value = rankingMetricValue(row, ranking);
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
  const denominator = ranking.totalValue;
  const recomputed = denominator && denominator > 0 ? numerator / denominator : null;
  const safeRecomputed = boundedShare(recomputed);

  if (safeRecomputed != null) return safeRecomputed;

  if (count === 1) return boundedShare(ranking.top1Share);
  if (count === 3) return boundedShare(ranking.top3Share);
  if (count === 5) return boundedShare(ranking.top5Share);

  return null;
}

function numberFromRow(row: Record<string, string | number | null>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function sampleTextForRow(row: Record<string, string | number | null>, ranking?: RankingResult) {
  const sample = sampleSizeForRow(row);
  const negativeCount = numberFromRow(row, ["negativeCount", "negative_count", "negativeReviews", "negative_reviews"]);
  const rankingMetricKey = ranking?.metricField ?? ranking?.metric;
  const rankingMetricValue = rankingMetricKey && /negative|负向/i.test(rankingMetricKey)
    ? numberFromRow(row, [rankingMetricKey])
    : null;
  const negativeRate = numberFromRow(row, ["negativeRate", "negative_rate"]) ??
    (rankingMetricValue != null && Math.abs(rankingMetricValue) <= 1 ? rankingMetricValue : null);
  const parts: string[] = [];

  if (typeof negativeRate === "number") parts.push(`负向率 ${(negativeRate * 100).toFixed(1)}%`);
  if (typeof sample === "number") parts.push(`样本量 ${compactNumber(sample)}`);
  if (typeof negativeCount === "number") parts.push(`负向 ${compactNumber(negativeCount)}`);
  if (typeof sample === "number" && sample < 20) parts.push("小样本，仅作排查线索");

  return parts.join("，");
}

function sampleSizeForRow(row: Record<string, string | number | null>) {
  return numberFromRow(row, ["sentimentSampleSize", "sentiment_sample_size", "sampleSize", "sample_size", "records", "reviews", "reviewCount"]);
}

function hasSmallSampleRows(ranking?: RankingResult, threshold = 20) {
  return Boolean(ranking?.rows.some((row) => {
    const sample = sampleSizeForRow(row);

    return sample != null && sample < threshold;
  }));
}

function negativeRankingObjectsText(ranking?: RankingResult, count = 3) {
  if (!ranking) return "";
  const field = ranking.entityField ?? ranking.dimension;

  return ranking.rows
    .slice(0, count)
    .map((row) => {
      const name = String(row[field] ?? row.dimension ?? "").trim();
      const sample = sampleTextForRow(row, ranking);

      return name && sample ? `${name}（${sample}）` : name;
    })
    .filter(Boolean)
    .join("、");
}

function ratioSeverityText(metric?: SelectedReportMetric) {
  const value = metricNumber(metric);
  if (value == null) return null;
  const name = metric?.displayName ?? "Mean / Median Ratio";
  const displayValue = metric?.displayValue ?? compactNumber(value);

  if (value > 100) return `${name} 为 ${displayValue}，说明分布极度长尾，平均值不能代表普通对象水平`;
  if (value > 10) return `${name} 为 ${displayValue}，说明分布严重长尾，少数头部对象会明显拉高平均值`;
  if (value > 2) return `${name} 为 ${displayValue}，说明分布偏斜，平均值可能被头部对象拉高`;

  return null;
}

function shareText(label: string, value: number | null) {
  return value == null ? "" : `${label} ${(value * 100).toFixed(1)}%`;
}

function normalizeFieldKey(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CATEGORICAL_DIMENSIONS = [
  "category",
  "type",
  "segment",
  "region",
  "country",
  "city",
  "channel",
  "source",
  "campaign",
  "plan",
  "status",
  "product_category",
  "app_category",
  "device",
  "platform"
];

function isCategoricalDimension(field?: string) {
  const normalized = normalizeFieldKey(field);
  if (!normalized) return false;
  if (/(\b|_)(id|uuid|email|text|review|description|comment|debug|internal|system|row_id|internal_id)(\b|_)/i.test(normalized)) {
    return false;
  }

  return CATEGORICAL_DIMENSIONS.some((dimension) =>
    normalized === dimension ||
    normalized.endsWith(`_${dimension}`) ||
    normalized.includes(`${dimension}_`)
  );
}

function rankingOwner(aggregations: AggregationResult[], ranking?: RankingResult) {
  if (!ranking) return undefined;

  return aggregations.find((aggregation) =>
    [...aggregation.topRankings, ...aggregation.bottomRankings].some((candidate) => candidate.id === ranking.id)
  );
}

function categoricalRankings(aggregations: AggregationResult[]) {
  return allRankings(aggregations)
    .filter((ranking) =>
      ranking.rankingType === "top_group" &&
      isCategoricalDimension(ranking.entityField ?? ranking.dimension) &&
      /installs|revenue|sales|gmv|orders|users|reviews|volume|mrr|arr|conversion|rating|sentiment|score/i.test(`${ranking.metricField ?? ranking.metric} ${ranking.title}`)
    )
    .sort((left, right) => {
      const priority = (ranking: RankingResult) => {
        const dimension = normalizeFieldKey(ranking.entityField ?? ranking.dimension);
        const metric = normalizeFieldKey(ranking.metricField ?? ranking.metric);
        const dimensionScore = Math.max(0, CATEGORICAL_DIMENSIONS.length - CATEGORICAL_DIMENSIONS.indexOf(dimension));
        const metricScore = /revenue|sales|gmv|installs|users|orders|reviews|volume/.test(metric) ? 20 : 0;

        return dimensionScore + metricScore + (ranking.insightCandidate ? 5 : 0);
      };

      return priority(right) - priority(left);
    });
}

function metricRankingPriority(metric?: string) {
  const normalized = normalizeFieldKey(metric);

  if (/revenue|sales|gmv|mrr|arr/.test(normalized)) return 100;
  if (/installs|downloads|usage|active_users|users/.test(normalized)) return 92;
  if (/orders|transactions|volume/.test(normalized)) return 84;
  if (/reviews|comments|tickets/.test(normalized)) return 78;
  if (/rating|score|sentiment|conversion|retention/.test(normalized)) return 68;

  return 20;
}

function categoricalRankingPriority(ranking: RankingResult) {
  const dimension = normalizeFieldKey(ranking.entityField ?? ranking.dimension);
  const dimensionIndex = CATEGORICAL_DIMENSIONS.indexOf(dimension);
  const dimensionScore = dimensionIndex >= 0 ? CATEGORICAL_DIMENSIONS.length - dimensionIndex : 0;

  return dimensionScore + metricRankingPriority(ranking.metricField ?? ranking.metric) + (ranking.insightCandidate ? 5 : 0);
}

function rankingTopShareFromRows(rows: Array<Record<string, string | number | null>>, metricKey: string, count: number) {
  const total = rows.reduce((sum, row) => sum + (numberFromRow(row, [metricKey]) ?? 0), 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  const numerator = rows
    .slice(0, count)
    .reduce((sum, row) => sum + (numberFromRow(row, [metricKey]) ?? 0), 0);
  const share = numerator / total;

  return boundedShare(share);
}

function derivedCategoricalRankingsFromGroupBys(aggregations: AggregationResult[]) {
  const derived: RankingResult[] = [];

  for (const aggregation of aggregations) {
    for (const groupBy of aggregation.groupBys) {
      if (!isCategoricalDimension(groupBy.dimension)) continue;

      const sample = groupBy.rows[0];
      if (!sample) continue;

      const metricKeys = Object.keys(sample).filter((key) =>
        key !== "dimension" &&
        key !== groupBy.dimension &&
        typeof sample[key] === "number" &&
        /installs|revenue|sales|gmv|orders|users|reviews|volume|mrr|arr|conversion|rating|sentiment|score/i.test(key)
      );
      const metricKey = metricKeys.sort((left, right) => metricRankingPriority(right) - metricRankingPriority(left))[0];
      if (!metricKey) continue;

      const rows = [...groupBy.rows]
        .filter((row) => numberFromRow(row, [metricKey]) != null)
        .sort((left, right) => (numberFromRow(right, [metricKey]) ?? 0) - (numberFromRow(left, [metricKey]) ?? 0));
      const totalValue = rows.reduce((sum, row) => sum + (numberFromRow(row, [metricKey]) ?? 0), 0);
      if (!rows.length || totalValue <= 0) continue;

      derived.push({
        id: `derived-${aggregation.datasetId}-${normalizeFieldKey(groupBy.dimension)}-${normalizeFieldKey(metricKey)}`,
        title: `Top ${groupBy.dimension} by ${readableRankingLabel(metricKey)}`,
        rankingType: "top_group",
        dimension: groupBy.dimension,
        metric: metricKey,
        entityField: groupBy.dimension,
        metricField: metricKey,
        rows: rows.slice(0, 10),
        totalValue,
        top1Share: rankingTopShareFromRows(rows, metricKey, 1),
        top3Share: rankingTopShareFromRows(rows, metricKey, 3),
        top5Share: rankingTopShareFromRows(rows, metricKey, 5),
        summary: `${rankingObjectNames({
          id: "summary",
          title: "",
          dimension: groupBy.dimension,
          metric: metricKey,
          entityField: groupBy.dimension,
          metricField: metricKey,
          rows
        }, 3)} 是 ${groupBy.dimension} 中 ${readableRankingLabel(metricKey)} 最高的分组`,
        insightCandidate: true,
        confidence: 0.74
      });
    }
  }

  return derived;
}

function bestCategoricalRankings(aggregations: AggregationResult[]) {
  const byKey = new Map<string, RankingResult>();

  for (const ranking of [...categoricalRankings(aggregations), ...derivedCategoricalRankingsFromGroupBys(aggregations)]) {
    const key = `${normalizeFieldKey(ranking.entityField ?? ranking.dimension)}:${normalizeFieldKey(ranking.metricField ?? ranking.metric)}`;
    const current = byKey.get(key);

    if (!current || categoricalRankingPriority(ranking) > categoricalRankingPriority(current)) {
      byKey.set(key, ranking);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => categoricalRankingPriority(right) - categoricalRankingPriority(left));
}

function rankingEvidenceText(ranking?: RankingResult, count = 3) {
  if (!ranking) return "";
  const objects = rankingObjectsText(ranking, count);
  const share = topShareForRanking(ranking, count);
  const shareLabel = rankingShareLabel(ranking, count);

  return [objects, share != null ? shareText(shareLabel, share) : ""].filter(Boolean).join("；");
}

function insightMetricEvidence(metrics: SelectedReportMetric[], ranking?: RankingResult) {
  const metricPattern = new RegExp((ranking?.metricField ?? ranking?.metric ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const matched = ranking
    ? metrics.filter((metric) => metricPattern.test(`${metric.displayName} ${metric.name} ${metric.formula}`)).slice(0, 2)
    : [];

  return matched.length ? matched : metrics.slice(0, 2);
}

function rowJoinFields(rows: Array<Record<string, string | number | null>>) {
  const fields = new Set<string>();

  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row)) {
      if (key === "dimension") continue;
      const canonical = canonicalJoinKey(key);
      if (Object.prototype.hasOwnProperty.call(JOIN_KEY_ALIASES, canonical)) fields.add(key);
    }
  }

  return Array.from(fields);
}

function aggregationFields(aggregation: AggregationResult) {
  const fields = new Set<string>();

  for (const groupBy of aggregation.groupBys) fields.add(groupBy.dimension);
  for (const ranking of [...aggregation.topRankings, ...aggregation.bottomRankings]) {
    fields.add(ranking.dimension);
    if (ranking.entityField) fields.add(ranking.entityField);
    for (const field of rowJoinFields(ranking.rows)) fields.add(field);
  }
  for (const groupBy of aggregation.groupBys) {
    for (const field of rowJoinFields(groupBy.rows)) fields.add(field);
  }

  return Array.from(fields).filter(Boolean);
}

const JOIN_KEY_ALIASES: Record<string, string[]> = {
  app: ["app", "app_name", "application", "application_name", "package_name"],
  product: ["product", "product_name", "product_id", "sku", "item", "item_name"],
  user: ["user", "user_id", "customer", "customer_id", "client_id", "account_id"],
  campaign: ["campaign", "campaign_id", "campaign_name"],
  ticket: ["ticket", "ticket_id"],
  order: ["order", "order_id", "transaction_id", "invoice_id"]
};

function canonicalJoinKey(field?: string) {
  const normalized = normalizeFieldKey(field);
  if (!normalized) return "";

  for (const [canonical, aliases] of Object.entries(JOIN_KEY_ALIASES)) {
    if (aliases.includes(normalized)) return canonical;
  }

  return normalized;
}

function findJoinKey(left: AggregationResult, right: AggregationResult) {
  const leftFields = aggregationFields(left);
  const rightFields = aggregationFields(right);
  const rightCanonical = new Map(rightFields.map((field) => [canonicalJoinKey(field), field]));

  for (const field of leftFields) {
    const canonical = canonicalJoinKey(field);
    const matched = rightCanonical.get(canonical);
    if (matched && canonical && !/id|row|debug|internal/.test(canonical)) {
      return { key: field, matchedKey: matched, confidence: canonical === normalizeFieldKey(field) ? 0.78 : 0.68 };
    }
  }

  return null;
}

function joinableAggregationPairs(aggregations: AggregationResult[]) {
  const pairs: Array<{ left: AggregationResult; right: AggregationResult; key: string; matchedKey: string; confidence: number }> = [];

  for (let leftIndex = 0; leftIndex < aggregations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < aggregations.length; rightIndex += 1) {
      const join = findJoinKey(aggregations[leftIndex], aggregations[rightIndex]);
      if (join) {
        pairs.push({
          left: aggregations[leftIndex],
          right: aggregations[rightIndex],
          key: join.key,
          matchedKey: join.matchedKey,
          confidence: join.confidence
        });
      }
    }
  }

  return pairs;
}

function inferredBusinessJoinPairs(aggregations: AggregationResult[]) {
  const pairs: Array<{ left: AggregationResult; right: AggregationResult; key: string; matchedKey: string; confidence: number }> = [];
  const appMarket = aggregations.filter((aggregation) => aggregation.businessType === "app_market");
  const reviews = aggregations.filter((aggregation) => aggregation.businessType === "reviews");

  for (const left of appMarket) {
    for (const right of reviews) {
      if (left.datasetId === right.datasetId) continue;
      pairs.push({ left, right, key: "App", matchedKey: "App", confidence: 0.62 });
    }
  }

  return pairs;
}

function bestJoinableAggregationPairs(aggregations: AggregationResult[]) {
  const byKey = new Map<string, { left: AggregationResult; right: AggregationResult; key: string; matchedKey: string; confidence: number }>();

  for (const pair of [...joinableAggregationPairs(aggregations), ...inferredBusinessJoinPairs(aggregations)]) {
    const ids = [pair.left.datasetId, pair.right.datasetId].sort().join(":");
    const key = `${ids}:${canonicalJoinKey(pair.key)}`;
    const current = byKey.get(key);

    if (!current || pair.confidence > current.confidence) byKey.set(key, pair);
  }

  return Array.from(byKey.values());
}

function hasJoinableAggregationPair(aggregations: AggregationResult[]) {
  return bestJoinableAggregationPairs(aggregations).length > 0;
}

function findRanking(aggregations: AggregationResult[], {
  businessType,
  types,
  metricPattern,
  titlePattern
}: {
  businessType?: ReportBusinessType;
  types?: NonNullable<RankingResult["rankingType"]>[];
  metricPattern?: RegExp;
  titlePattern?: RegExp;
}) {
  const matches = (ranking: RankingResult) =>
    (!types?.length || (ranking.rankingType && types.includes(ranking.rankingType))) &&
    (!metricPattern || metricPattern.test(`${ranking.metricField ?? ranking.metric} ${ranking.title}`)) &&
    (!titlePattern || titlePattern.test(ranking.title));

  return allRankings(aggregations, businessType).find(matches) ??
    (businessType ? allRankings(aggregations).find(matches) : undefined);
}

function findPreferredRanking(aggregations: AggregationResult[], options: Parameters<typeof findRanking>[1]): RankingResult | undefined {
  const candidates = allRankings(aggregations, options.businessType)
    .filter((ranking) =>
      (!options.types?.length || (ranking.rankingType && options.types.includes(ranking.rankingType))) &&
      (!options.metricPattern || options.metricPattern.test(`${ranking.metricField ?? ranking.metric} ${ranking.title}`)) &&
      (!options.titlePattern || options.titlePattern.test(ranking.title))
    );

  const preferred = candidates.find((ranking) => ranking.rankingType === "top_group") ??
    candidates.find((ranking) => ranking.rankingType === "high_volume_low_quality") ??
    candidates.find((ranking) => ranking.rankingType === "high_quality_low_volume") ??
    candidates[0];

  if (preferred) return preferred;

  return options.businessType ? findPreferredRanking(aggregations, { ...options, businessType: undefined }) : undefined;
}

function hasAnyRanking(aggregations: AggregationResult[]) {
  return aggregations.some((aggregation) =>
    aggregation.topRankings.length > 0 || aggregation.bottomRankings.length > 0
  );
}

function confidenceFor({
  metrics,
  comparison,
  aggregations,
  businessType,
  limitations
}: {
  metrics: SelectedReportMetric[];
  comparison: Comparison;
  aggregations: AggregationResult[];
  businessType?: ReportBusinessType;
  limitations: string[];
}) {
  let score = 58;
  const reasons: string[] = [];
  const counts = scopedAggregationCounts(aggregations, businessType);

  if (metrics.length >= 2) {
    score += 8;
    reasons.push("多个已验证指标共同支撑");
  } else if (metrics.length === 1) {
    score += 4;
    reasons.push("存在已验证指标证据");
  }

  if (comparison.comparisonType !== "none") {
    score += 12;
    reasons.push(`存在 ${comparison.comparisonType} 对比基准`);
  } else {
    score -= 8;
    reasons.push("缺少对比基准，不能强判断高低或异常");
  }

  if (counts.groupBy > 0) {
    score += 7;
    reasons.push("有分组聚合支撑");
  }
  if (counts.ranking > 0) {
    score += 7;
    reasons.push("有 Top/Bottom 排名支撑");
  }
  if (counts.trend > 0) {
    score += 6;
    reasons.push("有时间趋势支撑");
  }
  if (counts.distribution > 0 || metrics.some((metric) => metric.metricType === "distribution_metric")) {
    score += 5;
    reasons.push("有分布基准支撑");
  }

  if (metrics.some((metric) => metric.isEstimated)) {
    score -= 14;
    reasons.push("包含估算指标");
  }
  if (metrics.some((metric) => metric.requiresDeduplication)) {
    score -= 10;
    reasons.push("存在未去重口径风险");
  }
  if (metrics.some((metric) => metric.warning)) {
    score -= 8;
    reasons.push("存在指标口径限制");
  }
  if (limitations.length) {
    score -= Math.min(16, limitations.length * 4);
    reasons.push("仍缺少部分分析证据");
  }

  if (comparison.comparisonType === "none") {
    score = Math.min(score, 70);
  }

  return {
    score: Math.max(42, Math.min(95, score)),
    reason: reasons.join("；")
  };
}

function buildInsight({
  id,
  title,
  findingType,
  summary,
  metrics,
  aggregations,
  businessType,
  businessMeaning,
  nextAction,
  currentConclusion,
  supportingEvidence,
  deeperAnalysisResult,
  businessImplication,
  recommendedDecision,
  caveat,
  limitations = [],
  riskOrOpportunity,
  evidenceObjects,
  evidence,
  comparedGroups,
  joinedTables,
  joinKey,
  technicalDetails
}: {
  id: string;
  title: string;
  findingType?: GeneratedInsight["findingType"];
  summary: string;
  metrics: SelectedReportMetric[];
  aggregations: AggregationResult[];
  businessType?: ReportBusinessType;
  businessMeaning: string;
  nextAction: string;
  currentConclusion?: string;
  supportingEvidence?: string;
  deeperAnalysisResult?: string;
  businessImplication?: string;
  recommendedDecision?: string;
  caveat?: string;
  limitations?: string[];
  riskOrOpportunity?: string;
  evidenceObjects?: Array<Record<string, string | number | null>>;
  evidence?: string;
  comparedGroups?: Array<Record<string, string | number | null>>;
  joinedTables?: string[];
  joinKey?: string;
  technicalDetails?: GeneratedInsight["technicalDetails"];
}): GeneratedInsight {
  const evidenceMetrics = uniqueByName(metrics).map((metric) => metric.displayName);
  const comparison = comparisonFor(metrics);
  const confidence = confidenceFor({ metrics, comparison, aggregations, businessType, limitations });
  const decision = recommendedDecision ?? nextAction;
  const reminder = caveat ?? limitations[0];

  return {
    id,
    title,
    findingType,
    summary,
    finding: summary,
    currentConclusion: currentConclusion ?? summary,
    supportingEvidence: supportingEvidence ?? supportingEvidenceText(metrics),
    evidence: evidence ?? supportingEvidence ?? supportingEvidenceText(metrics),
    deeperAnalysisResult: deeperAnalysisResult ?? summary,
    businessImplication: businessImplication ?? businessMeaning,
    recommendedDecision: nonTaskDecision(decision),
    caveat: reminder,
    evidenceMetrics,
    evidenceValues: Object.fromEntries(uniqueByName(metrics).map((metric) => [metric.displayName, metricValue(metric)])),
    evidenceObjects,
    comparedGroups,
    joinedTables,
    joinKey,
    technicalDetails,
    comparison,
    businessMeaning,
    riskOrOpportunity,
    nextAction: nonTaskDecision(decision),
    confidence: confidence.score / 100,
    confidenceReason: confidence.reason,
    limitations
  };
}

function limitation(id: string, title: string, message: string, impact: string, suggestedFix: string): DataLimitation {
  return {
    id,
    title,
    limitation: message,
    impact,
    suggestedFix,
    message
  };
}

function buildLimitations(
  aggregations: AggregationResult[],
  metricResults: ReportMetricResultInput[],
  selectedMetrics: SelectedReportMetric[]
): DataLimitation[] {
  const output: DataLimitation[] = [];
  const estimatedMetrics = uniqueByName(selectedMetrics.filter((metric) => metric.isEstimated));
  const deduplicationMetrics = uniqueByName(selectedMetrics.filter((metric) =>
    metric.requiresDeduplication ||
    metricWarningMatches(metric, /重复|去重|dedup|raw record|原始记录/)
  ));
  const warningResults = metricResults.filter((result) =>
    Array.isArray(result.warningTypes) && result.warningTypes.length > 0
  );
  const smallSampleResults = metricResults.filter((result) =>
    result.warningTypes?.includes("small_sample_warning") ||
    result.warningTypes?.includes("small_sample") ||
    (typeof result.sampleSize === "number" && result.sampleSize < 20)
  );
  const estimatedWarningResults = warningResults.filter((result) => result.warningTypes?.includes("estimated_value"));
  const deduplicationWarningResults = warningResults.filter((result) =>
    result.warningTypes?.includes("deduplication_warning") ||
    result.warningTypes?.includes("deduplication_risk")
  );
  const missingBenchmarkMetrics = uniqueByName(selectedMetrics.filter((metric) =>
    !metric.isBenchmarkMetric &&
    !metric.benchmarkContext &&
    metric.warning &&
    !metric.isEstimated &&
    !metric.requiresDeduplication
  ));
  const availableFields = fieldsFromAggregationResults(aggregations);
  const fieldText = readableFields(availableFields);
  const unavailableComputedMetrics = metricResults
    .filter((result) => result.status === "computed" && !hasDisplayableMetricResult(result))
    .map((result) => result.displayName || result.metricName)
    .filter(Boolean);

  if (aggregations.every((aggregation) => aggregation.groupBys.length === 0)) {
    output.push(limitation(
      "missing-groupby",
      "缺少分组对比",
      fieldText
        ? `当前可用维度包括 ${fieldText}，但仍缺少 group comparison，无法判断这些维度下的贡献差异`
        : "当前缺少可用分组字段和 group comparison，无法判断具体分组贡献",
      "报告不能定位具体贡献来源或低表现分组",
      fieldText
        ? `优先生成 ${fieldText} 的 group_vs_overall`
        : "先识别业务维度字段，再生成 groupBy 聚合"
    ));
  }

  if (aggregations.every((aggregation) => aggregation.topRankings.length === 0 && aggregation.bottomRankings.length === 0)) {
    output.push(limitation(
      "missing-ranking",
      "缺少 Top/Bottom 排名",
      "当前缺少对象级排名，无法定位具体高表现或低表现对象",
      "报告不能识别明确的增长机会对象或风险对象",
      "生成 Top Objects by Key Metric 和 Bottom Objects by Quality Metric"
    ));
  }

  if (aggregations.every((aggregation) => aggregation.timeTrends.length === 0)) {
    output.push(limitation(
      "missing-time-trend",
      "缺少历史趋势",
      "当前缺少时间趋势聚合，无法判断增长、下滑或周期性变化",
      "报告不能判断指标较上一周期是改善还是恶化",
      "补充 date / created_at / timestamp 后生成 period comparison"
    ));
  }

  if (aggregations.length > 1 && !hasJoinableAggregationPair(aggregations)) {
    output.push(limitation(
      "missing-join-key",
      "缺少稳定跨表关联字段",
      "当前多个数据表之间缺少稳定关联字段，因此无法生成跨表 insight",
      "报告不能判断不同数据源之间的关系，例如规模和反馈、订单和客户、投放和转化是否一致",
      "补充 App、Product、Customer ID、Campaign ID 或 Account ID 等稳定 join key"
    ));
  }

  if (metricResults.some((result) => result.status === "failed")) {
    output.push(limitation(
      "failed-metrics",
      "部分指标计算失败",
      "部分指标未能成功计算，已从洞察生成中排除",
      "报告覆盖范围会变窄",
      "修复失败指标公式或字段映射后重新生成报告"
    ));
  }

  if (unavailableComputedMetrics.length) {
    output.push(limitation(
      "unavailable-metric-values",
      "部分指标当前不可用",
      `${Array.from(new Set(unavailableComputedMetrics)).slice(0, 5).join("、")} 已从核心摘要和关键发现中排除`,
      "空值、NaN 或无结果指标不会参与业务结论，避免把 “-” 当成有效数值",
      "检查公式分母、字段缺失、样本量或聚合条件后重新计算"
    ));
  }

  if (metricResults.every((result) => result.status !== "computed")) {
    output.push(limitation(
      "no-computed-metrics",
      "没有可用指标结果",
      "当前没有成功计算的已验证指标",
      "无法生成可信数据洞察",
      "先完成指标校验和 Metric Result Engine 计算"
    ));
  }

  if (estimatedMetrics.length || estimatedWarningResults.length) {
    const labels = [
      ...estimatedMetrics.map((metric) => metric.displayName),
      ...estimatedWarningResults.map((result) => result.displayName || result.metricName)
    ];
    output.push(limitation(
      "estimated-value-limitation",
      "估算值不能代表真实收入",
      `${Array.from(new Set(labels)).slice(0, 6).join("、")} 基于 Price × Volume 或类似推算，只能用于方向判断`,
      "不能直接作为收入、利润或现金流结论",
      "补充 paid_amount、order_amount、transaction_amount 等真实交易字段"
    ));
  }

  if (deduplicationMetrics.length || deduplicationWarningResults.length) {
    const labels = [
      ...deduplicationMetrics.map((metric) => metric.displayName),
      ...deduplicationWarningResults.map((result) => result.displayName || result.metricName)
    ];
    output.push(limitation(
      "deduplication-limitation",
      "规模指标需要去重口径",
      `${Array.from(new Set(labels)).slice(0, 6).join("、")} 可能受重复实体影响`,
      "市场规模、评论量或集中度可能被原始记录放大",
      "生成 Deduped Total Installs、Deduped Total Reviews、Deduped Top 5 Share"
    ));
  }

  if (smallSampleResults.length) {
    const labels = Array.from(new Set(smallSampleResults.map((result) => result.displayName || result.metricName))).slice(0, 6);
    output.push(limitation(
      "small-sample-limitation",
      "对象级样本量不足",
      `${labels.join("、")} 存在小样本限制，样本量低于 20 的对象级 rate 只能作为排查线索`,
      "样本量过小时，100% 或 0% 的对象级比例容易误导，不能作为强业务风险",
      "展示对象级 rate 时同步显示 sample size，并优先补充更大样本或更长观察窗口"
    ));
  }

  if (missingBenchmarkMetrics.length) {
    output.push(limitation(
      "metric-warning-limitation",
      "部分指标缺少可靠对比基准",
      `${missingBenchmarkMetrics.slice(0, 4).map((metric) => metric.displayName).join("、")} 仍存在口径或 benchmark 限制`,
      "这些指标只能用于方向判断，不应被解释为异常或机会",
      "补充 target、previous period、group average 或 distribution comparison"
    ));
  }

  const priority: Record<string, number> = {
    "estimated-value-limitation": 100,
    "deduplication-limitation": 95,
    "small-sample-limitation": 90,
    "metric-warning-limitation": 80,
    "missing-ranking": 70,
    "missing-groupby": 68,
    "missing-join-key": 66,
    "missing-time-trend": 55,
    "failed-metrics": 50,
    "unavailable-metric-values": 48,
    "no-computed-metrics": 45
  };

  return output
    .sort((left, right) => (priority[right.id] ?? 0) - (priority[left.id] ?? 0))
    .slice(0, 5);
}

function categoricalComparisonInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const ranking = bestCategoricalRankings(aggregations)[0];
  if (!ranking) return null;

  const owner = rankingOwner(aggregations, ranking);
  const dimension = ranking.entityField ?? ranking.dimension;
  const dimensionLabel = readableRankingLabel(dimension);
  const metricLabel = readableRankingLabel(ranking.metricField ?? ranking.metric);
  const groupNames = rankingObjectNames(ranking, 3);
  const groupText = rankingObjectsText(ranking, 3);
  const top3Share = topShareForRanking(ranking, 3);
  const top3ShareLabel = rankingShareLabel(ranking, 3);
  const top3ShareText = top3Share != null ? shareText(top3ShareLabel, top3Share) : "";
  const hasQualityEvidence = hasQualityOrSentimentByDimension(aggregations, dimension, owner?.businessType);
  const evidence = insightMetricEvidence(metrics, ranking);
  const confidence = top3Share != null ? 0.84 : 0.76;

  return buildInsight({
    id: `category-comparison-${normalizeFieldKey(dimension)}-${normalizeFieldKey(ranking.metricField ?? ranking.metric)}`,
    findingType: "category_comparison",
    title: top3Share != null
      ? `${dimensionLabel} 维度显示头部分组贡献 ${(top3Share * 100).toFixed(1)}%`
      : `${dimensionLabel} 维度已经形成头部分组对比`,
    summary: [groupText, top3ShareText].filter(Boolean).join("；"),
    metrics: evidence,
    aggregations,
    businessType: owner?.businessType,
    currentConclusion: `${groupNames} 是当前 ${metricLabel} 最高的 ${dimensionLabel} 分组${top3Share != null ? `，前三组合计占比 ${(top3Share * 100).toFixed(1)}%` : ""}。`,
    supportingEvidence: rankingEvidenceText(ranking, 3),
    evidence: rankingEvidenceText(ranking, 3),
    deeperAnalysisResult: hasQualityEvidence
      ? `系统已经在 ${dimensionLabel} 维度生成质量或反馈聚合，可直接对比头部分组的规模、评分、评论量和负向反馈表现。`
      : `当前已有 ${metricLabel} 的 ${dimensionLabel} 分类对比，但缺少同一维度的评分或情绪聚合，因此暂不能判断头部分组是否伴随质量风险。`,
    businessImplication: `头部 ${dimensionLabel} 决定整体 ${metricLabel} 表现；如果头部分组质量偏低，会对整体体验和增长质量产生更大影响。`,
    recommendedDecision: hasQualityEvidence
      ? "优先将头部分组中高规模低质量的对象列为处理对象。"
      : "当前先把头部分组作为质量验证候选，不把高规模直接解释为高质量增长。",
    businessMeaning: `${dimensionLabel} 分类对比能把全局规模拆到具体分组，避免报告只复述总体指标。`,
    nextAction: hasQualityEvidence
      ? "优先将头部分组中高规模低质量的对象列为处理对象。"
      : "当前先把头部分组作为质量验证候选，不把高规模直接解释为高质量增长。",
    comparedGroups: rankingObjects(ranking, 10),
    evidenceObjects: rankingObjects(ranking, 10),
    caveat: ranking.totalValue == null ? "当前 ranking 缺少 totalValue，无法输出完整 Top Share 判断。" : undefined,
    limitations: hasQualityEvidence ? [] : [`缺少 ${dimensionLabel} 级评分或情绪聚合`]
  });
}

function joinedTableInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const pairs = bestJoinableAggregationPairs(aggregations)
    .sort((left, right) => {
      const score = (pair: { left: AggregationResult; right: AggregationResult; key: string; matchedKey: string; confidence: number }) => {
        const businessScore = new Set([pair.left.businessType, pair.right.businessType]).has("reviews") ? 20 : 0;
        const appScore = canonicalJoinKey(pair.key) === "app" ? 15 : 0;
        const evidenceScore = pair.left.topRankings.length + pair.right.topRankings.length + pair.left.groupBys.length + pair.right.groupBys.length;

        return businessScore + appScore + evidenceScore + pair.confidence * 10;
      };

      return score(right) - score(left);
    });

  const pair = pairs[0];
  if (!pair) return null;

  const joinedTables = [pair.left.datasetName, pair.right.datasetName];
  const businessJoinLabel = readableRankingLabel(pair.key);
  const scopedAggregations = [pair.left, pair.right];
  const scaleRanking = findPreferredRanking(scopedAggregations, {
    types: ["top_by_scale", "top_group"],
    metricPattern: /installs|revenue|sales|gmv|orders|users|reviews|volume|mrr|arr/i
  });
  const qualityRanking = findRanking(scopedAggregations, {
    types: ["bottom_by_quality", "high_volume_low_quality"],
    metricPattern: /negative|rating|score|sentiment|conversion|refund|churn|quality/i,
    titlePattern: /negative|负向|lowest|low quality|低质量|低评分/i
  });
  const scaleObjects = rankingObjectNames(scaleRanking, 3);
  const qualityObjects = rankingObjectNames(qualityRanking, 3);
  const qualityObjectsWithSamples = negativeRankingObjectsText(qualityRanking, 3) || qualityObjects;
  const scaleNames = new Set(rankingObjectNames(scaleRanking, 10).split("、").map(normalizeFieldKey).filter(Boolean));
  const qualityNames = rankingObjectNames(qualityRanking, 10).split("、").map((name) => ({ raw: name, key: normalizeFieldKey(name) })).filter((item) => item.key);
  const overlap = qualityNames.filter((item) => scaleNames.has(item.key)).map((item) => item.raw).slice(0, 3);
  const themeText = rankingThemesText(qualityRanking);
  const hasSmallSample = hasSmallSampleRows(qualityRanking);
  const evidence = uniqueByName([
    ...metrics.filter((metric) => /installs|reviews|rating|sentiment|negative|revenue|sales|conversion/i.test(metricText(metric))).slice(0, 4)
  ]);

  return buildInsight({
    id: `joined-${normalizeFieldKey(pair.left.datasetName)}-${normalizeFieldKey(pair.right.datasetName)}-${normalizeFieldKey(pair.key)}`,
    findingType: "joined_table_insight",
    title: `${businessJoinLabel} 规模与用户反馈可以同视角判断`,
    summary: [
      scaleObjects ? `规模头部对象：${scaleObjects}` : "",
      qualityObjectsWithSamples ? `质量或负向反馈候选对象：${qualityObjectsWithSamples}` : ""
    ].filter(Boolean).join("；"),
    metrics: evidence,
    aggregations,
    businessType: pair.left.businessType === "generic" ? pair.right.businessType : pair.left.businessType,
    currentConclusion: `${businessJoinLabel} 维度可以同时观察规模、评分和用户反馈，当前报告应优先识别高规模但质量或反馈偏弱的对象。`,
    supportingEvidence: [
      scaleRanking ? `规模证据：${rankingObjectsText(scaleRanking, 3)}` : "",
      qualityRanking ? `质量/反馈证据：${qualityObjectsWithSamples}` : ""
    ].filter(Boolean).join("；"),
    evidence: [
      scaleRanking ? `规模证据：${rankingObjectsText(scaleRanking, 3)}` : "",
      qualityRanking ? `质量/反馈证据：${qualityObjectsWithSamples}` : ""
    ].filter(Boolean).join("；"),
    deeperAnalysisResult: overlap.length
      ? `${overlap.join("、")} 同时出现在规模头部和质量/负向反馈候选中，应作为高影响风险对象。`
      : qualityRanking
        ? themeText
          ? `负向反馈主题已识别为：${themeText}。`
          : `当前已识别 ${qualityObjectsWithSamples} 为质量或负向反馈候选对象；如果它们同时具备较高规模，应进入高影响排查清单。`
        : "当前已识别对象规模排名，但缺少同一对象粒度的质量、情绪或转化排名，因此暂不能判断高规模是否伴随低质量。",
    businessImplication: "把规模和用户反馈放在同一对象视角下，能避免只看安装量、收入或评论量而忽略体验风险。",
    recommendedDecision: overlap.length
      ? "优先处理同时具备高规模和低质量信号的对象。"
      : "当前将跨表对象作为优先验证池；缺少质量排名时不输出强风险结论。",
    businessMeaning: "这种对象级对比能发现高规模低质量、高质量低规模或评分与情绪不一致的问题。",
    nextAction: overlap.length
      ? "优先处理同时具备高规模和低质量信号的对象。"
      : "当前将跨表对象作为优先验证池；缺少质量排名时不输出强风险结论。",
    caveat: [
      pair.confidence < 0.75 ? "当前 join 基于名称或语义匹配，可能存在重复、拼写差异或一对多问题，结果仅作方向性参考。" : "",
      hasSmallSample ? "对象级负向率样本量较小，仅作为排查线索。" : ""
    ].filter(Boolean).join(" "),
    comparedGroups: [
      ...rankingObjects(scaleRanking, 5),
      ...rankingObjects(qualityRanking, 5)
    ],
    evidenceObjects: [
      ...rankingObjects(scaleRanking, 5),
      ...rankingObjects(qualityRanking, 5)
    ],
    joinedTables,
    joinKey: pair.key,
    technicalDetails: {
      joinedTables,
      joinKey: pair.key,
      sourceDatasets: joinedTables,
      fieldMapping: pair.key === pair.matchedKey ? undefined : { [pair.key]: pair.matchedKey },
      joinConfidence: pair.confidence,
      caveat: pair.confidence < 0.75
        ? "当前关联基于名称或语义匹配，可能存在重复、拼写差异或一对多问题，结果仅作方向性参考。"
        : undefined
    },
    limitations: qualityRanking ? [] : ["缺少同一对象粒度的质量或反馈排名"]
  });
}

function insightPriority(insight: GeneratedInsight) {
  const findingScore: Record<string, number> = {
    joined_table_insight: 120,
    category_comparison: 110,
    high_scale_low_quality: 95,
    high_quality_low_scale: 92,
    group_vs_overall: 88,
    trend_shift: 76,
    metric_risk: 68,
    data_limitation: 20
  };
  const typeScore = insight.findingType ? findingScore[insight.findingType] ?? 50 : 50;
  const evidenceScore = (insight.evidenceObjects?.length ?? 0) > 0 ? 8 : 0;
  const comparisonScore = insight.comparison?.comparisonType && insight.comparison.comparisonType !== "none" ? 6 : 0;

  return typeScore + evidenceScore + comparisonScore + insight.confidence / 10;
}

function scaleInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const scaleMetrics = uniqueByName(metrics.filter((metric) =>
    metric.metricType === "core_metric" &&
    /total|count|volume|installs|reviews|orders|users|apps|records|sales|revenue|gmv/i.test(metricText(metric))
  ));
  const distribution = metricsByType(metrics, "distribution_metric");
  const concentration = metricsByType(metrics, "concentration_metric");
  const evidence = uniqueByName([...scaleMetrics.slice(0, 3), ...distribution.slice(0, 2), ...concentration.slice(0, 2)]);

  if (!scaleMetrics.length) return null;

  const primary = scaleMetrics[0];
  const ratio = metricMatch(distribution, /mean median ratio/i);
  const topShare = concentration[0];
  const anyRankingExists = hasAnyRanking(aggregations);
  const scaleRanking = findPreferredRanking(aggregations, {
    businessType: primary.businessType,
    types: ["top_by_scale", "top_group"],
    metricPattern: /installs|revenue|sales|gmv|volume|reviews|orders|users|records|objects/i
  });
  const rankingNames = rankingObjectNames(scaleRanking);
  const rankingText = rankingObjectsText(scaleRanking, 3);
  const top3Share = topShareForRanking(scaleRanking, 3);
  const top3ShareText = top3Share != null ? shareText(rankingShareLabel(scaleRanking, 3), top3Share) : "";
  const ratioText = ratioSeverityText(ratio);
  const hasQualityEvidence = hasQualityOrSentimentByDimension(
    aggregations,
    scaleRanking?.dimension ?? scaleRanking?.entityField,
    primary.businessType
  );
  const dedupedScaleMetric = dedupedMetricFor(metrics, /installs|reviews|volume|sales|revenue|gmv/i);
  const deduplicationText = primary.requiresDeduplication && !dedupedScaleMetric
    ? "当前尚未生成去重版本，因此市场规模和集中度判断存在放大风险。"
    : dedupedScaleMetric
      ? `已存在 ${dedupedScaleMetric.displayName}，可以与 raw 口径并列判断规模差异。`
      : "";
  const limitations: string[] = [];

  if (!ratio && !topShare && !scaleRanking && !hasAggregationEvidence(aggregations, primary.businessType)) {
    limitations.push("当前缺少 median、topN share 或分组排名，无法判断规模是否被少数对象拉高");
  }

  return buildInsight({
    id: "scale-distribution",
    title: scaleRanking
      ? "头部规模来源已经识别，可直接判断集中度"
      : ratioText || topShare
        ? "整体规模已有对比基准，可初步判断长尾和集中度"
        : "整体规模已可计算，但暂不能判断是否由头部对象拉高",
    summary: [
      `${primary.displayName} 为 ${primary.displayValue}`,
      ratioText ?? "",
      topShare ? `${topShare.displayName} 为 ${topShare.displayValue}` : "",
      scaleRanking && rankingText ? `${rankingText} 是当前规模贡献最高的对象或分组` : "",
      top3ShareText
    ].filter(Boolean).join("；"),
    metrics: evidence,
    aggregations,
    businessType: primary.businessType,
    currentConclusion: scaleRanking && rankingText
      ? `${rankingNames} 是当前规模贡献最高的对象或分组，说明规模来源已经可以定位。`
      : `${primary.displayName} 为 ${primary.displayValue}，当前只能确认总体规模。`,
    supportingEvidence: supportingEvidenceText(
      evidence,
      rankingText,
      top3ShareText || undefined
    ),
    deeperAnalysisResult: [
      scaleRanking && rankingText
        ? hasQualityEvidence
          ? `比较结果已包含 ${scaleRanking.dimension} 级质量或情绪聚合，当前可以直接对照头部规模和质量表现。`
          : `当前已有安装量或规模排名（${rankingText}），但缺少对应的类别级评分和情绪聚合，因此暂不能判断头部类别是否伴随质量风险。`
        : "当前缺少对象级排名或分组排名，因此暂不能定位规模贡献来自哪些对象。",
      ratioText ?? "",
      deduplicationText
    ].filter(Boolean).join(" "),
    businessImplication: "头部对象或头部类别决定整体规模表现；如果头部规模伴随低质量，会对整体评分、留存和增长质量产生更大影响。",
    recommendedDecision: scaleRanking
      ? "将头部规模对象标记为质量验证对象；在缺少质量聚合前，不把高安装或高规模直接解释为高质量增长。"
      : "规模结论暂按总体观察处理，不进入对象级优先级判断。",
    caveat: primary.requiresDeduplication ? "规模指标存在 raw / 未去重口径限制。" : undefined,
    businessMeaning: ratioText
      ? ratioText
      : scaleRanking
        ? top3Share != null
          ? `对象级排名已经提供规模来源，Top 3 合计贡献 ${(top3Share * 100).toFixed(1)}%，报告可以直接基于头部分组判断规模来源`
          : "对象级排名已经提供规模来源，报告可以直接定位头部对象，而不是停留在总体指标"
        : topShare
          ? "规模指标与集中度指标结合后，可以判断平均表现是否被头部对象拉高"
        : "当前只能确认规模大小，不能判断规模来自广泛对象还是少数头部对象",
    nextAction: scaleRanking && rankingNames
      ? "将头部规模对象标记为质量验证对象；在缺少质量聚合前，不把高安装或高规模直接解释为高质量增长。"
      : ratio || topShare || anyRankingExists
        ? "当前可基于集中度、分布和排名证据判断规模口径。"
        : "规模结论暂按总体观察处理，不进入对象级优先级判断。",
    evidenceObjects: rankingObjects(scaleRanking, 10),
    limitations
  });
}

function feedbackInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const feedback = metrics.filter((metric) =>
    metric.businessType === "reviews" ||
    /sentiment|review|rating|score|complaint|feedback/i.test(metricText(metric))
  );
  const reviewVolume = metricMatchByName(feedback, /^(review volume|valid review volume|review records|total reviews)$/i);
  const positive = metricMatchByName(feedback, /^positive sentiment rate$/i);
  const negative = metricMatchByName(feedback, /^negative sentiment rate$/i);
  const polarity = metricMatchByName(feedback, /^average sentiment( |_)?polarity$/i);
  const ratingCandidate = metricMatchByName(feedback, /^average rating$/i);
  const rating = metricNumber(ratingCandidate) != null && (metricNumber(ratingCandidate) ?? 0) <= 5
    ? ratingCandidate
    : undefined;
  const evidence = uniqueByName([reviewVolume, positive, negative, polarity, rating].filter(Boolean) as SelectedReportMetric[]);

  if (!evidence.length) return null;

  const negativeValue = metricNumber(negative);
  const feedbackFields = fieldsForBusinessType(aggregations, "reviews");
  const feedbackFieldText = readableFields(feedbackFields);
  const negativeRanking = findRanking(aggregations, {
    businessType: "reviews",
    types: ["bottom_by_quality", "high_volume_low_quality"],
    metricPattern: /negative|rating|score/i,
    titlePattern: /negative|负向|lowest|low quality/i
  });
  const negativeNames = rankingObjectNames(negativeRanking);
  const negativeObjects = negativeRankingObjectsText(negativeRanking);
  const themeText = rankingThemesText(negativeRanking);
  const hasThemes = rankingHasTextThemes(negativeRanking) && Boolean(themeText);
  const hasSmallSample = hasSmallSampleRows(negativeRanking);
  const limitations: string[] = [];

  if (!negativeRanking && !hasAggregationEvidence(aggregations, "reviews")) {
    limitations.push("当前缺少可用的反馈分组或对象级聚合，暂不能定位负向反馈来源");
  }

  return buildInsight({
    id: "quality-feedback",
    title: negativeValue != null && negativeValue >= 0.2
      ? "用户反馈整体可判断，负向反馈已达到关注水平"
      : "用户反馈已有质量信号，但仍需要对象级对比",
    summary: [
      reviewVolume ? `${reviewVolume.displayName} 为 ${metricValue(reviewVolume)}` : "",
      positive ? `正向反馈率为 ${metricValue(positive)}` : "",
      negative ? `负向反馈率为 ${metricValue(negative)}` : "",
      polarity ? `平均情绪分数为 ${metricValue(polarity)}` : "",
      rating ? `平均评分为 ${metricValue(rating)}` : "",
      negativeRanking && negativeObjects ? `对象级分析显示 ${negativeObjects} 是负向反馈候选对象` : ""
    ].filter(Boolean).join("；"),
    metrics: evidence,
    aggregations,
    businessType: "reviews",
    currentConclusion: negativeValue != null && negativeValue >= 0.2
      ? `整体 Negative Sentiment Rate 为 ${metricValue(negative)}，已超过 20% 关注阈值。`
      : "用户反馈已经形成全局质量信号，但当前不能把对象级指标替代全局判断。",
    supportingEvidence: supportingEvidenceText(
      evidence,
      negativeRanking && negativeObjects ? `负向反馈候选对象：${negativeObjects}` : undefined
    ),
    deeperAnalysisResult: negativeRanking
      ? hasThemes
        ? `评论主题分析显示负向反馈主要集中在：${themeText}。`
        : `当前只能识别负向反馈候选对象（${negativeObjects || negativeNames}），但尚未生成评论主题聚类，因此无法判断具体问题类型。`
      : "当前缺少反馈对象级聚合，因此暂不能定位负向反馈来源。",
    businessImplication: "负向反馈如果集中在少数对象，优先排查这些对象能更快降低整体负面体验。",
    recommendedDecision: negativeRanking
      ? "将这些对象列入产品或运营排查清单；若样本量足够，优先处理负面主题最高的问题。"
      : "全局负向率可作为关注信号，但暂不生成具体对象处理优先级。",
    caveat: hasSmallSample
      ? "对象级负向率样本量较小，仅作为排查线索，不作为强风险结论。"
      : undefined,
    businessMeaning: negativeValue != null && negativeValue >= 0.2
      ? "负向反馈达到两成以上时，用户体验问题可能已不是零散噪声，需要定位集中来源"
      : "质量指标能说明整体反馈方向，但没有对象级聚合时不能判断问题集中在哪些产品或类别",
    riskOrOpportunity: negativeValue != null && negativeValue >= 0.2 ? "负向反馈超过系统默认 20% 关注阈值" : undefined,
    nextAction: negativeRanking
      ? "将这些对象列入产品或运营排查清单；若样本量足够，优先处理负面主题最高的问题。"
      : feedbackFieldText
        ? `当前可用反馈维度为 ${feedbackFieldText}，但尚未形成对象级结论。`
        : "全局负向率可作为关注信号，但暂不生成具体对象处理优先级。",
    evidenceObjects: rankingObjects(negativeRanking, 10),
    limitations
  });
}

function monetizationInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const monetization = uniqueByName(metrics.filter((metric) =>
    metric.businessType !== "finance_timeseries" &&
    !/close price|trading volume|daily range|drawdown|volatility|stock|aapl/i.test(metricText(metric)) &&
    (
      /revenue|sales|gmv|paid|price|value|margin|profit|monetization/i.test(metricText(metric)) ||
      metric.isEstimated
    )
  ));

  if (!monetization.length) return null;

  const estimated = monetization.find((metric) => metric.isEstimated);
  const paidRatio = metricMatch(monetization, /paid.*ratio/i);
  const priceBenchmark = metricMatch(monetization, /median price|price p90|price mean median/i);
  const evidenceCandidates: SelectedReportMetric[] = [estimated, paidRatio, priceBenchmark, ...monetization.slice(0, 2)]
    .filter((metric): metric is SelectedReportMetric => Boolean(metric));
  const evidence = uniqueByName(evidenceCandidates.filter((metric) => validInsightValue(metric.value)));
  const actualRevenue = realRevenueMetric(monetization);

  return buildInsight({
    id: "monetization-benchmark",
    title: estimated ? "变现指标具备参考价值，但估算口径限制较强" : "变现指标已有结果，但仍需要真实交易对比",
    summary: evidence.map((metric) => `${metric.displayName} 为 ${metric.displayValue}`).join("；"),
    metrics: evidence,
    aggregations,
    businessType: evidence[0]?.businessType,
    currentConclusion: estimated
      ? `${estimated.displayName} 为 ${estimated.displayValue}，只能表示潜在付费规模，不代表真实收入。`
      : "当前已有变现相关指标，但需要确认其是否来自真实交易金额字段。",
    supportingEvidence: supportingEvidenceText(evidence),
    deeperAnalysisResult: estimated
      ? actualRevenue
        ? `已发现真实收入指标 ${actualRevenue.displayName}，应以真实收入字段作为经营判断主口径，估算值只作为方向参考。`
        : "当前缺少真实交易金额字段，因此无法验证估算值和真实收入之间的差异，也无法计算真实 ROI。"
      : "当前变现指标尚未与价格分布、付费比例和真实交易字段形成完整对照。",
    businessImplication: "估算变现值可以用于方向性判断，但不能作为收入、利润或现金流结论。",
    recommendedDecision: estimated
      ? `正式经营决策中不使用 ${estimated.displayName} 作为收入、利润或现金流依据。`
      : "真实交易字段确认前，不把变现指标写成强收入结论。",
    caveat: estimated ? "估算值不代表真实收入、利润或现金流。" : undefined,
    businessMeaning: estimated
      ? "估算值适合判断潜在规模，但不能解释为真实收入、利润或现金流"
      : "变现指标只有结合价格分布、付费比例和真实交易字段，才能判断收入质量",
    riskOrOpportunity: estimated ? "估算指标不能直接进入强经营结论" : undefined,
    nextAction: estimated
      ? `正式经营决策中不使用 ${estimated.displayName} 作为收入、利润或现金流依据。`
      : "真实交易字段确认前，不把变现指标写成强收入结论。",
    limitations: estimated ? ["该指标为估算值，不代表真实收入或真实业务结果"] : []
  });
}

function trendInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const trendMetrics = uniqueByName(metricsByType(metrics, "trend_metric"));
  const trendAggregation = aggregations.find((aggregation) => aggregation.timeTrends.length > 0);

  if (!trendMetrics.length && !trendAggregation) return null;

  const evidence = trendMetrics.slice(0, 4);
  const limitationText = trendAggregation ? [] : ["当前缺少可用 timeTrend 聚合，不能判断周期性变化"];

  return buildInsight({
    id: "trend-comparison",
    title: trendAggregation ? "趋势指标已有时间证据，可继续判断变化阶段" : "趋势指标存在，但缺少周期对比结果",
    summary: evidence.length
      ? evidence.map((metric) => `${metric.displayName} 为 ${metric.displayValue}`).join("；")
      : `${trendAggregation?.timeTrends[0]?.title ?? "时间趋势"} 已生成`,
    metrics: evidence,
    aggregations,
    businessType: evidence[0]?.businessType ?? trendAggregation?.businessType,
    currentConclusion: trendAggregation
      ? "当前已经生成时间趋势证据，可以用于描述不同周期中的变化。"
      : "当前存在趋势类指标，但缺少可用 timeTrend 聚合。",
    supportingEvidence: supportingEvidenceText(evidence, trendAggregation?.timeTrends[0]?.title),
    deeperAnalysisResult: trendAggregation
      ? "时间趋势已存在，但若缺少 current period、previous period 或 rolling average，仍不能输出强增长或下降判断。"
      : "当前缺少 current/previous period 对比和 rolling average，因此暂不能判断增长、下降或周期性波动。",
    businessImplication: "趋势判断需要时间窗口和对比周期支撑，否则只能作为方向性观察。",
    recommendedDecision: trendAggregation
      ? "趋势结论应与周期对比一起展示；缺少周期对比时不写成改善或恶化。"
      : "趋势结论暂不进入强经营判断。",
    businessMeaning: trendAggregation
      ? "时间趋势可以判断指标在不同周期中的变化，但仍需要 current vs previous 或 rolling average 支撑强判断"
      : "目前只能说明存在趋势类指标，不能判断增长或下降幅度",
    nextAction: trendAggregation
      ? "趋势结论应与周期对比一起展示；缺少周期对比时不写成改善或恶化。"
      : "趋势结论暂不进入强经营判断。",
    limitations: limitationText
  });
}

function genericInsight(metrics: SelectedReportMetric[], aggregations: AggregationResult[]) {
  const alreadyCovered = new Set([
    ...metrics.filter((metric) => /sentiment|review|rating|revenue|sales|paid|price|value/i.test(metricText(metric))).map((metric) => metric.metricId)
  ]);
  const candidates = uniqueByName(metrics.filter((metric) => !alreadyCovered.has(metric.metricId)));

  if (!candidates.length) return null;

  const grouped = new Map<string, SelectedReportMetric[]>();
  for (const metric of candidates) {
    const key = metric.businessType ?? metric.sourceDataset ?? "generic";
    grouped.set(key, [...(grouped.get(key) ?? []), metric]);
  }

  const [scopeKey, generic] = Array.from(grouped.entries()).sort(([, left], [, right]) => right.length - left.length)[0] ?? ["generic", candidates];

  if (!generic.length) return null;

  const primary = generic[0];
  const scopeBusinessType = primary.businessType;
  const scopeLabel = scopeBusinessType ? MODULE_LABELS[scopeBusinessType] : scopeKey;
  const ranking = findPreferredRanking(aggregations, {
    businessType: scopeBusinessType,
    types: ["top_by_scale", "bottom_by_quality", "high_volume_low_quality", "high_quality_low_volume", "top_group", "bottom_group"]
  });
  const rankingNames = rankingObjectNames(ranking);
  const metricNames = generic.slice(0, 3).map((metric) => metric.displayName).join("、");

  return buildInsight({
    id: "generic-directional",
    title: "当前指标可做方向观察，但缺少业务基准支撑强判断",
    summary: ranking && rankingNames
      ? `${scopeLabel}模块已识别 ${rankingNames} 等对象级证据，可用于定位具体对象表现；但仍需要历史、目标或阈值对比才能判断是否异常`
      : `${scopeLabel}模块已计算 ${metricNames} 等指标，适合描述当前状态；但缺少历史、目标、分布或分组基准，暂不能判断表现高低或异常`,
    metrics: generic,
    aggregations,
    businessType: scopeBusinessType,
    currentConclusion: ranking && rankingNames
      ? `${scopeLabel}模块已定位 ${rankingNames} 等对象线索，但缺少明确 comparison，不能直接判断异常。`
      : `${scopeLabel}模块已有指标结果，但当前缺少历史、目标、分布或分组基准。`,
    supportingEvidence: supportingEvidenceText(generic, rankingObjectsText(ranking, 3)),
    deeperAnalysisResult: ranking && rankingNames
      ? "当前排名证据只能帮助定位对象，尚不能说明这些对象表现异常、高低或好坏。"
      : "当前只能描述现状，暂不能判断表现是高、低还是异常。",
    businessImplication: "没有对比基准时，报告应避免强判断，防止把状态描述误读为经营结论。",
    recommendedDecision: "该模块结论暂按方向性观察处理，不进入强优先级决策。",
    businessMeaning: "这些指标能够描述当前状态，但如果没有历史、目标、分布或分组基准，就不能判断表现是高、低还是异常",
    nextAction: "该模块结论暂按方向性观察处理，不进入强优先级决策。",
    evidenceObjects: rankingObjects(ranking, 10),
    limitations: ranking
      ? ["当前缺少明确 comparison，排名证据只能帮助定位对象，不能单独判断异常"]
      : ["当前缺少明确 comparison，不能输出高低、好坏或异常判断"]
  });
}

function evidenceValues(metrics: SelectedReportMetric[]) {
  return Object.fromEntries(uniqueByName(metrics).map((metric) => [metric.displayName, metricValue(metric)]));
}

function hasComparisonOnlySignal(metric: SelectedReportMetric) {
  const text = metricText(metric);

  return metric.metricType === "comparison_metric" ||
    metric.metricType === "distribution_metric" ||
    metric.metricType === "concentration_metric" ||
    /median|percentile|p75|p90|p95|mean median ratio|top \d+ .*share|threshold|group.*overall|previous period|period change/i.test(text);
}

function metricWarningMatches(metric: SelectedReportMetric, pattern: RegExp) {
  return pattern.test(`${metric.warning ?? ""} ${metric.displayName} ${metric.name} ${metric.formula}`.toLowerCase());
}

function comparisonText(metric: SelectedReportMetric, fallback?: string) {
  const benchmark = metric.benchmarkContext;
  if (benchmark?.comparisonType && benchmark.comparisonType !== "none") {
    const baseline = benchmark.baselineValue != null ? ` vs ${benchmark.baselineValue}` : "";
    const delta = benchmark.deltaPercent != null ? `，变化 ${(benchmark.deltaPercent * 100).toFixed(1)}%` : "";
    return `${metric.displayName} = ${metric.displayValue}${baseline}${delta}`;
  }

  return fallback ?? `${metric.displayName} = ${metric.displayValue}`;
}

function concentrationThreshold(metric: SelectedReportMetric) {
  const value = metricNumber(metric);
  const text = metricText(metric);

  if (value == null) return null;
  if (/top 1 .*share/i.test(text) && value > 0.5) return { threshold: 0.5, severity: "high" as const };
  if (/top 5 .*share/i.test(text) && value > 0.8) return { threshold: 0.8, severity: "high" as const };
  if (/top 10 .*share/i.test(text) && value > 0.9) return { threshold: 0.9, severity: "medium" as const };
  if (/mean median ratio/i.test(text) && value > 2) return { threshold: 2, severity: "medium" as const };

  return null;
}

function negativeThreshold(metric: SelectedReportMetric) {
  const value = metricNumber(metric);

  return value != null && /negative.*rate|负向/.test(metricText(metric)) && value > 0.2
    ? { threshold: 0.2, severity: value > 0.35 ? "high" as const : "medium" as const }
    : null;
}

function thresholdBreach(metric: SelectedReportMetric) {
  const benchmark = metric.benchmarkContext;
  if (benchmark?.comparisonType === "threshold" && benchmark.status === "risk") {
    return { severity: "medium" as const };
  }

  return negativeThreshold(metric);
}

function performanceDecline(metric: SelectedReportMetric) {
  const benchmark = metric.benchmarkContext;
  if (!benchmark || !/previous|period/i.test(benchmark.comparisonType)) return null;
  if ((benchmark.deltaPercent ?? 0) < -0.05 || benchmark.status === "low" || benchmark.status === "risk") {
    return { severity: Math.abs(benchmark.deltaPercent ?? 0) > 0.15 ? "high" as const : "medium" as const };
  }

  return null;
}

function riskCandidates(metrics: SelectedReportMetric[], aggregations: AggregationResult[]): CandidateResult[] {
  const rankingEvidence = allRankings(aggregations);
  const topScaleRanking = rankingEvidence.find((ranking) => ranking.rankingType === "top_group") ??
    rankingEvidence.find((ranking) => ranking.rankingType === "top_by_scale");
  const topScaleNames = rankingObjectNames(topScaleRanking);
  const availableRiskFields = fieldsFromAggregationResults(aggregations);
  const riskFieldText = readableFields(availableRiskFields);
  const aggregationRisks = aggregations.flatMap((aggregation) => aggregation.riskCandidates).map((risk) => ({
    ...risk,
    businessImpact: risk.businessImpact ?? risk.businessMeaning,
    confidenceReason: risk.confidenceReason ?? "该风险来自对象级排名或分组聚合结果"
  }));
  const concentrationMetrics = uniqueByName(metrics.filter((metric) =>
    (metric.metricType === "concentration_metric" || /top \d+ .*share|mean median ratio/i.test(metricText(metric))) &&
    concentrationThreshold(metric)
  ));
  const businessRiskMetrics = uniqueByName(metrics.filter((metric) =>
    metric.metricType === "risk_metric" &&
    !hasComparisonOnlySignal(metric) &&
    (thresholdBreach(metric) || performanceDecline(metric))
  ));
  const comparisonRiskMetrics = uniqueByName(metrics.filter((metric) =>
    hasComparisonOnlySignal(metric) &&
    metric.metricType !== "concentration_metric" &&
    (thresholdBreach(metric) || performanceDecline(metric))
  ));
  const output: CandidateResult[] = [];

  if (concentrationMetrics.length) {
    const strongest = concentrationMetrics
      .map((metric) => ({ metric, breach: concentrationThreshold(metric)! }))
      .sort((left, right) => ((metricNumber(right.metric) ?? 0) - (metricNumber(left.metric) ?? 0)))
      [0];
    const strongestRatioText = strongest ? ratioSeverityText(strongest.metric) : null;
    const rankingText = rankingObjectsText(topScaleRanking, 3);
    const top3Share = topShareForRanking(topScaleRanking, 3);
    const top3ShareLabel = rankingShareLabel(topScaleRanking, 3);
    output.push({
      id: "risk-concentration-merged",
      title: strongestRatioText ? "规模指标呈现明显长尾分布" : "核心规模指标存在头部集中风险",
      type: "concentration_risk",
      severity: strongest?.breach.severity ?? "medium",
      evidenceMetrics: concentrationMetrics.map((metric) => metric.displayName),
      evidenceValues: evidenceValues(concentrationMetrics),
      comparison: strongest ? comparisonText(strongest.metric, `${strongest.metric.displayValue} > ${strongest.breach.threshold}`) : undefined,
      businessMeaning: strongestRatioText ?? "Top Share、mean/median ratio 等指标显示规模可能由少数对象贡献，平均值可能无法代表普通对象表现。",
      businessImpact: rankingText
        ? `${rankingText} 是当前头部规模来源；如果这些对象质量低于整体，会对整体体验影响更大。`
        : "整体规模若依赖少数头部对象，长尾增长能力和风险分散能力可能不足。",
      recommendedAction: topScaleNames
        ? `当前已识别 ${topScaleNames} 为头部规模来源。${top3Share != null ? `${top3ShareLabel} 为 ${(top3Share * 100).toFixed(1)}%。` : ""}若缺少同一粒度的评分、评论量和负向反馈聚合，暂不能判断高规模是否伴随质量风险。`
        : "当前缺少对象级规模排名、高规模低质量排名和高质量低规模排名，因此暂不能定位头部来源和长尾机会。",
      objects: rankingObjects(topScaleRanking, 10),
      affectedObjects: rankingObjects(topScaleRanking, 10),
      confidence: 0.82,
      confidenceReason: "该风险由 top share 或 mean/median ratio 超过系统阈值触发"
    });
  }

  const riskEvidence = uniqueByName([...businessRiskMetrics, ...comparisonRiskMetrics]);

  if (riskEvidence.length) {
    const negative = riskEvidence.find((metric) => negativeThreshold(metric));
    const decline = riskEvidence.find((metric) => performanceDecline(metric));
    const primary = negative ?? decline ?? riskEvidence[0];
    const type = negative ? "negative_feedback_risk" : decline ? "performance_decline_risk" : "threshold_breach_risk";
    output.push({
      id: `risk-${type}`,
      title: negative ? "负向反馈超过关注阈值" : decline ? "核心指标较上一周期下降" : "指标超过系统关注阈值",
      type,
      severity: negativeThreshold(primary)?.severity ?? performanceDecline(primary)?.severity ?? "medium",
      evidenceMetrics: riskEvidence.map((metric) => metric.displayName),
      evidenceValues: evidenceValues(riskEvidence),
      comparison: comparisonText(primary, negative ? `${primary.displayValue} > 20% system threshold` : undefined),
      businessMeaning: negative
        ? "负向反馈占比超过关注阈值，用户体验已经出现需要排查的负面信号。"
        : "该指标已经出现阈值或历史周期层面的不利变化，需要确认影响范围和来源。",
      businessImpact: negative
        ? "负面体验可能影响满意度、留存和转化。"
        : "如果变化集中在关键对象或渠道，可能影响后续经营表现。",
      recommendedAction: negative
        ? (riskFieldText
          ? `当前已有 ${riskFieldText} 维度可支撑反馈来源判断；如果对象级负向排名已生成，应以负向反馈最高对象作为排查线索。`
          : "当前只能判断整体负向率超过阈值，缺少反馈对象级排名，因此暂不能定位具体来源。")
        : (riskFieldText
          ? `当前已有 ${riskFieldText} 维度可支撑变化来源判断；如果分组对比已生成，应优先使用低于整体平均的分组作为风险来源。`
          : "当前缺少分组对比和对象级排名，因此暂不能定位变化来源。"),
      confidence: primary.benchmarkContext?.comparisonType ? 0.84 : 0.74,
      confidenceReason: primary.benchmarkContext?.comparisonType
        ? "该风险有 benchmark comparison 支撑"
        : "该风险基于系统默认阈值触发，但仍需要对象级聚合确认来源"
    });
  }

  return [...aggregationRisks, ...output].slice(0, 5);
}

function opportunityCandidates(aggregations: AggregationResult[]): CandidateResult[] {
  const explicit = aggregations.flatMap((aggregation) => aggregation.opportunityCandidates);
  if (explicit.length) return explicit.slice(0, 3);

  const groupRanking = allRankings(aggregations).find((ranking) => ranking.rankingType === "top_group");
  if (!groupRanking?.rows.length) return [];

  const groupText = rankingObjectsText(groupRanking, 3);
  const groupNames = rankingObjectNames(groupRanking, 3);
  const top3Share = topShareForRanking(groupRanking, 3);
  const top3ShareLabel = rankingShareLabel(groupRanking, 3);

  return [{
    id: "opportunity-top-group-growth-pool",
    title: "头部类别具备增长验证价值",
    type: "group_level_opportunity",
    priority: "medium",
    evidenceMetrics: [groupRanking.title],
    evidenceValues: {
      [groupRanking.title]: groupText,
      ...(top3Share != null ? { [top3ShareLabel]: `${(top3Share * 100).toFixed(1)}%` } : {})
    },
    comparison: top3Share != null ? `${top3ShareLabel} ${(top3Share * 100).toFixed(1)}%` : undefined,
    targetObjects: rankingObjects(groupRanking, 10),
    businessMeaning: `${groupText || groupNames} 已被识别为头部规模分组，可作为类别级机会池；如果这些类别的评分和负向反馈表现优于整体，适合优先做增长验证。`,
    recommendedAction: `${groupNames} 已形成类别级机会池。若缺少高评分低安装对象排名，当前只能判断这些类别具备增长验证价值，暂不能定位具体 App 机会。`,
    confidence: 0.72,
    confidenceReason: "该机会来自类别级排名，适合判断方向；若要定位具体 App，还需要对象级机会排名"
  }];
}

function objectName(row: Record<string, string | number | null>) {
  return String(row.dimension ?? row.App ?? row.Product ?? row.product ?? row.category ?? row.Category ?? "").trim();
}

function namesFromRows(rows?: Array<Record<string, string | number | null>>, count = 3) {
  return (rows ?? [])
    .slice(0, count)
    .map(objectName)
    .filter(Boolean);
}

function isBusinessFacingField(field: string) {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (!normalized) return false;
  if ([
    "id",
    "row_id",
    "internal_id",
    "status",
    "anomalytype",
    "anomaly_type",
    "applied_steps_count",
    "created_at",
    "updated_at",
    "deleted",
    "enabled",
    "flag"
  ].includes(normalized)) {
    return false;
  }

  return !/^(debug|internal|system)_/.test(normalized);
}

function fieldsFromAggregationResults(aggregations: AggregationResult[]) {
  const fields = new Set<string>();

  for (const aggregation of aggregations) {
    for (const groupBy of aggregation.groupBys) {
      if (groupBy.dimension) fields.add(groupBy.dimension);
    }
    for (const ranking of [...aggregation.topRankings, ...aggregation.bottomRankings]) {
      if (ranking.entityField) fields.add(ranking.entityField);
      if (ranking.dimension) fields.add(ranking.dimension);
    }
  }

  return Array.from(fields).filter(isBusinessFacingField);
}

function fieldsForBusinessType(aggregations: AggregationResult[], businessType?: ReportBusinessType) {
  const scoped = businessType
    ? aggregations.filter((aggregation) => aggregation.businessType === businessType)
    : aggregations;

  return fieldsFromAggregationResults(scoped);
}

function readableFields(fields: string[]) {
  if (!fields.length) return "";
  return fields.slice(0, 3).join(" 和 ");
}

function bestScaleRanking(aggregations: AggregationResult[]) {
  return allRankings(aggregations).find((ranking) => ranking.rankingType === "top_group") ??
    allRankings(aggregations).find((ranking) => ranking.rankingType === "top_by_scale");
}

function bestQualityRiskRanking(aggregations: AggregationResult[]) {
  return allRankings(aggregations).find((ranking) => ranking.rankingType === "high_volume_low_quality") ??
    allRankings(aggregations).find((ranking) => ranking.rankingType === "bottom_by_quality");
}

function bestOpportunityRanking(aggregations: AggregationResult[]) {
  return allRankings(aggregations).find((ranking) => ranking.rankingType === "high_quality_low_volume") ??
    allRankings(aggregations).find((ranking) => ranking.rankingType === "top_group") ??
    allRankings(aggregations).find((ranking) => ranking.rankingType === "top_by_scale");
}

function actionsFromEvidence({
  opportunities,
  limitations,
  insights,
  aggregations
}: {
  opportunities: CandidateResult[];
  limitations: DataLimitation[];
  insights: GeneratedInsight[];
  aggregations: AggregationResult[];
}): GeneratedRecommendedAction[] {
  const actions: GeneratedRecommendedAction[] = [];
  const firstOpportunity = opportunities[0];
  const missingRanking = limitations.find((item) => item.id === "missing-ranking");
  const missingGroupBy = limitations.find((item) => item.id === "missing-groupby");
  const missingTrend = limitations.find((item) => item.id === "missing-time-trend");
  const deduplicationLimitation = limitations.find((item) => item.id === "deduplication-limitation");
  const estimatedLimitation = limitations.find((item) => item.id === "estimated-value-limitation");
  const scaleRanking = bestScaleRanking(aggregations);
  const qualityRanking = bestQualityRiskRanking(aggregations);
  const opportunityRanking = bestOpportunityRanking(aggregations);
  const scaleObjects = namesFromRows(scaleRanking?.rows);
  const qualityObjects = namesFromRows(qualityRanking?.rows);
  const opportunityObjects = namesFromRows(firstOpportunity?.targetObjects ?? firstOpportunity?.objects ?? opportunityRanking?.rows);
  const availableFields = fieldsFromAggregationResults(aggregations);
  const fieldText = readableFields(availableFields);
  const businessActionCount = () => actions.filter((action) => action.type !== "data_quality_action").length;
  const dataQualityActionCount = () => actions.filter((action) => action.type === "data_quality_action").length;
  const caveatFrom = (item?: DataLimitation) => item?.title ?? item?.message;
  const caveatsFrom = (...items: Array<DataLimitation | undefined>) => items.map(caveatFrom).filter((value): value is string => Boolean(value));

  if (scaleObjects.length) {
    actions.push({
      id: "action-analyze-top-objects",
      title: "验证头部对象是否伴随质量风险",
      type: "business_action",
      actionType: "expand_high_performing_segment",
      priority: "high",
      basedOn: [scaleRanking?.title ?? "Top ranking"],
      currentFinding: `${scaleObjects.join("、")} 是当前规模靠前的对象或分组，说明整体规模主要由这些头部来源驱动。`,
      whyItMatters: "如果头部对象规模高但评分或负向反馈表现差，会对整体体验和增长质量影响更大。",
      recommendedAction: `系统已识别 ${scaleObjects.join("、")} 为头部规模来源；若当前报告没有同粒度质量聚合，暂不能判断高规模是否伴随质量风险。`,
      evidence: scaleRanking?.title ?? "Top ranking",
      targetObjects: scaleObjects,
      action: `系统已识别 ${scaleObjects.join("、")} 为头部规模来源；若当前报告没有同粒度质量聚合，暂不能判断高规模是否伴随质量风险。`,
      expectedOutcome: "判断增长是否集中在少数对象，并确认头部规模是否伴随质量风险",
      expectedImpact: "把头部规模来源转化为可验证的质量风险或增长机会判断",
      roiConfidence: "medium",
      caveats: caveatsFrom(deduplicationLimitation),
      requiredDataIfAny: [],
      evidenceMetrics: [scaleRanking?.metricField ?? scaleRanking?.title ?? "Top ranking"],
      evidenceRankings: [scaleRanking?.title ?? "Top ranking"],
      referencedObjects: scaleObjects,
      referencedFields: availableFields,
      suggestedBreakdowns: availableFields
    });
  }

  if (qualityObjects.length && businessActionCount() < 3) {
    actions.push({
      id: "action-investigate-quality-risk",
      title: "定位高风险对象的问题来源",
      type: "business_action",
      actionType: "reduce_negative_feedback",
      priority: "high",
      basedOn: [qualityRanking?.title ?? "质量风险排名"],
      currentFinding: `${qualityObjects.join("、")} 被识别为负向反馈或低质量表现较高的候选对象。`,
      whyItMatters: "这些对象可能集中体现用户体验问题，但需要结合样本量确认风险强度。",
      recommendedAction: "当前只能识别这些对象为负向反馈候选对象；尚未生成评论主题聚类时，不能判断具体问题类型。",
      evidence: qualityRanking?.title ?? "质量风险排名",
      targetObjects: qualityObjects,
      action: "当前只能识别这些对象为负向反馈候选对象；尚未生成评论主题聚类时，不能判断具体问题类型。",
      expectedOutcome: "把质量风险落到具体对象，形成可执行的产品或运营优化清单",
      expectedImpact: "降低负向反馈对评分、留存、转化和口碑的影响",
      roiConfidence: "medium",
      caveats: limitations.filter((item) => item.id.includes("sample")).map((item) => item.title ?? item.message),
      requiredDataIfAny: [],
      evidenceMetrics: [qualityRanking?.metricField ?? qualityRanking?.title ?? "质量风险排名"],
      evidenceRankings: [qualityRanking?.title ?? "质量风险排名"],
      referencedObjects: qualityObjects,
      referencedFields: availableFields,
      suggestedBreakdowns: availableFields
    });
  }

  if (opportunityObjects.length && businessActionCount() < 3) {
    actions.push({
      id: "action-scale-opportunity-objects",
      title: "在头部类别中筛选可放大的优质对象",
      type: "business_action",
      actionType: "scale_opportunity_object",
      priority: "medium",
      basedOn: firstOpportunity?.evidenceMetrics ?? [opportunityRanking?.title ?? "机会排名"],
      currentFinding: `${opportunityObjects.join("、")} 已具备规模基础，可作为增长机会池。`,
      whyItMatters: "头部类别自带流量基础，如果其中存在高评分、低负向反馈或低曝光对象，适合做增长测试。",
      recommendedAction: "当前可判断这些分组具备增长验证价值；如果尚未生成高评分低安装对象排名，暂不能定位具体可放大的 App。",
      evidence: firstOpportunity?.title ?? opportunityRanking?.title ?? "机会排名",
      targetObjects: opportunityObjects,
      action: "当前可判断这些分组具备增长验证价值；如果尚未生成高评分低安装对象排名，暂不能定位具体可放大的 App。",
      expectedOutcome: "把类别级机会转成可验证的增长动作",
      expectedImpact: "把已有规模基础转化为更高质量的获客和曝光测试",
      roiConfidence: "medium",
      caveats: firstOpportunity ? [] : caveatsFrom(missingRanking),
      requiredDataIfAny: [],
      evidenceMetrics: firstOpportunity?.evidenceMetrics ?? [opportunityRanking?.metricField ?? "机会排名"],
      evidenceRankings: [firstOpportunity?.title ?? opportunityRanking?.title ?? "机会排名"],
      referencedObjects: opportunityObjects,
      referencedFields: availableFields,
      suggestedBreakdowns: availableFields
    });
  }

  if (!scaleObjects.length && dataQualityActionCount() < 3 && missingRanking) {
    actions.push({
      id: "action-object-rankings",
      title: "补充对象级排名",
      type: "data_quality_action",
      actionType: "fix_data_quality_for_decision",
      priority: "medium",
      basedOn: [missingRanking.title ?? missingRanking.message],
      action: "生成按规模排序的对象排名、高规模低质量对象排名和高质量低规模对象排名。",
      expectedOutcome: "定位风险对象和增长机会对象，而不是只停留在总体指标判断",
      expectedImpact: "让报告可以直接指出高风险对象和增长候选对象",
      roiConfidence: "unavailable",
      caveats: caveatsFrom(missingRanking),
      requiredDataIfAny: ["对象字段", "规模指标", "质量指标"],
      evidenceMetrics: [],
      evidenceRankings: [],
      referencedFields: availableFields,
      suggestedBreakdowns: ["按规模排序的对象排名", "高规模低质量对象排名", "高质量低规模对象排名"]
    });
  }

  if (dataQualityActionCount() < 3 && missingGroupBy) {
    actions.push({
      id: "action-group-comparison",
      title: "补充分组对比",
      type: "data_quality_action",
      actionType: "build_benchmark",
      priority: "medium",
      basedOn: [missingGroupBy.title ?? missingGroupBy.message],
      action: fieldText
        ? `基于真实存在的 ${fieldText} 维度生成 group_vs_overall。`
        : "先识别可用分组字段，再生成 group_vs_overall。",
      expectedOutcome: "判断贡献来源、低表现分组和优先拆解方向",
      expectedImpact: "让业务风险和增长机会可以落到真实分组，而不是停留在总体均值",
      roiConfidence: "unavailable",
      caveats: caveatsFrom(missingGroupBy),
      requiredDataIfAny: availableFields.length ? [] : ["可用分组字段"],
      evidenceMetrics: [],
      evidenceRankings: [],
      referencedFields: availableFields,
      suggestedBreakdowns: availableFields.map((field) => `${field} group_vs_overall`)
    });
  }

  if (dataQualityActionCount() < 3 && missingTrend) {
    actions.push({
      id: "action-period-comparison",
      title: "补充时间对比",
      type: "data_quality_action",
      actionType: "build_benchmark",
      priority: "medium",
      basedOn: [missingTrend.title ?? missingTrend.message],
      action: "生成 current period、previous period、period change 和 rolling average。",
      expectedOutcome: "判断指标是增长、下降还是周期性波动",
      expectedImpact: "让报告能判断表现改善、恶化或周期波动",
      roiConfidence: "unavailable",
      caveats: caveatsFrom(missingTrend),
      requiredDataIfAny: ["时间字段"],
      evidenceMetrics: [],
      evidenceRankings: [],
      suggestedBreakdowns: ["current_period_value", "previous_period_value", "period_change", "rolling_average"]
    });
  }

  if (dataQualityActionCount() < 3 && deduplicationLimitation) {
    actions.push({
      id: "action-deduped-metrics",
      title: "修正规模指标口径",
      type: "data_quality_action",
      actionType: "create_deduped_metric",
      priority: "high",
      basedOn: [deduplicationLimitation.title ?? "规模指标需要去重口径"],
      action: "新增去重后的规模、评论量和集中度指标，并把原始口径与去重口径分开展示。",
      expectedOutcome: "避免市场规模、评论规模和集中度被重复记录放大",
      expectedImpact: "提升市场规模、集中度和机会优先级判断的可信度",
      roiConfidence: "unavailable",
      caveats: caveatsFrom(deduplicationLimitation),
      requiredDataIfAny: ["稳定实体字段", "去重键"],
      evidenceMetrics: ["Raw Total Installs", "Raw Total Reviews", "Raw Top Share"],
      evidenceRankings: [],
      suggestedBreakdowns: ["Deduped Total Installs", "Deduped Total Reviews", "Deduped Top 5 Share"]
    });
  }

  if (dataQualityActionCount() < 3 && estimatedLimitation) {
    actions.push({
      id: "action-estimated-value",
      title: "区分估算值和真实收入",
      type: "data_quality_action",
      actionType: "collect_revenue_field",
      priority: "medium",
      basedOn: [estimatedLimitation.title ?? "估算值不能代表真实收入"],
      action: "将 Price × Installs / Price × Quantity 指标保留为 Estimated Value，并补充真实交易金额字段。",
      expectedOutcome: "避免把潜在规模误读为真实经营结果",
      expectedImpact: "让 ROI、收入和现金流判断可以基于真实交易金额而不是估算值",
      roiConfidence: "unavailable",
      caveats: caveatsFrom(estimatedLimitation),
      requiredDataIfAny: ["paid_amount", "order_amount", "transaction_amount", "cost"],
      evidenceMetrics: ["Estimated Value"],
      evidenceRankings: [],
      suggestedBreakdowns: ["Estimated Value", "paid_amount", "order_amount", "transaction_amount"]
    });
  }

  if (dataQualityActionCount() < 3 && insights[0]) {
    actions.push({
      id: "action-main-insight",
      title: "补强核心洞察证据",
      type: "data_quality_action",
      actionType: "fix_data_quality_for_decision",
      priority: "medium",
      basedOn: insights[0].evidenceMetrics,
      action: insights[0].nextAction,
      expectedOutcome: "把方向性判断升级成可定位的业务结论",
      expectedImpact: "减少报告中的方向性判断，提高风险和机会定位能力",
      roiConfidence: "unavailable",
      caveats: insights[0].limitations ?? [],
      requiredDataIfAny: availableFields.length ? [] : ["comparison", "ranking", "time trend"],
      evidenceMetrics: insights[0].evidenceMetrics,
      evidenceRankings: [],
      referencedObjects: namesFromRows(insights[0].evidenceObjects),
      referencedFields: availableFields,
      suggestedBreakdowns: availableFields.length ? availableFields : ["Comparison", "Ranking", "Time Trend"]
    });
  }

  const uniqueActions = uniqueByNameAction(actions);
  const businessActions = uniqueActions
    .filter((action) => action.type !== "data_quality_action")
    .sort(actionPrioritySort)
    .slice(0, 3);
  const dataQualityActions = uniqueActions
    .filter((action) => action.type === "data_quality_action")
    .sort(actionPrioritySort)
    .slice(0, 2);

  return [...businessActions, ...dataQualityActions];
}

function actionPrioritySort(left: GeneratedRecommendedAction, right: GeneratedRecommendedAction) {
  const score = (action: GeneratedRecommendedAction) => {
    const priorityScore = action.priority === "high" ? 30 : action.priority === "medium" ? 20 : 10;
    const typeScore = action.type === "data_quality_action" ? 0 : 20;
    const objectScore = action.targetObjects?.length ? 8 : 0;
    const evidenceScore = (action.evidenceRankings?.length ?? 0) * 3 + (action.evidenceMetrics?.length ?? 0);
    const caveatPenalty = Math.min(action.caveats?.length ?? 0, 3);

    return priorityScore + typeScore + objectScore + evidenceScore - caveatPenalty;
  };

  return score(right) - score(left);
}

function uniqueByNameAction(actions: GeneratedRecommendedAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generateStructuredInsights({
  selectedMetrics,
  metricResults,
  aggregationResults
}: {
  selectedMetrics: SelectedReportMetric[];
  metricResults: ReportMetricResultInput[];
  aggregationResults: AggregationResult[];
}): GeneratedInsights {
  const computedMetricIds = new Set(metricResults.filter((result) => result.status === "computed").map((result) => result.metricId));
  const usableMetrics = uniqueByName(selectedMetrics.filter((metric) =>
    hasDisplayableMetricValue(metric.value) &&
    (computedMetricIds.has(metric.metricId) || metric.value != null)
  ));
  const insightCandidates = [
    joinedTableInsight(usableMetrics, aggregationResults),
    categoricalComparisonInsight(usableMetrics, aggregationResults),
    scaleInsight(usableMetrics, aggregationResults),
    feedbackInsight(usableMetrics, aggregationResults),
    monetizationInsight(usableMetrics, aggregationResults),
    trendInsight(usableMetrics, aggregationResults),
    genericInsight(usableMetrics, aggregationResults)
  ].filter((item): item is GeneratedInsight => Boolean(item));
  const hasSpecificInsight = insightCandidates.some((item) => item.id !== "generic-directional");
  const insights = insightCandidates
    .filter((item) => !(hasSpecificInsight && item.id === "generic-directional"))
    .sort((left, right) => insightPriority(right) - insightPriority(left))
    .slice(0, 4);
  const risks = riskCandidates(usableMetrics, aggregationResults);
  const opportunities = opportunityCandidates(aggregationResults);
  const limitations = buildLimitations(aggregationResults, metricResults, usableMetrics);

  if (opportunities.length === 0 && aggregationResults.every((aggregation) =>
    aggregation.topRankings.length === 0 && aggregation.groupBys.length === 0 && aggregation.distributions.length === 0
  )) {
    limitations.push(limitation(
      "missing-opportunity-evidence",
      "暂不能识别具体机会对象",
      "当前缺少对象级排名和分组聚合，暂不能识别具体增长机会对象",
      "避免报告凭空给出机会判断",
      "生成 topRanking、groupComparison 或 distribution metrics 后再识别机会"
    ));
  }

  const recommendedActions = actionsFromEvidence({
    opportunities,
    limitations,
    insights,
    aggregations: aggregationResults
  });
  const primaryBusinessType = usableMetrics.find((metric) => metric.businessType)?.businessType ??
    aggregationResults.find((aggregation) => aggregation.businessType)?.businessType ??
    "generic";
  const nextActionPlan = generateNextActionPlan({
    businessType: primaryBusinessType,
    reportIntent: "business_brief",
    keyFindings: insights,
    businessRisks: risks,
    growthOpportunities: opportunities,
    dataLimitations: limitations.slice(0, 5),
    recommendedActions,
    aggregations: aggregationResults
  });

  return {
    executiveSummary: insights.slice(0, 3),
    keyFindings: insights,
    keyMetrics: usableMetrics.slice(0, 8),
    diagnosticMetrics: metricResults.filter((result) =>
      result.scope === "diagnostic" ||
      result.scope === "internal" ||
      result.isDiagnosticMetric ||
      result.isInternalMetric ||
      result.metricType === "diagnostic_metric" ||
      result.metricType === "warning_metric"
    ),
    businessRisks: risks,
    growthOpportunities: opportunities,
    dataLimitations: limitations.slice(0, 5),
    // Legacy aliases are kept only so older report payloads and callers do not break.
    risks,
    opportunities,
    recommendedActions,
    nextActionPlan
  };
}
