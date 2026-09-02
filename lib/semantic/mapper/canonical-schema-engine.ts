import crypto from "node:crypto";
import { inferSourceTableType, resolveCostField } from "@/lib/semantic/cost/cost-field-resolver";
import { normalizeRows } from "@/lib/semantic/engine/field-analyzer";
import type { CanonicalConcept, CanonicalDataset, SemanticMappingDecision } from "@/lib/semantic/types";

const SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

const ORDER_FIELDS = new Set<CanonicalConcept>([
  "source_order_id", "order_id", "order_name", "revenue", "gross_sales", "net_sales", "discount_amount", "refund_amount",
  "tax_amount", "shipping_revenue", "total_paid", "paid_amount", "order_date", "created_at_source", "updated_at_source",
  "processed_at_source", "cancelled_at_source", "currency", "customer_id", "country", "region", "channel", "order_channel",
  "fulfillment_channel", "utm_campaign", "status", "order_status", "financial_status", "payment_status", "fulfillment_status",
  "is_cancelled", "is_test", "is_paid", "shipping_cost", "fulfillment_cost", "warehouse_cost", "payment_fee", "platform_fee"
]);
const ITEM_FIELDS = new Set<CanonicalConcept>([
  "source_order_id", "source_line_item_id", "order_id", "order_item_id", "product_id", "variant_id", "asin", "sku",
  "product_name", "title", "product_type", "category", "category_name", "category_full_name", "brand", "vendor", "tags",
  "handle", "quantity", "refunded_quantity", "price", "unit_price", "revenue", "gross_sales", "net_sales", "discount_amount", "refund_amount",
  "cogs", "line_cogs", "total_cogs", "row_cogs", "item_cost", "unit_cost", "product_cost",
  "shipping_cost", "fulfillment_cost", "warehouse_cost", "platform_fee", "payment_fee", "currency",
  "fulfillment_status"
]);
const PRODUCT_FIELDS = new Set<CanonicalConcept>([
  "product_id",
  "variant_id",
  "asin",
  "product_name",
  "title",
  "product_type",
  "sku",
  "price",
  "unit_price",
  "product_cost",
  "handle",
  "product_handle",
  "description",
  "description_html",
  "tags",
  "category",
  "category_id",
  "category_name",
  "category_full_name",
  "collections",
  "collection_handles",
  "options",
  "featured_media",
  "featured_image_url",
  "media",
  "images",
  "online_store_url",
  "seo_title",
  "seo_description",
  "compare_at_price",
  "barcode",
  "inventory_item_id",
  "inventory_item_sku",
  "inventory_item_tracked",
  "inventory_requires_shipping",
  "inventory_quantity",
  "inventory_unit_cost",
  "inventory_unit_cost_currency",
  "weight",
  "weight_unit",
  "selected_options",
  "variant_media",
  "metafields",
  "metafield_keys",
  "vendor",
  "brand",
  "status"
]);
const CUSTOMER_FIELDS = new Set<CanonicalConcept>([
  "source_customer_id",
  "customer_id",
  "email_hash",
  "country",
  "province",
  "city",
  "customer_created_at",
  "first_order_date",
  "last_order_date",
  "total_orders",
  "orders_count",
  "total_spent",
  "lifetime_value",
  "currency",
  "status"
]);
const REFUND_FIELDS = new Set<CanonicalConcept>([
  "source_refund_id", "refund_id", "source_order_id", "order_id", "source_line_item_id", "order_item_id",
  "refund_date", "refund_amount", "refunded_quantity", "currency", "refund_reason"
]);
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
  "event_date",
  "channel",
  "region",
  "utm_campaign"
]);
const INVENTORY_FIELDS = new Set<CanonicalConcept>([
  "sku", "product_id", "variant_id", "asin", "stock_level", "available_stock", "inventory_quantity", "inventory_cost",
  "inventory_value", "inventory_unit_cost", "warehouse_id", "reorder_point", "snapshot_date", "order_date", "event_date", "currency"
]);

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
  source_table?: CanonicalTableName | null;
  fields: Partial<Record<CanonicalConcept, unknown>>;
  raw_record?: Record<string, unknown>;
  unknown_fields?: Array<{ path: string; value: unknown }>;
  metadata?: Record<string, unknown>;
};

type CanonicalValidationIssue = {
  table: string;
  field?: string;
  reason: string;
};

