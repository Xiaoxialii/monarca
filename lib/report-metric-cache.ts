import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ReportDateRangeInput, ResolvedReportDateRange } from "@/lib/report-date-range";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "./profit/canonical-profitability-engine";

export { CANONICAL_PROFITABILITY_ENGINE_VERSION };

export const ANALYTICS_METRIC_ENGINE_VERSION = "analytics_metric_v2026_08_05_period_reconciliation";
export const CUSTOMER_ENGINE_VERSION = "customer_lifecycle_v2026_08_05_period_scoped";
export const cachedReportDateRangePresets = ["DAILY", "WEEKLY", "7D", "30D", "90D", "12M", "ALL", "CUSTOM"] as const;

export type ReportMetricCachePayload = Record<string, unknown> & {
  generatedAt?: string;
  dateRange?: {
    preset?: string;
    startDate?: string | null;
    endDate?: string | null;
    previousStartDate?: string | null;
    previousEndDate?: string | null;
    dateField?: string | null;
    generatedAt?: string;
  };
  cache?: {
    status: "hit" | "miss" | "stale";
    cacheKey: string;
    generatedAt?: string;
    staleAt?: string | null;
  };
  profitabilityEngineVersion?: string;
  metricEngineVersion?: string;
  customerEngineVersion?: string;
};

type CacheIdentityInput = {
  workspaceId: string;
  metricIds?: string[];
  dataSourceIds?: string[];
  dateField?: string | null;
  dateRange: Pick<ReportDateRangeInput, "preset" | "startDate" | "endDate" | "previousStartDate" | "previousEndDate">;
  filters?: unknown;
  sourceSnapshotVersion?: number | null;
  domain?: string | null;
  semanticSnapshotVersion?: string | null;
  semanticSchemaHash?: string | null;
  queryHash?: string | null;
  profitabilityEngineVersion?: string | null;
  metricEngineVersion?: string | null;
  customerEngineVersion?: string | null;
};

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return Number.isNaN(value) ? null : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => jsonSafe(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)])
    );
  }

  return null;
}

export function reportMetricCacheKey(input: CacheIdentityInput) {
  return stableHash({
    workspaceId: input.workspaceId,
    profitabilityEngineVersion: input.profitabilityEngineVersion ?? CANONICAL_PROFITABILITY_ENGINE_VERSION,
    metricEngineVersion: input.metricEngineVersion ?? ANALYTICS_METRIC_ENGINE_VERSION,
    customerEngineVersion: input.customerEngineVersion ?? CUSTOMER_ENGINE_VERSION,
    metricIds: [...(input.metricIds ?? [])].sort(),
    dataSourceIds: [...(input.dataSourceIds ?? [])].sort(),
    dateField: input.dateField ?? null,
    dateRangePreset: input.dateRange.preset,
    startDate: input.dateRange.startDate ?? null,
    endDate: input.dateRange.endDate ?? null,
    previousStartDate: input.dateRange.previousStartDate ?? null,
    previousEndDate: input.dateRange.previousEndDate ?? null,
    filters: input.filters ?? null,
    sourceSnapshotVersion: input.sourceSnapshotVersion ?? null,
    domain: input.domain ?? null,
    semanticSnapshotVersion: input.semanticSnapshotVersion ?? null,
    semanticSchemaHash: input.semanticSchemaHash ?? null,
    queryHash: input.queryHash ?? null
  });
}

function payloadProfitabilityEngineVersion(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return typeof record.profitabilityEngineVersion === "string" ? record.profitabilityEngineVersion : null;
}

function payloadMetricEngineVersion(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return typeof record.metricEngineVersion === "string" ? record.metricEngineVersion : null;
}

function payloadCustomerEngineVersion(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return typeof record.customerEngineVersion === "string" ? record.customerEngineVersion : null;
}

export function isCacheableReportRange(range: Pick<ReportDateRangeInput, "preset">) {
  return cachedReportDateRangePresets.includes(range.preset as typeof cachedReportDateRangePresets[number]);
}

export function reportMetricCacheTtlMs(range: Pick<ReportDateRangeInput, "preset">) {
  return range.preset === "7D" || range.preset === "30D" ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
}

export function staleAtForRange(range: Pick<ReportDateRangeInput, "preset">, now = new Date()) {
  return new Date(now.getTime() + reportMetricCacheTtlMs(range));
}

