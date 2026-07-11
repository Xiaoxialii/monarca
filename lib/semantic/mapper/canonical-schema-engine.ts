import crypto from "node:crypto";
import { normalizeRows } from "@/lib/semantic/engine/field-analyzer";
import type { CanonicalConcept, CanonicalDataset, SemanticMappingDecision } from "@/lib/semantic/types";

const SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

const ORDER_FIELDS = new Set<CanonicalConcept>(["order_id", "revenue", "order_date", "currency", "customer_id", "status"]);
const ITEM_FIELDS = new Set<CanonicalConcept>(["order_id", "product_id", "sku", "quantity", "price"]);
const PRODUCT_FIELDS = new Set<CanonicalConcept>(["product_id", "product_name", "sku", "price"]);
const CUSTOMER_FIELDS = new Set<CanonicalConcept>(["customer_id", "email_hash", "country"]);
const REFUND_FIELDS = new Set<CanonicalConcept>(["refund_id", "order_id", "refund_amount", "refund_reason"]);
const ADS_FIELDS = new Set<CanonicalConcept>([
  "campaign_id",
  "adset_id",
  "ad_id",
  "ad_spend",
  "impressions",
  "clicks",
  "conversions",
  "attribution_revenue",
  "event_date"
]);

type CanonicalTableName =
  | "ecommerce_orders"
  | "ecommerce_order_items"
  | "ecommerce_products"
  | "ecommerce_customers"
  | "ecommerce_refunds"
  | "ecommerce_ads";

export type CanonicalMappedRecord = {
  platform?: string;
  source_id?: string;
  fields: Partial<Record<CanonicalConcept, unknown>>;
  unknown_fields?: Array<{ path: string; value: unknown }>;
  metadata?: Record<string, unknown>;
};

type CanonicalValidationIssue = {
  table: string;
  field?: string;
  reason: string;
};

type CanonicalBuildResult = {
  row?: Record<string, unknown>;
  warnings: CanonicalValidationIssue[];
  rejected?: CanonicalValidationIssue;
};

export function buildCanonicalSchema(input: {
  rawData: unknown;
  mappings: SemanticMappingDecision[];
  platform?: string;
}): CanonicalDataset {
  const mappedRecords = mappedRecordsFromSemanticInput(input);

  return buildCanonicalDatasetFromMappedRecords(mappedRecords);
}

export function buildCanonicalDatasetFromMappedRecords(records: CanonicalMappedRecord[]): CanonicalDataset {
  const normalizedAt = new Date().toISOString();
  const sourcePlatforms = Array.from(new Set(records.map((record) => record.platform ?? "auto-detected")));
  const tables: CanonicalDataset["tables"] = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: []
  };
  const warnings: CanonicalValidationIssue[] = [];
  const rejected: Array<{ table: string; reason: string; row: Record<string, unknown> }> = [];
  const unknownFields: Array<{ path: string; value: unknown; platform?: string }> = [];
  let acceptedRows = 0;

  for (const record of records) {
    const platform = record.platform ?? "auto-detected";
    const sourceId = String(record.source_id ?? record.fields.order_id ?? record.fields.product_id ?? record.fields.refund_id ?? "");
    unknownFields.push(...(record.unknown_fields ?? []).map((field) => ({ ...field, platform })));

    for (const [tableName, result] of Object.entries(buildRowsForRecord(record, platform, sourceId)) as Array<[CanonicalTableName, CanonicalBuildResult]>) {
      warnings.push(...result.warnings);
      if (result.rejected || !result.row) {
        if (result.row || result.rejected) {
          rejected.push({
            table: tableName,
            reason: result.rejected?.reason ?? "row_not_generated",
            row: result.row ?? { platform, source_id: sourceId }
          });
        }
        continue;
      }

      (tables[tableName] ??= []).push(result.row);
      acceptedRows += 1;
    }
  }

  const beforeDedupe = Object.values(tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  const dedupedTables = {
    ecommerce_orders: dedupeRows(tables.ecommerce_orders),
    ecommerce_order_items: dedupeRows(tables.ecommerce_order_items),
    ecommerce_products: dedupeRows(tables.ecommerce_products),
    ecommerce_customers: dedupeRows(tables.ecommerce_customers),
    ecommerce_refunds: dedupeRows(tables.ecommerce_refunds),
    ecommerce_ads: dedupeRows(tables.ecommerce_ads ?? [])
  };
  const afterDedupe = Object.values(dedupedTables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);

  return {
    schema_version: SCHEMA_VERSION,
    tables: dedupedTables,
    metadata: {
      source_platforms: sourcePlatforms,
      normalized_at: normalizedAt,
      unknown_fields: unknownFields,
      validation: {
        accepted_rows: acceptedRows,
        rejected_rows: rejected.length,
        warnings,
        rejected
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: beforeDedupe - afterDedupe
      },
      mapping_confidence: average(records.map((record) => Number(record.metadata?.mapping_confidence ?? 0)).filter((value) => value > 0))
    }
  };
}

