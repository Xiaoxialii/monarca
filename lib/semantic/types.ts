export type CanonicalConcept =
  | "revenue"
  | "gross_sales"
  | "net_sales"
  | "discount_amount"
  | "tax_amount"
  | "shipping_revenue"
  | "order_id"
  | "order_date"
  | "sku"
  | "product_name"
  | "product_id"
  | "customer_id"
  | "email_hash"
  | "country"
  | "region"
  | "channel"
  | "order_channel"
  | "fulfillment_channel"
  | "utm_campaign"
  | "ad_spend"
  | "campaign_id"
  | "adset_id"
  | "ad_id"
  | "impressions"
  | "clicks"
  | "conversions"
  | "attribution_revenue"
  | "event_date"
  | "conversion_event"
  | "refund_amount"
  | "refund_id"
  | "refund_reason"
  | "quantity"
  | "price"
  | "unit_price"
  | "cogs"
  | "product_cost"
  | "platform_fee"
  | "payment_fee"
  | "shipping_cost"
  | "fulfillment_cost"
  | "warehouse_cost"
  | "gross_profit"
  | "net_profit"
  | "contribution_margin"
  | "profit_margin"
  | "stock_level"
  | "available_stock"
  | "inventory_quantity"
  | "inventory_cost"
  | "reorder_point"
  | "warehouse_id"
  | "cost_type"
  | "status"
  | "currency"
  | "unknown";

export type SemanticValueType = "string" | "number" | "boolean" | "datetime" | "object" | "array" | "null" | "unknown";

export type RawFieldObservation = {
  field: string;
  path: string;
  valueType: SemanticValueType;
  samples: unknown[];
  context: string[];
};

export type SemanticCandidate = {
  field: string;
  maps_to: CanonicalConcept;
  confidence: number;
  source: "engine" | "memory" | "feedback" | "registry";
  reason: string;
};

export type SemanticMemoryRecord = {
  field_name: string;
  normalized_field_name: string;
  platform: string;
  mapped_to: CanonicalConcept;
  mapped_concept: CanonicalConcept;
  embedding: number[];
  confidence: number;
  confidence_score: number;
  user_feedback_score: number;
  observations: number;
  usage_count: number;
  embedding_similarity_weight: number;
  created_at: string;
  last_updated: string;
  last_seen_at: string;
  metadata?: Record<string, unknown>;
};

export type SemanticFeedbackEvent = {
  field_name: string;
  platform?: string;
  previous_mapping?: CanonicalConcept;
  corrected_mapping: CanonicalConcept;
  feedback: "confirm" | "edit" | "reject" | "system_error";
  confidence_delta?: number;
  metadata?: Record<string, unknown>;
};

export type SemanticMappingDecision = {
  field: string;
  source_field?: string;
  canonical: CanonicalConcept;
  canonical_field?: CanonicalConcept;
  confidence: number;
  source: "memory" | "engine" | "registry" | "unmapped";
  mapping_method?: "exact_match" | "exact_alias" | "alias_match" | "semantic_match" | "ai_suggested";
  requires_confirmation?: boolean;
  candidates: SemanticCandidate[];
  suggested_mappings?: Array<{ canonical_field: CanonicalConcept; confidence: number; reason: string }>;
  validation?: MappingValidationResult;
};

export type MappingValidationResult = {
  sourceField: string;
  predictedConcept: CanonicalConcept;
  accepted: boolean;
  rejectionReason?: string;
};

export type CanonicalDataset = {
  schema_version: "ecommerce_canonical_v1";
  tables: {
    ecommerce_orders: Array<Record<string, unknown>>;
    ecommerce_order_items: Array<Record<string, unknown>>;
    ecommerce_products: Array<Record<string, unknown>>;
    ecommerce_customers: Array<Record<string, unknown>>;
    ecommerce_refunds: Array<Record<string, unknown>>;
    ecommerce_ads?: Array<Record<string, unknown>>;
    ecommerce_inventory?: Array<Record<string, unknown>>;
    ecommerce_costs?: Array<Record<string, unknown>>;
    inventory?: Array<Record<string, unknown>>;
  };
  metadata: {
    source_platforms: string[];
    normalized_at: string;
    unknown_fields: Array<{ path: string; value: unknown; platform?: string }>;
    validation: {
      accepted_rows: number;
      rejected_rows: number;
      warnings: Array<{ table: string; field?: string; reason: string }>;
      rejected: Array<{ table: string; reason: string; row: Record<string, unknown> }>;
    };
    generation_audit?: Array<{
      source?: string;
      table: string;
      inputColumns: string[];
      mappedColumns: string[];
      rejectedColumns: Array<{ field: string; reason: string }>;
      rowCount: number;
    }>;
    field_mappings?: Array<{
      canonical_field: CanonicalConcept;
      source_column: string;
      source_system?: string;
      source_file_type?: string;
      target_entity?: string;
      mapping_confidence: number;
      mapping_method?: string;
      requires_confirmation?: boolean;
    }>;
    dedupe: {
      canonical_key_strategy: "hash(platform + source_id + order_id)";
      duplicate_count: number;
    };
    mapping_confidence: number;
  };
};

export type SemanticMapperResult = {
  canonical_schema: CanonicalDataset;
  mappings: SemanticMappingDecision[];
  memory_hits: number;
  engine_candidates: number;
  confidence: number;
  learning: {
    records_updated: number;
    unknown_fields: string[];
    anomaly_fields: string[];
    mapping_validation?: MappingValidationResult[];
  };
};
