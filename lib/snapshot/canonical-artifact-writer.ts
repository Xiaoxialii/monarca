import { createHash } from "node:crypto";
import { writeR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";
import {
  buildCanonicalSnapshotJson,
  ECOMMERCE_CANONICAL_TABLES,
  type CanonicalSnapshotArtifact,
  type CanonicalSnapshotManifest
} from "@/lib/snapshot/canonical-snapshot-generator";

function jsonl(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

function checksum(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export async function writeCanonicalDatasetArtifacts(input: {
  workspaceId: string;
  dataSourceId: string;
  sourceProvider: string;
  fileName?: string | null;
  canonicalDataset: CanonicalDataset;
  manifest?: Partial<CanonicalSnapshotManifest>;
}) {
  const generatedAt = new Date().toISOString();
  const baseKey = [
    "canonical",
    input.workspaceId,
    input.dataSourceId,
    generatedAt.replace(/[:.]/g, "-")
  ].join("/");
  const artifacts: Record<string, CanonicalSnapshotArtifact> = {};

  for (const tableName of ECOMMERCE_CANONICAL_TABLES) {
    const rows = input.canonicalDataset.tables[tableName as keyof CanonicalDataset["tables"]];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const body = jsonl(rows as Array<Record<string, unknown>>);
    const artifactKey = `${baseKey}/${tableName}.jsonl`;
    await writeR2ObjectText({
      key: artifactKey,
      body,
      contentType: "application/x-ndjson",
      metadata: {
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        sourceProvider: input.sourceProvider,
        tableName
      }
    });

    artifacts[tableName] = {
      artifactKey,
      checksum: checksum(body),
      rowCount: rows.length
    };
  }

  const snapshotJson = buildCanonicalSnapshotJson({
    manifest: {
      sourceProvider: input.sourceProvider,
      businessType: "ecommerce",
      dataMode: "canonical_upload",
      confidenceScore: input.canonicalDataset.metadata.mapping_confidence,
      syncStartedAt: generatedAt,
      syncFinishedAt: generatedAt,
      latestBusinessDate: input.canonicalDataset.metadata.normalized_at,
      ...input.manifest
    },
    artifacts,
    canonicalDataset: input.canonicalDataset
  });

  return {
    ...snapshotJson,
    canonicalArtifactManifest: Object.fromEntries(Object.entries(artifacts).map(([tableName, artifact]) => [
      tableName,
      {
        name: tableName,
        artifactKey: artifact.artifactKey,
        rowCount: artifact.rowCount,
        checksum: artifact.checksum
      }
    ])),
    canonicalDataset: null,
    dashboardSnapshot: null,
    metrics: null
  };
}
