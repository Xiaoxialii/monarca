import { type DataSourceConnection } from "@prisma/client";
import {
  filterRowsByReportDateRange,
  findBusinessDateColumn,
  type ResolvedReportDateRange
} from "@/lib/report-date-range";
import type { SchemaColumn, SchemaTable } from "@/lib/metric-validation";
import type {
  AggregationResult,
  CandidateResult,
  DistributionResult,
  GroupByResult,
  RankingResult,
  ReportBusinessType,
  ReportMetricResultInput,
  TimeTrendResult
} from "@/lib/report-generation/report-types";
import { businessDimensionLanguage, businessMetricLanguage } from "@/lib/report-generation/business-language";
import {
  canUseRecordsAsDerivedTrendMetric,
  selectTrendMetricCandidates
} from "@/lib/report-trend-guardrails.mjs";
import { readCsvRowsFromStorageConfig } from "@/lib/csv-upload-rows";

export type AggregationContext = {
  dataSource: Pick<DataSourceConnection, "id" | "name" | "type" | "config">;
  tables: SchemaTable[];
  schemaJson?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function includesAny(value: string, keywords: string[]) {
  const text = normalize(value);
  return keywords.some((keyword) => text.includes(normalize(keyword)));
}

function schemaTables(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  return Array.isArray(schema.tables)
    ? schema.tables.filter((table): table is Record<string, unknown> => Boolean(asRecord(table)))
    : [];
}

async function storedRowsForContext(context: AggregationContext) {
  const config = asRecord(context.dataSource.config);
  return readCsvRowsFromStorageConfig(config);
}

async function rowsForAggregationTable(context: AggregationContext) {
  try {
    const storedRows = await storedRowsForContext(context);

    if (storedRows?.length) {
      return storedRows;
    }
  } catch {
    // Formal aggregation must use complete persisted data, not schema samples.
  }

  throw new Error("DATA_SOURCE_FULL_DATA_UNAVAILABLE");
}

function rowCountForTable(schemaJson: unknown, tableName: string) {
  const table = schemaTables(schemaJson).find((item) => normalize(String(item.name ?? "")) === normalize(tableName));
  const rowCount = Number(table?.rowCount);

  return Number.isFinite(rowCount) ? rowCount : undefined;
}

function rowValue(row: Record<string, unknown>, fieldName: string) {
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) return row[fieldName];
  const normalized = normalize(fieldName);
  const key = Object.keys(row).find((candidate) => normalize(candidate) === normalized);

  return key ? row[key] : undefined;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw || ["nan", "null", "undefined", "n/a", "na", "none"].includes(raw)) return null;
  const cleaned = value.replace(/[$,%+,\s]/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function isBlank(value: unknown) {
  if (value == null) return true;
  const text = String(value).trim().toLowerCase();

  return !text || ["nan", "null", "undefined", "n/a", "na", "none"].includes(text);
}

function numberValues(rows: Array<Record<string, unknown>>, fieldName: string) {
  return rows.flatMap((row) => {
    const value = parseNumber(rowValue(row, fieldName));
    return value == null ? [] : [value];
  });
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function distributionForField(tableName: string, fieldName: string, rows: Array<Record<string, unknown>>): DistributionResult | null {
  const values = numberValues(rows, fieldName).sort((left, right) => left - right);

  if (values.length < 5) return null;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  const p25 = percentile(values, 0.25);
  const p75 = percentile(values, 0.75);
  const iqr = p25 != null && p75 != null ? p75 - p25 : 0;
  const upperFence = p75 != null ? p75 + iqr * 1.5 : Number.POSITIVE_INFINITY;
  const lowerFence = p25 != null ? p25 - iqr * 1.5 : Number.NEGATIVE_INFINITY;

  return {
    id: `${normalize(tableName)}-${normalize(fieldName)}-distribution`,
    field: fieldName,
    min: values[0],
    max: values.at(-1) ?? null,
    mean,
    median: percentile(values, 0.5),
    p25,
    p75,
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
    stddev,
    outlierCount: values.filter((value) => value < lowerFence || value > upperFence).length
  };
}

function numericValue(value: string | number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readableMetricName(metric: string) {
  return metric
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function topNames(rows: Array<Record<string, string | number | null>>, field: string, count = 3) {
  return rows
    .slice(0, count)
    .map((row) => String(row[field] ?? row.dimension ?? ""))
    .filter(Boolean)
    .join("、");
}

function topRowsObjectText(rows: Array<Record<string, string | number | null>>, count = 3) {
  return topNames(rows, "dimension", count);
}

function candidateMetricEvidence(rows: Array<Record<string, string | number | null>>, metricKey: string, count = 3) {
  return rows
    .slice(0, count)
    .map((row) => `${String(row.dimension ?? "").trim()}=${formatNumber(numericValue(row[metricKey]))}`)
    .filter((item) => !item.endsWith("="))
    .join("；");
}

function sumRows(rows: Array<Record<string, string | number | null>>, metric: string) {
  return rows.reduce((sum, row) => sum + numericValue(row[metric]), 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function rankingTopShare(rows: Array<Record<string, string | number | null>>, metric: string, count: number) {
  const total = sumRows(rows, metric);
  const top = sumRows(rows.slice(0, count), metric);

  return ratio(top, total);
}

function rankingResult({
  tableName,
  title,
  rankingType,
  entityField,
  metricField,
  comparisonMetric,
  rows,
  summary,
  totalValue,
  top1Share,
  top3Share,
  top5Share,
  confidence = 0.78
}: {
  tableName: string;
  title: string;
  rankingType: NonNullable<RankingResult["rankingType"]>;
  entityField: string;
  metricField: string;
  comparisonMetric?: string;
  rows: Array<Record<string, string | number | null>>;
  summary: string;
  totalValue?: number | null;
  top1Share?: number | null;
  top3Share?: number | null;
  top5Share?: number | null;
  confidence?: number;
}): RankingResult {
  return {
    id: `${normalize(tableName)}-${normalize(entityField)}-${normalize(rankingType)}-${normalize(metricField)}`,
    title,
    rankingType,
    dimension: entityField,
    metric: metricField,
    entityField,
    metricField,
    comparisonMetric,
    rows,
    totalValue,
    top1Share,
    top3Share,
    top5Share,
    summary,
    insightCandidate: rows.length > 0,
    confidence
  };
}

function tableAppearsInFormula(formula: string, tableName: string) {
  return normalize(formula).includes(normalize(tableName));
}

function dimensionFromByFormula(formula: string) {
  const byMatch = /^.+?\s+BY\s+(.+)$/i.exec(formula.trim());
  const rawDimension = byMatch?.[1]?.trim();

  if (!rawDimension) return "dimension";

  const withoutWrapper = rawDimension.replace(/[()]/g, "").trim();
  const parts = withoutWrapper.split(".").filter(Boolean);

  return parts.at(-1) ?? withoutWrapper;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rankingTitleFromMetric(metricName: string, entityField: string) {
  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(metricName.trim());
  const metricPart = byMatch?.[1] ?? metricName.replace(/\s+by\s+.+$/i, "");
  const dimensionPart = byMatch?.[2] ?? entityField;

  return `Top ${titleCase(dimensionPart)} by ${titleCase(metricPart)}`;
}

function rankingTypeForMetricResult(result: ReportMetricResultInput): NonNullable<RankingResult["rankingType"]> {
  const text = `${result.metricName} ${result.displayName ?? ""} ${result.formula} ${result.metricCategory ?? ""}`.toLowerCase();

  if (/negative|complaint|refund|churn|error|lowest|low quality|低分|负向|风险/.test(text)) {
    return "bottom_by_quality";
  }

  if (/rating|score|sentiment|quality|positive|conversion|retention|评分|正向/.test(text)) {
    return "top_by_scale";
  }

  return "top_by_scale";
}

function rankingsFromMetricRows(tableName: string, metricResults: ReportMetricResultInput[]) {
  const output: { top: RankingResult[]; bottom: RankingResult[] } = { top: [], bottom: [] };
  const groupedResults = metricResults.filter((result) =>
    result.status === "computed" &&
    Array.isArray(result.rows) &&
    result.rows.length > 0 &&
    tableAppearsInFormula(result.formula, tableName)
  );

  for (const result of groupedResults) {
    const entityField = dimensionFromByFormula(result.formula);
    const metricField = result.displayName ?? result.metricName;
    const rows = (result.rows ?? [])
      .slice(0, 10)
      .map((row) => ({
        dimension: String(row.dimension ?? ""),
        [entityField]: String(row.dimension ?? ""),
        [metricField]: typeof row.value === "number" ? row.value : row.value == null ? null : String(row.value),
        value: typeof row.value === "number" ? row.value : row.value == null ? null : String(row.value)
      }));

    if (rows.length === 0) continue;

    const rankingType = rankingTypeForMetricResult(result);
    const ranking = rankingResult({
      tableName,
      title: rankingTitleFromMetric(result.metricName, entityField),
      rankingType,
      entityField,
      metricField,
      rows,
      summary: `${topNames(rows, "dimension")} 是 ${metricField} 排名靠前的对象`,
      confidence: 0.8
    });

    if (rankingType === "bottom_by_quality") {
      output.bottom.push(ranking);
    } else {
      output.top.push(ranking);
    }
  }

  return output;
}

function detectBusinessType(table: SchemaTable, dataSourceName: string, metricResults: ReportMetricResultInput[]): ReportBusinessType {
  const columnText = table.columns.map((column) => column.name).join(" ");
  const text = `${dataSourceName} ${table.name} ${columnText} ${metricResults.map((metric) => `${metric.metricName} ${metric.formula}`).join(" ")}`;
  const ecommerceSignals = ["order_id", "order_date", "customer_id", "product_id", "sku", "quantity", "unit_price", "gross_sales", "net_sales", "total_paid", "is_returned", "fulfillment_days", "customer_rating"];
  const ecommerceSignalCount = ecommerceSignals.filter((signal) => includesAny(text, [signal])).length;

  if (ecommerceSignalCount >= 4 || (includesAny(text, ["order_id"]) && includesAny(text, ["net_sales", "total_paid", "quantity"]))) return "ecommerce";

  if (includesAny(text, ["sentiment", "translated_review", "review", "subjectivity"])) return "reviews";
  if (includesAny(text, ["app", "installs", "content_rating", "android", "category", "rating"])) return "app_market";
  if (includesAny(text, ["open", "high", "low", "close", "adj_close", "volume", "ticker"])) return "finance_timeseries";
  if (includesAny(text, ["order", "sku", "quantity", "payment", "refund", "gmv"])) return "ecommerce";
  if (includesAny(text, ["campaign", "impressions", "clicks", "spend", "conversions"])) return "marketing";

  return "generic";
}

function findColumn(table: SchemaTable, candidates: string[]) {
  return table.columns.find((column) => candidates.some((candidate) => normalize(column.name) === normalize(candidate))) ??
    table.columns.find((column) => candidates.some((candidate) => normalize(column.name).includes(normalize(candidate))));
}

function likelyDimensionColumns(table: SchemaTable, rows: Array<Record<string, unknown>>) {
  const priority = ["category", "type", "segment", "product", "app", "sku", "region", "country", "city", "channel", "source", "status", "stage"];

  return table.columns
    .map((column) => {
      const values = rows.map((row) => rowValue(row, column.name)).filter((value) => !isBlank(value)).map(String);
      const unique = new Set(values);
      const uniqueRatio = values.length ? unique.size / values.length : 1;
      const priorityIndex = priority.findIndex((keyword) => normalize(column.name).includes(keyword));
      const score = (priorityIndex >= 0 ? 100 - priorityIndex * 4 : 0) + (unique.size >= 2 && unique.size <= 50 ? 25 : 0) - (uniqueRatio > 0.7 ? 80 : 0);

      return { column, uniqueCount: unique.size, uniqueRatio, score };
    })
    .filter((item) => item.score > 0 && item.uniqueCount > 1 && item.uniqueRatio < 0.7)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.column);
}

function groupByRows(rows: Array<Record<string, unknown>>, dimension: string) {
  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const row of rows) {
    const key = String(rowValue(row, dimension) ?? "").trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return groups;
}

function buildGroupBy(table: SchemaTable, businessType: ReportBusinessType, rows: Array<Record<string, unknown>>) {
  const dimensions = likelyDimensionColumns(table, rows).slice(0, 3);

  return dimensions.flatMap((dimension): GroupByResult[] => {
    const groups = groupByRows(rows, dimension.name);
    const appColumn = findColumn(table, ["app", "product", "sku"]);
    const installColumn = findColumn(table, ["installs", "usage", "active_users"]);
    const reviewColumn = findColumn(table, ["reviews", "translated_review", "review"]);
    const ratingColumn = findColumn(table, ["rating", "score"]);
    const sentimentColumn = findColumn(table, ["sentiment"]);
    const polarityColumn = findColumn(table, ["sentiment_polarity"]);

    const groupRows = Array.from(groups.entries()).map(([label, group]) => {
      const base: Record<string, string | number | null> = { dimension: label, records: group.length };

      if (appColumn) base.objects = new Set(group.map((row) => String(rowValue(row, appColumn.name) ?? "")).filter(Boolean)).size;
      if (installColumn) base.installs = numberValues(group, installColumn.name).reduce((sum, value) => sum + value, 0);
      if (reviewColumn && businessType === "app_market") base.reviews = numberValues(group, reviewColumn.name).reduce((sum, value) => sum + value, 0);
      if (ratingColumn) {
        const ratings = numberValues(group, ratingColumn.name);
        base.averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
      }
      if (sentimentColumn) {
        const sentiments = group.map((row) => String(rowValue(row, sentimentColumn.name) ?? "").toLowerCase()).filter(Boolean);
        const positive = sentiments.filter((item) => item === "positive").length;
        const negative = sentiments.filter((item) => item === "negative").length;
        base.sentimentSampleSize = sentiments.length;
        base.positiveCount = positive;
        base.negativeCount = negative;
        base.positiveRate = sentiments.length ? positive / sentiments.length : null;
        base.negativeRate = sentiments.length ? negative / sentiments.length : null;
      }
      if (polarityColumn) {
        const values = numberValues(group, polarityColumn.name);
        base.averageSentiment = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      }

      return base;
    }).sort((left, right) => Number(right.installs ?? right.reviews ?? right.records ?? 0) - Number(left.installs ?? left.reviews ?? left.records ?? 0)).slice(0, 10);

    return [{
      id: `${normalize(table.name)}-${normalize(dimension.name)}-groupby`,
      title: `${dimension.name} 聚合`,
      dimension: dimension.name,
      metrics: Object.keys(groupRows[0] ?? {}).filter((key) => key !== "dimension"),
      rows: groupRows
    }];
  });
}

function buildRankings(table: SchemaTable, businessType: ReportBusinessType, rows: Array<Record<string, unknown>>) {
  const objectColumn = findColumn(table, ["app", "product", "sku", "customer", "category", "region", "channel"]);
  const output: { top: RankingResult[]; bottom: RankingResult[]; risk: CandidateResult[]; opportunity: CandidateResult[] } = {
    top: [],
    bottom: [],
    risk: [],
    opportunity: []
  };

  if (!objectColumn) return output;

  const groups = Array.from(groupByRows(rows, objectColumn.name).entries());
  const installColumn = findColumn(table, ["installs", "usage", "active_users"]);
  const reviewColumn = findColumn(table, ["reviews", "translated_review", "review"]);
  const ratingColumn = findColumn(table, ["rating", "score"]);
  const sentimentColumn = findColumn(table, ["sentiment"]);

  const groupStats = groups.map(([dimension, group]) => {
    const installs = installColumn ? numberValues(group, installColumn.name).reduce((sum, value) => sum + value, 0) : null;
    const reviews = reviewColumn && businessType === "app_market" ? numberValues(group, reviewColumn.name).reduce((sum, value) => sum + value, 0) : group.length;
    const ratings = ratingColumn ? numberValues(group, ratingColumn.name) : [];
    const sentiments = sentimentColumn ? group.map((row) => String(rowValue(row, sentimentColumn.name) ?? "").toLowerCase()).filter(Boolean) : [];
    const negativeCount = sentiments.filter((item) => item === "negative").length;
    const positiveCount = sentiments.filter((item) => item === "positive").length;
    const negativeRate = sentiments.length ? negativeCount / sentiments.length : null;
    const positiveRate = sentiments.length ? positiveCount / sentiments.length : null;

    return {
      dimension,
      records: group.length,
      sentimentSampleSize: sentiments.length || null,
      negativeCount: sentiments.length ? negativeCount : null,
      positiveCount: sentiments.length ? positiveCount : null,
      installs,
      reviews,
      averageRating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
      negativeRate,
      positiveRate
    };
  });

  const rankingMetric = installColumn ? "installs" : reviewColumn ? "reviews" : "records";
  const groupLikeObject = ["category", "region", "channel", "segment", "type"].some((item) => normalize(objectColumn.name).includes(item));
  const scaleRows = [...groupStats]
    .sort((left, right) => Number(right[rankingMetric] ?? 0) - Number(left[rankingMetric] ?? 0))
    .slice(0, 10);
  const sortedScaleStats = [...groupStats].sort((left, right) => Number(right[rankingMetric] ?? 0) - Number(left[rankingMetric] ?? 0));
  const totalScaleValue = sumRows(sortedScaleStats, rankingMetric);
  const top1Share = rankingTopShare(sortedScaleStats, rankingMetric, 1);
  const top3Share = rankingTopShare(sortedScaleStats, rankingMetric, 3);
  const top5Share = rankingTopShare(sortedScaleStats, rankingMetric, 5);

  output.top.push(rankingResult({
    tableName: table.name,
    title: `Top ${objectColumn.name} by ${readableMetricName(rankingMetric)}`,
    rankingType: groupLikeObject ? "top_group" : "top_by_scale",
    entityField: objectColumn.name,
    metricField: rankingMetric,
    rows: scaleRows,
    totalValue: totalScaleValue,
    top1Share,
    top3Share,
    top5Share,
    summary: scaleRows.length
      ? `${topNames(scaleRows, "dimension")} 是当前 ${readableMetricName(rankingMetric)} 最高的对象`
      : `当前没有足够数据生成 ${objectColumn.name} 排名`,
    confidence: 0.82
  }));

  const concentrationThresholdBreached = (top1Share != null && top1Share > 0.5) || (top5Share != null && top5Share > 0.8);

  if (concentrationThresholdBreached && scaleRows.length) {
    const dimension = businessDimensionLanguage(objectColumn.name, "zh");
    const metric = businessMetricLanguage({ metricField: rankingMetric, locale: "zh" });
    const topObjects = topRowsObjectText(scaleRows, 3);
    const shareValue = top5Share ?? top1Share;
    const shareLabel = top5Share != null ? "Top 5" : "Top 1";
    const metricEvidence = `${topObjects} ${top5Share != null ? "合计" : ""}贡献 ${((shareValue ?? 0) * 100).toFixed(1)}% 的${metric.pluralLabel}`;
    const isSampleOnly = metric.key === "records";

    output.risk.push({
      id: `${normalize(table.name)}-${normalize(objectColumn.name)}-${normalize(rankingMetric)}-concentration`,
      title: `${topObjects} 样本集中度过高`,
      type: isSampleOnly ? "sample_concentration_risk" : "concentration_risk",
      riskType: isSampleOnly ? "sample_concentration_risk" : "data_structure_risk",
      severity: (top1Share ?? 0) > 0.5 || (top5Share ?? 0) > 0.85 ? "high" : "medium",
      evidenceMetrics: [
        `Top 1 ${dimension.label} ${metric.pluralLabel} Share`,
        `Top 5 ${dimension.label} ${metric.pluralLabel} Share`,
        `Top 5 ${objectColumn.name} ${readableMetricName(rankingMetric)} Share`
      ],
      evidenceValues: {
        top1Share: top1Share != null ? `${(top1Share * 100).toFixed(1)}%` : null,
        top5Share: top5Share != null ? `${(top5Share * 100).toFixed(1)}%` : null,
        topObjects,
        metricEvidence: candidateMetricEvidence(scaleRows, rankingMetric, 3)
      },
      objects: scaleRows,
      affectedObjects: scaleRows,
      metricEvidence,
      comparison: `${shareLabel} ${dimension.label} ${metric.pluralLabel} Share = ${((shareValue ?? 0) * 100).toFixed(1)}%，超过头部集中阈值`,
      comparisonEvidence: shareLabel === "Top 5"
        ? `Top 5 占比 ${((shareValue ?? 0) * 100).toFixed(1)}% > 80%`
        : `Top 1 占比 ${((shareValue ?? 0) * 100).toFixed(1)}% > 50%`,
      businessMeaning: `${metricEvidence}，说明当前样本主要集中在少数${dimension.pluralLabel}。这属于样本结构风险，不代表这些${dimension.pluralLabel}业务表现差。`,
      businessImpact: "如果这些头部对象表现异常，整体分析结论会被放大影响；但缺少质量、转化、收入或负向反馈证据时，不能直接判定为业务风险。",
      recommendedAction: `比较 ${topObjects} 与长尾${dimension.pluralLabel}的评分、转化、收入或负向反馈，再判断是否构成业务表现风险。`,
      caveat: "records 或规模占比只能用于判断样本集中度、覆盖度和置信度，不能单独代表业务价值或业务风险。",
      confidence: 0.84,
      confidenceReason: "该风险来自对象级 ranking 和 Top Share 阈值对比，已按样本结构风险处理"
    });
  }

  if (ratingColumn) {
    const bottomRatingRows = groupStats
        .filter((item) => item.averageRating != null)
        .sort((left, right) => Number(left.averageRating ?? 0) - Number(right.averageRating ?? 0))
        .slice(0, 10);

    output.bottom.push(rankingResult({
      tableName: table.name,
      title: `Lowest Rated ${objectColumn.name}`,
      rankingType: ["category", "region", "channel", "segment", "type"].some((item) => normalize(objectColumn.name).includes(item))
        ? "bottom_group"
        : "bottom_by_quality",
      entityField: objectColumn.name,
      metricField: "averageRating",
      rows: bottomRatingRows,
      summary: bottomRatingRows.length
        ? `${topNames(bottomRatingRows, "dimension")} 是当前评分最低的对象`
        : `当前没有足够评分数据生成低评分 ${objectColumn.name}`,
      confidence: 0.8
    }));

    const scaleValues = groupStats
      .map((item) => Number(item.installs ?? item.reviews ?? item.records))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const p75Scale = percentile(scaleValues, 0.75) ?? 0;
    const ratingValues = groupStats
      .flatMap((item) => item.averageRating == null ? [] : [item.averageRating])
      .sort((left, right) => left - right);
    const averageRating = ratingValues.length ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length : null;

    const highVolumeLowQuality = groupStats
      .filter((item) => Number(item.installs ?? item.reviews ?? item.records) > 0 && item.averageRating != null)
      .filter((item) =>
        Number(item.installs ?? item.reviews ?? item.records) >= p75Scale &&
        (averageRating == null || Number(item.averageRating) <= averageRating || Number(item.averageRating) <= 3.8)
      )
      .sort((left, right) =>
        (Number(right.installs ?? right.reviews ?? right.records) * (5 - Number(right.averageRating ?? 5))) -
        (Number(left.installs ?? left.reviews ?? left.records) * (5 - Number(left.averageRating ?? 5)))
      )
      .slice(0, 8);

    if (highVolumeLowQuality.length) {
      output.bottom.push(rankingResult({
        tableName: table.name,
        title: `High Volume Low Quality ${objectColumn.name}`,
        rankingType: "high_volume_low_quality",
        entityField: objectColumn.name,
        metricField: rankingMetric,
        comparisonMetric: "averageRating",
        rows: highVolumeLowQuality,
        summary: `${topNames(highVolumeLowQuality, "dimension")} 规模较高但评分低于整体水平`,
        confidence: 0.84
      }));
      output.risk.push({
        id: `${normalize(table.name)}-high-volume-low-quality`,
        title: "高规模低质量对象需要优先优化",
        type: "high_volume_low_quality",
        severity: "medium",
        evidenceMetrics: [rankingMetric, "averageRating"],
        evidenceValues: {
          count: highVolumeLowQuality.length,
          examples: topNames(highVolumeLowQuality, "dimension")
        },
        objects: highVolumeLowQuality,
        affectedObjects: highVolumeLowQuality,
        comparison: `${topNames(highVolumeLowQuality, "dimension")} 规模高于大多数对象，但评分低于整体平均或质量阈值`,
        businessMeaning: "部分对象规模较高但质量指标偏弱，可能影响用户信任或后续转化",
        businessImpact: "高规模对象一旦质量偏低，会放大用户体验问题并拖累整体表现",
        recommendedAction: `优先排查 ${topNames(highVolumeLowQuality, "dimension")} 的评论、版本和类别差异`,
        confidence: 0.84,
        confidenceReason: "该风险来自 high_volume_low_quality ranking：规模较高且质量低于整体平均或阈值"
      });
    }
  }

  if (sentimentColumn) {
    const highNegative = groupStats
      .filter((item) => item.negativeRate != null && item.records >= 10)
      .sort((left, right) => Number(right.negativeRate ?? 0) - Number(left.negativeRate ?? 0))
      .slice(0, 8);

    if (highNegative.length) {
      output.bottom.push(rankingResult({
        tableName: table.name,
        title: `Top Negative Feedback ${objectColumn.name}`,
        rankingType: "bottom_by_quality",
        entityField: objectColumn.name,
        metricField: "negativeRate",
        comparisonMetric: "reviews",
        rows: highNegative,
        summary: `${topNames(highNegative, "dimension")} 的负向反馈率最高`,
        confidence: 0.86
      }));
      output.risk.push({
        id: `${normalize(table.name)}-high-negative-feedback`,
        title: "负向反馈集中在少数对象",
        type: "high_negative_feedback",
        severity: "high",
        evidenceMetrics: ["negativeRate", "reviews"],
        evidenceValues: {
          highestNegativeRate: highNegative[0]?.negativeRate ?? null,
          examples: topNames(highNegative, "dimension")
        },
        objects: highNegative,
        affectedObjects: highNegative,
        comparison: `${topNames(highNegative, "dimension")} 的负向反馈率高于其他对象`,
        businessMeaning: "负面评论不是均匀分布，可能集中在少数产品或对象上",
        businessImpact: "集中负反馈对象会优先影响满意度、评分和转化",
        recommendedAction: `优先分析 ${topNames(highNegative, "dimension")} 的负面评论文本主题`,
        confidence: 0.86,
        confidenceReason: "该风险来自负向反馈对象 ranking，且样本量达到最低要求"
      });
    }

    const highPositive = groupStats
      .filter((item) => item.positiveRate != null && item.records >= 10)
      .sort((left, right) => Number(right.positiveRate ?? 0) - Number(left.positiveRate ?? 0))
      .slice(0, 8);

    if (highPositive.length) {
      output.top.push(rankingResult({
        tableName: table.name,
        title: `Top Positive Feedback ${objectColumn.name}`,
        rankingType: "high_quality_low_volume",
        entityField: objectColumn.name,
        metricField: "positiveRate",
        comparisonMetric: "reviews",
        rows: highPositive,
        summary: `${topNames(highPositive, "dimension")} 的正向反馈率最高`,
        confidence: 0.8
      }));
      output.opportunity.push({
        id: `${normalize(table.name)}-positive-feedback-cluster`,
        title: "正向反馈集中对象可作为增长样本",
        type: "positive_feedback_cluster",
        priority: "medium",
        evidenceMetrics: ["positiveRate", "reviews"],
        evidenceValues: {
          highestPositiveRate: highPositive[0]?.positiveRate ?? null,
          examples: topNames(highPositive, "dimension")
        },
        objects: highPositive,
        targetObjects: highPositive,
        comparison: `${topNames(highPositive, "dimension")} 的正向反馈率高于其他对象`,
        businessMeaning: "正向反馈集中的对象可以帮助提炼用户满意点、卖点和可复用增长素材",
        recommendedAction: `提炼 ${topNames(highPositive, "dimension")} 的正向评论主题，用于产品卖点、ASO 或营销素材`,
        confidence: 0.8,
        confidenceReason: "该机会来自正向反馈对象 ranking，且样本量达到最低要求"
      });
    }
  }

  if (ratingColumn && (installColumn || reviewColumn)) {
    const scaleValues = groupStats
      .map((item) => Number(item.installs ?? item.reviews ?? item.records))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const medianScale = percentile(scaleValues, 0.5) ?? 0;
    const p25Scale = percentile(scaleValues, 0.25) ?? medianScale;
    const highQualityLowScale = groupStats
      .filter((item) => Number(item.averageRating ?? 0) >= 4.5)
      .filter((item) => Number(item.installs ?? item.reviews ?? item.records) <= medianScale || Number(item.installs ?? item.reviews ?? item.records) <= p25Scale)
      .sort((left, right) =>
        Number(left.installs ?? left.reviews ?? left.records) - Number(right.installs ?? right.reviews ?? right.records)
      )
      .slice(0, 8);

    if (highQualityLowScale.length) {
      output.top.push(rankingResult({
        tableName: table.name,
        title: `High Quality Low Volume ${objectColumn.name}`,
        rankingType: "high_quality_low_volume",
        entityField: objectColumn.name,
        metricField: "averageRating",
        comparisonMetric: rankingMetric,
        rows: highQualityLowScale,
        summary: `${topNames(highQualityLowScale, "dimension")} 评分较高但当前规模还较小`,
        confidence: 0.8
      }));
      output.opportunity.push({
        id: `${normalize(table.name)}-high-quality-low-scale`,
        title: "高评分小规模对象可作为小范围增长测试候选",
        type: "high_quality_low_scale",
        priority: "medium",
        evidenceMetrics: ["averageRating", rankingMetric],
        evidenceValues: {
          count: highQualityLowScale.length,
          examples: topNames(highQualityLowScale, "dimension")
        },
        objects: highQualityLowScale,
        targetObjects: highQualityLowScale,
        comparison: `${topNames(highQualityLowScale, "dimension")} 评分高于大多数对象，但当前规模还较小`,
        technicalCriteria: `averageRating >= 4.5；${rankingMetric} <= median 或 P25`,
        businessMeaning: "该对象已有较好的用户评价，但规模尚未充分放大，可以先用低风险测试验证增长潜力。",
        recommendedAction: `优先对 ${topNames(highQualityLowScale, "dimension")} 做小范围曝光、推荐位或投放测试，观察规模提升后评分是否保持稳定。`,
        confidence: 0.8,
        confidenceReason: "该机会来自 high_quality_low_volume ranking：评分达到高质量阈值且当前规模较小"
      });
    }
  }

  return output;
}

function rankingsFromGroupBys(tableName: string, groupBys: GroupByResult[]) {
  const top: RankingResult[] = [];
  const bottom: RankingResult[] = [];

  for (const groupBy of groupBys) {
    const sample = groupBy.rows[0];
    if (!sample) continue;

    const metricKeys = Object.keys(sample).filter((key) => key !== "dimension" && typeof sample[key] === "number");
    const scaleKey = metricKeys.find((key) => /installs|revenue|sales|gmv|volume|reviews|orders|users|records|objects/i.test(key)) ?? metricKeys[0];
    const qualityKey = metricKeys.find((key) => /rating|score|positive|negative|conversion|retention|error|refund/i.test(key));

    if (scaleKey) {
      const sortedRows = [...groupBy.rows]
        .sort((left, right) => numericValue(right[scaleKey]) - numericValue(left[scaleKey]));
      const rows = sortedRows
        .slice(0, 10);
      const totalValue = sumRows(sortedRows, scaleKey);
      top.push(rankingResult({
        tableName,
        title: `Top ${groupBy.dimension} by ${readableMetricName(scaleKey)}`,
        rankingType: "top_group",
        entityField: groupBy.dimension,
        metricField: scaleKey,
        rows,
        totalValue,
        top1Share: rankingTopShare(sortedRows, scaleKey, 1),
        top3Share: rankingTopShare(sortedRows, scaleKey, 3),
        top5Share: rankingTopShare(sortedRows, scaleKey, 5),
        summary: `${topNames(rows, "dimension")} 是 ${groupBy.dimension} 中 ${readableMetricName(scaleKey)} 最高的分组`,
        confidence: 0.78
      }));
    }

    if (qualityKey) {
      const isNegativeMetric = /negative|error|refund|churn/i.test(qualityKey);
      const rows = [...groupBy.rows]
        .filter((row) => row[qualityKey] != null)
        .sort((left, right) => isNegativeMetric
          ? numericValue(right[qualityKey]) - numericValue(left[qualityKey])
          : numericValue(left[qualityKey]) - numericValue(right[qualityKey]))
        .slice(0, 10);

      bottom.push(rankingResult({
        tableName,
        title: isNegativeMetric
          ? `Highest Risk ${groupBy.dimension} by ${readableMetricName(qualityKey)}`
          : `Lowest ${groupBy.dimension} by ${readableMetricName(qualityKey)}`,
        rankingType: "bottom_group",
        entityField: groupBy.dimension,
        metricField: qualityKey,
        rows,
        summary: `${topNames(rows, "dimension")} 是当前最需要关注的 ${groupBy.dimension} 分组`,
        confidence: 0.76
      }));
    }
  }

  return { top, bottom };
}

function candidatesFromGroupBys(tableName: string, groupBys: GroupByResult[]) {
  const risks: CandidateResult[] = [];
  const opportunities: CandidateResult[] = [];

  for (const groupBy of groupBys) {
    const sample = groupBy.rows[0];
    if (!sample) continue;

    const metricKeys = Object.keys(sample).filter((key) => key !== "dimension" && typeof sample[key] === "number");
    const scaleKey = metricKeys.find((key) => /installs|revenue|sales|gmv|volume|reviews|orders|users|records|objects/i.test(key));
    const qualityKey = metricKeys.find((key) => /rating|score|positive|negative|conversion|retention|error|refund/i.test(key));
    const topScaleRows = scaleKey
      ? [...groupBy.rows].sort((left, right) => numericValue(right[scaleKey]) - numericValue(left[scaleKey])).slice(0, 5)
      : [];

    if (scaleKey && topScaleRows.length) {
      const top5Share = rankingTopShare([...groupBy.rows].sort((left, right) => numericValue(right[scaleKey]) - numericValue(left[scaleKey])), scaleKey, 5);

      if (top5Share != null && top5Share > 0.8) {
        const dimension = businessDimensionLanguage(groupBy.dimension, "zh");
        const metric = businessMetricLanguage({ metricField: scaleKey, locale: "zh" });
        const topObjects = topRowsObjectText(topScaleRows, 3);
        const metricEvidence = `${topObjects} 合计贡献 ${(top5Share * 100).toFixed(1)}% 的${metric.pluralLabel}`;
        const isSampleOnly = metric.key === "records";

        risks.push({
          id: `${normalize(tableName)}-${normalize(groupBy.dimension)}-${normalize(scaleKey)}-group-concentration`,
          title: `${topObjects} 样本集中度过高`,
          type: isSampleOnly ? "sample_concentration_risk" : "concentration_risk",
          riskType: isSampleOnly ? "sample_concentration_risk" : "data_structure_risk",
          severity: top5Share > 0.9 ? "high" : "medium",
          evidenceMetrics: [`Top 5 ${dimension.label} ${metric.pluralLabel} Share`],
          evidenceValues: {
            top5Share: `${(top5Share * 100).toFixed(1)}%`,
            topGroups: topObjects,
            metricEvidence: candidateMetricEvidence(topScaleRows, scaleKey, 3)
          },
          objects: topScaleRows,
          affectedObjects: topScaleRows,
          metricEvidence,
          comparison: `Top 5 ${dimension.label} ${metric.pluralLabel} Share = ${(top5Share * 100).toFixed(1)}%，超过 80% 头部集中阈值`,
          comparisonEvidence: `Top 5 占比 ${(top5Share * 100).toFixed(1)}% > 80%`,
          businessMeaning: `${metricEvidence}，说明当前数据样本主要集中在少数${dimension.pluralLabel}。该结论更像样本结构风险，不代表这些${dimension.pluralLabel}业务表现差。`,
          businessImpact: "如果这些头部分组表现异常，整体报告结论会更容易被它们主导；但在缺少评分、转化、收入或负向反馈证据前，不能直接判断为业务表现风险。",
          recommendedAction: `下一步比较 ${topObjects} 与其他${dimension.pluralLabel}的评分、转化、收入或负向反馈，确认是否存在具体业务异常。`,
          caveat: "records 或样本占比只能说明样本结构和覆盖度，不能单独证明收入、体验或增长风险。",
          confidence: 0.82,
          confidenceReason: "该风险来自 groupBy 聚合和 Top Share 阈值对比，已按样本结构风险处理"
        });
      }
    }

    if (scaleKey && qualityKey) {
      const scaleValues = groupBy.rows.map((row) => numericValue(row[scaleKey])).sort((left, right) => left - right);
      const qualityValues = groupBy.rows.map((row) => numericValue(row[qualityKey])).sort((left, right) => left - right);
      const p75Quality = percentile(qualityValues, 0.75) ?? 0;
      const medianScale = percentile(scaleValues, 0.5) ?? 0;
      const highQualityLowScale = groupBy.rows
        .filter((row) => numericValue(row[qualityKey]) >= p75Quality && numericValue(row[scaleKey]) <= medianScale)
        .sort((left, right) => numericValue(right[qualityKey]) - numericValue(left[qualityKey]))
        .slice(0, 5);

      if (highQualityLowScale.length) {
        const dimension = businessDimensionLanguage(groupBy.dimension, "zh");
        const qualityMetric = businessMetricLanguage({ metricField: qualityKey, locale: "zh" });
        const topObjects = topRowsObjectText(highQualityLowScale, 3);

        opportunities.push({
          id: `${normalize(tableName)}-${normalize(groupBy.dimension)}-high-quality-low-scale`,
          title: `${topObjects} 可作为小规模增长测试候选`,
          type: "high_quality_low_scale",
          opportunityType: "high_quality_low_scale",
          priority: "medium",
          evidenceMetrics: [qualityKey, scaleKey],
          evidenceValues: {
            examples: topObjects,
            qualityEvidence: candidateMetricEvidence(highQualityLowScale, qualityKey, 3),
            scaleEvidence: candidateMetricEvidence(highQualityLowScale, scaleKey, 3)
          },
          objects: highQualityLowScale,
          targetObjects: highQualityLowScale,
          metricEvidence: `${topObjects} 的${qualityMetric.pluralLabel}高于大多数${dimension.pluralLabel}，但当前样本量还不大`,
          comparison: `${topObjects} 的${qualityMetric.pluralLabel}表现排在前 25%，但当前规模还较小`,
          technicalCriteria: `${qualityKey} > P75；${scaleKey} <= median`,
          businessMeaning: `${topObjects} 已有较好的用户评价，但规模尚未充分放大，可以先用低风险测试验证增长潜力。`,
          recommendedAction: `对 ${topObjects} 小范围增加曝光或投放，观察订单量提升后${qualityMetric.pluralLabel}是否保持稳定。`,
          caveat: "当前样本量还不大，适合先做小范围曝光、推荐位或投放测试。",
          confidence: 0.76,
          confidenceReason: "该机会来自 groupBy 的质量和规模交叉判断"
        });
      }
    }
  }

  return { risks, opportunities };
}

function dateBucket(dateValue: unknown, bucket: "day" | "week" | "month" | "year") {
  const date = new Date(String(dateValue));

  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (bucket === "day") return `${year}-${month}-${day}`;
  if (bucket === "week") {
    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
  }

  return bucket === "year" ? String(year) : `${year}-${month}`;
}

function buildTimeTrends(table: SchemaTable, businessType: ReportBusinessType, rows: Array<Record<string, unknown>>): TimeTrendResult[] {
  const dateColumn = findBusinessDateColumn(table.columns);
  if (!dateColumn) return [];

  const dates = rows.flatMap((row) => {
    const date = new Date(String(rowValue(row, dateColumn.name)));
    return Number.isFinite(date.getTime()) ? [date] : [];
  }).sort((left, right) => left.getTime() - right.getTime());
  const spanDays = dates.length > 1 ? (dates.at(-1)!.getTime() - dates[0].getTime()) / 86_400_000 : 0;
  const bucket: "day" | "week" | "month" | "year" = businessType === "finance_timeseries"
    ? "day"
    : spanDays <= 31
      ? "day"
      : spanDays <= 180
        ? "week"
        : "month";
  const valueColumns = selectTrendMetricCandidates(table.columns, businessType, 3) as SchemaColumn[];
  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const row of rows) {
    const key = dateBucket(rowValue(row, dateColumn.name), bucket);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const orderedGroups = Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));

  if (orderedGroups.length < 2) return [];

  const columns = valueColumns.length
    ? valueColumns
    : canUseRecordsAsDerivedTrendMetric(table.columns, businessType)
      ? [undefined]
      : [];

  if (columns.length === 0) return [];

  return columns.slice(0, 3).flatMap((valueColumn) => {
    const trendRows = orderedGroups.map(([period, group]) => {
      const values = valueColumn ? numberValues(group, valueColumn.name) : [];
      const shouldAverage = valueColumn
        ? includesAny(valueColumn.name, ["rating", "score", "close", "polarity", "rate", "ratio"])
        : false;
      const value = values.length
        ? shouldAverage
          ? values.reduce((sum, item) => sum + item, 0) / values.length
          : values.reduce((sum, item) => sum + item, 0)
        : valueColumn
          ? null
          : group.length;

      return { period, value };
    }).filter((row) => row.value != null);

    return trendRows.length > 1
      ? [{
        id: `${normalize(table.name)}-${normalize(dateColumn.name)}-${normalize(valueColumn?.name ?? "records")}-trend`,
        title: `${valueColumn?.name ?? "Records"} over time`,
        bucket,
        metric: valueColumn?.name ?? "records",
        dateField: dateColumn.name,
        rows: trendRows
      }]
      : [];
  });
}

export async function buildAggregationResults({
  contexts,
  metricResults,
  dateRange
}: {
  contexts: AggregationContext[];
  metricResults: ReportMetricResultInput[];
  dateRange?: ResolvedReportDateRange;
}): Promise<AggregationResult[]> {
  const results: AggregationResult[] = [];

  for (const context of contexts) {
    for (const table of context.tables) {
      const allRows = await rowsForAggregationTable(context);
      const dateColumn = findBusinessDateColumn(table.columns);
      const rows = filterRowsByReportDateRange(allRows, dateColumn?.name, dateRange ?? { preset: "ALL" });
      const warnings = [];
      const businessType = detectBusinessType(table, context.dataSource.name, metricResults);

      if (allRows.length === 0) {
        warnings.push({
          code: "no_lightweight_rows",
          message: "当前数据源没有可用于轻量聚合的样本或解析数据，因此不会生成 Top/Bottom 或维度聚合"
        });
      }

      if (allRows.length > 0 && dateRange?.preset !== "ALL" && !dateColumn) {
        warnings.push({
          code: "no_business_time_field",
          message: "当前数据缺少时间字段，无法按时间范围筛选。系统正在显示全周期指标。"
        });
      }

      if (allRows.length > 0 && dateRange?.preset !== "ALL" && dateColumn && rows.length === 0) {
        warnings.push({
          code: "empty_selected_date_range",
          message: "所选时间范围内没有可用于计算的行，当前指标会显示为空或零值。"
        });
      }

      const rankings = rows.length ? buildRankings(table, businessType, rows) : { top: [], bottom: [], risk: [], opportunity: [] };
      const distributions = rows.length
        ? table.columns
          .flatMap((column) => {
            const distribution = distributionForField(table.name, column.name, rows);
            return distribution ? [distribution] : [];
          })
          .slice(0, 5)
        : [];
      const groupBys = rows.length ? buildGroupBy(table, businessType, rows).slice(0, 4) : [];
      const timeTrends = rows.length ? buildTimeTrends(table, businessType, rows) : [];
      const groupRankings = rankingsFromGroupBys(table.name, groupBys);
      const groupCandidates = candidatesFromGroupBys(table.name, groupBys);
      const metricRowRankings = rankingsFromMetricRows(table.name, metricResults);

      if (groupBys.length === 0) {
        warnings.push({
          code: "insufficient_groupby_fields",
          message: "当前数据不足以生成可靠分组聚合，报告不会编造结构分析"
        });
      }

      if (timeTrends.length === 0) {
        warnings.push({
          code: "no_time_trend",
          message: "当前数据缺少可用时间字段或时间跨度不足，无法生成趋势分析"
        });
      }

      results.push({
        datasetId: `${context.dataSource.id}:${table.name}`,
        datasetName: context.dataSource.name.includes(table.name)
          ? context.dataSource.name
          : `${context.dataSource.name} / ${table.name}`,
        businessType,
        rowCount: rows.length || rowCountForTable(context.schemaJson, table.name),
        groupBys,
        topRankings: [...groupRankings.top, ...rankings.top, ...metricRowRankings.top],
        bottomRankings: [...groupRankings.bottom, ...rankings.bottom, ...metricRowRankings.bottom],
        timeTrends,
        distributions,
        riskCandidates: [...groupCandidates.risks, ...rankings.risk],
        opportunityCandidates: [...groupCandidates.opportunities, ...rankings.opportunity],
        warnings
      });
    }
  }

  return results;
}