function mappedRecordsFromSemanticInput(input: {
  rawData: unknown;
  mappings: SemanticMappingDecision[];
  platform?: string;
}): CanonicalMappedRecord[] {
  const rows = normalizeRows(input.rawData);
  const mappingByPath = new Map(input.mappings.map((mapping) => [mapping.field, mapping]));
  const mappingByName = new Map(input.mappings.map((mapping) => [lastPathPart(mapping.field), mapping]));

  return rows.map((row) => {
    const fields: Partial<Record<CanonicalConcept, unknown>> = {};
    const unknownFields: Array<{ path: string; value: unknown }> = [];

    for (const [path, value] of flatten(row)) {
      const mapping = mappingByPath.get(path) ?? mappingByName.get(lastPathPart(path));
      if (!mapping || mapping.canonical === "unknown") {
        unknownFields.push({ path, value });
        continue;
      }

      assignIfUseful(fields, mapping.canonical, coerceValue(mapping.canonical, value));
    }

    return {
      platform: input.platform ?? "auto-detected",
      source_id: String(fields.order_id ?? fields.product_id ?? fields.refund_id ?? ""),
      fields,
      unknown_fields: unknownFields,
      metadata: {
        mapping_confidence: average(input.mappings.map((mapping) => mapping.confidence))
      }
    };
  });
}

function buildRowsForRecord(record: CanonicalMappedRecord, platform: string, sourceId: string): Record<CanonicalTableName, CanonicalBuildResult> {
  const fields = record.fields;

  return {
    ecommerce_orders: buildTableRow({
      table: "ecommerce_orders",
      platform,
      sourceId,
      fields,
      allowedFields: ORDER_FIELDS,
      triggerFields: ["order_id", "revenue", "order_date", "currency", "customer_id", "status"],
      requiredFields: ["order_id", "revenue", "order_date", "currency", "platform"],
      defaults: { status: "unknown" }
    }),
    ecommerce_order_items: buildTableRow({
      table: "ecommerce_order_items",
      platform,
      sourceId,
      fields,
      allowedFields: ITEM_FIELDS,
      triggerFields: ["product_id", "sku", "quantity", "price"],
      requiredFields: ["order_id", "sku"],
      defaults: { quantity: 1 }
    }),
    ecommerce_products: buildTableRow({
      table: "ecommerce_products",
      platform,
      sourceId,
      fields,
      allowedFields: PRODUCT_FIELDS,
      triggerFields: ["product_id", "product_name"],
      requiredFields: ["product_id", "product_name", "platform"],
      defaults: {}
    }),
    ecommerce_customers: buildTableRow({
      table: "ecommerce_customers",
      platform,
      sourceId,
      fields,
      allowedFields: CUSTOMER_FIELDS,
      triggerFields: ["customer_id", "email_hash", "country"],
      requiredFields: ["customer_id", "platform"],
      defaults: {}
    }),
    ecommerce_refunds: buildTableRow({
      table: "ecommerce_refunds",
      platform,
      sourceId,
      fields,
      allowedFields: REFUND_FIELDS,
      triggerFields: ["refund_id", "refund_amount", "refund_reason"],
      requiredFields: ["refund_id", "order_id", "amount"],
      defaults: {}
    }),
    ecommerce_ads: buildTableRow({
      table: "ecommerce_ads",
      platform,
      sourceId,
      fields,
      allowedFields: ADS_FIELDS,
      triggerFields: ["campaign_id", "ad_id", "ad_spend", "impressions", "clicks", "conversions"],
      requiredFields: ["campaign_id", "date", "spend", "platform"],
      defaults: {}
    })
  };
}

