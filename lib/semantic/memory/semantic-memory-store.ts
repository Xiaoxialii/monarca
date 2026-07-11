import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { embedText, normalizeFieldName } from "@/lib/semantic/engine";
import type { CanonicalConcept, SemanticFeedbackEvent, SemanticMemoryRecord } from "@/lib/semantic/types";

export type SemanticMemoryQuery = {
  field_name: string;
  platform?: string;
  embedding?: number[];
  limit?: number;
};

export interface SemanticMemoryStore {
  findCandidates(query: SemanticMemoryQuery): Promise<SemanticMemoryRecord[]>;
  upsertMapping(input: {
    field_name: string;
    platform?: string;
    mapped_to: CanonicalConcept;
    confidence: number;
    embedding?: number[];
    metadata?: Record<string, unknown>;
  }): Promise<SemanticMemoryRecord>;
  applyFeedback(event: SemanticFeedbackEvent): Promise<SemanticMemoryRecord>;
  all(): Promise<SemanticMemoryRecord[]>;
}

export class InMemorySemanticMemoryStore implements SemanticMemoryStore {
  protected records = new Map<string, SemanticMemoryRecord>();

  constructor(seed: SemanticMemoryRecord[] = []) {
    for (const record of seed) {
      const normalizedRecord = normalizeMemoryRecord(record);
      this.records.set(memoryKey(normalizedRecord.platform, normalizedRecord.normalized_field_name, normalizedRecord.mapped_to), normalizedRecord);
    }
  }

  async findCandidates(query: SemanticMemoryQuery) {
    const normalized = normalizeFieldName(query.field_name);
    const queryEmbedding = query.embedding ?? embedText(query.field_name);
    const records = Array.from(this.records.values())
      .map((record) => {
        const exactField = record.normalized_field_name === normalized ? 0.34 : 0;
        const fieldSimilarity = fieldNameSimilarity(normalized, record.normalized_field_name);
        const samePlatform = query.platform && record.platform === query.platform ? 0.16 : 0;
        const crossPlatform = record.platform === "*" || !query.platform ? 0.08 : 0;
        const semanticSimilarity = cosineSimilarity(queryEmbedding, record.embedding) * 0.32;
        const score = clamp(record.confidence + exactField + samePlatform + crossPlatform + semanticSimilarity, 0, 0.99);

        return { record, score, exactField, fieldSimilarity };
      })
      .filter(({ score, exactField, fieldSimilarity }) => score >= 0.5 && (exactField > 0 || fieldSimilarity >= 0.45))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 3)
      .map(({ record, score }) => ({ ...record, confidence: Number(score.toFixed(4)) }));

