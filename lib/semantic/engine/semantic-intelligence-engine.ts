import type { CanonicalConcept, RawFieldObservation, SemanticCandidate, SemanticValueType } from "@/lib/semantic/types";

type ConceptProfile = {
  concept: Exclude<CanonicalConcept, "unknown">;
  aliases: string[];
  expectedTypes: SemanticValueType[];
};

const CONCEPTS: ConceptProfile[] = [
  { concept: "revenue", aliases: ["revenue", "sales", "gmv", "amount", "total", "subtotal", "paid"], expectedTypes: ["number", "string"] },
  { concept: "gross_sales", aliases: ["gross_sales", "gross_revenue", "gross_amount"], expectedTypes: ["number", "string"] },
  { concept: "net_sales", aliases: ["net_sales", "net_revenue", "net_amount"], expectedTypes: ["number", "string"] },
  { concept: "discount_amount", aliases: ["discount_amount", "discount", "discounts", "promo_discount"], expectedTypes: ["number", "string"] },
  { concept: "tax_amount", aliases: ["tax_amount", "tax", "sales_tax"], expectedTypes: ["number", "string"] },
  { concept: "shipping_revenue", aliases: ["shipping_revenue", "shipping_income", "shipping_charged"], expectedTypes: ["number", "string"] },
  { concept: "refund_amount", aliases: ["refund_amount", "refund", "refunded", "return_amount", "chargeback"], expectedTypes: ["number", "string"] },
  { concept: "refunded_quantity", aliases: ["refunded_quantity", "refund_quantity", "returned_quantity", "quantity_refunded", "quantity returned", "returned units"], expectedTypes: ["number", "string"] },
  { concept: "total_paid", aliases: ["total_paid", "total paid", "paid_total", "current_total_price", "total_received"], expectedTypes: ["number", "string"] },
  { concept: "paid_amount", aliases: ["paid_amount", "amount_paid", "captured_amount", "paid amount", "amount paid"], expectedTypes: ["number", "string"] },
  { concept: "ad_spend", aliases: ["ad_spend", "ads_spend", "advertising_spend", "marketing_spend", "media_spend", "amount_spent", "amount spent", "total_ad_spend", "total spend", "campaign_spend", "spend", "cpc", "cpm", "budget"], expectedTypes: ["number", "string"] },
  { concept: "price", aliases: ["price", "unit_price", "item_price", "product_price"], expectedTypes: ["number", "string"] },
  { concept: "unit_price", aliases: ["unit_price", "item_price", "selling_price", "sale_price"], expectedTypes: ["number", "string"] },
  { concept: "cogs", aliases: ["cogs", "cost_of_goods_sold", "cost of goods sold"], expectedTypes: ["number", "string"] },
  { concept: "line_cogs", aliases: ["line_cogs", "line cogs", "line_cost", "line cost"], expectedTypes: ["number", "string"] },
  { concept: "total_cogs", aliases: ["total_cogs", "total cogs", "total_cost_of_goods", "total cost of goods"], expectedTypes: ["number", "string"] },
  { concept: "row_cogs", aliases: ["row_cogs", "row cogs", "row_cost", "row cost"], expectedTypes: ["number", "string"] },
  { concept: "item_cost", aliases: ["item_cost", "item cost", "unit_item_cost", "unit item cost"], expectedTypes: ["number", "string"] },
  { concept: "unit_cost", aliases: ["unit_cost", "unit cost", "unit_cogs", "unit cogs", "cost_price"], expectedTypes: ["number", "string"] },
  { concept: "product_cost", aliases: ["product_cost", "landed_cost", "landed cost"], expectedTypes: ["number", "string"] },
  { concept: "platform_fee", aliases: ["platform_fee", "marketplace_fee", "selling_fee", "commission_fee"], expectedTypes: ["number", "string"] },
  { concept: "payment_fee", aliases: ["payment_fee", "processing_fee", "transaction_fee", "stripe_fee"], expectedTypes: ["number", "string"] },
  { concept: "shipping_cost", aliases: ["shipping_cost", "shipping_fee", "carrier_cost", "postage_cost"], expectedTypes: ["number", "string"] },
  { concept: "fulfillment_cost", aliases: ["fulfillment_cost", "pick_pack_cost", "fulfilment_cost"], expectedTypes: ["number", "string"] },
  { concept: "warehouse_cost", aliases: ["warehouse_cost", "storage_cost", "warehousing_cost"], expectedTypes: ["number", "string"] },
  { concept: "gross_profit", aliases: ["gross_profit", "gross_margin_amount"], expectedTypes: ["number", "string"] },
  { concept: "net_profit", aliases: ["net_profit", "profit", "profit_amount"], expectedTypes: ["number", "string"] },
  { concept: "contribution_margin", aliases: ["contribution_margin", "contribution_profit"], expectedTypes: ["number", "string"] },
  { concept: "profit_margin", aliases: ["profit_margin", "margin_rate", "margin_pct", "profit_rate"], expectedTypes: ["number", "string"] },
  { concept: "order_id", aliases: ["order_id", "orderid", "order_number", "purchase_id", "transaction_id", "checkout_id"], expectedTypes: ["string", "number"] },
  { concept: "source_order_id", aliases: ["source_order_id", "source_orderid", "external_order_id", "platform_order_id", "amazon_order_id", "amazon order id", "shopify_order_id"], expectedTypes: ["string", "number"] },
  { concept: "order_name", aliases: ["order_name", "order name", "order_label", "order label", "shopify_order_name"], expectedTypes: ["string", "number"] },
  { concept: "source_line_item_id", aliases: ["source_line_item_id", "source_lineitem_id", "line_item_id", "lineitem_id", "shopify_line_item_id"], expectedTypes: ["string", "number"] },
  { concept: "order_item_id", aliases: ["order_item_id", "orderitem_id", "line_item_key", "lineitem_key"], expectedTypes: ["string", "number"] },
  { concept: "source_customer_id", aliases: ["source_customer_id", "source_customerid", "platform_customer_id"], expectedTypes: ["string", "number"] },
  { concept: "customer_created_at", aliases: ["customer_created_at", "customer_created_date", "created_at", "created date", "signup_date", "first_seen_at"], expectedTypes: ["datetime", "string"] },
  { concept: "first_order_date", aliases: ["first_order_date", "first_order_at", "customer_first_order_date", "first purchase date", "first_purchase_date"], expectedTypes: ["datetime", "string"] },
  { concept: "last_order_date", aliases: ["last_order_date", "last_order_at", "customer_last_order_date", "last purchase date", "last_purchase_date"], expectedTypes: ["datetime", "string"] },
  { concept: "total_orders", aliases: ["total_orders", "orders_count", "order_count", "orders count", "number_of_orders"], expectedTypes: ["number", "string"] },
  { concept: "orders_count", aliases: ["orders_count", "order_count", "orders count"], expectedTypes: ["number", "string"] },
  { concept: "total_spent", aliases: ["total_spent", "amount_spent", "customer_total_spent", "lifetime_spend", "total spend"], expectedTypes: ["number", "string"] },
  { concept: "lifetime_value", aliases: ["lifetime_value", "ltv", "customer_ltv", "customer_lifetime_value"], expectedTypes: ["number", "string"] },
  { concept: "order_date", aliases: ["order_date", "created_at", "created", "purchase_date", "purchase date", "purchase_time", "paid_at", "processed_at", "date", "time", "timestamp"], expectedTypes: ["datetime", "string"] },
  { concept: "created_at_source", aliases: ["created_at_source", "created_at", "created at", "source_created_at"], expectedTypes: ["datetime", "string"] },
  { concept: "updated_at_source", aliases: ["updated_at_source", "updated_at", "updated at", "source_updated_at"], expectedTypes: ["datetime", "string"] },
  { concept: "processed_at_source", aliases: ["processed_at_source", "processed_at", "processed at", "paid_at", "captured_at"], expectedTypes: ["datetime", "string"] },
  { concept: "cancelled_at_source", aliases: ["cancelled_at_source", "cancelled_at", "canceled_at", "cancelled at", "canceled at"], expectedTypes: ["datetime", "string"] },
  { concept: "order_status", aliases: ["order_status", "order status", "source_order_status", "amazon_order_status"], expectedTypes: ["string"] },
  { concept: "financial_status", aliases: ["financial_status", "financial status", "display_financial_status", "shopify_financial_status"], expectedTypes: ["string"] },
  { concept: "payment_status", aliases: ["payment_status", "payment status", "payment_state", "paid_status"], expectedTypes: ["string"] },
  { concept: "fulfillment_status", aliases: ["fulfillment_status", "fulfilment_status", "fulfillment status", "fulfilment status", "display_fulfillment_status"], expectedTypes: ["string"] },
  { concept: "is_cancelled", aliases: ["is_cancelled", "is_canceled", "cancelled", "canceled", "cancelled_order", "canceled_order"], expectedTypes: ["boolean", "string"] },
  { concept: "is_test", aliases: ["is_test", "test", "test_order", "test order"], expectedTypes: ["boolean", "string"] },
  { concept: "is_paid", aliases: ["is_paid", "paid", "paid_flag"], expectedTypes: ["boolean", "string"] },
  { concept: "product_id", aliases: ["product_id", "productid", "source_product_id", "shopify_product_id", "item_id", "listing_id"], expectedTypes: ["string", "number"] },
  { concept: "variant_id", aliases: ["variant_id", "variantid", "shopify_variant_id", "variant"], expectedTypes: ["string", "number"] },
  { concept: "asin", aliases: ["asin", "amazon_asin", "amazon_product_id"], expectedTypes: ["string", "number"] },
  { concept: "sku", aliases: ["sku", "seller_sku", "variant_sku", "item_sku", "stock_keeping_unit"], expectedTypes: ["string", "number"] },
  { concept: "product_name", aliases: ["product_name", "product title", "product_title", "title", "item_name", "item name", "item_title", "item title", "listing_title", "listing title", "lineitem_name", "line item name", "name"], expectedTypes: ["string"] },
  { concept: "title", aliases: ["title", "product title", "item title", "listing title", "line item name"], expectedTypes: ["string"] },
  { concept: "product_type", aliases: ["product_type", "product type", "type", "item_type", "item type"], expectedTypes: ["string"] },
  { concept: "handle", aliases: ["handle", "slug", "product_slug"], expectedTypes: ["string"] },
  { concept: "product_handle", aliases: ["product_handle", "shopify_handle"], expectedTypes: ["string"] },
  { concept: "description", aliases: ["description", "body", "body_text", "product_description"], expectedTypes: ["string"] },
  { concept: "description_html", aliases: ["description_html", "descriptionhtml", "body_html", "product_description_html"], expectedTypes: ["string"] },
  { concept: "tags", aliases: ["tags", "product_tags", "product tags", "tag_list", "keywords", "search_terms", "search terms", "labels"], expectedTypes: ["string", "array"] },
  { concept: "category", aliases: ["category", "product_category", "product category", "item_category", "item category", "productcategory", "taxonomy", "amazon_category", "amazon category", "shopify_category", "shopify category", "browse_node", "browse node", "department"], expectedTypes: ["string"] },
  { concept: "category_id", aliases: ["category_id", "product_category_id", "taxonomy_id"], expectedTypes: ["string", "number"] },
  { concept: "category_name", aliases: ["category_name", "product_category_name"], expectedTypes: ["string"] },
  { concept: "category_full_name", aliases: ["category_full_name", "full_category", "taxonomy_full_name"], expectedTypes: ["string"] },
  { concept: "collections", aliases: ["collections", "collection", "product_collections", "product collections"], expectedTypes: ["string", "array"] },
  { concept: "collection_handles", aliases: ["collection_handles", "collection_handle", "collection_slugs"], expectedTypes: ["string", "array"] },
  { concept: "options", aliases: ["options", "product_options", "variant_options"], expectedTypes: ["string", "array", "object"] },
  { concept: "featured_media", aliases: ["featured_media", "featured_media_url"], expectedTypes: ["string", "object"] },
  { concept: "featured_image_url", aliases: ["featured_image_url", "featured_image", "featured image", "image_url", "image url", "main_image", "thumbnail_url"], expectedTypes: ["string"] },
  { concept: "media", aliases: ["media", "media_urls", "product_media"], expectedTypes: ["string", "array"] },
  { concept: "images", aliases: ["images", "image_urls", "product_images"], expectedTypes: ["string", "array"] },
  { concept: "online_store_url", aliases: ["online_store_url", "online_store", "product_url", "store_url"], expectedTypes: ["string"] },
  { concept: "seo_title", aliases: ["seo_title", "seo_title_tag", "meta_title"], expectedTypes: ["string"] },
  { concept: "seo_description", aliases: ["seo_description", "meta_description"], expectedTypes: ["string"] },
  { concept: "compare_at_price", aliases: ["compare_at_price", "compareatprice", "msrp", "list_price", "original_price"], expectedTypes: ["number", "string"] },
  { concept: "barcode", aliases: ["barcode", "gtin", "upc", "ean"], expectedTypes: ["string", "number"] },
  { concept: "inventory_item_id", aliases: ["inventory_item_id", "inventoryitemid"], expectedTypes: ["string", "number"] },
  { concept: "inventory_item_sku", aliases: ["inventory_item_sku", "inventoryitemsku"], expectedTypes: ["string"] },
  { concept: "inventory_item_tracked", aliases: ["inventory_item_tracked", "tracked"], expectedTypes: ["boolean", "string"] },
  { concept: "inventory_requires_shipping", aliases: ["inventory_requires_shipping", "requires_shipping"], expectedTypes: ["boolean", "string"] },
  { concept: "inventory_unit_cost", aliases: ["inventory_unit_cost", "inventory_unitcost", "unit_cost_amount"], expectedTypes: ["number", "string"] },
  { concept: "inventory_unit_cost_currency", aliases: ["inventory_unit_cost_currency", "unit_cost_currency"], expectedTypes: ["string"] },
  { concept: "weight", aliases: ["weight", "product_weight", "variant_weight"], expectedTypes: ["number", "string"] },
  { concept: "weight_unit", aliases: ["weight_unit", "weightunit"], expectedTypes: ["string"] },
  { concept: "selected_options", aliases: ["selected_options", "selected_variant_options"], expectedTypes: ["string", "array", "object"] },
  { concept: "variant_media", aliases: ["variant_media", "variant_image", "variant_image_url"], expectedTypes: ["string", "object"] },
  { concept: "metafields", aliases: ["metafields", "metafield_values"], expectedTypes: ["string", "array", "object"] },
  { concept: "metafield_keys", aliases: ["metafield_keys", "metafield_key_list"], expectedTypes: ["string", "array"] },
  { concept: "vendor", aliases: ["vendor", "supplier", "manufacturer", "seller_brand", "seller brand"], expectedTypes: ["string"] },
  { concept: "brand", aliases: ["brand", "brand_name", "brand name", "manufacturer", "seller_brand", "seller brand"], expectedTypes: ["string"] },
  { concept: "customer_id", aliases: ["customer_id", "buyer_id", "user_id", "client_id", "shopper_id", "shopify_customer_id"], expectedTypes: ["string", "number"] },
  { concept: "email_hash", aliases: ["email_hash", "hashed_email", "customer_email_hash"], expectedTypes: ["string"] },
  { concept: "country", aliases: ["country", "country_code", "ship_country", "billing_country"], expectedTypes: ["string"] },
  { concept: "province", aliases: ["province", "state", "customer_province", "customer_state"], expectedTypes: ["string"] },
  { concept: "city", aliases: ["city", "customer_city"], expectedTypes: ["string"] },
  { concept: "campaign_id", aliases: ["campaign_id", "campaignid", "campaign"], expectedTypes: ["string", "number"] },
  { concept: "adset_id", aliases: ["adset_id", "ad_set_id", "adsetid", "ad_group_id"], expectedTypes: ["string", "number"] },
  { concept: "ad_id", aliases: ["ad_id", "adid", "creative_id"], expectedTypes: ["string", "number"] },
  { concept: "impressions", aliases: ["impressions", "impression", "views"], expectedTypes: ["number", "string"] },
  { concept: "clicks", aliases: ["clicks", "click", "link_clicks"], expectedTypes: ["number", "string"] },
  { concept: "conversions", aliases: ["conversions", "conversion_count", "purchases", "orders"], expectedTypes: ["number", "string"] },
  { concept: "attribution_revenue", aliases: ["attribution_revenue", "purchase_value", "conversion_value", "revenue_attributed"], expectedTypes: ["number", "string"] },
  { concept: "event_date", aliases: ["event_date", "date_start", "day", "month", "report_date", "campaign_date", "insight_date"], expectedTypes: ["datetime", "string"] },
  { concept: "conversion_event", aliases: ["conversion", "event", "event_name", "action", "purchase_event"], expectedTypes: ["string"] },
  { concept: "refund_id", aliases: ["refund_id", "return_id", "chargeback_id"], expectedTypes: ["string", "number"] },
  { concept: "source_refund_id", aliases: ["source_refund_id", "source_refundid", "platform_refund_id"], expectedTypes: ["string", "number"] },
  { concept: "refund_reason", aliases: ["refund_reason", "return_reason", "reason"], expectedTypes: ["string"] },
  { concept: "refund_date", aliases: ["refund_date", "refunded_at", "return_date", "refund_created_at"], expectedTypes: ["datetime", "string"] },
  { concept: "quantity", aliases: ["quantity", "qty", "units", "unit_count", "item_count"], expectedTypes: ["number", "string"] },
  { concept: "stock_level", aliases: ["stock_level", "stock", "on_hand", "stock_on_hand"], expectedTypes: ["number", "string"] },
  { concept: "available_stock", aliases: ["available_stock", "available", "available_quantity", "sellable_stock"], expectedTypes: ["number", "string"] },
  { concept: "inventory_quantity", aliases: ["inventory_quantity", "inventory_qty", "inventory"], expectedTypes: ["number", "string"] },
  { concept: "inventory_value", aliases: ["inventory_value", "inventory value", "inventory-value", "stock_value", "stock value", "stock-value", "total_inventory_value", "total inventory value", "total-inventory-value", "inventory_asset_value", "inventory asset value", "stock_asset_value", "stock asset value", "on_hand_value", "on hand value", "total_value", "total value"], expectedTypes: ["number", "string"] },
  { concept: "inventory_cost", aliases: ["inventory_cost", "inventory cost"], expectedTypes: ["number", "string"] },
  { concept: "reorder_point", aliases: ["reorder_point", "reorder_level", "min_stock"], expectedTypes: ["number", "string"] },
  { concept: "warehouse_id", aliases: ["warehouse_id", "warehouse", "location_id", "fulfillment_center"], expectedTypes: ["string", "number"] },
  { concept: "snapshot_date", aliases: ["snapshot_date", "inventory_date", "as_of_date", "report_as_of_date"], expectedTypes: ["datetime", "string"] },
  { concept: "cost_type", aliases: ["cost_type", "expense_type", "fee_type"], expectedTypes: ["string"] },
  { concept: "status", aliases: ["status"], expectedTypes: ["string"] },
  { concept: "currency", aliases: ["currency", "currency_code", "iso_currency"], expectedTypes: ["string"] }
];

