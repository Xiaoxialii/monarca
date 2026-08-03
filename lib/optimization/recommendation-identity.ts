export type RecommendationIdentityInput = {
  skuId: string;
  actionType: string;
  actionParameters?: Record<string, unknown>;
  policyVersion?: string | null;
  optimizerVersion?: string | null;
  simulationVersion?: string | null;
  evidence?: Record<string, unknown>;
  metricSnapshotVersion?: string | null;
};

export type RecommendationIdentityContext = {
  policyVersion?: string | null;
  optimizerVersion?: string | null;
  simulationVersion?: string | null;
  dataVersion?: string | null;
};

export function recommendationFingerprint(input: RecommendationIdentityInput) {
  const stableInput = {
    sku_id: input.skuId,
    action_type: input.actionType,
    action_parameters: normalizeIdentityValue(input.actionParameters ?? {}),
    policy_version: input.policyVersion ?? null,
    optimizer_version: input.optimizerVersion ?? null,
    simulation_version: input.simulationVersion ?? null,
    evidence: normalizeIdentityValue(input.evidence ?? {}),
    metric_snapshot_version: input.metricSnapshotVersion ?? null
  };

  return `rec_${hashStableString(stableStringify(stableInput))}`;
}

export function recommendationIdentityInputFromRecord(
  record: Record<string, unknown>,
  context?: RecommendationIdentityContext
): RecommendationIdentityInput {
  const skuId = stringValue(record.skuId ?? record.sku_id ?? record.sku);
  const simulation = recordValue(record.simulation);
  const beforeState = recordValue(record.before_state);
  const afterState = recordValue(record.after_state);
  const decisionContract = recordValue(record.decision_contract);
  const contractEvidence = recordValue(decisionContract.evidence);
  const policyTrace = recordValue(record.policy_trace);
  const policyMetrics = recordValue(policyTrace.metrics);
  const selectedScenario = recordValue(record.selected_scenario);

  return {
    skuId,
    actionType: canonicalRecommendationActionType(record),
    actionParameters: {
      ad_budget_change: numericDelta(simulation.recommended_ads_spend, simulation.current_ads_spend)
        ?? numberOrNull(record.ad_budget_change)
        ?? numberOrNull(record.ad_spend_change)
        ?? null,
      budget_change_percent: numberOrNull(record.budget_change_percent),
      inventory_change: positiveNumberOrNull(simulation.inventory_impact ?? contractEvidence.recommendedInventoryChange ?? contractEvidence.inventoryDelta),
      required_inventory: numberOrNull(simulation.required_inventory ?? contractEvidence.requiredInventory),
      current_inventory: numberOrNull(simulation.current_inventory ?? beforeState.inventory ?? contractEvidence.currentInventory),
      current_price: numberOrNull(beforeState.price),
      new_price: numberOrNull(afterState.price ?? selectedScenario.price)
    },
    policyVersion: context?.policyVersion,
    optimizerVersion: context?.optimizerVersion,
    simulationVersion: context?.simulationVersion,
    metricSnapshotVersion: context?.dataVersion,
    evidence: {
      roas: numberOrNull(contractEvidence.roas ?? policyMetrics.roas ?? record.roas),
      margin: numberOrNull(contractEvidence.margin ?? policyMetrics.margin ?? record.margin),
      inventory_gap: numberOrNull(contractEvidence.inventoryGap ?? contractEvidence.inventory_gap),
      inventory_coverage_days: numberOrNull(contractEvidence.inventoryCoverageDays ?? policyMetrics.inventoryCoverageDays),
      conversion_rate: numberOrNull(contractEvidence.conversionRate ?? policyMetrics.conversionRate)
    }
  };
}

export function recommendationIdFromRecord(record: Record<string, unknown>, context?: RecommendationIdentityContext) {
  const existingId = stringValue(record.recommendation_id);
  if (existingId) return existingId;
  return recommendationFingerprint(recommendationIdentityInputFromRecord(record, context));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableStringify);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const nested = (value as Record<string, unknown>)[key];
      if (nested !== undefined) result[key] = sortForStableStringify(nested);
      return result;
    }, {});
}

function normalizeIdentityValue(value: unknown): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 10000) / 10000;
  }
  if (Array.isArray(value)) return value.map(normalizeIdentityValue);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const normalized = normalizeIdentityValue((value as Record<string, unknown>)[key]);
      if (normalized !== undefined) result[key] = normalized;
      return result;
    }, {});
}

function canonicalRecommendationActionType(record: Record<string, unknown>) {
  const raw = stringValue(
    record.canonical_action ??
      record.unified_action ??
      record.action_type ??
      record.action ??
      record.sourceAction ??
      record.source_action ??
      record.recommended_action
  ).toUpperCase();

  if (raw === "SCALE" || raw === "SCALE_ADS" || raw === "INCREASE_AD_SPEND" || raw === "INCREASE_BUDGET") {
    return "SCALE_ADS";
  }
  if (raw === "RESTOCK_AND_SCALE") return "SCALE_ADS";
  if (raw === "REDUCE" || raw === "REDUCE_ADS") return "REDUCE_ADS";
  if (raw === "OPTIMIZE" || raw === "ADJUST_PRICE" || raw.startsWith("PRICE_")) return "ADJUST_PRICE";
  if (raw === "RESTOCK" || raw === "RESTOCK_INVENTORY") return "RESTOCK_INVENTORY";
  if (raw === "CLEARANCE" || raw === "REDUCE_INVENTORY") return "REDUCE_INVENTORY";
  if (raw === "MONITOR" || raw === "HOLD") return "HOLD";
  return raw || "HOLD";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveNumberOrNull(value: unknown) {
  const parsed = numberOrNull(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function numericDelta(after: unknown, before: unknown) {
  const next = numberOrNull(after);
  const current = numberOrNull(before);
  if (next == null && current == null) return null;
  return (next ?? 0) - (current ?? 0);
}

function hashStableString(value: string) {
  let hash1 = 0xdeadbeef;
  let hash2 = 0x41c6ce57;

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hash1 = Math.imul(hash1 ^ char, 2654435761);
    hash2 = Math.imul(hash2 ^ char, 1597334677);
  }

  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507) ^ Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507) ^ Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & hash2) + (hash1 >>> 0)).toString(36);
}
