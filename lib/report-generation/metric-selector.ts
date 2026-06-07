import type {
  ReportBusinessType,
  ReportMetricDefinitionInput,
  ReportMetricResultInput,
  SelectedReportMetric
} from "@/lib/report-generation/report-types";
import {
  hasDisplayableMetricValue,
  isBusinessFacingMetricDefinition,
  isBusinessFacingMetricText,
  isGlobalBusinessMetricResult,
  isObjectLevelMetricText
} from "@/lib/metric-visibility";
import { contextualMetricName, metricNameKey, normalizeMetricName } from "@/lib/report-generation/metric-name-normalizer";
import { reportSkillRegistry } from "@/lib/report-generation/skill-registry";
import { businessMetricLanguage, topDimensionInsightText } from "@/lib/report-generation/business-language";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(value: string, keywords: string[]) {
  const normalized = normalize(value);
  return keywords.some((keyword) => normalized.includes(normalize(keyword)));
}

export function formatReportMetricValue(value: unknown, name = "") {
  if (typeof value === "number") {
    const lowerName = name.toLowerCase();

    if ((lowerName.includes("rate") || lowerName.includes("ratio")) && Math.abs(value) <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }

    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return value == null ? "-" : String(value);
}

function inferBusinessType(metric: ReportMetricResultInput, definition?: ReportMetricDefinitionInput): ReportBusinessType {
  if (metric.businessType) {
    const normalized = metric.businessType === "app_marketplace" ? "app_market" : metric.businessType;
    const known = reportSkillRegistry.some((skill) => skill.businessType === normalized);

    if (known) {
      return normalized as ReportBusinessType;
    }
  }

  const text = `${metric.metricName} ${metric.formula} ${definition?.category ?? ""} ${definition?.definition ?? ""}`;
  const matches = reportSkillRegistry
    .filter((skill) => skill.businessType !== "generic")
    .map((skill) => ({
      businessType: skill.businessType,
      score: skill.keywords.filter((keyword) => includesAny(text, [keyword])).length
    }))
    .sort((left, right) => right.score - left.score);

  return matches[0]?.score ? matches[0].businessType : "generic";
}

function metricPriority(metric: ReportMetricResultInput, businessType: ReportBusinessType) {
  const skill = reportSkillRegistry.find((item) => item.businessType === businessType) ?? reportSkillRegistry.at(-1)!;
  const text = `${metric.metricName} ${metric.formula}`;
  const normalizedText = normalize(`${metric.metricName} ${metric.displayName ?? ""} ${metric.formula}`);
  let score = 0;

  if (includesAny(text, skill.coreKeywords)) score += 70;
  if (includesAny(text, skill.trendKeywords)) score += 25;
  if (includesAny(text, skill.structureKeywords)) score += 18;
  if (includesAny(text, skill.qualityKeywords)) score += 12;
  if (includesAny(text, skill.riskKeywords)) score += 10;
  if (includesAny(text, skill.opportunityKeywords)) score += 8;
  if (/count_distinct|safe_divide|count_non_empty/i.test(metric.formula)) score += 8;
  if (/estimated|price\s*\*/i.test(`${metric.metricName} ${metric.formula}`)) score -= 6;
  if (metric.metricType === "core_metric") score += 18;
  if (metric.metricType === "quality_metric") score += 14;
  if (metric.metricType === "risk_metric") score += 12;
  if (metric.metricType === "concentration_metric") score += 10;
  if (metric.metricType === "distribution_metric") score += 6;
  if (metric.metricType === "limitation_metric") score -= 4;
  if (metric.metricType === "diagnostic_metric" || metric.metricType === "warning_metric") score -= 80;
  if (/\breview volume\b/.test(normalizedText)) score += 14;
  if (/\bpositive sentiment rate\b/.test(normalizedText) && !/\bby\b/.test(normalizedText)) score += 18;
  if (/\bnegative sentiment rate\b/.test(normalizedText) && !/\bby\b/.test(normalizedText)) score += 34;
  if (businessType === "finance_timeseries") {
    if (/\bcumulative return\b/.test(normalizedText)) score += 42;
    if (/\bmax drawdown\b/.test(normalizedText)) score += 40;
    if (/\bannualized volatility\b/.test(normalizedText)) score += 38;
    if (/\bannualized return\b/.test(normalizedText)) score += 36;
    if (/\baverage close price\b/.test(normalizedText)) score += 18;
    if (/\btotal trading volume\b/.test(normalizedText)) score += 12;
    if (/\b(trading volume stddev|close price stddev|stddev close|stddev volume)\b/.test(normalizedText)) score -= 24;
  }
  if (typeof metric.priority === "number") score += metric.priority;

  return score;
}

export function isRequiredKeyMetric(metric: Pick<SelectedReportMetric, "name" | "displayName">) {
  const normalizedText = normalize(`${metric.name} ${metric.displayName}`);
  const compactText = normalizedText.replace(/\s+/g, "");

  if (/\bby\s+(app|category|product|group|channel|region|type)\b/.test(normalizedText)) {
    return false;
  }

  return compactText.includes("reviewvolume") ||
    compactText.includes("positivesentimentrate") ||
    compactText.includes("negativesentimentrate");
}

function formulaGrain(formula: string) {
  if (/count_distinct/i.test(formula)) return "去重口径";
  if (/safe_divide|count_if/i.test(formula)) return "比例口径";
  if (/sum/i.test(formula)) return "求和口径";
  if (/avg/i.test(formula)) return "平均口径";
  if (/stddev|range|return/i.test(formula)) return "波动口径";
  return "聚合口径";
}

function warningForMetric(metric: ReportMetricResultInput) {
  if (metric.warning) {
    return metric.warning;
  }

  const text = `${metric.metricName} ${metric.formula}`.toLowerCase();

  if (metric.warningTypes?.includes("small_sample_warning") || (typeof metric.sampleSize === "number" && metric.sampleSize < 20)) {
    return "小样本，仅作排查线索";
  }

  if (metric.requiresDeduplication) {
    return "原始记录口径，可能未按 App / Product 等实体去重";
  }

  if (text.includes("estimated") || /price\s*\*/i.test(metric.formula)) {
    return "估算值，不代表真实收入";
  }

  if (/count\(\*\)/i.test(metric.formula)) {
    return "总记录数口径，可能未按实体去重";
  }

  if (
    /\bsum\s*\([^)]*\b(installs|reviews|usage|volume)\b[^)]*\)/i.test(metric.formula) &&
    !/\b(dedup|count_distinct)\b/i.test(`${metric.metricName} ${metric.displayName ?? ""} ${metric.formula}`)
  ) {
    return "原始记录口径，可能未按 App / Product 等实体去重";
  }

  if (/sum\([^)]*price[^)]*\)/i.test(metric.formula) && !text.includes("estimated")) {
    return "Price 求和不等同真实收入";
  }

  return undefined;
}

