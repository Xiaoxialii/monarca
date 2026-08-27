import type { PrismaClient } from "@prisma/client";
import { readR2ObjectText } from "@/lib/r2-storage";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import {
  fetchMetaAdLibrarySearchAds,
  metaAdLibraryAccessToken,
  normalizeCompetitorBrandName,
  upsertSuggestedCompetitorBrands
} from "@/lib/competitive-intelligence/meta-ad-library";

type JsonRecord = Record<string, unknown>;

export type CompetitorDiscoveryResult = {
  ok: boolean;
  sku: string;
  country: string;
  status: "SUCCESS" | "UNSUPPORTED" | "NO_PRODUCT_CONTEXT" | "NO_CANDIDATES";
  code?: string;
  searchTerms: string[];
  candidates: Array<{
    brandName: string;
    confidence: number;
    adCount: number;
    evidence: JsonRecord;
  }>;
};

export async function discoverCompetitorBrandsForSku(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
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

  const product = await loadSkuProductContext(prisma, {
    workspaceId: input.workspaceId,
    sku
  });
  if (!product) {
    return {
      ok: false,
      sku,
      country,
      status: "NO_PRODUCT_CONTEXT",
      code: "SKU_PRODUCT_CONTEXT_MISSING",
      searchTerms: [],
      candidates: []
    };
  }

  const searchTerms = searchTermsFromProduct(product);
  if (!searchTerms.length) {
    return {
      ok: false,
      sku,
      country,
      status: "NO_PRODUCT_CONTEXT",
      code: "SKU_PRODUCT_CONTEXT_INSUFFICIENT",
      searchTerms: [],
      candidates: []
    };
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
  }>();

  for (const term of searchTerms) {
    const records = await fetchMetaAdLibrarySearchAds({
      accessToken: token,
      searchTerm: term,
      country,
      limit: Math.max(5, Math.min(input.limitPerTerm ?? 20, 50)),
      fetchImpl: input.fetchImpl
    });
    for (const record of records) {
      const brandName = stringValue(record.page_name);
      const normalized = normalizeCompetitorBrandName(brandName);
      if (!brandName || !normalized || ownBrandNames.has(normalized)) continue;
      const current = scored.get(normalized) ?? {
        brandName,
        adCount: 0,
        matchedTerms: new Set<string>(),
        pageIds: new Set<string>()
      };
      current.adCount += 1;
      current.matchedTerms.add(term);
      if (record.page_id) current.pageIds.add(String(record.page_id));
      scored.set(normalized, current);
    }
  }

  const candidates = Array.from(scored.values())
    .sort((left, right) => right.adCount - left.adCount || right.matchedTerms.size - left.matchedTerms.size || left.brandName.localeCompare(right.brandName))
    .slice(0, 8)
    .map((candidate) => ({
      brandName: candidate.brandName,
      confidence: confidenceForCandidate(candidate.adCount, candidate.matchedTerms.size, searchTerms.length),
      adCount: candidate.adCount,
      evidence: {
        source: "META_AD_LIBRARY_KEYWORD_SEARCH",
        matched_terms: Array.from(candidate.matchedTerms),
        ad_count: candidate.adCount,
        page_ids: Array.from(candidate.pageIds).slice(0, 5),
        sku_product_context: {
          sku,
          product_name: stringValue(product.product_name),
          category: stringValue(product.category, product.category_full_name, product.product_type),
          tags: stringArray(product.tags).slice(0, 12),
          handle: stringValue(product.handle, product.product_handle),
          own_brand: stringValue(product.vendor, product.brand)
        },
        auto_confirmed: false,
        review_required_reason: "Candidate came from public keyword search and must be confirmed before ad sync or optimization use."
      }
    }));

  if (candidates.length) {
    await upsertSuggestedCompetitorBrands(prisma, {
      workspaceId: input.workspaceId,
      sku,
      brands: candidates.map((candidate) => ({
        brandName: candidate.brandName,
        category: stringValue(product.category, product.category_full_name, product.product_type) || null,
        confidence: candidate.confidence,
        evidence: candidate.evidence
      }))
    });
  }

  return {
    ok: candidates.length > 0,
    sku,
    country,
    status: candidates.length ? "SUCCESS" : "NO_CANDIDATES",
    searchTerms,
    candidates
  };
}

async function loadSkuProductContext(prisma: PrismaClient, input: {
  workspaceId: string;
  sku: string;
}) {
  const snapshots = await prisma.schemaSnapshot.findMany({
    where: {
      workspaceId: input.workspaceId,
      canonicalStatus: "READY",
      canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
      dataSource: {
        isActive: true
      }
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { schemaJson: true }
  });

  for (const snapshot of snapshots) {
    const schema = objectValue(snapshot.schemaJson);
    const embedded = objectValue(objectValue(schema.canonicalDataset).tables);
    const embeddedRows = Array.isArray(embedded.ecommerce_products) ? embedded.ecommerce_products.map(objectValue) : [];
    const artifactRows = embeddedRows.length ? [] : await readProductArtifactRows(schema);
    const rows = embeddedRows.length ? embeddedRows : artifactRows;
    const match = rows.find((row) => normalizeSku(stringValue(row.sku)) === normalizeSku(input.sku));
    if (match) return match;
  }

  return null;
}

async function readProductArtifactRows(schema: JsonRecord) {
  const tables = Array.isArray(schema.tables) ? schema.tables : [];
  const table = tables.find((item) => objectValue(item).name === "ecommerce_products");
  const artifactKey = stringValue(objectValue(table).artifactKey);
  if (!artifactKey) return [];
  return parseJsonl(await readR2ObjectText(artifactKey).catch(() => ""));
}

function searchTermsFromProduct(product: JsonRecord) {
  const productName = cleanSearchText(stringValue(product.product_name));
  const category = cleanSearchText(stringValue(product.category, product.category_full_name, product.category_name, product.product_type));
  const tags = stringArray(product.tags).map(cleanSearchText).filter(Boolean);
  const handle = cleanSearchText(stringValue(product.handle, product.product_handle).replace(/-/g, " "));
  const terms = [
    [productName, category].filter(Boolean).join(" "),
    productName,
    category,
    ...tags.slice(0, 4),
    handle
  ].filter((term) => term.length >= 3 && !/^\d+$/.test(term));

  return Array.from(new Set(terms)).slice(0, 6);
}

function confidenceForCandidate(adCount: number, matchedTermCount: number, totalTerms: number) {
  const adScore = Math.min(0.45, adCount * 0.05);
  const termScore = totalTerms > 0 ? Math.min(0.35, (matchedTermCount / totalTerms) * 0.35) : 0;
  return Math.round((0.2 + adScore + termScore) * 100) / 100;
}

function cleanSearchText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function parseJsonl(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
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
