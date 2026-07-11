import { SemanticIntelligenceEngine } from "@/lib/semantic/engine";
import { InMemorySemanticMemoryStore, type SemanticMemoryStore } from "@/lib/semantic/memory";
import { RuntimeSemanticMapper } from "@/lib/semantic/mapper";
import type { SemanticFeedbackEvent, SemanticMapperResult } from "@/lib/semantic/types";

export type SelfLearningRuntimeInput = {
  rawData: unknown;
  platform?: string;
  memory?: SemanticMemoryStore;
};

export type LearningUpdateInput = {
  result: SemanticMapperResult;
  memory: SemanticMemoryStore;
  platform?: string;
  feedbackEvents?: SemanticFeedbackEvent[];
};

export class SelfLearningSemanticRuntime {
  readonly engine: SemanticIntelligenceEngine;
  readonly memory: SemanticMemoryStore;
  readonly mapper: RuntimeSemanticMapper;

  constructor(input: { memory?: SemanticMemoryStore; engine?: SemanticIntelligenceEngine } = {}) {
    this.engine = input.engine ?? new SemanticIntelligenceEngine();
    this.memory = input.memory ?? new InMemorySemanticMemoryStore();
    this.mapper = new RuntimeSemanticMapper({ engine: this.engine, memory: this.memory });
  }

  async run(input: { rawData: unknown; platform?: string; feedbackEvents?: SemanticFeedbackEvent[] }) {
    const result = await this.mapper.map(input.rawData, {
      platform: input.platform,
      persistInferredMappings: true
    });
    const learning = await runLearningUpdate({
      result,
      memory: this.memory,
      platform: input.platform,
      feedbackEvents: input.feedbackEvents
    });

    return {
      ...result,
      learning: {
        ...result.learning,
        ...learning
      }
    };
  }
}

export async function runSelfLearningPipeline(input: SelfLearningRuntimeInput) {
  const runtime = new SelfLearningSemanticRuntime({ memory: input.memory });

  return runtime.run({ rawData: input.rawData, platform: input.platform });
}

export async function runLearningUpdate(input: LearningUpdateInput) {
  let feedback_updates = 0;

  for (const event of input.feedbackEvents ?? []) {
    await input.memory.applyFeedback({ ...event, platform: event.platform ?? input.platform });
    feedback_updates += 1;
  }

  const learnedRecords = await input.memory.all();
  const activeRecords = learnedRecords.filter((record) => record.usage_count > 0);
  const averageConfidence = activeRecords.length
    ? activeRecords.reduce((sum, record) => sum + record.confidence_score, 0) / activeRecords.length
    : 0;

  return {
    feedback_updates,
    memory_size: learnedRecords.length,
    average_memory_confidence: Number(averageConfidence.toFixed(4)),
    model_update: {
      strategy: "zero-retraining-weight-adjustment",
      embedding_similarity_weight: averageEmbeddingWeight(activeRecords),
      runtime_updated: true
    }
  };
}

function averageEmbeddingWeight(records: Awaited<ReturnType<SemanticMemoryStore["all"]>>) {
  if (!records.length) return 0.32;

  return Number((records.reduce((sum, record) => sum + record.embedding_similarity_weight, 0) / records.length).toFixed(4));
}
