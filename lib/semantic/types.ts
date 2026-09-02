export type CanonicalConcept =
  | "revenue"
  | "gross_sales"
  | "net_sales"
  | "discount_amount"
  | "tax_amount"
  | "shipping_revenue"
  | "total_paid"
  | "paid_amount"
  | "source_order_id"
  | "order_id"
  | "order_name"
  | "source_line_item_id"
  | "order_item_id"
  | "order_date"
  | "order_status"
  | "financial_status"
  | "payment_status"
  | "fulfillment_status"
  | "is_cancelled"
  | "is_test"
  | "is_paid"
  | "created_at_source"
  | "updated_at_source"
  | "processed_at_source"
  | "cancelled_at_source"
  | "sku"
  | "asin"
  | "variant_id"
  | "product_name"
  | "title"
  | "product_id"
  | "product_type"
  | "handle"
  | "product_handle"
  | "description"
  | "description_html"
  | "tags"
  | "category"
  | "category_id"
  | "category_name"
  | "category_full_name"
  | "collections"
  | "collection_handles"
  | "options"
  | "featured_media"
  | "featured_image_url"
  | "media"
  | "images"
  | "online_store_url"
  | "seo_title"
  | "seo_description"
  | "compare_at_price"
  | "barcode"
  | "inventory_item_id"
  | "inventory_item_sku"
  | "inventory_item_tracked"
  | "inventory_requires_shipping"
  | "inventory_unit_cost"
  | "inventory_unit_cost_currency"
  | "weight"
  | "weight_unit"
  | "selected_options"
  | "variant_media"
  | "metafields"
  | "metafield_keys"
  | "vendor"
  | "brand"
  | "customer_id"
  | "source_customer_id"
  | "email_hash"
  | "country"
  | "province"
  | "city"
  | "customer_created_at"
  | "first_order_date"
  | "last_order_date"
  | "total_orders"
  | "orders_count"
  | "total_spent"
  | "lifetime_value"
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
  | "refunded_quantity"
  | "source_refund_id"
  | "refund_id"
  | "refund_reason"
  | "refund_date"
  | "quantity"
  | "price"
  | "unit_price"
  | "cogs"
  | "line_cogs"
  | "total_cogs"
  | "row_cogs"
  | "item_cost"
  | "unit_cost"
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
  | "inventory_value"
  | "reorder_point"
  | "warehouse_id"
  | "snapshot_date"
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
