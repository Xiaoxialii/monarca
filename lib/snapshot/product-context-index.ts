import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { readR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";

export const PRODUCT_CONTEXT_INDEX_VERSION = "product_context_index/v1";
export const PRODUCT_CONTEXT_VALIDATION_VERSION = "product_context_validation/v1";

type JsonRecord = Record<string, unknown>;

export type ProductContextValidationSummary = {
  version: string;
  status: "READY" | "READY_WITH_WARNINGS" | "FAILED_VALIDATION";
  totalProductRows: number;
  rowsWithSku: number;
  rowsWithProductId: number;
  rowsWithAsin: number;
  rowsWithProductName: number;
  rowsWithCategory: number;
  rowsWithTags: number;
  rowsWithHandle: number;
  rowsWithVendor: number;
  rowsWithBrand: number;
  searchableProductRows: number;
  searchableProductCoverage: number;
  duplicateProductKeys: number;
  conflictingProductFields: number;
  warnings: Array<{ code: string; message: string; field?: string }>;
  capabilities: {
    reportingAvailable: boolean;
    optimizationAvailable: boolean;
    productContextAvailable: boolean;
    competitiveDiscoveryAvailable: boolean;
  };
};

export type ProductContextIndexRow = {
  workspaceId: string;
  dataSourceId: string | null;
  schemaSnapshotId: string;
  provider: string | null;
  normalizedSku: string | null;
  sku: string | null;
  productId: string | null;
  variantId: string | null;
  asin: string | null;
  productName: string | null;
  category: string | null;
  productType: string | null;
  brand: string | null;
  vendor: string | null;
  tags: string[];
  handle: string | null;
  price: number | null;
  currency: string | null;
  contextQuality: number;
  searchable: boolean;
  sourceProvenance: JsonRecord;
};

const CONTEXT_FIELDS = ["productName", "category", "productType", "brand", "vendor", "tags", "handle"] as const;

export function productContextValidationSummary(rows: ProductContextIndexRow[], input: {
  totalCanonicalRows: number;
  coreTableRowCount?: number;
  duplicateProductKeys?: number;
  conflictingProductFields?: number;
}): ProductContextValidationSummary {
  const totalProductRows = rows.length;
  const searchableProductRows = rows.filter((row) => row.searchable).length;
  const searchableProductCoverage = totalProductRows ? searchableProductRows / totalProductRows : 0;
  const warnings: ProductContextValidationSummary["warnings"] = [];
  const hasCoreData = input.totalCanonicalRows > 0 && (input.coreTableRowCount ?? input.totalCanonicalRows) > 0;

  if (!hasCoreData) {
    warnings.push({
      code: "CANONICAL_CORE_EMPTY",
      message: "Canonical generation did not produce core ecommerce rows."
    });
  }
  if (totalProductRows > 0 && searchableProductCoverage < 0.25) {
    warnings.push({
      code: "PRODUCT_CONTEXT_LOW_COVERAGE",
      message: "Product rows exist, but too few have searchable product context."
    });
  }

  const status = !hasCoreData
    ? "FAILED_VALIDATION"
    : warnings.length
      ? "READY_WITH_WARNINGS"
      : "READY";

  return {
    version: PRODUCT_CONTEXT_VALIDATION_VERSION,
    status,
    totalProductRows,
    rowsWithSku: count(rows, (row) => Boolean(row.sku)),
    rowsWithProductId: count(rows, (row) => Boolean(row.productId)),
    rowsWithAsin: count(rows, (row) => Boolean(row.asin)),
    rowsWithProductName: count(rows, (row) => Boolean(row.productName)),
    rowsWithCategory: count(rows, (row) => Boolean(row.category || row.productType)),
    rowsWithTags: count(rows, (row) => row.tags.length > 0),
    rowsWithHandle: count(rows, (row) => Boolean(row.handle)),
    rowsWithVendor: count(rows, (row) => Boolean(row.vendor)),
    rowsWithBrand: count(rows, (row) => Boolean(row.brand)),
    searchableProductRows,
    searchableProductCoverage,
    duplicateProductKeys: input.duplicateProductKeys ?? 0,
    conflictingProductFields: input.conflictingProductFields ?? 0,
    warnings,
    capabilities: {
      reportingAvailable: hasCoreData,
      optimizationAvailable: hasCoreData,
      productContextAvailable: searchableProductRows > 0,
      competitiveDiscoveryAvailable: searchableProductRows > 0
    }
  };
}

export function buildProductContextIndexRows(input: {
  workspaceId: string;
  dataSourceId: string | null;
  schemaSnapshotId: string;
  provider: string | null;
  canonicalDataset: CanonicalDataset;
}) {
  const products = input.canonicalDataset.tables.ecommerce_products ?? [];
  const orderItems = input.canonicalDataset.tables.ecommerce_order_items ?? [];
  const inventory = input.canonicalDataset.tables.ecommerce_inventory ?? [];
  const ads = input.canonicalDataset.tables.ecommerce_ads ?? [];
  const merged = new Map<string, ProductContextIndexRow>();
  const conflicts: Array<{ key: string; field: string; existing: unknown; incoming: unknown; source: string }> = [];
  let duplicateProductKeys = 0;

  for (const row of products) mergeRow("ecommerce_products", objectValue(row), 4);
  for (const row of orderItems) mergeRow("ecommerce_order_items", objectValue(row), 3);
  for (const row of inventory) mergeRow("ecommerce_inventory", objectValue(row), 2);
  for (const row of ads) mergeRow("ecommerce_ads", objectValue(row), 1);

  function mergeRow(table: string, row: JsonRecord, priority: number) {
    const provider = stringValue(row.platform, row.source_provider, input.provider) || input.provider;
    const sku = stringValue(row.sku, row.inventory_item_sku);
    const normalizedSku = sku ? normalizeStableId(sku) : "";
    const productId = stringValue(row.product_id, row.source_product_id);
    const variantId = stringValue(row.variant_id, row.source_variant_id);
    const asin = stringValue(row.asin) || (provider === "amazon" && isLikelyAsin(productId) ? productId : "");
    const identity = productContextIdentity({ provider, productId, variantId, asin, normalizedSku });
    if (!identity) return;

    const candidate: ProductContextIndexRow = {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      schemaSnapshotId: input.schemaSnapshotId,
      provider,
      normalizedSku: normalizedSku || null,
      sku: sku || null,
      productId: productId || null,
      variantId: variantId || null,
      asin: asin || null,
      productName: stringValue(row.product_name, row.title, row.item_name, row.lineitem_name) || null,
      category: stringValue(row.category, row.category_full_name, row.category_name) || null,
      productType: stringValue(row.product_type) || null,
      brand: stringValue(row.brand, row.brand_name, row.manufacturer) || null,
      vendor: stringValue(row.vendor, row.supplier) || null,
      tags: stringArray(row.tags, row.keywords, row.search_terms, row.labels),
      handle: stringValue(row.handle, row.product_handle, row.slug) || null,
      price: numberValue(row.price, row.unit_price),
      currency: stringValue(row.currency) || null,
      contextQuality: 0,
      searchable: false,
      sourceProvenance: {
        fields: {},
        sources: [{ table, priority }]
      }
    };
    candidate.contextQuality = productContextQuality(candidate);
    candidate.searchable = isSearchableProductContext(candidate);

    const existing = merged.get(identity);
    const skuIdentity = normalizedSku ? productContextIdentity({ provider, productId: "", variantId: "", asin: "", normalizedSku }) : "";
    const secondarySkuExisting = skuIdentity && skuIdentity !== identity ? merged.get(skuIdentity) : undefined;
    if (!existing && !secondarySkuExisting) {
      merged.set(identity, candidate);
      return;
    }

    duplicateProductKeys += 1;
    const target = existing ?? secondarySkuExisting;
    if (!target) return;
    mergeProductContext(target, candidate, table, priority, conflicts, identity);
    target.contextQuality = productContextQuality(target);
    target.searchable = isSearchableProductContext(target);
  }

  const rows = Array.from(merged.values()).sort((left, right) =>
    (left.normalizedSku ?? "").localeCompare(right.normalizedSku ?? "") ||
    (left.productId ?? "").localeCompare(right.productId ?? "")
  );
  const totalCanonicalRows = Object.values(input.canonicalDataset.tables).reduce((sum, tableRows) => sum + (Array.isArray(tableRows) ? tableRows.length : 0), 0);
  const coreTableRowCount = (input.canonicalDataset.tables.ecommerce_orders?.length ?? 0) +
    (input.canonicalDataset.tables.ecommerce_order_items?.length ?? 0) +
    (input.canonicalDataset.tables.ecommerce_products?.length ?? 0);

  return {
    rows,
    validation: productContextValidationSummary(rows, {
      totalCanonicalRows,
      coreTableRowCount,
      duplicateProductKeys,
      conflictingProductFields: conflicts.length
    }),
    conflicts
  };
}

export async function replaceProductContextIndex(prisma: PrismaClient, rows: ProductContextIndexRow[]) {
  const first = rows[0];
  if (!first) return { inserted: 0, available: true };

  try {
    await prisma.$executeRaw`DELETE FROM "ProductContextIndex" WHERE "workspaceId" = ${first.workspaceId} AND "schemaSnapshotId" = ${first.schemaSnapshotId}`;
    for (const row of rows) {
      await prisma.$executeRaw`
        INSERT INTO "ProductContextIndex" (
          "id", "workspaceId", "dataSourceId", "schemaSnapshotId", "provider", "normalizedSku", "sku",
          "productId", "variantId", "asin", "productName", "category", "productType", "brand", "vendor",
          "tags", "handle", "price", "currency", "contextQuality", "searchable", "sourceProvenance", "indexVersion", "updatedAt"
        ) VALUES (
          ${crypto.randomUUID()}, ${row.workspaceId}, ${row.dataSourceId}, ${row.schemaSnapshotId}, ${row.provider}, ${row.normalizedSku}, ${row.sku},
          ${row.productId}, ${row.variantId}, ${row.asin}, ${row.productName}, ${row.category}, ${row.productType}, ${row.brand}, ${row.vendor},
          ${JSON.stringify(row.tags)}::jsonb, ${row.handle}, ${row.price}, ${row.currency}, ${row.contextQuality}, ${row.searchable},
          ${JSON.stringify(row.sourceProvenance)}::jsonb, ${PRODUCT_CONTEXT_INDEX_VERSION}, CURRENT_TIMESTAMP
        )
        ON CONFLICT ON CONSTRAINT "ProductContextIndex_pkey" DO NOTHING
      `;
    }
    return { inserted: rows.length, available: true };
  } catch (error) {
    console.warn("[product-context-index] index write skipped", {
      snapshotId: first.schemaSnapshotId,
      message: error instanceof Error ? error.message : String(error)
    });
    return { inserted: 0, available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function lookupProductContextIndex(prisma: PrismaClient, input: {
  workspaceId: string;
  schemaSnapshotId: string;
  sku?: string | null;
  productId?: string | null;
  variantId?: string | null;
  asin?: string | null;
}) {
  const normalizedSku = input.sku ? normalizeStableId(input.sku) : null;
  const startedAt = Date.now();
  try {
    const rows = await prisma.$queryRaw<Array<ProductContextIndexRow & {
      sourceProvenance: unknown;
      tags: unknown;
    }>>`
      SELECT
        "workspaceId", "dataSourceId", "schemaSnapshotId", "provider", "normalizedSku", "sku",
        "productId", "variantId", "asin", "productName", "category", "productType", "brand", "vendor",
        "tags", "handle", "price", "currency", "contextQuality", "searchable", "sourceProvenance"
      FROM "ProductContextIndex"
      WHERE "workspaceId" = ${input.workspaceId}
        AND "schemaSnapshotId" = ${input.schemaSnapshotId}
        AND (
          (${normalizedSku}::text IS NOT NULL AND "normalizedSku" = ${normalizedSku})
          OR (${input.asin ?? null}::text IS NOT NULL AND "asin" = ${input.asin ?? null})
          OR (${input.productId ?? null}::text IS NOT NULL AND "productId" = ${input.productId ?? null})
          OR (${input.variantId ?? null}::text IS NOT NULL AND "variantId" = ${input.variantId ?? null})
        )
      ORDER BY "searchable" DESC, "contextQuality" DESC, "updatedAt" DESC
      LIMIT 1
    `;
    const row = rows[0];
    return {
      row: row ? normalizeIndexRow(row) : null,
      metrics: {
        source: "product_context_index",
        durationMs: Date.now() - startedAt,
        rowsScanned: rows.length,
        cacheStatus: row ? "hit" : "miss"
      }
    };
  } catch (error) {
    return {
      row: null,
      metrics: {
        source: "product_context_index",
        durationMs: Date.now() - startedAt,
        rowsScanned: 0,
        cacheStatus: "unavailable",
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function lookupWorkspaceProductContextIndex(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  sku?: string | null;
  productId?: string | null;
  variantId?: string | null;
  asin?: string | null;
}) {
  const normalizedSku = input.sku ? normalizeStableId(input.sku) : null;
  const startedAt = Date.now();
  try {
    const rows = await prisma.$queryRaw<Array<ProductContextIndexRow & {
      sourceProvenance: unknown;
      tags: unknown;
      snapshotValidationStatus: string | null;
      snapshotCanonicalVersion: string | null;
      snapshotMappingVersion: string | null;
      snapshotSourceInferenceVersion: string | null;
      snapshotProductContextIndexVersion: string | null;
      snapshotPublishedAt: Date | null;
      snapshotCreatedAt: Date;
    }>>`
      SELECT
        product_context."workspaceId", product_context."dataSourceId", product_context."schemaSnapshotId",
        product_context.provider, product_context."normalizedSku", product_context.sku,
        product_context."productId", product_context."variantId", product_context.asin,
        product_context."productName", product_context.category, product_context."productType",
        product_context.brand, product_context.vendor, product_context.tags, product_context.handle,
        product_context.price, product_context.currency, product_context."contextQuality",
        product_context.searchable, product_context."sourceProvenance",
        snapshot."validationStatus" AS "snapshotValidationStatus",
        snapshot."canonicalVersion" AS "snapshotCanonicalVersion",
        snapshot."semanticMappingVersion" AS "snapshotMappingVersion",
        snapshot."sourceInferenceVersion" AS "snapshotSourceInferenceVersion",
        snapshot."productContextIndexVersion" AS "snapshotProductContextIndexVersion",
        snapshot."publishedAt" AS "snapshotPublishedAt",
        snapshot."createdAt" AS "snapshotCreatedAt"
      FROM "ProductContextIndex" product_context
      INNER JOIN "SchemaSnapshot" snapshot
        ON snapshot.id = product_context."schemaSnapshotId"
        AND snapshot."workspaceId" = product_context."workspaceId"
      LEFT JOIN "DataSourceConnection" source
        ON source.id = snapshot."dataSourceId"
        AND source."workspaceId" = snapshot."workspaceId"
      WHERE product_context."workspaceId" = ${input.workspaceId}
        AND (${input.dataSourceId ?? null}::text IS NULL OR product_context."dataSourceId" = ${input.dataSourceId ?? null})
        AND snapshot."canonicalStatus" = 'READY'
        AND (source.id IS NULL OR source."isActive" = true)
        AND (
          (${normalizedSku}::text IS NOT NULL AND product_context."normalizedSku" = ${normalizedSku})
          OR (${input.asin ?? null}::text IS NOT NULL AND product_context.asin = ${input.asin ?? null})
          OR (${input.productId ?? null}::text IS NOT NULL AND product_context."productId" = ${input.productId ?? null})
          OR (${input.variantId ?? null}::text IS NOT NULL AND product_context."variantId" = ${input.variantId ?? null})
        )
      ORDER BY
        product_context.searchable DESC,
        product_context."contextQuality" DESC,
        COALESCE(snapshot."publishedAt", snapshot."createdAt") DESC,
        product_context."updatedAt" DESC
      LIMIT 1
    `;
    const row = rows[0];
    return {
      row: row ? normalizeIndexRow(row) : null,
      snapshot: row ? {
        snapshotId: row.schemaSnapshotId,
        dataSourceId: row.dataSourceId,
        provider: row.provider,
        validationStatus: row.snapshotValidationStatus,
        schemaVersion: row.snapshotCanonicalVersion,
        mappingVersion: row.snapshotMappingVersion,
        sourceInferenceVersion: row.snapshotSourceInferenceVersion,
        productContextIndexVersion: row.snapshotProductContextIndexVersion,
        publishedAt: (row.snapshotPublishedAt ?? row.snapshotCreatedAt)?.toISOString() ?? null
      } : null,
      metrics: {
        source: "workspace_product_context_index",
        durationMs: Date.now() - startedAt,
        rowsScanned: rows.length,
        cacheStatus: row ? "hit" : "miss",
        dataSourceScoped: Boolean(input.dataSourceId)
      }
    };
  } catch (error) {
    return {
      row: null,
      snapshot: null,
      metrics: {
        source: "workspace_product_context_index",
        durationMs: Date.now() - startedAt,
        rowsScanned: 0,
        cacheStatus: "unavailable",
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function readCanonicalTableRows(schemaJson: JsonRecord, tableName: string, maxRows = 50_000) {
  const embedded = objectValue(objectValue(schemaJson.canonicalDataset).tables);
  const embeddedRows = Array.isArray(embedded[tableName]) ? embedded[tableName].map(objectValue) : [];
  if (embeddedRows.length) return { rows: embeddedRows.slice(0, maxRows), bytesRead: 0 };

  const tables = Array.isArray(schemaJson.tables) ? schemaJson.tables : [];
  const table = tables.find((item) => objectValue(item).name === tableName);
  const artifactKey = stringValue(objectValue(table).artifactKey);
  if (!artifactKey) return { rows: [] as JsonRecord[], bytesRead: 0 };
  const text = await readR2ObjectText(artifactKey);
  const rows: JsonRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as JsonRecord);
    if (rows.length >= maxRows) break;
  }
  return { rows, bytesRead: Buffer.byteLength(text) };
}

function normalizeIndexRow(row: ProductContextIndexRow & { tags: unknown; sourceProvenance: unknown }): ProductContextIndexRow {
  return {
    ...row,
    tags: stringArray(row.tags),
    sourceProvenance: objectValue(row.sourceProvenance)
  };
}

function mergeProductContext(
  target: ProductContextIndexRow,
  source: ProductContextIndexRow,
  sourceTable: string,
  sourcePriority: number,
  conflicts: Array<{ key: string; field: string; existing: unknown; incoming: unknown; source: string }>,
  key: string
) {
  const targetPriority = maxPriority(target.sourceProvenance);
  const provenance = objectValue(target.sourceProvenance);
  const sources = Array.isArray(provenance.sources) ? provenance.sources : [];
  provenance.sources = [...sources, { table: sourceTable, priority: sourcePriority }].slice(0, 12);

  for (const field of ["sku", "productId", "variantId", "asin", "productName", "category", "productType", "brand", "vendor", "handle", "currency"] as const) {
    const incoming = source[field];
    if (!hasValue(incoming)) continue;
    const existing = target[field];
    if (!hasValue(existing) || sourcePriority > targetPriority) {
      target[field] = incoming as never;
      continue;
    }
    if (existing !== incoming) {
      conflicts.push({ key, field, existing, incoming, source: sourceTable });
    }
  }

  if (source.price !== null && (!hasValue(target.price) || sourcePriority > targetPriority)) target.price = source.price;
  if (source.tags.length && !target.tags.length) target.tags = source.tags;
  target.sourceProvenance = provenance;
}

function productContextIdentity(input: {
  provider: string | null;
  productId: string;
  variantId: string;
  asin: string;
  normalizedSku: string;
}) {
  const provider = input.provider || "unknown";
  if (input.productId) return `${provider}:product:${normalizeStableId(input.productId)}`;
  if (input.variantId) return `${provider}:variant:${normalizeStableId(input.variantId)}`;
  if (input.asin) return `${provider}:asin:${normalizeStableId(input.asin)}`;
  if (input.normalizedSku) return `${provider}:sku:${input.normalizedSku}`;
  return "";
}

function productContextQuality(row: ProductContextIndexRow) {
  const stableIdScore = [row.sku, row.productId, row.variantId, row.asin].some(Boolean) ? 0.35 : 0;
  const nameScore = row.productName ? 0.25 : 0;
  const categoryScore = row.category || row.productType ? 0.15 : 0;
  const brandScore = row.brand || row.vendor ? 0.15 : 0;
  const tagScore = row.tags.length || row.handle ? 0.1 : 0;
  return Number((stableIdScore + nameScore + categoryScore + brandScore + tagScore).toFixed(2));
}

function isSearchableProductContext(row: ProductContextIndexRow) {
  const hasStableId = [row.sku, row.productId, row.variantId, row.asin].some(Boolean);
  const hasContext = CONTEXT_FIELDS.some((field) => {
    const value = row[field];
    return Array.isArray(value) ? value.length > 0 : hasValue(value);
  });
  return hasStableId && hasContext;
}

function maxPriority(provenance: unknown) {
  const rawSources = objectValue(provenance).sources;
  const sources: unknown[] = Array.isArray(rawSources) ? rawSources : [];
  return Math.max(0, ...sources.map((item: unknown) => Number(objectValue(item).priority ?? 0)).filter(Number.isFinite));
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && stringValue(value) !== "";
}

function stringArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
        } catch {
          // Fall through to delimiter parsing for malformed array-like strings.
        }
      }
      return trimmed
        .split(/[,，;|]/)
        .map((item) => item.trim().replace(/^["'\[\]\s]+|["'\[\]\s]+$/g, ""))
        .filter(Boolean);
    }
  }
  return [];
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeStableId(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyAsin(value: string) {
  return /^[A-Z0-9]{10}$/i.test(value);
}

function count<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}