    return records;
  }

  async upsertMapping(input: {
    field_name: string;
    platform?: string;
    mapped_to: CanonicalConcept;
    confidence: number;
    embedding?: number[];
    metadata?: Record<string, unknown>;
  }) {
    const normalized = normalizeFieldName(input.field_name);
    const platform = input.platform ?? "*";
    const key = memoryKey(platform, normalized, input.mapped_to);
    const now = new Date().toISOString();
    const existing = this.records.get(key);
    const confidence = clamp(input.confidence, 0, 0.99);
    const record: SemanticMemoryRecord = existing
      ? {
          ...existing,
          confidence: Number(confidenceFromUsage(existing.confidence, confidence, existing.observations + 1, existing.user_feedback_score).toFixed(4)),
          confidence_score: Number(confidenceFromUsage(existing.confidence, confidence, existing.observations + 1, existing.user_feedback_score).toFixed(4)),
          observations: existing.observations + 1,
          usage_count: existing.usage_count + 1,
          embedding_similarity_weight: Number(clamp(existing.embedding_similarity_weight + 0.01, 0.2, 0.7).toFixed(4)),
          last_updated: now,
          last_seen_at: now,
          metadata: { ...existing.metadata, ...input.metadata }
        }
      : {
          field_name: input.field_name,
          normalized_field_name: normalized,
          platform,
          mapped_to: input.mapped_to,
          mapped_concept: input.mapped_to,
          embedding: input.embedding ?? embedText(input.field_name),
          confidence,
          confidence_score: confidence,
          user_feedback_score: 0,
          observations: 1,
          usage_count: 1,
          embedding_similarity_weight: 0.32,
          created_at: now,
          last_updated: now,
          last_seen_at: now,
          metadata: input.metadata
        };

    this.records.set(key, record);
    await this.afterWrite();

    return record;
  }

  async applyFeedback(event: SemanticFeedbackEvent) {
    const baseDelta = event.confidence_delta ?? feedbackDelta(event.feedback);
    const feedbackScore = feedbackScoreDelta(event.feedback);
    const record = await this.upsertMapping({
      field_name: event.field_name,
      platform: event.platform,
      mapped_to: event.corrected_mapping,
      confidence: clamp(0.72 + baseDelta, 0, 0.99),
      metadata: {
        ...event.metadata,
        feedback: event.feedback,
        previous_mapping: event.previous_mapping ?? null
      }
    });
    const updated = {
      ...record,
      user_feedback_score: Number(clamp(record.user_feedback_score + feedbackScore, -1, 1).toFixed(4)),
      confidence: Number(clamp(record.confidence + baseDelta + Math.max(0, feedbackScore * 0.1), 0, 0.99).toFixed(4)),
      confidence_score: Number(clamp(record.confidence + baseDelta + Math.max(0, feedbackScore * 0.1), 0, 0.99).toFixed(4)),
      embedding_similarity_weight: Number(clamp(record.embedding_similarity_weight + (feedbackScore > 0 ? 0.03 : -0.03), 0.2, 0.7).toFixed(4)),
      last_updated: new Date().toISOString()
    };

    this.records.set(memoryKey(updated.platform, updated.normalized_field_name, updated.mapped_to), updated);
    await this.afterWrite();

    return updated;
  }

  async all() {
    return Array.from(this.records.values()).sort((a, b) => b.last_updated.localeCompare(a.last_updated));
  }

  protected async afterWrite() {
    // Extension hook for persistent stores.
  }
}

export class JsonSemanticMemoryStore extends InMemorySemanticMemoryStore {
  private initialized = false;

  constructor(private readonly filePath: string) {
    super();
  }

  override async findCandidates(query: SemanticMemoryQuery) {
    await this.load();

    return super.findCandidates(query);
  }

  override async upsertMapping(input: Parameters<InMemorySemanticMemoryStore["upsertMapping"]>[0]) {
    await this.load();

    return super.upsertMapping(input);
  }

  override async applyFeedback(event: SemanticFeedbackEvent) {
    await this.load();

    return super.applyFeedback(event);
  }

  override async all() {
    await this.load();

    return super.all();
  }

  protected override async afterWrite() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(await super.all(), null, 2));
  }

  private async load() {
    if (this.initialized) return;
    this.initialized = true;

    const raw = await fs.readFile(this.filePath, "utf8").catch(() => "[]");
    const records = JSON.parse(raw) as SemanticMemoryRecord[];

    for (const record of records) {
      const normalizedRecord = normalizeMemoryRecord(record);
      this.records.set(memoryKey(normalizedRecord.platform, normalizedRecord.normalized_field_name, normalizedRecord.mapped_to), normalizedRecord);
    }
  }
}

export type SemanticMappingMemory = SemanticMemoryRecord;

