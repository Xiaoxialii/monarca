import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ReportGenerationJobStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAggregationResults } from "@/lib/analytics/aggregation-engine";
import { apiErrorResponse } from "@/lib/api-errors";
import { type MetricResultValue } from "@/lib/metric-results";
import { normalizeReportDateRange, resolveReportDateRange, type ReportDateRangeInput } from "@/lib/report-date-range";
import { cacheIdentityFromPayload, upsertReportMetricCache } from "@/lib/report-metric-cache";
import {
  markReportGenerationFailed,
  markReportGenerationSucceeded,
  ReportAccessError,
  startReportGeneration
} from "@/lib/report-entitlements";
import { buildMockAiBrief } from "@/lib/report-generation/ai-brief-generator";
import { contextualMetricName } from "@/lib/report-generation/metric-name-normalizer";
import { buildReportTimeArtifacts } from "@/lib/report-time-artifacts.mjs";
import { buildReportPrompt } from "@/lib/report-generation/report-prompt-builder";
import { buildStructuredAiReport } from "@/lib/report-generation/report-section-builder";
import { buildReportDataAudit } from "@/lib/report-data-audit";
import {
  composeReport,
  loadMetricSnapshots,
  normalizeReportMode,
  reportHistoryTitle,
  saveMetricSnapshots,
  type ReportMode
} from "@/lib/report-composers";
import {
  hasDisplayableMetricResult,
  hasDisplayableMetricValue,
  isBusinessFacingMetricText,
  isBusinessFacingMetricDefinition,
  isGlobalBusinessMetricResult,
  metricBelongsToTables
} from "@/lib/metric-visibility";
import {
  tablesFromSchemaJson,
  validateWorkspaceMetrics,
  validationFromLineage
} from "@/lib/metric-validation";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { calculateVerifiedMetrics } from "@/lib/metrics/metric-calculator";
import { reportMetricTimeWindow } from "@/lib/metrics/time-window-builder";
import { validateMetricConsistency } from "@/lib/metrics/metric-consistency-validator";
import { registryFromMetricDefinitions } from "@/lib/metrics/metric-registry";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";

export const maxDuration = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeReportLocale(value: unknown): ReportLocale | null {
  return value === "zh" || value === "en" ? value : null;
}

function defaultDateRangeForReportMode(reportMode: ReportMode): ReportDateRangeInput {
  if (reportMode === "daily_brief") return { preset: "ALL" };
  if (reportMode === "weekly_report") return { preset: "ALL" };
  return { preset: "ALL" };
}

function formatValue(value: unknown) {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value == null ? "-" : String(value);
}

