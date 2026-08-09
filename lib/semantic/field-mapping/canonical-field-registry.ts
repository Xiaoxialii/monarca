import { normalizeFieldName } from "@/lib/semantic/engine/semantic-intelligence-engine";
import type { CanonicalConcept, RawFieldObservation, SemanticCandidate } from "@/lib/semantic/types";

export type CanonicalFieldType = "currency" | "number" | "string" | "datetime" | "rate";
export type CanonicalFieldDomain = "advertising" | "orders" | "product" | "cost" | "refund" | "inventory" | "channel" | "system";
export type CanonicalFieldRegistryEntry = {
  canonicalField: CanonicalConcept;
  aliases: string[];
  domain: CanonicalFieldDomain;
  type: CanonicalFieldType;
};

export type RegistryMappingMethod = "exact_match" | "exact_alias" | "alias_match" | "semantic_match" | "ai_suggested";
export type RegistryFieldMatch = {
  canonical_field: CanonicalConcept;
  source_field: string;
  confidence: number;
  mapping_method: RegistryMappingMethod;
  domain: CanonicalFieldDomain;
};

export const CanonicalFieldRegistry: CanonicalFieldRegistryEntry[] = [
  field("ad_spend", "advertising", "currency", [
    "ad_spend",
    "ads_spend",
    "spend",
    "cost",
    "amount_spent",
    "advertising_cost",
    "advertising_spend",
    "marketing_spend",
    "media_spend",
    "total_spend",
    "total_ad_spend",
    "campaign_spend"
  ]),
  field("campaign_id", "advertising", "string", ["campaign_id", "campaign", "campaign_name", "campaign_identifier", "campaignid"]),
  field("ad_id", "advertising", "string", ["ad_id", "adid", "creative_id"]),
  field("adset_id", "advertising", "string", ["adset_id", "ad_set_id", "ad_group_id", "adsetid"]),
  field("impressions", "advertising", "number", ["impressions", "impression", "views"]),
  field("clicks", "advertising", "number", ["clicks", "click", "link_clicks"]),
  field("conversions", "advertising", "number", ["conversions", "purchases", "orders", "conversion_count"]),
  field("attribution_revenue", "advertising", "currency", ["attributed_revenue", "attribution_revenue", "purchase_value", "conversion_value", "revenue_attributed"]),
  field("event_date", "advertising", "datetime", ["ad_date", "event_date", "date", "date_start", "day", "month", "report_date", "campaign_date", "insight_date"]),
  field("order_id", "orders", "string", ["order_id", "orderid", "order_number", "purchase_id", "transaction_id", "checkout_id"]),
  field("order_date", "orders", "datetime", ["order_date", "transaction_date", "purchase_time", "paid_at", "processed_at", "created_at"]),
  field("revenue", "orders", "currency", ["revenue", "sales", "gmv", "amount", "total", "subtotal", "paid"]),
  field("quantity", "orders", "number", ["quantity", "qty", "units", "unit_count", "item_count"]),
  field("sku", "product", "string", ["sku", "seller_sku", "variant_sku", "item_sku", "stock_keeping_unit", "product_code"]),
  field("product_id", "product", "string", ["product_id", "productid", "item_id", "asin", "listing_id"]),
  field("product_name", "product", "string", ["product_name", "title", "product_title", "item_name", "name"]),
  field("cogs", "cost", "currency", ["cogs", "cost_of_goods_sold", "unit_cogs"]),
  field("product_cost", "cost", "currency", ["product_cost", "unit_cost", "item_cost", "landed_cost"]),
  field("shipping_cost", "cost", "currency", ["shipping_cost", "shipping_fee", "carrier_cost", "postage_cost"]),
  field("platform_fee", "cost", "currency", ["platform_fee", "marketplace_fee", "selling_fee", "commission_fee"]),
  field("payment_fee", "cost", "currency", ["payment_fee", "processing_fee", "transaction_fee", "stripe_fee"]),
  field("refund_amount", "refund", "currency", ["refund_amount", "refund", "refunded", "return_amount", "chargeback"]),
  field("stock_level", "inventory", "number", ["stock_level", "stock", "on_hand", "stock_on_hand", "inventory_on_hand"]),
  field("available_stock", "inventory", "number", ["available_stock", "available", "available_quantity", "sellable_stock"]),
  field("inventory_quantity", "inventory", "number", ["inventory_quantity", "inventory_qty", "inventory"]),
  field("inventory_cost", "inventory", "currency", ["inventory_cost", "stock_value", "inventory_value"]),
  field("reorder_point", "inventory", "number", ["reorder_point", "reorder_level", "min_stock"]),
  field("warehouse_id", "inventory", "string", ["warehouse_id", "warehouse", "location_id", "fulfillment_center"]),
  field("currency", "system", "string", ["currency", "currency_code", "iso_currency"])
];

