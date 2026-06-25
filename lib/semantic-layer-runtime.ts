import { createHash } from "node:crypto";
import type { DataSourceConnection, MetricDefinition, PrismaClient, SchemaSnapshot } from "@prisma/client";
import { metricBelongsToTables } from "@/lib/metric-visibility";
import { tablesFromSchemaJson, type SchemaTable } from "@/lib/metric-validation";
import { detectRegistryIndustry, type RegistryIndustry } from "@/lib/metrics/industry-detector";

export type SemanticDomain = "ecommerce" | "ads" | "logistics" | "finance" | "generic";

export type SemanticContext = {
  workspaceId: string;
  dataSourceId: string;
  domain: SemanticDomain;
  schemaSnapshot: unknown;
  metricRegistry: Record<string, unknown>;
  allowedMetrics: string[];
  allowedMetricIds: string[];
  allowedDimensions: string[];
  snapshotVersion: string;
  schemaHash: string;
  trace: {
    runtime: "USLR";
    workspaceId: string;
    dataSourceId: string;
    domain: SemanticDomain;
    snapshotVersion: string;
    schemaHash: string;
    metricRegistryId: string | null;
  };
};

export type SemanticQueryIntent = {
  domain: SemanticDomain | RegistryIndustry | string;
  metricNames?: string[];
  metricIds?: string[];
  dimensions?: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tableLabels(tables: Array<{ name: string; schema?: string | null }>) {
  return new Set(tables.flatMap((table) => table.schema ? [table.name, `${table.schema}.${table.name}`] : [table.name]));
}

export function normalizeSemanticDomain(value: unknown): SemanticDomain {
  const normalized = normalize(String(value ?? ""));

  if (normalized === "logistics_service_kpi" || normalized.includes("logistics") || normalized.includes("express")) {
    return "logistics";
  }

  if (normalized.includes("ecommerce") || normalized.includes("commerce") || normalized.includes("order")) {
    return "ecommerce";
  }

  if (normalized === "ads" || normalized.includes("advertising") || normalized.includes("marketing")) {
    return "ads";
  }

  if (normalized.includes("finance") || normalized.includes("stock")) {
    return "finance";
  }

  return "generic";
}

function domainFromSnapshot(snapshot: Pick<SchemaSnapshot, "schemaJson" | "qualityReport">, tables: SchemaTable[]) {
  const schema = asRecord(snapshot.schemaJson);
  const registry = asRecord(schema.metricRegistry);
  const quality = asRecord(snapshot.qualityReport);
  const detected = detectRegistryIndustry(tables);

  return normalizeSemanticDomain(
    registry.industry ??
    quality.detectedIndustry ??
    quality.workspaceType ??
    quality.industry ??
    detected.industry
  );
}

function metricRegistryFromSnapshot(snapshot: Pick<SchemaSnapshot, "schemaJson" | "qualityReport">) {
  const schema = asRecord(snapshot.schemaJson);
  const quality = asRecord(snapshot.qualityReport);
  const registry = asRecord(schema.metricRegistry);

  return Object.keys(registry).length > 0
    ? registry
    : {
        metricRegistryId: quality.metricRegistryId ?? null,
        industry: quality.detectedIndustry ?? quality.workspaceType ?? quality.industry ?? "generic"
      };
}

function metricNames(metric: Pick<MetricDefinition, "name" | "lineageJson">) {
  const lineage = asRecord(metric.lineageJson);

  return [
    metric.name,
    typeof lineage.metricId === "string" ? lineage.metricId : null,
    typeof lineage.businessName === "string" ? lineage.businessName : null,
    typeof lineage.displayName === "string" ? lineage.displayName : null
  ].filter((item): item is string => Boolean(item));
}

function dimensionNames(tables: SchemaTable[]) {
  const dimensions = new Set<string>();

  for (const table of tables) {
    for (const column of table.columns) {
      if (column.type !== "number") {
        dimensions.add(column.name);
        if (column.displayName) dimensions.add(column.displayName);
        if (column.semanticName) dimensions.add(column.semanticName);
      }
    }
  }

  return Array.from(dimensions);
}

function resultRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => resultRecords(item));
  }

  const record = asRecord(value);

  if (Object.keys(record).length === 0) {
    return [];
  }

  return [
    record,
    ...Object.values(record).flatMap((item) => typeof item === "object" && item !== null ? resultRecords(item) : [])
  ];
}

export class SemanticLayerRuntime {
  constructor(private readonly prisma?: PrismaClient) {}

  async resolveContext(workspaceId: string, dataSourceId: string): Promise<SemanticContext> {
    if (!this.prisma) {
      throw new Error("SemanticLayerRuntime requires a Prisma client for resolveContext");
    }

    const dataSource = await this.prisma.dataSourceConnection.findFirst({
      where: {
        id: dataSourceId,
        workspaceId,
        isActive: true,
        status: "CONNECTED"
      }
    });

    if (!dataSource) {
      throw new Error("Semantic context data source is not connected");
    }

    const snapshot = await this.prisma.schemaSnapshot.findFirst({
      where: { workspaceId, dataSourceId },
      orderBy: { createdAt: "desc" }
    });

    if (!snapshot) {
      throw new Error("Semantic context schema snapshot was not found");
    }

    const tables = tablesFromSchemaJson(snapshot.schemaJson);
    const labels = tableLabels(tables);
    const metrics = await this.prisma.metricDefinition.findMany({
      where: { workspaceId, isActive: true }
    });

    return this.createContext({
      workspaceId,
      dataSource,
      schemaSnapshot: snapshot,
      tables,
      metrics: metrics.filter((metric) => metricBelongsToTables(metric, labels))
    });
  }

