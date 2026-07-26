import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

export const DECISION_ALGORITHM_VERSION = "decision-intelligence-v2.1";
export const OPTIMIZATION_VERSION = "sku-portfolio-optimizer-v2.3";
export const SIMULATION_VERSION = "sku-portfolio-simulation-v2";
export const METRIC_SNAPSHOT_VERSION = "metrics-from-canonical-v1";

export type DecisionSnapshotVersions = {
  algorithmVersion: string;
  optimizationVersion: string;
  canonicalSnapshotVersion: string | null;
  metricSnapshotVersion: string | null;
  simulationVersion: string;
  inputHash: string;
  generatedAt: Date;
};

export type DecisionSnapshotFreshness = {
  isFresh: boolean;
  reason: string | null;
  current: DecisionSnapshotVersions;
  snapshot: {
    algorithmVersion?: string | null;
    optimizationVersion?: string | null;
    canonicalSnapshotVersion?: string | null;
    metricSnapshotVersion?: string | null;
    simulationVersion?: string | null;
    inputHash?: string | null;
  } | null;
};

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function canonicalSnapshotVersion(snapshot: {
  id: string;
  version: number;
  canonicalVersion?: string | null;
  createdAt: Date;
} | null) {
  if (!snapshot) return null;

  return [
    snapshot.id,
    snapshot.version,
    snapshot.canonicalVersion ?? "canonical-unknown"
  ].join(":");
}

function metricSnapshotVersion(snapshot: {
  id: string;
  schemaVersion?: number | null;
  calculatedAt: Date;
  createdAt: Date;
} | null) {
  if (!snapshot) return null;

  return [
    snapshot.id,
    snapshot.schemaVersion ?? "schema-unknown"
  ].join(":");
}

export async function currentDecisionSnapshotVersions(
  prisma: PrismaClient,
  input: { workspaceId: string }
): Promise<DecisionSnapshotVersions> {
  const [schemaSnapshot, metricSnapshot] = await Promise.all([
    prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { canonicalStatus: "READY" },
          { canonicalStatus: "PARTIAL_READY" }
        ]
      },
      select: {
        id: true,
        version: true,
        canonicalVersion: true,
        createdAt: true
      },
      orderBy: [
        { createdAt: "desc" }
      ]
    }),
    prisma.metricSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId
      },
      select: {
        id: true,
        schemaVersion: true,
        calculatedAt: true,
        createdAt: true
      },
      orderBy: [
        { calculatedAt: "desc" },
        { createdAt: "desc" }
      ]
    })
  ]);

  const canonicalVersion = canonicalSnapshotVersion(schemaSnapshot);
  const metricVersion = metricSnapshotVersion(metricSnapshot);
  const inputHash = hashJson({
    algorithmVersion: DECISION_ALGORITHM_VERSION,
    optimizationVersion: OPTIMIZATION_VERSION,
    simulationVersion: SIMULATION_VERSION,
    canonicalVersion,
    metricVersion
  });

  return {
    algorithmVersion: DECISION_ALGORITHM_VERSION,
    optimizationVersion: OPTIMIZATION_VERSION,
    canonicalSnapshotVersion: canonicalVersion,
    metricSnapshotVersion: metricVersion ?? METRIC_SNAPSHOT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    inputHash,
    generatedAt: new Date()
  };
}

export async function decisionSnapshotFreshness(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    snapshot: DecisionSnapshotFreshness["snapshot"];
  }
): Promise<DecisionSnapshotFreshness> {
  const current = await currentDecisionSnapshotVersions(prisma, { workspaceId: input.workspaceId });
  const snapshot = input.snapshot;

  if (!snapshot) {
    return { isFresh: false, reason: "missing_snapshot", current, snapshot };
  }

  const checks: Array<[keyof DecisionSnapshotVersions, string]> = [
    ["algorithmVersion", "algorithm_version_changed"],
    ["optimizationVersion", "optimization_version_changed"],
    ["simulationVersion", "simulation_version_changed"],
    ["canonicalSnapshotVersion", "canonical_snapshot_changed"],
    ["metricSnapshotVersion", "metric_snapshot_changed"],
    ["inputHash", "input_hash_changed"]
  ];

  for (const [key, reason] of checks) {
    if ((snapshot as Record<string, unknown>)[key] !== (current as Record<string, unknown>)[key]) {
      return { isFresh: false, reason, current, snapshot };
    }
  }

  return { isFresh: true, reason: null, current, snapshot };
}
