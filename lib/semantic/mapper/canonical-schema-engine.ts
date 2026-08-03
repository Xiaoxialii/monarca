import crypto from "node:crypto";
import { normalizeRows } from "@/lib/semantic/engine/field-analyzer";
import type { CanonicalConcept, CanonicalDataset, SemanticMappingDecision } from "@/lib/semantic/types";

const SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

const ORDER_FIELDS = new Set<CanonicalConcept>(["order_id", "revenue", "gross_sales", "net_sales", "discount_amount", "refund_amount", "tax_amount", "shipping_revenue", "order_date", "currency", "customer_id", "status", "shipping_cost", "fulfillment_cost", "warehouse_cost", "payment_fee"]);
const ITEM_FIELDS = new Set<CanonicalConcept>(["order_id", "product_id", "sku", "quantity", "price", "unit_price", "revenue", "gross_sales", "net_sales", "discount_amount", "refund_amount", "cogs", "product_cost"]);
const PRODUCT_FIELDS = new Set<CanonicalConcept>(["product_id", "product_name", "sku", "price", "unit_price", "product_cost"]);
const CUSTOMER_FIELDS = new Set<CanonicalConcept>(["customer_id", "email_hash", "country"]);
const REFUND_FIELDS = new Set<CanonicalConcept>(["refund_id", "order_id", "refund_amount", "refund_reason"]);
const ADS_FIELDS = new Set<CanonicalConcept>([
  "sku",
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
const INVENTORY_FIELDS = new Set<CanonicalConcept>(["sku", "stock_level", "available_stock", "inventory_quantity", "inventory_cost", "warehouse_id", "reorder_point"]);

type CanonicalTableName =
  | "ecommerce_orders"
  | "ecommerce_order_items"
  | "ecommerce_products"
  | "ecommerce_customers"
  | "ecommerce_refunds"
  | "ecommerce_ads"
  | "ecommerce_inventory"
  | "ecommerce_costs";

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
  rows?: Array<Record<string, unknown>>;
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
    ecommerce_ads: [],
    ecommerce_inventory: [],
    ecommerce_costs: []
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
      const resultRows = result.rows ?? (result.row ? [result.row] : []);
      if (result.rejected || !resultRows.length) {
        if (resultRows.length || result.rejected) {
          rejected.push({
            table: tableName,
            reason: result.rejected?.reason ?? "row_not_generated",
            row: resultRows[0] ?? { platform, source_id: sourceId }
          });
        }
        continue;
      }

      (tables[tableName] ??= []).push(...resultRows);
      acceptedRows += resultRows.length;
    }
  }

  const beforeDedupe = Object.values(tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  const dedupedTables = {
    ecommerce_orders: dedupeRows(tables.ecommerce_orders),
    ecommerce_order_items: dedupeRows(tables.ecommerce_order_items),
    ecommerce_products: dedupeRows(tables.ecommerce_products),
    ecommerce_customers: dedupeRows(tables.ecommerce_customers),
    ecommerce_refunds: dedupeRows(tables.ecommerce_refunds),
    ecommerce_ads: dedupeRows(tables.ecommerce_ads ?? []),
    ecommerce_inventory: dedupeRows(tables.ecommerce_inventory ?? []),
    ecommerce_costs: dedupeRows(tables.ecommerce_costs ?? [])
  };
  const afterDedupe = Object.values(dedupedTables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  const inputColumns = Array.from(new Set(records.flatMap((record) => Object.keys(record.fields)))).sort();
  const generationAudit = Object.entries(dedupedTables).map(([table, rows]) => ({
    table,
    inputColumns,
    mappedColumns: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort(),
    rejectedColumns: warnings
      .filter((warning) => warning.table === table && warning.field)
      .map((warning) => ({ field: String(warning.field), reason: warning.reason })),
    rowCount: rows.length
  }));

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
      generation_audit: generationAudit,
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

      assignCanonicalField(fields, mapping.canonical, coerceValue(mapping.canonical, value));
    }

    return {
      platform: input.platform ?? "auto-detected",
      source_id: String(fields.order_id ?? fields.product_id ?? fields.refund_id ?? fields.sku ?? fields.campaign_id ?? fields.warehouse_id ?? ""),
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
  const stableSourceId = sourceId || String(fields.order_id ?? fields.product_id ?? fields.sku ?? fields.campaign_id ?? fields.warehouse_id ?? "");

  return {
    ecommerce_orders: buildTableRow({
      table: "ecommerce_orders",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: ORDER_FIELDS,
      triggerFields: ["order_id", "revenue", "gross_sales", "net_sales", "order_date", "currency", "customer_id", "status", "shipping_cost", "fulfillment_cost", "warehouse_cost", "payment_fee"],
      requiredFields: ["order_id", "platform"],
      defaults: { status: "unknown" }
    }),
    ecommerce_order_items: buildTableRow({
      table: "ecommerce_order_items",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: ITEM_FIELDS,
      triggerFields: ["product_id", "price", "unit_price", "revenue", "gross_sales", "net_sales", "cogs", "product_cost", "refund_amount"],
      requiredFields: ["order_id", "sku"],
      defaults: { order_id: stableSourceId || `source-${canonicalKey({ platform, sku: fields.sku ?? "" }).slice(0, 12)}`, quantity: 1 }
    }),
    ecommerce_products: buildTableRow({
      table: "ecommerce_products",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: PRODUCT_FIELDS,
      triggerFields: ["product_id", "product_name", "sku", "price", "unit_price", "product_cost"],
      requiredFields: ["product_id", "platform"],
      defaults: { product_id: String(fields.product_id ?? fields.sku ?? stableSourceId) }
    }),
    ecommerce_customers: buildTableRow({
      table: "ecommerce_customers",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: CUSTOMER_FIELDS,
      triggerFields: ["customer_id", "email_hash", "country"],
      requiredFields: ["customer_id", "platform"],
      defaults: {}
    }),
    ecommerce_refunds: buildTableRow({
      table: "ecommerce_refunds",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: REFUND_FIELDS,
      triggerFields: ["refund_id", "refund_amount", "refund_reason"],
      requiredFields: ["order_id", "amount"],
      defaults: { refund_id: stableSourceId ? `refund-${stableSourceId}` : undefined }
    }),
    ecommerce_ads: buildTableRow({
      table: "ecommerce_ads",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: ADS_FIELDS,
      triggerFields: ["campaign_id", "ad_id", "ad_spend", "impressions", "clicks", "conversions", "attribution_revenue", "event_date"],
      requiredFields: ["campaign_id", "date", "spend", "platform"],
      defaults: { campaign_id: stableSourceId || "unknown-campaign" }
    }),
    ecommerce_inventory: buildTableRow({
      table: "ecommerce_inventory",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: INVENTORY_FIELDS,
      triggerFields: ["sku", "stock_level", "available_stock", "inventory_quantity", "inventory_cost", "warehouse_id", "reorder_point"],
      requiredFields: ["sku", "platform"],
      defaults: {}
    }),
    ecommerce_costs: buildCostRows({
      platform,
      sourceId: stableSourceId,
      fields
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
    source_id: input.sourceId
  };
  const warnings: CanonicalValidationIssue[] = [];

  if (!input.triggerFields.some((field) => hasValue(input.fields[field]))) {
    return { warnings };
  }

  for (const field of input.allowedFields) {
    if (field === "revenue") {
      assignIfUseful(row, "revenue", input.fields.revenue);
      assignIfUseful(row, "net_sales", input.fields.revenue);
      continue;
    }
    if (field === "refund_amount") {
      assignIfUseful(row, "amount", input.fields.refund_amount);
      assignIfUseful(row, "refund_amount", input.fields.refund_amount);
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
    if (field === "attribution_revenue") {
      assignIfUseful(row, "attribution_revenue", input.fields.attribution_revenue);
      assignIfUseful(row, "attributed_revenue", input.fields.attribution_revenue);
      continue;
    }
    if (field === "event_date") {
      assignIfUseful(row, "date", input.fields.event_date);
      assignIfUseful(row, "event_date", input.fields.event_date);
      continue;
    }
    if (field === "price") {
      assignIfUseful(row, "price", input.fields.price);
      assignIfUseful(row, "unit_price", input.fields.price);
      continue;
    }
    assignIfUseful(row, field, input.fields[field]);
  }

  for (const [key, value] of Object.entries(input.defaults)) {
    assignIfUseful(row, key, value);
  }

  if (Object.keys(row).length <= 2) {
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

function buildCostRows(input: {
  platform: string;
  sourceId: string;
  fields: Partial<Record<CanonicalConcept, unknown>>;
}): CanonicalBuildResult {
  const costFields: CanonicalConcept[] = [
    "cogs",
    "product_cost",
    "platform_fee",
    "payment_fee",
    "shipping_cost",
    "fulfillment_cost",
    "warehouse_cost",
    "inventory_cost"
  ];
  const rows = costFields
    .filter((field) => hasValue(input.fields[field]))
    .map((field) => {
      const row: Record<string, unknown> = {
        platform: input.platform,
        source_id: input.sourceId,
        sku: input.fields.sku,
        cost_type: field,
        amount: input.fields[field],
        date: input.fields.event_date ?? input.fields.order_date
      };
      row.canonical_key = canonicalKey(row);
      return row;
    })
    .filter((row) => hasValue(row.sku) && hasValue(row.amount));

  return { rows, warnings: [] };
}

function validateTypes(table: CanonicalTableName, row: Record<string, unknown>): CanonicalValidationIssue | null {
  const numericFields = new Set([
    "revenue",
    "gross_sales",
    "net_sales",
    "discount_amount",
    "refund_amount",
    "tax_amount",
    "shipping_revenue",
    "quantity",
    "price",
    "unit_price",
    "cogs",
    "product_cost",
    "amount",
    "spend",
    "impressions",
    "clicks",
    "conversions",
    "attribution_revenue",
    "attributed_revenue",
    "shipping_cost",
    "fulfillment_cost",
    "warehouse_cost",
    "payment_fee",
    "stock_level",
    "available_stock",
    "inventory_quantity",
    "inventory_cost",
    "reorder_point"
  ]);
  const dateFields = new Set(["order_date", "date", "event_date"]);

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
      row.order_id ?? row.product_id ?? row.customer_id ?? row.refund_id ?? row.ad_id ?? row.campaign_id ?? row.sku ?? "",
      row.cost_type ?? row.warehouse_id ?? ""
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

function assignCanonicalField(target: Partial<Record<CanonicalConcept, unknown>>, concept: CanonicalConcept, value: unknown) {
  if (concept === "price") {
    assignIfUseful(target, "price", value);
    assignIfUseful(target, "unit_price", value);
    return;
  }

  if (concept === "unit_price") {
    assignIfUseful(target, "unit_price", value);
    assignIfUseful(target, "price", value);
    return;
  }

  if (concept === "revenue") {
    assignIfUseful(target, "revenue", value);
    assignIfUseful(target, "net_sales", value);
    return;
  }

  assignIfUseful(target, concept, value);
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
    concept === "gross_sales" ||
    concept === "net_sales" ||
    concept === "discount_amount" ||
    concept === "tax_amount" ||
    concept === "shipping_revenue" ||
    concept === "refund_amount" ||
    concept === "ad_spend" ||
    concept === "quantity" ||
    concept === "price" ||
    concept === "unit_price" ||
    concept === "cogs" ||
    concept === "product_cost" ||
    concept === "platform_fee" ||
    concept === "payment_fee" ||
    concept === "shipping_cost" ||
    concept === "fulfillment_cost" ||
    concept === "warehouse_cost" ||
    concept === "gross_profit" ||
    concept === "net_profit" ||
    concept === "contribution_margin" ||
    concept === "profit_margin" ||
    concept === "stock_level" ||
    concept === "available_stock" ||
    concept === "inventory_quantity" ||
    concept === "inventory_cost" ||
    concept === "reorder_point" ||
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
