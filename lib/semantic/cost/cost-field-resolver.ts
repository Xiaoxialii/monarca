import type { CanonicalConcept } from "@/lib/semantic/types";

export type SourceTableType = "order_items" | "product_catalog" | "cost_table" | "unknown";

export type CostFieldResolution = {
  canonical_field: "cogs" | "product_cost";
  target_entity: "ecommerce_order_items" | "ecommerce_products";
  confidence: number;
  source_table_type: SourceTableType;
  status: "AVAILABLE" | "MISSING" | "LOW_CONFIDENCE";
};

export type SkuCostResolution = {
  value: number | null;
  source: string | null;
  confidence: number;
  status: "AVAILABLE" | "MISSING" | "LOW_CONFIDENCE";
};

const ORDER_ITEM_COST_FIELDS = new Set<CanonicalConcept>(["cogs", "product_cost"]);
const PRODUCT_COST_FIELDS = new Set<CanonicalConcept>(["cogs", "product_cost"]);

export function resolveCostField(input: {
  source_table_type?: SourceTableType | null;
  column_name: CanonicalConcept | string;
  sample_value?: unknown;
  sku_mapping?: boolean;
  field_set?: Partial<Record<CanonicalConcept, unknown>>;
}): CostFieldResolution | null {
  const field = input.column_name;
  if (!ORDER_ITEM_COST_FIELDS.has(field as CanonicalConcept) && !PRODUCT_COST_FIELDS.has(field as CanonicalConcept)) return null;
  if (!hasValue(input.sample_value) && !hasValue(input.field_set?.[field as CanonicalConcept])) {
    return {
      canonical_field: field === "product_cost" ? "product_cost" : "cogs",
      target_entity: "ecommerce_order_items",
      confidence: 0,
      source_table_type: "unknown",
      status: "MISSING"
    };
  }

  const sourceTableType = input.source_table_type ?? inferSourceTableType(input.field_set ?? {});
  if (sourceTableType === "product_catalog") {
    return {
      canonical_field: "product_cost",
      target_entity: "ecommerce_products",
      confidence: field === "product_cost" ? 0.98 : 0.95,
      source_table_type: sourceTableType,
      status: "AVAILABLE"
    };
  }

  if (sourceTableType === "order_items") {
    return {
      canonical_field: "cogs",
      target_entity: "ecommerce_order_items",
      confidence: field === "cogs" ? 0.98 : 0.9,
      source_table_type: sourceTableType,
      status: field === "product_cost" ? "LOW_CONFIDENCE" : "AVAILABLE"
    };
  }

  if (input.sku_mapping) {
    return {
      canonical_field: field === "product_cost" ? "product_cost" : "cogs",
      target_entity: field === "product_cost" ? "ecommerce_products" : "ecommerce_order_items",
      confidence: 0.72,
      source_table_type: "unknown",
      status: "LOW_CONFIDENCE"
    };
  }

  return null;
}

export function inferSourceTableType(fields: Partial<Record<CanonicalConcept, unknown>>): SourceTableType {
  const hasOrderContext = hasValue(fields.order_id) || hasValue(fields.order_date) || hasValue(fields.revenue) || hasValue(fields.quantity);
  const hasProductContext = hasValue(fields.product_name) || hasValue(fields.product_id) || hasValue((fields as Record<string, unknown>).category);

  if (hasOrderContext && hasValue(fields.sku)) return "order_items";
  if (hasProductContext && hasValue(fields.sku)) return "product_catalog";
  if (hasValue(fields.sku) && (hasValue(fields.cogs) || hasValue(fields.product_cost))) return "product_catalog";
  return "unknown";
}

export function resolveSkuCost(input: {
  orderItemCogs?: unknown;
  productCost?: unknown;
  productUnitCost?: unknown;
  otherCost?: unknown;
}): SkuCostResolution {
  const candidates = [
    { value: input.orderItemCogs, source: "ecommerce_order_items.cogs", confidence: 0.98 },
    { value: input.productCost, source: "ecommerce_products.product_cost", confidence: 0.95 },
    { value: input.productUnitCost, source: "ecommerce_products.unit_cost", confidence: 0.9 },
    { value: input.otherCost, source: "other_normalized_cost_fields", confidence: 0.72 }
  ];

  for (const candidate of candidates) {
    const value = finiteNumber(candidate.value);
    if (value !== null) {
      return {
        value,
        source: candidate.source,
        confidence: candidate.confidence,
        status: candidate.confidence >= 0.8 ? "AVAILABLE" : "LOW_CONFIDENCE"
      };
    }
  }

  return {
    value: null,
    source: null,
    confidence: 0,
    status: "MISSING"
  };
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,%]/g, "")) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}
