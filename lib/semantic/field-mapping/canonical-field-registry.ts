import { normalizeFieldName } from "@/lib/semantic/engine/semantic-intelligence-engine";
import type { CanonicalConcept, RawFieldObservation, SemanticCandidate } from "@/lib/semantic/types";

export type CanonicalFieldType = "currency" | "number" | "string" | "datetime" | "rate";
export type CanonicalFieldDomain = "advertising" | "orders" | "product" | "customer" | "cost" | "refund" | "inventory" | "channel" | "system";
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
  field("source_order_id", "orders", "string", ["external_order_id", "platform_order_id", "amazon_order_id", "amazon order id", "shopify_order_id"]),
  field("order_id", "orders", "string", ["order_id", "source_order_id", "source_orderid", "orderid", "order_number", "purchase_id", "transaction_id", "checkout_id"]),
  field("order_name", "orders", "string", ["order_name", "order name", "order_label", "order label", "shopify_order_name"]),
  field("source_line_item_id", "orders", "string", ["source_line_item_id", "source_lineitem_id", "line_item_id", "lineitem_id", "shopify_line_item_id"]),
  field("order_item_id", "orders", "string", ["order_item_id", "orderitem_id", "line_item_key", "lineitem_key"]),
  field("order_date", "orders", "datetime", ["order_date", "source_order_date", "transaction_date", "purchase_date", "purchase date", "purchase_time", "paid_at", "processed_at", "created_at"]),
  field("created_at_source", "orders", "datetime", ["created_at_source", "created_at", "created at", "source_created_at"]),
  field("updated_at_source", "orders", "datetime", ["updated_at_source", "updated_at", "updated at", "source_updated_at"]),
  field("processed_at_source", "orders", "datetime", ["processed_at_source", "processed_at", "processed at", "paid_at", "captured_at"]),
  field("cancelled_at_source", "orders", "datetime", ["cancelled_at_source", "cancelled_at", "canceled_at", "cancelled at", "canceled at"]),
  field("order_status", "orders", "string", ["order_status", "order status", "source_order_status", "amazon_order_status"]),
  field("financial_status", "orders", "string", ["financial_status", "financial status", "display_financial_status", "shopify_financial_status"]),
  field("payment_status", "orders", "string", ["payment_status", "payment status", "paid_status", "payment_state"]),
  field("fulfillment_status", "orders", "string", ["fulfillment_status", "fulfilment_status", "fulfillment status", "fulfilment status", "display_fulfillment_status"]),
  field("is_cancelled", "orders", "string", ["is_cancelled", "is_canceled", "cancelled", "canceled", "cancelled_order", "canceled_order"]),
  field("is_test", "orders", "string", ["is_test", "test", "test_order", "test order"]),
  field("is_paid", "orders", "string", ["is_paid", "paid", "paid_flag"]),
  field("revenue", "orders", "currency", ["revenue", "sales", "gmv", "amount", "total", "subtotal", "paid"]),
  field("total_paid", "orders", "currency", ["total_paid", "total paid", "paid_total", "paid total", "current_total_price", "total_received"]),
  field("paid_amount", "orders", "currency", ["paid_amount", "paid amount", "amount_paid", "amount paid", "captured_amount", "captured amount"]),
  field("quantity", "orders", "number", ["quantity", "qty", "units", "unit_count", "item_count"]),
  field("sku", "product", "string", ["sku", "seller_sku", "variant_sku", "item_sku", "stock_keeping_unit", "product_code", "lineitem_sku", "line item sku"]),
  field("product_id", "product", "string", ["product_id", "productid", "source_product_id", "shopify_product_id", "item_id", "listing_id"]),
  field("variant_id", "product", "string", ["variant_id", "variantid", "shopify_variant_id", "variant"]),
  field("asin", "product", "string", ["asin", "amazon_asin", "amazon_product_id"]),
  field("product_name", "product", "string", ["product_name", "product name", "title", "product_title", "product title", "item_name", "item name", "item_title", "item title", "listing_title", "listing title", "lineitem_name", "line item name", "name"]),
  field("title", "product", "string", ["title", "product title", "item title", "listing title", "line item name"]),
  field("product_type", "product", "string", ["product_type", "product type", "type", "item_type", "item type"]),
  field("handle", "product", "string", ["handle", "slug", "product_slug", "product slug", "listing_slug", "listing slug"]),
  field("product_handle", "product", "string", ["product_handle", "shopify_handle"]),
  field("description", "product", "string", ["description", "body", "body_text", "product_description"]),
  field("description_html", "product", "string", ["description_html", "descriptionhtml", "body_html", "product_description_html"]),
  field("tags", "product", "string", ["tags", "product_tags", "product tags", "tag_list", "keywords", "search_terms", "search terms", "labels"]),
  field("category", "product", "string", ["category", "product_category", "product category", "item_category", "item category", "productcategory", "taxonomy", "amazon_category", "amazon category", "shopify_category", "shopify category", "browse_node", "browse node", "department"]),
  field("category_id", "product", "string", ["category_id", "product_category_id", "taxonomy_id"]),
  field("category_name", "product", "string", ["category_name", "product_category_name"]),
  field("category_full_name", "product", "string", ["category_full_name", "full_category", "taxonomy_full_name"]),
  field("collections", "product", "string", ["collections", "collection", "product_collections"]),
  field("collection_handles", "product", "string", ["collection_handles", "collection_handle", "collection_slugs"]),
  field("options", "product", "string", ["options", "product_options", "variant_options"]),
  field("featured_media", "product", "string", ["featured_media", "featured_media_url"]),
  field("featured_image_url", "product", "string", ["featured_image_url", "featured_image", "image_url", "main_image", "thumbnail_url"]),
  field("media", "product", "string", ["media", "media_urls", "product_media"]),
  field("images", "product", "string", ["images", "image_urls", "product_images"]),
  field("online_store_url", "product", "string", ["online_store_url", "online_store", "product_url", "store_url"]),
  field("seo_title", "product", "string", ["seo_title", "seo_title_tag", "meta_title"]),
  field("seo_description", "product", "string", ["seo_description", "meta_description"]),
  field("compare_at_price", "product", "currency", ["compare_at_price", "compareatprice", "msrp", "list_price", "original_price"]),
  field("barcode", "product", "string", ["barcode", "gtin", "upc", "ean"]),
  field("inventory_item_id", "product", "string", ["inventory_item_id", "inventoryitemid"]),
  field("inventory_item_sku", "product", "string", ["inventory_item_sku", "inventoryitemsku"]),
  field("inventory_item_tracked", "product", "string", ["inventory_item_tracked", "tracked"]),
  field("inventory_requires_shipping", "product", "string", ["inventory_requires_shipping", "requires_shipping"]),
  field("inventory_unit_cost", "product", "currency", ["inventory_unit_cost", "inventory_unitcost", "unit_cost_amount"]),
  field("inventory_unit_cost_currency", "product", "string", ["inventory_unit_cost_currency", "unit_cost_currency"]),
  field("weight", "product", "number", ["weight", "product_weight", "variant_weight"]),
  field("weight_unit", "product", "string", ["weight_unit", "weightunit"]),
  field("selected_options", "product", "string", ["selected_options", "selected_variant_options"]),
  field("variant_media", "product", "string", ["variant_media", "variant_image", "variant_image_url"]),
  field("metafields", "product", "string", ["metafields", "metafield_values"]),
  field("metafield_keys", "product", "string", ["metafield_keys", "metafield_key_list"]),
  field("vendor", "product", "string", ["vendor", "supplier", "manufacturer", "seller_brand", "seller brand"]),
  field("brand", "product", "string", ["brand", "brand_name", "brand name", "manufacturer", "seller_brand", "seller brand"]),
  field("channel", "channel", "string", ["channel", "platform", "sales_channel", "source_platform", "marketplace", "storefront"]),
  field("order_channel", "channel", "string", ["order_channel", "order_source", "source_name", "source", "traffic_source", "sales_source"]),
  field("fulfillment_channel", "channel", "string", ["fulfillment_channel", "fulfilment_channel", "fulfillment_service", "fulfillment_method", "delivery_channel", "shipping_channel"]),
  field("region", "channel", "string", ["region", "market", "country_region", "geo", "province", "state", "city"]),
  field("utm_campaign", "channel", "string", ["utm_campaign", "utm_campaign_name", "campaign_utm", "marketing_campaign"]),
  field("tax_amount", "orders", "currency", ["tax", "tax_amount", "sales_tax"]),
  field("cogs", "cost", "currency", ["cogs", "cost_of_goods_sold", "cost of goods sold"]),
  field("line_cogs", "cost", "currency", ["line_cogs", "line cogs", "line_cost", "line cost"]),
  field("total_cogs", "cost", "currency", ["total_cogs", "total cogs", "total_cost_of_goods", "total cost of goods"]),
  field("row_cogs", "cost", "currency", ["row_cogs", "row cogs", "row_cost", "row cost"]),
  field("item_cost", "cost", "currency", ["item_cost", "item cost", "unit_item_cost", "unit item cost"]),
  field("unit_cost", "cost", "currency", ["unit_cost", "unit cost", "unit_cogs", "unit cogs", "cost_price"]),
  field("product_cost", "cost", "currency", ["product_cost", "landed_cost", "landed cost"]),
  field("shipping_cost", "cost", "currency", ["shipping_cost", "shipping_fee", "carrier_cost", "postage_cost"]),
  field("platform_fee", "cost", "currency", ["platform_fee", "marketplace_fee", "selling_fee", "commission_fee"]),
  field("payment_fee", "cost", "currency", ["payment_fee", "processing_fee", "transaction_fee", "stripe_fee"]),
  field("source_refund_id", "refund", "string", ["source_refund_id", "source_refundid", "platform_refund_id"]),
  field("refund_id", "refund", "string", ["refund_id", "return_id", "chargeback_id"]),
  field("refund_amount", "refund", "currency", ["refund_amount", "refund", "refunded", "return_amount", "chargeback"]),
  field("refunded_quantity", "refund", "number", ["refunded_quantity", "refund_quantity", "returned_quantity", "quantity_refunded", "quantity returned", "returned units"]),
  field("refund_date", "refund", "datetime", ["refund_date", "refunded_at", "return_date", "refund created at", "refund_created_at"]),
  field("stock_level", "inventory", "number", ["stock_level", "stock", "on_hand", "stock_on_hand", "inventory_on_hand"]),
  field("available_stock", "inventory", "number", ["available_stock", "available", "available_quantity", "sellable_stock"]),
  field("inventory_quantity", "inventory", "number", ["inventory_quantity", "inventory_qty", "inventory"]),
  field("inventory_value", "inventory", "currency", [
    "inventory_value",
    "inventory value",
    "inventory-value",
    "stock_value",
    "stock value",
    "stock-value",
    "total_inventory_value",
    "total inventory value",
    "total-inventory-value",
    "inventory_asset_value",
    "inventory asset value",
    "stock_asset_value",
    "stock asset value",
    "on_hand_value",
    "on hand value",
    "total_value",
    "total value"
  ]),
  field("inventory_cost", "inventory", "currency", ["inventory_cost", "inventory cost"]),
  field("inventory_unit_cost", "inventory", "currency", ["inventory_unit_cost", "inventory unit cost", "unit_inventory_cost", "unit cost", "inventory_unitcost"]),
  field("reorder_point", "inventory", "number", ["reorder_point", "reorder_level", "min_stock"]),
  field("warehouse_id", "inventory", "string", ["warehouse_id", "warehouse", "location_id", "fulfillment_center"]),
  field("snapshot_date", "inventory", "datetime", ["snapshot_date", "inventory_date", "inventory date", "as_of_date", "as of date", "report_as_of_date"]),
  field("currency", "system", "string", ["currency", "currency_code", "iso_currency"]),
  field("source_customer_id", "customer", "string", ["source_customer_id", "source_customerid", "platform_customer_id"]),
  field("customer_id", "customer", "string", ["customer_id", "source_customer_id", "customerid", "shopify_customer_id"]),
  field("customer_created_at", "customer", "datetime", ["customer_created_at", "customer_created_date", "customer created at", "customer created date", "created_at", "created date", "signup_date", "first_seen_at"]),
  field("first_order_date", "customer", "datetime", ["first_order_date", "first_order_at", "customer_first_order_date", "first purchase date", "first_purchase_date"]),
  field("last_order_date", "customer", "datetime", ["last_order_date", "last_order_at", "customer_last_order_date", "last purchase date", "last_purchase_date"]),
  field("total_orders", "customer", "number", ["total_orders", "orders_count", "order_count", "orders count", "number_of_orders"]),
  field("orders_count", "customer", "number", ["orders_count", "order_count", "orders count"]),
  field("total_spent", "customer", "currency", ["total_spent", "amount_spent", "customer_total_spent", "lifetime_spend", "total spend"]),
  field("lifetime_value", "customer", "currency", ["lifetime_value", "ltv", "customer_ltv", "customer_lifetime_value"]),
  field("province", "customer", "string", ["province", "state", "customer_province", "customer_state"]),
  field("city", "customer", "string", ["city", "customer_city"]),
  field("status", "system", "string", ["status"])
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
    if (entry.canonicalField === "order_date" && normalized === "created_at" && customerContext(context)) {
      return match(entry, sourceField, 0.62, "ai_suggested");
    }
    const confidence = entry.canonicalField === "ad_spend" && normalized === "cost" && !advertisingContext(context) ? 0.62 : 1;
    return match(entry, sourceField, boostForContext(entry, context, confidence), "exact_alias");
  }
  if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
    const confidence = entry.canonicalField === "ad_spend" && /cost/.test(normalized) && !advertisingContext(context) ? 0.58 : 0.86;
    return match(entry, sourceField, boostForContext(entry, context, confidence), "alias_match");
  }

  return null;
}

function advertisingContext(context: string) {
  return /ad|ads|advertis|campaign|meta|google|amazon_ads|marketing|media|insight/.test(context);
}

function customerContext(context: string) {
  return /customer|customers|buyer|profile/.test(context);
}

function boostForContext(entry: CanonicalFieldRegistryEntry, context: string, confidence: number) {
  if (entry.domain === "customer" && customerContext(context)) return Math.min(1, confidence + 0.03);
  if (entry.domain === "orders" && customerContext(context)) return Math.min(confidence, 0.72);
  return confidence;
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
