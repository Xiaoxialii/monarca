import type { PrismaClient } from "@prisma/client";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import { resolveCanonicalSnapshot, type ResolvedCanonicalSnapshot } from "@/lib/snapshot/canonical-snapshot-resolver";
import {
  buildProductContextIndexRows,
  lookupProductContextIndex,
  lookupWorkspaceProductContextIndex,
  readCanonicalTableRows,
  replaceProductContextIndex,
  type ProductContextIndexRow
} from "@/lib/snapshot/product-context-index";
import {
  enqueueCompetitivePublicAdSyncJob,
  fetchMetaAdLibrarySearchAds,
  metaAdLibraryAccessToken,
  normalizeCompetitorBrandName,
  publicAdLibraryErrorCode,
  publicAdLibraryUserMessage,
  upsertSuggestedCompetitorBrands
} from "@/lib/competitive-intelligence/meta-ad-library";
import type { CanonicalDataset } from "@/lib/semantic/types";

const AUTO_CONFIRM_MIN_CONFIDENCE = 0.72;
const AUTO_CONFIRM_MIN_ADS = 6;
const AUTO_CONFIRM_MIN_MATCHED_TERMS = 2;
const AUTO_CONFIRM_MIN_LONG_RUNNING_DAYS = 45;
const MAX_AUTO_CONFIRMED_COMPETITORS = 5;
const FALLBACK_AD_LIBRARY_COUNTRIES = ["GB", "CA", "AU", "DE", "FR"] as const;

type JsonRecord = Record<string, unknown>;

export type CompetitorDiscoveryResult = {
  ok: boolean;
  sku: string;
  country: string;
  status: "SUCCESS" | "UNSUPPORTED" | "NO_PRODUCT_CONTEXT" | "NO_CANDIDATES";
  code?: string;
  missingFields?: string[];
  availableFields?: string[];
  snapshotId?: string | null;
  dataSourceId?: string | null;
  validationStatus?: string | null;
  canReprocess?: boolean;
  recommendedAction?: string | null;
  contextSource?: string | null;
  lookupMetrics?: JsonRecord;
  searchTerms: string[];
  searchedCountries?: string[];
  candidates: Array<{
    brandName: string;
    confidence: number;
    adCount: number;
    longestRunningDays: number | null;
    autoConfirmed: boolean;
    country: string;
    evidence: JsonRecord;
  }>;
  queuedSyncJobId?: string | null;
  queuedSyncJobIds?: string[];
};