  createContext(input: {
    workspaceId: string;
    dataSource: Pick<DataSourceConnection, "id">;
    schemaSnapshot: Pick<SchemaSnapshot, "schemaJson" | "qualityReport" | "version">;
    tables?: SchemaTable[];
    metrics: Array<Pick<MetricDefinition, "id" | "name" | "lineageJson">>;
  }): SemanticContext {
    const tables = input.tables?.length ? input.tables : tablesFromSchemaJson(input.schemaSnapshot.schemaJson);
    const metricRegistry = metricRegistryFromSnapshot(input.schemaSnapshot);
    const domain = domainFromSnapshot(input.schemaSnapshot, tables);
    const allowedMetricIds = input.metrics.flatMap((metric) => {
      const lineage = asRecord(metric.lineageJson);
      return [metric.id, typeof lineage.metricId === "string" ? lineage.metricId : null].filter((item): item is string => Boolean(item));
    });
    const allowedMetrics = Array.from(new Set(input.metrics.flatMap(metricNames)));
    const allowedDimensions = dimensionNames(tables);
    const snapshotVersion = String(input.schemaSnapshot.version);
    const schemaHash = stableHash({
      dataSourceId: input.dataSource.id,
      snapshotVersion,
      tables: tables.map((table) => ({
        name: table.name,
        schema: table.schema ?? null,
        columns: table.columns.map((column) => column.name)
      }))
    });
    const metricRegistryId = typeof metricRegistry.metricRegistryId === "string" ? metricRegistry.metricRegistryId : null;

    return {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSource.id,
      domain,
      schemaSnapshot: input.schemaSnapshot.schemaJson,
      metricRegistry,
      allowedMetrics,
      allowedMetricIds: Array.from(new Set(allowedMetricIds)),
      allowedDimensions,
      snapshotVersion,
      schemaHash,
      trace: {
        runtime: "USLR",
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSource.id,
        domain,
        snapshotVersion,
        schemaHash,
        metricRegistryId
      }
    };
  }

  resolveMetrics(domain: string, schemaSnapshot: Pick<SchemaSnapshot, "schemaJson" | "qualityReport" | "version">, metrics: MetricDefinition[]) {
    const context = this.createContext({
      workspaceId: "",
      dataSource: { id: "" },
      schemaSnapshot,
      metrics
    });
    const normalizedDomain = normalizeSemanticDomain(domain);

    if (context.domain !== normalizedDomain) {
      throw new Error("Cross-domain data leak blocked");
    }

    return metrics.filter((metric) => context.allowedMetricIds.includes(metric.id));
  }

  assertQueryAllowed(intent: SemanticQueryIntent, context: SemanticContext) {
    const queryDomain = normalizeSemanticDomain(intent.domain);

    if (queryDomain !== context.domain) {
      throw new Error("Cross-domain data leak blocked");
    }

    for (const metricName of intent.metricNames ?? []) {
      if (!context.allowedMetrics.includes(metricName)) {
        throw new Error("Metric not allowed in this domain");
      }
    }

    for (const metricId of intent.metricIds ?? []) {
      if (!context.allowedMetricIds.includes(metricId)) {
        throw new Error("Metric not allowed in this domain");
      }
    }

    for (const dimension of intent.dimensions ?? []) {
      if (!context.allowedDimensions.includes(dimension)) {
        throw new Error("Invalid dimension for this data source");
      }
    }
  }

  async runQuery<T>(intent: SemanticQueryIntent, context: SemanticContext, runner: () => Promise<T>) {
    this.assertQueryAllowed(intent, context);
    const result = await runner();
    this.validateNoCrossDomainLeak(result, context);
    return result;
  }

  generateInsight<T>(data: T, context: SemanticContext) {
    return {
      data,
      constraints: {
        domain: context.domain,
        allowedMetrics: context.allowedMetrics,
        allowedDimensions: context.allowedDimensions
      },
      trace: context.trace
    };
  }

  validateNoCrossDomainLeak(result: unknown, context: SemanticContext) {
    for (const record of resultRecords(result)) {
      const metricDomain = record.metricDomain ?? record.domain ?? record.businessType;

      if (typeof metricDomain === "string" && normalizeSemanticDomain(metricDomain) !== context.domain) {
        if (!(context.domain !== "generic" && normalizeSemanticDomain(metricDomain) === "generic")) {
          throw new Error("Cross-domain data leak blocked");
        }
      }

      const dataSourceIds = Array.isArray(record.dataSourceIds)
        ? record.dataSourceIds.filter((item): item is string => typeof item === "string")
        : typeof record.dataSourceId === "string"
          ? [record.dataSourceId]
          : [];

      if (dataSourceIds.some((id) => id !== context.dataSourceId)) {
        throw new Error("Cross-domain data leak blocked");
      }

      const metricId = typeof record.metricId === "string" ? record.metricId : typeof record.kpiId === "string" ? record.kpiId : null;
      const metricName = typeof record.metricName === "string" ? record.metricName : typeof record.kpiName === "string" ? record.kpiName : null;

      if (metricId && !context.allowedMetricIds.includes(metricId) && !context.allowedMetrics.includes(metricId)) {
        throw new Error("Metric not allowed in this domain");
      }

      if (metricName && !context.allowedMetrics.includes(metricName) && !context.allowedMetricIds.includes(metricName)) {
        throw new Error("Metric not allowed in this domain");
      }
    }

    return result;
  }

  semanticCacheIdentity(context: SemanticContext, queryHash: string) {
    return {
      dataSourceId: context.dataSourceId,
      dataSourceIds: [context.dataSourceId],
      domain: context.domain,
      snapshotVersion: context.snapshotVersion,
      schemaHash: context.schemaHash,
      queryHash
    };
  }
}
