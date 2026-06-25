import type { ReportMetricCachePayload } from "@/lib/report-metric-cache";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildKpiRuntimeApiResponse(input: {
  status: "cached" | "completed" | "failed";
  payload?: ReportMetricCachePayload | Record<string, unknown> | null;
  jobId?: string | null;
  reportId?: string | null;
  computedMetricCount?: number;
  message?: string;
}) {
  const payload = asRecord(input.payload);
  const composedReports = asRecord(payload.composedReports);
  const reportMode = String(payload.reportMode ?? payload.requestedReportMode ?? "");
  const report = composedReports[reportMode] ?? payload.reportSpec ?? payload.structuredReport ?? null;
  const metricResults = Array.isArray(payload.metricResults) ? payload.metricResults : [];
  const finalMetricResults = Array.isArray(payload.final_metricResults) ? payload.final_metricResults : [];
  const aggregationResults = Array.isArray(payload.aggregationResults) ? payload.aggregationResults : [];
  const aiInsights = payload.aiReport ?? payload.structuredReport ?? null;

  return {
    status: input.status,
    report,
    metrics: {
      metricResults,
      final_metricResults: finalMetricResults,
      count: input.computedMetricCount ?? metricResults.length
    },
    aggregation: {
      aggregationResults,
      count: aggregationResults.length
    },
    ai_insights: aiInsights,
    metadata: {
      jobId: input.jobId ?? null,
      reportId: input.reportId ?? null,
      generatedAt: payload.generatedAt ?? null,
      reportMode: payload.reportMode ?? null,
      requestedReportMode: payload.requestedReportMode ?? null,
      dateRange: payload.dateRange ?? null,
      dataSourceIds: payload.dataSourceIds ?? [],
      dataSourceName: payload.dataSourceName ?? null,
      metricRegistryId: payload.metricRegistryId ?? null,
      kpiOrchestrationPlan: payload.kpiOrchestrationPlan ?? null,
      cache: payload.cache ?? null,
      message: input.message ?? null
    }
  };
}