type CanonicalFieldMappingMetadata = NonNullable<CanonicalDataset["metadata"]["field_mappings"]>[number];

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
  const hasCanonicalOrderFacts = records.some((record) =>
    record.source_table === "ecommerce_orders" || record.source_table === "ecommerce_order_items"
  );
  let acceptedRows = 0;

  for (const record of records) {
    const platform = record.platform ?? "auto-detected";
    const sourceId = String(record.source_id ?? record.fields.source_order_id ?? record.fields.order_id ?? record.fields.product_id ?? record.fields.refund_id ?? "");
    unknownFields.push(...(record.unknown_fields ?? []).map((field) => ({ ...field, platform })));
    const passthrough = buildCanonicalPassthroughRecord(record, platform, sourceId);

    if (passthrough) {
      warnings.push(...passthrough.warnings);
      if (passthrough.rejected) {
        rejected.push({
          table: passthrough.table,
          reason: passthrough.rejected.reason,
          row: passthrough.row ?? { platform, source_id: sourceId }
        });
        continue;
      }

      (tables[passthrough.table] ??= []).push(passthrough.row);
      acceptedRows += 1;
      continue;
    }
    if (hasCanonicalOrderFacts && isSupersededRawOrderFactRecord(record)) {
      warnings.push({
        table: record.source_table ?? "unknown",
        reason: "raw_order_fact_skipped_because_canonical_order_sheets_present"
      });
      continue;
    }

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
    ecommerce_products: consolidateProductRows(tables.ecommerce_products),
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
  const fieldMappings = dedupeFieldMappings(records
    .flatMap((record) => Array.isArray(record.metadata?.field_mappings) ? record.metadata.field_mappings : [])
    .filter((mapping): mapping is CanonicalFieldMappingMetadata => Boolean(mapping) && typeof mapping === "object"));
  const costFieldMappings = dedupeFieldMappings(records.flatMap((record) => costResolutionMappingsForRecord(record)));

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
      field_mappings: dedupeFieldMappings([...fieldMappings, ...costFieldMappings]),
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: beforeDedupe - afterDedupe
      },
      mapping_confidence: average(records.map((record) => Number(record.metadata?.mapping_confidence ?? 0)).filter((value) => value > 0))
    }
  };
}

function dedupeFieldMappings(mappings: CanonicalFieldMappingMetadata[]) {
  const byKey = new Map<string, CanonicalFieldMappingMetadata>();

  for (const mapping of mappings) {
    const sourceTable = String(mapping.source_file_type ?? mapping.target_entity ?? "");
    const sourceColumn = String(mapping.source_column ?? "");
    const canonicalField = String(mapping.canonical_field ?? "");
    const key = [sourceTable, sourceColumn, canonicalField].join(":");
    const existing = byKey.get(key);
    if (!existing || Number(mapping.mapping_confidence ?? 0) > Number(existing.mapping_confidence ?? 0)) {
      byKey.set(key, mapping);
    }
  }

  return Array.from(byKey.values());
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
    const rawRecord = objectRecord(row);
    const sourceTable = inferCanonicalTable(rawRecord);
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
      source_id: String(fields.source_order_id ?? fields.order_id ?? fields.product_id ?? fields.refund_id ?? fields.sku ?? fields.campaign_id ?? fields.warehouse_id ?? ""),
      source_table: sourceTable,
      fields,
      raw_record: rawRecord,
      unknown_fields: unknownFields,
      metadata: {
        mapping_confidence: average(input.mappings.map((mapping) => mapping.confidence)),
        field_mappings: input.mappings
          .filter((mapping) => mapping.canonical !== "unknown")
          .map((mapping) => ({
            canonical_field: mapping.canonical,
            source_column: mapping.source_field ?? lastPathPart(mapping.field),
            source_system: input.platform ?? "auto-detected",
            mapping_confidence: mapping.confidence,
            mapping_method: mapping.mapping_method,
            requires_confirmation: mapping.requires_confirmation
          }))
      }
    };
  });
}

function buildCanonicalPassthroughRecord(
  record: CanonicalMappedRecord,
  platform: string,
  sourceId: string
): ({ table: CanonicalTableName; row: Record<string, unknown>; warnings: CanonicalValidationIssue[]; rejected?: CanonicalValidationIssue }) | null {
  const table = record.source_table ?? inferCanonicalTable(record.raw_record ?? {});
  if (!table || table === "ecommerce_costs") return null;

  const raw = record.raw_record ?? {};
  if (!Object.keys(raw).length) return null;
  const fields = canonicalPassthroughFields(table, raw);
  const row: Record<string, unknown> = {
    platform,
    source_id: sourceId || String(fields.source_order_id ?? fields.order_id ?? fields.product_id ?? fields.refund_id ?? fields.sku ?? fields.campaign_id ?? fields.warehouse_id ?? "")
  };
  const warnings: CanonicalValidationIssue[] = [];

  for (const [field, value] of Object.entries(fields) as Array<[CanonicalConcept, unknown]>) {
    if (field === "ad_spend") {
      assignCoercedField(row, "spend", field, value);
      continue;
    }
    if (field === "refund_amount") {
      assignCoercedField(row, "amount", field, value);
      assignCoercedField(row, "refund_amount", field, value);
      continue;
    }
    if (field === "event_date") {
      assignCoercedField(row, "date", field, value);
      assignCoercedField(row, "event_date", field, value);
      continue;
    }
    if (field === "snapshot_date") {
      assignCoercedField(row, "date", field, value);
      assignCoercedField(row, "snapshot_date", field, value);
      continue;
    }
    if (field === "inventory_value") {
      assignCoercedField(row, "inventory_value", field, value);
      assignCoercedField(row, "inventory_cost", field, value);
      continue;
    }
    if (field === "available_stock") {
      assignCoercedField(row, "available_stock", field, value);
      assignCoercedField(row, "stock_level", field, value);
      continue;
    }
    if (field === "price") {
      assignCoercedField(row, "price", field, value);
      assignCoercedField(row, "unit_price", field, value);
      continue;
    }
    assignCoercedField(row, field, field, value);
  }

  for (const [key, value] of Object.entries(canonicalPassthroughDefaults(table, fields, sourceId))) {
    assignIfUseful(row, key, value);
  }

  if (Object.keys(row).length <= 2) {
    return { table, row, warnings, rejected: { table, reason: "row_not_generated" } };
  }

  for (const [optionalField, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === "") {
      warnings.push({ table, field: optionalField, reason: "empty_optional_field" });
    }
  }

  for (const requiredField of canonicalPassthroughRequiredFields(table)) {
    if (row[requiredField] === null || row[requiredField] === undefined || row[requiredField] === "") {
      return { table, row, warnings, rejected: { table, field: requiredField, reason: "missing_required_field" } };
    }
  }

  const factIssue = validateCanonicalFactRow(table, row);
  if (factIssue) return { table, row, warnings, rejected: factIssue };

  const typeIssue = validateTypes(table, row);
  if (typeIssue) return { table, row, warnings, rejected: typeIssue };

  row.canonical_key = canonicalPassthroughKey(table, row);
  return { table, row, warnings };
}