function compactText(value: unknown, maxLength = 180) {
  const text = value == null ? "" : String(value).replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function tableKey(table: { name: string; schema?: string | null }) {
  return `${table.schema ?? ""}.${table.name}`.toLowerCase();
}

function activeTableLabels(tables: Array<{ name: string; schema?: string | null }>) {
  return new Set(tables.flatMap((table) => {
    const labels = [table.name];

    if (table.schema) {
      labels.push(`${table.schema}.${table.name}`);
    }

    return labels;
  }));
}

function uniqueTables(tables: ReturnType<typeof tablesFromSchemaJson>) {
  const seen = new Set<string>();

  return tables.filter((table) => {
    const key = tableKey(table);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

type ReportLocale = "en" | "zh";

function buildBriefSummary(results: MetricResultValue[], locale: ReportLocale = "zh") {
  const computed = results.filter((result) =>
    result.status === "computed" &&
    !result.isInternalMetric &&
    !result.isDiagnosticMetric &&
    result.isBusinessMetric !== false &&
    isBusinessFacingMetricText([
      result.metricName,
      result.displayName,
      result.formula,
      result.metricCategory,
      result.sourceDataset
    ]) &&
    isGlobalBusinessMetricResult(result) &&
    hasDisplayableMetricValue(result.value)
  );
  const failed = results.filter((result) => result.status === "failed");

  if (computed.length === 0) {
    return locale === "zh"
      ? "当前没有成功计算的指标。请确认数据库连接、指标校验状态和公式是否可执行。"
      : "No metrics were computed successfully. Check the data connection, metric validation status, and executable formulas.";
  }

  const highlights = computed.slice(0, 4).map((result) =>
    locale === "zh"
      ? `${contextualMetricName(result.metricName, result.formula)} 为 ${formatValue(result.value)}`
      : `${contextualMetricName(result.metricName, result.formula)}: ${formatValue(result.value)}`
  );

  return locale === "zh" ? [
    `本次报告基于 ${computed.length} 个通过校验的指标生成`,
    ...highlights,
    failed.length > 0 ? `${failed.length} 个指标计算失败，已从报告结论中排除` : ""
  ].filter(Boolean).join("；") : [
    `This report is based on ${computed.length} validated metrics`,
    ...highlights,
    failed.length > 0 ? `${failed.length} failed metrics were excluded from the report conclusions` : ""
  ].filter(Boolean).join("; ");
}

function groupMetricResultsByType(results: MetricResultValue[]) {
  const computed = results.filter((result) => result.status === "computed" && hasDisplayableMetricResult(result));

  return {
    coreMetrics: computed.filter((result) => result.metricType === "core_metric"),
    comparisonMetrics: computed.filter((result) => result.metricType === "comparison_metric"),
    distributionMetrics: computed.filter((result) => result.metricType === "distribution_metric"),
    concentrationMetrics: computed.filter((result) => result.metricType === "concentration_metric"),
    trendMetrics: computed.filter((result) => result.metricType === "trend_metric"),
    groupComparisonMetrics: computed.filter((result) => result.metricType === "comparison_metric" && Array.isArray(result.rows) && result.rows.length > 0),
    riskMetrics: computed.filter((result) => result.metricType === "risk_metric"),
    warningMetrics: results.filter((result) =>
      Boolean(result.warning || result.isEstimated || result.requiresDeduplication) ||
      (result.status === "computed" && !hasDisplayableMetricResult(result))
    )
  };
}

async function runReportGenerationJob(input: {
  jobId: string;
  generationLogId: string;
  workspaceId: string;
  userId: string;
  reportLocale: ReportLocale;
  reportMode: ReportMode;
  resolvedDateRange: ReturnType<typeof resolveReportDateRange>;
}) {
  try {
    await prisma.reportGenerationJob.update({
      where: { id: input.jobId },
      data: { status: ReportGenerationJobStatus.RUNNING, startedAt: new Date() }
    });

    const dataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: input.workspaceId,
        isActive: true,
        status: "CONNECTED"
      },
      orderBy: { updatedAt: "desc" }
    });

    if (dataSources.length === 0) {
      throw new Error("No connected data source found for metric result execution");
    }

    const snapshots = await prisma.schemaSnapshot.findMany({
      where: {
        workspaceId: input.workspaceId,
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
      return snapshot ? [{
        dataSource,
        tables: tablesFromSchemaJson(snapshot.schemaJson),
        schemaJson: snapshot.schemaJson
      }] : [];
    });

    if (contexts.length === 0) {
      throw new Error("No schema snapshot found for connected data sources");
    }

    const latestSnapshot = snapshots[0];
    const tables = uniqueTables(contexts.flatMap((context) => context.tables));

    await validateWorkspaceMetrics(prisma, {
      workspaceId: input.workspaceId,
      tables
    });

    let metrics = await prisma.metricDefinition.findMany({
      where: { workspaceId: input.workspaceId, isActive: true },
      orderBy: { createdAt: "asc" }
    });
    const hasRegistryMetrics = metrics.some((metric) => asRecord(metric.lineageJson).generatedFrom === "business_metric_registry");

    if (!hasRegistryMetrics) {
      await generateWorkspaceMetricsFromConnectedSources(prisma, {
        workspaceId: input.workspaceId,
        userId: input.userId
      });
      metrics = await prisma.metricDefinition.findMany({
        where: { workspaceId: input.workspaceId, isActive: true },
        orderBy: { createdAt: "asc" }
      });
    }
    const visibleMetrics = metrics.filter((metric) => metricBelongsToTables(metric, activeTableLabels(tables)));
    const executableMetrics = visibleMetrics.filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );
    const preReportDataAudit = await buildReportDataAudit({
      contexts,
      reportType: input.reportMode
    });
    const previousMetricSnapshots = await loadMetricSnapshots(prisma, input.workspaceId).catch(() => []);
    const effectiveDateRange = reportMetricTimeWindow({
      reportMode: input.reportMode,
      requestedRange: {
        preset: input.resolvedDateRange.preset,
        startDate: input.resolvedDateRange.startDate,
        endDate: input.resolvedDateRange.endDate,
        previousStartDate: input.resolvedDateRange.previousStart ? input.resolvedDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: input.resolvedDateRange.previousEnd ? input.resolvedDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      latestDataDate: preReportDataAudit.latestDataDate
    });

    if (!preReportDataAudit.passed) {
      const structuredReport = {
        coreSummary: input.reportLocale === "zh" ? "当前报告未通过数据口径校验。" : "The report did not pass data-scope validation.",
        generatedInsights: {
          keyFindings: [],
          businessRisks: [],
          growthOpportunities: [],
          recommendedActions: [],
          dataLimitations: preReportDataAudit.failures.map((failure, index) => ({ id: `audit-${index}`, title: failure }))
        }
      };
      const composedReport = composeReport({
        workspaceId: input.workspaceId,
        requestedReportMode: input.reportMode,
        metricResults: [],
        metricSnapshots: previousMetricSnapshots,
        structuredReport,
        reportDataAudit: preReportDataAudit,
        aggregationResults: [],
        trendMetrics: [],
        trendCharts: [],
        timeConfig: {
          hasTimeField: Boolean(preReportDataAudit.dateField),
          defaultTimeField: preReportDataAudit.dateField,
          selectedRange: effectiveDateRange.preset,
          startDate: effectiveDateRange.startDate ?? null,
          endDate: effectiveDateRange.endDate ?? null
        },
        dateRange: {
          preset: effectiveDateRange.preset,
          startDate: effectiveDateRange.startDate ?? null,
          endDate: effectiveDateRange.endDate ?? null,
          previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
          previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null
        },
        locale: input.reportLocale
      });
      const effectiveReportMode = String((composedReport as { reportMode?: string }).reportMode ?? input.reportMode) as ReportMode;
      const reportTimeMode = String((composedReport as { reportTimeMode?: string }).reportTimeMode ?? "snapshot_report");
      const reportTitle = reportHistoryTitle(effectiveReportMode, reportTimeMode, input.reportLocale);
      const summary = input.reportLocale === "zh" ? "当前报告未通过数据口径校验。" : "The report did not pass data-scope validation.";
      const selectedDateRange = {
        preset: effectiveDateRange.preset,
        startDate: effectiveDateRange.startDate ?? null,
        endDate: effectiveDateRange.endDate ?? null,
        previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
        previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null,
        dateField: preReportDataAudit.dateField,
        generatedAt: new Date().toISOString()
      };
      const payloadJson = {
        generatedFrom: "full_data_guardrail",
        locale: input.reportLocale,
        reportMode: effectiveReportMode,
        requestedReportMode: input.reportMode,
        reportTimeMode,
        generatedAt: new Date().toISOString(),
        dateRange: selectedDateRange,
        dataSourceIds: dataSources.map((source) => source.id),
        dataSourceName: dataSources.map((source) => source.name).join(input.reportLocale === "zh" ? "、" : ", "),
        metricRegistryId: registryFromMetricDefinitions(executableMetrics),
        fullSummary: summary,
        metricResults: [],
        verifiedMetrics: [],
        metricResultGroups: groupMetricResultsByType([]),
        aggregationResults: [],
        reportDataAudit: preReportDataAudit,
        timeConfig: {
          hasTimeField: Boolean(preReportDataAudit.dateField),
          defaultTimeField: preReportDataAudit.dateField,
          selectedRange: effectiveDateRange.preset,
          startDate: effectiveDateRange.startDate ?? null,
          endDate: effectiveDateRange.endDate ?? null
        },
        trendMetrics: [],
        trendCharts: [],
        structuredReport,
        composedReports: {
          [effectiveReportMode]: composedReport
        }
      };
      const cacheIdentity = cacheIdentityFromPayload({
        workspaceId: input.workspaceId,
        payload: payloadJson,
        dateRange: effectiveDateRange
      });

      await upsertReportMetricCache(prisma, {
        ...cacheIdentity,
        payload: payloadJson,
        sourceSnapshotVersion: latestSnapshot.version
      });

      const reportHistoryModel = (prisma as typeof prisma & {
        reportHistory?: {
          create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        };
      }).reportHistory;
      const reportHistory = reportHistoryModel
        ? await reportHistoryModel.create({
            data: {
              workspaceId: input.workspaceId,
              reportMode: effectiveReportMode,
              reportTimeMode,
              title: reportTitle,
              summaryJson: { summary, generatedAt: payloadJson.generatedAt, metricSnapshotCount: 0 },
              contentJson: composedReport,
              selectedDateRange,
              generatedAt: new Date(payloadJson.generatedAt)
            }
          }).catch(() => null)
        : null;
      const briefing = await prisma.dailyBriefing.upsert({
        where: {
          workspaceId_briefingDate: {
            workspaceId: input.workspaceId,
            briefingDate: startOfToday()
          }
        },
        create: {
          workspaceId: input.workspaceId,
          briefingDate: startOfToday(),
          title: reportTitle,
          summary,
          confidence: 0,
          payloadJson: payloadJson as never
        },
        update: {
          title: reportTitle,
          summary,
          confidence: 0,
          payloadJson: payloadJson as never
        }
      });

      await markReportGenerationSucceeded({
        logId: input.generationLogId,
        workspaceId: input.workspaceId,
        reportId: reportHistory?.id ?? briefing.id
      });
      await prisma.reportGenerationJob.update({
        where: { id: input.jobId },
        data: {
          reportId: reportHistory?.id ?? briefing.id,
          status: ReportGenerationJobStatus.COMPLETED,
          completedAt: new Date(),
          metadata: {
            generatedAt: payloadJson.generatedAt,
            reportMode: effectiveReportMode,
            reportTimeMode,
            validationStatus: "failed",
            blockingIssues: preReportDataAudit.failures
          }
        }
      });
      return {
        ok: true,
        computedMetricCount: 0,
        generatedAt: payloadJson.generatedAt,
        reportId: reportHistory?.id ?? briefing.id
      };
    }
    const executableMetricRegistryId = registryFromMetricDefinitions(executableMetrics);
    const consistency = validateMetricConsistency(["daily", "weekly", "custom"].map((reportType) => ({
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
    })));

    if (!consistency.passed) {
      throw new Error(consistency.failures[0] ?? "当前报告未通过指标一致性校验，日报、周报和月经营分析使用了不一致的指标口径。");
    }

    const { metricResults, metricRegistryId } = await calculateVerifiedMetrics({
      contexts,
      metrics: executableMetrics,
      dateRange: effectiveDateRange
    });
    const displayableMetricResults = metricResults.filter((result) => hasDisplayableMetricResult(result));
    const metricResultGroups = groupMetricResultsByType(metricResults);
    const aggregationResults = await buildAggregationResults({
      contexts,
      metricResults,
      dateRange: effectiveDateRange
    });
    const reportTimeArtifacts = buildReportTimeArtifacts(aggregationResults, effectiveDateRange, input.reportLocale);
    const reportDataAudit = await buildReportDataAudit({
      contexts,
      reportType: input.reportMode,
      metricResults: metricResults as unknown as Array<Record<string, unknown>>,
      aggregationResults: aggregationResults as unknown as Array<Record<string, unknown>>,
      trendMetrics: reportTimeArtifacts.trendMetrics as Array<Record<string, unknown>>
    });
    const effectiveTimeConfig = {
      ...reportTimeArtifacts.timeConfig,
      hasTimeField: reportTimeArtifacts.timeConfig.hasTimeField || Boolean(reportDataAudit.dateField),
      defaultTimeField: reportTimeArtifacts.timeConfig.defaultTimeField ?? reportDataAudit.dateField ?? null
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
      locale: input.reportLocale
    });
    const composedReport = composeReport({
      workspaceId: input.workspaceId,
      requestedReportMode: input.reportMode,
      metricResults,
      metricSnapshots: previousMetricSnapshots,
      structuredReport,
      reportDataAudit,
      aggregationResults,
      trendMetrics: reportTimeArtifacts.trendMetrics,
      trendCharts: reportTimeArtifacts.trendCharts,
      timeConfig: effectiveTimeConfig,
      dateRange: {
        preset: effectiveDateRange.preset,
        startDate: effectiveDateRange.startDate ?? null,
        endDate: effectiveDateRange.endDate ?? null,
        previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
        previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null
      },
      locale: input.reportLocale
    });
    const metricSnapshotResult = await saveMetricSnapshots(prisma, {
      workspaceId: input.workspaceId,
      metricResults,
      timeConfig: effectiveTimeConfig,
      dateRange: {
        preset: effectiveDateRange.preset,
        startDate: effectiveDateRange.startDate ?? null,
        endDate: effectiveDateRange.endDate ?? null,
        previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
        previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null
      }
    }).catch(() => ({ count: 0, snapshotDate: new Date() }));
    const effectiveReportMode = String((composedReport as { reportMode?: string }).reportMode ?? input.reportMode) as ReportMode;
    const reportTimeMode = String((composedReport as { reportTimeMode?: string }).reportTimeMode ?? "latest_complete_period_report");
    const prompt = buildReportPrompt(structuredReport);
    const mockReport = buildMockAiBrief(metricResults, input.reportLocale);
    const fullSummary = structuredReport.coreSummary || mockReport.summary || buildBriefSummary(metricResults, input.reportLocale);
    const summary = compactText(fullSummary);
    const today = startOfToday();
    const reportTitle = reportHistoryTitle(effectiveReportMode, reportTimeMode, input.reportLocale);
    const selectedDateRange = {
      preset: effectiveDateRange.preset,
      startDate: effectiveDateRange.startDate ?? null,
      endDate: effectiveDateRange.endDate ?? null,
      previousStartDate: effectiveDateRange.previousStart ? effectiveDateRange.previousStart.toISOString().slice(0, 10) : null,
      previousEndDate: effectiveDateRange.previousEnd ? effectiveDateRange.previousEnd.toISOString().slice(0, 10) : null,
      dateField: effectiveTimeConfig.defaultTimeField ?? null,
      generatedAt: new Date().toISOString()
    };
    const payloadJson = {
      generatedFrom: "async_ai_brief",
      locale: input.reportLocale,
      reportMode: effectiveReportMode,
      requestedReportMode: input.reportMode,
      reportTimeMode,
      metricRegistryId,
      generatedAt: new Date().toISOString(),
      dateRange: selectedDateRange,
      dataSourceIds: dataSources.map((source) => source.id),
      dataSourceName: dataSources.map((source) => source.name).join(input.reportLocale === "zh" ? "、" : ", "),
      fullSummary,
      metricResults,
      verifiedMetrics: metricResults,
      metricResultGroups,
      aggregationResults,
      reportDataAudit,
      timeConfig: effectiveTimeConfig,
      trendMetrics: reportTimeArtifacts.trendMetrics,
      trendCharts: reportTimeArtifacts.trendCharts,
      structuredReport,
      composedReports: {
        [effectiveReportMode]: composedReport
      },
      metricSnapshot: metricSnapshotResult,
      prompt,
      mockReport,
      analysisReport: asRecord(latestSnapshot.qualityReport).analysisReport ?? asRecord(latestSnapshot.schemaJson).analysisReport ?? null
    };
    const cacheIdentity = cacheIdentityFromPayload({
        workspaceId: input.workspaceId,
        payload: payloadJson,
        dateRange: effectiveDateRange
      });

    await upsertReportMetricCache(prisma, {
      ...cacheIdentity,
      payload: payloadJson,
      sourceSnapshotVersion: latestSnapshot.version
    });
    const reportHistoryModel = (prisma as typeof prisma & {
      reportHistory?: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
      };
    }).reportHistory;
    const reportHistory = reportHistoryModel
      ? await reportHistoryModel.create({
          data: {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            reportMode: effectiveReportMode,
            reportTimeMode,
            title: reportTitle,
            summaryJson: {
              summary,
              generatedAt: payloadJson.generatedAt,
              metricSnapshotCount: metricSnapshotResult.count
            },
            contentJson: composedReport,
            selectedDateRange,
            generatedAt: new Date(payloadJson.generatedAt)
          }
        }).catch(() => null)
      : null;

    const briefing = await prisma.dailyBriefing.upsert({
      where: {
        workspaceId_briefingDate: {
          workspaceId: input.workspaceId,
          briefingDate: today
        }
      },
      create: {
        workspaceId: input.workspaceId,
        briefingDate: today,
        title: reportTitle,
        summary,
        confidence: displayableMetricResults.some((result) => result.status === "computed") ? 88 : 50,
        payloadJson: payloadJson as never
      },
      update: {
        title: reportTitle,
        summary,
        confidence: displayableMetricResults.some((result) => result.status === "computed") ? 88 : 50,
        payloadJson: payloadJson as never
      }
    });

    await markReportGenerationSucceeded({
      logId: input.generationLogId,
      workspaceId: input.workspaceId,
      reportId: reportHistory?.id ?? briefing.id
    });

    await prisma.reportGenerationJob.update({
      where: { id: input.jobId },
      data: {
        reportId: reportHistory?.id ?? briefing.id,
        status: ReportGenerationJobStatus.COMPLETED,
        completedAt: new Date(),
        metadata: {
          computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length,
          generatedAt: payloadJson.generatedAt,
          reportMode: effectiveReportMode,
          reportTimeMode,
          briefingId: briefing.id,
          reportHistoryId: reportHistory?.id ?? null
        }
      }
    });
    return {
      ok: true,
      computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length,
      generatedAt: payloadJson.generatedAt,
      reportId: reportHistory?.id ?? briefing.id
    };
  } catch (error) {
    await markReportGenerationFailed({
      logId: input.generationLogId,
      workspaceId: input.workspaceId,
      errorMessage: error instanceof Error ? error.message : "Failed to generate report."
    }).catch(() => null);
    await prisma.reportGenerationJob.update({
      where: { id: input.jobId },
      data: {
        status: ReportGenerationJobStatus.FAILED,
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Failed to generate report."
      }
    }).catch(() => null);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to generate report."
    };
  }
}

