import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

const META_GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_META_AD_LIBRARY_API_VERSION = "v20.0";
const DEFAULT_COUNTRY = "US";
const DEFAULT_LIMIT_PER_BRAND = 25;
const META_AD_LIBRARY_PAGE_LIMIT = 100;
const META_AD_LIBRARY_MAX_RETRIES = 3;
const ACTIVE_SYNC_STATUSES = ["QUEUED", "PROCESSING", "PAUSED"] as const;

type JsonRecord = Record<string, unknown>;

export type MetaAdLibraryRecord = {
  ad_archive_id?: string;
  id?: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_snapshot_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  [key: string]: unknown;
};

type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

export type CompetitivePublicAdSyncInput = {
  workspaceId: string;
  sku: string;
  brands?: string[];
  country?: string;
  category?: string | null;
  trigger?: string;
  limitPerBrand?: number;
  fetchImpl?: typeof fetch;
};

export function normalizeCompetitorBrandName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function extractMetaAdLibraryRecords(payload: unknown): MetaAdLibraryRecord[] {
  const record = asRecord(payload);
  const rows = Array.isArray(record.data) ? record.data : [];
  return rows.filter((item): item is MetaAdLibraryRecord => Boolean(asRecord(item).ad_archive_id ?? asRecord(item).id));
}

export function normalizeMetaAdLibraryAd(input: {
  workspaceId: string;
  sku: string;
  brandId?: string | null;
  brandName: string;
  country: string;
  record: MetaAdLibraryRecord;
}) {
  const sourceAdArchiveId = stringValue(input.record.ad_archive_id) || stringValue(input.record.id);
  if (!sourceAdArchiveId) return null;

  const creativeBodies = stringArray(input.record.ad_creative_bodies);
  const creativeTitles = stringArray(input.record.ad_creative_link_titles);
  const creativeDescriptions = [
    ...stringArray(input.record.ad_creative_link_descriptions),
    ...stringArray(input.record.ad_creative_link_captions)
  ];
  const publisherPlatforms = stringArray(input.record.publisher_platforms);
  const displayFormat = inferDisplayFormat({ publisherPlatforms, creativeBodies, creativeTitles });
  const rawPayloadHash = sha256(JSON.stringify(input.record));

  return {
    workspaceId: input.workspaceId,
    provider: "META_AD_LIBRARY" as const,
    sku: input.sku,
    brandId: input.brandId ?? null,
    brandName: input.brandName,
    normalizedBrandName: normalizeCompetitorBrandName(input.brandName),
    country: input.country,
    sourceAdArchiveId,
    pageId: stringValue(input.record.page_id) || null,
    pageName: stringValue(input.record.page_name) || null,
    adSnapshotUrl: stringValue(input.record.ad_snapshot_url) || null,
    startDate: dateValue(input.record.ad_delivery_start_time ?? input.record.ad_creation_time),
    endDate: dateValue(input.record.ad_delivery_stop_time),
    isActive: !stringValue(input.record.ad_delivery_stop_time),
    publisherPlatforms,
    displayFormat,
    creativeBodies,
    creativeTitles,
    creativeDescriptions,
    ctaText: null,
    landingUrls: [],
    assetUrls: [],
    rawPayloadHash,
    metadataJson: {
      source_metric_scope: "PUBLIC_AD_LIBRARY",
      public_source: "Meta Ad Library API",
      performance_available: false,
      performance_note: "Meta Ad Library does not expose spend, purchases, or profit metrics for ordinary public competitor ads.",
      ad_creation_time: stringValue(input.record.ad_creation_time) || null
    }
  };
}

export async function enqueueCompetitivePublicAdSyncJob(
  prisma: PrismaClient,
  input: Omit<CompetitivePublicAdSyncInput, "fetchImpl">
) {
  const sku = normalizeSku(input.sku);
  const country = normalizeCountry(input.country);
  const brands = normalizeBrands(input.brands ?? []);
  if (!sku) throw new Error("SKU_REQUIRED");
  if (!brands.length) throw new Error("COMPETITOR_BRANDS_REQUIRED");

  const identity = `public-competitor-ads:${sku}:${country}:${sha256(brands.join("|")).slice(0, 16)}`;
  const existing = await prisma.asyncJob.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: "PUBLIC_COMPETITOR_AD_SYNC",
      identity,
      status: { in: [...ACTIVE_SYNC_STATUSES] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return { job: existing, created: false };

  const syncRun = await prisma.competitivePublicAdSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      provider: "META_AD_LIBRARY",
      sku,
      country,
      status: "QUEUED",
      trigger: input.trigger ?? "manual",
      requestedBrands: brands
    }
  });

  const job = await prisma.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "PUBLIC_COMPETITOR_AD_SYNC",
      identity,
      status: "QUEUED",
      progress: 0,
      currentStep: "Queued public competitor ad sync",
      maxRetries: 2,
      payload: {
        sku,
        country,
        brands,
        category: input.category ?? null,
        trigger: input.trigger ?? "manual",
        limitPerBrand: input.limitPerBrand ?? DEFAULT_LIMIT_PER_BRAND,
        syncRunId: syncRun.id
      } as Prisma.InputJsonValue
    }
  });

  return { job, syncRun, created: true };
}

