import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAggregationResults } from "@/lib/analytics/aggregation-engine";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { apiErrorResponse } from "@/lib/api-errors";
import { computeMetricResultsForContexts } from "@/lib/metric-results";
import { isBusinessFacingMetricDefinition, isBusinessFacingMetricText } from "@/lib/metric-visibility";
import { getReportEntitlementState } from "@/lib/report-entitlements";
import { buildStructuredAiReport } from "@/lib/report-generation/report-section-builder";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { dateRangeFromSearchParams, resolveReportDateRange } from "@/lib/report-date-range";
import { buildReportTimeArtifacts } from "@/lib/report-time-artifacts.mjs";
import {
  cacheIdentityFromPayload,
  getReportMetricCache,
  reportMetricCacheKey,
  type ReportMetricCachePayload,
  upsertReportMetricCache
} from "@/lib/report-metric-cache";
import { tablesFromSchemaJson, validationFromLineage } from "@/lib/metric-validation";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function analysisReportFromSnapshot(snapshot: { schemaJson: unknown; qualityReport: unknown } | null) {
  if (!snapshot) {
    return null;
  }

  return asRecord(snapshot.qualityReport).analysisReport ?? asRecord(snapshot.schemaJson).analysisReport ?? null;
}

function briefingLocale(
  briefing: Awaited<ReturnType<typeof prisma.dailyBriefing.findFirst>>
) {
  if (!briefing) {
    return null;
  }

  const payloadJson = asRecord(briefing.payloadJson);
  const locale = payloadJson.locale;

  return locale === "zh" || locale === "en" ? locale : null;
}

function filterBriefingMetricResults<T extends { payloadJson?: unknown } | null>(
  briefing: T,
  visibleMetricIds: Set<string>,
  visibleMetricsById: Map<string, {
    id: string;
    name: string;
    formula: string;
    status: string;
    maintainerRole: string;
    mappingJson: unknown;
  }>
) {
  if (!briefing) {
    return null;
  }

  const payloadJson = asRecord(briefing.payloadJson);
  const metricResults = Array.isArray(payloadJson.metricResults) ? payloadJson.metricResults : null;

  if (!metricResults) {
    return briefing;
  }

  return {
    ...briefing,
    payloadJson: {
      ...payloadJson,
      metricResults: metricResults.filter((result) => {
        const record = asRecord(result);
        const metricId = typeof record.metricId === "string" ? record.metricId : "";
        const metric = visibleMetricsById.get(metricId);

        return Boolean(
          metricId &&
          visibleMetricIds.has(metricId) &&
          isBusinessFacingMetricText([
            typeof record.metricName === "string" ? record.metricName : undefined,
            typeof record.displayName === "string" ? record.displayName : undefined,
            typeof record.formula === "string" ? record.formula : undefined,
            typeof record.metricCategory === "string" ? record.metricCategory : undefined,
            typeof record.sourceDataset === "string" ? record.sourceDataset : undefined
          ]) &&
          (!metric || isBusinessFacingMetricDefinition(metric))
        );
      })
    }
  } as T;
}