function canonicalPassthroughFields(table: CanonicalTableName, raw: Record<string, unknown>) {
  const allowed = canonicalPassthroughAllowedFields(table);
  const fields: Partial<Record<CanonicalConcept, unknown>> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("__")) continue;
    const concept = canonicalConceptForPassthroughField(table, key);
    if (!concept || !allowed.has(concept)) continue;
    assignCanonicalField(fields, concept, value);
  }

  return fields;
}

function canonicalConceptForPassthroughField(table: CanonicalTableName, key: string): CanonicalConcept | null {
  const normalized = normalizeCanonicalColumnName(key);
  const aliases: Record<string, CanonicalConcept> = {
    source_order_id: "source_order_id",
    amazon_order_id: "source_order_id",
    shopify_order_id: "source_order_id",
    source_line_item_id: "source_line_item_id",
    line_item_id: "source_line_item_id",
    order_item_id: "order_item_id",
    order_id: "order_id",
    order_name: "order_name",
    customer_id: "customer_id",
    order_date: "order_date",
    purchase_date: "order_date",
    date: table === "ecommerce_ads" ? "event_date" : table === "ecommerce_inventory" ? "snapshot_date" : "order_date",
    created_at: "created_at_source",
    updated_at: "updated_at_source",
    processed_at: "processed_at_source",
    cancelled_at: "cancelled_at_source",
    order_status: "order_status",
    financial_status: "financial_status",
    payment_status: "payment_status",
    fulfillment_status: "fulfillment_status",
    status: "status",
    currency: "currency",
    gross_sales: "gross_sales",
    gross_revenue: "gross_sales",
    discount: "discount_amount",
    discount_amount: "discount_amount",
    refund: "refund_amount",
    refund_amount: "refund_amount",
    refunded_quantity: "refunded_quantity",
    quantity_refunded: "refunded_quantity",
    net_sales: "net_sales",
    total_paid: "total_paid",
    paid_amount: "paid_amount",
    is_cancelled: "is_cancelled",
    is_canceled: "is_cancelled",
    is_test: "is_test",
    is_paid: "is_paid",
    sku: "sku",
    asin: "asin",
    product_id: "product_id",
    variant_id: "variant_id",
    inventory_item_id: "inventory_item_id",
    product_name: "product_name",
    title: "title",
    item_name: "product_name",
    lineitem_name: "product_name",
    product_type: "product_type",
    category: "category",
    brand: "brand",
    vendor: "vendor",
    tags: "tags",
    handle: "handle",
    product_handle: "product_handle",
    quantity: "quantity",
    price: "price",
    unit_price: "unit_price",
    item_price: "unit_price",
    revenue: "revenue",
    cogs: "cogs",
    line_cogs: "line_cogs",
    total_cogs: "total_cogs",
    row_cogs: "row_cogs",
    item_cost: "item_cost",
    unit_cost: "unit_cost",
    cost_price: "unit_cost",
    product_cost: "product_cost",
    campaign_id: "campaign_id",
    adset_id: "adset_id",
    ad_set_id: "adset_id",
    ad_id: "ad_id",
    spend: "ad_spend",
    ad_spend: "ad_spend",
    amount_spent: "ad_spend",
    impressions: "impressions",
    clicks: "clicks",
    conversions: "conversions",
    attribution_revenue: "attribution_revenue",
    event_date: "event_date",
    date_start: "event_date",
    snapshot_date: "snapshot_date",
    inventory_date: "snapshot_date",
    as_of_date: "snapshot_date",
    report_as_of_date: "snapshot_date",
    warehouse_id: "warehouse_id",
    stock_level: "stock_level",
    available: "available_stock",
    available_stock: "available_stock",
    available_quantity: "available_stock",
    sellable_stock: "available_stock",
    inventory_quantity: "inventory_quantity",
    inventory_value: "inventory_value",
    stock_value: "inventory_value",
    total_inventory_value: "inventory_value",
    inventory_asset_value: "inventory_value",
    stock_asset_value: "inventory_value",
    on_hand_value: "inventory_value",
    total_value: "inventory_value",
    inventory_unit_cost: "inventory_unit_cost",
    inventory_cost: "inventory_cost",
    reorder_point: "reorder_point"
  };

  return aliases[normalized] ?? (allowedCanonicalConcept(normalized) ? normalized as CanonicalConcept : null);
}

function canonicalPassthroughAllowedFields(table: CanonicalTableName) {
  if (table === "ecommerce_orders") return ORDER_FIELDS;
  if (table === "ecommerce_order_items") return ITEM_FIELDS;
  if (table === "ecommerce_products") return PRODUCT_FIELDS;
  if (table === "ecommerce_customers") return CUSTOMER_FIELDS;
  if (table === "ecommerce_refunds") return REFUND_FIELDS;
  if (table === "ecommerce_ads") return ADS_FIELDS;
  if (table === "ecommerce_inventory") return INVENTORY_FIELDS;
  return new Set<CanonicalConcept>();
}