export class PrismaSemanticMemoryStore implements SemanticMemoryStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly input: { workspaceId: string }
  ) {}

  async findCandidates(query: SemanticMemoryQuery) {
    const normalized = normalizeFieldName(query.field_name);
    const queryEmbedding = query.embedding ?? embedText(query.field_name);
    const records = await this.prisma.semanticMappingMemory.findMany({
      where: {
        workspaceId: this.input.workspaceId,
        OR: [
          { normalizedFieldName: normalized },
          { platform: query.platform ?? "*" },
          { platform: "*" }
        ]
      },
      orderBy: [
        { confidenceScore: "desc" },
        { usageCount: "desc" },
        { lastSeenAt: "desc" }
      ],
      take: Math.max(query.limit ?? 3, 10)
    });

    return records
      .map((record) => {
        const memory = prismaRecordToMemory(record);
        const exactField = memory.normalized_field_name === normalized ? 0.34 : 0;
        const fieldSimilarity = fieldNameSimilarity(normalized, memory.normalized_field_name);
        const samePlatform = query.platform && memory.platform === query.platform ? 0.16 : 0;
        const crossPlatform = memory.platform === "*" ? 0.08 : 0;
        const similarity = cosineSimilarity(queryEmbedding, memory.embedding) * memory.embedding_similarity_weight;
        const confidence = clamp(memory.confidence + exactField + samePlatform + crossPlatform + similarity, 0, 0.99);

        return {
          ...memory,
          confidence: Number(confidence.toFixed(4)),
          confidence_score: Number(confidence.toFixed(4)),
          metadata: {
            ...memory.metadata,
            fieldSimilarity
          }
        };
      })
      .filter((record) => record.confidence >= 0.5 && (record.normalized_field_name === normalized || Number(record.metadata?.fieldSimilarity ?? 0) >= 0.45))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, query.limit ?? 3);
  }

  async upsertMapping(input: {
    field_name: string;
    platform?: string;
    mapped_to: CanonicalConcept;
    confidence: number;
    embedding?: number[];
    metadata?: Record<string, unknown>;
  }) {
    const normalized = normalizeFieldName(input.field_name);
    const platform = input.platform ?? "*";
    const existing = await this.prisma.semanticMappingMemory.findUnique({
      where: {
        workspaceId_platform_normalizedFieldName_mappedConcept: {
          workspaceId: this.input.workspaceId,
          platform,
          normalizedFieldName: normalized,
          mappedConcept: input.mapped_to
        }
      }
    });
    const confidence = existing
      ? confidenceFromUsage(existing.confidenceScore, input.confidence, existing.usageCount + 1, existing.userFeedbackScore)
      : clamp(input.confidence, 0, 0.99);
    const now = new Date();
    const record = await this.prisma.semanticMappingMemory.upsert({
      where: {
        workspaceId_platform_normalizedFieldName_mappedConcept: {
          workspaceId: this.input.workspaceId,
          platform,
          normalizedFieldName: normalized,
          mappedConcept: input.mapped_to
        }
      },
      create: {
        workspaceId: this.input.workspaceId,
        fieldName: input.field_name,
        normalizedFieldName: normalized,
        platform,
        mappedConcept: input.mapped_to,
        embeddingVector: (input.embedding ?? embedText(input.field_name)) as unknown as object,
        confidenceScore: confidence,
        usageCount: 1,
        userFeedbackScore: 0,
        embeddingSimilarityWeight: 0.32,
        metadataJson: input.metadata as object | undefined,
        lastSeenAt: now
      },
      update: {
        fieldName: input.field_name,
        embeddingVector: (input.embedding ?? embedText(input.field_name)) as unknown as object,
        confidenceScore: confidence,
        usageCount: { increment: 1 },
        embeddingSimilarityWeight: Math.min(0.7, (existing?.embeddingSimilarityWeight ?? 0.32) + 0.01),
        metadataJson: { ...(existing?.metadataJson && typeof existing.metadataJson === "object" ? existing.metadataJson : {}), ...input.metadata } as object,
        lastSeenAt: now
      }
    });

    return prismaRecordToMemory(record);
  }

  async applyFeedback(event: SemanticFeedbackEvent) {
    const baseDelta = event.confidence_delta ?? feedbackDelta(event.feedback);
    const feedbackScore = feedbackScoreDelta(event.feedback);
    const record = await this.upsertMapping({
      field_name: event.field_name,
      platform: event.platform,
      mapped_to: event.corrected_mapping,
      confidence: clamp(0.72 + baseDelta, 0, 0.99),
      metadata: {
        ...event.metadata,
        feedback: event.feedback,
        previous_mapping: event.previous_mapping ?? null
      }
    });
    const updated = await this.prisma.semanticMappingMemory.update({
      where: {
        workspaceId_platform_normalizedFieldName_mappedConcept: {
          workspaceId: this.input.workspaceId,
          platform: record.platform,
          normalizedFieldName: record.normalized_field_name,
          mappedConcept: record.mapped_to
        }
      },
      data: {
        userFeedbackScore: clamp(record.user_feedback_score + feedbackScore, -1, 1),
        confidenceScore: clamp(record.confidence_score + baseDelta + Math.max(0, feedbackScore * 0.1), 0, 0.99),
        embeddingSimilarityWeight: clamp(record.embedding_similarity_weight + (feedbackScore > 0 ? 0.03 : -0.03), 0.2, 0.7),
        lastSeenAt: new Date()
      }
    });

    return prismaRecordToMemory(updated);
  }

  async all() {
    const records = await this.prisma.semanticMappingMemory.findMany({
      where: { workspaceId: this.input.workspaceId },
      orderBy: { lastSeenAt: "desc" }
    });

    return records.map(prismaRecordToMemory);
  }
}