const VECTOR_SIZE = 48;
const CUSTOMER_CONTEXT_CONCEPTS = new Set<CanonicalConcept>([
  "source_customer_id",
  "customer_id",
  "customer_created_at",
  "first_order_date",
  "last_order_date",
  "total_orders",
  "orders_count",
  "total_spent",
  "lifetime_value",
  "province",
  "city"
]);

export class SemanticIntelligenceEngine {
  analyzeFields(fields: RawFieldObservation[]): { candidates: SemanticCandidate[]; unknown_fields: string[]; confidence: number } {
    const candidates = fields.flatMap((field) => this.candidatesForField(field));
    const mappedFields = new Set(candidates.filter((candidate) => candidate.maps_to !== "unknown").map((candidate) => candidate.field));
    const unknownFields = fields.map((field) => field.field).filter((field) => !mappedFields.has(field));
    const confidence = candidates.length
      ? average(candidates.filter((candidate) => candidate.maps_to !== "unknown").map((candidate) => candidate.confidence))
      : 0;

    return {
      candidates,
      unknown_fields: unknownFields,
      confidence
    };
  }

  embedField(fieldName: string, samples: unknown[] = [], context: string[] = []) {
    return embedText([fieldName, ...context, ...samples.slice(0, 3).map((sample) => String(sample ?? ""))].join(" "));
  }