function canonicalPassthroughRequiredFields(table: CanonicalTableName) {
  if (table === "ecommerce_orders") return ["order_id", "platform"];
  if (table === "ecommerce_order_items") return ["order_id", "sku"];
  if (table === "ecommerce_products") return ["product_id", "platform"];
  if (table === "ecommerce_customers") return ["customer_id", "platform"];
  if (table === "ecommerce_refunds") return ["order_id", "amount"];
  if (table === "ecommerce_ads") return ["spend", "platform"];
  if (table === "ecommerce_inventory") return ["sku", "platform"];
  return ["platform"];
}

function canonicalPassthroughDefaults(
  table: CanonicalTableName,
  fields: Partial<Record<CanonicalConcept, unknown>>,
  sourceId: string
) {
  if (table === "ecommerce_orders") {
    return { order_id: fields.order_id ?? fields.source_order_id ?? sourceId, status: "unknown" };
  }
  if (table === "ecommerce_order_items") {
    return { order_id: fields.order_id ?? fields.source_order_id, quantity: 1 };
  }
  if (table === "ecommerce_products") {
    return { product_id: String(fields.product_id ?? fields.sku ?? sourceId) };
  }
  if (table === "ecommerce_refunds") {
    return { refund_id: fields.refund_id ?? (sourceId ? `refund-${sourceId}` : undefined) };
  }
  if (table === "ecommerce_ads") {
    return { campaign_id: fields.campaign_id ?? sourceId ?? "unknown-campaign" };
  }
  return {};
}

function canonicalPassthroughKey(table: CanonicalTableName, row: Record<string, unknown>) {
  const scoped = (parts: unknown[]) => crypto
    .createHash("sha256")
    .update([table, ...parts.map((part) => String(part ?? ""))].join(":"))
    .digest("hex");

  if (table === "ecommerce_order_items") {
    return scoped([
      row.platform,
      row.source_order_id,
      row.order_id,
      row.source_line_item_id,
      row.order_item_id,
      row.sku,
      row.variant_id,
      row.product_id
    ]);
  }
  if (table === "ecommerce_ads") {
    return scoped([
      row.platform,
      row.source_id,
      row.campaign_id,
      row.adset_id,
      row.ad_id,
      row.event_date ?? row.date,
      row.spend
    ]);
  }
  if (table === "ecommerce_inventory") {
    return scoped([
      row.platform,
      row.source_id,
      row.sku,
      row.product_id,
      row.variant_id,
      row.warehouse_id,
      row.snapshot_date ?? row.date,
      row.available_stock ?? row.stock_level ?? row.inventory_quantity,
      row.inventory_value ?? row.inventory_cost
    ]);
  }
  if (table === "ecommerce_refunds") {
    return scoped([
      row.platform,
      row.source_id,
      row.refund_id,
      row.order_id,
      row.source_order_id,
      row.order_item_id,
      row.source_line_item_id,
      row.sku,
      row.amount ?? row.refund_amount,
      row.refunded_quantity
    ]);
  }

  return canonicalKey(row);
}