export async function upsertUserConfirmedCompetitorBrands(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
    brands: string[];
    category?: string | null;
    confirmedBy?: string | null;
  }
) {
  const sku = normalizeSku(input.sku);
  const brands = normalizeBrands(input.brands);
  if (!sku) throw new Error("SKU_REQUIRED");
  if (!brands.length) throw new Error("COMPETITOR_BRANDS_REQUIRED");

  const rows = [];
  for (const brandName of brands) {
    rows.push(await upsertConfirmedCompetitorBrand(prisma, {
      workspaceId: input.workspaceId,
      sku,
      brandName,
      category: input.category ?? null,
      confirmedBy: input.confirmedBy ?? null
    }));
  }
  return rows;
}

export async function getConfirmedCompetitorBrands(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
  }
) {
  const sku = normalizeSku(input.sku);
  if (!sku) return [];
  const rows = await prisma.competitiveSkuBrand.findMany({
    where: {
      workspaceId: input.workspaceId,
      sku,
      status: "USER_CONFIRMED",
      validTo: null
    },
    orderBy: { updatedAt: "desc" },
    select: { brandName: true }
  });
  return rows.map((row) => row.brandName);
}

export async function runCompetitivePublicAdSync(
  prisma: PrismaClient,
  input: CompetitivePublicAdSyncInput & { syncRunId?: string | null }
) {
  const sku = normalizeSku(input.sku);
  const country = normalizeCountry(input.country);
  const brands = normalizeBrands(input.brands ?? []);
  const startedAt = new Date();
  if (!sku) throw new Error("SKU_REQUIRED");
  if (!brands.length) throw new Error("COMPETITOR_BRANDS_REQUIRED");

  const syncRun = input.syncRunId
    ? await prisma.competitivePublicAdSyncRun.update({
        where: { id: input.syncRunId },
        data: { status: "RUNNING", startedAt, errorCode: null, errorMessage: null }
      })
    : await prisma.competitivePublicAdSyncRun.create({
        data: {
          workspaceId: input.workspaceId,
          provider: "META_AD_LIBRARY",
          sku,
          country,
          status: "RUNNING",
          trigger: input.trigger ?? "manual",
          requestedBrands: brands,
          startedAt
        }
      });

  const token = metaAdLibraryAccessToken();
  if (!token) {
    await prisma.competitivePublicAdSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "UNSUPPORTED",
        errorCode: "PUBLIC_AD_LIBRARY_TOKEN_MISSING",
        errorMessage: "Configure META_AD_LIBRARY_ACCESS_TOKEN to sync public Meta Ad Library data.",
        finishedAt: new Date()
      }
    });
    return {
      ok: false,
      status: "UNSUPPORTED" as const,
      code: "PUBLIC_AD_LIBRARY_TOKEN_MISSING",
      syncRunId: syncRun.id,
      rowCount: 0
    };
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const limitPerBrand = clampInt(input.limitPerBrand, 1, 100, DEFAULT_LIMIT_PER_BRAND);
    let rowCount = 0;

    for (const brandName of brands) {
      const brand = await upsertConfirmedCompetitorBrand(prisma, {
        workspaceId: input.workspaceId,
        sku,
        brandName,
        category: input.category ?? null
      });

      const records = await fetchMetaAdLibraryBrandAds({
        accessToken: token,
        brandName,
        country,
        limit: limitPerBrand,
        fetchImpl
      });

      for (const record of records) {
        const normalized = normalizeMetaAdLibraryAd({
          workspaceId: input.workspaceId,
          sku,
          brandId: brand.id,
          brandName,
          country,
          record
        });
        if (!normalized) continue;

        await prisma.competitivePublicAd.upsert({
          where: {
            workspaceId_provider_country_normalizedBrandName_sourceAdArchiveId: {
              workspaceId: input.workspaceId,
              provider: normalized.provider,
              country: normalized.country,
              normalizedBrandName: normalized.normalizedBrandName,
              sourceAdArchiveId: normalized.sourceAdArchiveId
            }
          },
          create: {
            ...normalized,
            publisherPlatforms: normalized.publisherPlatforms,
            creativeBodies: normalized.creativeBodies,
            creativeTitles: normalized.creativeTitles,
            creativeDescriptions: normalized.creativeDescriptions,
            landingUrls: normalized.landingUrls,
            assetUrls: normalized.assetUrls,
            metadataJson: normalized.metadataJson
          },
          update: {
            brandId: normalized.brandId,
            sku: normalized.sku,
            brandName: normalized.brandName,
            pageId: normalized.pageId,
            pageName: normalized.pageName,
            adSnapshotUrl: normalized.adSnapshotUrl,
            startDate: normalized.startDate,
            endDate: normalized.endDate,
            isActive: normalized.isActive,
            publisherPlatforms: normalized.publisherPlatforms,
            displayFormat: normalized.displayFormat,
            creativeBodies: normalized.creativeBodies,
            creativeTitles: normalized.creativeTitles,
            creativeDescriptions: normalized.creativeDescriptions,
            ctaText: normalized.ctaText,
            landingUrls: normalized.landingUrls,
            assetUrls: normalized.assetUrls,
            rawPayloadHash: normalized.rawPayloadHash,
            metadataJson: normalized.metadataJson,
            lastSeenAt: new Date()
          }
        });
        rowCount += 1;
      }
    }

    await prisma.competitivePublicAdSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        rowCount,
        finishedAt: new Date()
      }
    });

    return {
      ok: true,
      status: "SUCCESS" as const,
      syncRunId: syncRun.id,
      rowCount,
      brands
    };
  } catch (error) {
    await prisma.competitivePublicAdSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorCode: publicAdLibraryErrorCode(error),
        errorMessage: error instanceof Error ? error.message : "Public competitor ad sync failed.",
        finishedAt: new Date()
      }
    }).catch(() => undefined);
    throw error;
  }
}

