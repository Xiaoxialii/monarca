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
