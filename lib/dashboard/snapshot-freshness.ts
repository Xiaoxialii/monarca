import type { PrismaClient } from "@prisma/client";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "../profit/canonical-profitability-engine";
import {
  DECISION_ALGORITHM_VERSION,
  OPTIMIZATION_VERSION,
  SIMULATION_VERSION,
  currentDecisionSnapshotVersions
} from "./decision-snapshot-lifecycle";

export type SnapshotLifecycleState = "READY" | "STALE" | "REBUILDING" | "FAILED";

export type SnapshotIdentity = {
  canonicalDataVersion?: string | null;
  canonicalSnapshotVersion?: string | null;
  canonicalFingerprint?: string | null;
  dataFingerprint?: string | null;
  metricEngineVersion?: string | null;
  profitabilityEngineVersion?: string | null;
  algorithmVersion?: string | null;
  optimizationEngineVersion?: string | null;
  optimizationVersion?: string | null;
  simulationVersion?: string | null;
  inputHash?: string | null;
  generatedAt?: string | Date | null;
};

export type SnapshotFreshnessResult = {
  isFresh: boolean;
  state: SnapshotLifecycleState;
  reasons: string[];
  identity: SnapshotIdentity;
  expected: SnapshotIdentity;
};

export const DASHBOARD_SNAPSHOT_FRESHNESS_VERSION = "dashboard-snapshot-freshness-v1";

export function asSnapshotRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringOrNull(value);
    if (text) return text;
  }
  return null;
}

function nestedVersionRecords(value: unknown) {
  const record = asSnapshotRecord(value);
  return [
    record,
    asSnapshotRecord(record.decisionSnapshotVersions),
    asSnapshotRecord(record.snapshotIdentity),
    asSnapshotRecord(record.calculationIdentity),
    asSnapshotRecord(record.versions),
    asSnapshotRecord(record.metadata),
    asSnapshotRecord(record.lineage)
  ];
}

export function snapshotIdentityFromPayload(value: unknown): SnapshotIdentity {
  const records = nestedVersionRecords(value);
  const pick = (...keys: string[]) => firstString(...records.flatMap((record) => keys.map((key) => record[key])));

  return {
    canonicalDataVersion: pick("canonicalDataVersion", "canonical_data_version"),
    canonicalSnapshotVersion: pick("canonicalSnapshotVersion", "canonical_snapshot_version"),
    canonicalFingerprint: pick("canonicalFingerprint", "canonical_fingerprint"),
    dataFingerprint: pick("dataFingerprint", "dataHash", "inputHash", "data_hash", "input_hash"),
    metricEngineVersion: pick("metricEngineVersion", "metric_engine_version"),
    profitabilityEngineVersion: pick("profitabilityEngineVersion", "profitability_engine_version"),
    algorithmVersion: pick("algorithmVersion", "algorithm_version"),
    optimizationEngineVersion: pick("optimizationEngineVersion", "optimization_engine_version"),
    optimizationVersion: pick("optimizationVersion", "optimization_version"),
    simulationVersion: pick("simulationVersion", "simulation_version"),
    inputHash: pick("inputHash", "input_hash"),
    generatedAt: pick("generatedAt", "generated_at")
  };
}

export function snapshotIdentityFromCacheRecord(record: {
  algorithmVersion?: string | null;
  optimizationVersion?: string | null;
  profitabilityEngineVersion?: string | null;
  canonicalSnapshotVersion?: string | null;
  metricSnapshotVersion?: string | null;
  simulationVersion?: string | null;
  inputHash?: string | null;
  generatedAt?: Date | string | null;
} | null | undefined): SnapshotIdentity {
  if (!record) return {};
  return {
    algorithmVersion: record.algorithmVersion ?? null,
    optimizationVersion: record.optimizationVersion ?? null,
    optimizationEngineVersion: record.optimizationVersion ?? null,
    profitabilityEngineVersion: record.profitabilityEngineVersion ?? null,
    canonicalDataVersion: record.canonicalSnapshotVersion ?? null,
    canonicalSnapshotVersion: record.canonicalSnapshotVersion ?? null,
    metricEngineVersion: record.metricSnapshotVersion ?? null,
    simulationVersion: record.simulationVersion ?? null,
    inputHash: record.inputHash ?? null,
    dataFingerprint: record.inputHash ?? null,
    generatedAt: record.generatedAt ?? null
  };
}

export function buildSnapshotIdentity(input: SnapshotIdentity = {}) {
  const identity: SnapshotIdentity = {
    canonicalDataVersion: input.canonicalDataVersion ?? input.canonicalSnapshotVersion ?? null,
    canonicalSnapshotVersion: input.canonicalSnapshotVersion ?? input.canonicalDataVersion ?? null,
    canonicalFingerprint: input.canonicalFingerprint ?? null,
    dataFingerprint: input.dataFingerprint ?? input.inputHash ?? null,
    metricEngineVersion: input.metricEngineVersion ?? null,
    profitabilityEngineVersion: input.profitabilityEngineVersion ?? CANONICAL_PROFITABILITY_ENGINE_VERSION,
    algorithmVersion: input.algorithmVersion ?? DECISION_ALGORITHM_VERSION,
    optimizationEngineVersion: input.optimizationEngineVersion ?? input.optimizationVersion ?? OPTIMIZATION_VERSION,
    optimizationVersion: input.optimizationVersion ?? input.optimizationEngineVersion ?? OPTIMIZATION_VERSION,
    simulationVersion: input.simulationVersion ?? SIMULATION_VERSION,
    inputHash: input.inputHash ?? input.dataFingerprint ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  };

  return {
    ...identity,
    snapshotFreshnessVersion: DASHBOARD_SNAPSHOT_FRESHNESS_VERSION
  };
}

