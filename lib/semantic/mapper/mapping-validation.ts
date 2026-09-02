import { normalizeFieldName } from "@/lib/semantic/engine/semantic-intelligence-engine";
import type { CanonicalConcept, MappingValidationResult, SemanticCandidate } from "@/lib/semantic/types";

const COST_FIELDS = [
  "cogs",
  "cost_of_goods_sold",
  "product_cost",
  "unit_cost",
  "platform_fee",
  "payment_fee",
  "transaction_fee",
  "shipping_cost",
  "fulfillment_cost",
  "fulfilment_cost",
  "warehouse_cost",
  "storage_cost",
  "inventory_cost"
];

const COST_CONCEPTS = new Set<CanonicalConcept>([
  "cogs",
  "product_cost",
  "platform_fee",
  "payment_fee",
  "shipping_cost",
  "fulfillment_cost",
  "warehouse_cost",
  "inventory_cost"
]);

const INVENTORY_FIELDS = [
  "stock_level",
  "stock",
  "available_stock",
  "inventory_quantity",
  "inventory_qty",
  "inventory_value",
  "stock_value",
  "total_inventory_value",
  "inventory_unit_cost",
  "reorder_point",
  "warehouse_id",
  "snapshot_date",
  "inventory_date"
];

const INVENTORY_CONCEPTS = new Set<CanonicalConcept>([
  "stock_level",
  "available_stock",
  "inventory_quantity",
  "inventory_cost",
  "inventory_value",
  "inventory_unit_cost",
  "reorder_point",
  "warehouse_id",
  "snapshot_date"
]);

const PRICE_FIELDS = ["price", "unit_price", "item_price", "product_price", "selling_price", "sale_price"];

const PRICE_CONCEPTS = new Set<CanonicalConcept>(["price", "unit_price"]);

const REVENUE_FIELDS = ["revenue", "gross_sales", "net_sales", "sales", "gmv", "amount", "subtotal", "total"];

const REVENUE_CONCEPTS = new Set<CanonicalConcept>([
  "revenue",
  "gross_sales",
  "net_sales",
  "shipping_revenue"
]);

const ADS_FIELDS = ["ad_spend", "ads_spend", "advertising_spend", "advertising_cost", "amount_spent", "total_spend", "total_ad_spend", "marketing_spend", "media_spend", "campaign_spend"];

const ADS_CONCEPTS = new Set<CanonicalConcept>(["ad_spend"]);

const DATE_FIELDS = ["date", "day", "month", "report_date", "campaign_date", "event_date", "date_start", "insight_date", "refund_date", "refunded_at", "snapshot_date", "inventory_date", "created_at", "updated_at", "processed_at", "cancelled_at", "canceled_at"];
const DATE_CONCEPTS = new Set<CanonicalConcept>([
  "event_date",
  "order_date",
  "refund_date",
  "snapshot_date",
  "created_at_source",
  "updated_at_source",
  "processed_at_source",
  "cancelled_at_source",
  "customer_created_at",
  "first_order_date",
  "last_order_date"
]);

const IDENTITY_FIELDS = [
  "order_id",
  "source_order_id",
  "source_line_item_id",
  "order_item_id",
  "order_number",
  "purchase_id",
  "transaction_id",
  "checkout_id",
  "customer_id",
  "source_customer_id",
  "product_id",
  "variant_id"
];

const IDENTITY_CONCEPTS = new Set<CanonicalConcept>([
  "order_id",
  "source_order_id",
  "source_line_item_id",
  "order_item_id",
  "customer_id",
  "source_customer_id",
  "product_id",
  "variant_id",
  "asin",
  "source_refund_id",
  "refund_id",
  "sku"
]);

const STATUS_FIELDS = ["status", "order_status", "financial_status", "fulfillment_status", "fulfilment_status", "payment_status", "is_cancelled", "is_canceled", "cancelled", "canceled", "is_test", "test_order", "is_paid"];
const STATUS_CONCEPTS = new Set<CanonicalConcept>([
  "status",
  "order_status",
  "financial_status",
  "payment_status",
  "fulfillment_status",
  "is_cancelled",
  "is_test",
  "is_paid",
  "cancelled_at_source"
]);

const CHANNEL_FIELDS = [
  "channel",
  "platform",
  "sales_channel",
  "order_channel",
  "fulfillment_channel",
  "fulfilment_channel",
  "fulfillment_service",
  "fulfillment_method",
  "delivery_channel",
  "shipping_channel",
  "region",
  "market",
  "utm_campaign"
];

const CHANNEL_CONCEPTS = new Set<CanonicalConcept>([
  "channel",
  "order_channel",
  "fulfillment_channel",
  "region",
  "utm_campaign"
]);

export function validateSemanticMapping(sourceField: string, predictedConcept: CanonicalConcept): MappingValidationResult {
  if (predictedConcept === "unknown") {
    return { sourceField, predictedConcept, accepted: true };
  }

  const normalized = normalizeFieldName(lastPathPart(sourceField));

  if (matchesAny(normalized, COST_FIELDS) && !COST_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "cost_field_cannot_map_to_revenue_ads_or_identity");
  }

  if (matchesAny(normalized, INVENTORY_FIELDS) && !INVENTORY_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "inventory_field_cannot_map_to_sku_or_product_id");
  }

  if (matchesAny(normalized, PRICE_FIELDS) && !PRICE_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "price_requires_unit_price_mapping_not_aggregated_revenue");
  }

  if (matchesAny(normalized, ADS_FIELDS)) {
    return ADS_CONCEPTS.has(predictedConcept)
      ? { sourceField, predictedConcept, accepted: true }
      : reject(sourceField, predictedConcept, "advertising_spend_must_map_to_ad_spend");
  }

  if (matchesAny(normalized, REVENUE_FIELDS) && !REVENUE_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "revenue_field_must_map_to_revenue_concept");
  }

  if (matchesAny(normalized, IDENTITY_FIELDS) && !IDENTITY_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "identifier_field_cannot_map_to_revenue");
  }

  if (matchesAny(normalized, STATUS_FIELDS) && !STATUS_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "status_field_must_map_to_status");
  }

  if (matchesAny(normalized, DATE_FIELDS) && !DATE_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "date_field_must_map_to_date_concept");
  }

  if (matchesAny(normalized, CHANNEL_FIELDS) && !CHANNEL_CONCEPTS.has(predictedConcept)) {
    return reject(sourceField, predictedConcept, "channel_field_must_map_to_channel_concept");
  }

  return { sourceField, predictedConcept, accepted: true };
}

export function firstValidCandidate(sourceField: string, candidates: SemanticCandidate[]) {
  for (const candidate of candidates) {
    if (candidate.maps_to === "unknown") continue;
    const validation = validateSemanticMapping(sourceField, candidate.maps_to);
    if (validation.accepted) return { candidate, validation };
  }

  return null;
}

function reject(sourceField: string, predictedConcept: CanonicalConcept, rejectionReason: string): MappingValidationResult {
  return {
    sourceField,
    predictedConcept,
    accepted: false,
    rejectionReason
  };
}

function matchesAny(field: string, patterns: string[]) {
  return patterns.some((pattern) => field === pattern || field.includes(pattern));
}

function lastPathPart(path: string) {
  return path.split(".").filter(Boolean).at(-1) ?? path;
}
