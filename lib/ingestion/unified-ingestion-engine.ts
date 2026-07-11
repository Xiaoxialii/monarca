import { analyzeRawFields, type FieldAnalyzerResult } from "@/lib/semantic/engine/field-analyzer";
import { buildEcommerceStarSchemaModel, type EcommerceStarSchemaModel } from "@/lib/data-model/ecommerce-star-schema";
import { computeCanonicalEcommerceMetrics, type CanonicalEcommerceMetricOutput } from "@/lib/metrics/canonical-ecommerce-metric-engine";
import { InMemorySemanticMemoryStore, type SemanticMemoryStore } from "@/lib/semantic/memory";
import { SelfLearningSemanticRuntime } from "@/lib/semantic/runtime";
import type { CanonicalDataset, SemanticFeedbackEvent, SemanticMapperResult } from "@/lib/semantic/types";

export type UnifiedIngestionSource =
  | "excel"
  | "csv"
  | "shopify"
  | "amazon"
  | "tiktok"
  | "meta_ads"
  | "stripe"
  | "custom_api"
  | string;

export type UnifiedIngestionInput = {
  source: UnifiedIngestionSource;
  payload: unknown;
  workspace_id: string;
  metadata?: Record<string, unknown>;
  memory?: SemanticMemoryStore;
  feedbackEvents?: SemanticFeedbackEvent[];
};

export type UnifiedIngestionOutput = {
  source: UnifiedIngestionSource;
  workspace_id: string;
  detected_schema: {
    detected_type: "order" | "ads" | "product" | "payment" | "inventory" | "unknown";
    fields: Array<{ name: string; path: string; type: string }>;
    confidence: number;
    key_patterns: string[];
  };
  semantic: {
    mappings: Record<string, string>;
    mapping_details: Array<{
      field: string;
      canonical: string;
      confidence: number;
      source: string;
    }>;
    confidence: number;
    memory_hits: number;
    engine_candidates: number;
    unknown_fields: string[];
    anomaly_fields: string[];
  };
  canonical_data: CanonicalDataset;
  data_model: EcommerceStarSchemaModel;
  metrics: CanonicalEcommerceMetricOutput;
  learning: SemanticMapperResult["learning"] & {
    feedback_updates?: number;
    memory_size?: number;
    average_memory_confidence?: number;
    model_update?: {
      strategy: string;
      embedding_similarity_weight: number;
      runtime_updated: boolean;
    };
  };
  metadata: {
    source: UnifiedIngestionSource;
    workspace_id: string;
    ingested_at: string;
    input_metadata: Record<string, unknown>;
    pipeline: [
      "field_analyzer",
      "semantic_intelligence_engine",
      "semantic_memory",
      "canonical_schema_engine",
      "data_model_layer",
      "metric_engine"
    ];
    audit: {
      platform_agnostic: true;
      raw_bypasses_canonical: false;
      metrics_read_raw_payload: false;
    };
  };
};

export async function runUnifiedIngestionPipeline(input: UnifiedIngestionInput): Promise<UnifiedIngestionOutput> {
  const memory = input.memory ?? new InMemorySemanticMemoryStore();
  const analyzer = analyzeRawFields(input.payload);
  const runtime = new SelfLearningSemanticRuntime({ memory });
  const semanticResult = await runtime.run({
    rawData: input.payload,
    platform: input.source,
    feedbackEvents: input.feedbackEvents
  });
  const dataModel = buildEcommerceStarSchemaModel(semanticResult.canonical_schema);
  const metrics = computeCanonicalEcommerceMetrics(semanticResult.canonical_schema);

  return {
    source: input.source,
    workspace_id: input.workspace_id,
    detected_schema: detectedSchemaFromAnalyzer(analyzer),
    semantic: {
      mappings: Object.fromEntries(semanticResult.mappings.map((mapping) => [mapping.field, mapping.canonical])),
      mapping_details: semanticResult.mappings.map((mapping) => ({
        field: mapping.field,
        canonical: mapping.canonical,
        confidence: mapping.confidence,
        source: mapping.source
      })),
      confidence: semanticResult.confidence,
      memory_hits: semanticResult.memory_hits,
      engine_candidates: semanticResult.engine_candidates,
      unknown_fields: semanticResult.learning.unknown_fields,
      anomaly_fields: semanticResult.learning.anomaly_fields
    },
    canonical_data: semanticResult.canonical_schema,
    data_model: dataModel,
    metrics,
    learning: semanticResult.learning,
    metadata: {
      source: input.source,
      workspace_id: input.workspace_id,
      ingested_at: semanticResult.canonical_schema.metadata.normalized_at,
      input_metadata: input.metadata ?? {},
      pipeline: [
        "field_analyzer",
        "semantic_intelligence_engine",
        "semantic_memory",
        "canonical_schema_engine",
        "data_model_layer",
        "metric_engine"
      ],
      audit: {
        platform_agnostic: true,
        raw_bypasses_canonical: false,
        metrics_read_raw_payload: false
      }
    }
  };
}

function detectedSchemaFromAnalyzer(analyzer: FieldAnalyzerResult): UnifiedIngestionOutput["detected_schema"] {
  return {
    detected_type: detectedType(analyzer.structure, analyzer.key_patterns),
    fields: analyzer.fields.map((field) => ({
      name: field.field,
      path: field.path,
      type: field.valueType
    })),
    confidence: analyzer.confidence,
    key_patterns: analyzer.key_patterns
  };
}

function detectedType(structure: FieldAnalyzerResult["structure"], keyPatterns: string[]): UnifiedIngestionOutput["detected_schema"]["detected_type"] {
  if (structure === "order-like") return "order";
  if (structure === "product-like") return "product";
  if (structure === "ad-like") return "ads";
  if (structure === "payment-like") return "payment";
  if (keyPatterns.includes("ads")) return "ads";

  return "unknown";
}
