import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ReportDataAudit } from "@/lib/report-data-audit";

export type ReportMode = "custom_report" | "daily_brief" | "weekly_report" | "snapshot_report";
export type DailyBriefMode =
  | "daily_full"
  | "daily_low_sample"
  | "latest_available_low_sample"
  | "snapshot";
export type ReportTimeMode =
  | "today_brief"
  | "latest_available_brief"
  | "baseline_snapshot"
  | "current_week_report"
  | "latest_complete_period_report"
  | "monthly_business_review"
  | "weekly_baseline"
  | "snapshot_report";
export type ComparisonMode =
  | "equal_length_period"
  | "complete_week_vs_previous_week"
  | "partial_week_progress"
  | "no_comparison"
  | "latest_7_days_vs_previous_7_days"
  | "latest_7_days_baseline"
  | "partial_latest_period";

type DateRangeInput = {
  preset: string;
  startDate?: string | null;
  endDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
};

type MetricResultLike = {
  metricId?: string | null;
  metricName?: string | null;
  displayName?: string | null;
  value?: unknown;
  rows?: unknown;
  sampleSize?: number | null;
  formula?: string | null;
  currentValue?: unknown;
  previousValue?: unknown;
  unit?: string | null;
  metricCategory?: string | null;
  businessType?: string | null;
  sourceDataset?: string | null;
  dateField?: string | null;
  dateRangePreset?: string | null;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  computedAt?: string | Date | null;
  status?: string | null;
};

type DimensionComparisonMetricKey =
  | "orders"
  | "customers"
  | "netSales"
  | "aov"
  | "returnRate"
  | "rating"
  | "fulfillmentDays";

type DimensionComparisonRow = {
  id: string;
  name: string;
  sampleSmall: boolean;
  todayOrders?: number | null;
  yesterdayOrders?: number | null;
  ordersChange?: number | null;
  todayCustomers?: number | null;
  yesterdayCustomers?: number | null;
  customersChange?: number | null;
  todayNetSales?: number | null;
  yesterdayNetSales?: number | null;
  netSalesChange?: number | null;
  todayAov?: number | null;
  yesterdayAov?: number | null;
  aovChange?: number | null;
  todayReturnRate?: number | null;
  yesterdayReturnRate?: number | null;
  returnRateChange?: number | null;
  todayRating?: number | null;
  yesterdayRating?: number | null;
  ratingChange?: number | null;
  todayFulfillmentDays?: number | null;
  yesterdayFulfillmentDays?: number | null;
  fulfillmentDaysChange?: number | null;
  businessJudgment: string;
};

type DimensionComparisonTable = {
  id: string;
  type: "category" | "product" | "channel" | "market" | "segment";
  label: string;
  rows: DimensionComparisonRow[];
  summaries: string[];
};

type StructuredReportLike = {
  coreSummary?: string;
  generatedInsights?: {
    keyFindings?: Array<Record<string, unknown>>;
    businessRisks?: Array<Record<string, unknown>>;
    growthOpportunities?: Array<Record<string, unknown>>;
    recommendedActions?: Array<Record<string, unknown>>;
    dataLimitations?: Array<Record<string, unknown>>;
    nextActionPlan?: {
      actionInsights?: Array<Record<string, unknown>>;
    };
  };
  keyFindings?: unknown[];
  businessRisks?: unknown[];
  growthOpportunities?: unknown[];
  dataLimitations?: unknown[];
};

export type ReportComposerInput = {
  workspaceId: string;
  requestedReportMode: ReportMode;
  metricResults: MetricResultLike[];
  metricSnapshots: Array<Record<string, unknown>>;
  structuredReport?: StructuredReportLike | null;
  aggregationResults?: Array<Record<string, unknown>>;
  reportDataAudit?: ReportDataAudit | null;
  trendMetrics?: Array<Record<string, unknown>>;
  trendCharts?: Array<Record<string, unknown>>;
  timeConfig?: {
    hasTimeField?: boolean;
    selectedRange?: string;
    startDate?: string | null;
    endDate?: string | null;
    defaultTimeField?: string | null;
  } | null;
  dateRange: DateRangeInput;
  locale: "zh" | "en";
  generatedAt?: Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, "");
}

function asDate(value?: string | Date | null) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(value?: string | Date | null) {
  const date = asDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isComputedMetric(result: MetricResultLike) {
  return result.status === "computed" && typeof result.metricName === "string" && result.metricName.trim().length > 0;
}

function metricValueJson(result: MetricResultLike) {
  if (result.rows != null) return result.rows;
  if (typeof result.value === "number" && Number.isFinite(result.value)) return null;
  if (result.value == null) return null;
  return result.value;
}

function snapshotDate(input: {
  timeConfig?: ReportComposerInput["timeConfig"];
  dateRange: DateRangeInput;
  generatedAt: Date;
}) {
  return asDate(input.timeConfig?.endDate) ??
    asDate(input.dateRange.endDate) ??
    input.generatedAt;
}

function insightText(item: Record<string, unknown>, fallback = "") {
  return String(
    item.summary ??
    item.finding ??
    item.currentConclusion ??
    item.title ??
    item.recommendedAction ??
    item.action ??
    fallback
  ).trim();
}

function insightTitle(item: Record<string, unknown>, fallback: string) {
  return String(item.title ?? item.metricName ?? fallback).trim();
}

function textIncludesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function readableObjectName(value: unknown, locale: "zh" | "en") {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^P\d+/i.test(text)) return locale === "zh" ? `产品 ${text}` : `Product ${text}`;
  return text;
}

function extractObjects(item: Record<string, unknown>, locale: "zh" | "en") {
  const candidates = [
    item.targetObjects,
    item.affectedObjects,
    item.objects,
    item.comparedGroups,
    item.referencedObjects,
    item.targetSegment
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  const names = candidates.flatMap((value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      return [
        record.name,
        record.category,
        record.product,
        record.productId,
        record.id,
        record.dimension,
        record.segment
      ];
    }
    return [value];
  }).map((value) => readableObjectName(value, locale)).filter(Boolean);

  if (names.length) return Array.from(new Set(names)).slice(0, 5);

  const title = insightTitle(item, "");
  const colonObjects = title.split(/[：:]/)[0]?.split(/[、,]/).map((part) => readableObjectName(part, locale)).filter(Boolean) ?? [];
  return colonObjects.length ? colonObjects.slice(0, 5) : [];
}

function normalizeEvidenceText(text: string) {
  return text.toLowerCase().replace(/[0-9.,%+\-\s]+/g, " ").replace(/[^a-z\u4e00-\u9fa5]+/g, " ").trim();
}

function businessOpportunityText(value: unknown, locale: "zh" | "en", fallback = "") {
  const source = value == null || String(value).trim() === "" ? fallback : value;
  const text = String(source).replace(/\s+/g, " ").trim();
  if (!text || locale !== "zh") return text;

  return text
    .replace(/^qualityEvidence\s*:\s*/i, "评分证据：")
    .replace(/^scaleEvidence\s*:\s*/i, "规模证据：")
    .replace(/^count\s*:\s*/i, "候选数量：")
    .replace(/\bAverageRating\b/gi, "评分")
    .replace(/\baverageRating\b/g, "评分")
    .replace(/\brecords\b/gi, "样本量")
    .replace(/\bsample\s*count\b/gi, "样本量")
    .replace(/\bfield\s*name\b/gi, "字段")
    .replace(/\bmean\s*\/\s*median\s*ratio\b/gi, "平均值可能被少数高值拉高")
    .replace(/\bmean\s*median\s*ratio\b/gi, "平均值可能被少数高值拉高")
    .replace(/评分\s*(?:高于|>|>=)\s*P75/gi, "评分表现排在前 25%")
    .replace(/评分\s*(?:低于|<|<=)\s*P25/gi, "评分处于后 25%")
    .replace(/高于\s*P75/gi, "高于大多数对象")
    .replace(/低于\s*P25/gi, "低于大多数对象")
    .replace(/记录数量\s*(?:不高|较低|偏低)/g, "当前样本量还不大")
    .replace(/样本数量\s*(?:不高|较低|偏低)/g, "当前样本量还不大")
    .replace(/样本量\s*(?:不高|较低|偏低|低于或接近(?:中位数|median)|<=\s*(?:median|中位数))/gi, "当前样本量还不大")
    .replace(/规模\s*(?:不高|较低|偏低|低于或接近(?:中位数|median)|<=\s*(?:median|中位数))/gi, "当前规模还较小")
    .replace(/低于或接近\s*(?:median|中位数)/gi, "当前规模还较小")
    .replace(/<=\s*(?:median|中位数)/gi, "当前规模还较小")
    .replace(/\bpercentile\b/gi, "分位表现")
    .replace(/\bmedian\b/gi, "多数对象的一般水平")
    .replace(/P75/gi, "前 25%")
    .replace(/P25/gi, "后 25%");
}

function businessCardFromInsight(
  item: Record<string, unknown>,
  kind: "risk" | "opportunity" | "action" | "finding",
  locale: "zh" | "en",
  index: number
): Record<string, unknown> {
  const isZh = locale === "zh";
  const rawText = [
    item.title,
    item.summary,
    item.finding,
    item.currentConclusion,
    item.supportingEvidence,
    item.evidence,
    item.businessMeaning,
    item.recommendedAction,
    item.action
  ].filter(Boolean).join(" ");
  const objects = extractObjects(item, locale);
  const targetObjects = objects.length ? objects : [isZh ? "当前数据对象" : "current data objects"];
  const title = kind === "risk"
    ? (isZh ? "样本结构可能影响判断" : "Sample structure may affect interpretation")
    : kind === "opportunity"
      ? (isZh ? `${targetObjects[0]} 可作为测试候选` : `${targetObjects[0]} is a test candidate`)
      : kind === "action"
        ? (isZh ? `验证 ${targetObjects[0]} 的下一步动作` : `Validate next action for ${targetObjects[0]}`)
        : insightTitle(item, isZh ? "关键发现" : "Key finding");
  const isSampleStructure = textIncludesAny(rawText, [/sample|样本|concentration|集中|share|占比/i]);
  const rawKeyEvidence = String(item.supportingEvidence ?? item.evidence ?? item.metricEvidence ?? insightText(item, ""));
  const keyEvidence = kind === "opportunity"
    ? businessOpportunityText(rawKeyEvidence, locale)
    : rawKeyEvidence;
  const businessJudgment = kind === "risk" && isSampleStructure
    ? (isZh
      ? `当前结论可能被 ${targetObjects.slice(0, 3).join("、")} 主导，属于样本结构风险，不代表这些对象业务表现差。`
      : `The conclusion may be dominated by ${targetObjects.slice(0, 3).join(", ")}. This is a sample-structure risk, not necessarily weak business performance.`)
    : kind === "opportunity"
      ? (isZh
        ? businessOpportunityText(item.businessMeaning, locale, `${targetObjects[0]} 已表现出相对更好的信号，但仍需要用更完整样本验证。`)
        : `${targetObjects[0]} shows a stronger signal, but should be validated with a larger sample.`)
      : kind === "action"
        ? (isZh
          ? `该动作有助于把当前发现转化为可验证的业务输出。`
          : `This action turns the finding into a verifiable business output.`)
        : insightText(item, title);
  const rawRecommendedAction = String(item.recommendedAction ?? item.action ?? (
    kind === "risk"
      ? (isZh ? `补充分组样本和业务指标后，再判断 ${targetObjects.slice(0, 3).join("、")} 是否存在真实风险。` : `Add segment samples and business metrics before treating ${targetObjects.slice(0, 3).join(", ")} as a true risk.`)
      : kind === "opportunity"
        ? (isZh ? `对 ${targetObjects[0]} 做小范围曝光、推荐位或投放测试，并观察规模提升后核心指标是否稳定。` : `Run a small exposure, recommendation-slot, or campaign test for ${targetObjects[0]} and monitor whether core metrics stay stable as scale grows.`)
        : (isZh ? `明确对象、动作和输出物，下周复盘实际影响。` : `Define the target, action, and output, then review impact next week.`)
  ));
  const recommendedAction = kind === "opportunity"
    ? businessOpportunityText(rawRecommendedAction, locale)
    : rawRecommendedAction;
  const caveat = isSampleStructure
    ? (isZh ? "样本结构风险" : "Sample structure risk")
    : /^产品\s+P/i.test(targetObjects[0] ?? "")
      ? (isZh ? "建议补充产品名称映射" : "Add product name mapping")
      : "";

  return {
    id: String(item.id ?? `${kind}-${index}`),
    title: kind === "opportunity" ? businessOpportunityText(title, locale) : title,
    targetObjects,
    keyEvidence: keyEvidence || (isZh ? "当前证据不足，需补充业务字段。" : "Evidence is limited; add business fields."),
    businessJudgment,
    recommendedAction,
    caveat,
    details: rawText,
    riskType: item.riskType ?? item.findingType ?? kind,
    dedupeKey: `${kind}|${normalizeEvidenceText(keyEvidence)}|${targetObjects.slice(0, 3).join("|").toLowerCase()}`
  };
}

