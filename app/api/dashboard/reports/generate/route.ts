import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ReportGenerationJobStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAggregationResults } from "@/lib/analytics/aggregation-engine";
import { apiErrorResponse } from "@/lib/api-errors";
import { type MetricResultContext, type MetricResultValue } from "@/lib/metric-results";
import { normalizeReportDateRange, resolveReportDateRange, type ReportDateRangeInput } from "@/lib/report-date-range";
import { cacheIdentityFromPayload, getReportMetricCache, stableHash, upsertReportMetricCache } from "@/lib/report-metric-cache";
import {
  attachReportRunMetadata,
  findCompletedReportRun,
  reportRunScopeMetadata,
  upsertCompletedReportRun
} from "@/lib/report-runs";
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
import { buildKpiAiReportJson } from "@/lib/kpi-ai-report";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "@/lib/profit/canonical-profitability-engine";
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
import { logWorkspaceContext } from "@/lib/current-workspace-context";
import { calculateVerifiedMetrics } from "@/lib/metrics/metric-calculator";
import { reportMetricTimeWindow } from "@/lib/metrics/time-window-builder";
import { validateMetricConsistency } from "@/lib/metrics/metric-consistency-validator";
import { registryFromMetricDefinitions } from "@/lib/metrics/metric-registry";
import {
  buildKpiOrchestrationPlan,
  markKpiExecutionStep,
  metricsForKpiExecution,
  selectKpiExecutionDataSources
} from "@/lib/kpi-orchestration";
import { generateWorkspaceMetricsFromConnectedSources, tablesFromConnectedDataSourceFile } from "@/lib/workspace-metric-generation";
import { buildReportSpec } from "@/lib/report-spec";
import { buildKpiRuntimeApiResponse } from "@/lib/kpi-runtime";
import { SemanticLayerRuntime } from "@/lib/semantic-layer-runtime";

export const maxDuration = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isBusinessMetricRegistryMetric(metric: { lineageJson: unknown }) {
  return asRecord(metric.lineageJson).generatedFrom === "business_metric_registry";
}

async function latestWorkspaceSnapshotMeta(workspaceId: string, dataSourceIds: string[] = []) {
  return prisma.schemaSnapshot.findFirst({
    where: {
      workspaceId,
      ...(dataSourceIds.length
        ? {
            OR: [
              { dataSourceId: { in: dataSourceIds } },
              { dataSourceId: null }
            ]
          }
        : {})
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true }
  });
}

async function latestCachedReportDataDate(workspaceId: string) {
  const cache = await prisma.reportMetricCache.findFirst({
    where: { workspaceId },
    orderBy: { generatedAt: "desc" },
    select: { payloadJson: true, endDate: true }
  });
  const payload = asRecord(cache?.payloadJson);
  const audit = asRecord(payload.reportDataAudit);
  const dateRange = asRecord(payload.dateRange);
  const timeConfig = asRecord(payload.timeConfig);
  const candidates = [
    audit.latestDataDate,
    audit.dateRangeEnd,
    dateRange.latestDataDate,
    dateRange.endDate,
    timeConfig.endDate,
    cache?.endDate ? cache.endDate.toISOString().slice(0, 10) : null
  ];

  for (const value of candidates) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }

  return null;
}

type FinalMetricResultSource = "registry" | "semantic" | "generic";

function metricResultSource(result: MetricResultValue): FinalMetricResultSource {
  if (result.generatedFrom === "business_metric_registry") return "registry";
  if (result.generatedFrom === "semantic_kpi_asset_library" || result.businessType === "semantic_kpi_asset") return "semantic";
  return "generic";
}

function normalizeKpiMergeKey(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[()（）/]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    normalized.includes("unresolved_ticket_count") ||
    normalized.includes("unresolved_tickets") ||
    normalized.includes("未解决工单数") ||
    normalized.includes("一次性未解决")
  ) {
    return "unresolved_ticket_count";
  }

  if (normalized.includes("problem_resolution_score") || normalized.includes("问题解决")) {
    return normalized.includes("loss") || normalized.includes("失分")
      ? "problem_resolution_score_loss"
      : "problem_resolution_score";
  }

  return normalized;
}

function metricResultMergeKey(result: MetricResultValue) {
  const explicitId = result.kpiId || result.registryMetricId;

  if (explicitId) {
    return normalizeKpiMergeKey(explicitId);
  }

  return normalizeKpiMergeKey([
    result.kpiName,
    result.displayName,
    result.metricName
  ].filter(Boolean).join(" "));
}

