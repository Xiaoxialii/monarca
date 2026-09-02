ALTER TABLE "SchemaSnapshot"
  ADD COLUMN IF NOT EXISTS "validationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceInferenceVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "semanticMappingVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "productContextIndexVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SchemaSnapshot_workspaceId_canonicalStatus_canonicalVersion_idx"
  ON "SchemaSnapshot" ("workspaceId", "canonicalStatus", "canonicalVersion");

CREATE INDEX IF NOT EXISTS "SchemaSnapshot_workspaceId_publishedAt_idx"
  ON "SchemaSnapshot" ("workspaceId", "publishedAt");

CREATE TABLE IF NOT EXISTS "ProductContextIndex" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT,
  "schemaSnapshotId" TEXT NOT NULL,
  "provider" TEXT,
  "normalizedSku" TEXT,
  "sku" TEXT,
  "productId" TEXT,
  "variantId" TEXT,
  "asin" TEXT,
  "productName" TEXT,
  "category" TEXT,
  "productType" TEXT,
  "brand" TEXT,
  "vendor" TEXT,
  "tags" JSONB,
  "handle" TEXT,
  "price" DOUBLE PRECISION,
  "currency" TEXT,
  "contextQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "searchable" BOOLEAN NOT NULL DEFAULT false,
  "sourceProvenance" JSONB,
  "indexVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductContextIndex_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductContextIndex_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductContextIndex_schemaSnapshotId_fkey" FOREIGN KEY ("schemaSnapshotId") REFERENCES "SchemaSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductContextIndex_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_context_identity_key"
  ON "ProductContextIndex" (
    "workspaceId",
    "schemaSnapshotId",
    COALESCE("provider", ''),
    COALESCE("normalizedSku", ''),
    COALESCE("productId", ''),
    COALESCE("variantId", ''),
    COALESCE("asin", '')
  );

CREATE INDEX IF NOT EXISTS "product_context_snapshot_sku_idx"
  ON "ProductContextIndex" ("workspaceId", "schemaSnapshotId", "normalizedSku");

CREATE INDEX IF NOT EXISTS "product_context_snapshot_asin_idx"
  ON "ProductContextIndex" ("workspaceId", "schemaSnapshotId", "asin");

CREATE INDEX IF NOT EXISTS "product_context_snapshot_product_idx"
  ON "ProductContextIndex" ("workspaceId", "schemaSnapshotId", "productId");

CREATE INDEX IF NOT EXISTS "product_context_source_snapshot_idx"
  ON "ProductContextIndex" ("workspaceId", "dataSourceId", "schemaSnapshotId");

CREATE INDEX IF NOT EXISTS "product_context_searchable_idx"
  ON "ProductContextIndex" ("workspaceId", "schemaSnapshotId", "searchable");
