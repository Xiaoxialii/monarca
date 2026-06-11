import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAggregationResults } from "@/lib/analytics/aggregation-engine";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { apiErrorResponse } from "@/lib/api-errors";
import { isBusinessFacingMetricDefinition, isBusinessFacingMetricText } from "@/lib/metric-visibility";
import { getReportEntitlementState } from "@/lib/report-entitlements";
import { buildStructuredAiReport } from "@/lib/report-generation/report-section-builder";
import { buildReportDataAudit } from "@/lib/report-data-audit";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { dateRangeFromSearchParams, resolveReportDateRange, type DateRangePreset } from "@/lib/report-date-range";
import { buildReportTimeArtifacts } from "@/lib/report-time-artifacts.mjs";
import {
  composeReport,
  loadMetricSnapshots,
  normalizeReportMode,
  type ReportMode
} from "@/lib/report-composers";
import { calculateVerifiedMetrics } from "@/lib/metrics/metric-calculator";
import { reportMetricTimeWindow } from "@/lib/metrics/time-window-builder";
import { validateMetricConsistency } from "@/lib/metrics/metric-consistency-validator";
import { registryFromMetricDefinitions } from "@/lib/metrics/metric-registry";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
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

function isBusinessMetricRegistryMetric(metric: { lineageJson: unknown }) {
  return asRecord(metric.lineageJson).generatedFrom === "business_metric_registry";
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

function latestDataDateFromPayload(payload: unknown) {
  const record = asRecord(payload);
  const audit = asRecord(record.reportDataAudit);
  const composedReports = asRecord(record.composedReports);
  const dailyAudit = asRecord(asRecord(composedReports.daily_brief).reportDataAudit);
  const snapshotAudit = asRecord(asRecord(composedReports.snapshot_report).reportDataAudit);
  const candidates = [
    audit.latestDataDate,
    dailyAudit.latestDataDate,
    snapshotAudit.latestDataDate,
    record.latestDataDate
  ];

  for (const value of candidates) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }

  return null;
}

