import type { PrismaClient } from "@prisma/client";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { PRODUCT_CONTEXT_INDEX_VERSION } from "@/lib/snapshot/product-context-index";

type JsonRecord = Record<string, unknown>;

export type ResolvedCanonicalSnapshot = {
  snapshotId: string | null;
  dataSourceId: string | null;
  provider: string | null;
  schemaVersion: string | null;
  mappingVersion: string | null;
  sourceInferenceVersion: string | null;
  productContextIndexVersion: string | null;
  validationStatus: string | null;
  validationSummary: JsonRecord | null;
  publishedAt: string | null;
  dataVersion: string | null;
  capabilities: {
    reportingAvailable: boolean;
    optimizationAvailable: boolean;
    productContextAvailable: boolean;
    competitiveDiscoveryAvailable: boolean;
  };
  warnings: string[];
};

export async function resolveCanonicalSnapshot(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  provider?: string | null;
  requireProductContext?: boolean;
}): Promise<ResolvedCanonicalSnapshot> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    dataSourceId: string | null;
    version: number;
    canonicalVersion: string | null;
    validationStatus: string | null;
    sourceInferenceVersion: string | null;
    semanticMappingVersion: string | null;
    productContextIndexVersion: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    provider: string | null;
    indexedSearchableProducts: number;
  }>>`
    SELECT
      snapshot.id,
      snapshot."dataSourceId",
      snapshot.version,
      snapshot."canonicalVersion",
      snapshot."validationStatus",
      snapshot."sourceInferenceVersion",
      snapshot."semanticMappingVersion",
      snapshot."productContextIndexVersion",
      snapshot."publishedAt",
      snapshot."createdAt",
      source.provider AS provider,
      (
        SELECT COUNT(*)::int
        FROM "ProductContextIndex" product_context
        WHERE product_context."workspaceId" = snapshot."workspaceId"
          AND product_context."schemaSnapshotId" = snapshot.id
          AND product_context.searchable = true
      ) AS "indexedSearchableProducts"
    FROM "SchemaSnapshot" snapshot
    LEFT JOIN "DataSourceConnection" source
      ON source.id = snapshot."dataSourceId"
      AND source."workspaceId" = snapshot."workspaceId"
    WHERE snapshot."workspaceId" = ${input.workspaceId}
      AND snapshot."dataSourceId" IS NOT NULL
      AND (${input.dataSourceId ?? null}::text IS NULL OR snapshot."dataSourceId" = ${input.dataSourceId ?? null})
      AND (${input.provider ?? null}::text IS NULL OR source.provider = ${input.provider ?? null})
      AND source."isActive" = true
      AND source.status = 'CONNECTED'
      AND snapshot."canonicalStatus" = 'READY'
      AND snapshot."canonicalVersion" = ${ECOMMERCE_CANONICAL_SCHEMA_VERSION}
    ORDER BY COALESCE(snapshot."publishedAt", snapshot."createdAt") DESC, snapshot.version DESC
    LIMIT 5
  `;

  const selected = input.requireProductContext
    ? rows.find((row) => Number(row.indexedSearchableProducts) > 0) ?? rows[0]
    : rows[0];

  if (!selected) return emptyResolvedSnapshot();

  const validationRows = await prisma.$queryRaw<Array<{
    provider: string | null;
    validationSummary: unknown;
  }>>`
    SELECT
      snapshot."schemaJson"->>'sourceProvider' AS provider,
      COALESCE(
        snapshot."schemaJson"->'productContextValidation',
        snapshot."qualityReport"->'productContextValidation',
        '{}'::jsonb
      ) AS "validationSummary"
    FROM "SchemaSnapshot" snapshot
    WHERE snapshot.id = ${selected.id}
      AND snapshot."workspaceId" = ${input.workspaceId}
    LIMIT 1
  `;
  const validationSummary = objectValue(validationRows[0]?.validationSummary);
  const provider = validationRows[0]?.provider ?? selected.provider;
  const capabilities = {
    ...capabilitiesFromValidation(validationSummary),
    productContextAvailable: capabilitiesFromValidation(validationSummary).productContextAvailable || Number(selected.indexedSearchableProducts) > 0,
    competitiveDiscoveryAvailable: capabilitiesFromValidation(validationSummary).competitiveDiscoveryAvailable || Number(selected.indexedSearchableProducts) > 0
  };
  const warnings = Array.isArray(validationSummary.warnings)
    ? validationSummary.warnings.map((warning) => String(objectValue(warning).message || objectValue(warning).code || "")).filter(Boolean)
    : [];

  return {
    snapshotId: selected.id,
    dataSourceId: selected.dataSourceId,
    provider,
    schemaVersion: selected.canonicalVersion,
    mappingVersion: selected.semanticMappingVersion,
    sourceInferenceVersion: selected.sourceInferenceVersion,
    productContextIndexVersion: selected.productContextIndexVersion ?? PRODUCT_CONTEXT_INDEX_VERSION,
    validationStatus: selected.validationStatus ?? stringValue(validationSummary.status),
    validationSummary,
    publishedAt: (selected.publishedAt ?? selected.createdAt)?.toISOString() ?? null,
    dataVersion: `${selected.id}:${selected.version}:${selected.canonicalVersion}`,
    capabilities,
    warnings
  };
}

function emptyResolvedSnapshot(): ResolvedCanonicalSnapshot {
  return {
    snapshotId: null,
    dataSourceId: null,
    provider: null,
    schemaVersion: null,
    mappingVersion: null,
    sourceInferenceVersion: null,
    productContextIndexVersion: null,
    validationStatus: null,
    validationSummary: null,
    publishedAt: null,
    dataVersion: null,
    capabilities: {
      reportingAvailable: false,
      optimizationAvailable: false,
      productContextAvailable: false,
      competitiveDiscoveryAvailable: false
    },
    warnings: []
  };
}

function capabilitiesFromValidation(value: unknown) {
  const capabilities = objectValue(objectValue(value).capabilities);
  return {
    reportingAvailable: capabilities.reportingAvailable !== false,
    optimizationAvailable: capabilities.optimizationAvailable !== false,
    productContextAvailable: capabilities.productContextAvailable === true,
    competitiveDiscoveryAvailable: capabilities.competitiveDiscoveryAvailable === true
  };
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
