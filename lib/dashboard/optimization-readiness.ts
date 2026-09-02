import type { PrismaClient } from "@prisma/client";
import { canonicalArtifactAvailability, type CanonicalArtifactAvailability } from "@/lib/dashboard/canonical-artifact-availability";
import { resolveCanonicalSnapshot } from "@/lib/snapshot/canonical-snapshot-resolver";

export type OptimizationReadinessCode =
  | "NO_DATA_CONNECTED"
  | "CANONICAL_NOT_READY"
  | "CANONICAL_PROCESSING"
  | "CANONICAL_FAILED"
  | "CANONICAL_ARTIFACT_KEY_MISSING"
  | "CANONICAL_ARTIFACT_NOT_FOUND"
  | "CANONICAL_ARTIFACT_UNREADABLE"
  | "CANONICAL_ARTIFACT_INVALID_JSON"
  | "CANONICAL_ARTIFACT_VERSION_MISMATCH"
  | "CANONICAL_DATA_INSUFFICIENT";

export type OptimizationReadiness = {
  ready: boolean;
  stage:
    | "NO_DATA_CONNECTED"
    | "PREPARING_DATA"
    | "CANONICAL_READY"
    | "CANONICAL_ARTIFACT_ERROR";
  code: OptimizationReadinessCode | null;
  message: string | null;
  retryable: boolean;
  latestObservedSnapshotId: string | null;
  latestObservedStatus: {
    schemaStatus: string | null;
    canonicalStatus: string | null;
  } | null;
  canonicalSnapshotId: string | null;
  dataSourceId: string | null;
  dataVersion: string | null;
  artifactStatus: "AVAILABLE" | "UNAVAILABLE" | "NOT_CHECKED";
  artifact: CanonicalArtifactAvailability | null;
};

function artifactCode(reason: CanonicalArtifactAvailability["reason"]): OptimizationReadinessCode {
  if (reason === "CANONICAL_ARTIFACT_KEY_MISSING") return "CANONICAL_ARTIFACT_KEY_MISSING";
  if (reason === "LOCAL_ARTIFACT_NOT_FOUND") return "CANONICAL_ARTIFACT_NOT_FOUND";
  if (reason === "CANONICAL_ARTIFACT_UNREADABLE") return "CANONICAL_ARTIFACT_UNREADABLE";
  return "CANONICAL_ARTIFACT_UNREADABLE";
}

function canonicalStatusCode(status: string | null): OptimizationReadinessCode {
  if (!status || status === "NOT_STARTED") return "CANONICAL_NOT_READY";
  if (status === "FAILED") return "CANONICAL_FAILED";
  return "CANONICAL_PROCESSING";
}

export function canonicalDataVersion(input: {
  snapshotId: string | null;
  version: number | null;
  canonicalVersion: string | null;
}) {
  if (!input.snapshotId || input.version === null || !input.canonicalVersion) return null;
  return `${input.snapshotId}:${input.version}:${input.canonicalVersion}`;
}

export async function optimizationReadiness(
  prisma: PrismaClient,
  input: { workspaceId: string }
): Promise<OptimizationReadiness> {
  const [connectedSourceCount, latestObserved, resolved] = await Promise.all([
    prisma.dataSourceConnection.count({
      where: {
        workspaceId: input.workspaceId,
        isActive: true,
        status: "CONNECTED"
      }
    }),
    prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        dataSourceId: { not: null },
        dataSource: {
          isActive: true,
          status: "CONNECTED"
        }
      },
      select: {
        id: true,
        dataSourceId: true,
        version: true,
        schemaStatus: true,
        canonicalStatus: true,
        canonicalVersion: true
      },
      orderBy: { createdAt: "desc" }
    }),
    resolveCanonicalSnapshot(prisma, { workspaceId: input.workspaceId })
  ]);

  if (!connectedSourceCount) {
    return {
      ready: false,
      stage: "NO_DATA_CONNECTED",
      code: "NO_DATA_CONNECTED",
      message: "Connect a data source to start profit optimization.",
      retryable: false,
      latestObservedSnapshotId: null,
      latestObservedStatus: null,
      canonicalSnapshotId: null,
      dataSourceId: null,
      dataVersion: null,
      artifactStatus: "NOT_CHECKED",
      artifact: null
    };
  }

  if (!resolved.snapshotId) {
    const code = canonicalStatusCode(latestObserved?.canonicalStatus ?? null);
    return {
      ready: false,
      stage: "PREPARING_DATA",
      code,
      message: code === "CANONICAL_FAILED"
        ? "We couldn't prepare the connected data for optimization."
        : "Your connected data is still being prepared for optimization.",
      retryable: code !== "CANONICAL_FAILED",
      latestObservedSnapshotId: latestObserved?.id ?? null,
      latestObservedStatus: latestObserved
        ? {
          schemaStatus: latestObserved.schemaStatus,
          canonicalStatus: latestObserved.canonicalStatus
        }
        : null,
      canonicalSnapshotId: null,
      dataSourceId: latestObserved?.dataSourceId ?? null,
      dataVersion: null,
      artifactStatus: "NOT_CHECKED",
      artifact: null
    };
  }

  const artifact = await canonicalArtifactAvailability(prisma, { workspaceId: input.workspaceId });
  const dataVersion = resolved.dataVersion;

  if (!artifact.available) {
    return {
      ready: false,
      stage: "CANONICAL_ARTIFACT_ERROR",
      code: artifactCode(artifact.reason),
      message: artifact.message,
      retryable: artifact.reason !== "CANONICAL_ARTIFACT_KEY_MISSING",
      latestObservedSnapshotId: latestObserved?.id ?? null,
      latestObservedStatus: latestObserved
        ? {
          schemaStatus: latestObserved.schemaStatus,
          canonicalStatus: latestObserved.canonicalStatus
        }
        : null,
      canonicalSnapshotId: resolved.snapshotId,
      dataSourceId: resolved.dataSourceId,
      dataVersion,
      artifactStatus: "UNAVAILABLE",
      artifact
    };
  }

  return {
    ready: true,
    stage: "CANONICAL_READY",
    code: null,
    message: null,
    retryable: false,
    latestObservedSnapshotId: latestObserved?.id ?? null,
    latestObservedStatus: latestObserved
      ? {
        schemaStatus: latestObserved.schemaStatus,
        canonicalStatus: latestObserved.canonicalStatus
      }
      : null,
    canonicalSnapshotId: resolved.snapshotId,
    dataSourceId: resolved.dataSourceId,
    dataVersion,
    artifactStatus: "AVAILABLE",
    artifact
  };
}