export async function POST(request: Request) {
  let generationLogId: string | null = null;
  let generationWorkspaceId: string | null = null;

  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = await request.json().catch(() => null);
    const payloadRecord = asRecord(payload);
    const userRequested = asRecord(payload).userRequested === true;
    generationWorkspaceId = session.workspace.id;

    if (!userRequested) {
      return NextResponse.json(
        { ok: false, code: "USER_ACTION_REQUIRED", message: "Report generation requires an explicit user action." },
        { status: 400 }
      );
    }

    const requestedLocale = normalizeReportLocale(payloadRecord.locale);
    const reportLocale: ReportLocale = requestedLocale ?? (session.user.locale === "zh" ? "zh" : "en");
    const reportMode = normalizeReportMode(payloadRecord.reportMode);
    const requestedDateRange = payloadRecord.dateRange
      ? normalizeReportDateRange(payloadRecord.dateRange)
      : defaultDateRangeForReportMode(reportMode);
    const resolvedDateRange = resolveReportDateRange(requestedDateRange);
    if (requestedLocale && requestedLocale !== session.user.locale) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { locale: requestedLocale }
      });
    }

    const requestId = typeof payloadRecord.idempotencyKey === "string"
      ? payloadRecord.idempotencyKey
      : request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key") ?? crypto.randomUUID();
    const generationAccess = await startReportGeneration({
      workspaceId: session.workspace.id,
      reportType: reportMode,
      idempotencyKey: requestId
    });
    generationLogId = generationAccess.log.id;
    const generationJob = await prisma.reportGenerationJob.create({
      data: {
        workspaceId: session.workspace.id,
        status: ReportGenerationJobStatus.PENDING,
        metadata: {
          requestId,
          dateRange: {
            preset: resolvedDateRange.preset,
            startDate: resolvedDateRange.startDate ?? null,
            endDate: resolvedDateRange.endDate ?? null,
            previousStartDate: resolvedDateRange.previousStart ? resolvedDateRange.previousStart.toISOString().slice(0, 10) : null,
            previousEndDate: resolvedDateRange.previousEnd ? resolvedDateRange.previousEnd.toISOString().slice(0, 10) : null
          },
          reportMode,
          locale: reportLocale
        }
      }
    });

    after(async () => {
      await runReportGenerationJob({
        jobId: generationJob.id,
        generationLogId: generationAccess.log.id,
        workspaceId: session.workspace.id,
        userId: session.user.id,
        reportLocale,
        reportMode,
        resolvedDateRange
      });
    });

    return NextResponse.json(
      {
        ok: true,
        async: true,
        jobId: generationJob.id,
        status: "queued",
        message: reportLocale === "zh" ? "报告生成已开始，完成后会自动刷新。" : "Report generation has started and will refresh when complete."
      },
      { status: 202 }
    );

  } catch (error) {
    if (generationLogId && generationWorkspaceId) {
      await markReportGenerationFailed({
        logId: generationLogId,
        workspaceId: generationWorkspaceId,
        errorMessage: error instanceof Error ? error.message : "Failed to generate report."
      }).catch(() => null);
    }

    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof ReportAccessError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.code,
          code: error.code,
          message: error.message,
          upgradeRequired: true,
          upgradeUrl: "/settings/billing",
          oneTimeUrl: "/settings/billing"
        },
        { status: error.status }
      );
    }

    return apiErrorResponse(error, "Failed to generate metric result report");
  }
}