function buildRowsForRecord(record: CanonicalMappedRecord, platform: string, sourceId: string): Record<CanonicalTableName, CanonicalBuildResult> {
  const fields = record.fields;
  const normalizedCostFields = normalizeCostFieldsForRecord(record);
  const stableSourceId = sourceId || String(fields.source_order_id ?? fields.order_id ?? fields.product_id ?? fields.sku ?? fields.campaign_id ?? fields.warehouse_id ?? "");

  return {
    ecommerce_orders: buildTableRow({
      table: "ecommerce_orders",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: ORDER_FIELDS,
      triggerFields: [
        "source_order_id", "order_id", "order_name", "revenue", "gross_sales", "net_sales", "total_paid", "paid_amount",
        "order_date", "currency", "customer_id", "country", "region", "channel", "order_channel", "fulfillment_channel",
        "utm_campaign", "status", "order_status", "financial_status", "payment_status", "fulfillment_status", "is_cancelled",
        "is_test", "is_paid", "cancelled_at_source", "shipping_cost", "fulfillment_cost", "warehouse_cost", "payment_fee", "platform_fee"
      ],
      requiredFields: ["order_id", "platform"],
      defaults: { order_id: fields.order_id ?? fields.source_order_id ?? stableSourceId, status: "unknown" }
    }),
    ecommerce_order_items: buildTableRow({
      table: "ecommerce_order_items",
      platform,
      sourceId: stableSourceId,
      fields: normalizedCostFields.orderItemFields,
      allowedFields: ITEM_FIELDS,
      triggerFields: ["source_line_item_id", "order_item_id", "product_id", "variant_id", "asin", "sku", "product_name", "title", "price", "unit_price", "revenue", "gross_sales", "net_sales", "cogs", "refund_amount", "refunded_quantity"],
      requiredFields: ["order_id", "sku"],
      defaults: { order_id: stableSourceId || `source-${canonicalKey({ platform, sku: fields.sku ?? "" }).slice(0, 12)}`, quantity: 1 },
      shouldBuild: isOrderItemRecord
    }),
    ecommerce_products: buildTableRow({
      table: "ecommerce_products",
      platform,
      sourceId: stableSourceId,
      fields: normalizedCostFields.productFields,
      allowedFields: PRODUCT_FIELDS,
      triggerFields: [
        "product_id",
        "variant_id",
        "asin",
        "product_name",
        "title",
        "product_type",
        "sku",
        "price",
        "unit_price",
        "product_cost",
        "handle",
        "product_handle",
        "description",
        "description_html",
        "tags",
        "category",
        "category_name",
        "category_full_name",
        "collections",
        "collection_handles",
        "featured_image_url",
        "images",
        "online_store_url",
        "seo_title",
        "seo_description",
        "compare_at_price",
        "barcode",
        "vendor",
        "brand"
      ],
      requiredFields: ["product_id", "platform"],
      defaults: { product_id: String(fields.product_id ?? fields.sku ?? stableSourceId) },
      shouldBuild: isProductRecord
    }),
    ecommerce_customers: buildTableRow({
      table: "ecommerce_customers",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: CUSTOMER_FIELDS,
      triggerFields: ["source_customer_id", "customer_id", "email_hash", "country", "province", "city", "customer_created_at", "first_order_date", "last_order_date", "total_orders", "orders_count", "total_spent", "lifetime_value"],
      requiredFields: ["customer_id", "platform"],
      defaults: {}
    }),
    ecommerce_refunds: buildTableRow({
      table: "ecommerce_refunds",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: REFUND_FIELDS,
      triggerFields: ["source_refund_id", "refund_id", "source_order_id", "order_id", "source_line_item_id", "order_item_id", "refund_date", "refund_amount", "refunded_quantity", "refund_reason"],
      requiredFields: ["order_id", "amount"],
      defaults: { refund_id: stableSourceId ? `refund-${stableSourceId}` : undefined },
      shouldBuild: isRefundRecord
    }),
    ecommerce_ads: buildTableRow({
      table: "ecommerce_ads",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: ADS_FIELDS,
      triggerFields: ["campaign_id", "ad_id", "ad_spend", "impressions", "clicks", "conversions", "attribution_revenue", "event_date", "channel", "region", "utm_campaign"],
      requiredFields: ["spend", "platform"],
      defaults: { campaign_id: stableSourceId || "unknown-campaign" }
    }),
    ecommerce_inventory: buildTableRow({
      table: "ecommerce_inventory",
      platform,
      sourceId: stableSourceId,
      fields,
      allowedFields: INVENTORY_FIELDS,
      triggerFields: ["sku", "stock_level", "available_stock", "inventory_quantity", "inventory_cost", "inventory_value", "inventory_unit_cost", "warehouse_id", "reorder_point", "snapshot_date", "order_date", "event_date"],
      requiredFields: ["sku", "platform"],
      defaults: {},
      shouldBuild: isInventoryRecord
    }),
    ecommerce_costs: buildCostRows({
      platform,
      sourceId: stableSourceId,
      fields: normalizedCostFields.costFields
    })
  };
}

function normalizeCostFieldsForRecord(record: CanonicalMappedRecord) {
  const fields = record.fields;
  const sourceTableType = inferSourceTableType(fields);
  const orderItemFields: Partial<Record<CanonicalConcept, unknown>> = { ...fields };
  const productFields: Partial<Record<CanonicalConcept, unknown>> = { ...fields };
  const costFields: Partial<Record<CanonicalConcept, unknown>> = { ...fields };

  for (const field of ["cogs", "product_cost"] as CanonicalConcept[]) {
    if (!hasValue(fields[field])) continue;
    const resolution = resolveCostField({
      source_table_type: sourceTableType,
      column_name: field,
      sample_value: fields[field],
      sku_mapping: hasValue(fields.sku),
      field_set: fields
    });
    if (!resolution) continue;

    if (resolution.target_entity === "ecommerce_products") {
      delete orderItemFields.cogs;
      delete orderItemFields.product_cost;
      assignIfUseful(productFields, "product_cost", fields[field]);
      costFields.product_cost = fields[field];
      delete costFields.cogs;
      continue;
    }

    delete productFields.cogs;
    delete productFields.product_cost;
    assignIfUseful(orderItemFields, "cogs", fields[field]);
    costFields.cogs = fields[field];
    delete costFields.product_cost;
  }

  return {
    sourceTableType,
    orderItemFields,
    productFields,
    costFields
  };
}