export async function discoverCompetitorBrandsForSku(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
    dataSourceId?: string | null;
    country?: string | null;
    limitPerTerm?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<CompetitorDiscoveryResult> {
  const sku = input.sku.trim();
  const country = normalizeCountry(input.country);
  if (!sku) throw new Error("SKU_REQUIRED");

  const token = metaAdLibraryAccessToken();
  if (!token) {
    return {
      ok: false,
      sku,
      country,
      status: "UNSUPPORTED",
      code: "PUBLIC_AD_LIBRARY_TOKEN_MISSING",
      searchTerms: [],
      candidates: []
    };
  }

  const resolvedSnapshot = await resolveCanonicalSnapshot(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId ?? undefined,
    requireProductContext: true
  });
  if (!resolvedSnapshot.snapshotId) {
    return structuredProductContextFailure({
      sku,
      country,
      code: "SNAPSHOT_NOT_READY",
      resolvedSnapshot,
      product: null,
      lookupMetrics: {}
    });
  }

  const loadedContext = await loadSkuProductContext(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    sku,
    resolvedSnapshot
  });
  const product = loadedContext.product;
  const lookupMetrics = loadedContext.lookupMetrics;
  const effectiveSnapshot = loadedContext.resolvedSnapshot ?? resolvedSnapshot;
  if (!product) {
    return structuredProductContextFailure({
      sku,
      country,
      code: "PRODUCT_NOT_FOUND",
      resolvedSnapshot: effectiveSnapshot,
      product: null,
      lookupMetrics
    });
  }

  const searchTerms = searchTermsFromProduct(product);
  if (!searchTerms.length) {
    return structuredProductContextFailure({
      sku,
      country,
      code: "PRODUCT_CONTEXT_INCOMPLETE",
      resolvedSnapshot: effectiveSnapshot,
      product,
      lookupMetrics
    });
  }

  const ownBrandNames = new Set([
    normalizeCompetitorBrandName(stringValue(product.vendor)),
    normalizeCompetitorBrandName(stringValue(product.brand))
  ].filter(Boolean));
  const scored = new Map<string, {
    brandName: string;
    adCount: number;
    matchedTerms: Set<string>;
    pageIds: Set<string>;
    longestRunningDays: number | null;
    earliestStartTime: number | null;
    countries: Map<string, number>;
  }>();

  const searchedCountries = [country];
  try {
    await searchCountry({
      scored,
      token,
      country,
      searchTerms,
      limitPerTerm: input.limitPerTerm,
      fetchImpl: input.fetchImpl,
      ownBrandNames
    });
    if (scored.size === 0) {
      for (const fallbackCountry of FALLBACK_AD_LIBRARY_COUNTRIES) {
        if (fallbackCountry === country) continue;
        searchedCountries.push(fallbackCountry);
        await searchCountry({
          scored,
          token,
          country: fallbackCountry,
          searchTerms,
          limitPerTerm: input.limitPerTerm,
          fetchImpl: input.fetchImpl,
          ownBrandNames
        });
        if (scored.size >= 3) break;
      }
    }
  } catch (error) {
    const code = publicAdLibraryErrorCode(error);
    if (code === "PUBLIC_AD_LIBRARY_AUTH_EXPIRED" || code === "PUBLIC_AD_LIBRARY_AUTH_FAILED" || code === "PUBLIC_AD_LIBRARY_RATE_LIMIT") {
      return {
        ok: false,
        sku,
        country,
        status: "UNSUPPORTED",
        code,
        missingFields: [],
        availableFields: availableContextFields(product),
        snapshotId: effectiveSnapshot.snapshotId,
        dataSourceId: effectiveSnapshot.dataSourceId,
        validationStatus: effectiveSnapshot.validationStatus,
        canReprocess: false,
        recommendedAction: publicAdLibraryUserMessage(code),
        contextSource: stringValue(product.context_source),
        lookupMetrics,
        searchTerms,
        searchedCountries,
        candidates: []
      };
    }
    throw error;
  }

  const candidates = Array.from(scored.values())
    .map((candidate) => {
      const confidence = confidenceForCandidate({
        adCount: candidate.adCount,
        matchedTermCount: candidate.matchedTerms.size,
        totalTerms: searchTerms.length,
        longestRunningDays: candidate.longestRunningDays
      });
      return {
        ...candidate,
        confidence,
        rankScore: rankScoreForCandidate({
          adCount: candidate.adCount,
          matchedTermCount: candidate.matchedTerms.size,
          longestRunningDays: candidate.longestRunningDays,
          confidence
        })
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore || left.brandName.localeCompare(right.brandName))
    .slice(0, 8)
    .map((candidate, index) => {
      const autoConfirmed = shouldAutoConfirmCandidate({
        confidence: candidate.confidence,
        adCount: candidate.adCount,
        matchedTermCount: candidate.matchedTerms.size,
        longestRunningDays: candidate.longestRunningDays,
        rankIndex: index
      });
      return {
        brandName: candidate.brandName,
        confidence: candidate.confidence,
        adCount: candidate.adCount,
        longestRunningDays: candidate.longestRunningDays,
        autoConfirmed,
        country: topCountry(candidate.countries) ?? country,
        evidence: {
          source: "META_AD_LIBRARY_KEYWORD_SEARCH",
          source_country: topCountry(candidate.countries) ?? country,
          searched_countries: searchedCountries,
          matched_terms: Array.from(candidate.matchedTerms),
          ad_count: candidate.adCount,
          longest_running_days: candidate.longestRunningDays,
          page_ids: Array.from(candidate.pageIds).slice(0, 5),
          rank_score: candidate.rankScore,
          sku_product_context: {
            sku,
            product_name: stringValue(product.product_name, product.productName, product.title),
            category: stringValue(product.category, product.category_full_name, product.productType, product.product_type),
            tags: stringArray(product.tags).slice(0, 12),
            handle: stringValue(product.handle, product.product_handle),
            own_brand: stringValue(product.vendor, product.brand),
            source: stringValue(product.context_source),
            snapshot_id: effectiveSnapshot.snapshotId
          },
          auto_confirmed: autoConfirmed,
          auto_confirm_reason: autoConfirmed
            ? "High-confidence candidate selected from SKU product context, public ad volume, matched terms, and long-running active ads."
            : null,
          auto_confirm_thresholds: {
            min_confidence: AUTO_CONFIRM_MIN_CONFIDENCE,
            min_ads: AUTO_CONFIRM_MIN_ADS,
            min_matched_terms: AUTO_CONFIRM_MIN_MATCHED_TERMS,
            min_long_running_days: AUTO_CONFIRM_MIN_LONG_RUNNING_DAYS
          },
          review_required_reason: autoConfirmed
            ? null
            : "Candidate confidence was below the auto-confirm threshold and should be reviewed before ad sync or optimization use."
        }
      };
    });

  if (candidates.length) {
    await upsertSuggestedCompetitorBrands(prisma, {
      workspaceId: input.workspaceId,
      sku,
      brands: candidates.map((candidate) => ({
        brandName: candidate.brandName,
        category: stringValue(product.category, product.category_full_name, product.product_type) || null,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        autoConfirm: candidate.autoConfirmed
      }))
    });
  }

  const autoConfirmedBrands = candidates
    .filter((candidate) => candidate.autoConfirmed)
    .reduce((groups, candidate) => {
      const key = candidate.country;
      groups.set(key, [...(groups.get(key) ?? []), candidate.brandName]);
      return groups;
    }, new Map<string, string[]>());
  const queuedSyncJobIds: string[] = [];
  for (const [syncCountry, brands] of autoConfirmedBrands.entries()) {
    const queued = await enqueueCompetitivePublicAdSyncJob(prisma, {
      workspaceId: input.workspaceId,
      sku,
      brands,
      category: stringValue(product.category, product.category_full_name, product.product_type) || null,
      country: syncCountry,
      trigger: "sku_competitor_auto_discovery",
      limitPerBrand: 75
    }).catch(() => null);
    if (queued?.job?.id) queuedSyncJobIds.push(queued.job.id);
  }

  return {
    ok: candidates.length > 0,
    sku,
    country,
    status: candidates.length ? "SUCCESS" : "NO_CANDIDATES",
    searchTerms,
    searchedCountries,
    candidates,
    snapshotId: effectiveSnapshot.snapshotId,
    dataSourceId: effectiveSnapshot.dataSourceId,
    validationStatus: effectiveSnapshot.validationStatus,
    contextSource: stringValue(product.context_source),
    lookupMetrics,
    queuedSyncJobId: queuedSyncJobIds[0] ?? null,
    queuedSyncJobIds
  };
}

async function searchCountry(input: {
  scored: Map<string, {
    brandName: string;
    adCount: number;
    matchedTerms: Set<string>;
    pageIds: Set<string>;
    longestRunningDays: number | null;
    earliestStartTime: number | null;
    countries: Map<string, number>;
  }>;
  token: string;
  country: string;
  searchTerms: string[];
  limitPerTerm?: number;
  fetchImpl?: typeof fetch;
  ownBrandNames: Set<string>;
}) {
  for (const term of input.searchTerms) {
    const records = await fetchMetaAdLibrarySearchAds({
      accessToken: input.token,
      searchTerm: term,
      country: input.country,
      limit: Math.max(5, Math.min(input.limitPerTerm ?? 20, 50)),
      fetchImpl: input.fetchImpl
    });
    for (const record of records) {
      const brandName = stringValue(record.page_name);
      const normalized = normalizeCompetitorBrandName(brandName);
      if (!brandName || !normalized || input.ownBrandNames.has(normalized)) continue;
      const current = input.scored.get(normalized) ?? {
        brandName,
        adCount: 0,
        matchedTerms: new Set<string>(),
        pageIds: new Set<string>(),
        longestRunningDays: null,
        earliestStartTime: null,
        countries: new Map<string, number>()
      };
      current.adCount += 1;
      current.matchedTerms.add(term);
      current.countries.set(input.country, (current.countries.get(input.country) ?? 0) + 1);
      if (record.page_id) current.pageIds.add(String(record.page_id));
      const startTime = dateTimeValue(record.ad_delivery_start_time ?? record.ad_creation_time);
      if (startTime) {
        current.earliestStartTime = current.earliestStartTime === null ? startTime : Math.min(current.earliestStartTime, startTime);
        const runningDays = Math.max(0, Math.floor((Date.now() - startTime) / 86_400_000));
        current.longestRunningDays = current.longestRunningDays === null ? runningDays : Math.max(current.longestRunningDays, runningDays);
      }
      input.scored.set(normalized, current);
    }
  }
}

async function loadSkuProductContext(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  sku: string;
  resolvedSnapshot: ResolvedCanonicalSnapshot;
}) {
  const indexed = await lookupProductContextIndex(prisma, {
    workspaceId: input.workspaceId,
    schemaSnapshotId: input.resolvedSnapshot.snapshotId ?? "",
    sku: input.sku
  });
  if (indexed.row) {
    return {
      product: productRecordFromIndexRow(indexed.row, "PRODUCT_CONTEXT_INDEX"),
      lookupMetrics: indexed.metrics,
      resolvedSnapshot: input.resolvedSnapshot
    };
  }

  const workspaceIndexed = await lookupWorkspaceProductContextIndex(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId ?? null,
    sku: input.sku
  });
  if (workspaceIndexed.row) {
    return {
      product: productRecordFromIndexRow(workspaceIndexed.row, "WORKSPACE_PRODUCT_CONTEXT_INDEX"),
      lookupMetrics: {
        ...indexed.metrics,
        fallback: workspaceIndexed.metrics
      },
      resolvedSnapshot: resolvedSnapshotFromWorkspaceIndex(input.resolvedSnapshot, workspaceIndexed.snapshot)
    };
  }

  const snapshot = await prisma.schemaSnapshot.findFirst({
    where: {
      id: input.resolvedSnapshot.snapshotId ?? "",
      workspaceId: input.workspaceId,
      canonicalStatus: "READY",
      canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION
    },
    select: { id: true, workspaceId: true, dataSourceId: true, schemaJson: true }
  });
  if (!snapshot) return { product: null, lookupMetrics: indexed.metrics, resolvedSnapshot: input.resolvedSnapshot };

  const startedAt = Date.now();
  const schema = objectValue(snapshot.schemaJson);
  const [products, orderItems] = await Promise.all([
    readCanonicalTableRows(schema, "ecommerce_products", 50_000),
    readCanonicalTableRows(schema, "ecommerce_order_items", 50_000)
  ]);
  const dataset: CanonicalDataset = {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: orderItems.rows,
      ecommerce_products: products.rows,
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: [],
      ecommerce_costs: []
    },
    metadata: {
      source_platforms: [],
      normalized_at: new Date().toISOString(),
      unknown_fields: [],
      validation: { accepted_rows: products.rows.length + orderItems.rows.length, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 0
    }
  };
  const indexBuild = buildProductContextIndexRows({
    workspaceId: snapshot.workspaceId,
    dataSourceId: snapshot.dataSourceId,
    schemaSnapshotId: snapshot.id,
    provider: input.resolvedSnapshot.provider,
    canonicalDataset: dataset
  });
  await replaceProductContextIndex(prisma, indexBuild.rows);
  const rebuilt = indexBuild.rows
    .filter((row) => normalizeSku(row.sku ?? "") === normalizeSku(input.sku))
    .sort((left, right) => right.contextQuality - left.contextQuality)[0] ?? null;

  return {
    product: rebuilt ? productRecordFromIndexRow(rebuilt, "CANONICAL_ARTIFACT_FALLBACK") : null,
    lookupMetrics: {
      ...indexed.metrics,
      fallback: "canonical_artifact_bounded_backfill",
      durationMs: Date.now() - startedAt,
      bytesRead: products.bytesRead + orderItems.bytesRead,
      rowsScanned: products.rows.length + orderItems.rows.length,
      indexRowsBuilt: indexBuild.rows.length
    },
    resolvedSnapshot: input.resolvedSnapshot
  };
}

