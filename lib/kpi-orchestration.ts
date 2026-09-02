import { DataSourceType, type DataSourceConnection, type MetricDefinition } from "@prisma/client";
import { detectRegistryIndustry } from "@/lib/metrics/industry-detector";
import type { SchemaTable } from "@/lib/metric-validation";

type DataSourcePriority = "database" | "file" | "storage";
type IndustryContext = "logistics_service_kpi" | "ecommerce" | "saas" | "ads" | "generic";
type MetricGenerationPath = "business_metric_registry" | "semantic_kpi_asset_library" | "generic_semantic_metrics";

export type KpiExecutionStep =
  | "data_source_selected"
  | "industry_detected"
  | "metrics_generated"
  | "metrics_computed"
  | "aggregation_completed"
  | "consistency_checked"
  | "ai_invoked"
  | "report_generated";

export type KpiOrchestrationPlan = {
  selected_data_source: string;
  industry: IndustryContext;
  metric_generation_path: MetricGenerationPath;
  execution_steps: KpiExecutionStep[];
  warnings: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dataSourcePriority(source: Pick<DataSourceConnection, "type">): DataSourcePriority {
  if (source.type === DataSourceType.MYSQL || source.type === DataSourceType.POSTGRESQL) return "database";
  if (source.type === DataSourceType.CSV || source.type === DataSourceType.EXCEL) return "file";
  return "storage";
}

function dataSourcePriorityRank(priority: DataSourcePriority) {
  if (priority === "database") return 0;
  if (priority === "file") return 1;
  return 2;
}

function metricGeneratedFrom(metric: Pick<MetricDefinition, "lineageJson">) {
  const lineage = asRecord(metric.lineageJson);

  if (lineage.generatedFrom === "business_metric_registry") return "business_metric_registry";
  if (lineage.generatedFrom === "semantic_kpi_asset_library" || lineage.businessType === "semantic_kpi_asset") return "semantic_kpi_asset_library";

  return "generic_semantic_metrics";
}

function detectIndustryContext(tables: SchemaTable[]): IndustryContext {
  const detected = detectRegistryIndustry(tables);

  if (detected.industry === "logistics_service_kpi") return "logistics_service_kpi";
  if (detected.industry === "ecommerce") return "ecommerce";
  return "generic";
}

function selectMetricPath(industry: IndustryContext, metrics: MetricDefinition[]): MetricGenerationPath {
  const registryMetrics = metrics.filter((metric) => metricGeneratedFrom(metric) === "business_metric_registry");
  const semanticMetrics = metrics.filter((metric) => metricGeneratedFrom(metric) === "semantic_kpi_asset_library");

  if (registryMetrics.length > 0) return "business_metric_registry";
  if (semanticMetrics.length > 0) return "semantic_kpi_asset_library";
  return "generic_semantic_metrics";
}

export function selectKpiExecutionDataSources<T extends Pick<DataSourceConnection, "type" | "updatedAt">>(dataSources: T[]) {
  const ranked = [...dataSources].sort((left, right) => {
    const priorityDelta = dataSourcePriorityRank(dataSourcePriority(left)) - dataSourcePriorityRank(dataSourcePriority(right));
    if (priorityDelta !== 0) return priorityDelta;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
  const selectedPriority = ranked[0] ? dataSourcePriority(ranked[0]) : null;

  if (!selectedPriority) return [];

  return ranked.filter((source) => dataSourcePriority(source) === selectedPriority);
}

export function buildKpiOrchestrationPlan(input: {
  dataSources: DataSourceConnection[];
  tables: SchemaTable[];
  metrics: MetricDefinition[];
}): KpiOrchestrationPlan {
  const selectedDataSources = selectKpiExecutionDataSources(input.dataSources);
  const industry = detectIndustryContext(input.tables);
  const metric_generation_path = selectMetricPath(industry, input.metrics);
  const warnings: string[] = [];

  if (selectedDataSources.length < input.dataSources.length) {
    warnings.push("lower_priority_data_sources_excluded_from_execution");
  }

  if (industry === "logistics_service_kpi" && metric_generation_path !== "business_metric_registry") {
    warnings.push("logistics_registry_unavailable_fell_back_to_non_registry_metrics");
  }

  return {
    selected_data_source: selectedDataSources.map((source) => source.name).join(", "),
    industry,
    metric_generation_path,
    execution_steps: [
      "data_source_selected",
      "industry_detected",
      "metrics_generated"
    ],
    warnings
  };
}

export function metricsForKpiExecution(input: {
  industry: IndustryContext;
  metricGenerationPath: MetricGenerationPath;
  metrics: MetricDefinition[];
}) {
  const selected = input.metrics.filter((metric) => metricGeneratedFrom(metric) === input.metricGenerationPath);

  if (selected.length > 0) return selected;

  return input.metrics;
}

export function markKpiExecutionStep(plan: KpiOrchestrationPlan, step: KpiExecutionStep) {
  if (plan.execution_steps.includes(step)) return plan;

  return {
    ...plan,
    execution_steps: [...plan.execution_steps, step]
  };
}