function buildTableRow(input: {
  table: CanonicalTableName;
  platform: string;
  sourceId: string;
  fields: Partial<Record<CanonicalConcept, unknown>>;
  allowedFields: Set<CanonicalConcept>;
  triggerFields: CanonicalConcept[];
  requiredFields: string[];
  defaults: Record<string, unknown>;
}): CanonicalBuildResult {
  const row: Record<string, unknown> = {
    platform: input.platform,
    source_id: input.sourceId,
    ...input.defaults
  };
  const warnings: CanonicalValidationIssue[] = [];

  if (!input.triggerFields.some((field) => hasValue(input.fields[field]))) {
    return { warnings };
  }

  for (const field of input.allowedFields) {
    if (field === "refund_amount") {
      assignIfUseful(row, "amount", input.fields.refund_amount);
      continue;
    }
    if (field === "refund_reason") {
      assignIfUseful(row, "reason", input.fields.refund_reason);
      continue;
    }
    if (field === "ad_spend") {
      assignIfUseful(row, "spend", input.fields.ad_spend);
      continue;
    }
    if (field === "event_date") {
      assignIfUseful(row, "date", input.fields.event_date);
      continue;
    }
    assignIfUseful(row, field, input.fields[field]);
  }

  if (Object.keys(row).length <= 2 + Object.keys(input.defaults).length) {
    return { warnings };
  }

  for (const [optionalField, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === "") {
      warnings.push({ table: input.table, field: optionalField, reason: "empty_optional_field" });
    }
  }

  for (const requiredField of input.requiredFields) {
    if (row[requiredField] === null || row[requiredField] === undefined || row[requiredField] === "") {
      return {
        row,
        warnings,
        rejected: {
          table: input.table,
          field: requiredField,
          reason: "missing_required_field"
        }
      };
    }
  }

  const typeIssue = validateTypes(input.table, row);
  if (typeIssue) {
    return { row, warnings, rejected: typeIssue };
  }

  row.canonical_key = canonicalKey(row);

  return { row, warnings };
}

function validateTypes(table: CanonicalTableName, row: Record<string, unknown>): CanonicalValidationIssue | null {
  const numericFields = new Set(["revenue", "quantity", "price", "amount", "spend", "impressions", "clicks", "conversions", "attribution_revenue"]);
  const dateFields = new Set(["order_date", "date"]);

  for (const field of numericFields) {
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== "number") {
      return { table, field, reason: "invalid_number" };
    }
  }

  for (const field of dateFields) {
    if (row[field] !== undefined && row[field] !== null && Number.isNaN(Date.parse(String(row[field])))) {
      return { table, field, reason: "invalid_datetime" };
    }
  }

  return null;
}

function canonicalKey(row: Record<string, unknown>) {
  return crypto
    .createHash("sha256")
    .update([
      row.platform ?? "",
      row.source_id ?? "",
      row.order_id ?? row.product_id ?? row.customer_id ?? row.refund_id ?? row.ad_id ?? row.campaign_id ?? ""
    ].join(":"))
    .digest("hex");
}

function dedupeRows(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    map.set(String(row.canonical_key ?? canonicalKey(row)), row);
  }

  return Array.from(map.values());
}

function assignIfUseful(target: Record<string, unknown> | Partial<Record<CanonicalConcept, unknown>>, key: string, value: unknown) {
  if (!hasValue(value)) return;
  if ((target as Record<string, unknown>)[key] !== null && (target as Record<string, unknown>)[key] !== undefined && (target as Record<string, unknown>)[key] !== "") return;

  (target as Record<string, unknown>)[key] = value;
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function flatten(value: unknown, path: string[] = []): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.slice(0, 10).flatMap((item, index) => flatten(item, [...path, `[${index}]`]));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => flatten(nested, [...path, key]));
  }

  return [[path.join("."), value]];
}

function coerceValue(concept: CanonicalConcept, value: unknown) {
  if (
    concept === "revenue" ||
    concept === "refund_amount" ||
    concept === "ad_spend" ||
    concept === "quantity" ||
    concept === "price" ||
    concept === "impressions" ||
    concept === "clicks" ||
    concept === "conversions" ||
    concept === "attribution_revenue"
  ) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  if (concept === "order_date") {
    const date = new Date(String(value));

    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (concept === "event_date") {
    const date = new Date(String(value));

    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }

  return value;
}

function lastPathPart(path: string) {
  return path.split(".").filter(Boolean).at(-1) ?? path;
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 0;
}