export async function fetchMetaAdLibraryBrandAds(input: {
  accessToken: string;
  brandName: string;
  country: string;
  limit: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiVersion = process.env.META_AD_LIBRARY_API_VERSION || process.env.META_MARKETING_API_VERSION || DEFAULT_META_AD_LIBRARY_API_VERSION;
  const url = new URL(`${META_GRAPH_BASE}/${apiVersion}/ads_archive`);
  url.searchParams.set("access_token", input.accessToken);
  url.searchParams.set("search_terms", input.brandName);
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("ad_reached_countries", JSON.stringify([input.country]));
  url.searchParams.set("limit", String(Math.min(input.limit, META_AD_LIBRARY_PAGE_LIMIT)));
  url.searchParams.set("fields", [
    "ad_archive_id",
    "ad_creation_time",
    "ad_delivery_start_time",
    "ad_delivery_stop_time",
    "ad_creative_bodies",
    "ad_creative_link_titles",
    "ad_creative_link_descriptions",
    "ad_creative_link_captions",
    "ad_snapshot_url",
    "page_id",
    "page_name",
    "publisher_platforms"
  ].join(","));

  const records: MetaAdLibraryRecord[] = [];
  const seen = new Set<string>();
  let nextUrl: string | null = url.toString();
  while (nextUrl && records.length < input.limit) {
    const payload = await fetchMetaAdLibraryPage(fetchImpl, nextUrl);
    for (const record of payload.data ?? []) {
      const id = stringValue(record.ad_archive_id) || stringValue(record.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push(record);
      if (records.length >= input.limit) break;
    }
    nextUrl = payload.paging?.next && records.length < input.limit ? payload.paging.next : null;
  }
  return records;
}

export async function fetchMetaAdLibrarySearchAds(input: {
  accessToken: string;
  searchTerm: string;
  country: string;
  limit: number;
  fetchImpl?: typeof fetch;
}) {
  return fetchMetaAdLibraryBrandAds({
    accessToken: input.accessToken,
    brandName: input.searchTerm,
    country: input.country,
    limit: input.limit,
    fetchImpl: input.fetchImpl
  });
}

export async function upsertSuggestedCompetitorBrands(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
    brands: Array<{
      brandName: string;
      category?: string | null;
      confidence: number;
      evidence: JsonRecord;
    }>;
  }
) {
  const sku = normalizeSku(input.sku);
  if (!sku) throw new Error("SKU_REQUIRED");

  const rows = [];
  for (const brand of input.brands) {
    const brandName = brand.brandName.trim();
    if (!brandName) continue;
    const normalizedBrandName = normalizeCompetitorBrandName(brandName);
    const existing = await prisma.competitiveSkuBrand.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sku,
        normalizedBrandName,
        validTo: null
      }
    });

    if (existing?.status === "USER_CONFIRMED" || existing?.status === "REJECTED") {
      rows.push(existing);
      continue;
    }

    if (existing) {
      rows.push(await prisma.competitiveSkuBrand.update({
        where: { id: existing.id },
        data: {
          brandName,
          category: brand.category ?? existing.category,
          status: "NEEDS_REVIEW",
          source: "META_AD_LIBRARY_KEYWORD_SEARCH",
          confidence: brand.confidence,
          evidenceJson: brand.evidence as Prisma.InputJsonValue
        }
      }));
      continue;
    }

    rows.push(await prisma.competitiveSkuBrand.create({
      data: {
        workspaceId: input.workspaceId,
        sku,
        brandName,
        normalizedBrandName,
        category: brand.category ?? null,
        status: "NEEDS_REVIEW",
        source: "META_AD_LIBRARY_KEYWORD_SEARCH",
        confidence: brand.confidence,
        evidenceJson: brand.evidence as Prisma.InputJsonValue
      }
    }));
  }

  return rows;
}