function costResolutionMappingsForRecord(record: CanonicalMappedRecord): CanonicalFieldMappingMetadata[] {
  const normalized = normalizeCostFieldsForRecord(record);
  const fieldMappings = Array.isArray(record.metadata?.field_mappings) ? record.metadata.field_mappings : [];
  const sourceColumnFor = (field: CanonicalConcept) => {
    const mapping = fieldMappings.find((candidate) => {
      const canonicalField = (candidate as CanonicalFieldMappingMetadata).canonical_field;
      return canonicalField === field;
    }) as CanonicalFieldMappingMetadata | undefined;
    return mapping?.source_column ?? field;
  };

  const mappings: CanonicalFieldMappingMetadata[] = [];
  for (const field of ["cogs", "product_cost"] as CanonicalConcept[]) {
    if (!hasValue(record.fields[field])) continue;
    const resolution = resolveCostField({
      source_table_type: normalized.sourceTableType,
      column_name: field,
      sample_value: record.fields[field],
      sku_mapping: hasValue(record.fields.sku),
      field_set: record.fields
    });
    if (!resolution) continue;

    mappings.push({
      canonical_field: resolution.canonical_field,
      source_column: sourceColumnFor(field),
      source_system: record.platform ?? "auto-detected",
      source_file_type: resolution.source_table_type,
      target_entity: resolution.target_entity,
      mapping_confidence: resolution.confidence,
      mapping_method: "semantic_context",
      requires_confirmation: resolution.status === "LOW_CONFIDENCE"
    });
  }

  return mappings;
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
  shouldBuild?: (fields: Partial<Record<CanonicalConcept, unknown>>) => boolean;
}): CanonicalBuildResult {
  const row: Record<string, unknown> = {
    platform: input.platform,
    source_id: input.sourceId
  };
  const warnings: CanonicalValidationIssue[] = [];

  if (!input.triggerFields.some((field) => hasValue(input.fields[field]))) {
    return { warnings };
  }
  if (input.shouldBuild && !input.shouldBuild(input.fields)) {
    return { warnings };
  }

  for (const field of input.allowedFields) {
    if (field === "revenue") {
      assignCoercedField(row, "revenue", field, input.fields.revenue);
      assignCoercedField(row, "net_sales", field, input.fields.revenue);
      continue;
    }
    if (field === "refund_amount") {
      assignCoercedField(row, "amount", field, input.fields.refund_amount);
      assignCoercedField(row, "refund_amount", field, input.fields.refund_amount);
      continue;
    }
    if (field === "refund_reason") {
      assignIfUseful(row, "reason", input.fields.refund_reason);
      continue;
    }
    if (field === "ad_spend") {
      assignCoercedField(row, "spend", field, input.fields.ad_spend);
      continue;
    }
    if (field === "attribution_revenue") {
      assignCoercedField(row, "attribution_revenue", field, input.fields.attribution_revenue);
      assignCoercedField(row, "attributed_revenue", field, input.fields.attribution_revenue);
      continue;
    }
    if (field === "event_date") {
      assignCoercedField(row, "date", field, input.fields.event_date);
      assignCoercedField(row, "event_date", field, input.fields.event_date);
      continue;
    }
    if (field === "snapshot_date") {
      assignCoercedField(row, "date", field, input.fields.snapshot_date);
      assignCoercedField(row, "snapshot_date", field, input.fields.snapshot_date);
      continue;
    }
    if (field === "order_date" && input.table === "ecommerce_inventory") {
      assignCoercedField(row, "date", field, input.fields.order_date);
      continue;
    }
    if (field === "inventory_cost") {
      assignCoercedField(row, "inventory_cost", field, input.fields.inventory_cost);
      continue;
    }
    if (field === "inventory_value") {
      assignCoercedField(row, "inventory_value", field, input.fields.inventory_value);
      continue;
    }
    if (field === "price") {
      assignCoercedField(row, "price", field, input.fields.price);
      assignCoercedField(row, "unit_price", field, input.fields.price);
      continue;
    }
    assignCoercedField(row, field, field, input.fields[field]);
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

  const factIssue = validateCanonicalFactRow(input.table, row);
  if (factIssue) {
    return { row, warnings, rejected: factIssue };
  }

  const typeIssue = validateTypes(input.table, row);
  if (typeIssue) {
    return { row, warnings, rejected: typeIssue };
  }

  row.canonical_key = canonicalKey(row);

  return { row, warnings };
}

function isOrderItemRecord(fields: Partial<Record<CanonicalConcept, unknown>>) {
  const hasStableProductId = ["sku", "product_id", "variant_id", "asin"].some((field) => hasValue(fields[field as CanonicalConcept]));
  const hasOrderIdentity = ["source_order_id", "order_id", "source_line_item_id", "order_item_id"].some((field) => hasValue(fields[field as CanonicalConcept]));
  const hasLineFact = ["source_line_item_id", "order_item_id", "revenue", "gross_sales", "net_sales", "discount_amount", "refund_amount"].some((field) => hasValue(fields[field as CanonicalConcept])) ||
    ((hasValue(fields.price) || hasValue(fields.unit_price)) && hasValue(fields.quantity) && !skuOnlyOrderItemIdentity(fields));
  const hasTransactionalSignal = [
    "quantity",
    "revenue",
    "gross_sales",
    "net_sales",
    "discount_amount",
    "refund_amount"
  ].some((field) => hasValue(fields[field as CanonicalConcept]));

  return hasStableProductId && hasOrderIdentity && hasTransactionalSignal && hasLineFact;
}

function isRefundRecord(fields: Partial<Record<CanonicalConcept, unknown>>) {
  return positiveNumber(fields.refund_amount) || positiveNumber(fields.refunded_quantity);
}

function isInventoryRecord(fields: Partial<Record<CanonicalConcept, unknown>>) {
  return ["stock_level", "available_stock", "inventory_quantity", "inventory_cost", "inventory_value", "inventory_unit_cost", "reorder_point"]
    .some((field) => hasValue(fields[field as CanonicalConcept]));
}

function skuOnlyOrderItemIdentity(fields: Partial<Record<CanonicalConcept, unknown>> | Record<string, unknown>) {
  const record = fields as Record<string, unknown>;
  const orderId = normalizeStableId(record.order_id);
  const sku = normalizeStableId(record.sku);
  if (!orderId || !sku || orderId !== sku) return false;

  return !hasValue(record.order_item_id) &&
    !hasValue(record.source_line_item_id) &&
    !hasValue(record.gross_sales) &&
    !hasValue(record.net_sales) &&
    !hasValue(record.revenue);
}

function isProductRecord(fields: Partial<Record<CanonicalConcept, unknown>>) {
  const hasStableProductId = ["sku", "product_id", "variant_id", "asin"].some((field) => hasValue(fields[field as CanonicalConcept]));
  const hasProductContext = [
    "product_name",
    "title",
    "product_type",
    "category",
    "category_name",
    "category_full_name",
    "brand",
    "vendor",
    "tags",
    "handle",
    "product_handle",
    "description",
    "description_html",
    "compare_at_price",
    "featured_image_url"
  ].some((field) => hasValue(fields[field as CanonicalConcept]));
  const isOnlyOrderLike = ["source_order_id", "order_id", "order_name", "order_date", "customer_id", "gross_sales", "net_sales", "total_paid"].some((field) => hasValue(fields[field as CanonicalConcept])) &&
    !["sku", "variant_id", "asin", "product_type", "tags", "handle", "product_handle"].some((field) => hasValue(fields[field as CanonicalConcept]));

  return hasStableProductId && hasProductContext && !isOnlyOrderLike;
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

function validateCanonicalFactRow(table: CanonicalTableName, row: Record<string, unknown>): CanonicalValidationIssue | null {
  if (table === "ecommerce_order_items") {
    const hasOrderIdentity = hasValue(row.order_id) || hasValue(row.source_order_id) || hasValue(row.order_item_id) || hasValue(row.source_line_item_id);
    const hasLineFact = hasValue(row.order_item_id) ||
      hasValue(row.source_line_item_id) ||
      hasValue(row.revenue) ||
      hasValue(row.gross_sales) ||
      hasValue(row.net_sales) ||
      hasValue(row.discount_amount) ||
      hasValue(row.refund_amount) ||
      ((hasValue(row.price) || hasValue(row.unit_price)) && hasValue(row.quantity) && !skuOnlyOrderItemIdentity(row));
    if (!hasOrderIdentity) return { table, field: "order_id", reason: "missing_order_item_identity" };
    if (!hasLineFact) return { table, reason: "missing_order_item_fact" };
  }

  if (table === "ecommerce_refunds") {
    if (!positiveNumber(row.amount) && !positiveNumber(row.refund_amount) && !positiveNumber(row.refunded_quantity)) {
      return { table, field: "refund_amount", reason: "zero_refund_fact" };
    }
  }

  if (table === "ecommerce_inventory") {
    const hasInventoryFact = [
      row.stock_level,
      row.available_stock,
      row.inventory_quantity,
      row.inventory_cost,
      row.inventory_value,
      row.inventory_unit_cost,
      row.reorder_point
    ].some(hasValue);
    if (!hasInventoryFact) return { table, reason: "missing_inventory_fact" };
  }

  return null;
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
    "total_paid",
    "paid_amount",
    "quantity",
    "price",
    "unit_price",
    "cogs",
    "line_cogs",
    "total_cogs",
    "row_cogs",
    "item_cost",
    "unit_cost",
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
    "inventory_value",
    "inventory_unit_cost",
    "reorder_point"
  ]);
  const dateFields = new Set([
    "order_date",
    "date",
    "event_date",
    "created_at_source",
    "updated_at_source",
    "processed_at_source",
    "cancelled_at_source",
    "refund_date",
    "snapshot_date"
  ]);

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

function consolidateProductRows(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const key = productIdentityKey(row) || String(row.canonical_key ?? canonicalKey(row));
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, canonical_key: key });
      continue;
    }

    for (const [field, value] of Object.entries(row)) {
      if (field === "canonical_key") continue;
      assignIfUseful(existing, field, value);
    }
  }

  return Array.from(map.values());
}