function isActiveRateMetric(metric: ReportMetricResultInput, businessType: ReportBusinessType) {
  const text = normalize(`${metric.metricName} ${metric.displayName ?? ""} ${metric.formula}`);

  return (businessType === "user_growth" || businessType === "operations") &&
    /\bactive (rate|users|accounts)\b/.test(text);
}

function isSystemBooleanMetric(metric: ReportMetricResultInput, definition?: ReportMetricDefinitionInput) {
  const rawText = `${metric.metricName} ${metric.displayName ?? ""} ${metric.formula} ${definition?.name ?? ""} ${definition?.formula ?? ""}`;
  const text = normalize(rawText);
  const compact = rawText.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (/\baverage (isactive|is active|active flag|deleted|enabled|flag)\b/.test(text)) {
    return true;
  }

  if (/avg\([^)]*(is_active|isactive|active_flag|deleted|enabled|flag)[^)]*\)/i.test(rawText)) {
    return true;
  }

  if (/\b(row id|system id|internal id|internal status)\b/.test(text)) {
    return true;
  }

  return [
    "isactive",
    "isactiveflag",
    "activeflag",
    "deleted",
    "enabled",
    "flag"
  ].some((keyword) => compact.includes(keyword));
}

function isSampleQualityMetric(metric: ReportMetricResultInput, definition?: ReportMetricDefinitionInput) {
  const rawText = `${metric.metricName} ${metric.displayName ?? ""} ${metric.formula} ${metric.metricCategory ?? ""} ${definition?.name ?? ""} ${definition?.formula ?? ""}`;
  const text = normalize(rawText);
  const compact = rawText.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (/\b(sample size|sample count|samplesize|minimum sample|average sample)\b/.test(text)) {
    return true;
  }

  if (/(averagesamplesize|minimumsamplesize|samplesize|samplecount|sample_size|sample_count)/.test(compact)) {
    return true;
  }

  return /\b(avg|average|min|minimum|max|maximum|median)\s*\([^)]*(sample_size|samplesize|sample_count|samplecount)[^)]*\)/i.test(rawText);
}

function validationPassed(metric: ReportMetricResultInput) {
  if (metric.status !== "computed") {
    return false;
  }

  const normalized = String(metric.validationStatus ?? "passed").toLowerCase();

  return ![
    "failed",
    "invalid",
    "execution_failed",
    "needs_review",
    "rejected",
    "archived",
    "skipped"
  ].includes(normalized);
}

function isBusinessMetricAllowed(metric: ReportMetricResultInput) {
  if (metric.isInternalMetric || metric.isDiagnosticMetric) return false;
  if (metric.isBusinessMetric === false) return false;
  if (metric.scope === "internal" || metric.scope === "diagnostic") return false;
  if (["internal_metric", "diagnostic_metric", "warning_metric"].includes(metric.metricType ?? "")) return false;

  return true;
}