export function cacheIdentityFromPayload({
  workspaceId,
  payload,
  dateRange
}: {
  workspaceId: string;
  payload: ReportMetricCachePayload;
  dateRange: ResolvedReportDateRange;
}) {
  const metricResults = Array.isArray(payload.metricResults) ? payload.metricResults : [];
  const metricIds = metricResults.flatMap((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return typeof record.metricId === "string" ? [record.metricId] : [];
  });
  const dataSourceIds = Array.isArray(payload.dataSourceIds)
    ? payload.dataSourceIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    workspaceId,
    metricIds,
    dataSourceIds,
    dateField: payload.dateRange?.dateField ?? null,
    dateRange: {
      preset: dateRange.preset,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      previousStartDate: dateRange.previousStart ? dateRange.previousStart.toISOString().slice(0, 10) : undefined,
      previousEndDate: dateRange.previousEnd ? dateRange.previousEnd.toISOString().slice(0, 10) : undefined
    },
    domain: typeof payload.semanticContext === "object" && payload.semanticContext && !Array.isArray(payload.semanticContext)
      ? String((payload.semanticContext as Record<string, unknown>).domain ?? "")
      : null,
    semanticSnapshotVersion: typeof payload.semanticContext === "object" && payload.semanticContext && !Array.isArray(payload.semanticContext)
      ? String((payload.semanticContext as Record<string, unknown>).snapshotVersion ?? "")
      : null,
    semanticSchemaHash: typeof payload.semanticContext === "object" && payload.semanticContext && !Array.isArray(payload.semanticContext)
      ? String((payload.semanticContext as Record<string, unknown>).schemaHash ?? "")
      : null
  };
}

export async function getReportMetricCache(
  prisma: PrismaClient,
  input: CacheIdentityInput,
  now = new Date()
) {
  const cacheKey = reportMetricCacheKey(input);
  const exactCache = await prisma.reportMetricCache.findUnique({
    where: { cacheKey }
  });
  const versionMatchedCache = exactCache ?? await prisma.reportMetricCache.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dateRangePreset: input.dateRange.preset,
      startDate: input.dateRange.startDate ? new Date(input.dateRange.startDate) : null,
      endDate: input.dateRange.endDate ? new Date(input.dateRange.endDate) : null,
      filtersHash: stableHash(input.filters ?? null),
      sourceSnapshotVersion: input.sourceSnapshotVersion ?? null,
      dataSourceIds: input.dataSourceIds && input.dataSourceIds.length > 0
        ? { equals: [...input.dataSourceIds].sort() as unknown as Prisma.InputJsonValue }
        : undefined
    },
    orderBy: { generatedAt: "desc" }
  });
  const cache = versionMatchedCache;

  if (!cache) {
    return { cacheKey, payload: null, cache: null, status: "miss" as const };
  }

  const expectedProfitabilityEngineVersion = input.profitabilityEngineVersion ?? CANONICAL_PROFITABILITY_ENGINE_VERSION;
  const expectedMetricEngineVersion = input.metricEngineVersion ?? ANALYTICS_METRIC_ENGINE_VERSION;
  const expectedCustomerEngineVersion = input.customerEngineVersion ?? CUSTOMER_ENGINE_VERSION;
  if (
    payloadProfitabilityEngineVersion(cache.payloadJson) !== expectedProfitabilityEngineVersion ||
    payloadMetricEngineVersion(cache.payloadJson) !== expectedMetricEngineVersion ||
    payloadCustomerEngineVersion(cache.payloadJson) !== expectedCustomerEngineVersion
  ) {
    await prisma.reportMetricCache.update({
      where: { id: cache.id },
      data: {
        refreshStatus: "stale",
        staleAt: now,
        lastAccessedAt: now
      }
    }).catch(() => null);

    return { cacheKey, payload: null, cache, status: "miss" as const };
  }

  await prisma.reportMetricCache.update({
    where: { id: cache.id },
    data: { lastAccessedAt: now }
  }).catch(() => null);

  return {
    cacheKey: cache.cacheKey,
    cache,
    payload: cache.payloadJson as ReportMetricCachePayload,
    status: cache.staleAt && cache.staleAt.getTime() < now.getTime() ? "stale" as const : "hit" as const
  };
}

export async function upsertReportMetricCache(
  prisma: PrismaClient,
  input: CacheIdentityInput & {
    payload: ReportMetricCachePayload;
    sourceSnapshotVersion?: number | null;
  },
  now = new Date()
) {
  const cacheKey = reportMetricCacheKey(input);
  const payload = {
    ...input.payload,
    profitabilityEngineVersion: input.profitabilityEngineVersion ?? CANONICAL_PROFITABILITY_ENGINE_VERSION,
    metricEngineVersion: input.metricEngineVersion ?? ANALYTICS_METRIC_ENGINE_VERSION,
    customerEngineVersion: input.customerEngineVersion ?? CUSTOMER_ENGINE_VERSION
  };
  const data = {
    workspaceId: input.workspaceId,
    dataSourceIds: [...(input.dataSourceIds ?? [])].sort(),
    metricIds: input.metricIds ?? [],
    dateField: input.dateField ?? null,
    dateRangePreset: input.dateRange.preset,
    startDate: input.dateRange.startDate ? new Date(input.dateRange.startDate) : null,
    endDate: input.dateRange.endDate ? new Date(input.dateRange.endDate) : null,
    filtersHash: stableHash(input.filters ?? null),
    payloadJson: jsonSafe(payload) as Prisma.InputJsonValue,
    sourceSnapshotVersion: input.sourceSnapshotVersion ?? null,
    refreshStatus: "fresh",
    generatedAt: now,
    staleAt: staleAtForRange(input.dateRange, now),
    lastAccessedAt: now
  };

  return prisma.reportMetricCache.upsert({
    where: { cacheKey },
    create: { ...data, cacheKey },
    update: data
  });
}
