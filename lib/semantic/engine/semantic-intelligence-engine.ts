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
  { concept: "ad_spend", aliases: ["ad_spend", "ads_spend", "advertising_spend", "marketing_spend", "media_spend", "spend", "cpc", "cpm", "budget"], expectedTypes: ["number", "string"] },
  { concept: "price", aliases: ["price", "unit_price", "item_price", "product_price"], expectedTypes: ["number", "string"] },
  { concept: "unit_price", aliases: ["unit_price", "item_price", "selling_price", "sale_price"], expectedTypes: ["number", "string"] },
  { concept: "cogs", aliases: ["cogs", "cost_of_goods_sold", "unit_cogs"], expectedTypes: ["number", "string"] },
  { concept: "product_cost", aliases: ["product_cost", "unit_cost", "item_cost", "landed_cost", "cost"], expectedTypes: ["number", "string"] },
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
  { concept: "order_date", aliases: ["order_date", "created_at", "created", "purchase_time", "paid_at", "processed_at", "date", "time", "timestamp"], expectedTypes: ["datetime", "string"] },
  { concept: "product_id", aliases: ["product_id", "productid", "item_id", "asin", "listing_id"], expectedTypes: ["string", "number"] },
  { concept: "sku", aliases: ["sku", "seller_sku", "variant_sku", "item_sku", "stock_keeping_unit"], expectedTypes: ["string", "number"] },
  { concept: "product_name", aliases: ["product_name", "title", "product_title", "item_name", "name"], expectedTypes: ["string"] },
  { concept: "customer_id", aliases: ["customer_id", "buyer_id", "user_id", "client_id", "shopper_id"], expectedTypes: ["string", "number"] },
  { concept: "email_hash", aliases: ["email_hash", "hashed_email", "customer_email_hash"], expectedTypes: ["string"] },
  { concept: "country", aliases: ["country", "country_code", "ship_country", "billing_country"], expectedTypes: ["string"] },
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
  { concept: "refund_reason", aliases: ["refund_reason", "return_reason", "reason"], expectedTypes: ["string"] },
  { concept: "quantity", aliases: ["quantity", "qty", "units", "unit_count", "item_count"], expectedTypes: ["number", "string"] },
  { concept: "stock_level", aliases: ["stock_level", "stock", "on_hand", "stock_on_hand"], expectedTypes: ["number", "string"] },
  { concept: "available_stock", aliases: ["available_stock", "available", "available_quantity", "sellable_stock"], expectedTypes: ["number", "string"] },
  { concept: "inventory_quantity", aliases: ["inventory_quantity", "inventory_qty", "inventory"], expectedTypes: ["number", "string"] },
  { concept: "inventory_cost", aliases: ["inventory_cost", "stock_value", "inventory_value"], expectedTypes: ["number", "string"] },
  { concept: "reorder_point", aliases: ["reorder_point", "reorder_level", "min_stock"], expectedTypes: ["number", "string"] },
  { concept: "warehouse_id", aliases: ["warehouse_id", "warehouse", "location_id", "fulfillment_center"], expectedTypes: ["string", "number"] },
  { concept: "cost_type", aliases: ["cost_type", "expense_type", "fee_type"], expectedTypes: ["string"] },
  { concept: "status", aliases: ["status", "order_status", "financial_status", "payment_status"], expectedTypes: ["string"] },
  { concept: "currency", aliases: ["currency", "currency_code", "iso_currency"], expectedTypes: ["string"] }
];

const VECTOR_SIZE = 48;

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
      const aliasScore = Math.max(...profile.aliases.map((alias) => tokenSimilarity(normalized, normalizeFieldName(alias))));
      const embeddingScore = Math.max(...profile.aliases.map((alias) => cosineSimilarity(fieldEmbedding, embedText(alias))));
      const typeScore = profile.expectedTypes.includes(field.valueType) ? 0.16 : typeCompatible(profile, field.valueType) ? 0.08 : -0.08;
      const valueScore = valuePatternScore(profile.concept, field);
      const confidence = clamp((aliasScore * 0.48) + (embeddingScore * 0.24) + typeScore + valueScore, 0, 0.99);

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
  "inventory_cost"
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