function memoryKey(platform: string, normalizedField: string, mappedTo: CanonicalConcept) {
  return `${platform}:${normalizedField}:${mappedTo}`;
}

function feedbackDelta(feedback: SemanticFeedbackEvent["feedback"]) {
  if (feedback === "confirm") return 0.12;
  if (feedback === "edit") return 0.18;
  if (feedback === "reject" || feedback === "system_error") return -0.2;

  return 0;
}

function feedbackScoreDelta(feedback: SemanticFeedbackEvent["feedback"]) {
  if (feedback === "confirm") return 0.15;
  if (feedback === "edit") return 0.22;
  if (feedback === "reject" || feedback === "system_error") return -0.18;

  return 0;
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

function fieldNameSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftParts = new Set(left.split("_").filter(Boolean));
  const rightParts = new Set(right.split("_").filter(Boolean));
  const intersection = [...leftParts].filter((part) => rightParts.has(part)).length;
  const union = new Set([...leftParts, ...rightParts]).size || 1;
  const overlap = intersection / union;
  const contains = left.includes(right) || right.includes(left) ? 0.5 : 0;

  return Math.max(overlap, contains);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function confidenceFromUsage(oldConfidence: number, newConfidence: number, usageCount: number, feedbackScore: number) {
  const weightedAverage = ((oldConfidence * Math.max(1, usageCount - 1)) + newConfidence) / Math.max(1, usageCount);
  const frequencyBoost = Math.min(0.12, Math.log10(usageCount + 1) * 0.05);
  const feedbackBoost = feedbackScore * 0.08;

  return clamp(weightedAverage + frequencyBoost + feedbackBoost, 0, 0.99);
}

function normalizeMemoryRecord(record: SemanticMemoryRecord): SemanticMemoryRecord {
  return {
    ...record,
    mapped_concept: record.mapped_concept ?? record.mapped_to,
    confidence_score: record.confidence_score ?? record.confidence,
    usage_count: record.usage_count ?? record.observations ?? 1,
    embedding_similarity_weight: record.embedding_similarity_weight ?? 0.32,
    last_seen_at: record.last_seen_at ?? record.last_updated
  };
}

function prismaRecordToMemory(record: {
  fieldName: string;
  normalizedFieldName: string;
  platform: string;
  mappedConcept: string;
  embeddingVector: unknown;
  confidenceScore: number;
  userFeedbackScore: number;
  usageCount: number;
  embeddingSimilarityWeight: number;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  metadataJson?: unknown;
}): SemanticMemoryRecord {
  const mapped = record.mappedConcept as CanonicalConcept;

  return {
    field_name: record.fieldName,
    normalized_field_name: record.normalizedFieldName,
    platform: record.platform,
    mapped_to: mapped,
    mapped_concept: mapped,
    embedding: Array.isArray(record.embeddingVector) ? record.embeddingVector.filter((value): value is number => typeof value === "number") : [],
    confidence: record.confidenceScore,
    confidence_score: record.confidenceScore,
    user_feedback_score: record.userFeedbackScore,
    observations: record.usageCount,
    usage_count: record.usageCount,
    embedding_similarity_weight: record.embeddingSimilarityWeight,
    created_at: record.createdAt.toISOString(),
    last_updated: record.updatedAt.toISOString(),
    last_seen_at: record.lastSeenAt.toISOString(),
    metadata: record.metadataJson && typeof record.metadataJson === "object" ? record.metadataJson as Record<string, unknown> : undefined
  };
}