function uniqueTables(tables: ReturnType<typeof tablesFromSchemaJson>) {
  const seen = new Set<string>();

  return tables.filter((table) => {
    const key = `${table.schema ?? ""}.${table.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function activeTableLabels(tables: Array<{ name: string; schema?: string | null }>) {
  return new Set(tables.flatMap((table) => {
    const labels = [table.name];
    if (table.schema) labels.push(`${table.schema}.${table.name}`);
    return labels;
  }));
}

function metricBelongsToTables(metric: { formula: string }, tableLabels: Set<string>) {
  const text = metric.formula.toLowerCase();
  return Array.from(tableLabels).some((label) => text.includes(label.toLowerCase()));
}

async function latestWorkspaceSnapshotVersion(workspaceId: string) {
  const snapshot = await prisma.schemaSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { version: true }
  });

  return snapshot?.version ?? null;
}

async function refreshReportMetricCache({
  workspaceId,
  locale,
  dateRange,
  sourceSnapshotVersion
}: {
  workspaceId: string;
  locale: "zh" | "en";
  dateRange: ReturnType<typeof resolveReportDateRange>;
  sourceSnapshotVersion?: number | null;
}) {
  const payload = await buildDateRangedReportPayload({ workspaceId, locale, dateRange });

  if (!payload) return null;

  const identity = cacheIdentityFromPayload({
    workspaceId,
    payload,
    dateRange
  });

  await upsertReportMetricCache(prisma, {
    ...identity,
    payload,
    sourceSnapshotVersion
  });

  return payload;
}

function withCacheMeta(payload: ReportMetricCachePayload, status: "hit" | "miss" | "stale", cacheKey: string) {
  return {
    ...payload,
    cache: {
      status,
      cacheKey,
      generatedAt: payload.generatedAt,
      staleAt: null
    }
  };
}

function prewarmCommonReportMetricCaches({
  workspaceId,
  locale,
  activePreset,
  sourceSnapshotVersion
}: {
  workspaceId: string;
  locale: "zh" | "en";
  activePreset: string;
  sourceSnapshotVersion?: number | null;
}) {
  void workspaceId;
  void locale;
  void activePreset;
  void sourceSnapshotVersion;
}

async function buildDateRangedReportPayload({
  workspaceId,
  locale,
  dateRange
}: {
  workspaceId: string;
  locale: "zh" | "en";
  dateRange: ReturnType<typeof resolveReportDateRange>;
}) {
  const dataSources = await prisma.dataSourceConnection.findMany({
    where: { workspaceId, isActive: true, status: "CONNECTED" },
    orderBy: { updatedAt: "desc" }
  });

  const snapshots = await prisma.schemaSnapshot.findMany({
    where: {
      workspaceId,
      dataSourceId: { in: dataSources.map((source) => source.id) }
    },
    orderBy: { createdAt: "desc" }
  });
  const snapshotBySource = new Map<string, typeof snapshots[number]>();
  for (const snapshot of snapshots) {
    if (snapshot.dataSourceId && !snapshotBySource.has(snapshot.dataSourceId)) {
      snapshotBySource.set(snapshot.dataSourceId, snapshot);
    }
  }

  const contexts = dataSources.flatMap((dataSource) => {
    const snapshot = snapshotBySource.get(dataSource.id);
    return snapshot ? [{ dataSource, tables: tablesFromSchemaJson(snapshot.schemaJson), schemaJson: snapshot.schemaJson }] : [];
  });

  if (contexts.length === 0) return null;

  const tables = uniqueTables(contexts.flatMap((context) => context.tables));
  const semanticLayer = buildSemanticLayer(tables.map((table) => ({
    name: table.name,
    schema: table.schema ?? undefined,
    columns: table.columns.map((column) => ({
      name: column.name,
      type: column.type ?? "unknown",
      nullable: column.nullable ?? true
    }))
  })));
  const labels = activeTableLabels(tables);
  const metrics = await prisma.metricDefinition.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "asc" }
  });
  const executableMetrics = metrics
    .filter((metric) => metricBelongsToTables(metric, labels))
    .filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );

  const metricResults = await computeMetricResultsForContexts({ contexts, metrics: executableMetrics, dateRange });
  const aggregationResults = await buildAggregationResults({ contexts, metricResults, dateRange });
  const timeArtifacts = buildReportTimeArtifacts(aggregationResults, dateRange, locale);
  const structuredReport = buildStructuredAiReport({
    dataSourceCount: dataSources.length,
    metricResults,
    metrics: executableMetrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      category: metric.category,
      definition: metric.definition,
      formula: metric.formula,
      unit: metric.unit,
      mappingJson: metric.mappingJson,
      lineageJson: metric.lineageJson
    })),
    aggregationResults,
    locale
  });

  return {
    generatedAt: new Date().toISOString(),
    locale,
    dataSourceIds: dataSources.map((source) => source.id),
    dataSourceName: dataSources.map((source) => source.name).join(locale === "zh" ? "、" : ", "),
    dateRange: {
      preset: dateRange.preset,
      startDate: dateRange.startDate ?? null,
      endDate: dateRange.endDate ?? null,
      dateField: timeArtifacts.timeConfig.defaultTimeField ?? null,
      generatedAt: new Date().toISOString()
    },
    semanticLayer,
    metricResults,
    aggregationResults,
    timeConfig: timeArtifacts.timeConfig,
    trendMetrics: timeArtifacts.trendMetrics,
    trendCharts: timeArtifacts.trendCharts,
    structuredReport
  };
}

export async function GET(request: Request) {
  try {
    const session = await syncCurrentClerkUser();

    if (!session) {
      return NextResponse.json({ hasData: false, briefing: null, insights: [], recommendations: [] }, { status: 401 });
    }

    const url = new URL(request.url);
    const resolvedDateRange = resolveReportDateRange(dateRangeFromSearchParams(url.searchParams));
    const sourceSnapshotVersion = await latestWorkspaceSnapshotVersion(session.workspace.id);
    const briefing = await prisma.dailyBriefing.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        briefingDate: "desc"
      },
      include: {
        insights: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            recommendations: {
              orderBy: {
                createdAt: "desc"
              }
            }
          }
        }
      }
    });
    const selectedBriefing = briefing;

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        schemaJson: true,
        qualityReport: true
      }
    });
    const metrics = await prisma.metricDefinition.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        formula: true,
        status: true,
        maintainerRole: true,
        mappingJson: true
      }
    });
    const businessMetrics = metrics.filter((metric) => isBusinessFacingMetricDefinition(metric));
    const visibleMetricIds = new Set(businessMetrics.map((metric) => metric.id));
    const visibleMetricsById = new Map(businessMetrics.map((metric) => [metric.id, metric]));
    const locale = session.user.locale === "zh" ? "zh" : "en";
    const cacheProbeKey = reportMetricCacheKey({
      workspaceId: session.workspace.id,
      dateRange: {
        preset: resolvedDateRange.preset,
        startDate: resolvedDateRange.startDate,
        endDate: resolvedDateRange.endDate
      }
    });
    const cacheResult = await getReportMetricCache(prisma, {
      workspaceId: session.workspace.id,
      dateRange: {
        preset: resolvedDateRange.preset,
        startDate: resolvedDateRange.startDate,
        endDate: resolvedDateRange.endDate
      }
    });
    let rangedPayload: ReportMetricCachePayload | null = cacheResult.payload;

    if (rangedPayload && cacheResult.status === "stale") {
      void refreshReportMetricCache({
        workspaceId: session.workspace.id,
        locale,
        dateRange: resolvedDateRange,
        sourceSnapshotVersion
      }).catch(() => null);
      prewarmCommonReportMetricCaches({
        workspaceId: session.workspace.id,
        locale,
        activePreset: resolvedDateRange.preset,
        sourceSnapshotVersion
      });
      rangedPayload = withCacheMeta(rangedPayload, "stale", cacheResult.cacheKey);
    } else if (rangedPayload) {
      rangedPayload = withCacheMeta(rangedPayload, "hit", cacheResult.cacheKey);
    } else {
      const freshPayload = await refreshReportMetricCache({
        workspaceId: session.workspace.id,
        locale,
        dateRange: resolvedDateRange,
        sourceSnapshotVersion
      });
      rangedPayload = freshPayload ? withCacheMeta(freshPayload, "miss", cacheProbeKey) : null;
      prewarmCommonReportMetricCaches({
        workspaceId: session.workspace.id,
        locale,
        activePreset: resolvedDateRange.preset,
        sourceSnapshotVersion
      });
    }
    const rangedBriefing = rangedPayload && selectedBriefing
      ? {
          ...selectedBriefing,
          payloadJson: {
            ...asRecord(selectedBriefing.payloadJson),
            ...rangedPayload
          }
        }
      : selectedBriefing;
    const visibleBriefing = filterBriefingMetricResults(rangedBriefing, visibleMetricIds, visibleMetricsById);
    const insights = selectedBriefing?.insights ?? [];
    const recommendations = insights.flatMap((insight) => insight.recommendations);
    const reportEntitlement = await getReportEntitlementState(session.workspace.id);

    return NextResponse.json({
      workspaceId: session.workspace.id,
      hasData: Boolean(selectedBriefing || insights.length || recommendations.length),
      briefing: visibleBriefing,
      insights,
      recommendations,
      requestedLocale: session.user.locale === "zh" ? "zh" : "en",
      reportLocale: briefingLocale(selectedBriefing),
      usedLocaleFallback: false,
      reportEntitlement,
      analysisReport: analysisReportFromSnapshot(latestSnapshot)
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load report data");
  }
}
