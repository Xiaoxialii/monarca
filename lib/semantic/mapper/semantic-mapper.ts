import { analyzeRawFields } from "@/lib/semantic/engine/field-analyzer";
import { SemanticIntelligenceEngine } from "@/lib/semantic/engine/semantic-intelligence-engine";
import { buildCanonicalSchema } from "@/lib/semantic/mapper/canonical-schema-engine";
import type { SemanticMemoryStore } from "@/lib/semantic/memory";
import type { RawFieldObservation, SemanticCandidate, SemanticMapperResult, SemanticMappingDecision } from "@/lib/semantic/types";

export type SemanticMapperOptions = {
  platform?: string;
  memoryConfidenceThreshold?: number;
  persistInferredMappings?: boolean;
};

export class RuntimeSemanticMapper {
  constructor(
    private readonly input: {
      engine: SemanticIntelligenceEngine;
      memory: SemanticMemoryStore;
    }
  ) {}

  async map(rawData: unknown, options: SemanticMapperOptions = {}): Promise<SemanticMapperResult> {
    const analyzer = analyzeRawFields(rawData);
    const engineResult = this.input.engine.analyzeFields(analyzer.fields);
    const candidatesByField = groupCandidates(engineResult.candidates);
    const decisions: SemanticMappingDecision[] = [];
    const pendingWrites: Array<{ field: RawFieldObservation; decision: SemanticMappingDecision }> = [];
    let memoryHits = 0;
    let recordsUpdated = 0;

    for (const field of analyzer.fields) {
      const engineCandidates = candidatesByField.get(field.field) ?? [];
      const memoryCandidates = await this.memoryCandidates(field, options.platform);
      const memoryCandidate = memoryCandidates[0];
      const threshold = options.memoryConfidenceThreshold ?? 0.72;
      const selected = memoryCandidate && memoryCandidate.confidence >= threshold
        ? memoryCandidate
        : engineCandidates.find((candidate) => candidate.maps_to !== "unknown");

      if (memoryCandidate && memoryCandidate.confidence >= threshold) memoryHits += 1;

      const decision: SemanticMappingDecision = selected
        ? {
            field: field.path || field.field,
            canonical: selected.maps_to,
            confidence: selected.confidence,
            source: selected.source === "memory" ? "memory" : "engine",
            candidates: [...memoryCandidates, ...engineCandidates]
          }
        : {
            field: field.path || field.field,
            canonical: "unknown",
            confidence: 0,
            source: "unmapped",
            candidates: engineCandidates
          };

      decisions.push(decision);

      if (decision.canonical !== "unknown" && options.persistInferredMappings !== false) {
        pendingWrites.push({ field, decision });
      }
    }

    for (const write of pendingWrites) {
      const memoryPlatform = write.decision.source === "memory"
        ? write.decision.candidates.find((candidate) => candidate.source === "memory" && candidate.maps_to === write.decision.canonical)?.reason.includes("platform=*")
          ? "*"
          : options.platform
        : options.platform;

      await this.input.memory.upsertMapping({
        field_name: write.field.field,
        platform: memoryPlatform,
        mapped_to: write.decision.canonical,
        confidence: write.decision.confidence,
        embedding: this.input.engine.embedField(write.field.field, write.field.samples, write.field.context),
        metadata: {
          path: write.field.path,
          source: write.decision.source,
          analyzer_structure: analyzer.structure,
          key_patterns: analyzer.key_patterns
        }
      });
      recordsUpdated += 1;
    }

    const canonicalSchema = buildCanonicalSchema({ rawData, mappings: decisions, platform: options.platform });

    return {
      canonical_schema: canonicalSchema,
      mappings: decisions,
      memory_hits: memoryHits,
      engine_candidates: engineResult.candidates.filter((candidate) => candidate.maps_to !== "unknown").length,
      confidence: average(decisions.map((decision) => decision.confidence)),
      learning: {
        records_updated: recordsUpdated,
        unknown_fields: decisions.filter((decision) => decision.canonical === "unknown").map((decision) => decision.field),
        anomaly_fields: analyzer.confidence < 0.2 ? analyzer.fields.map((field) => field.path) : []
      }
    };
  }

  private async memoryCandidates(field: RawFieldObservation, platform?: string): Promise<SemanticCandidate[]> {
    const records = await this.input.memory.findCandidates({
      field_name: field.field,
      platform,
      embedding: this.input.engine.embedField(field.field, field.samples, field.context),
      limit: 2
    });

    return records.map((record) => ({
      field: field.field,
      maps_to: record.mapped_to,
      confidence: record.confidence,
      source: "memory",
      reason: `memory usage=${record.usage_count} feedback=${record.user_feedback_score}`
        + ` platform=${record.platform}`
    }));
  }
}

function groupCandidates(candidates: SemanticCandidate[]) {
  const map = new Map<string, SemanticCandidate[]>();

  for (const candidate of candidates) {
    const list = map.get(candidate.field) ?? [];
    list.push(candidate);
    map.set(candidate.field, list.sort((a, b) => b.confidence - a.confidence));
  }

  return map;
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 0;
}
