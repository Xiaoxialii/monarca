import type { AggregationResult } from "./report-generation/report-types";

export type ReportTimeArtifactRange = {
  preset: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type ReportTimeArtifacts = {
  timeConfig: {
    hasTimeField: boolean;
    defaultTimeField?: string;
    availableTimeFields: string[];
    selectedRange: string;
    granularity: string;
    dateRangePreset: string;
    startDate: string | null;
    endDate: string | null;
  };
  trendMetrics: Array<{
    metricName: string;
    sourceMetricName?: string;
    canonicalMetricKey?: string;
    businessModule?: string;
    dateField?: string;
    granularity?: string;
    currentValue: number | null;
    previousValue: number | null;
    absoluteChange: number | null;
    percentChange: number | null;
    trendDirection: "up" | "down" | "flat" | "unknown";
    timeSeries: Array<{ date: string; value: number | null }>;
  }>;
  trendCharts: Array<{
    id: string;
    title: string;
    chartType: "bar_chart" | "line_chart";
    xAxis: string;
    yAxis: string;
    sourceMetricName?: string;
    canonicalMetricKey?: string;
    series: Array<{ date: string; value: number | null }>;
    description: string;
    insightHint: string;
  }>;
};

export function buildReportTimeArtifacts(
  aggregationResults?: AggregationResult[],
  dateRange?: ReportTimeArtifactRange,
  locale?: "zh" | "en"
): ReportTimeArtifacts;
export function canonicalTrendMetricKey(name?: string): string;
export function metricDisplayName(metricName?: string, locale?: "zh" | "en"): string;
