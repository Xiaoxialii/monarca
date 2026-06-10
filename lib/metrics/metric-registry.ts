import { createHash } from "node:crypto";
import { MetricExpressionType, MetricLayer, MetricMaintainerRole, MetricStatus, type Prisma, type PrismaClient } from "@prisma/client";
import type { SchemaTable } from "@/lib/metric-validation";
import { detectRegistryIndustry } from "@/lib/metrics/industry-detector";
import { ecommerceMetricRegistryForTable, type BusinessMetricDefinition } from "@/lib/metrics/ecommerce-metrics";

type RegistryClient = PrismaClient | Prisma.TransactionClient;

export type BusinessMetricRegistry = {
  metricRegistryId: string;
  industry: "ecommerce" | "generic";
  version: number;
  sourceSignature: string;
  definitions: BusinessMetricDefinition[];
  missingCoreMetrics: Array<{ metricId: string; businessName: string; reason: string }>;
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sourceSignature(tables: SchemaTable[]) {
  return stableHash(tables.map((table) => ({
    name: table.name,
    schema: table.schema ?? null,
    columns: table.columns.map((column) => ({
      name: normalize(column.name),
      type: column.type ?? "unknown"
    })).sort((left, right) => left.name.localeCompare(right.name))
  })).sort((left, right) => `${left.schema ?? ""}.${left.name}`.localeCompare(`${right.schema ?? ""}.${right.name}`)));
}

function metricName(definition: BusinessMetricDefinition) {
  return definition.metricId
    .split("_")
    .map((part) => part.toUpperCase() === "AOV" ? "AOV" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceFieldsFromFormula(formula: string) {
  const refs = Array.from(formula.matchAll(/([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/g));
  const seen = new Set<string>();

  return refs.flatMap((match) => {
    const table = match[1];
    const field = match[2];
    const key = `${table}.${field}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ table, field }];
  });
}

function coreMissing(definitions: BusinessMetricDefinition[]) {
  const present = new Set(definitions.map((definition) => definition.metricId));
  const required = [
    ["net_sales", "净销售额"],
    ["orders", "订单数"],
    ["customers", "客户数"],
    ["aov", "平均客单价"],
    ["total_paid", "实付金额"],
    ["units_sold", "销售件数"],
    ["return_rate", "退货率"],
    ["average_rating", "平均客户评分"],
    ["fulfillment_days", "平均履约天数"]
  ];

  return required.flatMap(([metricId, businessName]) =>
    present.has(metricId) ? [] : [{ metricId, businessName, reason: "字段缺失，未生成替代口径。" }]
  );
}

export function buildBusinessMetricRegistry({
  tables
}: {
  tables: SchemaTable[];
  semanticLayer?: unknown;
}): BusinessMetricRegistry {
  const detection = detectRegistryIndustry(tables);
  const definitions = detection.industry === "ecommerce"
    ? tables.flatMap((table) => ecommerceMetricRegistryForTable(table))
    : [];
  const source = sourceSignature(tables);
  const registryHash = stableHash({
    industry: detection.industry,
    source,
    definitions: definitions.map((definition) => ({
      metricId: definition.metricId,
      formula: definition.formula,
      requiredFields: definition.requiredFields,
      businessName: definition.businessName
    }))
  });

  return {
    metricRegistryId: `${detection.industry}:${registryHash}`,
    industry: detection.industry,
    version: 1,
    sourceSignature: source,
    definitions,
    missingCoreMetrics: detection.industry === "ecommerce" ? coreMissing(definitions) : []
  };
}

export async function upsertBusinessMetricRegistryDefinitions(
  client: RegistryClient,
  {
    workspaceId,
    userId,
    registry
  }: {
    workspaceId: string;
    userId?: string | null;
    registry: BusinessMetricRegistry;
  }
) {
  if (registry.definitions.length === 0) return 0;

  const names = registry.definitions.map(metricName);

  await client.metricDefinition.updateMany({
    where: {
      workspaceId,
      maintainerRole: MetricMaintainerRole.AI,
      isActive: true,
      name: { notIn: names }
    },
    data: { isActive: false }
  });

  for (const definition of registry.definitions) {
    await client.metricDefinition.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: metricName(definition)
        }
      },
      create: {
        workspaceId,
        layer: definition.level === 1 ? MetricLayer.PRIMARY : MetricLayer.DRIVER,
        category: definition.category,
        name: metricName(definition),
        definition: definition.description,
        formula: definition.formula,
        expressionType: definition.formula.includes("SAFE_DIVIDE") ? MetricExpressionType.RATE : MetricExpressionType.AGGREGATE,
        unit: definition.displayFormat,
        mappingJson: {
          sourceFields: sourceFieldsFromFormula(definition.formula)
        },
        lineageJson: {
          generatedFrom: "business_metric_registry",
          metricRegistryId: registry.metricRegistryId,
          metricId: definition.metricId,
          businessName: definition.businessName,
          level: definition.level,
          displayName: definition.businessName,
          metricType: definition.level === 1 ? "core_metric" : "driver_metric",
          metricCategory: definition.category,
          businessType: registry.industry,
          requiredFields: definition.requiredFields,
          fallbackFormula: definition.fallbackFormula,
          dimension: definition.dimension ?? null,
          displayFormat: definition.displayFormat,
          priority: definition.priority,
          isEstimated: definition.isEstimated,
          allowedReports: definition.allowedReports,
          validation: {
            validation_status: "valid",
            validation_errors: [],
            validation_warnings: []
          }
        },
        isActive: true,
        maintainerRole: MetricMaintainerRole.AI,
        maintainerUserId: userId ?? null,
        status: MetricStatus.AI_READY,
        tagsJson: ["metric_registry", registry.industry, `level_${definition.level}`]
      },
      update: {
        isActive: true,
        layer: definition.level === 1 ? MetricLayer.PRIMARY : MetricLayer.DRIVER,
        category: definition.category,
        definition: definition.description,
        formula: definition.formula,
        expressionType: definition.formula.includes("SAFE_DIVIDE") ? MetricExpressionType.RATE : MetricExpressionType.AGGREGATE,
        unit: definition.displayFormat,
        mappingJson: {
          sourceFields: sourceFieldsFromFormula(definition.formula)
        },
        lineageJson: {
          generatedFrom: "business_metric_registry",
          metricRegistryId: registry.metricRegistryId,
          metricId: definition.metricId,
          businessName: definition.businessName,
          level: definition.level,
          displayName: definition.businessName,
          metricType: definition.level === 1 ? "core_metric" : "driver_metric",
          metricCategory: definition.category,
          businessType: registry.industry,
          requiredFields: definition.requiredFields,
          fallbackFormula: definition.fallbackFormula,
          dimension: definition.dimension ?? null,
          displayFormat: definition.displayFormat,
          priority: definition.priority,
          isEstimated: definition.isEstimated,
          allowedReports: definition.allowedReports,
          validation: {
            validation_status: "valid",
            validation_errors: [],
            validation_warnings: []
          }
        },
        maintainerUserId: userId ?? null,
        status: MetricStatus.AI_READY,
        tagsJson: ["metric_registry", registry.industry, `level_${definition.level}`]
      }
    });
  }

  return registry.definitions.length;
}

export function registryFromMetricDefinitions(metrics: Array<{ lineageJson: unknown }>) {
  const registryIds = new Set<string>();

  for (const metric of metrics) {
    const lineage = metric.lineageJson && typeof metric.lineageJson === "object" && !Array.isArray(metric.lineageJson)
      ? metric.lineageJson as Record<string, unknown>
      : {};
    if (typeof lineage.metricRegistryId === "string") registryIds.add(lineage.metricRegistryId);
  }

  return registryIds.size === 1 ? Array.from(registryIds)[0] : null;
}