  private candidatesForField(field: RawFieldObservation): SemanticCandidate[] {
    const normalized = normalizeFieldName(field.field);
    const fieldEmbedding = this.embedField(field.field, field.samples, field.context);
    const candidates = CONCEPTS.map((profile) => {
      const normalizedAliases = profile.aliases.map((alias) => normalizeFieldName(alias));
      const exactScore = normalized === normalizeFieldName(profile.concept) || normalizedAliases.includes(normalized) ? 0.18 : 0;
      const aliasScore = Math.max(...normalizedAliases.map((alias) => tokenSimilarity(normalized, alias)));
      const embeddingScore = Math.max(...profile.aliases.map((alias) => cosineSimilarity(fieldEmbedding, embedText(alias))));
      const typeScore = profile.expectedTypes.includes(field.valueType) ? 0.16 : typeCompatible(profile, field.valueType) ? 0.08 : -0.08;
      const valueScore = valuePatternScore(profile.concept, field);
      const contextScore = customerContext(field) && CUSTOMER_CONTEXT_CONCEPTS.has(profile.concept) ? 0.08 : customerContext(field) && profile.concept === "order_date" ? -0.18 : 0;
      const confidence = clamp(exactScore + (aliasScore * 0.48) + (embeddingScore * 0.24) + typeScore + valueScore + contextScore, 0, 0.99);

      return {
        field: field.field,
        maps_to: profile.concept,
        confidence,
        source: "engine" as const,
        reason: `alias=${aliasScore.toFixed(2)} embedding=${embeddingScore.toFixed(2)} type=${field.valueType}`
      };
    })
      .filter((candidate) => candidate.confidence >= 0.48)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    if (candidates.length) return candidates;

    return [{
      field: field.field,
      maps_to: "unknown",
      confidence: 0,
      source: "engine",
      reason: "No semantic match above threshold"
    }];
  }
}

