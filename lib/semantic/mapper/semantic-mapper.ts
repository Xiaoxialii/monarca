import { analyzeRawFields } from "@/lib/semantic/engine/field-analyzer";
import { SemanticIntelligenceEngine } from "@/lib/semantic/engine/semantic-intelligence-engine";
import { buildCanonicalSchema } from "@/lib/semantic/mapper/canonical-schema-engine";
import { firstValidCandidate, validateSemanticMapping } from "@/lib/semantic/mapper/mapping-validation";
import { ambiguousFieldSuggestions, mappingMethodFromCandidate, registryCandidatesForField } from "@/lib/semantic/field-mapping/canonical-field-registry";
import type { SemanticMemoryStore } from "@/lib/semantic/memory";
import type { MappingValidationResult, RawFieldObservation, SemanticCandidate, SemanticMapperResult, SemanticMappingDecision } from "@/lib/semantic/types";

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
    const siblingFieldContext = analyzer.fields.map((field) => field.field).join("_");
    const registryCandidates = analyzer.fields.flatMap((field) => registryCandidatesForField({
      ...field,
      context: [...field.context, siblingFieldContext]
    }));
    const candidatesByField = groupCandidates([...registryCandidates, ...engineResult.candidates]);
    const decisions: SemanticMappingDecision[] = [];
    const pendingWrites: Array<{ field: RawFieldObservation; decision: SemanticMappingDecision }> = [];
    const validationResults: MappingValidationResult[] = [];
    let memoryHits = 0;
    let recordsUpdated = 0;

    for (const field of analyzer.fields) {
      const engineCandidates = candidatesByField.get(field.field) ?? [];
      const memoryCandidates = await this.memoryCandidates(field, options.platform);
      const memoryCandidate = memoryCandidates[0];
      const registryCandidate = engineCandidates.find((candidate) => candidate.source === "registry" && candidate.confidence >= 0.9);
      const threshold = options.memoryConfidenceThreshold ?? 0.72;
      const preferred = registryCandidate
        ? registryCandidate
        : memoryCandidate && memoryCandidate.confidence >= threshold
          ? memoryCandidate
          : engineCandidates.find((candidate) => candidate.maps_to !== "unknown");
      const selectedValidation = preferred
        ? validateSemanticMapping(field.field, preferred.maps_to)
        : null;
      const fallback = selectedValidation && !selectedValidation.accepted
        ? firstValidCandidate(field.field, [...memoryCandidates, ...engineCandidates].filter((candidate) => candidate !== preferred))
        : null;
      const selected = selectedValidation?.accepted
        ? preferred
        : fallback?.candidate;
      const validation = selectedValidation?.accepted
        ? selectedValidation
        : fallback?.validation ?? selectedValidation ?? {
            sourceField: field.field,
            predictedConcept: "unknown" as const,
            accepted: true
          };

      if (memoryCandidate && memoryCandidate.confidence >= threshold) memoryHits += 1;
      validationResults.push(validation);

      const requiresConfirmation = !selected || selected.confidence < 0.72 || mappingMethodFromCandidate(selected) === "ai_suggested";
      const suggestedMappings = [...memoryCandidates, ...engineCandidates]
        .filter((candidate) => candidate.maps_to !== "unknown")
        .slice(0, 3)
        .map((candidate) => ({
          canonical_field: candidate.maps_to,
          confidence: candidate.confidence,
          reason: candidate.reason
        }));
      const finalSuggestedMappings = suggestedMappings.length ? suggestedMappings : ambiguousFieldSuggestions(field);
      const decision: SemanticMappingDecision = selected && !requiresConfirmation
        ? {
            field: field.path || field.field,
            source_field: field.field,
            canonical: selected.maps_to,
            canonical_field: selected.maps_to,
            confidence: selected.confidence,
            source: selected.source === "registry" ? "registry" : selected.source === "memory" ? "memory" : "engine",
            mapping_method: mappingMethodFromCandidate(selected),
            requires_confirmation: false,
            candidates: [...memoryCandidates, ...engineCandidates],
            suggested_mappings: finalSuggestedMappings,
            validation
          }
        : {
            field: field.path || field.field,
            source_field: field.field,
            canonical: "unknown",
            canonical_field: "unknown",
            confidence: 0,
            source: "unmapped",
            mapping_method: selected ? mappingMethodFromCandidate(selected) : undefined,
            requires_confirmation: Boolean(finalSuggestedMappings.length),
            candidates: [...memoryCandidates, ...engineCandidates],
            suggested_mappings: finalSuggestedMappings,
            validation
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
        anomaly_fields: analyzer.confidence < 0.2 ? analyzer.fields.map((field) => field.path) : [],
        mapping_validation: validationResults
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
