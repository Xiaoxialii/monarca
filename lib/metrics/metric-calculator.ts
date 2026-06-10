import type { MetricDefinition } from "@prisma/client";
import { computeMetricResultsForContexts, type MetricResultContext } from "@/lib/metric-results";
import type { ResolvedReportDateRange } from "@/lib/report-date-range";
import { registryFromMetricDefinitions } from "@/lib/metrics/metric-registry";

export async function calculateVerifiedMetrics({
  contexts,
  metrics,
  dateRange
}: {
  contexts: MetricResultContext[];
  metrics: MetricDefinition[];
  dateRange: ResolvedReportDateRange;
}) {
  const metricRegistryId = registryFromMetricDefinitions(metrics);
  const metricResults = await computeMetricResultsForContexts({ contexts, metrics, dateRange });

  return {
    metricRegistryId,
    verifiedMetrics: metricResults,
    metricResults
  };
}

