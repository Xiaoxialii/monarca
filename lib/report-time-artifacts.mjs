import {
  isValidTrendMetricName,
  isValidTrendSeries,
  normalizeTrendFieldName
} from "./report-trend-guardrails.mjs";

function trendDirection(currentValue, previousValue) {
  if (currentValue == null || previousValue == null || previousValue === 0) return "unknown";
  const deltaPercent = (currentValue - previousValue) / Math.abs(previousValue);

  if (Math.abs(deltaPercent) < 0.01) return "flat";
  return deltaPercent > 0 ? "up" : "down";
}

function canonicalTrendMetricKey(name = "") {
  const normalized = normalizeTrendFieldName(name);

  if (/customer.*rating|rating|score/.test(normalized)) return "average_rating";
  if (/gross.*sales|estimated.*gmv|gmv|revenue|sales/.test(normalized)) return "sales";
  if (/discount/.test(normalized)) return "discount";
  if (/total.*orders|order.*count|orders|records/.test(normalized)) return "orders";
  if (/total.*customers|customer.*count|customers|users/.test(normalized)) return "customers";
  if (/average.*order.*value|aov/.test(normalized)) return "average_order_value";
  if (/installs/.test(normalized)) return "installs";
  if (/reviews|review.*volume/.test(normalized)) return "reviews";
  if (/negative.*sentiment/.test(normalized)) return "negative_sentiment_rate";
  if (/conversion|cvr/.test(normalized)) return "conversion_rate";
  if (/close.*price|close/.test(normalized)) return "close_price";
  if (/trading.*volume|volume/.test(normalized)) return "volume";

  return normalized;
}

function metricDisplayName(metricName = "", locale = "zh") {
  const key = canonicalTrendMetricKey(metricName);
  const isZh = locale === "zh";

  if (!isZh) {
    const labels = {
      average_rating: "Average Customer Rating",
      sales: "Sales",
      discount: "Discount Amount",
      orders: "Orders",
      customers: "Customers",
      average_order_value: "Average Order Value",
      installs: "Installs",
      reviews: "Reviews",
      negative_sentiment_rate: "Negative Sentiment Rate",
      conversion_rate: "Conversion Rate",
      close_price: "Close Price",
      volume: "Volume"
    };
    return labels[key] ?? String(metricName).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  }

  const labels = {
    average_rating: "平均客户评分",
    sales: "销售额",
    discount: "折扣金额",
    orders: "订单数",
    customers: "客户数",
    average_order_value: "平均客单价",
    installs: "安装量",
    reviews: "评论量",
    negative_sentiment_rate: "负向反馈率",
    conversion_rate: "转化率",
    close_price: "收盘价",
    volume: "交易量"
  };

  return labels[key] ?? String(metricName).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
}

function metricPriority(metricName = "", businessType = "generic") {
  const key = canonicalTrendMetricKey(metricName);
  const business = normalizeTrendFieldName(businessType);
  const ecommercePriority = ["sales", "orders", "customers", "average_order_value", "average_rating", "discount"];
  const appPriority = ["installs", "reviews", "average_rating", "negative_sentiment_rate"];
  const financePriority = ["close_price", "volume"];
  const defaultPriority = ["sales", "orders", "customers", "installs", "reviews", "average_rating", "discount", "conversion_rate", "volume"];
  const priority = /ecommerce|sales|orders/.test(business)
    ? ecommercePriority
    : /app|review/.test(business)
      ? appPriority
      : /finance/.test(business)
        ? financePriority
        : defaultPriority;
  const index = priority.indexOf(key);

  return index >= 0 ? index : priority.length + 20;
}

function isRatingMetric(metricName = "") {
  return canonicalTrendMetricKey(metricName) === "average_rating";
}

function hasValidBusinessRange(metricName, rows = []) {
  if (!isRatingMetric(metricName)) return true;

  return rows.every((row) => {
    const value = Number(row.value);
    return Number.isFinite(value) && value >= 0 && value <= 5;
  });
}

function chartTypeForMetric(metricName = "") {
  return /orders|reviews|installs|tickets|records|volume/i.test(metricName) ? "bar_chart" : "line_chart";
}

function trendInsight(metricName = "", rows = [], locale = "zh") {
  const isZh = locale === "zh";
  const label = metricDisplayName(metricName, locale);
  const usableRows = rows
    .map((row) => ({ period: row.period, value: Number(row.value) }))
    .filter((row) => Number.isFinite(row.value));

  if (usableRows.length < 2) {
    return isZh ? `${label}可用趋势点不足，暂不判断变化。` : `${label} has too few trend points to infer a change.`;
  }

  const first = usableRows[0];
  const last = usableRows.at(-1);
  const max = usableRows.reduce((best, row) => row.value > best.value ? row : best, usableRows[0]);
  const change = first.value ? (last.value - first.value) / Math.abs(first.value) : 0;

  if (/discount/.test(canonicalTrendMetricKey(metricName))) {
    return isZh
      ? `${label}在 ${max.period} 达到高点，可能对应促销或折扣活动。`
      : `${label} peaked around ${max.period}, which may align with promotion or discount activity.`;
  }

  if (isRatingMetric(metricName)) {
    const range = Math.max(...usableRows.map((row) => row.value)) - Math.min(...usableRows.map((row) => row.value));
    return isZh
      ? `${label}${range < 0.3 ? "整体较稳定" : "出现波动"}，最近一期为 ${last.period}。`
      : `${label} is ${range < 0.3 ? "mostly stable" : "moving noticeably"}, with ${last.period} as the latest period.`;
  }

  if (Math.abs(change) < 0.05) {
    return isZh
      ? `${label}整体较稳定，峰值出现在 ${max.period}。`
      : `${label} is broadly stable, with a peak around ${max.period}.`;
  }

  if (change > 0) {
    return isZh
      ? `${label}从 ${first.period} 到 ${last.period} 整体上升，峰值出现在 ${max.period}。`
      : `${label} increased from ${first.period} to ${last.period}, peaking around ${max.period}.`;
  }

  return isZh
    ? `${label}在 ${max.period} 达到峰值后回落，最近一期为 ${last.period}。`
    : `${label} peaked around ${max.period} and then pulled back by ${last.period}.`;
}