function productIdentityKey(row: Record<string, unknown>) {
  const provider = String(row.platform ?? row.source_provider ?? "unknown").trim().toLowerCase();
  const productId = normalizeStableId(row.product_id ?? row.source_product_id);
  const variantId = normalizeStableId(row.variant_id ?? row.source_variant_id);
  const asin = normalizeStableId(row.asin);
  const sku = normalizeStableId(row.sku);

  if (productId) return `${provider}:product:${productId}`;
  if (variantId) return `${provider}:variant:${variantId}`;
  if (asin) return `${provider}:asin:${asin}`;
  if (sku) return `${provider}:sku:${sku}`;
  return "";
}

function normalizeStableId(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase()
    : "";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function inferCanonicalTable(raw: Record<string, unknown>): CanonicalTableName | null {
  return canonicalTableName(raw.__source_table) ??
    canonicalTableName(raw.__source_file) ??
    canonicalTableNameFromColumns(raw);
}

function canonicalTableName(value: unknown): CanonicalTableName | null {
  const normalized = normalizeCanonicalColumnName(value);
  if (/(^|_)meta(_|$).*ads|(^|_)ads(_|$)|ad_report|campaign_report/.test(normalized)) return "ecommerce_ads";
  if (/(^|_)inventory(_|$)|inventory_snapshot|stock_snapshot|warehouse_snapshot/.test(normalized)) return "ecommerce_inventory";
  return [
    "ecommerce_orders",
    "ecommerce_order_items",
    "ecommerce_products",
    "ecommerce_customers",
    "ecommerce_refunds",
    "ecommerce_ads",
    "ecommerce_inventory"
  ].includes(normalized)
    ? normalized as CanonicalTableName
    : null;
}

function canonicalTableNameFromColumns(raw: Record<string, unknown>): CanonicalTableName | null {
  const columns = new Set(Object.keys(raw).map(normalizeCanonicalColumnName));
  const has = (...names: string[]) => names.some((name) => columns.has(normalizeCanonicalColumnName(name)));

  if (has("amount_spent", "spend", "ad_spend") && has("campaign_name", "campaign_id", "impressions", "link_clicks", "clicks")) {
    return "ecommerce_ads";
  }
  if (has("inventory_value", "stock_value", "available", "available_stock", "stock_level") && has("sku")) {
    return "ecommerce_inventory";
  }
  if (has("refund_id", "refund_amount", "refunded_quantity") && has("order_id", "source_order_id", "order_item_id")) {
    return "ecommerce_refunds";
  }

  return null;
}

function isSupersededRawOrderFactRecord(record: CanonicalMappedRecord) {
  const table = normalizeCanonicalColumnName(record.raw_record?.__source_table ?? record.source_table);
  if (!table) return false;
  if (table.startsWith("ecommerce_")) return false;
  if (!/(^|_)(source_)?orders?(_|$)|(^|_)order_items?(_|$)/.test(table)) return false;
  return [
    record.fields.source_order_id,
    record.fields.order_id,
    record.fields.order_date,
    record.fields.gross_sales,
    record.fields.net_sales,
    record.fields.total_paid,
    record.fields.sku,
    record.fields.quantity
  ].some(hasValue);
}

function normalizeCanonicalColumnName(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function allowedCanonicalConcept(value: string) {
  return [
    ...ORDER_FIELDS,
    ...ITEM_FIELDS,
    ...PRODUCT_FIELDS,
    ...CUSTOMER_FIELDS,
    ...REFUND_FIELDS,
    ...ADS_FIELDS,
    ...INVENTORY_FIELDS
  ].includes(value as CanonicalConcept);
}

function assignIfUseful(target: Record<string, unknown> | Partial<Record<CanonicalConcept, unknown>>, key: string, value: unknown) {
  if (!hasValue(value)) return;
  if ((target as Record<string, unknown>)[key] !== null && (target as Record<string, unknown>)[key] !== undefined && (target as Record<string, unknown>)[key] !== "") return;

  (target as Record<string, unknown>)[key] = value;
}

function assignCoercedField(
  target: Record<string, unknown> | Partial<Record<CanonicalConcept, unknown>>,
  key: string,
  concept: CanonicalConcept,
  value: unknown
) {
  if (!hasValue(value)) return;
  const coerced = coerceValue(concept, value);
  assignIfUseful(target, key, coerced === null ? value : coerced);
}

function assignCanonicalField(target: Partial<Record<CanonicalConcept, unknown>>, concept: CanonicalConcept, value: unknown) {
  if (concept === "title") {
    assignIfUseful(target, "title", value);
    assignIfUseful(target, "product_name", value);
    return;
  }

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

  if (concept === "inventory_cost") {
    assignIfUseful(target, "inventory_cost", value);
    return;
  }

  if (concept === "inventory_value") {
    assignIfUseful(target, "inventory_value", value);
    return;
  }

  assignIfUseful(target, concept, value);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function positiveNumber(value: unknown) {
  if (!hasValue(value)) return false;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/[$,%\s,]/g, ""))
      : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function flatten(value: unknown, path: string[] = []): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.slice(0, 10).flatMap((item, index) => flatten(item, [...path, `[${index}]`]));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("__"))
      .flatMap(([key, nested]) => flatten(nested, [...path, key]));
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
    concept === "total_paid" ||
    concept === "paid_amount" ||
    concept === "refund_amount" ||
    concept === "refunded_quantity" ||
    concept === "ad_spend" ||
    concept === "quantity" ||
    concept === "price" ||
    concept === "unit_price" ||
    concept === "compare_at_price" ||
    concept === "cogs" ||
    concept === "line_cogs" ||
    concept === "total_cogs" ||
    concept === "row_cogs" ||
    concept === "item_cost" ||
    concept === "unit_cost" ||
    concept === "product_cost" ||
    concept === "inventory_unit_cost" ||
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
    concept === "inventory_value" ||
    concept === "reorder_point" ||
    concept === "weight" ||
    concept === "impressions" ||
    concept === "clicks" ||
    concept === "conversions" ||
    concept === "attribution_revenue" ||
    concept === "total_orders" ||
    concept === "orders_count" ||
    concept === "total_spent" ||
    concept === "lifetime_value"
  ) {
    const number = numericValue(value);

    return Number.isFinite(number) ? number : null;
  }

  if (
    concept === "order_date" ||
    concept === "customer_created_at" ||
    concept === "first_order_date" ||
    concept === "last_order_date" ||
    concept === "created_at_source" ||
    concept === "updated_at_source" ||
    concept === "processed_at_source" ||
    concept === "cancelled_at_source" ||
    concept === "refund_date" ||
    concept === "snapshot_date"
  ) {
    return normalizeDateTimeValue(value);
  }

  if (concept === "event_date") {
    return normalizeDateKeyValue(value);
  }

  return value;
}

function normalizeDateTimeValue(value: unknown) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const day = normalizeDateKeyValue(value);
    if (!day) return null;
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");
    return `${day}T${hours}:${minutes}:${seconds}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}(?:$|[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/.test(trimmed)) {
      return trimmed;
    }
  }

  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeDateKeyValue(value: unknown) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}(?:$|[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }

  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function numericValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value);

  const normalized = value.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!normalized) return NaN;

  return Number(normalized);
}

function lastPathPart(path: string) {
  return path.split(".").filter(Boolean).at(-1) ?? path;
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 0;
}