function resolvedSnapshotFromWorkspaceIndex(
  fallback: ResolvedCanonicalSnapshot,
  indexedSnapshot: {
    snapshotId: string;
    dataSourceId: string | null;
    provider: string | null;
    validationStatus: string | null;
    schemaVersion: string | null;
    mappingVersion: string | null;
    sourceInferenceVersion: string | null;
    productContextIndexVersion: string | null;
    publishedAt: string | null;
  } | null
): ResolvedCanonicalSnapshot {
  if (!indexedSnapshot) return fallback;
  return {
    ...fallback,
    snapshotId: indexedSnapshot.snapshotId,
    dataSourceId: indexedSnapshot.dataSourceId,
    provider: indexedSnapshot.provider,
    schemaVersion: indexedSnapshot.schemaVersion,
    mappingVersion: indexedSnapshot.mappingVersion,
    sourceInferenceVersion: indexedSnapshot.sourceInferenceVersion,
    productContextIndexVersion: indexedSnapshot.productContextIndexVersion,
    validationStatus: indexedSnapshot.validationStatus ?? fallback.validationStatus,
    publishedAt: indexedSnapshot.publishedAt,
    dataVersion: `${indexedSnapshot.snapshotId}:${indexedSnapshot.schemaVersion ?? "unknown"}`,
    capabilities: {
      ...fallback.capabilities,
      productContextAvailable: true,
      competitiveDiscoveryAvailable: true
    },
    warnings: [...fallback.warnings, "Resolved SKU context from workspace-scoped product context index fallback."]
  };
}