export function metaAdLibraryAccessToken() {
  return process.env.META_AD_LIBRARY_ACCESS_TOKEN
    || process.env.META_SYSTEM_USER_ACCESS_TOKEN
    || process.env.META_ACCESS_TOKEN
    || null;
}

function normalizeSku(value: string) {
  return value.trim();
}

function normalizeCountry(value: string | undefined) {
  const country = (value || DEFAULT_COUNTRY).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : DEFAULT_COUNTRY;
}

function normalizeBrands(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 10);
}

function inferDisplayFormat(input: { publisherPlatforms: string[]; creativeBodies: string[]; creativeTitles: string[] }) {
  if (input.publisherPlatforms.some((platform) => /instagram|facebook/i.test(platform))) return "SOCIAL_AD";
  if (input.creativeBodies.length > 1 || input.creativeTitles.length > 1) return "MULTI_TEXT";
  return "UNKNOWN";
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function publicAdLibraryErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/token|OAuth|permission|access/i.test(message)) return "PUBLIC_AD_LIBRARY_AUTH_FAILED";
  if (/rate|429/i.test(message)) return "PUBLIC_AD_LIBRARY_RATE_LIMIT";
  return "PUBLIC_AD_LIBRARY_SYNC_FAILED";
}

function metaAdLibraryErrorMessage(payload: MetaPage<MetaAdLibraryRecord> | null, status: number) {
  const message = payload?.error?.message || `Meta Ad Library API request failed with status ${status}.`;
  const code = payload?.error?.code ? ` code=${payload.error.code}` : "";
  return `META_AD_LIBRARY_API_ERROR:${code} ${message}`;
}

async function fetchMetaAdLibraryPage(fetchImpl: typeof fetch, url: string) {
  let lastPayload: MetaPage<MetaAdLibraryRecord> | null = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt < META_AD_LIBRARY_MAX_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, { method: "GET" });
    const payload = await response.json().catch(() => null) as MetaPage<MetaAdLibraryRecord> | null;
    if (response.ok) return payload ?? {};
    lastPayload = payload;
    lastStatus = response.status;
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await sleep(250 * 2 ** attempt);
  }
  throw new Error(metaAdLibraryErrorMessage(lastPayload, lastStatus));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertConfirmedCompetitorBrand(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
    brandName: string;
    category: string | null;
    confirmedBy?: string | null;
  }
) {
  const normalizedBrandName = normalizeCompetitorBrandName(input.brandName);
  const existing = await prisma.competitiveSkuBrand.findFirst({
    where: {
      workspaceId: input.workspaceId,
      sku: input.sku,
      normalizedBrandName,
      validTo: null
    }
  });

  if (existing) {
    return prisma.competitiveSkuBrand.update({
      where: { id: existing.id },
      data: {
        brandName: input.brandName,
        category: input.category ?? undefined,
        status: "USER_CONFIRMED",
        source: "USER_CONFIRMED",
        confidence: 1,
        confirmedBy: input.confirmedBy ?? existing.confirmedBy,
        confirmedAt: new Date()
      }
    });
  }

  return prisma.competitiveSkuBrand.create({
    data: {
      workspaceId: input.workspaceId,
      sku: input.sku,
      brandName: input.brandName,
      normalizedBrandName,
      category: input.category,
      status: "USER_CONFIRMED",
      source: "USER_CONFIRMED",
      confidence: 1,
      confirmedBy: input.confirmedBy ?? null,
      confirmedAt: new Date()
    }
  });
}