export function attachSnapshotIdentity<T extends Record<string, unknown>>(
  payload: T,
  identity: SnapshotIdentity
): T & {
  profitabilityEngineVersion: string;
  calculationIdentity: ReturnType<typeof buildSnapshotIdentity>;
  snapshotIdentity: ReturnType<typeof buildSnapshotIdentity>;
  decisionSnapshotVersions: Record<string, unknown>;
} {
  const calculationIdentity = buildSnapshotIdentity(identity);
  const existingVersions = asSnapshotRecord(payload.decisionSnapshotVersions);
  return {
    ...payload,
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    calculationIdentity,
    snapshotIdentity: calculationIdentity,
    decisionSnapshotVersions: {
      ...existingVersions,
      ...calculationIdentity,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION
    }
  };
}

export async function currentDashboardSnapshotIdentity(
  prisma: PrismaClient,
  input: { workspaceId: string }
) {
  const versions = await currentDecisionSnapshotVersions(prisma, input);
  return buildSnapshotIdentity({
    canonicalDataVersion: versions.canonicalSnapshotVersion,
    canonicalSnapshotVersion: versions.canonicalSnapshotVersion,
    metricEngineVersion: versions.metricSnapshotVersion,
    profitabilityEngineVersion: versions.profitabilityEngineVersion,
    algorithmVersion: versions.algorithmVersion,
    optimizationEngineVersion: versions.optimizationVersion,
    optimizationVersion: versions.optimizationVersion,
    simulationVersion: versions.simulationVersion,
    inputHash: versions.inputHash,
    dataFingerprint: versions.inputHash,
    generatedAt: versions.generatedAt
  });
}

function addMismatch(
  reasons: string[],
  label: string,
  actual: unknown,
  expected: unknown,
  required = true
) {
  if (!required && (expected === null || expected === undefined || expected === "")) return;
  if (actual !== expected) {
    reasons.push(`${label}_mismatch`);
  }
}

export function isSnapshotFresh(
  snapshot: unknown,
  expectedIdentity: SnapshotIdentity,
  options: { requireFullIdentity?: boolean; checkOptimizationVersions?: boolean } = {}
): SnapshotFreshnessResult {
  const payloadIdentity = snapshotIdentityFromPayload(snapshot);
  const recordIdentity = snapshotIdentityFromCacheRecord(asSnapshotRecord(snapshot) as Record<string, unknown>);
  const identity: SnapshotIdentity = {
    ...payloadIdentity,
    ...Object.fromEntries(Object.entries(recordIdentity).filter(([, value]) => value !== null && value !== undefined))
  };
  const expected = buildSnapshotIdentity(expectedIdentity);
  const reasons: string[] = [];
  const requireFullIdentity = options.requireFullIdentity ?? true;
  const checkOptimizationVersions = options.checkOptimizationVersions ?? true;

  addMismatch(reasons, "profitability_engine_version", identity.profitabilityEngineVersion, expected.profitabilityEngineVersion);
  if (checkOptimizationVersions) {
    addMismatch(reasons, "algorithm_version", identity.algorithmVersion, expected.algorithmVersion);
    addMismatch(reasons, "optimization_version", identity.optimizationVersion ?? identity.optimizationEngineVersion, expected.optimizationVersion);
    addMismatch(reasons, "simulation_version", identity.simulationVersion, expected.simulationVersion);
  }
  addMismatch(reasons, "canonical_data_version", identity.canonicalDataVersion ?? identity.canonicalSnapshotVersion, expected.canonicalDataVersion, requireFullIdentity);
  addMismatch(reasons, "metric_engine_version", identity.metricEngineVersion, expected.metricEngineVersion, requireFullIdentity);
  addMismatch(reasons, "data_fingerprint", identity.dataFingerprint ?? identity.inputHash, expected.dataFingerprint, requireFullIdentity);

  return {
    isFresh: reasons.length === 0,
    state: reasons.length === 0 ? "READY" : "STALE",
    reasons,
    identity,
    expected
  };
}

export function normalizeSnapshotState(state: unknown): SnapshotLifecycleState | "UNAVAILABLE" {
  const raw = typeof state === "string" ? state.toUpperCase() : "";
  if (raw === "READY") return "READY";
  if (raw === "STALE") return "STALE";
  if (raw === "REBUILDING" || raw === "QUEUED" || raw === "RUNNING") return "REBUILDING";
  if (raw === "FAILED" || raw === "TIMEOUT") return "FAILED";
  return "UNAVAILABLE";
}

export function isReadySnapshotState(state: unknown) {
  return normalizeSnapshotState(state) === "READY";
}

export function shouldRejectSnapshotOverwrite(input: {
  existingState?: unknown;
  newState?: unknown;
  existingHasRows?: boolean;
  newHasRows?: boolean;
}) {
  const existingState = normalizeSnapshotState(input.existingState);
  const existingProtectable = existingState === "READY" || input.existingHasRows === true;
  if (!existingProtectable) return false;

  const newState = normalizeSnapshotState(input.newState);
  if (newState === "FAILED" || newState === "UNAVAILABLE") return true;
  if (input.existingHasRows && input.newHasRows === false) return true;
  return false;
}