function searchTermsFromProduct(product: JsonRecord) {
  const productName = cleanSearchText(stringValue(product.product_name, product.productName, product.title));
  const ownBrand = cleanSearchText(stringValue(product.brand, product.vendor));
  const asin = cleanSearchText(stringValue(product.asin));
  const category = cleanSearchText(stringValue(product.category, product.category_full_name, product.category_name, product.product_type, product.productType));
  const tags = stringArray(product.tags).map(cleanSearchText).filter(Boolean);
  const handle = cleanSearchText(stringValue(product.handle, product.product_handle).replace(/-/g, " "));
  const descriptionKeywords = safeDescriptionKeywords(stringValue(product.description, product.description_html));
  const terms = [
    [productName, ownBrand].filter(Boolean).join(" "),
    [productName, category].filter(Boolean).join(" "),
    [asin, ownBrand || productName].filter(Boolean).join(" "),
    productName,
    category,
    ...tags.slice(0, 4),
    handle,
    ...descriptionKeywords
  ].filter((term) => term.length >= 3 && !/^\d+$/.test(term));

  return Array.from(new Set(terms)).slice(0, 6);
}

function structuredProductContextFailure(input: {
  sku: string;
  country: string;
  code: "PRODUCT_NOT_FOUND" | "PRODUCT_CONTEXT_INCOMPLETE" | "SNAPSHOT_NOT_READY";
  resolvedSnapshot: ResolvedCanonicalSnapshot;
  product: JsonRecord | null;
  lookupMetrics: JsonRecord;
}): CompetitorDiscoveryResult {
  const availableFields = availableContextFields(input.product);
  const missingFields = missingContextFields(input.product);
  return {
    ok: false,
    sku: input.sku,
    country: input.country,
    status: "NO_PRODUCT_CONTEXT",
    code: input.code,
    missingFields,
    availableFields,
    snapshotId: input.resolvedSnapshot.snapshotId,
    dataSourceId: input.resolvedSnapshot.dataSourceId,
    validationStatus: input.resolvedSnapshot.validationStatus,
    canReprocess: Boolean(input.resolvedSnapshot.dataSourceId),
    recommendedAction: input.code === "SNAPSHOT_NOT_READY"
      ? "Wait for ingestion to finish or reprocess the data source."
      : input.code === "PRODUCT_NOT_FOUND"
        ? "Review field mapping or reprocess the data source with product identifiers."
        : "Reprocess data or map product_name, category, brand, tags, handle, or description fields.",
    contextSource: input.product ? stringValue(input.product.context_source) : null,
    lookupMetrics: input.lookupMetrics,
    searchTerms: [],
    candidates: []
  };
}