function dedupeCards(cards: Array<Record<string, unknown>>, limit: number) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = String(card.dedupeKey ?? card.title ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function businessCards(items: Array<Record<string, unknown>> = [], kind: "risk" | "opportunity" | "action" | "finding", locale: "zh" | "en", limit = 3) {
  return dedupeCards(items.map((item, index) => businessCardFromInsight(item, kind, locale, index)), limit);
}

function dataCaveatCards(items: Array<Record<string, unknown>> = [], locale: "zh" | "en", hasTimeField = true) {
  const isZh = locale === "zh";
  const raw = items.map((item, index) => businessCardFromInsight(item, "finding", locale, index));
  const fixed = [
    !hasTimeField ? {
      id: "missing-business-time",
      title: isZh ? "缺少业务时间字段" : "Missing business time field",
      targetObjects: [isZh ? "日报、周报和趋势对比" : "daily, weekly, and trend reports"],
      keyEvidence: isZh ? "当前数据无法识别 order_date、created_at 或 transaction_date。" : "No order_date, created_at, or transaction_date field is available.",
      businessJudgment: isZh ? "无法生成可信的周期对比，报告只能作为当前数据快照。" : "Reliable period comparisons cannot be generated; the report is a current snapshot only.",
      recommendedAction: isZh ? "补充 order_date、created_at 或 transaction_date，补完后可生成日报、周报和趋势变化。" : "Add order_date, created_at, or transaction_date to enable daily, weekly, and trend comparisons.",
      caveat: isZh ? "影响时间对比" : "Affects time comparison"
    } : null,
    {
      id: "estimated-gmv",
      title: isZh ? "估算值不能代表真实收入" : "Estimated values are not actual revenue",
      targetObjects: ["Estimated GMV"],
      keyEvidence: isZh ? "Estimated GMV 只能作为方向性指标。" : "Estimated GMV is directional only.",
      businessJudgment: isZh ? "在缺少真实支付金额时，收入和 ROI 判断置信度较低。" : "Revenue and ROI confidence is low without actual paid amount.",
      recommendedAction: isZh ? "补充 paid_amount、order_amount 或 revenue，用于验证真实销售表现。" : "Add paid_amount, order_amount, or revenue to validate actual sales performance.",
      caveat: isZh ? "影响收入判断" : "Affects revenue judgment"
    },
    {
      id: "missing-cost",
      title: isZh ? "缺少成本字段" : "Missing cost fields",
      targetObjects: [isZh ? "利润和 ROI" : "profit and ROI"],
      keyEvidence: isZh ? "当前无法确认成本、毛利和投放效率。" : "Cost, margin, and spend efficiency cannot be verified.",
      businessJudgment: isZh ? "无法判断高销售对象是否真的带来高利润。" : "High-sales objects may not be high-profit objects.",
      recommendedAction: isZh ? "补充 cost、cogs 或 ad_spend，补完后可计算利润和 ROI。" : "Add cost, cogs, or ad_spend to calculate profit and ROI.",
      caveat: isZh ? "影响利润判断" : "Affects profit judgment"
    }
  ].filter(Boolean) as Array<Record<string, unknown>>;

  return dedupeCards([...fixed, ...raw], 3);
}

function pickInsightItems(items: Array<Record<string, unknown>> = [], limit = 3) {
  return items.slice(0, limit).map((item, index) => ({
    id: String(item.id ?? `item-${index + 1}`),
    title: insightTitle(item, `Insight ${index + 1}`),
    summary: insightText(item, insightTitle(item, `Insight ${index + 1}`)),
    evidenceMetrics: Array.isArray(item.evidenceMetrics) ? item.evidenceMetrics : []
  }));
}

function leadingInsightSummary(items: Array<Record<string, unknown>> = [], fallback: string) {
  const lead = items[0];
  return lead ? insightText(lead, fallback) : fallback;
}

function formatMetricNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function formatPercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number > 0 ? "+" : ""}${(number * 100).toFixed(1)}%`;
}

function metricAggregationMode(metricName: string) {
  return /average|avg|mean|rating|score|rate|ratio|price|平均|评分|得分|率|比例|价格|单价/i.test(metricName) ? "avg" : "sum";
}

function aggregationLabel(metricName: string, aggregation: "sum" | "avg", locale: "zh" | "en") {
  const isRating = /rating|score|评分|得分/i.test(metricName);
  if (locale !== "zh") return aggregation === "avg" ? (isRating ? "average rating" : "average value") : "total value";
  return aggregation === "avg" ? (isRating ? "平均评分" : "平均值") : "合计值";
}

function weeklyMetricKind(metricName: string) {
  if (/discount|折扣|优惠/i.test(metricName)) return "discount";
  if (/rating|score|评分|得分/i.test(metricName)) return "rating";
  if (/revenue|gmv|sales|gross|amount|销售额|收入|成交额|交易额/i.test(metricName)) return "sales";
  if (/order|订单/i.test(metricName)) return "orders";
  if (/customer|user|客户|用户/i.test(metricName)) return "customers";
  return "generic";
}

function weeklyBusinessText(input: {
  metricName: string;
  current: string;
  previous: string;
  percent: string | null;
  percentValue: number | null;
  currentSampleSize: number;
  locale: "zh" | "en";
}) {
  const isZh = input.locale === "zh";
  const direction = input.percentValue == null
    ? (isZh ? "暂无可比变化" : "has no comparable change")
    : input.percentValue > 0
      ? (isZh ? "增长" : "increased")
      : input.percentValue < 0
        ? (isZh ? "下降" : "decreased")
        : (isZh ? "持平" : "was flat");
  const kind = weeklyMetricKind(input.metricName);
  const changeText = input.percent ? `${direction} ${input.percent}` : direction;

  if (kind === "rating") {
    return {
      judgment: isZh
        ? `最近 7 天平均客户评分为 ${input.current}，较前 7 天的 ${input.previous} ${changeText}。${input.currentSampleSize < 20 ? `由于样本量仅 ${input.currentSampleSize}，该变化应作为体验风险线索。` : "该变化可作为客户体验变化信号。"}`
        : `Average customer rating was ${input.current} in the latest 7 days, ${changeText} versus ${input.previous} in the previous 7 days. ${input.currentSampleSize < 20 ? `With only ${input.currentSampleSize} samples, treat this as an experience-risk lead.` : "Use this as a customer-experience signal."}`,
      action: isZh
        ? "查看低评分订单、客户反馈、退款或售后原因，确认是否集中在特定商品、品类或渠道。"
        : "Review low-rated orders, customer feedback, refunds, or support reasons, then check whether they cluster by product, category, or channel."
    };
  }

  if (kind === "sales") {
    return {
      judgment: isZh
        ? `最近 7 天销售额为 ${input.current}，较前 7 天的 ${input.previous} ${changeText}。${input.percentValue != null && input.percentValue > 0 ? "销售规模出现回升。" : "需要确认回落来自订单量、客单价还是渠道变化。"}`
        : `Sales were ${input.current} in the latest 7 days, ${changeText} versus ${input.previous} in the previous 7 days.`,
      action: isZh
        ? "拆解增长来源，查看主要来自哪些品类、客户群体或渠道，并同步检查折扣和客单价变化。"
        : "Break down the change by category, customer segment, or channel, and check discount and AOV changes."
    };
  }

  if (kind === "discount") {
    return {
      judgment: isZh
        ? `最近 7 天折扣金额为 ${input.current}，较前 7 天的 ${input.previous} ${changeText}。折扣变化需要和销售额变化一起判断。`
        : `Discount amount was ${input.current} in the latest 7 days, ${changeText} versus ${input.previous} in the previous 7 days.`,
      action: isZh
        ? "对比销售额增幅和折扣增幅，判断本周销售变化是否依赖促销推动。"
        : "Compare sales growth with discount growth to determine whether the change depends on promotions."
    };
  }

  if (kind === "orders") {
    return {
      judgment: isZh
        ? `最近 7 天订单量为 ${input.current}，较前 7 天的 ${input.previous} ${changeText}。订单变化反映需求或流量转化的短期变化。`
        : `Orders were ${input.current} in the latest 7 days, ${changeText} versus ${input.previous} in the previous 7 days.`,
      action: isZh
        ? "结合渠道、品类和客单价拆解订单变化来源。"
        : "Break down order changes by channel, category, and AOV."
    };
  }

  return {
    judgment: isZh
      ? `最近 7 天 ${input.metricName} 为 ${input.current}，较前 7 天的 ${input.previous} ${changeText}。`
      : `${input.metricName} was ${input.current} in the latest 7 days, ${changeText} versus ${input.previous} in the previous 7 days.`,
    action: isZh
      ? "结合明细对象拆解变化来源，确认是否由少数品类、客户或渠道驱动。"
      : "Break down the change by object to confirm whether it is driven by a small set of categories, customers, or channels."
  };
}

function reportRangeDays(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function periodLengthLabel(days: number, locale: "zh" | "en") {
  return locale === "zh" ? `${days}天` : `${days} days`;
}

function rangeWithDaysLabel(start: Date, end: Date, locale: "zh" | "en") {
  return `${rangeLabel(start, end, locale)}（${periodLengthLabel(reportRangeDays(start, end), locale)}）`;
}

function selectedRangeDays(preset?: string | null) {
  if (preset === "7D") return 7;
  if (preset === "30D") return 30;
  if (preset === "90D") return 90;
  return null;
}

export function buildComparisonPeriod(input: {
  selectedRange?: string | null;
  latestDataDate: string | Date;
  reportMode: ReportMode;
  currentStart?: string | Date | null;
  currentEnd?: string | Date | null;
  previousStart?: string | Date | null;
  previousEnd?: string | Date | null;
}) {
  const latestDataDate = asDate(input.latestDataDate) ?? new Date();
  const isWeekly = input.reportMode === "weekly_report";
  if (isWeekly) {
    const currentEnd = latestDataDate;
    const currentStart = addDays(currentEnd, -6);
    const currentDays = reportRangeDays(currentStart, currentEnd);
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -6);
    const previousDays = reportRangeDays(previousStart, previousEnd);

    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      currentDays,
      previousDays,
      comparisonMode: "latest_7_days_vs_previous_7_days" as ComparisonMode,
      isEqualLength: currentDays === previousDays,
      isCurrentComplete: true,
      isPreviousComplete: previousDays === 7,
      caveat: null
    };
  }

  const explicitStart = asDate(input.currentStart);
  const explicitEnd = asDate(input.currentEnd);
  const days = selectedRangeDays(input.selectedRange) ??
    (explicitStart && explicitEnd ? reportRangeDays(explicitStart, explicitEnd) : 1);
  const currentEnd = explicitEnd ?? latestDataDate;
  const currentStart = explicitStart ?? addDays(currentEnd, -(days - 1));
  const currentDays = reportRangeDays(currentStart, currentEnd);
  const explicitPreviousStart = asDate(input.previousStart);
  const explicitPreviousEnd = asDate(input.previousEnd);
  const previousEnd = explicitPreviousEnd ?? addDays(currentStart, -1);
  const previousStart = explicitPreviousStart ?? addDays(previousEnd, -(currentDays - 1));
  const previousDays = reportRangeDays(previousStart, previousEnd);

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentDays,
    previousDays,
    comparisonMode: "equal_length_period" as ComparisonMode,
    isEqualLength: currentDays === previousDays,
    isCurrentComplete: true,
    isPreviousComplete: true,
    caveat: null
  };
}

export function buildWeeklyComparisonPeriod(input: {
  latestDataDate: string | Date;
  dateField?: string | null;
}) {
  const period = buildComparisonPeriod({
    latestDataDate: input.latestDataDate,
    reportMode: "weekly_report"
  });

  return {
    latestDataDate: isoDate(input.latestDataDate),
    dateField: input.dateField ?? null,
    currentPeriodStart: isoDate(period.currentStart),
    currentPeriodEnd: isoDate(period.currentEnd),
    previousPeriodStart: isoDate(period.previousStart),
    previousPeriodEnd: isoDate(period.previousEnd),
    currentDays: period.currentDays,
    previousDays: period.previousDays,
    comparisonMode: period.comparisonMode
  };
}

function trendRows(metric: Record<string, unknown>) {
  const rows = Array.isArray(metric.timeSeries) ? metric.timeSeries : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const date = isoDate(record.date as string | Date | null);
    const value = Number(record.value);
    const sampleSize = Number(record.sampleSize ?? record.sample_size ?? record.records ?? record.count ?? 1);
    return date && Number.isFinite(value) ? [{ date, value, sampleSize: Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : 1 }] : [];
  });
}

function latestTrendDate(trendMetrics: Array<Record<string, unknown>> = []) {
  const dates = trendMetrics.flatMap((metric) => trendRows(metric).map((row) => row.date)).sort();
  return dates.length ? asDate(dates[dates.length - 1]) : null;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function rangeLabel(start: Date, end: Date, locale: "zh" | "en") {
  const startText = isoDate(start);
  const endText = isoDate(end);
  return locale === "zh" ? `${startText} 至 ${endText}` : `${startText} to ${endText}`;
}

function rowsInRange(rows: Array<{ date: string; value: number; sampleSize?: number }>, start: Date, end: Date) {
  const startText = isoDate(start);
  const endText = isoDate(end);
  return rows.filter((row) => row.date >= String(startText) && row.date <= String(endText));
}

function aggregateRows(rows: Array<{ value: number; sampleSize?: number }>, mode: "sum" | "avg") {
  if (!rows.length) return null;
  if (mode === "avg") {
    const weightedTotal = rows.reduce((sum, row) => sum + row.value * (row.sampleSize ?? 1), 0);
    const sampleTotal = rows.reduce((sum, row) => sum + (row.sampleSize ?? 1), 0);
    return sampleTotal > 0 ? weightedTotal / sampleTotal : null;
  }
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return total;
}

function sampleSizeFromRows(rows: Array<{ sampleSize?: number }>) {
  return rows.reduce((sum, row) => sum + (row.sampleSize ?? 1), 0);
}

function uniqueDateCount(rows: Array<{ date: string }>) {
  return new Set(rows.map((row) => row.date)).size;
}

function trendDateCountInRange(trendMetrics: Array<Record<string, unknown>>, start: Date, end: Date) {
  const dates = new Set<string>();
  trendMetrics.forEach((metric) => {
    rowsInRange(trendRows(metric), start, end).forEach((row) => dates.add(row.date));
  });
  return dates.size;
}

function isCountLikeMetric(name: string) {
  return /record|records|order|orders|review|reviews|transaction|transactions|count|数量|订单|评论|交易|记录/i.test(name);
}

function dailySampleStats(trendMetrics: Array<Record<string, unknown>> = [], latestDate: Date) {
  const latestDateText = String(isoDate(latestDate));
  const latestRows = trendMetrics.flatMap((metric) => {
    const name = String(metric.metricName ?? metric.sourceMetricName ?? "");
    return trendRows(metric)
      .filter((row) => row.date === latestDateText)
      .map((row) => ({
        name,
        value: row.value,
        sampleSize: row.sampleSize ?? 1
      }));
  });
  const sampleFromCountMetrics = latestRows
    .filter((row) => isCountLikeMetric(row.name))
    .reduce((max, row) => Math.max(max, Number(row.value) || 0), 0);
  const sampleFromMetricSamples = latestRows.reduce((sum, row) => sum + (row.sampleSize ?? 1), 0);
  const dailySampleSize = Math.round(Math.max(sampleFromCountMetrics, sampleFromMetricSamples, latestRows.length ? 1 : 0));
  const sampleLevel = dailySampleSize < 10
    ? "very_low"
    : dailySampleSize < 30
      ? "low"
      : "enough";

  return {
    dailySampleSize,
    sampleLevel,
    hasLatestDayRows: latestRows.length > 0
  };
}

function dailyRecordStats(input: ReportComposerInput, fallback: ReturnType<typeof dailySampleStats>) {
  const auditDailyRows = input.reportDataAudit?.dailyRows;
  const dailySampleSize = typeof auditDailyRows === "number" && Number.isFinite(auditDailyRows)
    ? Math.max(0, Math.trunc(auditDailyRows))
    : fallback.dailySampleSize;
  const sampleLevel = dailySampleSize < 10
    ? "very_low"
    : dailySampleSize < 30
      ? "low"
      : "enough";

  return {
    dailySampleSize,
    sampleLevel,
    hasLatestDayRows: typeof auditDailyRows === "number" ? dailySampleSize > 0 : fallback.hasLatestDayRows
  };
}

type DailyBusinessMetricKey =
  | "orders"
  | "revenue"
  | "estimated_gmv"
  | "aov"
  | "estimated_aov"
  | "units"
  | "customers"
  | "return_rate"
  | "rating"
  | "fulfillment_days";

type DailyBusinessMetric = {
  key: DailyBusinessMetricKey;
  label: string;
  sourceName: string;
  rows: Array<{ date: string; value: number; sampleSize?: number }>;
  aggregation: "sum" | "avg";
  isEstimated: boolean;
  definition: string;
  priority: number;
};

function canonicalDailyMetricKey(metric: Record<string, unknown>): DailyBusinessMetricKey | null {
  const canonical = String(metric.canonicalMetricKey ?? "").toLowerCase();
  const source = `${metric.metricId ?? ""} ${metric.sourceMetricName ?? ""} ${metric.metricName ?? ""} ${metric.displayName ?? ""} ${metric.formula ?? ""}`.toLowerCase();

  if (/average_order_value|aov|客单价/.test(`${canonical} ${source}`)) {
    return /estimated|估算/.test(source) ? "estimated_aov" : "aov";
  }
  if (/estimated.*gmv|estimated.*sales|估算/.test(source)) return "estimated_gmv";
  if (/sales|revenue|gmv|net_sales|paid_amount|order_amount|transaction_amount|销售额|收入|成交额|交易额/.test(`${canonical} ${source}`)) return "revenue";
  if (/units_sold|units|quantity|sold|件数|销量|销售件数/.test(source)) return "units";
  if (/return|refund|退货|退款/.test(source) && /rate|率|ratio/.test(source)) return "return_rate";
  if (/average_rating|rating|review_score|score|评分/.test(`${canonical} ${source}`)) return "rating";
  if (/customers|customer_count|users|客户|用户/.test(`${canonical} ${source}`)) return "customers";
  if (/fulfillment|delivery|shipping|履约|配送|发货/.test(source) && /day|days|天/.test(source)) return "fulfillment_days";
  if (/orders|order_count|total_orders|订单/.test(`${canonical} ${source}`)) return "orders";

  return null;
}

function dailyMetricLabel(key: DailyBusinessMetricKey, locale: "zh" | "en", estimated = false) {
  const labels: Record<DailyBusinessMetricKey, [string, string]> = {
    orders: ["订单数", "Orders"],
    revenue: ["销售额", "Revenue"],
    estimated_gmv: ["估算成交规模", "Estimated GMV"],
    aov: ["客单价", "AOV"],
    estimated_aov: ["估算客单价", "Estimated AOV"],
    units: ["销售件数", "Units Sold"],
    customers: ["客户数", "Customers"],
    return_rate: ["退货率", "Return Rate"],
    rating: ["平均评分", "Average Rating"],
    fulfillment_days: ["履约天数", "Fulfillment Days"]
  };
  const label = labels[key][locale === "zh" ? 0 : 1];
  return estimated && locale === "zh" && !label.includes("估算") ? `估算${label}` : label;
}

function dailyMetricBusinessLabel(key: DailyBusinessMetricKey, locale: "zh" | "en", sourceName: string, estimated = false) {
  const source = sourceName.toLowerCase();
  if (key === "revenue") {
    if (/net_sales|net sales|净销售/.test(source)) return locale === "zh" ? "净销售额" : "Net Sales";
    if (/total_paid|total paid|实付/.test(source)) return locale === "zh" ? "实付金额" : "Total Paid";
    if (/gross_sales|gross sales|商品销售/.test(source)) return locale === "zh" ? "商品销售额" : "Gross Sales";
  }
  if (key === "rating") return locale === "zh" ? "平均客户评分" : "Average Rating";
  if (key === "fulfillment_days") return locale === "zh" ? "平均履约天数" : "Fulfillment Days";
  return dailyMetricLabel(key, locale, estimated);
}

function dailyMetricDefinition(key: DailyBusinessMetricKey, locale: "zh" | "en", estimated = false) {
  if (locale !== "zh") {
    const definitions: Record<DailyBusinessMetricKey, string> = {
      orders: "Distinct order count when order_id exists; otherwise row count estimate.",
      revenue: "Actual transaction amount from paid amount, order amount, revenue, sales amount, GMV, or total price fields.",
      estimated_gmv: "Estimated transaction scale from price and quantity; not actual paid revenue, profit, or cash flow.",
      aov: "Actual revenue divided by orders.",
      estimated_aov: "Estimated GMV divided by orders.",
      units: "Sum of quantity.",
      customers: "Distinct customer count when customer_id exists.",
      return_rate: "Returned or refunded orders divided by total orders.",
      rating: "Average rating or review score, used only for customer experience analysis.",
      fulfillment_days: "Average delivery or fulfillment days."
    };
    return definitions[key];
  }

  const definitions: Record<DailyBusinessMetricKey, string> = {
    orders: "优先按 order_id 去重计算；缺少 order_id 时按记录数估算订单量。",
    revenue: "来自 paid_amount、order_amount、transaction_amount、revenue、sales_amount、net_sales、gmv 或 total_price 等真实交易金额字段。",
    estimated_gmv: "基于价格和数量计算的估算成交规模，不等同于真实支付收入、利润或现金流。",
    aov: "真实交易金额 / 订单数。",
    estimated_aov: "估算成交规模 / 订单数，属于估算值。",
    units: "按 quantity 汇总销售件数。",
    customers: "按 customer_id 去重计算；缺少客户字段时不使用记录数替代。",
    return_rate: "退货或退款订单数 / 总订单数。",
    rating: "rating 或 review_score 的平均值，仅用于用户体验分析。",
    fulfillment_days: "履约、配送或发货耗时的平均天数。"
  };
  return definitions[key] + (estimated ? " 当前指标为估算值。" : "");
}

function dailyBusinessMetrics(trendMetrics: Array<Record<string, unknown>> = [], locale: "zh" | "en") {
  const priority: Record<DailyBusinessMetricKey, number> = {
    orders: 1,
    revenue: 2,
    estimated_gmv: 3,
    aov: 4,
    estimated_aov: 5,
    units: 6,
    customers: 7,
    return_rate: 8,
    rating: 9,
    fulfillment_days: 10
  };
  const byKey = new Map<DailyBusinessMetricKey, DailyBusinessMetric>();

  for (const metric of trendMetrics) {
    const key = canonicalDailyMetricKey(metric);
    if (!key) continue;
    if ((key === "revenue" || key === "aov") && /price\b/i.test(String(metric.sourceMetricName ?? "")) && !/amount|revenue|sales|gmv|total/i.test(String(metric.sourceMetricName ?? ""))) {
      continue;
    }
    const rows = trendRows(metric);
    if (!rows.length) continue;
    const isEstimated = key === "estimated_gmv" || key === "estimated_aov" || /estimated|估算/i.test(String(metric.sourceMetricName ?? metric.metricName ?? ""));
    const candidate: DailyBusinessMetric = {
      key,
      label: dailyMetricLabel(key, locale, isEstimated),
      sourceName: String(metric.sourceMetricName ?? metric.metricName ?? key),
      rows,
      aggregation: key === "rating" || key === "return_rate" || key === "aov" || key === "estimated_aov" || key === "fulfillment_days" ? "avg" : "sum",
      isEstimated,
      definition: dailyMetricDefinition(key, locale, isEstimated),
      priority: priority[key]
    };
    const existing = byKey.get(key);
    if (!existing || candidate.priority < existing.priority || (candidate.rows.length > existing.rows.length && candidate.priority === existing.priority)) {
      byKey.set(key, candidate);
    }
  }

  if (!byKey.has("aov") && byKey.has("revenue") && byKey.has("orders")) {
    const revenue = byKey.get("revenue")!;
    const orders = byKey.get("orders")!;
    byKey.set("aov", derivedRatioMetric("aov", revenue, orders, locale));
  }

  if (!byKey.has("estimated_aov") && byKey.has("estimated_gmv") && byKey.has("orders")) {
    const estimatedGmv = byKey.get("estimated_gmv")!;
    const orders = byKey.get("orders")!;
    byKey.set("estimated_aov", derivedRatioMetric("estimated_aov", estimatedGmv, orders, locale));
  }

  return Array.from(byKey.values()).sort((left, right) => left.priority - right.priority).slice(0, 8);
}

function numericMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%+,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricResultMatchesDailyWindow(result: MetricResultLike, latestDateText: string) {
  const preset = String(result.dateRangePreset ?? "").toUpperCase();
  const start = isoDate(result.dateRangeStart ?? null);
  const end = isoDate(result.dateRangeEnd ?? null);

  if (preset === "ALL") return false;
  return start === latestDateText && end === latestDateText;
}

function metricResultMatchesWindow(result: MetricResultLike, startDateText: string, endDateText: string) {
  const preset = String(result.dateRangePreset ?? "").toUpperCase();
  const start = isoDate(result.dateRangeStart ?? null);
  const end = isoDate(result.dateRangeEnd ?? null);

  if (preset === "ALL") return false;
  return start === startDateText && end === endDateText;
}

function dailyBusinessMetricsFromResults(
  metricResults: MetricResultLike[] = [],
  latestDate: Date,
  locale: "zh" | "en"
) {
  const priority: Record<DailyBusinessMetricKey, number> = {
    orders: 2,
    revenue: 1,
    estimated_gmv: 20,
    aov: 4,
    estimated_aov: 21,
    units: 6,
    customers: 3,
    return_rate: 7,
    rating: 8,
    fulfillment_days: 9
  };
  const latestDateText = isoDate(latestDate);
  const yesterdayText = isoDate(addDays(latestDate, -1));
  if (!latestDateText || !yesterdayText) return [];
  const byKey = new Map<DailyBusinessMetricKey, DailyBusinessMetric>();

  for (const result of metricResults) {
    if (result.status && result.status !== "computed") continue;
    if (!metricResultMatchesDailyWindow(result, latestDateText)) continue;
    if (result.businessType !== "ecommerce" && !/metric_registry|ecommerce/i.test(`${result.sourceDataset ?? ""} ${result.metricCategory ?? ""}`)) continue;
    if (Array.isArray(result.rows) && result.rows.length > 0) continue;
    const record = result as unknown as Record<string, unknown>;
    const key = canonicalDailyMetricKey(record);
    if (!key) continue;
    const isEstimated = key === "estimated_gmv" || key === "estimated_aov" || /estimated|估算/i.test(`${result.metricName ?? ""} ${result.displayName ?? ""}`);
    if ((key === "estimated_gmv" || key === "estimated_aov") && Array.from(byKey.keys()).some((item) => item === "revenue" || item === "aov")) {
      continue;
    }
    const current = numericMetricValue(result.currentValue ?? result.value);
    const previous = numericMetricValue(result.previousValue);
    const rows = [
      ...(previous == null ? [] : [{ date: yesterdayText, value: previous }]),
      ...(current == null ? [] : [{ date: latestDateText, value: current, sampleSize: typeof result.sampleSize === "number" ? result.sampleSize : undefined }])
    ];
    if (!rows.length) continue;
    const sourceName = String(result.displayName ?? result.metricName ?? key);
    const candidate: DailyBusinessMetric = {
      key,
      label: dailyMetricBusinessLabel(key, locale, sourceName, isEstimated),
      sourceName,
      rows,
      aggregation: key === "rating" || key === "return_rate" || key === "aov" || key === "estimated_aov" || key === "fulfillment_days" ? "avg" : "sum",
      isEstimated,
      definition: dailyMetricDefinition(key, locale, isEstimated),
      priority: priority[key]
    };
    const existing = byKey.get(key);
    if (!existing || candidate.priority < existing.priority || (candidate.key === "revenue" && /net_sales|net sales|净销售/.test(sourceName.toLowerCase()))) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => left.priority - right.priority).slice(0, 8);
}

function mergeDailyBusinessMetrics(primary: DailyBusinessMetric[], fallback: DailyBusinessMetric[]) {
  const byKey = new Map<DailyBusinessMetricKey, DailyBusinessMetric>();
  for (const metric of fallback) byKey.set(metric.key, metric);
  for (const metric of primary) byKey.set(metric.key, metric);
  return Array.from(byKey.values()).sort((left, right) => left.priority - right.priority).slice(0, 8);
}

function periodBusinessMetricsFromResults(
  metricResults: MetricResultLike[] = [],
  period: { currentStart: Date; currentEnd: Date; previousEnd: Date },
  locale: "zh" | "en"
) {
  const priority: Record<DailyBusinessMetricKey, number> = {
    orders: 2,
    revenue: 1,
    estimated_gmv: 20,
    aov: 4,
    estimated_aov: 21,
    units: 6,
    customers: 3,
    return_rate: 7,
    rating: 8,
    fulfillment_days: 9
  };
  const currentStartText = isoDate(period.currentStart);
  const currentEndText = isoDate(period.currentEnd);
  const previousEndText = isoDate(period.previousEnd);
  if (!currentStartText || !currentEndText || !previousEndText) return [];
  const byKey = new Map<DailyBusinessMetricKey, DailyBusinessMetric>();

  for (const result of metricResults) {
    if (result.status && result.status !== "computed") continue;
    if (!metricResultMatchesWindow(result, currentStartText, currentEndText)) continue;
    if (result.businessType !== "ecommerce" && !/metric_registry|ecommerce/i.test(`${result.sourceDataset ?? ""} ${result.metricCategory ?? ""}`)) continue;
    if (Array.isArray(result.rows) && result.rows.length > 0) continue;
    const record = result as unknown as Record<string, unknown>;
    const key = canonicalDailyMetricKey(record);
    if (!key) continue;
    const isEstimated = key === "estimated_gmv" || key === "estimated_aov" || /estimated|估算/i.test(`${result.metricName ?? ""} ${result.displayName ?? ""}`);
    if ((key === "estimated_gmv" || key === "estimated_aov") && Array.from(byKey.keys()).some((item) => item === "revenue" || item === "aov")) {
      continue;
    }
    const current = numericMetricValue(result.currentValue ?? result.value);
    const previous = numericMetricValue(result.previousValue);
    const rows = [
      ...(previous == null ? [] : [{ date: previousEndText, value: previous }]),
      ...(current == null ? [] : [{ date: currentEndText, value: current, sampleSize: typeof result.sampleSize === "number" ? result.sampleSize : undefined }])
    ];
    if (!rows.length) continue;
    const sourceName = String(result.displayName ?? result.metricName ?? key);
    const candidate: DailyBusinessMetric = {
      key,
      label: dailyMetricBusinessLabel(key, locale, sourceName, isEstimated),
      sourceName,
      rows,
      aggregation: key === "rating" || key === "return_rate" || key === "aov" || key === "estimated_aov" || key === "fulfillment_days" ? "avg" : "sum",
      isEstimated,
      definition: dailyMetricDefinition(key, locale, isEstimated),
      priority: priority[key]
    };
    const existing = byKey.get(key);
    if (!existing || candidate.priority < existing.priority || (candidate.key === "revenue" && /net_sales|net sales|净销售/.test(sourceName.toLowerCase()))) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => left.priority - right.priority).slice(0, 8);
}

function derivedRatioMetric(key: "aov" | "estimated_aov", numerator: DailyBusinessMetric, denominator: DailyBusinessMetric, locale: "zh" | "en"): DailyBusinessMetric {
  const denominatorByDate = new Map(denominator.rows.map((row) => [row.date, row.value]));
  return {
    key,
    label: dailyMetricLabel(key, locale, key === "estimated_aov"),
    sourceName: key,
    rows: numerator.rows.flatMap((row) => {
      const base = denominatorByDate.get(row.date);
      return base && base > 0 ? [{ date: row.date, value: row.value / base, sampleSize: row.sampleSize }] : [];
    }),
    aggregation: "avg",
    isEstimated: key === "estimated_aov",
    definition: dailyMetricDefinition(key, locale, key === "estimated_aov"),
    priority: key === "aov" ? 4 : 5
  };
}

function metricWindowValue(metric: DailyBusinessMetric, start: Date, end: Date) {
  return aggregateRows(rowsInRange(metric.rows, start, end), metric.aggregation);
}

function metricWindowSample(metric: DailyBusinessMetric, start: Date, end: Date) {
  return sampleSizeFromRows(rowsInRange(metric.rows, start, end));
}

function changeRatio(current: number | null, previous: number | null) {
  if (current == null || previous == null || Math.abs(previous) <= 0) return null;
  return (current - previous) / Math.abs(previous);
}

function periodMetricCards(
  metrics: DailyBusinessMetric[],
  period: { currentStart: Date; currentEnd: Date; previousStart: Date; previousEnd: Date },
  locale: "zh" | "en",
  labels: { idPrefix: string; currentLabel: string; previousLabel: string }
) {
  return metrics.map((metric) => {
    const currentValue = metricWindowValue(metric, period.currentStart, period.currentEnd);
    const previousValue = metricWindowValue(metric, period.previousStart, period.previousEnd);
    const percentChange = changeRatio(currentValue, previousValue);
    const sampleSize = metricWindowSample(metric, period.currentStart, period.currentEnd);
    const ratingCaveat = metric.key === "rating"
      ? sampleSize >= 100
        ? ""
        : sampleSize >= 30
          ? (locale === "zh" ? "样本中等，仅作参考" : "Medium sample")
          : (locale === "zh" ? "样本较少，仅作观察" : "Small sample")
      : "";
    const returnLagCaveat = metric.key === "return_rate"
      ? (locale === "zh" ? "近期订单退货可能存在业务滞后，需结合后续退货记录观察。" : "Returns can lag for recent orders; monitor later return records.")
      : "";

    return {
      id: `${labels.idPrefix}-${metric.key}`,
      title: metric.label,
      summary: locale === "zh"
        ? `${labels.currentLabel}为 ${formatMetricNumber(currentValue)}，较${labels.previousLabel} ${formatPercent(percentChange) ?? "暂无可比变化"}。`
        : `${labels.currentLabel}: ${formatMetricNumber(currentValue)}, ${formatPercent(percentChange) ?? "not comparable"} versus ${labels.previousLabel}.`,
      targetObjects: [metric.label],
      keyEvidence: locale === "zh"
        ? `${labels.currentLabel}：${formatMetricNumber(currentValue)}；${labels.previousLabel}：${formatMetricNumber(previousValue)}；样本量：${sampleSize}`
        : `${labels.currentLabel}: ${formatMetricNumber(currentValue)}; ${labels.previousLabel}: ${formatMetricNumber(previousValue)}; sample size: ${sampleSize}`,
      businessJudgment: metric.definition,
      recommendedAction: metric.key === "return_rate"
        ? (locale === "zh" ? "近期订单退货可能存在业务滞后，需结合后续退货记录观察。" : "Returns can lag for recent orders; monitor later return records.")
        : ratingCaveat
          ? (locale === "zh" ? "评分样本未达到高置信阈值，先结合品类和商品评分分布观察。" : "Rating sample is below the high-confidence threshold; review category and product rating distribution.")
        : "",
      caveat: metric.isEstimated
        ? (locale === "zh" ? "估算值" : "Estimated")
        : ratingCaveat || returnLagCaveat,
      currentValue,
      previousValue,
      percentChange,
      metricKind: metric.key
    };
  });
}

function dailyMetricCards(metrics: DailyBusinessMetric[], latestDate: Date, locale: "zh" | "en") {
  const yesterday = addDays(latestDate, -1);
  const latestDateText = isoDate(latestDate);
  const yesterdayText = isoDate(yesterday);

  return metrics.map((metric) => {
    const todayValue = metricWindowValue(metric, latestDate, latestDate);
    const yesterdayValue = metricWindowValue(metric, yesterday, yesterday);
    const percentChange = changeRatio(todayValue, yesterdayValue);
    const sampleSize = metricWindowSample(metric, latestDate, latestDate);
    const ratingCaveat = metric.key === "rating"
      ? sampleSize >= 100
        ? ""
        : sampleSize >= 30
          ? (locale === "zh" ? "样本中等，仅作参考" : "Medium sample")
          : (locale === "zh" ? "样本较少，仅作观察" : "Small sample")
      : "";
    const returnLagCaveat = metric.key === "return_rate"
      ? (locale === "zh" ? "近期订单退货可能存在业务滞后，需结合后续退货记录观察。" : "Returns can lag for recent orders; monitor later return records.")
      : "";
    return {
      id: `daily-kpi-${metric.key}`,
      title: metric.label,
      summary: locale === "zh"
        ? `${latestDateText} 为 ${formatMetricNumber(todayValue)}，较 ${yesterdayText} ${formatPercent(percentChange) ?? "暂无可比变化"}。`
        : `${latestDateText}: ${formatMetricNumber(todayValue)}, ${formatPercent(percentChange) ?? "not comparable"} versus ${yesterdayText}.`,
      targetObjects: [metric.label],
      keyEvidence: locale === "zh"
        ? `今日：${formatMetricNumber(todayValue)}；昨日：${formatMetricNumber(yesterdayValue)}；样本量：${sampleSize}`
        : `Today: ${formatMetricNumber(todayValue)}; yesterday: ${formatMetricNumber(yesterdayValue)}; sample size: ${sampleSize}`,
      businessJudgment: metric.definition,
      recommendedAction: metric.key === "return_rate"
        ? (locale === "zh" ? "近期订单退货可能存在业务滞后，需结合后续退货记录观察。" : "Returns can lag for recent orders; monitor later return records.")
        : ratingCaveat
          ? (locale === "zh" ? "评分样本未达到高置信阈值，先结合品类和商品评分分布观察。" : "Rating sample is below the high-confidence threshold; review category and product rating distribution.")
        : "",
      caveat: metric.isEstimated
        ? (locale === "zh" ? "估算值" : "Estimated")
        : ratingCaveat || returnLagCaveat,
      currentValue: todayValue,
      previousValue: yesterdayValue,
      percentChange,
      metricKind: metric.key
    };
  });
}

function dailyYesterdayComparison(metrics: DailyBusinessMetric[], latestDate: Date, locale: "zh" | "en") {
  const cards = dailyMetricCards(metrics, latestDate, locale);
  const orders = cards.find((card) => card.metricKind === "orders");
  const revenue = cards.find((card) => card.metricKind === "revenue" || card.metricKind === "estimated_gmv");
  const aov = cards.find((card) => card.metricKind === "aov" || card.metricKind === "estimated_aov");
  const rating = cards.find((card) => card.metricKind === "rating");
  const returnRate = cards.find((card) => card.metricKind === "return_rate");
  const interpretations: string[] = [];

  if (orders?.percentChange != null && revenue?.percentChange != null && aov?.percentChange != null) {
    if (orders.percentChange < -0.02 && Math.abs(aov.percentChange) < 0.03) {
      interpretations.push(locale === "zh" ? "订单下降但客单价基本稳定，收入回落主要由订单量减少带动。" : "Orders fell while AOV stayed stable, so revenue softness is mainly volume-driven.");
    } else if (orders.percentChange > 0.02 && aov.percentChange < -0.02) {
      interpretations.push(locale === "zh" ? "订单增长但客单价下降，增长质量一般，可能来自低价商品、折扣订单或渠道结构变化。" : "Orders rose but AOV declined, suggesting lower-value orders, discounts, or channel mix changes.");
    } else if (revenue.percentChange > orders.percentChange + 0.03) {
      interpretations.push(locale === "zh" ? "收入增幅高于订单增幅，说明高价值订单或高客单品类贡献提升。" : "Revenue grew faster than orders, suggesting stronger high-value order or category contribution.");
    }
  }
  if (rating?.percentChange != null && rating.percentChange < -0.02) {
    interpretations.push(locale === "zh" ? "评分下降，需要检查商品质量、物流、售后或负面反馈是否集中。" : "Rating declined; check product quality, logistics, support, or negative-feedback concentration.");
  }
  if (returnRate?.percentChange != null && returnRate.percentChange > 0.1) {
    interpretations.push(locale === "zh" ? "退货率上升，需要优先查看退货原因、品类和渠道来源。" : "Return rate increased; review return reasons, categories, and channels first.");
  }

  return [{
    id: "daily-yesterday-comparison",
    title: locale === "zh" ? "今日 vs 昨日" : "Today vs Yesterday",
    summary: interpretations[0] ?? (locale === "zh" ? "今日核心指标已与昨日完成对比，暂无强异常信号。" : "Core metrics have been compared with yesterday; no strong abnormal signal yet."),
    keyEvidence: cards.map((card) => `${card.title}: ${formatMetricNumber(card.currentValue)} vs ${formatMetricNumber(card.previousValue)} (${formatPercent(card.percentChange) ?? "-"})`).join("；"),
    businessJudgment: interpretations.join(" ") || (locale === "zh" ? "优先关注订单、收入和客单价的组合变化，而不是单个指标排名。" : "Focus on the combined movement of orders, revenue, and AOV rather than a single ranking."),
    recommendedAction: locale === "zh" ? "优先拆解变化最大的指标，查看品类、渠道和地区来源。" : "Break down the largest-moving metric by category, channel, and market."
  }];
}

function sevenDayTrendCards(metrics: DailyBusinessMetric[], latestDate: Date, locale: "zh" | "en") {
  const sevenStart = addDays(latestDate, -6);
  const previousSevenEnd = addDays(sevenStart, -1);
  const previousSevenStart = addDays(previousSevenEnd, -6);

  return metrics.slice(0, 6).map((metric) => {
    const current = metricWindowValue(metric, sevenStart, latestDate);
    const previous = metricWindowValue(metric, previousSevenStart, previousSevenEnd);
    const percentChange = changeRatio(current, previous);
    const sampleSize = metricWindowSample(metric, sevenStart, latestDate);
    const lowSample = sampleSize < (metric.aggregation === "avg" ? 20 : 10);
    return {
      id: `daily-seven-day-${metric.key}`,
      title: locale === "zh" ? `${metric.label} 最近 7 天趋势` : `${metric.label} 7-day trend`,
      summary: locale === "zh"
        ? `最近 7 天为 ${formatMetricNumber(current)}，较前 7 天 ${formatPercent(percentChange) ?? "暂无可比变化"}。`
        : `Latest 7 days: ${formatMetricNumber(current)}, ${formatPercent(percentChange) ?? "not comparable"} versus previous 7 days.`,
      keyEvidence: locale === "zh"
        ? `${rangeLabel(sevenStart, latestDate, locale)}：${formatMetricNumber(current)}；${rangeLabel(previousSevenStart, previousSevenEnd, locale)}：${formatMetricNumber(previous)}；样本量：${sampleSize}`
        : `${rangeLabel(sevenStart, latestDate, locale)}: ${formatMetricNumber(current)}; ${rangeLabel(previousSevenStart, previousSevenEnd, locale)}: ${formatMetricNumber(previous)}; sample size: ${sampleSize}`,
      businessJudgment: dailySevenDayJudgment(metric.key, percentChange, metrics, latestDate, locale),
      recommendedAction: lowSample
        ? (locale === "zh" ? "近 7 天样本仍不足，继续累积数据后再判断趋势。" : "7-day sample is still limited; continue accumulating data before trend decisions.")
        : "",
      caveat: lowSample ? (locale === "zh" ? "样本不足" : "Limited sample") : "",
      currentValue: current,
      previousValue: previous,
      percentChange,
      metricKind: metric.key
    };
  });
}

function dailySevenDayJudgment(key: DailyBusinessMetricKey, percentChange: number | null, metrics: DailyBusinessMetric[], latestDate: Date, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const orders = metrics.find((metric) => metric.key === "orders");
  const revenue = metrics.find((metric) => metric.key === "revenue" || metric.key === "estimated_gmv");
  const aov = metrics.find((metric) => metric.key === "aov" || metric.key === "estimated_aov");
  const sevenStart = addDays(latestDate, -6);
  const previousSevenEnd = addDays(sevenStart, -1);
  const previousSevenStart = addDays(previousSevenEnd, -6);
  const orderChange = orders ? changeRatio(metricWindowValue(orders, sevenStart, latestDate), metricWindowValue(orders, previousSevenStart, previousSevenEnd)) : null;
  const revenueChange = revenue ? changeRatio(metricWindowValue(revenue, sevenStart, latestDate), metricWindowValue(revenue, previousSevenStart, previousSevenEnd)) : null;
  const aovChange = aov ? changeRatio(metricWindowValue(aov, sevenStart, latestDate), metricWindowValue(aov, previousSevenStart, previousSevenEnd)) : null;

  if ((key === "orders" || key === "revenue" || key === "estimated_gmv") && orderChange != null && revenueChange != null && aovChange != null) {
    if (orderChange > 0.02 && revenueChange > 0 && aovChange < -0.02) {
      return isZh
        ? `最近 7 天订单增长但客单价下滑，说明增长更多来自订单数量，而不是高价值订单提升。需要关注低价商品、促销活动或渠道结构变化。`
        : "Orders grew in the latest 7 days while AOV declined, suggesting volume-led growth rather than higher-value orders.";
    }
    if (revenueChange < -0.02 && aovChange < -0.02) {
      return isZh ? "收入和客单价同步下降，需要优先排查低价订单、折扣或高价值品类流失。" : "Revenue and AOV both declined; check low-priced orders, discounts, or high-value category loss.";
    }
  }

  if (key === "rating" && percentChange != null) {
    return percentChange < 0
      ? (isZh ? "评分变化只能作为用户体验信号，不能直接推导收入或增长结论。" : "Rating is a customer-experience signal and should not directly imply revenue or growth.")
      : (isZh ? "评分保持稳定时，可结合评论量和退货率判断体验是否真正改善。" : "When rating is stable, validate experience with review volume and return rate.");
  }

  if (key === "return_rate") {
    return isZh ? "退货率存在滞后，最新几天仅供参考，不应直接判断退货问题已改善。" : "Returns can lag; recent return rate should not be treated as final.";
  }

  return isZh ? "该变化基于最新 7 天与前 7 天对比，适合用于短期经营判断。" : "This compares latest 7 days with the previous 7 days for short-term operating judgment.";
}

function dimensionType(name: string) {
  const normalized = normalize(name);
  if (/category|product_type|品类|类别/.test(normalized)) return "category";
  if (/product|sku|item|商品|产品/.test(normalized)) return "product";
  if (/channel|traffic|source|utm|渠道|来源/.test(normalized)) return "channel";
  if (/country|region|market|state|province|city|国家|地区|市场/.test(normalized)) return "market";
  if (/segment|customer_type|tier|会员|分层|客群/.test(normalized)) return "segment";
  return "other";
}

type DailyDimensionType = "category" | "product" | "channel" | "market" | "segment";

function rowsFromGroupBys(aggregationResults: Array<Record<string, unknown>> = [], type: DailyDimensionType) {
  return aggregationResults.flatMap((aggregation) => {
    const groupBys = Array.isArray(aggregation.groupBys) ? aggregation.groupBys : [];
    return groupBys.flatMap((groupBy) => {
      const record = asRecord(groupBy);
      const dimension = String(record.dimension ?? record.title ?? "");
      if (dimensionType(dimension) !== type) return [];
      const rows = Array.isArray(record.rows) ? record.rows : [];
      return rows.map((row) => ({ dimension, row: asRecord(row) }));
    });
  });
}

function groupMetricValue(row: Record<string, unknown>, patterns: RegExp[]) {
  const entry = Object.entries(row).find(([key, value]) => patterns.some((pattern) => pattern.test(key)) && Number.isFinite(Number(value)));
  return entry ? Number(entry[1]) : null;
}

function groupName(row: Record<string, unknown>) {
  return String(row.dimension ?? row.name ?? row.category ?? row.channel ?? row.country ?? row.region ?? row.market ?? Object.values(row)[0] ?? "").trim();
}

function groupPerformanceCards(aggregationResults: Array<Record<string, unknown>> = [], type: DailyDimensionType, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const rows = rowsFromGroupBys(aggregationResults, type)
    .map(({ row }) => ({
      name: groupName(row),
      orders: groupMetricValue(row, [/order|records|count|订单|数量/i]),
      revenue: groupMetricValue(row, [/revenue|sales|gmv|amount|销售额|收入|成交/i]),
      aov: groupMetricValue(row, [/aov|average.*order|客单价/i]),
      rating: groupMetricValue(row, [/rating|score|评分/i]),
      returnRate: groupMetricValue(row, [/return|refund|退货|退款/i]),
      units: groupMetricValue(row, [/quantity|units|件数|销量/i])
    }))
    .filter((row) => row.name);

  if (!rows.length) return [];
  const scaleRows = rows.filter((row) => row.orders != null || row.revenue != null);
  const sortedByScale = [...scaleRows].sort((left, right) => Number(right.revenue ?? right.orders ?? 0) - Number(left.revenue ?? left.orders ?? 0));
  const top = sortedByScale.slice(0, 3);
  const totalScale = sortedByScale.reduce((sum, row) => sum + Number(row.revenue ?? row.orders ?? 0), 0);
  const top3Share = totalScale > 0 ? top.reduce((sum, row) => sum + Number(row.revenue ?? row.orders ?? 0), 0) / totalScale : null;
  const lowQuality = rows
    .filter((row) => (row.returnRate != null && row.returnRate > 0) || row.rating != null)
    .sort((left, right) => Number(right.returnRate ?? 0) - Number(left.returnRate ?? 0) || Number(left.rating ?? 5) - Number(right.rating ?? 5))
    .slice(0, 3);
  const noun = type === "category"
    ? (isZh ? "品类" : "categories")
    : type === "product"
      ? (isZh ? "商品" : "products")
    : type === "channel"
      ? (isZh ? "渠道" : "channels")
      : type === "segment"
        ? (isZh ? "客户分层" : "customer segments")
      : (isZh ? "市场" : "markets");
  const title = type === "category"
    ? (isZh ? "品类表现" : "Category Performance")
    : type === "product"
      ? (isZh ? "商品表现" : "Product Performance")
    : type === "channel"
      ? (isZh ? `${top[0]?.name ?? "当前渠道"} 是当前主要来源` : `${top[0]?.name ?? "Current channel"} is the main source`)
      : type === "segment"
        ? (isZh ? "客户分层表现" : "Customer Segment Performance")
      : (isZh ? "国家 / 地区表现" : "Market Performance");

  return [{
    id: `daily-${type}-performance`,
    title,
    summary: isZh
      ? `当前 Top 3 ${noun}为 ${top.map((row) => row.name).join("、") || "暂无"}。`
      : `Top ${noun}: ${top.map((row) => row.name).join(", ") || "none"}.`,
    targetObjects: top.map((row) => row.name),
    keyEvidence: top.map((row) => `${row.name}: ${formatMetricNumber(row.revenue ?? row.orders)}${row.rating != null ? `，评分 ${formatMetricNumber(row.rating)}` : ""}${row.returnRate != null ? `，退货率 ${formatPercent(row.returnRate) ?? formatMetricNumber(row.returnRate)}` : ""}`).join("；"),
    businessJudgment: type === "category"
      ? (isZh ? "样本量不足的品类不做强结论；评分较高的品类仍需结合评论量和退货率判断体验优势。" : "Avoid strong conclusions for low-sample categories; validate high ratings with review volume and return rate.")
      : type === "product"
        ? (isZh ? "商品表现需要同时看订单、净销售额、退货和评分，避免只按销量判断优劣。" : "Product performance should combine orders, net sales, returns, and rating rather than volume alone.")
        : type === "channel"
          ? (isZh ? "重点判断哪个渠道贡献最大、客单价最高，以及是否存在高退货率的低质量订单风险。" : "Focus on contribution, AOV, and whether high-return channels bring low-quality orders.")
          : type === "segment"
            ? (isZh ? "客户分层用于判断不同客群的贡献和质量差异，不用记录数替代客户数。" : "Customer segments show contribution and quality differences without substituting records for customers.")
            : (isZh ? "市场结论需要结合订单量、收入、退货率和评分；样本少的市场只继续观察。" : "Market conclusions should combine orders, revenue, return rate, and rating; low-sample markets should be monitored."),
    recommendedAction: lowQuality.length
      ? (isZh ? `优先查看 ${lowQuality.map((row) => row.name).join("、")} 的退货、评分和明细订单。` : `Review returns, rating, and order detail for ${lowQuality.map((row) => row.name).join(", ")}.`)
      : (isZh ? "继续按订单、收入、客单价、评分和退货率复核主要对象。" : "Continue reviewing top objects by orders, revenue, AOV, rating, and return rate."),
    caveat: top3Share != null && top3Share > 0.8 ? (isZh ? "样本集中" : "Concentrated sample") : ""
  }];
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%+,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rowChange(current?: number | null, previous?: number | null) {
  if (current == null || previous == null || Math.abs(previous) <= 0) return null;
  return (current - previous) / Math.abs(previous);
}

function dimensionComparisonType(metric: MetricResultLike): DailyDimensionType | null {
  const source = `${metric.metricName ?? ""} ${metric.displayName ?? ""} ${metric.formula ?? ""}`;
  const type = dimensionType(source);
  return type === "other" ? null : type as DailyDimensionType;
}

function dimensionComparisonMetricKind(metric: MetricResultLike): DimensionComparisonMetricKey | null {
  const source = `${metric.metricName ?? ""} ${metric.displayName ?? ""} ${metric.formula ?? ""}`.toLowerCase();
  if (/customer|客户/.test(source) && /count_distinct|customers|客户数/.test(source)) return "customers";
  if (/average_order_value|\baov\b|客单价/.test(source)) return "aov";
  if (/return|refund|退货|退款/.test(source) && /rate|ratio|率|safe_divide/.test(source)) return "returnRate";
  if (/average_rating|rating|review_score|score|评分/.test(source)) return "rating";
  if (/fulfillment|delivery|shipping|履约|配送|发货/.test(source) && /day|days|天/.test(source)) return "fulfillmentDays";
  if (/net_sales|net sales|净销售|revenue|sales/.test(source)) return "netSales";
  if (/orders|order_count|count_distinct.*order|订单/.test(source)) return "orders";
  return null;
}

function dimensionLabel(type: DailyDimensionType, locale: "zh" | "en") {
  const labels: Record<DailyDimensionType, [string, string]> = {
    category: ["品类", "Category"],
    product: ["商品", "Product"],
    channel: ["渠道", "Channel"],
    market: ["市场", "Market"],
    segment: ["客户分层", "Segment"]
  };
  return labels[type][locale === "zh" ? 0 : 1];
}

function rowDimensionName(row: Record<string, unknown>) {
  return String(row.dimension ?? row.dimension_value ?? row.name ?? row.category ?? row.product_id ?? row.channel ?? row.country ?? row.market ?? "").trim();
}

function applyDimensionMetric(
  row: DimensionComparisonRow,
  kind: DimensionComparisonMetricKey,
  current: number | null,
  previous: number | null
) {
  if (kind === "orders") {
    row.todayOrders = current;
    row.yesterdayOrders = previous;
    row.ordersChange = rowChange(current, previous);
  } else if (kind === "customers") {
    row.todayCustomers = current;
    row.yesterdayCustomers = previous;
    row.customersChange = rowChange(current, previous);
  } else if (kind === "netSales") {
    row.todayNetSales = current;
    row.yesterdayNetSales = previous;
    row.netSalesChange = rowChange(current, previous);
  } else if (kind === "aov") {
    row.todayAov = current;
    row.yesterdayAov = previous;
    row.aovChange = rowChange(current, previous);
  } else if (kind === "returnRate") {
    row.todayReturnRate = current;
    row.yesterdayReturnRate = previous;
    row.returnRateChange = rowChange(current, previous);
  } else if (kind === "rating") {
    row.todayRating = current;
    row.yesterdayRating = previous;
    row.ratingChange = rowChange(current, previous);
  } else if (kind === "fulfillmentDays") {
    row.todayFulfillmentDays = current;
    row.yesterdayFulfillmentDays = previous;
    row.fulfillmentDaysChange = rowChange(current, previous);
  }
}

function dimensionBusinessJudgment(row: DimensionComparisonRow, type: DailyDimensionType, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const smallSample = (row.todayOrders ?? 0) < 30 || (row.yesterdayOrders ?? 0) < 30;
  const ordersDown = (row.ordersChange ?? 0) < -0.03;
  const ordersUp = (row.ordersChange ?? 0) > 0.03;
  const salesDown = (row.netSalesChange ?? 0) < -0.03;
  const aovDown = (row.aovChange ?? 0) < -0.03;
  const aovStable = row.aovChange != null && Math.abs(row.aovChange) <= 0.03;
  const ratingDown = (row.ratingChange ?? 0) < -0.02;
  const ratingUp = (row.ratingChange ?? 0) > 0.02;
  const returnsUp = (row.returnRateChange ?? 0) > 0.1;
  const fulfillmentSlower = type === "market" && (row.fulfillmentDaysChange ?? 0) > 0.05;
  const prefix = smallSample
    ? (isZh ? "订单量较少，仅作观察。" : "Small sample; treat as directional. ")
    : "";

  if (fulfillmentSlower) return prefix + (isZh ? "履约效率变慢，可能影响客户体验和后续评分。" : "Fulfillment slowed and may affect customer experience and later ratings.");
  if (returnsUp) return prefix + (isZh ? "退货率高于昨日，需要排查商品描述、尺码、物流或售后原因。" : "Return rate rose versus yesterday; check product description, sizing, logistics, or support.");
  if (ordersDown && salesDown && aovStable) return prefix + (isZh ? "订单量回落是销售额下降的主要原因，客单价变化不大。" : "Sales decline is mainly volume-driven while AOV is broadly stable.");
  if (!ordersDown && salesDown && aovDown) return prefix + (isZh ? "收入回落主要来自客单价下降。" : "Revenue softness is mainly driven by lower AOV.");
  if (ordersUp && ratingDown) return prefix + (isZh ? "订单增长较快，但评分回落，需要关注体验和履约质量。" : "Orders grew, but rating declined; review experience and fulfillment quality.");
  if (ratingUp && (row.todayOrders ?? 0) < 30) return prefix + (isZh ? "体验表现较好，但规模仍小，可继续观察是否适合放量。" : "Experience looks positive, but scale remains small; monitor before scaling.");
  return prefix + (isZh ? "今日表现与昨日相比无明显单一异常，建议继续结合订单、收入、客单价和评分观察。" : "No single major movement versus yesterday; monitor orders, revenue, AOV, and rating together.");
}

function dimensionSummaries(table: DimensionComparisonTable, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const rows = table.rows;
  const topOrders = rows.find((row) => row.todayOrders != null);
  const salesDown = rows.find((row) => (row.netSalesChange ?? 0) < -0.05);
  const ratingLow = [...rows].filter((row) => row.todayRating != null).sort((left, right) => Number(left.todayRating ?? 5) - Number(right.todayRating ?? 5))[0];
  return [
    topOrders ? (isZh
      ? `${topOrders.name} 今日订单最高${topOrders.ordersChange != null ? `，较昨日 ${formatPercent(topOrders.ordersChange)}` : "，昨日无可比数据"}。`
      : `${topOrders.name} has the highest orders today${topOrders.ordersChange != null ? `, ${formatPercent(topOrders.ordersChange)} versus yesterday` : ", with no comparable yesterday data"}.`) : "",
    salesDown ? (isZh
      ? `${salesDown.name} 净销售额较昨日回落，优先判断变化来自订单量还是客单价。`
      : `${salesDown.name} net sales fell versus yesterday; check whether volume or AOV drove it.`) : "",
    ratingLow ? (isZh
      ? `${ratingLow.name} 评分在当前${table.label}中偏低，建议结合评论、退货和履约记录进一步查看。`
      : `${ratingLow.name} has a lower rating within ${table.label}; review feedback, returns, and fulfillment.`) : ""
  ].filter(Boolean).slice(0, 3);
}

function metricCard(cards: ReturnType<typeof dailyMetricCards>, kind: DailyBusinessMetricKey) {
  return cards.find((card) => card.metricKind === kind);
}

function evidenceLine(card: ReturnType<typeof dailyMetricCards>[number] | undefined, label?: string) {
  if (!card) return "";
  return `${label ?? card.title} ${formatMetricNumber(card.currentValue)} vs ${formatMetricNumber(card.previousValue)}，${formatPercent(card.percentChange) ?? "昨日无可比数据"}`;
}

function dailyKeyFindings(input: {
  kpis: ReturnType<typeof dailyMetricCards>;
  dimensionComparisons: DimensionComparisonTable[];
  locale: "zh" | "en";
}) {
  const isZh = input.locale === "zh";
  const cards = input.kpis;
  const revenue = metricCard(cards, "revenue") ?? metricCard(cards, "estimated_gmv");
  const orders = metricCard(cards, "orders");
  const customers = metricCard(cards, "customers");
  const aov = metricCard(cards, "aov") ?? metricCard(cards, "estimated_aov");
  const units = metricCard(cards, "units");
  const rating = metricCard(cards, "rating");
  const fulfillment = metricCard(cards, "fulfillment_days");
  const returnRate = metricCard(cards, "return_rate");
  const findings: Array<Record<string, unknown>> = [];
  const revenueDown = (revenue?.percentChange ?? 0) < -0.02;
  const revenueUp = (revenue?.percentChange ?? 0) > 0.02;
  const ordersDown = (orders?.percentChange ?? 0) < -0.02;
  const ordersUp = (orders?.percentChange ?? 0) > 0.02;
  const aovDown = (aov?.percentChange ?? 0) < -0.02;
  const aovStable = aov?.percentChange != null && Math.abs(aov.percentChange) <= 0.02;
  const ratingDown = (rating?.percentChange ?? 0) < -0.01;
  const fulfillmentSlower = (fulfillment?.percentChange ?? 0) > 0.02;
  const unitsDown = (units?.percentChange ?? 0) < -0.02;

  if (revenue) {
    let title = isZh ? "今日收入出现变化，需要拆解订单量和客单价来源" : "Revenue moved today; break down order volume and AOV";
    let summary = isZh ? "收入变化需要结合订单数和客单价判断，不能只看销售额本身。" : "Revenue movement should be read together with orders and AOV.";
    let judgment = isZh ? "当前收入变化可能来自订单规模、单笔订单价值或品类结构变化。" : "The revenue movement may come from volume, order value, or category mix.";
    if (revenueDown && ordersDown && aovDown) {
      title = isZh ? "今日收入下滑，订单数和客单价共同拖累" : "Revenue declined, dragged by both orders and AOV";
      summary = isZh ? "净销售额回落不是单一因素造成的，订单规模减少和单笔订单价值下降同时发生。" : "The decline is not single-factor: both order volume and order value moved down.";
      judgment = isZh ? "收入下降不是单一因素造成的，而是订单规模减少和单笔订单价值下降共同影响。" : "Revenue decline is jointly driven by lower order scale and lower value per order.";
    } else if (revenueDown && !ordersDown && aovDown) {
      title = isZh ? "今日收入下滑，主要来自客单价下降" : "Revenue declined mainly because AOV fell";
      summary = isZh ? "订单规模没有明显同步下滑，收入压力更多来自单笔订单价值下降。" : "Order scale did not fall materially; pressure is more about lower value per order.";
      judgment = isZh ? "可能是低价商品占比提升、折扣加深或高客单品类贡献下降。" : "Possible causes include lower-priced mix, deeper discounts, or weaker high-AOV categories.";
    } else if (revenueDown && ordersDown && aovStable) {
      title = isZh ? "今日收入回落主要来自订单量减少" : "Revenue softened mainly because orders fell";
      summary = isZh ? "客单价基本稳定，收入下降更可能来自流量、转化或库存侧变化。" : "AOV is broadly stable, so revenue softness is more likely volume-led.";
      judgment = isZh ? "需要优先确认是访问/流量减少、转化下降，还是主力商品供给不足。" : "Prioritize checking traffic, conversion, or availability of key products.";
    } else if (revenueUp && ordersUp && aovDown) {
      title = isZh ? "订单增长但客单价下降，增长质量需要复核" : "Orders grew while AOV fell; growth quality needs review";
      summary = isZh ? "订单规模扩大，但新增订单可能更多来自低客单价商品或促销订单。" : "Order scale improved, but new orders may be lower-value or promotion-led.";
      judgment = isZh ? "增长不一定代表收入质量同步改善，需要看品类和渠道结构。" : "Growth may not mean better revenue quality; inspect category and channel mix.";
    }
    findings.push({
      id: "daily-finding-revenue",
      caveat: "High",
      title,
      summary,
      keyEvidence: [evidenceLine(revenue, isZh ? "净销售额" : "Net Sales"), evidenceLine(orders, isZh ? "订单数" : "Orders"), evidenceLine(aov, isZh ? "客单价" : "AOV")].filter(Boolean).join("；"),
      businessJudgment: judgment,
      recommendedAction: isZh ? "优先按品类、渠道和市场拆解订单数与客单价变化，定位是流量下降、转化下降，还是低价商品占比提升。" : "Break down order and AOV movement by category, channel, and market to locate traffic, conversion, or low-price mix effects."
    });
  }

  if (orders || customers) {
    findings.push({
      id: "daily-finding-order-customer",
      caveat: "Medium",
      title: ordersDown
        ? (isZh ? "订单规模回落，需要判断是客户量还是转化问题" : "Order scale fell; identify customer volume versus conversion")
        : ordersUp
          ? (isZh ? "订单规模增长，需要确认新增订单质量" : "Order scale grew; validate new-order quality")
          : (isZh ? "订单规模相对稳定，需结合客户数判断需求质量" : "Order scale is stable; use customers to assess demand quality"),
      summary: isZh ? "订单和客户数共同决定今日规模变化，二者背离时需要进一步看转化和复购。" : "Orders and customers jointly explain daily scale; divergence points to conversion or repeat behavior.",
      keyEvidence: [evidenceLine(orders, isZh ? "订单数" : "Orders"), evidenceLine(customers, isZh ? "客户数" : "Customers")].filter(Boolean).join("；"),
      businessJudgment: ordersDown
        ? (isZh ? "订单减少可能来自流量下降、转化降低、主力品类供给不足或促销结束。" : "Lower orders may reflect traffic decline, weaker conversion, supply gaps, or promotion ending.")
        : (isZh ? "如果客户数与订单数变化不同步，需要进一步区分新增客户、回访客户和高价值客户贡献。" : "If customer and order movements diverge, separate new, returning, and high-value customer contributions."),
      recommendedAction: isZh ? "查看客户分层中的 New、Returning、VIP 和 At Risk，对比客户数、净销售额、客单价、评分和退货率。" : "Compare New, Returning, VIP, and At Risk segments by customers, net sales, AOV, rating, and return rate."
    });
  }

  if (units || aov) {
    findings.push({
      id: "daily-finding-basket",
      caveat: unitsDown || aovDown ? "Medium" : "Low",
      title: unitsDown
        ? (isZh ? "销售件数下降，购买规模同步收缩" : "Units sold fell, indicating smaller purchase scale")
        : aovDown
          ? (isZh ? "客单价下降，单笔购买价值承压" : "AOV fell, pressuring value per order")
          : (isZh ? "购买件数和客单价需要联合观察" : "Units and AOV should be monitored together"),
      summary: isZh ? "销售件数和客单价可以判断用户是少买了，还是买得更便宜。" : "Units and AOV show whether customers bought fewer items or lower-value baskets.",
      keyEvidence: [evidenceLine(units, isZh ? "销售件数" : "Units Sold"), evidenceLine(aov, isZh ? "客单价" : "AOV")].filter(Boolean).join("；"),
      businessJudgment: unitsDown
        ? (isZh ? "销售件数下降幅度如果大于订单数，说明单笔订单中的购买件数可能减少。" : "If units fall faster than orders, basket size is likely shrinking.")
        : (isZh ? "客单价变化需要结合品类结构、折扣和组合购买判断。" : "AOV movement should be read with category mix, discounts, and bundling."),
      recommendedAction: isZh ? "检查组合购买、加购商品和高订单品类的客单价变化，重点看 Food & Beverage、Beauty & Personal Care 等主力品类。" : "Review bundles, add-ons, and AOV movement in high-order categories."
    });
  }

  if (rating || fulfillment || returnRate) {
    findings.push({
      id: "daily-finding-experience",
      caveat: ratingDown && fulfillmentSlower ? "Medium" : "Low",
      title: ratingDown && fulfillmentSlower
        ? (isZh ? "评分下降且履约变慢，体验指标需要观察" : "Rating declined while fulfillment slowed; monitor experience risk")
        : ratingDown
          ? (isZh ? "平均评分下降，需要排查体验问题" : "Average rating declined; inspect experience issues")
          : fulfillmentSlower
            ? (isZh ? "履约天数上升，可能影响后续评分" : "Fulfillment days increased and may affect later ratings")
            : (isZh ? "体验指标整体需结合评分、履约和退货判断" : "Experience should combine rating, fulfillment, and returns"),
      summary: isZh ? "评分、履约和退货率同时决定用户体验风险，单独看评分容易漏掉履约滞后。" : "Rating, fulfillment, and returns together define experience risk.",
      keyEvidence: [evidenceLine(rating, isZh ? "平均客户评分" : "Average Rating"), evidenceLine(fulfillment, isZh ? "平均履约天数" : "Fulfillment Days"), evidenceLine(returnRate, isZh ? "退货率" : "Return Rate")].filter(Boolean).join("；"),
      businessJudgment: ratingDown && fulfillmentSlower
        ? (isZh ? "评分下降和履约变慢同时出现，可能说明部分订单体验变差。" : "Rating decline and slower fulfillment together suggest worsening experience in part of orders.")
        : (isZh ? "体验指标短期波动需要拆到品类、商品和市场，避免把全局均值当作原因。" : "Short-term experience movement should be broken down by category, product, and market."),
      recommendedAction: isZh ? "查看评分下降明显的品类、履约变慢的市场，以及是否存在延迟发货、物流异常或售后集中问题。" : "Check categories with rating declines, markets with slower fulfillment, and delayed shipping or support clusters."
    });
  }

  const categoryTable = input.dimensionComparisons.find((table) => table.type === "category");
  const categoryRows = categoryTable?.rows ?? [];
  const topCategories = categoryRows.slice(0, 3);
  if (topCategories.length) {
    const lowAovHighOrders = categoryRows.find((row) => (row.todayOrders ?? 0) >= 100 && row.todayAov != null && row.todayAov < 35);
    const lowRating = [...categoryRows].filter((row) => row.todayRating != null).sort((left, right) => Number(left.todayRating) - Number(right.todayRating))[0];
    findings.push({
      id: "daily-finding-category-structure",
      caveat: lowAovHighOrders || lowRating ? "Medium" : "Low",
      title: lowAovHighOrders
        ? (isZh ? `${lowAovHighOrders.name} 订单量高但客单价偏低` : `${lowAovHighOrders.name} has high order volume but lower AOV`)
        : (isZh ? `${topCategories[0].name} 是今日订单主力，但仍需看收入质量` : `${topCategories[0].name} leads orders today, but revenue quality needs review`),
      summary: isZh ? "品类结构能解释收入变化来自订单规模、客单价还是体验差异。" : "Category mix explains whether movement came from volume, AOV, or experience differences.",
      keyEvidence: topCategories.map((row) => `${row.name}：订单 ${formatMetricNumber(row.todayOrders)} vs ${formatMetricNumber(row.yesterdayOrders)}，净销售额 ${formatMetricNumber(row.todayNetSales)} vs ${formatMetricNumber(row.yesterdayNetSales)}，客单价 ${formatMetricNumber(row.todayAov)} vs ${formatMetricNumber(row.yesterdayAov)}，评分 ${formatMetricNumber(row.todayRating)}`).join("；"),
      businessJudgment: lowAovHighOrders
        ? (isZh ? "该品类贡献订单规模，但单笔订单价值偏低，适合用组合包、加购或满减提升订单价值。" : "This category brings order scale but lower value per order; bundles, add-ons, or threshold offers may lift AOV.")
        : lowRating
          ? (isZh ? `${lowRating.name} 评分在主力品类中偏低，需要结合评论和退货记录判断是否拖累体验。` : `${lowRating.name} has lower rating among key categories; inspect reviews and returns.`)
          : (isZh ? "主力品类决定今日订单规模，需要继续比较净销售额、客单价和评分。" : "Key categories drive order scale; continue comparing net sales, AOV, and rating."),
      recommendedAction: isZh ? "对主力品类分别拆解商品、渠道和市场，优先定位高订单低客单价、评分偏低或净销售额回落的组合。" : "Break key categories down by product, channel, and market; prioritize high-order low-AOV, low-rating, or declining-sales combinations."
    });
  }

  const segmentTable = input.dimensionComparisons.find((table) => table.type === "segment");
  const segmentRows = segmentTable?.rows ?? [];
  if (segmentRows.length) {
    const topSegment = [...segmentRows].sort((left, right) => Number(right.todayCustomers ?? right.todayOrders ?? 0) - Number(left.todayCustomers ?? left.todayOrders ?? 0))[0];
    findings.push({
      id: "daily-finding-segment-quality",
      caveat: "Low",
      title: isZh ? `${topSegment.name} 用户规模较高，但需要确认客户质量` : `${topSegment.name} has high scale; validate customer quality`,
      summary: isZh ? "客户分层不仅要看人数，还要看净销售额、客单价、评分和退货率。" : "Customer segments should be read by customer count, net sales, AOV, rating, and return rate.",
      keyEvidence: `${topSegment.name}：客户数 ${formatMetricNumber(topSegment.todayCustomers)} vs ${formatMetricNumber(topSegment.yesterdayCustomers)}，订单 ${formatMetricNumber(topSegment.todayOrders)} vs ${formatMetricNumber(topSegment.yesterdayOrders)}，净销售额 ${formatMetricNumber(topSegment.todayNetSales)} vs ${formatMetricNumber(topSegment.yesterdayNetSales)}，客单价 ${formatMetricNumber(topSegment.todayAov)} vs ${formatMetricNumber(topSegment.yesterdayAov)}`,
      businessJudgment: isZh ? "规模较高不等于高质量，需要确认该客群是否带来更高客单价、更低退货率和更稳定评分。" : "Scale does not equal quality; validate whether the segment brings higher AOV, lower returns, and stable rating.",
      recommendedAction: isZh ? "比较 New、Returning、VIP 和 At Risk 的净销售额、客单价、评分和退货率，判断新增质量和复购质量。" : "Compare New, Returning, VIP, and At Risk by net sales, AOV, rating, and return rate."
    });
  }

  return findings.slice(0, 6);
}

function buildDailyDimensionComparisons(metricResults: MetricResultLike[] = [], locale: "zh" | "en"): DimensionComparisonTable[] {
  const byType = new Map<DailyDimensionType, Map<string, DimensionComparisonRow>>();
  const allowedTypes: DailyDimensionType[] = ["category", "product", "channel", "market", "segment"];

  for (const metric of metricResults) {
    if (metric.status && metric.status !== "computed") continue;
    if (String(metric.dateRangePreset ?? "").toUpperCase() === "ALL") continue;
    const type = dimensionComparisonType(metric);
    const kind = dimensionComparisonMetricKind(metric);
    const rows = Array.isArray(metric.rows) ? metric.rows : [];
    if (!type || !kind || !rows.length) continue;
    if (type !== "segment" && kind === "customers") continue;

    const tableRows = byType.get(type) ?? new Map<string, DimensionComparisonRow>();
    for (const rawRow of rows) {
      const record = asRecord(rawRow);
      const name = rowDimensionName(record);
      if (!name) continue;
      const row = tableRows.get(name) ?? {
        id: `${type}-${normalize(name)}`,
        name,
        sampleSmall: false,
        businessJudgment: ""
      };
      applyDimensionMetric(row, kind, numericValue(record.value), numericValue(record.previousValue));
      row.sampleSmall = (row.todayOrders ?? 0) < 30 || (row.yesterdayOrders ?? 0) < 30;
      tableRows.set(name, row);
    }
    byType.set(type, tableRows);
  }

  return allowedTypes.flatMap((type) => {
    const rows = Array.from(byType.get(type)?.values() ?? [])
      .map((row) => {
        const todayAov = row.todayAov ?? ((row.todayNetSales != null && row.todayOrders && row.todayOrders > 0) ? row.todayNetSales / row.todayOrders : null);
        const yesterdayAov = row.yesterdayAov ?? ((row.yesterdayNetSales != null && row.yesterdayOrders && row.yesterdayOrders > 0) ? row.yesterdayNetSales / row.yesterdayOrders : null);
        const hydrated = {
          ...row,
          todayAov,
          yesterdayAov,
          aovChange: row.aovChange ?? rowChange(todayAov, yesterdayAov)
        };
        return {
          ...hydrated,
          sampleSmall: (hydrated.todayOrders ?? 0) < 30 || (hydrated.yesterdayOrders ?? 0) < 30,
          businessJudgment: dimensionBusinessJudgment(hydrated, type, locale)
        };
      })
      .sort((left, right) => Number(right.todayOrders ?? right.todayNetSales ?? 0) - Number(left.todayOrders ?? left.todayNetSales ?? 0))
      .slice(0, 10);
    if (!rows.length) return [];
    const table: DimensionComparisonTable = {
      id: `daily-dimension-${type}`,
      type,
      label: dimensionLabel(type, locale),
      rows,
      summaries: []
    };
    return [{ ...table, summaries: dimensionSummaries(table, locale) }];
  });
}

function weeklyizeComparisonText(value: string, locale: "zh" | "en") {
  if (locale !== "zh") {
    return value
      .replace(/\btoday\b/gi, "the latest 7 days")
      .replace(/\byesterday\b/gi, "the previous 7 days");
  }

  return value
    .replace(/今日/g, "最近 7 天")
    .replace(/当天/g, "最近 7 天")
    .replace(/昨日/g, "前 7 天");
}

function monthlyizeComparisonText(value: string, locale: "zh" | "en") {
  if (locale !== "zh") {
    return value
      .replace(/\btoday\b/gi, "this month")
      .replace(/\byesterday\b/gi, "last month")
      .replace(/\bthe latest 7 days\b/gi, "this month")
      .replace(/\bthe previous 7 days\b/gi, "last month");
  }

  return value
    .replace(/最近 7 天/g, "本月")
    .replace(/前 7 天/g, "上月")
    .replace(/今日/g, "本月")
    .replace(/当天/g, "本月")
    .replace(/昨日/g, "上月")
    .replace(/周度/g, "月度")
    .replace(/周报/g, "月经营分析")
    .replace(/下周/g, "下月");
}

function buildWeeklyDimensionComparisons(metricResults: MetricResultLike[] = [], locale: "zh" | "en") {
  return buildDailyDimensionComparisons(metricResults, locale).map((table) => ({
    ...table,
    id: table.id.replace("daily-", "weekly-"),
    rows: table.rows.map((row) => ({
      ...row,
      businessJudgment: weeklyizeComparisonText(row.businessJudgment ?? "", locale)
    })),
    summaries: table.summaries.map((summary) => weeklyizeComparisonText(summary, locale))
  }));
}

function buildMonthlyDimensionComparisons(metricResults: MetricResultLike[] = [], locale: "zh" | "en") {
  return buildDailyDimensionComparisons(metricResults, locale).map((table) => ({
    ...table,
    id: table.id.replace("daily-", "monthly-"),
    rows: table.rows.map((row) => ({
      ...row,
      businessJudgment: monthlyizeComparisonText(row.businessJudgment ?? "", locale)
    })),
    summaries: table.summaries.map((summary) => monthlyizeComparisonText(summary, locale))
  }));
}

function weeklyKeyFindings(input: {
  kpis: ReturnType<typeof periodMetricCards>;
  dimensionComparisons: DimensionComparisonTable[];
  locale: "zh" | "en";
}) {
  const isZh = input.locale === "zh";
  const revenue = metricCard(input.kpis, "revenue") ?? metricCard(input.kpis, "estimated_gmv");
  const orders = metricCard(input.kpis, "orders");
  const customers = metricCard(input.kpis, "customers");
  const aov = metricCard(input.kpis, "aov") ?? metricCard(input.kpis, "estimated_aov");
  const units = metricCard(input.kpis, "units");
  const rating = metricCard(input.kpis, "rating");
  const fulfillment = metricCard(input.kpis, "fulfillment_days");
  const returnRate = metricCard(input.kpis, "return_rate");
  const findings: Array<Record<string, unknown>> = [];
  const revenueDown = (revenue?.percentChange ?? 0) < -0.02;
  const revenueUp = (revenue?.percentChange ?? 0) > 0.02;
  const ordersDown = (orders?.percentChange ?? 0) < -0.02;
  const ordersUp = (orders?.percentChange ?? 0) > 0.02;
  const aovDown = (aov?.percentChange ?? 0) < -0.02;
  const ratingDown = (rating?.percentChange ?? 0) < -0.01;
  const fulfillmentSlower = (fulfillment?.percentChange ?? 0) > 0.02;
  const returnRateUp = (returnRate?.percentChange ?? 0) > 0.1;

  if (revenue) {
    findings.push({
      id: "weekly-finding-revenue",
      caveat: revenueDown ? "High" : "Medium",
      title: revenueDown
        ? (isZh ? "最近 7 天收入较前 7 天回落，需要拆解订单量和客单价来源" : "Latest 7-day revenue fell; break down order volume and AOV")
        : revenueUp
          ? (isZh ? "最近 7 天收入较前 7 天增长，需要判断增长质量" : "Latest 7-day revenue grew; validate growth quality")
          : (isZh ? "最近 7 天收入相对稳定，继续观察结构变化" : "Latest 7-day revenue is stable; monitor mix changes"),
      summary: revenueUp && ordersUp && aovDown
        ? (isZh ? "收入增长主要由订单量带动，但客单价下降说明增长质量仍需关注。" : "Revenue growth is volume-led, but lower AOV means growth quality still needs attention.")
        : revenueDown && ordersDown
          ? (isZh ? "收入下滑与订单规模回落同步，需要优先判断需求、转化或渠道流量变化。" : "Revenue decline moved with order softness; inspect demand, conversion, or channel traffic.")
          : (isZh ? "周度收入变化需要结合订单数、客户数和客单价共同判断。" : "Weekly revenue movement should be read with orders, customers, and AOV."),
      keyEvidence: [evidenceLine(revenue, isZh ? "净销售额" : "Net Sales"), evidenceLine(orders, isZh ? "订单数" : "Orders"), evidenceLine(aov, isZh ? "客单价" : "AOV")].filter(Boolean).join("；"),
      businessJudgment: revenueUp && ordersUp && aovDown
        ? (isZh ? "最近 7 天规模在扩大，但新增订单可能更多来自低客单价商品、促销或渠道结构变化。" : "Scale expanded, but new orders may be lower-value, promotion-led, or channel-mix driven.")
        : (isZh ? "周报应优先判断变化来自订单量、客单价、客户数还是品类 / 渠道结构。" : "The weekly report should identify whether movement came from orders, AOV, customers, or category/channel mix."),
      recommendedAction: isZh ? "优先按品类、渠道和市场拆解 Net Sales、Orders 和 AOV，定位下周需要放大或修正的对象。" : "Break down Net Sales, Orders, and AOV by category, channel, and market to identify next-week focus."
    });
  }

  if (orders || customers || units) {
    findings.push({
      id: "weekly-finding-scale",
      caveat: ordersDown ? "Medium" : "Low",
      title: ordersDown
        ? (isZh ? "订单规模较前 7 天下降，需要判断流量或转化问题" : "Orders declined versus the previous 7 days; inspect traffic or conversion")
        : (isZh ? "订单、客户和销售件数共同决定周度规模质量" : "Orders, customers, and units define weekly scale quality"),
      summary: isZh ? "订单数、客户数和销售件数可以区分是买家变少、订单变少，还是单笔购买规模变化。" : "Orders, customers, and units distinguish fewer buyers, fewer orders, or smaller baskets.",
      keyEvidence: [evidenceLine(orders, isZh ? "订单数" : "Orders"), evidenceLine(customers, isZh ? "客户数" : "Customers"), evidenceLine(units, isZh ? "销售件数" : "Units Sold")].filter(Boolean).join("；"),
      businessJudgment: isZh ? "如果客户数下降但客单价稳定，下周应优先看获客和转化；如果件数下降，则需要看组合购买和加购。" : "If customers fell but AOV stayed stable, focus acquisition and conversion; if units fell, review bundles and add-ons.",
      recommendedAction: isZh ? "按客户分层比较 New、Returning、VIP 的客户数、订单数、净销售额和客单价。" : "Compare New, Returning, and VIP by customers, orders, net sales, and AOV."
    });
  }

  if (rating || fulfillment || returnRate) {
    findings.push({
      id: "weekly-finding-experience",
      caveat: ratingDown || fulfillmentSlower || returnRateUp ? "Medium" : "Low",
      title: ratingDown && fulfillmentSlower
        ? (isZh ? "评分下降且履约变慢，周度体验风险需要观察" : "Rating fell while fulfillment slowed; monitor weekly experience risk")
        : returnRateUp
          ? (isZh ? "退货率较前 7 天上升，需要排查高风险对象" : "Return rate rose versus previous 7 days; inspect risk clusters")
          : (isZh ? "体验指标需要结合评分、退货和履约共同判断" : "Experience should combine rating, returns, and fulfillment"),
      summary: isZh ? "周度体验风险通常不是单日波动，需要看是否集中在品类、商品、渠道或市场。" : "Weekly experience risk is usually not a one-day movement; inspect concentration by category, product, channel, or market.",
      keyEvidence: [evidenceLine(rating, isZh ? "平均客户评分" : "Average Rating"), evidenceLine(fulfillment, isZh ? "平均履约天数" : "Fulfillment Days"), evidenceLine(returnRate, isZh ? "退货率" : "Return Rate")].filter(Boolean).join("；"),
      businessJudgment: fulfillmentSlower
        ? (isZh ? "履约天数上升代表变慢，可能影响后续评分和复购。" : "Higher fulfillment days means slower delivery and may affect later ratings and repeat purchase.")
        : (isZh ? "评分和退货率需要与订单规模一起看，避免把低样本对象误判为主要风险。" : "Read rating and returns with order scale to avoid over-weighting low-sample objects."),
      recommendedAction: isZh ? "下周优先查看评分下降、退货率上升或履约变慢的品类 / 市场明细订单。" : "Next week, inspect categories or markets with rating decline, higher returns, or slower fulfillment."
    });
  }

  const categoryRows = input.dimensionComparisons.find((table) => table.type === "category")?.rows ?? [];
  const topGrowthCategory = [...categoryRows].filter((row) => (row.netSalesChange ?? 0) > 0.05).sort((left, right) => Number(right.netSalesChange ?? 0) - Number(left.netSalesChange ?? 0))[0];
  const riskyCategory = [...categoryRows].filter((row) => (row.returnRateChange ?? 0) > 0.1 || (row.ratingChange ?? 0) < -0.02).sort((left, right) => Number(right.todayOrders ?? 0) - Number(left.todayOrders ?? 0))[0];
  if (topGrowthCategory || riskyCategory || categoryRows.length) {
    const lead = topGrowthCategory ?? riskyCategory ?? categoryRows[0];
    findings.push({
      id: "weekly-finding-category",
      caveat: riskyCategory ? "Medium" : "Low",
      title: riskyCategory
        ? (isZh ? `${riskyCategory.name} 存在周度体验或退货风险` : `${riskyCategory.name} shows weekly experience or return risk`)
        : (isZh ? `${lead.name} 是最近 7 天需要重点复盘的品类` : `${lead.name} is a key category to review this week`),
      summary: isZh ? "品类结构能解释周度增长来自哪个业务对象，也能定位增长背后的质量风险。" : "Category mix explains where weekly growth came from and whether quality risk sits behind it.",
      keyEvidence: `${lead.name}：订单 ${formatMetricNumber(lead.todayOrders)} vs ${formatMetricNumber(lead.yesterdayOrders)}，净销售额 ${formatMetricNumber(lead.todayNetSales)} vs ${formatMetricNumber(lead.yesterdayNetSales)}，客单价 ${formatMetricNumber(lead.todayAov)} vs ${formatMetricNumber(lead.yesterdayAov)}，评分 ${formatMetricNumber(lead.todayRating)}`,
      businessJudgment: riskyCategory
        ? (isZh ? "如果品类增长同时伴随退货或评分风险，下周不应只放大投放，还要排查商品描述、尺码、物流或售后原因。" : "If category growth comes with return or rating risk, do not only scale acquisition; inspect description, sizing, logistics, or support.")
        : (isZh ? "高增长品类需要继续判断是否具备低退货、稳定评分和可持续供给。" : "High-growth categories should be validated for low returns, stable rating, and sustainable supply."),
      recommendedAction: isZh ? "下周对该品类继续拆商品、渠道和市场，找出可放大的组合与需要修正的风险点。" : "Next week, break this category down by product, channel, and market to identify scalable combinations and risks."
    });
  }

  return findings.slice(0, 6);
}

function dataCaveatsForDaily(input: {
  metrics: DailyBusinessMetric[];
  aggregationResults?: Array<Record<string, unknown>>;
  reportDataAudit?: ReportDataAudit | null;
  latestDate: Date;
  generatedAt: Date;
  locale: "zh" | "en";
  baseCaveats: Array<Record<string, unknown>>;
}) {
  const isZh = input.locale === "zh";
  const hasEstimatedGmv = input.metrics.some((metric) => metric.key === "estimated_gmv" || metric.key === "estimated_aov");
  const hasRevenue = input.metrics.some((metric) => metric.key === "revenue");
  const hasReturnRate = input.metrics.some((metric) => metric.key === "return_rate");
  const latestAgeDays = Math.max(0, Math.round(((input.generatedAt.getTime() - input.latestDate.getTime()) / 86_400_000)));
  const audit = input.reportDataAudit;
  const concentration = ["category", "channel", "market"].some((type) =>
    groupPerformanceCards(input.aggregationResults, type as "category" | "channel" | "market", input.locale)
      .some((card) => String(card.caveat).includes(isZh ? "样本集中" : "Concentrated"))
  );
  const caveats = [
    audit ? {
      id: "report-data-scope",
      title: isZh ? "数据读取口径" : "Data scope",
      keyEvidence: isZh
        ? `全量数据记录数：${audit.totalRows ?? "未知"}；数据最新日期：${audit.latestDataDate ?? "-"}；今日订单记录数：${audit.dailyRows ?? "未知"}；用于计算的记录数：${audit.rowsUsedForMetrics ?? "未知"}；字段识别样本行数：${audit.sampleRowsCount ?? 0}。`
        : `Full-data rows: ${audit.totalRows ?? "unknown"}; latest data date: ${audit.latestDataDate ?? "-"}; latest-day order rows: ${audit.dailyRows ?? "unknown"}; rows used for metrics: ${audit.rowsUsedForMetrics ?? "unknown"}; field-detection sample rows: ${audit.sampleRowsCount ?? 0}.`,
      businessJudgment: audit.usesFullData
        ? (isZh ? "本报告基于完整数据读取结果生成。" : "This report is generated from full data.")
        : (isZh ? "当前仅基于样本数据生成，不能代表完整业务表现。" : "This report is based on sample data only and does not represent full business performance."),
      recommendedAction: audit.usesFullData ? "" : (isZh ? "请确认完整文件路径或真实存储对象可读取后重新生成。" : "Make the full file or storage object readable, then regenerate.")
    } : null,
    hasEstimatedGmv ? {
      id: "estimated-gmv-daily",
      title: isZh ? "估算值提示" : "Estimated value note",
      keyEvidence: isZh ? "Estimated GMV 是基于价格和数量计算的估算成交规模。" : "Estimated GMV is calculated from price and quantity.",
      businessJudgment: isZh ? "不等同于真实支付收入、利润或现金流。" : "It is not actual paid revenue, profit, or cash flow.",
      recommendedAction: isZh ? "补充 paid_amount、order_amount 或 revenue 后再验证真实收入和 ROI。" : "Add paid amount, order amount, or revenue to validate actual revenue and ROI."
    } : null,
    !hasRevenue ? {
      id: "missing-real-revenue-daily",
      title: isZh ? "收入字段缺失提示" : "Missing actual revenue field",
      keyEvidence: isZh ? "当前数据缺少真实交易金额字段。" : "The dataset lacks an actual transaction amount field.",
      businessJudgment: isZh ? "因此无法验证真实收入和 ROI。" : "Actual revenue and ROI cannot be validated.",
      recommendedAction: isZh ? "优先补充 paid_amount、revenue 或 order_amount。" : "Add paid_amount, revenue, or order_amount first."
    } : null,
    hasReturnRate && latestAgeDays <= 3 ? {
      id: "return-lag-daily",
      title: isZh ? "退货滞后提示" : "Return lag note",
      keyEvidence: isZh ? "最新订单日期距离系统当前日期较近。" : "The latest order date is close to the system date.",
      businessJudgment: isZh ? "近期订单可能尚未进入完整退货周期，退货率暂不作为最终判断依据。" : "Recent orders may not have completed the return window; return rate is not final.",
      recommendedAction: isZh ? "等待退货周期补齐后再判断退货问题是否改善。" : "Wait for the return window before judging improvement."
    } : null,
    concentration ? {
      id: "sample-concentration-daily",
      title: isZh ? "样本集中提示" : "Sample concentration note",
      keyEvidence: isZh ? "当前数据样本集中在少数类别、渠道或市场。" : "The sample is concentrated in a small set of categories, channels, or markets.",
      businessJudgment: isZh ? "品类或市场结论需要结合更多长尾对象继续验证。" : "Category or market conclusions need validation with more long-tail objects.",
      recommendedAction: isZh ? "不要把样本集中度当作主要业务风险，先放入口径说明。" : "Treat concentration as a data caveat, not a primary business risk."
    } : null,
    ...input.baseCaveats
  ].filter(Boolean) as Array<Record<string, unknown>>;

  return dedupeCards(caveats, 3);
}

function dailyRiskOpportunityCards(input: {
  metrics: DailyBusinessMetric[];
  latestDate: Date;
  locale: "zh" | "en";
  sampleSize: number;
}) {
  const isZh = input.locale === "zh";
  if (input.sampleSize < 30) return { risks: [], opportunities: [] };
  const cards = sevenDayTrendCards(input.metrics, input.latestDate, input.locale);
  const orders = cards.find((card) => card.metricKind === "orders");
  const revenue = cards.find((card) => card.metricKind === "revenue" || card.metricKind === "estimated_gmv");
  const aov = cards.find((card) => card.metricKind === "aov" || card.metricKind === "estimated_aov");
  const rating = cards.find((card) => card.metricKind === "rating");
  const returnRate = cards.find((card) => card.metricKind === "return_rate");
  const risks: Array<Record<string, unknown>> = [];
  const opportunities: Array<Record<string, unknown>> = [];

  if (revenue?.percentChange != null && aov?.percentChange != null && revenue.percentChange < -0.05 && aov.percentChange < -0.03) {
    risks.push({
      id: "daily-risk-revenue-aov-down",
      title: isZh ? "收入回落且客单价同步下降" : "Revenue and AOV declined together",
      keyEvidence: `${revenue.title}: ${formatPercent(revenue.percentChange)}；${aov.title}: ${formatPercent(aov.percentChange)}`,
      businessJudgment: isZh ? "这比单纯订单波动更值得关注，可能来自低价商品、折扣或高价值订单减少。" : "This is more important than volume movement alone and may come from low-priced items, discounts, or fewer high-value orders.",
      recommendedAction: isZh ? "拆解高价值品类、折扣订单和渠道结构，确认是否需要调整投放或商品推荐。" : "Break down high-value categories, discounted orders, and channel mix."
    });
  }
  if (returnRate?.percentChange != null && returnRate.percentChange > 0.1) {
    risks.push({
      id: "daily-risk-return-rate-up",
      title: isZh ? "退货率上升，需要排查原因" : "Return rate increased",
      keyEvidence: `${returnRate.title}: ${formatPercent(returnRate.percentChange)}`,
      businessJudgment: isZh ? "退货率上升会直接影响收入质量和用户体验。" : "Higher return rate affects revenue quality and customer experience.",
      recommendedAction: isZh ? "查看退货原因、SKU、品类、渠道和物流时效，优先处理集中问题。" : "Review return reasons, SKU, category, channel, and delivery time."
    });
  }
  if (rating?.percentChange != null && rating.percentChange < -0.02) {
    risks.push({
      id: "daily-risk-rating-down",
      title: isZh ? "评分下降，需检查体验问题" : "Rating declined",
      keyEvidence: `${rating.title}: ${formatPercent(rating.percentChange)}`,
      businessJudgment: isZh ? "评分只能说明体验变化，不能直接推导收入，但会影响复购、转化和退货风险。" : "Rating is an experience signal; it does not directly imply revenue but can affect repeat purchase, conversion, and returns.",
      recommendedAction: isZh ? "查看低评分订单、客户反馈、售后和退款原因，确认是否集中在特定商品、品类或渠道。" : "Review low-rated orders, feedback, support, and refund reasons."
    });
  }
  if (orders?.percentChange != null && revenue?.percentChange != null && orders.percentChange > 0.05 && revenue.percentChange > 0.03 && (!aov || (aov.percentChange ?? 0) >= -0.03)) {
    opportunities.push({
      id: "daily-opportunity-demand-up",
      title: isZh ? "订单增长且收入保持同步，可继续验证增长来源" : "Orders and revenue increased together",
      keyEvidence: `${orders.title}: ${formatPercent(orders.percentChange)}；${revenue.title}: ${formatPercent(revenue.percentChange)}`,
      businessJudgment: isZh ? "该机会来自订单和收入同步改善，而不是样本结构占比。" : "This opportunity comes from orders and revenue improving together, not from sample share.",
      recommendedAction: isZh ? "拆解增长来自哪些品类、渠道和地区；若评分和退货率稳定，再考虑小范围增加曝光或投放。" : "Break down by category, channel, and market; if rating and returns stay stable, run a small exposure or campaign test."
    });
  }

  return { risks: dedupeCards(risks, 3), opportunities: dedupeCards(opportunities, 3) };
}

function dailyActionCards(risks: Array<Record<string, unknown>>, opportunities: Array<Record<string, unknown>>, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const source = [...risks, ...opportunities].slice(0, 3);
  if (!source.length) {
    return [{
      id: "daily-action-breakdown",
      title: isZh ? "拆解今日变化来源" : "Break down today's movement",
      keyEvidence: isZh ? "日报已完成今日、昨日和近 7 天对比。" : "The daily brief has compared today, yesterday, and 7-day windows.",
      businessJudgment: isZh ? "下一步需要定位变化来自品类、渠道还是地区。" : "Next step is to locate whether the movement comes from category, channel, or market.",
      recommendedAction: isZh ? "按品类、渠道和地区查看订单、收入、客单价、退货率和评分，输出变化来源表；如果影响收入、订单或退货，再设为 High 优先级。" : "Review orders, revenue, AOV, return rate, and rating by category, channel, and market; mark High priority if it affects revenue, orders, or returns.",
      caveat: isZh ? "Medium" : "Medium"
    }];
  }

  return source.map((card, index) => {
    const title = String(card.title ?? "");
    const target = Array.isArray(card.targetObjects) ? String(card.targetObjects[0] ?? title) : title;
    const high = /收入|订单|退货|revenue|orders|return/i.test(title);
    return {
      id: `daily-action-${index}`,
      title: isZh ? `处理：${title}` : `Act on: ${title}`,
      targetObjects: [target],
      keyEvidence: String(card.keyEvidence ?? ""),
      businessJudgment: String(card.businessJudgment ?? ""),
      recommendedAction: String(card.recommendedAction ?? (isZh ? "查看明细并输出原因归因表。" : "Inspect detail and produce a driver table.")),
      caveat: high ? "High" : "Medium"
    };
  });
}

function dailyAiBrief(input: {
  metrics: DailyBusinessMetric[];
  kpis: Array<Record<string, unknown>>;
  sevenDayTrends: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  caveats: Array<Record<string, unknown>>;
  latestDate: Date;
  generatedAt: Date;
  locale: "zh" | "en";
}) {
  const isZh = input.locale === "zh";
  const latestDateText = isoDate(input.latestDate);
  const generatedDateText = isoDate(input.generatedAt);
  const orders = input.kpis.find((card) => card.metricKind === "orders");
  const revenue = input.kpis.find((card) => card.metricKind === "revenue" || card.metricKind === "estimated_gmv");
  const aov = input.kpis.find((card) => card.metricKind === "aov" || card.metricKind === "estimated_aov");
  const topTrend = input.sevenDayTrends.find((card) => typeof card.percentChange === "number");
  const freshness = latestDateText !== generatedDateText
    ? (isZh
      ? `当前日报基于数据中的最新日期生成，最新数据日期为 ${latestDateText}。`
      : `This daily brief is based on the latest business date in the data: ${latestDateText}.`)
    : "";
  const overall = isZh
    ? `${latestDateText} 当天${orders ? `订单数为 ${formatMetricNumber(orders.currentValue)}` : "核心经营指标已更新"}${revenue ? `，${String(revenue.title)}为 ${formatMetricNumber(revenue.currentValue)}` : ""}${aov ? `，${String(aov.title)}为 ${formatMetricNumber(aov.currentValue)}` : ""}。`
    : `${latestDateText}: ${orders ? `orders were ${formatMetricNumber(orders.currentValue)}` : "core operating metrics updated"}${revenue ? `, ${String(revenue.title)} was ${formatMetricNumber(revenue.currentValue)}` : ""}${aov ? `, ${String(aov.title)} was ${formatMetricNumber(aov.currentValue)}` : ""}.`;
  const yesterday = orders || revenue
    ? (isZh
      ? `与昨日相比，${[orders, revenue, aov].filter(Boolean).map((card) => `${String(card!.title)}${formatPercent(card!.percentChange) ?? "暂无可比变化"}`).join("，")}。`
      : `Versus yesterday, ${[orders, revenue, aov].filter(Boolean).map((card) => `${String(card!.title)} ${formatPercent(card!.percentChange) ?? "not comparable"}`).join(", ")}.`)
    : "";
  const trend = topTrend
    ? (isZh ? `最近 7 天重点变化：${topTrend.businessJudgment || topTrend.summary}` : `Latest 7-day signal: ${topTrend.businessJudgment || topTrend.summary}`)
    : (isZh ? "最近 7 天暂无足够趋势点生成强判断。" : "The latest 7 days do not yet provide enough trend points for a strong conclusion.");
  const driver = input.risks[0] ?? input.opportunities[0];
  const driverText = driver
    ? (isZh ? `今日最优先处理：${driver.title}。` : `Top action today: ${driver.title}.`)
    : (isZh ? "今日应优先按品类、渠道和地区拆解订单、收入和客单价变化来源。" : "Today, prioritize breaking down orders, revenue, and AOV by category, channel, and market.");
  const caveat = input.caveats[0]
    ? (isZh ? `口径提醒：${input.caveats[0].title}。` : `Data note: ${input.caveats[0].title}.`)
    : freshness;

  return [overall, yesterday, driverText, trend, caveat || freshness].filter(Boolean).slice(0, 5).map((text, index) => ({
    id: `daily-ai-brief-${index}`,
    title: isZh ? `摘要 ${index + 1}` : `Brief ${index + 1}`,
    summary: text,
    businessJudgment: text
  }));
}

function historicalTrendDays(trendMetrics: Array<Record<string, unknown>>, latestDate: Date) {
  const dates = trendMetrics.flatMap((metric) => trendRows(metric).map((row) => row.date)).filter((date) => {
    const parsed = asDate(date);
    return parsed ? parsed <= latestDate : false;
  });
  return new Set(dates).size;
}

function completeWeeksFromDays(days: number) {
  return Math.floor(days / 7);
}

function trendModeForHistory(historicalDays: number, completeWeeks: number) {
  if (historicalDays < 7) return "insufficient";
  if (historicalDays < 21) return "short_term_basic";
  if (completeWeeks < 4) return "short_term_trend";
  return "multi_week_trend";
}

function trendMetricItems(
  trendMetrics: Array<Record<string, unknown>> = [],
  locale: "zh" | "en",
  mode: "daily" | "weekly",
  period: ReturnType<typeof buildComparisonPeriod> | null,
  limit = 5
) {
  const isZh = locale === "zh";
  if (!period) return [];
  const currentRange = rangeWithDaysLabel(period.currentStart, period.currentEnd, locale);
  const previousRange = rangeWithDaysLabel(period.previousStart, period.previousEnd, locale);
  const canCompare = period.comparisonMode === "equal_length_period" && period.isEqualLength;

  return trendMetrics.flatMap((metric, index) => {
    if (index >= limit) return [];
    const name = String(metric.metricName ?? metric.sourceMetricName ?? `Metric ${index + 1}`);
    const rows = trendRows(metric);
    const aggregation = metricAggregationMode(name);
    const currentRows = rowsInRange(rows, period.currentStart, period.currentEnd);
    const previousRows = rowsInRange(rows, period.previousStart, period.previousEnd);
    const currentValue = aggregateRows(currentRows, aggregation);
    const previousValue = aggregateRows(previousRows, aggregation);
    if (currentValue == null && previousValue == null) return [];
    const currentSampleSize = sampleSizeFromRows(currentRows);
    const previousSampleSize = sampleSizeFromRows(previousRows);
    const percentChange = canCompare && previousValue != null && Math.abs(previousValue) > 0
      ? (Number(currentValue ?? 0) - previousValue) / Math.abs(previousValue)
      : null;
    const percent = formatPercent(percentChange);
    const current = formatMetricNumber(currentValue);
    const previous = formatMetricNumber(previousValue);
    const largeChange = percentChange != null && Math.abs(percentChange) >= 1;
    const lowSample = aggregation === "avg" && currentSampleSize < 20;
    const caveats = [
      lowSample ? (isZh ? "小样本变化，仅作参考" : "Small sample; use as reference only") : "",
      largeChange ? (isZh ? "大幅变化，需复核明细" : "Large change; review detail") : ""
    ].filter(Boolean);
    const caveat = caveats[0] ?? "";

    return [{
      id: `${mode}-trend-${index}-${name}`,
      title: mode === "daily"
        ? (isZh ? `${name} 最新变化` : `${name} latest change`)
        : (isZh ? `${name} 变化` : `${name} change`),
      summary: canCompare && percent
        ? (isZh
          ? `${currentRange} 较 ${previousRange} 变化 ${percent}。`
          : `${currentRange} changed ${percent} versus ${previousRange}.`)
        : (isZh
          ? `${currentRange} 为 ${current}，暂无可比周期。`
          : `${currentRange} is ${current}; no comparable previous period is available.`),
      targetObjects: [name],
      keyEvidence: canCompare && percent
        ? `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}；${previousRange} ${aggregationLabel(name, aggregation, locale)}：${previous}，样本量：${previousSampleSize}（${percent}）`
        : `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}`,
      businessJudgment: caveat || (isZh ? "该变化基于前一等长周期计算。" : "This change is calculated against the previous equal-length period."),
      recommendedAction: isZh ? "结合样本量、周期完整性和明细对象复核后再下结论。" : "Review sample size, period completeness, and object-level detail before drawing a conclusion.",
      caveat,
      evidenceMetrics: [name],
      comparisonRange: {
        currentStart: isoDate(period.currentStart),
        currentEnd: isoDate(period.currentEnd),
        previousStart: isoDate(period.previousStart),
        previousEnd: isoDate(period.previousEnd),
        currentDays: period.currentDays,
        previousDays: period.previousDays,
        comparisonMode: period.comparisonMode,
        isEqualLength: period.isEqualLength,
        isCurrentComplete: period.isCurrentComplete,
        isPreviousComplete: period.isPreviousComplete,
        aggregation
      }
    }];
  });
}

function weeklyTrendMetricItems(
  trendMetrics: Array<Record<string, unknown>> = [],
  locale: "zh" | "en",
  period: ReturnType<typeof buildComparisonPeriod>,
  limit = 5
) {
  const isZh = locale === "zh";
  const currentRange = rangeWithDaysLabel(period.currentStart, period.currentEnd, locale);
  const previousRange = rangeWithDaysLabel(period.previousStart, period.previousEnd, locale);
  const isLatestSevenComparison = period.comparisonMode === "latest_7_days_vs_previous_7_days";

  return trendMetrics.flatMap((metric, index) => {
    if (index >= limit) return [];
    const name = String(metric.metricName ?? metric.sourceMetricName ?? `Metric ${index + 1}`);
    const rows = trendRows(metric);
    const aggregation = metricAggregationMode(name);
    const currentRows = rowsInRange(rows, period.currentStart, period.currentEnd);
    const previousRows = rowsInRange(rows, period.previousStart, period.previousEnd);
    const currentValue = aggregateRows(currentRows, aggregation);
    const previousValue = aggregateRows(previousRows, aggregation);
    if (currentValue == null) return [];
    const currentSampleSize = sampleSizeFromRows(currentRows);
    const previousSampleSize = sampleSizeFromRows(previousRows);
    const currentCoveredDays = uniqueDateCount(currentRows);
    const previousCoveredDays = uniqueDateCount(previousRows);
    const currentHasSevenDays = currentCoveredDays >= 7;
    const previousHasSevenDays = previousCoveredDays >= 7;
    const comparisonMode: ComparisonMode = !currentHasSevenDays
      ? "partial_latest_period"
      : !previousHasSevenDays
        ? "latest_7_days_baseline"
        : period.comparisonMode;
    const canCompare = isLatestSevenComparison && currentHasSevenDays && previousHasSevenDays && period.isEqualLength;

    const percentChange = canCompare && previousValue != null && Math.abs(previousValue) > 0
      ? (Number(currentValue ?? 0) - previousValue) / Math.abs(previousValue)
      : null;
    const percent = formatPercent(percentChange);
    const current = formatMetricNumber(currentValue);
    const previous = formatMetricNumber(previousValue);
    const direction = percentChange == null
      ? (isZh ? "暂无可比周期" : "no comparable previous period")
      : percentChange > 0
        ? (isZh ? "上升" : "increased")
        : percentChange < 0
          ? (isZh ? "下降" : "decreased")
          : (isZh ? "持平" : "remained stable");
    const largeChange = percentChange != null && Math.abs(percentChange) >= 1;
    const smallSample = aggregation === "avg" && currentSampleSize < 20;
    const caveat = comparisonMode === "partial_latest_period"
      ? (isZh ? "当前数据不足 7 天，已生成当前可用周期快照" : "Current data covers fewer than 7 days")
      : comparisonMode === "latest_7_days_baseline"
        ? (isZh ? "前 7 天历史不足，暂不生成完整对比" : "Previous 7 days have insufficient history")
        : smallSample
          ? (isZh ? "小样本线索" : "Small-sample lead")
          : largeChange
            ? (isZh ? "大幅变化，需复核明细" : "Large change; review detail")
            : "";
    const businessText = weeklyBusinessText({
      metricName: name,
      current,
      previous,
      percent,
      percentValue: percentChange,
      currentSampleSize,
      locale
    });

    return [{
      id: `weekly-trend-${index}-${name}`,
      title: isZh ? `${name} 周变化` : `${name} weekly change`,
      summary: canCompare && percent
        ? (isZh
          ? `最近 7 天为 ${current}，较前 7 天 ${direction} ${percent}。`
          : `The latest 7 days are ${current}, ${direction} ${percent} versus the previous 7 days (${previous}).`)
        : comparisonMode === "partial_latest_period"
          ? (isZh
            ? `当前数据不足 7 天，已生成当前可用周期快照。`
            : `Current data covers fewer than 7 days; a current-period snapshot is shown.`)
          : comparisonMode === "latest_7_days_baseline"
            ? (isZh
              ? `当前已有最近 7 天数据，但前 7 天历史不足，暂不生成完整对比。`
              : `The latest 7 days are available, but the previous 7 days have insufficient history.`)
        : (isZh
          ? `${currentRange} 为 ${current}，暂无可比周期。`
          : `${currentRange} is ${current}; no comparable period is available.`),
      targetObjects: [name],
      keyEvidence: canCompare && percent
        ? `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}；${previousRange} ${aggregationLabel(name, aggregation, locale)}：${previous}，样本量：${previousSampleSize}（${percent}）`
        : comparisonMode === "partial_latest_period"
          ? `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}；当前数据覆盖 ${currentCoveredDays} 天，不足 7 天，暂不生成完整对比。`
          : comparisonMode === "latest_7_days_baseline"
            ? `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}；前 7 天历史不足，仅覆盖 ${previousCoveredDays} 天，暂不生成完整对比。`
          : `${currentRange} ${aggregationLabel(name, aggregation, locale)}：${current}，样本量：${currentSampleSize}`,
      businessJudgment: canCompare && percent ? businessText.judgment : caveat,
      recommendedAction: canCompare && percent ? businessText.action : (isZh ? "补齐历史周期后再判断周变化。" : "Add enough historical period data before interpreting weekly change."),
      caveat,
      evidenceMetrics: [name],
      currentValue,
      previousValue,
      percentChange,
      metricKind: weeklyMetricKind(name),
      comparisonRange: {
        currentStart: isoDate(period.currentStart),
        currentEnd: isoDate(period.currentEnd),
        previousStart: canCompare ? isoDate(period.previousStart) : null,
        previousEnd: canCompare ? isoDate(period.previousEnd) : null,
        currentDays: period.currentDays,
        previousDays: canCompare ? period.previousDays : null,
        comparisonMode,
        isEqualLength: period.isEqualLength,
        isCurrentComplete: currentHasSevenDays,
        isPreviousComplete: previousHasSevenDays,
        aggregation
      }
    }];
  });
}

function weeklyKpiSummary(items: Array<Record<string, unknown>>, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const comparable = items.filter((item) => typeof item.percentChange === "number");
  if (!comparable.length) {
    return isZh
      ? "当前历史周期不足，周报已先展示最近 7 天可用指标，暂不输出强对比结论。"
      : "Historical coverage is insufficient, so the report shows available latest-7-day metrics without a strong comparison conclusion.";
  }

  const sales = comparable.find((item) => item.metricKind === "sales");
  const discount = comparable.find((item) => item.metricKind === "discount");
  const rating = comparable.find((item) => item.metricKind === "rating");
  const parts = [];

  if (sales && typeof sales.percentChange === "number") {
    parts.push(isZh
      ? `销售额${sales.percentChange >= 0 ? "增长" : "下降"} ${formatPercent(sales.percentChange)}`
      : `sales ${sales.percentChange >= 0 ? "increased" : "decreased"} ${formatPercent(sales.percentChange)}`);
  }
  if (discount && typeof discount.percentChange === "number") {
    parts.push(isZh
      ? `折扣金额${discount.percentChange >= 0 ? "同步上升" : "下降"} ${formatPercent(discount.percentChange)}`
      : `discount amount ${discount.percentChange >= 0 ? "also increased" : "decreased"} ${formatPercent(discount.percentChange)}`);
  }
  if (rating && typeof rating.percentChange === "number") {
    const caveat = rating.caveat ? (isZh ? "，但样本量较小" : ", but sample size is small") : "";
    parts.push(isZh
      ? `客户评分${rating.percentChange >= 0 ? "改善" : "下降"} ${formatPercent(rating.percentChange)}${caveat}`
      : `customer rating ${rating.percentChange >= 0 ? "improved" : "declined"} ${formatPercent(rating.percentChange)}${caveat}`);
  }

  if (!parts.length) {
    const lead = comparable[0];
    const leadTargets = Array.isArray(lead.targetObjects) ? lead.targetObjects : [];
    const leadName = String(leadTargets[0] ?? lead.title ?? (isZh ? "核心指标" : "core metrics"));
    return isZh
      ? `最近 7 天核心指标已有可比变化，优先关注 ${leadName}。`
      : `The latest 7 days show comparable KPI movement; prioritize ${leadName}.`;
  }

  return isZh
    ? `最近 7 天${parts.join("；")}。建议优先拆解变化来源，并区分真实需求变化和促销、样本量带来的影响。`
    : `In the latest 7 days, ${parts.join("; ")}. Prioritize breaking down the drivers and separating true demand movement from promotion or sample-size effects.`;
}

function monthlyKpiSummary({
  kpis,
  currentDays,
  previousDays,
  currentEnd,
  incomplete,
  locale
}: {
  kpis: Array<Record<string, unknown>>;
  currentDays: number;
  previousDays: number;
  currentEnd: Date;
  incomplete: boolean;
  locale: "zh" | "en";
}) {
  const isZh = locale === "zh";
  const revenue = kpis.find((item) => item.metricKind === "revenue");
  const orders = kpis.find((item) => item.metricKind === "orders");
  const aov = kpis.find((item) => item.metricKind === "aov");
  const currentRevenue = numericMetricValue(revenue?.currentValue);
  const previousRevenue = numericMetricValue(revenue?.previousValue);
  const currentOrders = numericMetricValue(orders?.currentValue);
  const previousOrders = numericMetricValue(orders?.previousValue);
  const currentDailyRevenue = currentRevenue != null && currentDays > 0 ? currentRevenue / currentDays : null;
  const previousDailyRevenue = previousRevenue != null && previousDays > 0 ? previousRevenue / previousDays : null;
  const dailyRevenueChange = changeRatio(currentDailyRevenue, previousDailyRevenue);
  const dailyOrdersChange = changeRatio(
    currentOrders != null && currentDays > 0 ? currentOrders / currentDays : null,
    previousOrders != null && previousDays > 0 ? previousOrders / previousDays : null
  );

  if (isZh) {
    return [
      `本月截至 ${isoDate(currentEnd)}，累计净销售额为 ${formatMetricNumber(currentRevenue)}，订单数为 ${formatMetricNumber(currentOrders)}。${incomplete ? "当前月尚未结束，需结合日均表现判断经营节奏。" : "当前月为完整自然月，可直接复盘月度累计表现。"}`,
      `本月日均净销售额较上月日均 ${formatPercent(dailyRevenueChange) ?? "暂无可比变化"}，日均订单数较上月 ${formatPercent(dailyOrdersChange) ?? "暂无可比变化"}。`,
      `本月应重点关注订单规模、客单价${aov ? `（${formatMetricNumber(aov.currentValue)}）` : ""}、高收入品类和高退货/评分下降对象，为下月运营计划提供依据。`
    ];
  }

  return [
    `Month-to-date through ${isoDate(currentEnd)}, net sales are ${formatMetricNumber(currentRevenue)} and orders are ${formatMetricNumber(currentOrders)}. ${incomplete ? "The month is not complete, so use daily averages to judge pace." : "The month is complete and can be reviewed as a full monthly period."}`,
    `Average daily net sales changed ${formatPercent(dailyRevenueChange) ?? "not comparably"} versus last month, while average daily orders changed ${formatPercent(dailyOrdersChange) ?? "not comparably"}.`,
    `Focus next on order scale, AOV${aov ? ` (${formatMetricNumber(aov.currentValue)})` : ""}, high-revenue categories, and objects with rising returns or declining ratings.`
  ];
}

function monthlyTrendCards(trendMetrics: Array<Record<string, unknown>> = [], period: ReturnType<typeof buildComparisonPeriod>, locale: "zh" | "en") {
  const isZh = locale === "zh";
  return trendMetrics.slice(0, 5).flatMap((metric, index) => {
    const name = String(metric.metricName ?? metric.sourceMetricName ?? `Metric ${index + 1}`);
    const rows = rowsInRange(trendRows(metric), period.currentStart, period.currentEnd);
    if (rows.length < 2) return [];
    const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
    const peak = [...sorted].sort((left, right) => right.value - left.value)[0];
    const low = [...sorted].sort((left, right) => left.value - right.value)[0];
    const split = Math.max(1, Math.ceil(sorted.length / 2));
    const firstAvg = aggregateRows(sorted.slice(0, split), "avg");
    const secondAvg = aggregateRows(sorted.slice(split).length ? sorted.slice(split) : sorted.slice(0, split), "avg");
    const trendChange = changeRatio(secondAvg, firstAvg);

    return [{
      id: `monthly-trend-${index}`,
      title: isZh ? `${name} 月内趋势` : `${name} monthly trend`,
      summary: isZh
        ? `本月高峰日为 ${peak.date}，低谷日为 ${low.date}，后段均值较前段 ${formatPercent(trendChange) ?? "暂无明显变化"}。`
        : `Peak day: ${peak.date}; low day: ${low.date}; later-period average changed ${formatPercent(trendChange) ?? "not meaningfully"} versus the early period.`,
      targetObjects: [name],
      keyEvidence: isZh
        ? `高峰 ${peak.date}: ${formatMetricNumber(peak.value)}；低谷 ${low.date}: ${formatMetricNumber(low.value)}；本月覆盖 ${new Set(sorted.map((row) => row.date)).size} 天。`
        : `Peak ${peak.date}: ${formatMetricNumber(peak.value)}; low ${low.date}: ${formatMetricNumber(low.value)}; covered ${new Set(sorted.map((row) => row.date)).size} days.`,
      businessJudgment: trendChange != null && Math.abs(trendChange) >= 0.1
        ? (isZh ? "月内节奏存在明显变化，建议追查高峰/低谷日期的品类、渠道和市场结构。" : "The month shows a meaningful pace change; inspect category, channel, and market mix on peak and low days.")
        : (isZh ? "月内节奏相对平稳，继续观察是否出现异常日期。" : "The month-to-date pace is relatively stable; continue watching for anomalous days."),
      recommendedAction: isZh ? "结合异常日期订单明细、折扣、渠道和履约记录定位波动来源。" : "Use order detail, discount, channel, and fulfillment records around unusual dates to identify drivers."
    }];
  });
}

function monthlyDailyAverageCards(kpis: Array<Record<string, unknown>>, currentDays: number, previousDays: number, locale: "zh" | "en") {
  const isZh = locale === "zh";
  const labels: Record<string, string> = {
    revenue: isZh ? "日均净销售额" : "Avg daily net sales",
    orders: isZh ? "日均订单数" : "Avg daily orders",
    customers: isZh ? "日均客户数" : "Avg daily customers",
    units: isZh ? "日均销售件数" : "Avg daily units sold"
  };

  return ["revenue", "orders", "customers", "units"].flatMap((kind) => {
    const metric = kpis.find((item) => item.metricKind === kind);
    const current = numericMetricValue(metric?.currentValue);
    const previous = numericMetricValue(metric?.previousValue);
    if (!metric || current == null) return [];
    const currentDaily = currentDays > 0 ? current / currentDays : null;
    const previousDaily = previous != null && previousDays > 0 ? previous / previousDays : null;
    const change = changeRatio(currentDaily, previousDaily);

    return [{
      id: `monthly-daily-average-${kind}`,
      title: labels[kind],
      summary: isZh
        ? `本月日均 ${formatMetricNumber(currentDaily)}，上月日均 ${formatMetricNumber(previousDaily)}，变化 ${formatPercent(change) ?? "暂无可比变化"}。`
        : `This month average ${formatMetricNumber(currentDaily)}, last month average ${formatMetricNumber(previousDaily)}, change ${formatPercent(change) ?? "not comparable"}.`,
      keyEvidence: isZh
        ? `本月累计 ${formatMetricNumber(current)} / ${currentDays} 天；上月 ${formatMetricNumber(previous)} / ${previousDays} 天。`
        : `This month total ${formatMetricNumber(current)} / ${currentDays} days; last month ${formatMetricNumber(previous)} / ${previousDays} days.`,
      businessJudgment: isZh ? "未完整月份应优先用日均节奏判断经营表现，避免直接比较累计值。" : "For an incomplete month, use daily pace before comparing totals directly.",
      recommendedAction: isZh ? "结合月内趋势和二级指标，确认日均变化来自订单、客单价还是结构变化。" : "Use monthly trend and dimension breakdown to identify whether daily pace changes come from orders, AOV, or mix.",
      currentValue: currentDaily,
      previousValue: previousDaily,
      percentChange: change,
      metricKind: `${kind}_daily_average`
    }];
  });
}

function weeklyTrendAnalysisItems(
  trendMetrics: Array<Record<string, unknown>> = [],
  locale: "zh" | "en",
  latestDate: Date,
  weeklyKpiItems: Array<Record<string, unknown>> = []
) {
  const isZh = locale === "zh";
  const historicalDays = historicalTrendDays(trendMetrics, latestDate);
  const completeWeeks = completeWeeksFromDays(historicalDays);
  const trendMode = trendModeForHistory(historicalDays, completeWeeks);
  const kpiSummary = weeklyKpiSummary(weeklyKpiItems, locale);

  if (trendMode === "insufficient") {
    return [{
      id: "weekly-trend-insufficient-history",
      title: isZh ? "趋势数据不足" : "Insufficient Trend Data",
      summary: isZh
        ? "当前历史数据不足 7 天，暂不适合判断趋势。"
        : "Current history is under 7 days, so trend interpretation is not suitable yet.",
      keyEvidence: isZh
        ? `当前仅覆盖 ${historicalDays} 天业务数据。`
        : `Only ${historicalDays} business days are covered.`,
      businessJudgment: isZh
        ? "需要先补足至少 7 天业务时间数据。"
        : "At least 7 business days are needed first.",
      recommendedAction: isZh
        ? "继续积累业务时间数据后再观察趋势。"
        : "Continue accumulating business-date data before interpreting trend.",
      trendMode
    }];
  }

  if (trendMode === "short_term_basic") {
    return [{
      id: "weekly-trend-short-term-basic",
      title: isZh ? "短期变化观察" : "Short-Term Change Observation",
      summary: isZh
        ? "当前已有短期数据，可观察最近变化，但趋势稳定性仍有限。"
        : "Short-term data is available for recent-change observation, but trend stability is still limited.",
      keyEvidence: isZh
        ? `当前数据覆盖 ${historicalDays} 天，尚不足 21 天。`
        : `Data covers ${historicalDays} days, fewer than 21 days.`,
      businessJudgment: kpiSummary,
      recommendedAction: isZh
        ? "先使用最近 7 天 vs 前 7 天对比判断短期变化，同时继续累积数据。"
        : "Use latest-7-days versus previous-7-days for short-term change while continuing to accumulate data.",
      trendMode
    }];
  }

  if (trendMode === "short_term_trend") {
    return [{
      id: "weekly-trend-short-term",
      title: isZh ? `已有近 ${historicalDays} 天短期趋势` : `Short-Term Trend: ${historicalDays} Days`,
      summary: isZh
        ? `当前数据覆盖 ${historicalDays} 天，可用于观察短期上升、下滑和波动；由于尚不足 4 个完整周，周度趋势结论仍需谨慎。`
        : `Data covers ${historicalDays} days, enough to observe short-term rises, declines, and volatility; because there are fewer than 4 complete weeks, weekly trend conclusions should remain cautious.`,
      keyEvidence: kpiSummary,
      businessJudgment: isZh
        ? "短期趋势可看，多周趋势强结论仍需继续验证。"
        : "Short-term trend is observable, while strong multi-week conclusions still need validation.",
      recommendedAction: isZh
        ? "先使用最近 7 天 vs 前 7 天对比判断短期变化，同时继续累积数据以验证多周趋势。"
        : "Use latest-7-days versus previous-7-days to judge short-term movement, and continue accumulating data to validate multi-week trends.",
      trendMode
    }];
  }

  return [{
    id: "weekly-trend-available",
    title: isZh ? "多周趋势可分析" : "Multi-Week Trend Available",
    summary: isZh
      ? `当前已有 ${completeWeeks} 个完整周数据，可用于观察多周趋势、重复风险和持续改善 / 恶化指标。`
      : `${completeWeeks} complete weeks are available for multi-week trends, repeated risks, and sustained improvement/deterioration.`,
    keyEvidence: isZh ? `覆盖 ${historicalDays} 天业务数据。` : `${historicalDays} business days are covered.`,
    businessJudgment: kpiSummary,
    recommendedAction: isZh ? "优先查看改善和恶化幅度最大的指标，并识别重复风险。" : "Prioritize the most improved and worsened metrics and identify repeated risks.",
    trendMode
  }];
}

function generated(input: ReportComposerInput) {
  return input.structuredReport?.generatedInsights ?? {};
}

function validationFailureReport(input: ReportComposerInput) {
  const isZh = input.locale === "zh";
  const audit = input.reportDataAudit;
  const failures = audit?.failures?.length ? audit.failures : [isZh ? "当前报告未通过数据口径校验。" : "The report did not pass data-scope validation."];
  const metricRowsUsed = audit?.rowsUsedForMetrics ?? audit?.fullDataGuardrail?.rowsUsedForMetrics ?? audit?.fullDataGuardrail?.rowsUsed ?? audit?.totalRows ?? "未知";
  const auditScopeEvidence = audit
    ? (isZh
      ? `当前使用的数据来源：${audit.analysisSource ?? "未知"}；使用行数：${metricRowsUsed}；预期完整行数：${audit.expectedFullRows ?? "未知"}；今日订单记录数：${audit.dailyRows ?? "未知"}；用于计算的记录数：${audit.rowsUsedForMetrics ?? "未知"}。`
      : `Current source: ${audit.analysisSource ?? "unknown"}; rows used: ${metricRowsUsed}; expected full rows: ${audit.expectedFullRows ?? "unknown"}; latest-day order rows: ${audit.dailyRows ?? "unknown"}; rows used for metrics: ${audit.rowsUsedForMetrics ?? "unknown"}.`)
    : "";
  const caveats = [
    auditScopeEvidence ? {
      id: "audit-scope-summary",
      title: isZh ? "当前不能生成正式业务报告" : "Cannot generate a formal business report",
      keyEvidence: auditScopeEvidence,
      businessJudgment: isZh ? "系统已阻止基于错误样本量、预览数据或部分数据生成经营结论。" : "The system blocked conclusions based on incorrect sample size, preview data, or partial data.",
      recommendedAction: (audit?.requiredFixes ?? []).join(isZh ? "；" : "; "),
      caveat: isZh ? "未通过校验" : "Validation failed"
    } : null,
    ...failures.map((failure, index) => ({
      id: `audit-failure-${index}`,
      title: isZh ? "数据口径校验失败" : "Data validation failed",
      keyEvidence: failure,
      businessJudgment: isZh ? "系统不会基于样本数据或错误行业模板生成正式经营结论。" : "The system will not generate formal business conclusions from sample data or the wrong industry template.",
      recommendedAction: isZh ? "请确认完整文件可读取、数据库查询可执行，并重新生成报告。" : "Confirm the full file is readable or database queries can run, then regenerate the report.",
      caveat: isZh ? "未通过校验" : "Validation failed"
    })),
    ...(audit?.warnings ?? []).map((warning, index) => ({
      id: `audit-warning-${index}`,
      title: isZh ? "数据口径提醒" : "Data-scope warning",
      keyEvidence: warning,
      businessJudgment: isZh ? "该问题会影响报告解释，需要在正式判断前修正或确认。" : "This affects interpretation and should be fixed or confirmed before formal decisions.",
      recommendedAction: isZh ? "补充字段或修正口径后重新生成。" : "Add fields or correct the metric definition, then regenerate.",
      caveat: isZh ? "提醒" : "Warning"
    }))
  ].filter(Boolean) as Array<Record<string, unknown>>;

  return {
    reportMode: input.requestedReportMode,
    reportTimeMode: "snapshot_report" as const,
    validationStatus: "failed",
    reportDataAudit: audit,
    latestDataDate: audit?.latestDataDate ?? null,
    todayOverview: isZh ? "当前报告未通过数据口径校验" : "This report did not pass data-scope validation",
    keyChanges: caveats,
    risks: [],
    opportunities: [],
    priorityActions: [],
    dataCaveats: caveats
  };
}

function hasSnapshotBefore(input: ReportComposerInput, date: Date) {
  return input.metricSnapshots.some((snapshot) => {
    const snapshotAt = asDate(snapshot.snapshotDate as string | Date | null);
    return snapshotAt ? snapshotAt.getTime() < date.getTime() : false;
  });
}

export function normalizeReportMode(value: unknown): ReportMode {
  if (value === "daily_brief" || value === "weekly_report" || value === "snapshot_report" || value === "custom_report") {
    return value;
  }
  return "custom_report";
}

export function effectiveReportMode(input: {
  requestedReportMode: ReportMode;
  hasTimeField: boolean;
}): ReportMode {
  return input.hasTimeField ? input.requestedReportMode : "snapshot_report";
}

export async function saveMetricSnapshots(prisma: PrismaClient, input: {
  workspaceId: string;
  metricResults: MetricResultLike[];
  timeConfig?: ReportComposerInput["timeConfig"];
  dateRange: DateRangeInput;
  generatedAt?: Date;
}) {
  const metricSnapshotModel = (prisma as PrismaClient & {
    metricSnapshot?: {
      createMany: (args: { data: unknown[] }) => Promise<{ count: number }>;
    };
  }).metricSnapshot;
  const generatedAt = input.generatedAt ?? new Date();
  const snapDate = asDate(snapshotDate({ timeConfig: input.timeConfig, dateRange: input.dateRange, generatedAt })) ?? generatedAt;
  const startDate = asDate(input.dateRange.startDate);
  const endDate = asDate(input.dateRange.endDate);
  const rows = input.metricResults
    .filter(isComputedMetric)
    .map((result) => {
      const metricName = String(result.metricName ?? "").trim();

      return {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        metricId: result.metricId ?? null,
        metricName,
        displayName: result.displayName ?? null,
        value: typeof result.value === "number" && Number.isFinite(result.value) ? result.value : null,
        valueJson: metricValueJson(result) as never,
        unit: result.unit ?? null,
        scope: input.dateRange.preset,
        grain: input.timeConfig?.selectedRange ?? input.dateRange.preset,
        businessModule: result.businessType ?? result.metricCategory ?? null,
        sourceDataset: result.sourceDataset ?? null,
        dateField: result.dateField ?? input.timeConfig?.defaultTimeField ?? null,
        snapshotDate: snapDate,
        dateRangePreset: input.dateRange.preset,
        startDate,
        endDate,
        calculatedAt: asDate(result.computedAt) ?? generatedAt
      };
    });

  if (!metricSnapshotModel || !rows.length) return { count: 0, snapshotDate: snapDate };

  const result = await metricSnapshotModel.createMany({ data: rows });
  return { count: result.count, snapshotDate: snapDate };
}

export async function loadMetricSnapshots(prisma: PrismaClient, workspaceId: string, take = 500) {
  const metricSnapshotModel = (prisma as PrismaClient & {
    metricSnapshot?: {
      findMany: (args: {
        where: { workspaceId: string };
        orderBy: { snapshotDate: "desc" };
        take: number;
      }) => Promise<Array<Record<string, unknown>>>;
    };
  }).metricSnapshot;

  if (!metricSnapshotModel) return [];

  return metricSnapshotModel.findMany({
    where: { workspaceId },
    orderBy: { snapshotDate: "desc" },
    take
  });
}

export function composeDailyBrief(input: ReportComposerInput) {
  if (input.reportDataAudit && !input.reportDataAudit.passed) {
    return validationFailureReport(input);
  }

  const isZh = input.locale === "zh";
  const generatedAt = input.generatedAt ?? new Date();
  const auditedLatestDate = asDate(input.reportDataAudit?.latestDataDate ?? null);
  const latestDate = auditedLatestDate ??
    latestTrendDate(input.trendMetrics) ??
    snapshotDate({ timeConfig: input.timeConfig, dateRange: input.dateRange, generatedAt });
  const comparisonPeriod = buildComparisonPeriod({
    selectedRange: "TODAY",
    latestDataDate: latestDate,
    reportMode: "daily_brief",
    currentStart: latestDate,
    currentEnd: latestDate
  });
  const trendSampleStats = dailySampleStats(input.trendMetrics, latestDate);
  const sampleStats = dailyRecordStats(input, trendSampleStats);
  const hasTimeField = input.timeConfig?.hasTimeField !== false &&
    Boolean(input.timeConfig?.defaultTimeField || input.reportDataAudit?.dateField || input.trendMetrics?.length);
  const generatedDateText = isoDate(generatedAt);
  const latestDateText = isoDate(latestDate);
  const dailyBriefMode: DailyBriefMode = !hasTimeField ? "snapshot" : "daily_full";
  const reportTimeMode: ReportTimeMode = hasSnapshotBefore(input, latestDate)
    ? (latestDateText === generatedDateText ? "today_brief" : "latest_available_brief")
    : "baseline_snapshot";
  const generatedInsights = generated(input);
  const trendChanges = trendMetricItems(input.trendMetrics, input.locale, "daily", comparisonPeriod, 3);
  const baseCaveats = dataCaveatCards(generatedInsights.dataLimitations, input.locale, input.timeConfig?.hasTimeField !== false);
  const businessMetrics = mergeDailyBusinessMetrics(
    dailyBusinessMetricsFromResults(input.metricResults, latestDate, input.locale),
    dailyBusinessMetrics(input.trendMetrics, input.locale)
  );
  const dailyKpis = dailyMetricCards(businessMetrics, latestDate, input.locale);
  const yesterdayComparison = dailyYesterdayComparison(businessMetrics, latestDate, input.locale);
  const sevenDayTrends = sevenDayTrendCards(businessMetrics, latestDate, input.locale);
  const categoryPerformance = groupPerformanceCards(input.aggregationResults, "category", input.locale);
  const productPerformance = groupPerformanceCards(input.aggregationResults, "product", input.locale);
  const channelPerformance = groupPerformanceCards(input.aggregationResults, "channel", input.locale);
  const marketPerformance = groupPerformanceCards(input.aggregationResults, "market", input.locale);
  const segmentPerformance = groupPerformanceCards(input.aggregationResults, "segment", input.locale);
  const dimensionComparisons = buildDailyDimensionComparisons(input.metricResults, input.locale);
  const keyFindings = dailyKeyFindings({
    kpis: dailyKpis,
    dimensionComparisons,
    locale: input.locale
  });
  const dailyCaveats = dataCaveatsForDaily({
    metrics: businessMetrics,
    aggregationResults: input.aggregationResults,
    reportDataAudit: input.reportDataAudit,
    latestDate,
    generatedAt,
    locale: input.locale,
    baseCaveats
  });
  const businessRiskOpportunity = dailyRiskOpportunityCards({
    metrics: businessMetrics,
    latestDate,
    locale: input.locale,
    sampleSize: sampleStats.dailySampleSize
  });
  const dailyActions = dailyActionCards(businessRiskOpportunity.risks, businessRiskOpportunity.opportunities, input.locale);
  const aiBrief = dailyAiBrief({
    metrics: businessMetrics,
    kpis: dailyKpis,
    sevenDayTrends,
    risks: businessRiskOpportunity.risks,
    opportunities: businessRiskOpportunity.opportunities,
    caveats: dailyCaveats,
    latestDate,
    generatedAt,
    locale: input.locale
  });
  const generatedActionItems = generatedInsights.nextActionPlan?.actionInsights?.length
    ? generatedInsights.nextActionPlan.actionInsights
    : generatedInsights.recommendedActions;
  const baselineMessage = isZh
    ? "这是第一份 AI 简报，系统已保存当前指标作为后续对比基准。"
    : "This is the first AI brief. The current metrics have been saved as the comparison baseline.";
  const latestDateNotice = latestDateText !== generatedDateText
    ? (isZh
      ? `当前数据最新业务日期为 ${latestDateText}，未包含系统当前日期 ${generatedDateText} 的业务数据。本简报基于最新可用数据生成。`
      : `The latest business date is ${latestDateText}; system date ${generatedDateText} is not included. This brief uses the latest available data.`)
    : "";
  return {
    reportMode: "daily_brief" as const,
    reportTimeMode,
    dailyBriefMode,
    reportDataAudit: input.reportDataAudit ?? null,
    dailySampleSize: sampleStats.dailySampleSize,
    sampleLevel: sampleStats.sampleLevel,
    latestDataDate: isoDate(latestDate),
    totalRows: input.reportDataAudit?.totalRows ?? null,
    rowsUsedForMetrics: input.reportDataAudit?.rowsUsedForMetrics ?? null,
    fullDataValidated: input.reportDataAudit ? input.reportDataAudit.passed && input.reportDataAudit.usesFullData : null,
    reportTitle: isZh ? `${isoDate(latestDate)} 电商经营日报` : `${isoDate(latestDate)} Daily Business Brief`,
    comparisonDate: reportTimeMode === "baseline_snapshot" ? null : isoDate(input.metricSnapshots[0]?.snapshotDate as string | Date | null),
    todayOverview: reportTimeMode === "baseline_snapshot"
      ? baselineMessage
      : (isZh
        ? `${isoDate(latestDate)} 电商经营日报：基于数据中的最新业务日期生成。`
        : `${isoDate(latestDate)} Daily Business Brief based on the latest business date in the data.`),
    latestDateNotice,
    aiBrief,
    dailyKpis,
    yesterdayComparison,
    sevenDayTrends,
    keyFindingsVersion: 2,
    categoryPerformance,
    productPerformance,
    channelPerformance,
    marketPerformance,
    segmentPerformance,
    dimensionComparisons,
    keyChanges: keyFindings.length ? keyFindings : trendChanges.length ? trendChanges : pickInsightItems(generatedInsights.keyFindings, 3),
    risks: businessRiskOpportunity.risks,
    opportunities: businessRiskOpportunity.opportunities,
    priorityActions: dailyActions.length ? dailyActions : businessCards(generatedActionItems, "action", input.locale, 3),
    dataCaveats: dailyCaveats
  };
}

export function composeWeeklyReport(input: ReportComposerInput) {
  if (input.reportDataAudit && !input.reportDataAudit.passed) {
    return validationFailureReport(input);
  }

  const isZh = input.locale === "zh";
  const auditedLatestDate = asDate(input.reportDataAudit?.latestDataDate ?? null);
  const latestDate = auditedLatestDate ??
    latestTrendDate(input.trendMetrics) ??
    snapshotDate({ timeConfig: input.timeConfig, dateRange: input.dateRange, generatedAt: input.generatedAt ?? new Date() });
  const generatedDate = input.generatedAt ?? new Date();
  const freshnessNote = isoDate(generatedDate) && isoDate(generatedDate) !== isoDate(latestDate)
    ? (isZh
      ? `当前数据库暂无 ${isoDate(generatedDate)} 的业务数据，周报基于最新可用业务日期 ${isoDate(latestDate)} 生成。`
      : `The database has no business data for ${isoDate(generatedDate)}; this report is based on the latest available business date ${isoDate(latestDate)}.`)
    : "";
  const comparisonPeriod = buildComparisonPeriod({
    selectedRange: input.dateRange.preset,
    latestDataDate: latestDate,
    reportMode: "weekly_report"
  });
  const currentCoveredDays = trendDateCountInRange(input.trendMetrics ?? [], comparisonPeriod.currentStart, comparisonPeriod.currentEnd);
  const previousCoveredDays = trendDateCountInRange(input.trendMetrics ?? [], comparisonPeriod.previousStart, comparisonPeriod.previousEnd);
  const reportComparisonMode: ComparisonMode = currentCoveredDays < 7
    ? "partial_latest_period"
    : previousCoveredDays < 7
      ? "latest_7_days_baseline"
      : "latest_7_days_vs_previous_7_days";
  const hasPreviousSevenDays = reportComparisonMode === "latest_7_days_vs_previous_7_days";
  const reportTimeMode: ReportTimeMode = hasPreviousSevenDays ? "current_week_report" : "weekly_baseline";
  const generatedInsights = generated(input);
  const weeklyTrendItems = weeklyTrendMetricItems(input.trendMetrics, input.locale, comparisonPeriod, 5);
  const multiWeekTrendItems = weeklyTrendAnalysisItems(input.trendMetrics, input.locale, latestDate, weeklyTrendItems);
  const weeklyMetrics = mergeDailyBusinessMetrics(
    periodBusinessMetricsFromResults(input.metricResults, comparisonPeriod, input.locale),
    dailyBusinessMetrics(input.trendMetrics, input.locale)
  );
  const weeklyKpis = periodMetricCards(weeklyMetrics, comparisonPeriod, input.locale, {
    idPrefix: "weekly-kpi",
    currentLabel: isZh ? "最近 7 天" : "Latest 7 days",
    previousLabel: isZh ? "前 7 天" : "Previous 7 days"
  });
  const weeklyDimensionComparisons = buildWeeklyDimensionComparisons(input.metricResults, input.locale);
  const weeklyFindings = weeklyKeyFindings({
    kpis: weeklyKpis,
    dimensionComparisons: weeklyDimensionComparisons,
    locale: input.locale
  });
  const weeklyCompletenessCaveat = {
    id: "weekly-period-completeness",
    title: currentCoveredDays >= 7
      ? (isZh ? "当前周期完整" : "Current period is complete")
      : (isZh ? "当前周期数据不足 7 天" : "Current period has fewer than 7 days"),
    keyEvidence: isZh
      ? `当前周期覆盖 ${currentCoveredDays} 天；当前周期：${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)}；对比周期：${rangeLabel(comparisonPeriod.previousStart, comparisonPeriod.previousEnd, input.locale)}。`
      : `Current period covers ${currentCoveredDays} days; current period: ${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)}; comparison period: ${rangeLabel(comparisonPeriod.previousStart, comparisonPeriod.previousEnd, input.locale)}.`,
    businessJudgment: currentCoveredDays >= 7
      ? (isZh ? "当前周期完整，可以输出最近 7 天 vs 前 7 天对比结论。" : "The current period is complete and supports latest 7 days versus previous 7 days comparison.")
      : (isZh ? "当前周期数据不足 7 天，仅展示可用日期，不输出强对比结论。" : "The current period has fewer than 7 days; show available dates only and avoid strong comparison conclusions."),
    recommendedAction: currentCoveredDays >= 7 ? "" : (isZh ? "等待数据覆盖完整 7 天后再复盘周度趋势。" : "Wait until a complete 7-day period is available before reviewing weekly trend.")
  };
  const baselineMessage = isZh
    ? currentCoveredDays < 7
      ? "当前数据不足 7 天，已生成当前可用周期快照。"
      : "当前已有最近 7 天数据，但前 7 天历史不足，暂不生成完整对比。"
    : currentCoveredDays < 7
      ? "Current data covers fewer than 7 days, so a current-period snapshot was generated."
      : "The latest 7 days are available, but the previous 7 days have insufficient history.";

  return {
    reportMode: "weekly_report" as const,
    reportTimeMode,
    latestDataDate: isoDate(latestDate),
    reportTitle: isZh
      ? `${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)} 电商经营周报`
      : `${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)} Ecommerce Weekly Report`,
    dateField: input.timeConfig?.defaultTimeField ?? null,
    dataFreshnessNote: freshnessNote,
    weekStart: isoDate(comparisonPeriod.currentStart),
    weekEnd: isoDate(comparisonPeriod.currentEnd),
    currentPeriodStart: isoDate(comparisonPeriod.currentStart),
    currentPeriodEnd: isoDate(comparisonPeriod.currentEnd),
    previousPeriodStart: isoDate(comparisonPeriod.previousStart),
    previousPeriodEnd: isoDate(comparisonPeriod.previousEnd),
    comparisonWeekStart: isoDate(comparisonPeriod.previousStart),
    comparisonWeekEnd: isoDate(comparisonPeriod.previousEnd),
    comparisonMode: reportComparisonMode,
    currentDays: comparisonPeriod.currentDays,
    previousDays: comparisonPeriod.previousDays,
    currentPeriodDateCount: currentCoveredDays,
    previousPeriodDateCount: previousCoveredDays,
    currentPeriodComplete: currentCoveredDays >= 7,
    totalRows: input.reportDataAudit?.totalRows ?? null,
    fullDataValidated: input.reportDataAudit ? input.reportDataAudit.passed && input.reportDataAudit.usesFullData : null,
    reportDataAudit: input.reportDataAudit ?? null,
    weeklyKpiSummary: weeklyKpiSummary(weeklyTrendItems, input.locale),
    executiveSummary: reportComparisonMode !== "latest_7_days_vs_previous_7_days"
      ? `${baselineMessage}${freshnessNote ? ` ${freshnessNote}` : ""}`.trim()
      : (isZh
        ? `基于最新业务日期 ${isoDate(latestDate)}，比较最近 7 天与前 7 天表现。${freshnessNote} ${input.structuredReport?.coreSummary ?? ""}`.trim()
        : `Based on the latest business date ${isoDate(latestDate)}, this compares the latest 7 days with the previous 7 days. ${freshnessNote} ${input.structuredReport?.coreSummary ?? ""}`.trim()),
    weeklyKpis,
    weeklyDimensionComparisons,
    keyFindingsVersion: 2,
    keyFindings: weeklyFindings.length ? weeklyFindings : weeklyTrendItems,
    weeklyKpiChanges: weeklyTrendItems.length ? weeklyTrendItems : pickInsightItems(generatedInsights.keyFindings, 5),
    trendAnalysis: multiWeekTrendItems,
    riskReview: businessCards(generatedInsights.businessRisks, "risk", input.locale, 5),
    growthOpportunities: businessCards(generatedInsights.growthOpportunities, "opportunity", input.locale, 5),
    nextWeekActions: businessCards(generatedInsights.nextActionPlan?.actionInsights ?? generatedInsights.recommendedActions, "action", input.locale, 5),
    dataCaveats: dedupeCards([
      weeklyCompletenessCaveat,
      ...dataCaveatCards(generatedInsights.dataLimitations, input.locale, input.timeConfig?.hasTimeField !== false)
    ], 4)
  };
}

function monthlyChangeDrivers(kpis: Array<Record<string, unknown>>, dimensionTables: DimensionComparisonTable[], locale: "zh" | "en") {
  const isZh = locale === "zh";
  const card = (kind: string) => kpis.find((item) => item.metricKind === kind);
  const revenue = card("revenue");
  const orders = card("orders");
  const aov = card("aov");
  const topCategory = dimensionTables.find((table) => table.type === "category")?.rows[0];
  const topChannel = dimensionTables.find((table) => table.type === "channel")?.rows[0];
  const topSegment = dimensionTables.find((table) => table.type === "segment")?.rows[0];

  return [
    revenue ? {
      id: "monthly-driver-revenue",
      title: isZh ? "收入变化来源" : "Revenue movement source",
      summary: isZh ? `本月净销售额较上月 ${formatPercent(revenue.percentChange as number | null) ?? "暂无可比变化"}。` : `Net sales changed ${formatPercent(revenue.percentChange as number | null) ?? "not comparably"} versus last month.`,
      keyEvidence: isZh ? `本月 ${formatMetricNumber(revenue.currentValue)}；上月 ${formatMetricNumber(revenue.previousValue)}。` : `This month ${formatMetricNumber(revenue.currentValue)}; last month ${formatMetricNumber(revenue.previousValue)}.`,
      businessJudgment: isZh ? "收入变化需要拆分订单规模、客单价和品类结构，避免只看累计额。" : "Revenue movement should be separated into order scale, AOV, and category mix.",
      recommendedAction: isZh ? "优先查看订单数、客单价和品类净销售额变化。" : "Review orders, AOV, and category net sales first."
    } : null,
    orders || aov ? {
      id: "monthly-driver-scale-aov",
      title: isZh ? "订单规模与客单价" : "Order scale and AOV",
      summary: isZh ? `订单数 ${formatPercent(orders?.percentChange as number | null) ?? "暂无变化"}，客单价 ${formatPercent(aov?.percentChange as number | null) ?? "暂无变化"}。` : `Orders ${formatPercent(orders?.percentChange as number | null) ?? "not comparable"}; AOV ${formatPercent(aov?.percentChange as number | null) ?? "not comparable"}.`,
      keyEvidence: [orders ? `${isZh ? "订单" : "Orders"} ${formatMetricNumber(orders.currentValue)} vs ${formatMetricNumber(orders.previousValue)}` : "", aov ? `${isZh ? "客单价" : "AOV"} ${formatMetricNumber(aov.currentValue)} vs ${formatMetricNumber(aov.previousValue)}` : ""].filter(Boolean).join(isZh ? "；" : "; "),
      businessJudgment: isZh ? "订单数解释规模，客单价解释单笔价值，二者共同决定月度收入质量。" : "Orders explain scale while AOV explains basket value; together they define monthly revenue quality.",
      recommendedAction: isZh ? "按品类和渠道拆解订单与客单价，判断是流量、转化还是商品结构变化。" : "Break orders and AOV down by category and channel to identify traffic, conversion, or mix changes."
    } : null,
    topCategory ? {
      id: "monthly-driver-category",
      title: isZh ? "品类结构变化" : "Category mix",
      summary: isZh ? `${topCategory.name} 是本月主要品类线索。` : `${topCategory.name} is the leading category signal this month.`,
      keyEvidence: isZh ? `本月订单 ${formatMetricNumber(topCategory.todayOrders)}，净销售额 ${formatMetricNumber(topCategory.todayNetSales)}。` : `This month orders ${formatMetricNumber(topCategory.todayOrders)}, net sales ${formatMetricNumber(topCategory.todayNetSales)}.`,
      businessJudgment: topCategory.businessJudgment ?? "",
      recommendedAction: isZh ? "继续查看该品类的客单价、退货率和评分，判断是否适合下月放量。" : "Review AOV, return rate, and rating before scaling next month."
    } : null,
    topChannel || topSegment ? {
      id: "monthly-driver-channel-segment",
      title: isZh ? "渠道与客户结构" : "Channel and customer mix",
      summary: isZh ? "渠道和客户分层用于判断增长来源是否健康。" : "Channel and customer segments show whether growth quality is healthy.",
      keyEvidence: [topChannel ? `${isZh ? "渠道" : "Channel"} ${topChannel.name}: ${formatMetricNumber(topChannel.todayNetSales)}` : "", topSegment ? `${isZh ? "客户分层" : "Segment"} ${topSegment.name}: ${formatMetricNumber(topSegment.todayCustomers ?? topSegment.todayOrders)}` : ""].filter(Boolean).join(isZh ? "；" : "; "),
      businessJudgment: isZh ? "如果增长集中在低客单价或高退货渠道，下月需要先控质量再放量。" : "If growth concentrates in low-AOV or high-return channels, protect quality before scaling.",
      recommendedAction: isZh ? "比较渠道收入、退货率、评分和 New/Returning/VIP 贡献。" : "Compare channel revenue, returns, ratings, and New/Returning/VIP contribution."
    } : null
  ].filter(Boolean).slice(0, 6) as Array<Record<string, unknown>>;
}

function monthlyTopMovers(dimensionTables: DimensionComparisonTable[], locale: "zh" | "en") {
  const isZh = locale === "zh";
  const rows = dimensionTables.flatMap((table) => table.rows.map((row) => ({
    table,
    row,
    change: row.netSalesChange ?? row.ordersChange ?? row.aovChange ?? null
  }))).filter((item) => item.change != null);
  const pullers = [...rows].sort((left, right) => Number(right.change) - Number(left.change)).slice(0, 3);
  const drags = [...rows].sort((left, right) => Number(left.change) - Number(right.change)).slice(0, 3);

  return [...pullers.map((item, index) => ({ ...item, type: isZh ? "拉动" : "Pull", index })), ...drags.map((item, index) => ({ ...item, type: isZh ? "拖累" : "Drag", index }))].map((item) => ({
    id: `monthly-mover-${item.type}-${item.index}-${item.table.type}-${item.row.id}`,
    title: `${item.type}：${item.row.name}`,
    summary: isZh ? `${item.table.label} ${item.row.name} 净销售额变化 ${formatPercent(item.row.netSalesChange) ?? "暂无"}。` : `${item.table.label} ${item.row.name} net sales changed ${formatPercent(item.row.netSalesChange) ?? "not comparably"}.`,
    targetObjects: [item.row.name],
    keyEvidence: isZh
      ? `本月净销售额 ${formatMetricNumber(item.row.todayNetSales)}；上月 ${formatMetricNumber(item.row.yesterdayNetSales)}；订单 ${formatMetricNumber(item.row.todayOrders)} vs ${formatMetricNumber(item.row.yesterdayOrders)}。`
      : `This month net sales ${formatMetricNumber(item.row.todayNetSales)}; last month ${formatMetricNumber(item.row.yesterdayNetSales)}; orders ${formatMetricNumber(item.row.todayOrders)} vs ${formatMetricNumber(item.row.yesterdayOrders)}.`,
    businessJudgment: item.row.businessJudgment ?? "",
    recommendedAction: isZh ? "结合退货率、评分和明细订单判断是否为真实经营变化。" : "Check returns, ratings, and order detail to validate whether this is a true business change."
  }));
}

function monthlyRisks(kpis: Array<Record<string, unknown>>, dimensionTables: DimensionComparisonTable[], locale: "zh" | "en") {
  const isZh = locale === "zh";
  const byKind = (kind: string) => kpis.find((item) => item.metricKind === kind);
  const candidates = [
    { kind: "revenue", negative: -0.01, title: isZh ? "本月净销售额节奏低于上月" : "Monthly net sales pace is below last month", action: isZh ? "拆解订单、客单价和品类结构。" : "Break down orders, AOV, and category mix." },
    { kind: "orders", negative: -0.01, title: isZh ? "本月订单规模低于上月" : "Monthly order scale is below last month", action: isZh ? "检查流量、转化、库存和渠道投放。" : "Check traffic, conversion, stock, and channel spend." },
    { kind: "aov", negative: -0.01, title: isZh ? "客单价下降影响收入质量" : "AOV decline affects revenue quality", action: isZh ? "排查低价商品占比、折扣和组合购买变化。" : "Review low-price mix, discounts, and bundles." },
    { kind: "return_rate", positiveBad: 0.01, title: isZh ? "退货率上升可能侵蚀月度增长" : "Return rate increase may erode monthly growth", action: isZh ? "优先排查高收入高退货品类。" : "Inspect high-revenue, high-return categories first." },
    { kind: "rating", negative: -0.01, title: isZh ? "平均客户评分下降" : "Average customer rating declined", action: isZh ? "结合商品、渠道和履约记录定位体验问题。" : "Use product, channel, and fulfillment records to locate experience issues." },
    { kind: "fulfillment_days", positiveBad: 0.01, title: isZh ? "履约天数变长" : "Fulfillment days increased", action: isZh ? "排查履约变慢市场和渠道。" : "Inspect slower markets and channels." }
  ];
  const metricRisks = candidates.flatMap((candidate) => {
    const metric = byKind(candidate.kind);
    const change = metric?.percentChange as number | null | undefined;
    const risky = typeof change === "number" && (candidate.negative != null ? change <= candidate.negative : change >= (candidate.positiveBad ?? 1));
    if (!metric || !risky) return [];
    return [{
      id: `monthly-risk-${candidate.kind}`,
      title: candidate.title,
      badge: Math.abs(change) >= 0.05 ? "P1" : "P2",
      summary: isZh ? `${metric.title ?? candidate.kind} 较上月 ${formatPercent(change)}。` : `${metric.title ?? candidate.kind} changed ${formatPercent(change)} versus last month.`,
      keyEvidence: isZh ? `本月 ${formatMetricNumber(metric.currentValue)}；上月 ${formatMetricNumber(metric.previousValue)}。` : `This month ${formatMetricNumber(metric.currentValue)}; last month ${formatMetricNumber(metric.previousValue)}.`,
      businessJudgment: isZh ? "这是月度趋势性风险，需要结合结构拆解确认来源。" : "This is a monthly trend risk; confirm the source through structure breakdown.",
      recommendedAction: candidate.action
    }];
  });
  const highReturnRow = dimensionTables.flatMap((table) => table.rows.map((row) => ({ table, row }))).find((item) => Number(item.row.returnRateChange ?? 0) > 0.05);
  return [
    ...metricRisks,
    ...(highReturnRow ? [{
      id: "monthly-risk-high-return-object",
      title: isZh ? `${highReturnRow.row.name} 退货率上升` : `${highReturnRow.row.name} return rate increased`,
      badge: "P2",
      summary: isZh ? "高收入对象如果退货率上升，会削弱月度增长质量。" : "Rising returns in a key object can weaken monthly growth quality.",
      keyEvidence: isZh ? `退货率变化 ${formatPercent(highReturnRow.row.returnRateChange)}。` : `Return-rate change ${formatPercent(highReturnRow.row.returnRateChange)}.`,
      businessJudgment: highReturnRow.row.businessJudgment ?? "",
      recommendedAction: isZh ? "排查商品描述、尺码、物流、售后和负向评价。" : "Check descriptions, sizing, logistics, support, and negative feedback."
    }] : [])
  ].slice(0, 5);
}

function monthlyOpportunities(dimensionTables: DimensionComparisonTable[], locale: "zh" | "en") {
  const isZh = locale === "zh";
  return dimensionTables.flatMap((table) => table.rows.map((row) => ({ table, row })))
    .filter(({ row }) => Number(row.todayNetSales ?? 0) > 0 && Number(row.todayReturnRate ?? 0) <= 0.05)
    .sort((left, right) => Number(right.row.todayNetSales ?? 0) - Number(left.row.todayNetSales ?? 0))
    .slice(0, 5)
    .map(({ table, row }, index) => ({
      id: `monthly-opportunity-${table.type}-${index}-${row.id}`,
      title: isZh ? `${row.name} 可作为下月放量候选` : `${row.name} is a candidate for next-month scale-up`,
      badge: index === 0 ? "P1" : "P2",
      summary: isZh ? `${table.label} 本月收入较高且退货率可控。` : `${table.label} has meaningful revenue with controlled return rate this month.`,
      keyEvidence: isZh ? `净销售额 ${formatMetricNumber(row.todayNetSales)}；订单 ${formatMetricNumber(row.todayOrders)}；退货率 ${formatMetricNumber(row.todayReturnRate)}。` : `Net sales ${formatMetricNumber(row.todayNetSales)}; orders ${formatMetricNumber(row.todayOrders)}; return rate ${formatMetricNumber(row.todayReturnRate)}.`,
      businessJudgment: isZh ? "如果评分和履约保持稳定，该对象适合进入下月运营测试池。" : "If rating and fulfillment remain stable, this object is suitable for next-month testing.",
      recommendedAction: isZh ? "设计小流量曝光、组合包或渠道投放测试，并观察订单、AOV、评分和退货率。" : "Run small exposure, bundle, or channel tests and monitor orders, AOV, rating, and return rate."
    }));
}

function monthlyActions(risks: Array<Record<string, unknown>>, opportunities: Array<Record<string, unknown>>, locale: "zh" | "en") {
  const isZh = locale === "zh";
  return [
    {
      id: "monthly-action-driver",
      title: isZh ? "P1：拆解月度收入变化来源" : "P1: Break down monthly revenue drivers",
      summary: isZh ? "判断本月收入变化来自订单规模、客单价还是结构变化。" : "Identify whether monthly revenue movement came from orders, AOV, or mix.",
      keyEvidence: risks[0]?.keyEvidence ? String(risks[0].keyEvidence) : "",
      businessJudgment: isZh ? "这是制定下月目标和资源分配的基础。" : "This is the basis for next-month targets and resource allocation.",
      recommendedAction: isZh ? "观察指标：Net Sales、Orders、AOV、Category Net Sales。执行周期：下周内完成。" : "Metrics: Net Sales, Orders, AOV, Category Net Sales. Timing: complete next week."
    },
    {
      id: "monthly-action-risk",
      title: isZh ? "P2：处理高退货或评分下降对象" : "P2: Address high-return or declining-rating objects",
      summary: isZh ? "避免月度增长被退货损耗或体验问题抵消。" : "Prevent returns or experience issues from offsetting monthly growth.",
      keyEvidence: risks[0]?.title ? String(risks[0].title) : "",
      businessJudgment: isZh ? "质量风险应在下月放量前先处理。" : "Quality risks should be handled before scaling next month.",
      recommendedAction: isZh ? "观察指标：Return Rate、Average Rating、Refund Orders。执行周期：下月前两周。" : "Metrics: Return Rate, Average Rating, Refund Orders. Timing: first two weeks next month."
    },
    {
      id: "monthly-action-opportunity",
      title: isZh ? "P3：测试高质量机会对象曝光" : "P3: Test exposure for high-quality opportunities",
      summary: isZh ? "优先选择收入较高、退货可控、评分稳定的对象。" : "Prioritize objects with revenue, controlled returns, and stable ratings.",
      keyEvidence: opportunities[0]?.title ? String(opportunities[0].title) : "",
      businessJudgment: isZh ? "这类对象具备较低风险的下月放量潜力。" : "These objects have lower-risk scale-up potential for next month.",
      recommendedAction: isZh ? "观察指标：Orders、AOV、Average Rating、Return Rate。执行周期：下月第一周启动测试。" : "Metrics: Orders, AOV, Average Rating, Return Rate. Timing: start in the first week next month."
    }
  ];
}

export function composeSnapshotReport(input: ReportComposerInput) {
  if (input.reportDataAudit && !input.reportDataAudit.passed) {
    return validationFailureReport(input);
  }

  const isZh = input.locale === "zh";
  const generatedInsights = generated(input);

  return {
    reportMode: "snapshot_report" as const,
    reportTimeMode: "snapshot_report" as const,
    latestDataDate: isoDate(snapshotDate({ timeConfig: input.timeConfig, dateRange: input.dateRange, generatedAt: input.generatedAt ?? new Date() })),
    overview: isZh
      ? "当前数据缺少可用业务时间字段，已生成当前数据快照报告。"
      : "The current data has no usable business time field, so a snapshot report was generated.",
    keyFindings: businessCards(generatedInsights.keyFindings, "finding", input.locale, 5),
    risks: businessCards(generatedInsights.businessRisks, "risk", input.locale, 5),
    opportunities: businessCards(generatedInsights.growthOpportunities, "opportunity", input.locale, 5),
    priorityActions: businessCards(generatedInsights.nextActionPlan?.actionInsights ?? generatedInsights.recommendedActions, "action", input.locale, 5),
    dataCaveats: dataCaveatCards(generatedInsights.dataLimitations, input.locale, false)
  };
}

export function composeCustomReport(input: ReportComposerInput) {
  if (input.reportDataAudit && !input.reportDataAudit.passed) {
    return validationFailureReport(input);
  }

  const isZh = input.locale === "zh";
  const auditedLatestDate = asDate(input.reportDataAudit?.latestDataDate ?? null);
  const latestDate = auditedLatestDate ??
    latestTrendDate(input.trendMetrics) ??
    snapshotDate({ timeConfig: input.timeConfig, dateRange: input.dateRange, generatedAt: input.generatedAt ?? new Date() });
  const currentStart = asDate(input.dateRange.startDate) ?? new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
  const currentEnd = asDate(input.dateRange.endDate) ?? latestDate;
  const previousStart = asDate(input.dateRange.previousStartDate) ?? new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
  const previousEnd = asDate(input.dateRange.previousEndDate) ?? new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);
  const monthEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 0);
  const currentMonthComplete = isoDate(currentEnd) === isoDate(monthEnd);
  const comparisonPeriod = buildComparisonPeriod({
    selectedRange: "CUSTOM",
    latestDataDate: latestDate,
    reportMode: "custom_report",
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  });
  const generatedInsights = generated(input);
  const monthlyMetrics = mergeDailyBusinessMetrics(
    periodBusinessMetricsFromResults(input.metricResults, comparisonPeriod, input.locale),
    dailyBusinessMetrics(input.trendMetrics, input.locale)
  );
  const monthlyKpis = periodMetricCards(monthlyMetrics, comparisonPeriod, input.locale, {
    idPrefix: "monthly-kpi",
    currentLabel: isZh ? "本月累计" : "This month",
    previousLabel: isZh ? "上月" : "Last month"
  });
  const monthlyDimensionComparisons = buildMonthlyDimensionComparisons(input.metricResults, input.locale);
  const monthlyTrends = monthlyTrendCards(input.trendMetrics, comparisonPeriod, input.locale);
  const monthlyDailyAverages = monthlyDailyAverageCards(monthlyKpis, comparisonPeriod.currentDays, comparisonPeriod.previousDays, input.locale);
  const keyFindings = monthlyKpiSummary({
    kpis: monthlyKpis,
    currentDays: comparisonPeriod.currentDays,
    previousDays: comparisonPeriod.previousDays,
    currentEnd: comparisonPeriod.currentEnd,
    incomplete: !currentMonthComplete,
    locale: input.locale
  }).map((summary, index) => ({
    id: `monthly-summary-${index}`,
    title: isZh ? `月度核心摘要 ${index + 1}` : `Monthly summary ${index + 1}`,
    summary,
    businessJudgment: summary
  }));
  const changeDrivers = monthlyChangeDrivers(monthlyKpis, monthlyDimensionComparisons, input.locale);
  const topMovers = monthlyTopMovers(monthlyDimensionComparisons, input.locale);
  const risks = monthlyRisks(monthlyKpis, monthlyDimensionComparisons, input.locale);
  const opportunities = monthlyOpportunities(monthlyDimensionComparisons, input.locale);
  const nextMonthActions = monthlyActions(risks, opportunities, input.locale);
  const incompleteCaveat = {
    id: "monthly-incomplete-period",
    title: currentMonthComplete ? (isZh ? "当前月份完整" : "Current month is complete") : (isZh ? "当前月份尚未结束" : "Current month is not complete"),
    keyEvidence: isZh
      ? `本月周期：${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)}；对比周期：${rangeLabel(comparisonPeriod.previousStart, comparisonPeriod.previousEnd, input.locale)}。`
      : `Current month: ${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)}; comparison period: ${rangeLabel(comparisonPeriod.previousStart, comparisonPeriod.previousEnd, input.locale)}.`,
    businessJudgment: currentMonthComplete
      ? (isZh ? "当前月为完整自然月，可直接进行月度复盘。" : "The current month is complete and can be reviewed directly.")
      : (isZh ? "当前月份尚未结束，本报告展示月内累计表现。与完整上月对比时，建议同时查看日均指标，避免直接用累计值误判。" : "The current month is not complete. Use month-to-date totals together with daily averages when comparing with a full last month."),
    recommendedAction: currentMonthComplete ? "" : (isZh ? "优先使用日均净销售额、日均订单数、日均客户数和日均销售件数判断经营节奏。" : "Prioritize average daily net sales, orders, customers, and units to judge pace.")
  };

  return {
    reportMode: "custom_report" as const,
    reportTimeMode: input.timeConfig?.hasTimeField === false ? "snapshot_report" as const : "monthly_business_review" as const,
    reportTitle: isZh
      ? `${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)} 月经营分析`
      : `${rangeLabel(comparisonPeriod.currentStart, comparisonPeriod.currentEnd, input.locale)} Monthly Business Review`,
    latestDataDate: isoDate(latestDate),
    currentMonthStart: isoDate(comparisonPeriod.currentStart),
    currentMonthEnd: isoDate(comparisonPeriod.currentEnd),
    comparisonMonthStart: isoDate(comparisonPeriod.previousStart),
    comparisonMonthEnd: isoDate(comparisonPeriod.previousEnd),
    selectedMonth: isoDate(comparisonPeriod.currentStart)?.slice(0, 7),
    comparisonType: "previous_month",
    currentMonthComplete,
    currentDays: comparisonPeriod.currentDays,
    previousDays: comparisonPeriod.previousDays,
    totalRows: input.reportDataAudit?.totalRows ?? null,
    fullDataValidated: input.reportDataAudit ? input.reportDataAudit.passed && input.reportDataAudit.usesFullData : null,
    monthlyKpis,
    monthlyDailyAverages,
    monthlyDimensionComparisons,
    keyFindings,
    monthlyTrends,
    changeDrivers,
    topMovers,
    monthlyRisks: risks,
    monthlyOpportunities: opportunities,
    nextMonthActions,
    dataCaveats: dedupeCards([
      incompleteCaveat,
      ...dataCaveatCards(generatedInsights.dataLimitations, input.locale, input.timeConfig?.hasTimeField !== false)
    ], 5),
    structuredReport: input.structuredReport ?? null,
    metricResults: input.metricResults,
    trendMetrics: input.trendMetrics ?? [],
    trendCharts: input.trendCharts ?? []
  };
}

export function composeReport(input: ReportComposerInput) {
  const mode = effectiveReportMode({
    requestedReportMode: input.requestedReportMode,
    hasTimeField: input.timeConfig?.hasTimeField !== false
  });

  if (mode === "daily_brief") return composeDailyBrief({ ...input, requestedReportMode: mode });
  if (mode === "weekly_report") return composeWeeklyReport({ ...input, requestedReportMode: mode });
  if (mode === "snapshot_report") return composeSnapshotReport({ ...input, requestedReportMode: mode });
  return composeCustomReport({ ...input, requestedReportMode: mode });
}

export function reportHistoryTitle(mode: ReportMode, timeMode: ReportTimeMode | string, locale: "zh" | "en") {
  const isZh = locale === "zh";
  if (mode === "daily_brief") return isZh ? "每日简报" : "Daily Brief";
  if (mode === "weekly_report") return isZh ? "周经营报告" : "Weekly Report";
  if (mode === "snapshot_report" || timeMode === "snapshot_report") return isZh ? "数据快照报告" : "Snapshot Report";
  return isZh ? "月经营分析" : "Monthly Business Review";
}