function latestDataDateFromSnapshot(snapshot: { schemaJson: unknown; qualityReport: unknown } | null) {
  const qualityReport = asRecord(snapshot?.qualityReport);
  const schemaJson = asRecord(snapshot?.schemaJson);
  const candidates = [
    qualityReport.latestDataDate,
    asRecord(qualityReport.reportDataAudit).latestDataDate,
    asRecord(qualityReport.fullDataGuardrail).latestDataDate,
    schemaJson.latestDataDate,
    asRecord(schemaJson.reportDataAudit).latestDataDate
  ];

  for (const value of candidates) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }

  return null;
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
  reportMode,
  sourceSnapshotVersion
}: {
  workspaceId: string;
  locale: "zh" | "en";
  dateRange: ReturnType<typeof resolveReportDateRange>;
  reportMode: ReportMode;
  sourceSnapshotVersion?: number | null;
}) {
  const payload = await buildDateRangedReportPayload({ workspaceId, locale, dateRange, reportMode });

  if (!payload) return null;

  const payloadRange = asRecord(payload.dateRange);
  const cacheDateRange = resolveReportDateRange({
    preset: (typeof payloadRange.preset === "string" ? payloadRange.preset : dateRange.preset) as DateRangePreset,
    startDate: typeof payloadRange.startDate === "string" ? payloadRange.startDate : dateRange.startDate,
    endDate: typeof payloadRange.endDate === "string" ? payloadRange.endDate : dateRange.endDate,
    previousStartDate: typeof payloadRange.previousStartDate === "string"
      ? payloadRange.previousStartDate
      : dateRange.previousStart?.toISOString().slice(0, 10),
    previousEndDate: typeof payloadRange.previousEndDate === "string"
      ? payloadRange.previousEndDate
      : dateRange.previousEnd?.toISOString().slice(0, 10)
  });
  const identity = cacheIdentityFromPayload({
    workspaceId,
    payload,
    dateRange: cacheDateRange
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

function shouldBypassReportCache(payload: ReportMetricCachePayload | null, reportMode: ReportMode) {
  if (!payload) return false;

  const audit = asRecord(payload.reportDataAudit);
  const dateRange = asRecord(payload.dateRange);
  const composedReports = asRecord(payload.composedReports);
  const nestedReport = asRecord(composedReports[reportMode]);
  const nestedAudit = asRecord(nestedReport.reportDataAudit);
  const failures = [
    ...(Array.isArray(audit.failures) ? audit.failures.map(String) : []),
    ...(Array.isArray(nestedAudit.failures) ? nestedAudit.failures.map(String) : [])
  ];
  const failureText = failures.join(" ");

  if (/Total Orders 指标结果 4?1\.36.*82911|Total Orders 指标结果 39\.88.*82911/.test(failureText)) {
    return true;
  }

  if (reportMode === "weekly_report" && /Total Orders 指标结果 \d+(?:\.\d+)?.*82911|Total Customers 指标结果 \d+(?:\.\d+)?.*17900/.test(failureText)) {
    return true;
  }

  if ((reportMode === "daily_brief" || reportMode === "weekly_report") && !composedReports[reportMode]) {
    return true;
  }

  if (reportMode === "daily_brief") {
    const dailyReport = asRecord(composedReports.daily_brief ?? payload);
    if (!Array.isArray(dailyReport.dimensionComparisons) || dailyReport.dimensionComparisons.length === 0) {
      return true;
    }
    if (Number(dailyReport.keyFindingsVersion ?? 0) < 2) {
      return true;
    }
  }

  if (reportMode === "daily_brief" && dateRange.preset === "ALL") {
    return true;
  }

  if (reportMode === "weekly_report") {
    const weeklyReport = asRecord(composedReports.weekly_report ?? payload);
    if (!Array.isArray(weeklyReport.weeklyKpis) || weeklyReport.weeklyKpis.length === 0) {
      return true;
    }
    if (!Array.isArray(weeklyReport.weeklyDimensionComparisons) || weeklyReport.weeklyDimensionComparisons.length === 0) {
      return true;
    }
    if (Number(weeklyReport.keyFindingsVersion ?? 0) < 2) {
      return true;
    }
    if (typeof weeklyReport.previousPeriodStart !== "string" || typeof weeklyReport.previousPeriodEnd !== "string") {
      return true;
    }
    const riskText = JSON.stringify(weeklyReport.riskReview ?? "");
    if (/样本结构|sample structure|concentration|样本集中/.test(riskText)) {
      return true;
    }
  }

  if (reportMode === "custom_report") {
    const customReport = asRecord(composedReports.custom_report ?? payload);
    if (!Array.isArray(customReport.monthlyKpis) || customReport.monthlyKpis.length === 0) {
      return true;
    }
  }

  return false;
}

function composeReportsFromPayload({
  workspaceId,
  payload,
  metricSnapshots,
  locale,
  dateRange
}: {
  workspaceId: string;
  payload: Record<string, unknown>;
  metricSnapshots: Array<Record<string, unknown>>;
  locale: "zh" | "en";
  dateRange: ReturnType<typeof resolveReportDateRange>;
}) {
  const timeConfig = asRecord(payload.timeConfig) as {
    hasTimeField?: boolean;
    selectedRange?: string;
    startDate?: string | null;
    endDate?: string | null;
    defaultTimeField?: string | null;
  };
  const metricResults = Array.isArray(payload.metricResults) ? payload.metricResults : [];
  const trendMetrics = Array.isArray(payload.trendMetrics) ? payload.trendMetrics as Array<Record<string, unknown>> : [];
  const trendCharts = Array.isArray(payload.trendCharts) ? payload.trendCharts as Array<Record<string, unknown>> : [];
  const aggregationResults = Array.isArray(payload.aggregationResults) ? payload.aggregationResults as Array<Record<string, unknown>> : [];
  const rawReportDataAudit = asRecord(payload.reportDataAudit);
  const reportDataAudit = typeof rawReportDataAudit.passed === "boolean" ? rawReportDataAudit as never : null;
  const structuredReport = asRecord(payload.structuredReport);
  const composerBase = {
    workspaceId,
    metricResults,
    metricSnapshots,
    structuredReport,
    aggregationResults,
    reportDataAudit,
    trendMetrics,
    trendCharts,
    timeConfig,
    dateRange: {
      preset: dateRange.preset,
      startDate: dateRange.startDate ?? null,
      endDate: dateRange.endDate ?? null,
      previousStartDate: dateRange.previousStart ? dateRange.previousStart.toISOString().slice(0, 10) : null,
      previousEndDate: dateRange.previousEnd ? dateRange.previousEnd.toISOString().slice(0, 10) : null
    },
    locale
  };
  const modes: ReportMode[] = ["daily_brief", "weekly_report", "custom_report", "snapshot_report"];

  return Object.fromEntries(modes.map((mode) => [
    mode,
    composeReport({ ...composerBase, requestedReportMode: mode })
  ]));
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
  dateRange,
  reportMode
}: {
  workspaceId: string;
  locale: "zh" | "en";
  dateRange: ReturnType<typeof resolveReportDateRange>;
  reportMode: ReportMode;
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
  const preReportDataAudit = await buildReportDataAudit({
    contexts,
    reportType: reportMode
  });

  if (!preReportDataAudit.passed) {
    return {
      generatedAt: new Date().toISOString(),
      locale,
      dataSourceIds: dataSources.map((source) => source.id),
      dataSourceName: dataSources.map((source) => source.name).join(locale === "zh" ? "、" : ", "),
      dateRange: {
        preset: dateRange.preset,
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null,
        previousStartDate: dateRange.previousStart ? dateRange.previousStart.toISOString().slice(0, 10) : null,
        previousEndDate: dateRange.previousEnd ? dateRange.previousEnd.toISOString().slice(0, 10) : null,
        dateField: preReportDataAudit.dateField,
        generatedAt: new Date().toISOString()
      },
      semanticLayer,
      metricResults: [],
      aggregationResults: [],
      reportDataAudit: preReportDataAudit,
      timeConfig: {
        hasTimeField: Boolean(preReportDataAudit.dateField),
        defaultTimeField: preReportDataAudit.dateField,
        selectedRange: dateRange.preset,
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null
      },
      trendMetrics: [],
      trendCharts: [],
      structuredReport: {
        coreSummary: locale === "zh" ? "当前报告未通过数据口径校验。" : "The report did not pass data-scope validation.",
        generatedInsights: {
          keyFindings: [],
          businessRisks: [],
          growthOpportunities: [],
          recommendedActions: [],
          dataLimitations: preReportDataAudit.failures.map((failure, index) => ({ id: `audit-${index}`, title: failure }))
        }
      }
    };
  }

  const effectiveDateRange = reportMetricTimeWindow({
    reportMode,
    requestedRange: {
      preset: dateRange.preset,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    },
    latestDataDate: preReportDataAudit.latestDataDate
  });
  const labels = activeTableLabels(tables);
  let metrics = await prisma.metricDefinition.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "asc" }
  });
  const hasRegistryMetrics = metrics.some((metric) => asRecord(metric.lineageJson).generatedFrom === "business_metric_registry");

  if (!hasRegistryMetrics) {
    await generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId,
      userId: null
    });
    metrics = await prisma.metricDefinition.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "asc" }
    });
  }
  const registryMetrics = metrics.filter(isBusinessMetricRegistryMetric);
  const metricsForExecution = registryMetrics.length > 0 ? registryMetrics : metrics;
  const executableMetrics = metricsForExecution
    .filter((metric) => metricBelongsToTables(metric, labels))
    .filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );

  const executableMetricRegistryId = registryFromMetricDefinitions(executableMetrics);
  const consistency = registryMetrics.length > 0
    ? validateMetricConsistency(["daily", "weekly", "custom"].map((reportType) => ({
      reportType: reportType as "daily" | "weekly" | "custom",
      metricRegistryId: executableMetricRegistryId,
      definitions: executableMetrics.map((metric) => {
        const lineage = asRecord(metric.lineageJson);
        return {
          metricId: String(lineage.metricId ?? metric.name),
          businessName: String(lineage.businessName ?? lineage.displayName ?? metric.name),
          formula: metric.formula,
          requiredFields: Array.isArray(lineage.requiredFields) ? lineage.requiredFields.filter((field): field is string => typeof field === "string") : []
        };
      })
    })))
    : { passed: true, failures: [] };

  if (!consistency.passed) {
    const failedAudit = await buildReportDataAudit({
      contexts,
      reportType: reportMode
    });
    return {
      generatedAt: new Date().toISOString(),
      locale,
      dataSourceIds: dataSources.map((source) => source.id),
      dataSourceName: dataSources.map((source) => source.name).join(locale === "zh" ? "、" : ", "),
      dateRange: {
        preset: effectiveDateRange.preset,
        startDate: effectiveDateRange.startDate ?? null,
        endDate: effectiveDateRange.endDate ?? null,
        previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
        previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null,
        dateField: failedAudit.dateField,
        generatedAt: new Date().toISOString()
      },
      semanticLayer,
      metricRegistryId: null,
      metricResults: [],
      verifiedMetrics: [],
      aggregationResults: [],
      reportDataAudit: {
        ...failedAudit,
        passed: false,
        failures: [...failedAudit.failures, ...consistency.failures]
      },
      timeConfig: {
        hasTimeField: Boolean(failedAudit.dateField),
        defaultTimeField: failedAudit.dateField,
        selectedRange: effectiveDateRange.preset,
        startDate: effectiveDateRange.startDate ?? null,
        endDate: effectiveDateRange.endDate ?? null
      },
      trendMetrics: [],
      trendCharts: [],
      structuredReport: {
        coreSummary: locale === "zh" ? "当前报告未通过指标一致性校验。" : "The report did not pass metric consistency validation.",
        generatedInsights: {
          keyFindings: [],
          businessRisks: [],
          growthOpportunities: [],
          recommendedActions: [],
          dataLimitations: consistency.failures.map((failure, index) => ({ id: `consistency-${index}`, title: failure }))
        }
      }
    };
  }

  const { metricResults, verifiedMetrics, metricRegistryId } = await calculateVerifiedMetrics({ contexts, metrics: executableMetrics, dateRange: effectiveDateRange });
  const aggregationResults = await buildAggregationResults({ contexts, metricResults, dateRange: effectiveDateRange });
  const timeArtifacts = buildReportTimeArtifacts(aggregationResults, effectiveDateRange, locale);
  const reportDataAudit = await buildReportDataAudit({
    contexts,
    reportType: reportMode,
    metricResults: metricResults as unknown as Array<Record<string, unknown>>,
    aggregationResults: aggregationResults as unknown as Array<Record<string, unknown>>,
    trendMetrics: timeArtifacts.trendMetrics as Array<Record<string, unknown>>
  });
  const effectiveTimeConfig = {
    ...timeArtifacts.timeConfig,
    hasTimeField: timeArtifacts.timeConfig.hasTimeField || Boolean(reportDataAudit.dateField),
    defaultTimeField: timeArtifacts.timeConfig.defaultTimeField ?? reportDataAudit.dateField ?? null
  };
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
      preset: effectiveDateRange.preset,
      startDate: effectiveDateRange.startDate ?? null,
      endDate: effectiveDateRange.endDate ?? null,
      previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
      previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null,
      dateField: effectiveTimeConfig.defaultTimeField ?? null,
      generatedAt: new Date().toISOString()
    },
    semanticLayer,
    metricRegistryId,
    verifiedMetrics,
    metricResults,
    aggregationResults,
    reportDataAudit,
    timeConfig: effectiveTimeConfig,
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
    const requestedReportMode = normalizeReportMode(url.searchParams.get("reportMode"));
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
    const latestDataDate = latestDataDateFromPayload(selectedBriefing?.payloadJson) ?? latestDataDateFromSnapshot(latestSnapshot);
    const effectiveRequestDateRange = reportMetricTimeWindow({
      reportMode: requestedReportMode,
      requestedRange: {
        preset: resolvedDateRange.preset,
        startDate: resolvedDateRange.startDate,
        endDate: resolvedDateRange.endDate,
        previousStartDate: resolvedDateRange.previousStart ? resolvedDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: resolvedDateRange.previousEnd ? resolvedDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      latestDataDate
    });
    const cacheProbeKey = reportMetricCacheKey({
      workspaceId: session.workspace.id,
      dateRange: {
        preset: effectiveRequestDateRange.preset,
        startDate: effectiveRequestDateRange.startDate,
        endDate: effectiveRequestDateRange.endDate,
        previousStartDate: effectiveRequestDateRange.previousStart ? effectiveRequestDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: effectiveRequestDateRange.previousEnd ? effectiveRequestDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      sourceSnapshotVersion
    });
    const cacheResult = await getReportMetricCache(prisma, {
      workspaceId: session.workspace.id,
      dateRange: {
        preset: effectiveRequestDateRange.preset,
        startDate: effectiveRequestDateRange.startDate,
        endDate: effectiveRequestDateRange.endDate,
        previousStartDate: effectiveRequestDateRange.previousStart ? effectiveRequestDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: effectiveRequestDateRange.previousEnd ? effectiveRequestDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      sourceSnapshotVersion
    });
    const reusableCachePayload = shouldBypassReportCache(cacheResult.payload, requestedReportMode) ? null : cacheResult.payload;
    let rangedPayload: ReportMetricCachePayload | null = reusableCachePayload;

    if (rangedPayload && cacheResult.status === "stale") {
      void refreshReportMetricCache({
        workspaceId: session.workspace.id,
        locale,
        dateRange: effectiveRequestDateRange,
        reportMode: requestedReportMode,
        sourceSnapshotVersion
      }).catch(() => null);
      prewarmCommonReportMetricCaches({
        workspaceId: session.workspace.id,
        locale,
        activePreset: effectiveRequestDateRange.preset,
        sourceSnapshotVersion
      });
      rangedPayload = withCacheMeta(rangedPayload, "stale", cacheResult.cacheKey);
    } else if (rangedPayload) {
      rangedPayload = withCacheMeta(rangedPayload, "hit", cacheResult.cacheKey);
    } else {
      const freshPayload = await refreshReportMetricCache({
        workspaceId: session.workspace.id,
        locale,
        dateRange: effectiveRequestDateRange,
        reportMode: requestedReportMode,
        sourceSnapshotVersion
      });
      rangedPayload = freshPayload ? withCacheMeta(freshPayload, "miss", cacheProbeKey) : null;
      prewarmCommonReportMetricCaches({
        workspaceId: session.workspace.id,
        locale,
        activePreset: effectiveRequestDateRange.preset,
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
    const metricSnapshots = await loadMetricSnapshots(prisma, session.workspace.id).catch(() => []);
    const visiblePayload = asRecord(visibleBriefing?.payloadJson);
    const visiblePayloadRange = asRecord(visiblePayload.dateRange);
    const compositionDateRange = resolveReportDateRange({
      preset: (typeof visiblePayloadRange.preset === "string" ? visiblePayloadRange.preset : effectiveRequestDateRange.preset) as DateRangePreset,
      startDate: typeof visiblePayloadRange.startDate === "string" ? visiblePayloadRange.startDate : effectiveRequestDateRange.startDate,
      endDate: typeof visiblePayloadRange.endDate === "string" ? visiblePayloadRange.endDate : effectiveRequestDateRange.endDate,
      previousStartDate: typeof visiblePayloadRange.previousStartDate === "string"
        ? visiblePayloadRange.previousStartDate
        : effectiveRequestDateRange.previousStart?.toISOString().slice(0, 10),
      previousEndDate: typeof visiblePayloadRange.previousEndDate === "string"
        ? visiblePayloadRange.previousEndDate
        : effectiveRequestDateRange.previousEnd?.toISOString().slice(0, 10)
    });
    const composedReports = visiblePayload.metricResults
      ? {
          ...asRecord(visiblePayload.composedReports),
          ...composeReportsFromPayload({
            workspaceId: session.workspace.id,
            payload: visiblePayload,
            metricSnapshots,
            locale,
            dateRange: compositionDateRange
          })
        }
      : asRecord(visiblePayload.composedReports);
    const briefingWithComposedReports = visibleBriefing
      ? {
          ...visibleBriefing,
          payloadJson: {
            ...visiblePayload,
            composedReports
          }
        }
      : visibleBriefing;
    const reportHistoryModel = (prisma as typeof prisma & {
      reportHistory?: {
        findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      };
    }).reportHistory;
    const reportHistory = reportHistoryModel
      ? await reportHistoryModel.findMany({
          where: { workspaceId: session.workspace.id },
          orderBy: { generatedAt: "desc" },
          take: 30,
          select: {
            id: true,
            reportMode: true,
            reportTimeMode: true,
            title: true,
            summaryJson: true,
            contentJson: true,
            selectedDateRange: true,
            status: true,
            generatedAt: true
          }
        }).catch(() => [])
      : [];
    const insights = selectedBriefing?.insights ?? [];
    const recommendations = insights.flatMap((insight) => insight.recommendations);
    const reportEntitlement = await getReportEntitlementState(session.workspace.id);

    return NextResponse.json({
      workspaceId: session.workspace.id,
      hasData: Boolean(selectedBriefing || insights.length || recommendations.length),
      briefing: briefingWithComposedReports,
      insights,
      recommendations,
      reportHistory,
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