function productRecordFromIndexRow(row: ProductContextIndexRow, source: string): JsonRecord {
  return {
    sku: row.sku,
    product_id: row.productId,
    variant_id: row.variantId,
    asin: row.asin,
    product_name: row.productName,
    category: row.category,
    product_type: row.productType,
    brand: row.brand,
    vendor: row.vendor,
    tags: row.tags,
    handle: row.handle,
    price: row.price,
    currency: row.currency,
    context_source: source,
    source_provenance: row.sourceProvenance
  };
}

function availableContextFields(product: JsonRecord | null) {
  if (!product) return [];
  return ["sku", "product_id", "variant_id", "asin", "product_name", "category", "product_type", "brand", "vendor", "tags", "handle", "price", "currency"]
    .filter((field) => {
      const value = product[field];
      return Array.isArray(value) ? value.length > 0 : Boolean(stringValue(value));
    });
}

function missingContextFields(product: JsonRecord | null) {
  if (!product) return ["sku", "product_name", "category", "brand", "tags", "handle"];
  return ["product_name", "category", "brand", "tags", "handle"]
    .filter((field) => !availableContextFields(product).includes(field));
}

function safeDescriptionKeywords(value: string) {
  return cleanSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && token.length <= 24)
    .slice(0, 5);
}