function dedupeTrendCandidates(candidates = []) {
  const byKey = new Map();

  for (const candidate of candidates.sort((left, right) => left.priority - right.priority)) {
    const key = [
      canonicalTrendMetricKey(candidate.trend.metric),
      normalizeTrendFieldName(candidate.trend.dateField ?? ""),
      candidate.trend.bucket
    ].join("|");
    const existing = byKey.get(key);

    if (!existing || candidate.priority < existing.priority) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => left.priority - right.priority);
}

export function buildReportTimeArtifacts(aggregationResults = [], dateRange = { preset: "30D" }, locale = "zh") {
  const timeTrendCandidates = aggregationResults.flatMap((aggregation) =>
    (aggregation.timeTrends ?? [])
      .filter((trend) => isValidTrendMetricName(trend.metric))
      .filter((trend) => isValidTrendSeries({
        metricName: trend.metric,
        yAxis: trend.metric,
        values: (trend.rows ?? []).map((row) => row.value)
      }))
      .filter((trend) => hasValidBusinessRange(trend.metric, trend.rows ?? []))
      .map((trend) => ({
        aggregation,
        trend,
        priority: metricPriority(trend.metric, aggregation.businessType)
      }))
  );
  const timeTrends = dedupeTrendCandidates(timeTrendCandidates);

  if (timeTrends.length === 0) {
    return {
      timeConfig: {
        hasTimeField: false,
        availableTimeFields: [],
        selectedRange: dateRange.preset,
        granularity: "month",
        dateRangePreset: dateRange.preset,
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null
      },
      trendMetrics: [],
      trendCharts: []
    };
  }

  const periods = timeTrends.flatMap(({ trend }) => (trend.rows ?? []).map((row) => new Date(row.period)));
  const validPeriods = periods.filter((date) => Number.isFinite(date.getTime())).sort((left, right) => left.getTime() - right.getTime());
  const spanDays = validPeriods.length > 1 ? (validPeriods.at(-1).getTime() - validPeriods[0].getTime()) / 86_400_000 : 0;
  const hasFinanceTrend = timeTrends.some(({ aggregation }) => aggregation.businessType === "finance_timeseries");
  const defaultRange = hasFinanceTrend ? "12M" : spanDays >= 30 ? "30D" : "ALL";
  const firstTrend = timeTrends[0]?.trend;
  const trendMetrics = timeTrends.map(({ aggregation, trend }) => {
    const rows = trend.rows ?? [];
    const last = rows.at(-1)?.value ?? null;
    const previous = rows.at(-2)?.value ?? null;
    const absoluteChange = last != null && previous != null ? last - previous : null;
    const percentChange = absoluteChange != null && previous ? absoluteChange / Math.abs(previous) : null;
    const displayName = metricDisplayName(trend.metric, locale);

    return {
      metricName: displayName,
      sourceMetricName: trend.metric,
      canonicalMetricKey: canonicalTrendMetricKey(trend.metric),
      businessModule: aggregation.businessType,
      dateField: trend.dateField,
      granularity: trend.bucket,
      currentValue: last,
      previousValue: previous,
      absoluteChange,
      percentChange,
      trendDirection: trendDirection(last, previous),
      timeSeries: rows.map((row) => ({ date: row.period, value: row.value }))
    };
  });

  return {
    timeConfig: {
      hasTimeField: true,
      defaultTimeField: firstTrend?.dateField,
      availableTimeFields: Array.from(new Set(timeTrends.flatMap(({ trend }) => trend.dateField ? [trend.dateField] : []))),
      selectedRange: dateRange.preset === "ALL" ? defaultRange : dateRange.preset,
      granularity: firstTrend?.bucket ?? "month",
      dateRangePreset: dateRange.preset,
      startDate: dateRange.startDate ?? null,
      endDate: dateRange.endDate ?? null
    },
    trendMetrics,
    trendCharts: trendMetrics.slice(0, 5).map((metric) => ({
      id: `trend-${metric.canonicalMetricKey}-${normalizeTrendFieldName(metric.dateField ?? "date")}`,
      title: locale === "zh" ? `${metric.metricName}趋势` : `${metric.metricName} trend`,
      chartType: chartTypeForMetric(metric.canonicalMetricKey),
      xAxis: metric.dateField ?? "date",
      yAxis: metric.metricName,
      sourceMetricName: metric.sourceMetricName,
      canonicalMetricKey: metric.canonicalMetricKey,
      series: metric.timeSeries,
      description: locale === "zh" ? `按 ${metric.dateField ?? "业务时间"} 展示指标变化。` : `Shows changes by ${metric.dateField ?? "business time"}.`,
      insightHint: trendInsight(metric.sourceMetricName, metric.timeSeries.map((row) => ({ period: row.date, value: row.value })), locale)
    }))
  };
}

export { canonicalTrendMetricKey, metricDisplayName };