function customerContext(field: RawFieldObservation) {
  return /customer|customers|buyer|profile/.test(normalizeFieldName([field.path, ...field.context].join("_")));
}

export function embedText(input: string) {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = tokenize(input);

  for (const token of tokens) {
    for (const gram of ngrams(token)) {
      vector[hashString(gram) % VECTOR_SIZE] += 1;
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return magnitude ? vector.map((value) => Number((value / magnitude).toFixed(6))) : vector;
}

export function normalizeFieldName(input: string) {
  return input
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\[(\d+)\]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function inferValueType(value: unknown): SemanticValueType {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "datetime";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    if (isDateLike(value)) return "datetime";
    if (value.trim() !== "" && Number.isFinite(Number(value)) && !/^0\d+/.test(value.trim())) return "number";
    return "string";
  }

  return "unknown";
}

function valuePatternScore(concept: Exclude<CanonicalConcept, "unknown">, field: RawFieldObservation) {
  const samples = field.samples.filter((sample) => sample !== null && sample !== undefined).slice(0, 8);
  const stringSamples = samples.map((sample) => String(sample));

  if (concept === "order_date" && stringSamples.some(isDateLike)) return 0.16;
  if (MONEY_CONCEPTS.has(concept) && samples.some((sample) => Number(sample) > 0)) return 0.1;
  if (concept === "currency" && stringSamples.some((sample) => /^[A-Z]{3}$/.test(sample))) return 0.18;
  if (concept === "sku" && stringSamples.some((sample) => /^[A-Z0-9_-]{3,}$/i.test(sample))) return 0.08;

  return 0;
}

const MONEY_CONCEPTS = new Set<Exclude<CanonicalConcept, "unknown">>([
  "revenue",
  "gross_sales",
  "net_sales",
  "discount_amount",
  "tax_amount",
  "shipping_revenue",
  "refund_amount",
  "total_paid",
  "paid_amount",
  "ad_spend",
  "price",
  "unit_price",
  "cogs",
  "product_cost",
  "platform_fee",
  "payment_fee",
  "shipping_cost",
  "fulfillment_cost",
  "warehouse_cost",
  "gross_profit",
  "net_profit",
  "contribution_margin",
  "profit_margin",
  "inventory_cost",
  "inventory_value"
]);

function typeCompatible(profile: ConceptProfile, valueType: SemanticValueType) {
  return valueType === "null" || profile.expectedTypes.includes(valueType);
}

function tokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftParts = new Set(left.split("_").filter(Boolean));
  const rightParts = new Set(right.split("_").filter(Boolean));
  const intersection = [...leftParts].filter((part) => rightParts.has(part)).length;
  const union = new Set([...leftParts, ...rightParts]).size || 1;
  const contains = left.includes(right) || right.includes(left) ? 0.75 : 0;

  return Math.max(intersection / union, contains);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }

  return leftMagnitude && rightMagnitude ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) : 0;
}

function tokenize(input: string) {
  return normalizeFieldName(input).split("_").filter(Boolean);
}

function ngrams(token: string) {
  const grams = new Set<string>([token]);
  for (let size = 2; size <= Math.min(4, token.length); size += 1) {
    for (let index = 0; index <= token.length - size; index += 1) {
      grams.add(token.slice(index, index + size));
    }
  }

  return grams;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

function isDateLike(value: string) {
  const trimmed = value.trim();

  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?/.test(trimmed)
    || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
