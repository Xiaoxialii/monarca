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
  "reorder_point",
  "warehouse_id"
];

const INVENTORY_CONCEPTS = new Set<CanonicalConcept>([
  "stock_level",
  "available_stock",
  "inventory_quantity",
  "inventory_cost",
  "reorder_point",
  "warehouse_id"
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

const DATE_FIELDS = ["date", "day", "month", "report_date", "campaign_date", "event_date", "date_start", "insight_date"];

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

  if (matchesAny(normalized, DATE_FIELDS) && predictedConcept !== "event_date" && predictedConcept !== "order_date") {
    return reject(sourceField, predictedConcept, "date_field_must_map_to_date_concept");
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
