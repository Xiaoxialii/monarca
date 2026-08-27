import type { PrismaClient } from "@prisma/client";
import { readR2ObjectText } from "@/lib/r2-storage";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";
import {
  enqueueCompetitivePublicAdSyncJob,
  fetchMetaAdLibrarySearchAds,
  metaAdLibraryAccessToken,
  normalizeCompetitorBrandName,
  upsertSuggestedCompetitorBrands
} from "@/lib/competitive-intelligence/meta-ad-library";

const AUTO_CONFIRM_MIN_CONFIDENCE = 0.72;
const AUTO_CONFIRM_MIN_ADS = 6;
const AUTO_CONFIRM_MIN_MATCHED_TERMS = 2;
const AUTO_CONFIRM_MIN_LONG_RUNNING_DAYS = 45;
const MAX_AUTO_CONFIRMED_COMPETITORS = 5;

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
    longestRunningDays: number | null;
    autoConfirmed: boolean;
    evidence: JsonRecord;
  }>;
  queuedSyncJobId?: string | null;
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
    longestRunningDays: number | null;
    earliestStartTime: number | null;
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
        pageIds: new Set<string>(),
        longestRunningDays: null,
        earliestStartTime: null
      };
      current.adCount += 1;
      current.matchedTerms.add(term);
      if (record.page_id) current.pageIds.add(String(record.page_id));
      const startTime = dateTimeValue(record.ad_delivery_start_time ?? record.ad_creation_time);
      if (startTime) {
        current.earliestStartTime = current.earliestStartTime === null ? startTime : Math.min(current.earliestStartTime, startTime);
        const runningDays = Math.max(0, Math.floor((Date.now() - startTime) / 86_400_000));
        current.longestRunningDays = current.longestRunningDays === null ? runningDays : Math.max(current.longestRunningDays, runningDays);
      }
      scored.set(normalized, current);
    }
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
        evidence: {
          source: "META_AD_LIBRARY_KEYWORD_SEARCH",
          matched_terms: Array.from(candidate.matchedTerms),
          ad_count: candidate.adCount,
          longest_running_days: candidate.longestRunningDays,
          page_ids: Array.from(candidate.pageIds).slice(0, 5),
          rank_score: candidate.rankScore,
          sku_product_context: {
            sku,
            product_name: stringValue(product.product_name),
            category: stringValue(product.category, product.category_full_name, product.product_type),
            tags: stringArray(product.tags).slice(0, 12),
            handle: stringValue(product.handle, product.product_handle),
            own_brand: stringValue(product.vendor, product.brand)
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
    .map((candidate) => candidate.brandName);
  const queued = autoConfirmedBrands.length
    ? await enqueueCompetitivePublicAdSyncJob(prisma, {
      workspaceId: input.workspaceId,
      sku,
      brands: autoConfirmedBrands,
      category: stringValue(product.category, product.category_full_name, product.product_type) || null,
      country,
      trigger: "sku_competitor_auto_discovery",
      limitPerBrand: 75
    }).catch(() => null)
    : null;

  return {
    ok: candidates.length > 0,
    sku,
    country,
    status: candidates.length ? "SUCCESS" : "NO_CANDIDATES",
    searchTerms,
    candidates,
    queuedSyncJobId: queued?.job?.id ?? null
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