function explanationForMetric(metric: ReportMetricResultInput, definition?: ReportMetricDefinitionInput) {
  const name = normalizeMetricName(metric.metricName);
  const displayValue = formatReportMetricValue(metric.value, metric.metricName);

  if (metric.rows?.length) {
    const insightText = topDimensionInsightText({
      metricName: metric.metricName,
      displayName: metric.displayName,
      formula: metric.formula,
      dimension: /\bby\s+([A-Za-z_][\w.]*)/i.exec(metric.metricName)?.[1] ?? /\bBY\s+([A-Za-z_][\w.]*)/i.exec(metric.formula)?.[1],
      values: metric.rows.map((row) => row.dimension),
      locale: "zh"
    });

    return `${insightText.conclusion}${insightText.explanation}${insightText.nextAction}`;
  }

  if (definition?.definition) {
    const metricLanguage = businessMetricLanguage({
      metricName: metric.metricName,
      displayName: metric.displayName,
      formula: metric.formula,
      unit: metric.unit,
      locale: "zh"
    });

    return `${name} 为 ${displayValue}，代表当前${metricLanguage.pluralLabel}水平；口径为：${definition.definition}`;
  }

  return `${name} 为 ${displayValue}，按照 ${formulaGrain(metric.formula)} 计算`;
}

export function selectReportMetrics({
  metricResults,
  metrics
}: {
  metricResults: ReportMetricResultInput[];
  metrics: ReportMetricDefinitionInput[];
}) {
  const definitionsById = new Map(metrics.map((metric) => [metric.id, metric]));
  const byKey = new Map<string, SelectedReportMetric>();

  for (const result of metricResults) {
    if (!validationPassed(result)) continue;
    if (!isBusinessMetricAllowed(result)) continue;

    const definition = definitionsById.get(result.metricId);
    if (!isBusinessFacingMetricText([
      result.metricName,
      result.displayName,
      result.formula,
      result.metricCategory,
      result.sourceDataset
    ]) || (definition && !isBusinessFacingMetricDefinition(definition))) {
      continue;
    }

    if (!isGlobalBusinessMetricResult(result)) {
      continue;
    }

    if (isObjectLevelMetricText([
      result.metricName,
      result.displayName,
      result.formula,
      result.metricCategory,
      result.sourceDataset
    ])) {
      continue;
    }

    if (!hasDisplayableMetricValue(result.value)) {
      continue;
    }

    const businessType = inferBusinessType(result, definition);
    if (isSystemBooleanMetric(result, definition) && !isActiveRateMetric(result, businessType)) {
      continue;
    }

    if (isSampleQualityMetric(result, definition)) {
      continue;
    }

    const displayName = contextualMetricName(result.metricName, result.formula);
    const warning = warningForMetric(result);
    const priority = metricPriority(result, businessType);
    const selected: SelectedReportMetric = {
      metricId: result.metricId,
      name: result.metricName,
      displayName: result.displayName ? contextualMetricName(result.displayName, result.formula) : displayName,
      unit: result.unit,
      category: result.metricCategory ?? definition?.category ?? "General",
      businessType,
      metricType: result.metricType,
      metricCategory: result.metricCategory,
      scope: result.scope ?? "global",
      semanticRole: result.semanticRole,
      sourceDataset: result.sourceDataset,
      validationStatus: result.validationStatus ?? "passed",
      isCoreMetric: result.isCoreMetric,
      isBusinessMetric: result.isBusinessMetric,
      isInternalMetric: result.isInternalMetric,
      isDiagnosticMetric: result.isDiagnosticMetric,
      isBenchmarkMetric: result.isBenchmarkMetric,
      benchmarkContext: result.benchmarkContext,
      priority,
      value: result.rows?.length ? result.rows[0].value ?? null : result.value ?? null,
      displayValue: result.rows?.length
        ? formatReportMetricValue(result.rows[0].value, result.metricName)
        : formatReportMetricValue(result.value, result.metricName),
      topRows: result.rows,
      formula: result.formula,
      explanation: explanationForMetric(result, definition),
      grain: formulaGrain(result.formula),
      warning,
      warningTypes: result.warningTypes,
      sampleSize: result.sampleSize,
      isEstimated: Boolean(result.isEstimated || warning?.includes("估算")),
      requiresDeduplication: Boolean(
        result.requiresDeduplication ||
        warning?.includes("去重") ||
        warning?.includes("原始记录")
      ),
      isDeduped: false
    };
    const key = metricNameKey(displayName);
    const existing = byKey.get(key);

    if (!existing || selected.priority > existing.priority) {
      byKey.set(key, existing ? { ...selected, isDeduped: true } : selected);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => right.priority - left.priority);
}

export function groupMetricsByBusinessType(metrics: SelectedReportMetric[]) {
  const groups = new Map<ReportBusinessType, SelectedReportMetric[]>();

  for (const metric of metrics) {
    groups.set(metric.businessType, [...(groups.get(metric.businessType) ?? []), metric]);
  }

  return Array.from(groups.entries()).map(([businessType, groupMetrics]) => ({
    businessType,
    metrics: groupMetrics.sort((left, right) => right.priority - left.priority).slice(0, 8)
  }));
}

export function lineageWarnings(metric: ReportMetricDefinitionInput) {
  const lineage = asRecord(metric.lineageJson);
  const warnings = lineage.warnings;

  return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === "string") : [];
}
