import { createHash } from "node:crypto";

export const SEMANTIC_MAPPING_CACHE_VERSION = "semantic_mapping_cache/v1";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type TableLike = {
  name?: string;
  schema?: string;
  rowCount?: number;
  columns?: Array<{
    name?: string;
    displayName?: string;
    semanticName?: string;
    rawHeaderPath?: string[];
    type?: string;
    nullable?: boolean;
  }>;
};

type CacheInput = {
  tables: TableLike[];
  semanticLayer: unknown;
  source?: string;
};

export type SemanticMappingCache = {
  version: typeof SEMANTIC_MAPPING_CACHE_VERSION;
  schemaHash: string;
  generatedAt: string;
  source: string;
  status: "READY";
  semanticLayer: JsonValue;
  field_mappings: Array<{
    source_table: string;
    source_column: string;
    canonical_field: string;
    confidence: number;
    mapping_method: "schema_semantic_layer";
    status: "AVAILABLE";
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTables(tables: TableLike[]) {
  return tables.map((table) => ({
    schema: normalize(table.schema),
    name: normalize(table.name),
    columns: (table.columns ?? []).map((column) => ({
      name: normalize(column.name),
      displayName: normalize(column.displayName),
      semanticName: normalize(column.semanticName),
      rawHeaderPath: Array.isArray(column.rawHeaderPath)
        ? column.rawHeaderPath.map(normalize)
        : [],
      type: normalize(column.type),
      nullable: column.nullable === false ? false : true
    }))
  }));
}

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function jsonSafe(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function semanticSchemaHash(tables: TableLike[]) {
  return createHash("sha256")
    .update(stableStringify(normalizeTables(tables)))
    .digest("hex");
}

export function buildSemanticMappingCache(input: CacheInput): SemanticMappingCache {
  const semanticLayer = jsonSafe(input.semanticLayer);
  const fields = Array.isArray(asRecord(semanticLayer).fields)
    ? asRecord(semanticLayer).fields as Array<Record<string, unknown>>
    : [];

  return {
    version: SEMANTIC_MAPPING_CACHE_VERSION,
    schemaHash: semanticSchemaHash(input.tables),
    generatedAt: new Date().toISOString(),
    source: input.source ?? "schema_sync",
    status: "READY",
    semanticLayer,
    field_mappings: fields.map((field) => ({
      source_table: String(field.table ?? ""),
      source_column: String(field.displayField ?? field.field ?? ""),
      canonical_field: String(field.semanticType ?? field.field ?? "unknown"),
      confidence: Number.isFinite(Number(field.confidence)) ? Number(field.confidence) : 0,
      mapping_method: "schema_semantic_layer",
      status: "AVAILABLE"
    }))
  };
}

export function readSemanticMappingCache(schemaJson: unknown): SemanticMappingCache | null {
  const cache = asRecord(schemaJson).semanticMappingCache;
  const record = asRecord(cache);

  if (record.version !== SEMANTIC_MAPPING_CACHE_VERSION) return null;
  if (typeof record.schemaHash !== "string" || !record.schemaHash) return null;
  if (record.status !== "READY") return null;
  if (!record.semanticLayer) return null;

  return record as SemanticMappingCache;
}

export function cachedSemanticLayerForTables(schemaJson: unknown, tables: TableLike[]) {
  const cache = readSemanticMappingCache(schemaJson);
  if (!cache) return null;
  return cache.schemaHash === semanticSchemaHash(tables) ? cache.semanticLayer : null;
}

export function semanticMappingCacheSummary(cache: SemanticMappingCache) {
  return {
    version: cache.version,
    schemaHash: cache.schemaHash,
    generatedAt: cache.generatedAt,
    source: cache.source,
    status: cache.status,
    fieldMappingCount: cache.field_mappings.length
  };
}
