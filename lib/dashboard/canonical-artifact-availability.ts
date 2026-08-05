import type { PrismaClient } from "@prisma/client";
import {
  isLocalArtifactFallbackEnabled,
  isR2Configured,
  readR2ObjectText
} from "@/lib/r2-storage";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";

export type CanonicalArtifactAvailability = {
  available: boolean;
  reason:
    | "READABLE"
    | "NO_READY_CANONICAL_SNAPSHOT"
    | "CANONICAL_ARTIFACT_KEY_MISSING"
    | "R2_CONFIGURATION_MISSING"
    | "LOCAL_ARTIFACT_NOT_FOUND"
    | "CANONICAL_ARTIFACT_UNREADABLE";
  message: string;
  snapshotId?: string;
  dataSourceId?: string | null;
  checkedArtifactKey?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function artifactKeysFromSchema(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];

  return tables
    .map((table) => {
      const record = asRecord(table);
      return typeof record.artifactKey === "string" && record.artifactKey.trim()
        ? record.artifactKey.trim()
        : null;
    })
    .filter((key): key is string => Boolean(key));
}

function hasEmbeddedCanonicalData(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const canonicalDataset = asRecord(schema.canonicalDataset ?? schema.canonical_dataset);
  const canonicalTables = asRecord(canonicalDataset.tables);
  const dashboardSnapshot = asRecord(schema.dashboardSnapshot);
  const metrics = asRecord(dashboardSnapshot.metrics);

  return Object.values(canonicalTables).some((rows) => Array.isArray(rows) && rows.length > 0) ||
    Object.keys(metrics).length > 0;
}

function artifactFailureReason(error: unknown): CanonicalArtifactAvailability["reason"] {
  const message = error instanceof Error ? error.message : "";

  if (!isR2Configured() && !isLocalArtifactFallbackEnabled()) {
    return "R2_CONFIGURATION_MISSING";
  }

  if (!isR2Configured() && /ENOENT|no such file or directory/i.test(message)) {
    return "LOCAL_ARTIFACT_NOT_FOUND";
  }

  if (/R2 storage is not configured/i.test(message)) {
    return "R2_CONFIGURATION_MISSING";
  }

  return "CANONICAL_ARTIFACT_UNREADABLE";
}

function artifactFailureMessage(reason: CanonicalArtifactAvailability["reason"], error: unknown) {
  if (reason === "R2_CONFIGURATION_MISSING") {
    return "Canonical artifact is unavailable because R2 storage is not configured for this runtime.";
  }

  if (reason === "LOCAL_ARTIFACT_NOT_FOUND") {
    return "Canonical artifact is unavailable because the local .monarca-artifacts canonical file is missing.";
  }

  return error instanceof Error && error.message
    ? error.message
    : "Canonical artifact is unavailable.";
}

export async function canonicalArtifactAvailability(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    dataSourceId?: string | null;
  }
): Promise<CanonicalArtifactAvailability> {
  const dataSourceFilter = input.dataSourceId ? `and snapshot."dataSourceId" = $2` : "";
  const snapshots = await prisma.$queryRawUnsafe<Array<{
    id: string;
    dataSourceId: string | null;
    schemaJson: unknown;
  }>>(
    `
      select
        snapshot.id,
        snapshot."dataSourceId",
        jsonb_build_object(
          'tables', snapshot."schemaJson"->'tables',
          'canonicalDataset', snapshot."schemaJson"->'canonicalDataset',
          'canonical_dataset', snapshot."schemaJson"->'canonical_dataset',
          'dashboardSnapshot', snapshot."schemaJson"->'dashboardSnapshot'
        ) as "schemaJson"
      from "SchemaSnapshot" snapshot
      left join "DataSourceConnection" source
        on source.id = snapshot."dataSourceId"
        and source."workspaceId" = snapshot."workspaceId"
      where snapshot."workspaceId" = $1
        ${dataSourceFilter.replaceAll('"dataSourceId"', 'snapshot."dataSourceId"')}
        and snapshot."dataSourceId" is not null
        and source."isActive" = true
        and source."status" = 'CONNECTED'
        and snapshot."canonicalStatus" = 'READY'
        and snapshot."canonicalVersion" = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
      order by snapshot."createdAt" desc
      limit 10
    `,
    ...(input.dataSourceId ? [input.workspaceId, input.dataSourceId] : [input.workspaceId])
  );

  if (!snapshots.length) {
    return {
      available: false,
      reason: "NO_READY_CANONICAL_SNAPSHOT",
      message: "No READY ecommerce canonical snapshot is available."
    };
  }

  for (const snapshot of snapshots) {
    if (hasEmbeddedCanonicalData(snapshot.schemaJson)) {
      return {
        available: true,
        reason: "READABLE",
        message: "Embedded canonical snapshot data is readable.",
        snapshotId: snapshot.id,
        dataSourceId: snapshot.dataSourceId
      };
    }

    const artifactKeys = artifactKeysFromSchema(snapshot.schemaJson);
    if (!artifactKeys.length) continue;

    const checkedArtifactKey = artifactKeys[0];
    try {
      await readR2ObjectText(checkedArtifactKey);
      return {
        available: true,
        reason: "READABLE",
        message: "Canonical artifact is readable.",
        snapshotId: snapshot.id,
        dataSourceId: snapshot.dataSourceId,
        checkedArtifactKey
      };
    } catch (error) {
      const reason = artifactFailureReason(error);
      return {
        available: false,
        reason,
        message: artifactFailureMessage(reason, error),
        snapshotId: snapshot.id,
        dataSourceId: snapshot.dataSourceId,
        checkedArtifactKey
      };
    }
  }

  return {
    available: false,
    reason: "CANONICAL_ARTIFACT_KEY_MISSING",
    message: "READY canonical snapshots do not include readable artifact keys.",
    snapshotId: snapshots[0]?.id,
    dataSourceId: snapshots[0]?.dataSourceId
  };
}

export async function hasReadableCanonicalArtifact(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    dataSourceId?: string | null;
  }
) {
  return (await canonicalArtifactAvailability(prisma, input)).available;
}