export function registryCandidatesForField(field: RawFieldObservation): SemanticCandidate[] {
  const matches = registryMatchesForField(field);

  return matches.map((match) => ({
    field: field.field,
    maps_to: match.canonical_field,
    confidence: match.confidence,
    source: "registry",
    reason: `registry ${match.mapping_method} domain=${match.domain}`
  }));
}

export function registryMatchesForField(field: RawFieldObservation): RegistryFieldMatch[] {
  const normalized = normalizeFieldName(field.field);
  const context = normalizeFieldName([field.path, ...field.context].join("_"));
  const ranked = CanonicalFieldRegistry
    .map((entry) => matchRegistryEntry(entry, normalized, context, field.field))
    .filter((match): match is RegistryFieldMatch => Boolean(match))
    .sort((left, right) => right.confidence - left.confidence);

  if (ranked.length <= 1) return ranked;

  return ranked.map((match) => {
    if (match.canonical_field === "ad_spend" && match.source_field === "cost" && !advertisingContext(context)) {
      return { ...match, confidence: Math.min(match.confidence, 0.62), mapping_method: "ai_suggested" as const };
    }
    return match;
  }).sort((left, right) => right.confidence - left.confidence);
}

export function mappingMethodFromCandidate(candidate: SemanticCandidate | undefined | null): RegistryMappingMethod {
  if (!candidate) return "ai_suggested";
  if (candidate.source === "registry") {
    if (/exact_match/.test(candidate.reason)) return "exact_match";
    if (/exact_alias/.test(candidate.reason)) return "exact_alias";
    if (/alias_match/.test(candidate.reason)) return "alias_match";
  }
  if (candidate.source === "memory") return "semantic_match";
  return "semantic_match";
}

export function ambiguousFieldSuggestions(field: RawFieldObservation): Array<{ canonical_field: CanonicalConcept; confidence: number; reason: string }> {
  const normalized = normalizeFieldName(field.field);
  const samples = field.samples.filter((sample) => sample !== null && sample !== undefined);
  const numeric = samples.some((sample) => Number.isFinite(typeof sample === "number" ? sample : Number(String(sample).replace(/[$,%]/g, ""))));

  if (!numeric || !/(money|amount|cost|spend|used|value|total)/.test(normalized)) return [];

  return [
    { canonical_field: "ad_spend", confidence: 0.45, reason: "numeric money-like field could be advertising spend" },
    { canonical_field: "revenue", confidence: 0.42, reason: "numeric money-like field could be sales revenue" },
    { canonical_field: "product_cost", confidence: 0.4, reason: "numeric money-like field could be product or operating cost" }
  ];
}

function matchRegistryEntry(entry: CanonicalFieldRegistryEntry, normalized: string, context: string, sourceField: string): RegistryFieldMatch | null {
  const canonical = normalizeFieldName(entry.canonicalField);
  const aliases = entry.aliases.map(normalizeFieldName);

  if (normalized === canonical) return match(entry, sourceField, 1, "exact_match");
  if (aliases.includes(normalized)) {
    if (entry.canonicalField === "event_date" && normalized === "date" && !advertisingContext(context)) {
      return match(entry, sourceField, 0.62, "ai_suggested");
    }
    const confidence = entry.canonicalField === "ad_spend" && normalized === "cost" && !advertisingContext(context) ? 0.62 : 1;
    return match(entry, sourceField, confidence, "exact_alias");
  }
  if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
    const confidence = entry.canonicalField === "ad_spend" && /cost/.test(normalized) && !advertisingContext(context) ? 0.58 : 0.86;
    return match(entry, sourceField, confidence, "alias_match");
  }

  return null;
}

function advertisingContext(context: string) {
  return /ad|ads|advertis|campaign|meta|google|amazon_ads|marketing|media|insight/.test(context);
}

function field(canonicalField: CanonicalConcept, domain: CanonicalFieldDomain, type: CanonicalFieldType, aliases: string[]): CanonicalFieldRegistryEntry {
  return { canonicalField, domain, type, aliases };
}

function match(entry: CanonicalFieldRegistryEntry, sourceField: string, confidence: number, mappingMethod: RegistryMappingMethod): RegistryFieldMatch {
  return {
    canonical_field: entry.canonicalField,
    source_field: sourceField,
    confidence,
    mapping_method: mappingMethod,
    domain: entry.domain
  };
}