function metricResultSourceRank(source: FinalMetricResultSource) {
  if (source === "registry") return 0;
  if (source === "semantic") return 1;
  return 2;
}

function mergeFinalMetricResults(results: MetricResultValue[]) {
  const ordered = [...results].sort((left, right) => {
    const sourceDelta = metricResultSourceRank(metricResultSource(left)) - metricResultSourceRank(metricResultSource(right));
    if (sourceDelta !== 0) return sourceDelta;
    const leftPriority = typeof left.priority === "number" ? left.priority : 999;
    const rightPriority = typeof right.priority === "number" ? right.priority : 999;
    return leftPriority - rightPriority;
  });
  const merged = new Map<string, MetricResultValue>();

  for (const result of ordered) {
    const source = metricResultSource(result);
    const key = metricResultMergeKey(result);

    if (!key || merged.has(key)) {
      continue;
    }

    merged.set(key, {
      ...result,
      source,
      kpiId: result.kpiId ?? result.registryMetricId ?? key,
      kpiName: result.kpiName ?? result.displayName ?? result.metricName
    });
  }

  return Array.from(merged.values());
}

function finalMetricResultsView(results: MetricResultValue[]) {
  return results.map((result) => {
    const current = Number(result.currentValue ?? result.value);
    const previous = Number(result.previousValue);
    const changePct = typeof result.changePercent === "number"
      ? result.changePercent
      : typeof result.percentChange === "number"
        ? result.percentChange
        : Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
          ? (current - previous) / Math.abs(previous)
          : null;
    const metricDirection = result.metricDirection ?? "neutral";
    const direction = changePct == null || Math.abs(changePct) < 0.01
      ? "stable"
      : metricDirection === "lower_is_better"
        ? changePct < 0 ? "improve" : "deteriorate"
        : changePct > 0 ? "improve" : "deteriorate";

    return {
      kpi_id: result.kpiId ?? result.registryMetricId ?? metricResultMergeKey(result),
      kpi_name: result.kpiName ?? result.displayName ?? result.metricName,
      source: metricResultSource(result),
      today: Number.isFinite(current) ? current : null,
      yesterday: Number.isFinite(previous) ? previous : null,
      change_pct: changePct,
      direction
    };
  });
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function metricResultHasExplicitValue(result: unknown) {
  const record = asRecord(result);
  const directValue = record.value ?? record.currentValue ?? record.score ?? record.rateValue;

  if (directValue !== null && directValue !== undefined && !(typeof directValue === "number" && Number.isNaN(directValue))) {
    return true;
  }

  const rows = Array.isArray(record.rows) ? record.rows : [];
  return rows.some((row) => {
    const rowRecord = asRecord(row);
    const value = rowRecord.value ?? rowRecord.currentValue;
    return value !== null && value !== undefined && !(typeof value === "number" && Number.isNaN(value));
  });
}

function reportMetricPayloadHasValues(payload: Record<string, unknown> | null | undefined) {
  const metricResults = Array.isArray(payload?.metricResults) ? payload.metricResults : [];

  return metricResults.some(metricResultHasExplicitValue);
}

function arrayHasItems(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function reportMetricPayloadHasMetricArtifacts(payload: Record<string, unknown>) {
  const finalMetricResults = Array.isArray(payload.final_metricResults) ? payload.final_metricResults : [];
  const aggregationResults = Array.isArray(payload.aggregationResults) ? payload.aggregationResults : [];

  return (
    finalMetricResults.some(metricResultHasExplicitValue) ||
    aggregationResults.some((result) => {
      const record = asRecord(result);
      return ["kpis", "metrics", "children", "items"].some((key) => arrayHasItems(record[key]));
    }) ||
    arrayHasItems(payload.formulaBreakdowns) ||
    arrayHasItems(payload.formula_breakdowns)
  );
}

function isFailedGuardrailPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return false;

  const generatedFrom = typeof payload.generatedFrom === "string" ? payload.generatedFrom : "";
  const reportDataAudit = asRecord(payload.reportDataAudit);
  const failures = Array.isArray(reportDataAudit.failures) ? reportDataAudit.failures : [];
  const passed = reportDataAudit.passed;

  return generatedFrom === "full_data_guardrail" || passed === false || failures.length > 0;
}

function reportMetricPayloadHasReusableReport(payload: Record<string, unknown> | null | undefined, reportMode?: ReportMode) {
  if (!payload) return false;
  if (isFailedGuardrailPayload(payload)) return false;
  if (reportMetricPayloadHasValues(payload)) return true;
  void reportMode;

  return reportMetricPayloadHasMetricArtifacts(payload);
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

function tableHasSnapshotRows(table: { sampleRows?: unknown; previewRows?: unknown }) {
  return (
    (Array.isArray(table.sampleRows) && table.sampleRows.length > 0) ||
    (Array.isArray(table.previewRows) && table.previewRows.length > 0)
  );
}

function tablesHaveSnapshotRows(tables: Array<{ sampleRows?: unknown; previewRows?: unknown }>) {
  return tables.some(tableHasSnapshotRows);
}

function storageObjectKeyFromConfig(configValue: unknown) {
  const config = asRecord(configValue);
  const storage = asRecord(config.storage);

  return typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
        : null;
}

function isFileDataSourceType(type: unknown) {
  return type === "EXCEL" || type === "CSV";
}

function hasPersistedFileData(source: { config: unknown }) {
  const config = asRecord(source.config);
  const hasInlineFile = typeof config.inlineFileBase64 === "string" && config.inlineFileBase64.trim().length > 0;
  const hasLocalPath = typeof config.storedFilePath === "string" && config.storedFilePath.trim().length > 0;

  return hasInlineFile || hasLocalPath || Boolean(storageObjectKeyFromConfig(config));
}

function unavailableFileDataMessage(dataSource: {
  name: string;
  type?: unknown;
  config: unknown;
}, fileReadError: unknown) {
  const config = asRecord(dataSource.config);
  const hasLocalPath = typeof config.storedFilePath === "string" && config.storedFilePath.trim();
  const hasCloudObject = Boolean(storageObjectKeyFromConfig(config));
  const hasInlineFile = typeof config.inlineFileBase64 === "string" && config.inlineFileBase64.trim();
  const readError = fileReadError instanceof Error ? fileReadError.message : null;

  if (isFileDataSourceType(dataSource.type) && hasLocalPath && !hasCloudObject && !hasInlineFile) {
    return `数据源「${dataSource.name}」的原始文件只保存在本机路径，线上环境无法读取。请重新上传该 Excel/CSV，让文件写入云存储后再生成报表。`;
  }

  if (isFileDataSourceType(dataSource.type) && readError) {
    return `数据源「${dataSource.name}」的原始文件读取失败：${readError}`;
  }

  return `数据源「${dataSource.name}」没有可用于计算的完整行数据。请重新上传或恢复数据源后再生成报表。`;
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

    const activeDataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: input.workspaceId,
        isActive: true,
        status: "CONNECTED"
      },
      orderBy: { updatedAt: "desc" }
    });
    const dataSources = selectKpiExecutionDataSources(activeDataSources);

    if (dataSources.length === 0) {
      throw new Error("No connected data source found for metric result execution");
    }

    const snapshots = await prisma.schemaSnapshot.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { dataSourceId: { in: dataSources.map((source) => source.id) } },
          { dataSourceId: null }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
    const snapshotBySource = new Map<string, typeof snapshots[number]>();
    const workspaceSnapshot = snapshots.find((snapshot) => !snapshot.dataSourceId) ?? null;

    for (const snapshot of snapshots) {
      if (snapshot.dataSourceId && !snapshotBySource.has(snapshot.dataSourceId)) {
        snapshotBySource.set(snapshot.dataSourceId, snapshot);
      }
    }

    const contextCandidates = await Promise.all(dataSources.map(async (dataSource, index) => {
      const snapshot = snapshotBySource.get(dataSource.id) ?? (index === 0 ? workspaceSnapshot : null);

      if (!snapshot) return null;

      const snapshotTables = tablesFromSchemaJson(snapshot.schemaJson);
      let fileReadError: unknown = null;
      const fileTables = isFileDataSourceType(dataSource.type) && hasPersistedFileData(dataSource)
        ? await tablesFromConnectedDataSourceFile(dataSource).catch((error) => {
            fileReadError = error;
            return null;
          })
        : null;
      const tablesForContext = (fileTables?.length ? fileTables : snapshotTables) as MetricResultContext["tables"];
      const dataUnavailableReason = isFileDataSourceType(dataSource.type) && !tablesHaveSnapshotRows(tablesForContext)
        ? unavailableFileDataMessage(dataSource, fileReadError)
        : null;

      return {
        dataSource,
        tables: tablesForContext,
        schemaJson: snapshot.schemaJson,
        dataUnavailableReason
      };
    }));
    const contexts: MetricResultContext[] = [];
    const dataUnavailableReasons: string[] = [];
    for (const context of contextCandidates) {
      if (context) {
        contexts.push(context);
        if (context.dataUnavailableReason) {
          dataUnavailableReasons.push(context.dataUnavailableReason);
        }
      }
    }

    if (contexts.length === 0) {
      throw new Error("No schema snapshot found for connected data sources");
    }

    if (contexts.every((context) => !tablesHaveSnapshotRows(context.tables)) && dataUnavailableReasons.length > 0) {
      throw new Error(dataUnavailableReasons[0]);
    }

    const latestSnapshot = snapshots[0];
    const tables = uniqueTables(contexts.flatMap((context) => context.tables));

    let metrics = await prisma.metricDefinition.findMany({
      where: { workspaceId: input.workspaceId, isActive: true },
      orderBy: { createdAt: "asc" }
    });
    let validatedMetrics = metrics.filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );

    if (validatedMetrics.length === 0) {
      await generateWorkspaceMetricsFromConnectedSources(prisma, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        dataSourceIds: dataSources.map((source) => source.id)
      });

      metrics = await prisma.metricDefinition.findMany({
        where: { workspaceId: input.workspaceId, isActive: true },
        orderBy: { createdAt: "asc" }
      });
      validatedMetrics = metrics.filter((metric) =>
        isBusinessFacingMetricDefinition(metric) &&
        validationFromLineage(metric.lineageJson)?.validation_status === "valid"
      );
    }

    const labels = activeTableLabels(tables);
    const tableScopedMetrics = metrics.filter((metric) => metricBelongsToTables(metric, labels));
    const tableScopedRegistryMetrics = tableScopedMetrics.filter(isBusinessMetricRegistryMetric);
    const tableScopedValidatedMetrics = tableScopedMetrics.filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );

    if (validatedMetrics.length > 0 && tableScopedValidatedMetrics.length === 0) {
      await validateWorkspaceMetrics(prisma, {
        workspaceId: input.workspaceId,
        tables
      });

      metrics = await prisma.metricDefinition.findMany({
        where: { workspaceId: input.workspaceId, isActive: true },
        orderBy: { createdAt: "asc" }
      });
    }

    const refreshedTableScopedMetrics = metrics.filter((metric) => metricBelongsToTables(metric, labels));
    const refreshedTableScopedRegistryMetrics = refreshedTableScopedMetrics.filter(isBusinessMetricRegistryMetric);
    const refreshedValidatedMetrics = refreshedTableScopedMetrics.filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );
    const effectiveTableScopedRegistryMetrics = refreshedTableScopedRegistryMetrics.length > 0
      ? refreshedTableScopedRegistryMetrics
      : tableScopedRegistryMetrics;
    const effectiveValidatedMetrics = refreshedValidatedMetrics.length > 0
      ? refreshedValidatedMetrics
      : tableScopedValidatedMetrics;
    let orchestrationPlan = buildKpiOrchestrationPlan({
      dataSources: activeDataSources,
      tables,
      metrics: effectiveValidatedMetrics
    });
    const executableMetrics = metricsForKpiExecution({
      industry: orchestrationPlan.industry,
      metricGenerationPath: orchestrationPlan.metric_generation_path,
      metrics: effectiveValidatedMetrics
    });
    const semanticRuntime = new SemanticLayerRuntime(prisma);
    const semanticContext = semanticRuntime.createContext({
      workspaceId: input.workspaceId,
      dataSource: dataSources[0],
      schemaSnapshot: latestSnapshot,
      tables,
      metrics: executableMetrics
    });
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
      throw new Error(
        preReportDataAudit.failures[0] ??
        (input.reportLocale === "zh"
          ? "当前报告未通过数据口径校验。请确认数据源包含完整可计算行数据后再生成。"
          : "The report did not pass data-scope validation. Confirm the data source contains full computable rows before regenerating.")
      );
    }

    const shouldPersistFailedAuditReport = false;

    if (shouldPersistFailedAuditReport && !preReportDataAudit.passed) {
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
        profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
        locale: input.reportLocale,
        reportMode: effectiveReportMode,
        requestedReportMode: input.reportMode,
        reportTimeMode,
        generatedAt: new Date().toISOString(),
        dateRange: selectedDateRange,
        dataSourceIds: dataSources.map((source) => source.id),
        dataSourceName: dataSources.map((source) => source.name).join(input.reportLocale === "zh" ? "、" : ", "),
        kpiOrchestrationPlan: orchestrationPlan,
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

      const reportCache = await upsertReportMetricCache(prisma, {
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
      const reportRun = await upsertCompletedReportRun(prisma, {
        workspaceId: input.workspaceId,
        generatedByUserId: input.userId,
        primaryDataSourceId: dataSources[0]?.id ?? null,
        dataSourceIds: dataSources.map((source) => source.id),
        reportMode: effectiveReportMode,
        dateRange: effectiveDateRange,
        sourceSnapshotVersion: latestSnapshot.version,
        schemaSnapshotId: latestSnapshot.id,
        semanticSnapshotVersion: semanticContext.snapshotVersion,
        semanticSchemaHash: semanticContext.schemaHash,
        domain: semanticContext.domain,
        cacheKey: reportCache.cacheKey,
        payload: payloadJson,
        composedReport,
        briefingPayload: payloadJson,
        reportHistoryId: reportHistory?.id ?? null,
        dailyBriefingId: briefing.id
      });

      await markReportGenerationSucceeded({
        logId: input.generationLogId,
        workspaceId: input.workspaceId,
        reportId: reportRun.id
      });
      await prisma.reportGenerationJob.update({
        where: { id: input.jobId },
        data: {
          reportId: reportRun.id,
          status: ReportGenerationJobStatus.COMPLETED,
          completedAt: new Date(),
          metadata: {
            generatedAt: payloadJson.generatedAt,
            reportMode: effectiveReportMode,
            reportTimeMode,
            reportRunId: reportRun.id,
            cacheKey: reportCache.cacheKey,
            validationStatus: "failed",
            kpiOrchestrationPlan: orchestrationPlan,
            blockingIssues: preReportDataAudit.failures
          }
        }
      });
      return {
        ok: true,
        computedMetricCount: 0,
        generatedAt: payloadJson.generatedAt,
        reportId: reportRun.id,
        reportRunId: reportRun.id,
        payload: attachReportRunMetadata(payloadJson, reportRun)
      };
    }
    const executableMetricRegistryId = registryFromMetricDefinitions(executableMetrics);
    if (effectiveTableScopedRegistryMetrics.length > 0) {
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
    }

    const { metricResults: rawMetricResults, metricRegistryId } = await semanticRuntime.runQuery(
      {
        domain: semanticContext.domain,
        metricIds: executableMetrics.map((metric) => metric.id)
      },
      semanticContext,
      () => calculateVerifiedMetrics({
        contexts,
        metrics: executableMetrics,
        dateRange: effectiveDateRange
      })
    );
    orchestrationPlan = markKpiExecutionStep(orchestrationPlan, "metrics_computed");
    const metricResults = mergeFinalMetricResults(rawMetricResults);
    const finalMetricResults = finalMetricResultsView(metricResults);
    const displayableMetricResults = metricResults.filter((result) => hasDisplayableMetricResult(result));
    const metricResultGroups = groupMetricResultsByType(metricResults);
    const aggregationResults = await buildAggregationResults({
      contexts,
      metricResults,
      dateRange: effectiveDateRange
    });
    semanticRuntime.validateNoCrossDomainLeak({ metricResults, aggregationResults }, semanticContext);
    orchestrationPlan = markKpiExecutionStep(orchestrationPlan, "aggregation_completed");
    if (!reportMetricPayloadHasReusableReport({
      metricResults,
      final_metricResults: finalMetricResults,
      aggregationResults
    }, input.reportMode)) {
      throw new Error(input.reportLocale === "zh"
        ? "当前数据源没有生成可展示的业务指标。请确认原始文件可读取、日期范围包含数据，并重新生成报表。"
        : "The current data source did not produce displayable business metrics. Confirm the source file is readable and the selected date range contains rows, then regenerate the report.");
    }
    const reportTimeArtifacts = buildReportTimeArtifacts(aggregationResults, effectiveDateRange, input.reportLocale);
    const reportDataAudit = await buildReportDataAudit({
      contexts,
      reportType: input.reportMode,
      metricDefinitions: executableMetrics,
      dateRange: effectiveDateRange,
      metricResults: metricResults as unknown as Array<Record<string, unknown>>,
      aggregationResults: aggregationResults as unknown as Array<Record<string, unknown>>,
      trendMetrics: reportTimeArtifacts.trendMetrics as Array<Record<string, unknown>>
    });
    orchestrationPlan = markKpiExecutionStep(orchestrationPlan, "consistency_checked");
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
    orchestrationPlan = markKpiExecutionStep(orchestrationPlan, "ai_invoked");
    const snapshotSchema = asRecord(latestSnapshot.schemaJson);
    const snapshotMetricRegistry = asRecord(snapshotSchema.metricRegistry);
    const logisticsKpiOperatingSystem = asRecord(snapshotSchema.logisticsKpiOperatingSystem);
    const reportSpec = buildReportSpec({
      schemaSnapshot: latestSnapshot.schemaJson,
      domain: String(snapshotMetricRegistry.industry ?? metricResults.find((metric) => metric.businessType)?.businessType ?? "generic"),
      metricResults,
      domainRegistry: executableMetrics.map((metric) => {
        const lineage = asRecord(metric.lineageJson);
        return {
          metricId: String(lineage.metricId ?? metric.name),
          businessName: String(lineage.businessName ?? lineage.displayName ?? metric.name),
          displayName: String(lineage.displayName ?? metric.name),
          priority: typeof lineage.priority === "number" ? lineage.priority : null,
          category: metric.category
        };
      }),
      scoringModel: asRecord(logisticsKpiOperatingSystem.scoring_model),
      impactModel: asRecord(logisticsKpiOperatingSystem.impact_model)
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
    const aiReport = buildKpiAiReportJson({
      metricResults: metricResults as unknown as Array<Record<string, unknown>>,
      aggregationResults: aggregationResults as unknown as Array<Record<string, unknown>>,
      auditReport: reportDataAudit as unknown as Record<string, unknown>,
      composedReport: composedReport as unknown as Record<string, unknown>
    });
    const metricSnapshotResult = await saveMetricSnapshots(prisma, {
      workspaceId: input.workspaceId,
      metricResults,
      timeConfig: effectiveTimeConfig,
      dataSourceId: latestSnapshot.dataSourceId ?? dataSources[0]?.id ?? null,
      schemaVersion: latestSnapshot.version,
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
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      locale: input.reportLocale,
      reportMode: effectiveReportMode,
      requestedReportMode: input.reportMode,
      reportTimeMode,
      metricRegistryId,
      semanticContext: semanticContext.trace,
      generatedAt: new Date().toISOString(),
      dateRange: selectedDateRange,
      dataSourceIds: dataSources.map((source) => source.id),
      dataSourceName: dataSources.map((source) => source.name).join(input.reportLocale === "zh" ? "、" : ", "),
      kpiOrchestrationPlan: markKpiExecutionStep(orchestrationPlan, "report_generated"),
      fullSummary,
      metricResults,
      final_metricResults: finalMetricResults,
      aiReport,
      verifiedMetrics: metricResults,
      metricResultGroups,
      aggregationResults,
      reportDataAudit,
      timeConfig: effectiveTimeConfig,
      trendMetrics: reportTimeArtifacts.trendMetrics,
      trendCharts: reportTimeArtifacts.trendCharts,
      reportSpec,
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

    const reportCache = await upsertReportMetricCache(prisma, {
      ...cacheIdentity,
      payload: payloadJson,
      sourceSnapshotVersion: latestSnapshot.version,
      domain: semanticContext.domain,
      semanticSnapshotVersion: semanticContext.snapshotVersion,
      semanticSchemaHash: semanticContext.schemaHash,
      queryHash: stableHash({
        reportMode: input.reportMode,
        dateRange: {
          preset: effectiveDateRange.preset,
          startDate: effectiveDateRange.startDate ?? null,
          endDate: effectiveDateRange.endDate ?? null
        }
      })
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
    const reportRun = await upsertCompletedReportRun(prisma, {
      workspaceId: input.workspaceId,
      generatedByUserId: input.userId,
      primaryDataSourceId: dataSources[0]?.id ?? null,
      dataSourceIds: dataSources.map((source) => source.id),
      reportMode: effectiveReportMode,
      dateRange: effectiveDateRange,
      sourceSnapshotVersion: latestSnapshot.version,
      schemaSnapshotId: latestSnapshot.id,
      semanticSnapshotVersion: semanticContext.snapshotVersion,
      semanticSchemaHash: semanticContext.schemaHash,
      domain: semanticContext.domain,
      cacheKey: reportCache.cacheKey,
      payload: payloadJson,
      composedReport,
      briefingPayload: payloadJson,
      reportHistoryId: reportHistory?.id ?? null,
      dailyBriefingId: briefing?.id ?? null
    });
    const reportId = reportRun.id;

    await markReportGenerationSucceeded({
      logId: input.generationLogId,
      workspaceId: input.workspaceId,
      reportId
    });

    await prisma.reportGenerationJob.update({
      where: { id: input.jobId },
      data: {
        reportId,
        status: ReportGenerationJobStatus.COMPLETED,
        completedAt: new Date(),
        metadata: {
          computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length,
          generatedAt: payloadJson.generatedAt,
          reportMode: effectiveReportMode,
          reportTimeMode,
          reportRunId: reportRun.id,
          cacheKey: reportCache.cacheKey,
          kpiOrchestrationPlan: payloadJson.kpiOrchestrationPlan,
          briefingId: briefing?.id ?? null,
          reportHistoryId: reportHistory?.id ?? null
        }
      }
    });
    return {
      ok: true,
      computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length,
      generatedAt: payloadJson.generatedAt,
      reportId,
      reportRunId: reportRun.id,
      payload: attachReportRunMetadata(payloadJson, reportRun)
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
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    logWorkspaceContext("[workspace-context] dashboard.reports.generate.POST", session);
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
    const connectedDataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true,
        status: "CONNECTED"
      },
      orderBy: { updatedAt: "desc" }
    });
    if (connectedDataSources.length === 0) {
      return NextResponse.json({
        ok: true,
        async: false,
        status: "empty",
        code: "NO_CONNECTED_DATA_SOURCE",
        computedMetricCount: 0,
        generatedAt: null,
        message: reportLocale === "zh" ? "当前没有已连接的数据源。" : "No connected data source is currently available.",
        report: null,
        metrics: {
          metricResults: [],
          final_metricResults: [],
          count: 0
        },
        aggregation: {
          aggregationResults: [],
          count: 0
        },
        ai_insights: null,
        metadata: {
          jobId: null,
          reportId: null,
          generatedAt: null,
          reportMode,
          requestedReportMode: reportMode,
          dateRange: null,
          dataSourceIds: [],
          dataSourceName: null,
          metricRegistryId: null,
          kpiOrchestrationPlan: null,
          cache: null,
          message: reportLocale === "zh" ? "当前没有已连接的数据源。" : "No connected data source is currently available."
        }
      });
    }
    const selectedDataSources = selectKpiExecutionDataSources(connectedDataSources);
    if (selectedDataSources.length === 0) {
      return NextResponse.json({
        ok: true,
        async: false,
        status: "empty",
        code: "NO_SELECTED_DATA_SOURCE",
        computedMetricCount: 0,
        generatedAt: null,
        message: reportLocale === "zh" ? "当前没有可执行的数据源。" : "No executable data source is currently available."
      });
    }
    const requestedDateRange = payloadRecord.dateRange
      ? normalizeReportDateRange(payloadRecord.dateRange)
      : defaultDateRangeForReportMode(reportMode);
    const resolvedDateRange = resolveReportDateRange(requestedDateRange);
    const activeSourceIds = selectedDataSources.map((source) => source.id);
    const cacheSemanticContext = await new SemanticLayerRuntime(prisma).resolveContext(session.workspace.id, activeSourceIds[0]);
    const sourceSnapshot = await latestWorkspaceSnapshotMeta(session.workspace.id, activeSourceIds);
    const sourceSnapshotVersion = sourceSnapshot?.version ?? null;
    const latestDataDate = await latestCachedReportDataDate(session.workspace.id) ?? resolvedDateRange.endDate;
    const effectiveCachedDateRange = reportMetricTimeWindow({
      reportMode,
      requestedRange: {
        preset: resolvedDateRange.preset,
        startDate: resolvedDateRange.startDate,
        endDate: resolvedDateRange.endDate,
        previousStartDate: resolvedDateRange.previousStart ? resolvedDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: resolvedDateRange.previousEnd ? resolvedDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      latestDataDate
    });
    const cachedReport = await getReportMetricCache(prisma, {
      workspaceId: session.workspace.id,
      dateRange: {
        preset: effectiveCachedDateRange.preset,
        startDate: effectiveCachedDateRange.startDate,
        endDate: effectiveCachedDateRange.endDate,
        previousStartDate: effectiveCachedDateRange.previousStart ? effectiveCachedDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: effectiveCachedDateRange.previousEnd ? effectiveCachedDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      sourceSnapshotVersion,
      dataSourceIds: activeSourceIds,
      domain: cacheSemanticContext.domain,
      semanticSnapshotVersion: cacheSemanticContext.snapshotVersion,
      semanticSchemaHash: cacheSemanticContext.schemaHash,
      queryHash: stableHash({
        reportMode,
        dateRange: {
          preset: effectiveCachedDateRange.preset,
          startDate: effectiveCachedDateRange.startDate ?? null,
          endDate: effectiveCachedDateRange.endDate ?? null
        }
      })
    });
    const cachedMetricCount = Array.isArray(cachedReport.payload?.metricResults)
      ? cachedReport.payload.metricResults.length
      : 0;
    const forceRefresh = asRecord(payloadRecord.execution_flags).forceRefresh === true || payloadRecord.forceRefresh === true;
    const reportRunScope = {
      workspaceId: session.workspace.id,
      generatedByUserId: session.user.id,
      primaryDataSourceId: cacheSemanticContext.dataSourceId,
      dataSourceIds: activeSourceIds,
      reportMode,
      dateRange: effectiveCachedDateRange,
      sourceSnapshotVersion,
      schemaSnapshotId: sourceSnapshot?.id ?? null,
      semanticSnapshotVersion: cacheSemanticContext.snapshotVersion,
      semanticSchemaHash: cacheSemanticContext.schemaHash,
      domain: cacheSemanticContext.domain,
      cacheKey: cachedReport.cacheKey
    };
    const existingReportRun = !forceRefresh
      ? await findCompletedReportRun(prisma, reportRunScope)
      : null;

    if (existingReportRun) {
      const payload = attachReportRunMetadata(asRecord(existingReportRun.payloadJson), existingReportRun);
      const runtime = buildKpiRuntimeApiResponse({
        status: "cached",
        payload,
        reportId: existingReportRun.id,
        computedMetricCount: Array.isArray(payload.metricResults) ? payload.metricResults.length : 0,
        message: reportLocale === "zh" ? "已使用已生成报告。" : "Using existing report run."
      });
      return NextResponse.json({
        ok: true,
        async: false,
        cached: true,
        reportRunId: existingReportRun.id,
        reportId: existingReportRun.id,
        computedMetricCount: Array.isArray(payload.metricResults) ? payload.metricResults.length : 0,
        generatedAt: payload.generatedAt,
        message: reportLocale === "zh" ? "已使用已生成报告。" : "Using existing report run.",
        reportScope: reportRunScopeMetadata(reportRunScope),
        ...runtime
      });
    }

    if (!forceRefresh && cachedReport.payload && cachedReport.status === "hit" && reportMetricPayloadHasReusableReport(cachedReport.payload, reportMode)) {
      const reportRun = await upsertCompletedReportRun(prisma, {
        ...reportRunScope,
        payload: cachedReport.payload,
        composedReport: asRecord(cachedReport.payload.composedReports)[reportMode] ?? cachedReport.payload,
        briefingPayload: cachedReport.payload
      });
      const payload = attachReportRunMetadata(asRecord(cachedReport.payload), reportRun);
      const runtime = buildKpiRuntimeApiResponse({
        status: "cached",
        payload,
        reportId: reportRun.id,
        computedMetricCount: cachedMetricCount,
        message: reportLocale === "zh" ? "已使用缓存报告。" : "Using cached report."
      });
      return NextResponse.json({
        ok: true,
        async: false,
	        cached: true,
	        reportRunId: reportRun.id,
	        reportId: reportRun.id,
	        computedMetricCount: cachedMetricCount,
	        generatedAt: payload.generatedAt,
	        message: reportLocale === "zh" ? "已使用缓存报告。" : "Using cached report.",
	        reportScope: reportRunScopeMetadata(reportRunScope),
	        ...runtime
	      });
	    }
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

    const generationResult = await runReportGenerationJob({
      jobId: generationJob.id,
      generationLogId: generationAccess.log.id,
      workspaceId: session.workspace.id,
      userId: session.user.id,
      reportLocale,
      reportMode,
      resolvedDateRange
    });

    if (!generationResult.ok) {
      const message = generationResult.message ?? (reportLocale === "zh" ? "报告生成失败。" : "Failed to generate report.");
      const runtime = buildKpiRuntimeApiResponse({
        status: "failed",
        jobId: generationJob.id,
        message
      });
      return NextResponse.json(
        {
          ok: false,
          async: false,
          jobId: generationJob.id,
          message,
          ...runtime
        },
        { status: 500 }
      );
    }

    const runtime = buildKpiRuntimeApiResponse({
      status: "completed",
      payload: generationResult.payload,
      jobId: generationJob.id,
      reportId: generationResult.reportId,
      computedMetricCount: generationResult.computedMetricCount ?? 0,
      message: reportLocale === "zh" ? "报告已生成。" : "Report generated."
    });

    return NextResponse.json(
      {
        ok: true,
        async: false,
        jobId: generationJob.id,
        computedMetricCount: generationResult.computedMetricCount ?? 0,
        generatedAt: generationResult.generatedAt,
        reportId: generationResult.reportId,
        message: reportLocale === "zh" ? "报告已生成。" : "Report generated.",
        ...runtime
      }
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
