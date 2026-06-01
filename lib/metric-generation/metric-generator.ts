import { detectBusinessEntities } from "@/lib/metric-generation/entity-detector";
import { detectIndustry, detectTableIndustry } from "@/lib/metric-generation/industry-detector";
import { generateMetricsForIndustry } from "@/lib/metric-generation/metric-templates";
import type {
  MetricGenerationInput,
  MetricGenerationOutput,
  RejectedMetric
} from "@/lib/metric-generation/metric-types";

function dedupeRejected(items: RejectedMetric[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.name}:${item.reason}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function generateIndustryAwareMetrics(input: MetricGenerationInput): MetricGenerationOutput {
  const detectedIndustry = detectIndustry(input);
  const businessEntities = detectBusinessEntities(input);
  const generated = input.tables.map((table) => {
    const tableIndustry = detectTableIndustry(table);
    return generateMetricsForIndustry(table, tableIndustry);
  });
  const metrics = generated.flatMap((result) => result.metrics);
  const rejectedMetrics = dedupeRejected(generated.flatMap((result) => result.rejectedMetrics));

  return {
    detectedIndustry,
    businessEntities,
    metrics,
    rejectedMetrics
  };
}