function confidenceForCandidate(input: {
  adCount: number;
  matchedTermCount: number;
  totalTerms: number;
  longestRunningDays: number | null;
}) {
  const adScore = Math.min(0.36, input.adCount * 0.04);
  const termScore = input.totalTerms > 0 ? Math.min(0.28, (input.matchedTermCount / input.totalTerms) * 0.28) : 0;
  const longevityScore = input.longestRunningDays === null ? 0 : Math.min(0.24, input.longestRunningDays / 180 * 0.24);
  return Math.round((0.12 + adScore + termScore + longevityScore) * 100) / 100;
}

function rankScoreForCandidate(input: {
  adCount: number;
  matchedTermCount: number;
  longestRunningDays: number | null;
  confidence: number;
}) {
  return input.confidence * 100
    + Math.min(input.adCount, 25) * 2
    + input.matchedTermCount * 8
    + Math.min(input.longestRunningDays ?? 0, 180) * 0.2;
}

function shouldAutoConfirmCandidate(input: {
  confidence: number;
  adCount: number;
  matchedTermCount: number;
  longestRunningDays: number | null;
  rankIndex: number;
}) {
  if (input.rankIndex >= MAX_AUTO_CONFIRMED_COMPETITORS) return false;
  if (input.confidence < AUTO_CONFIRM_MIN_CONFIDENCE) return false;
  return input.adCount >= AUTO_CONFIRM_MIN_ADS
    || input.matchedTermCount >= AUTO_CONFIRM_MIN_MATCHED_TERMS
    || (input.longestRunningDays ?? 0) >= AUTO_CONFIRM_MIN_LONG_RUNNING_DAYS;
}

function topCountry(countries: Map<string, number>) {
  return Array.from(countries.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function dateTimeValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function cleanSearchText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizeSku(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCountry(value: string | null | undefined) {
  const country = (value || "US").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : "US";
}
