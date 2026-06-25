import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { apiErrorResponse } from "@/lib/api-errors";
import { isBusinessFacingMetricDefinition, isBusinessFacingMetricText } from "@/lib/metric-visibility";
import { getReportEntitlementState } from "@/lib/report-entitlements";
import { dateRangeFromSearchParams, resolveReportDateRange, type DateRangePreset } from "@/lib/report-date-range";
import {
  composeReport,
  loadMetricSnapshots,
  normalizeReportMode,
  type ReportMode
} from "@/lib/report-composers";
import { reportMetricTimeWindow } from "@/lib/metrics/time-window-builder";
import {
  getReportMetricCache,
  stableHash,
  type ReportMetricCachePayload
} from "@/lib/report-metric-cache";
import { tablesFromSchemaJson } from "@/lib/metric-validation";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { fileExtension, inferTablesFromCsvText, inferTablesFromExcelBuffer } from "@/lib/file-upload-schema";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { buildKpiAiReportJson } from "@/lib/kpi-ai-report";
import { buildKpiFormulaBreakdowns } from "@/lib/kpi-formula-breakdown";
import { SemanticLayerRuntime } from "@/lib/semantic-layer-runtime";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function analysisReportFromSnapshot(snapshot: { schemaJson: unknown; qualityReport: unknown } | null) {
  if (!snapshot) {
    return null;
  }

  return asRecord(snapshot.qualityReport).analysisReport ?? asRecord(snapshot.schemaJson).analysisReport ?? null;
}

function usableKpiAssetLibrary(value: unknown) {
  const library = asRecord(value);
  const count = library.total_kpi_count;

  return typeof count === "number" && count > 0 ? value : null;
}

function kpiAssetLibraryFromSchemaPayload(schemaPayload: unknown, qualityReportPayload?: unknown) {
  const schemaJson = asRecord(schemaPayload);
  const qualityReport = asRecord(qualityReportPayload);
  const semanticLayer = asRecord(schemaJson.semanticLayer);
  const existingAssetLibrary = usableKpiAssetLibrary(semanticLayer.kpiAssetLibrary) ??
    usableKpiAssetLibrary(schemaJson.kpiAssetLibrary) ??
    usableKpiAssetLibrary(qualityReport.kpiAssetLibrary);

  if (existingAssetLibrary) {
    return existingAssetLibrary;
  }

  const tables = tablesFromSchemaJson(schemaPayload).map((table) => ({
    name: table.name,
    schema: table.schema ?? undefined,
    columns: table.columns.map((column) => ({
      name: column.name,
      displayName: column.displayName ?? undefined,
      semanticName: column.semanticName ?? undefined,
      rawHeaderPath: column.rawHeaderPath,
      type: column.type ?? "unknown",
      nullable: column.nullable ?? true
    }))
  }));

  if (tables.length === 0) {
    return null;
  }

  try {
    return usableKpiAssetLibrary(buildSemanticLayer(tables).kpiAssetLibrary);
  } catch {
    return null;
  }
}

function inlineUploadBuffer(config: Record<string, unknown>) {
  const encoded = typeof config.inlineFileBase64 === "string" ? config.inlineFileBase64 : null;

  if (!encoded) {
    return null;
  }

  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return null;
  }
}

function kpiAssetLibraryFromSnapshot(snapshot: { schemaJson: unknown; qualityReport: unknown } | null) {
  if (!snapshot) {
    return null;
  }

  return kpiAssetLibraryFromSchemaPayload(snapshot.schemaJson, snapshot.qualityReport);
}

function enrichKpiAssetLibraryWithSampleValues(assetLibrary: unknown, tables: Array<{
  name: string;
  schema?: string;
  sampleRows?: Array<Record<string, unknown>>;
}>) {
  const library = asRecord(assetLibrary);
  const registry = Array.isArray(library.kpi_registry) ? library.kpi_registry : [];

  if (registry.length === 0) {
    return assetLibrary;
  }

  const sampleByTable = new Map<string, Record<string, unknown>>();

  for (const table of tables) {
    const sample = Array.isArray(table.sampleRows) ? table.sampleRows[0] : null;

    if (!sample) continue;

    sampleByTable.set(table.name, sample);
    if (table.schema) sampleByTable.set(`${table.schema}.${table.name}`, sample);
  }

  return {
    ...library,
    kpi_registry: registry.map((item) => {
      const kpi = asRecord(item);
      const sourceColumns = Array.isArray(kpi.source_columns)
        ? kpi.source_columns.filter((source): source is string => typeof source === "string")
        : [];
      let sampleValue: unknown = null;

      for (const source of sourceColumns) {
        const separatorIndex = source.lastIndexOf(".");
        const tableName = separatorIndex >= 0 ? source.slice(0, separatorIndex) : "";
        const fieldName = separatorIndex >= 0 ? source.slice(separatorIndex + 1) : source;
        const sample = sampleByTable.get(tableName);
        const value = sample?.[fieldName];

        if (value !== undefined && value !== null && String(value).trim() !== "") {
          sampleValue = value;
          break;
        }
      }

      return sampleValue === null ? kpi : { ...kpi, sample_value: sampleValue };
    })
  };
}

function isoDateOnlyFromValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
  if (!text) return null;
  const direct = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (direct) {
    const [, year, month, day] = direct;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function dateColumnName(table: {
  columns?: Array<{ name?: string; type?: string | null; displayName?: string | null; semanticName?: string | null }>;
}) {
  const columns = Array.isArray(table.columns) ? table.columns : [];
  return columns.find((column) => /date|time/i.test(String(column.type ?? "")) || /日期|时间|date|day/i.test(`${column.name ?? ""} ${column.displayName ?? ""} ${column.semanticName ?? ""}`))?.name ?? null;
}

function availableDateRangeFromTables(tables: Array<{
  name?: string;
  columns?: Array<{ name?: string; type?: string | null; displayName?: string | null; semanticName?: string | null }>;
  sampleRows?: Array<Record<string, unknown>>;
}>) {
  let dateField: string | null = null;
  const dates: string[] = [];

  for (const table of tables) {
    const field = dateColumnName(table);
    if (!field) continue;
    dateField = dateField ?? field;
    for (const row of Array.isArray(table.sampleRows) ? table.sampleRows : []) {
      const date = isoDateOnlyFromValue(row[field]);
      if (date) dates.push(date);
    }
  }

  dates.sort();
  return {
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
    latestDataDate: dates.at(-1) ?? null,
    dateField
  };
}

async function availableDateRangeFromActiveSource(source: {
  name: string;
  schemas: unknown;
  config: unknown;
} | null) {
  if (!source) return null;

  const config = asRecord(source.config);
  const fileName = typeof config.fileName === "string" ? config.fileName : source.name;
  const extension = fileExtension(fileName);
  const storage = asRecord(config.storage);
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
        : null;

  try {
    if (objectKey) {
      const objectExtension = extension || fileExtension(objectKey);
      const tables = objectExtension === "csv"
        ? inferTablesFromCsvText(fileName, await readR2ObjectText(objectKey))
        : await inferTablesFromExcelBuffer(fileName, await readR2ObjectBuffer(objectKey));
      return availableDateRangeFromTables(tables);
    }

    const inlineBuffer = inlineUploadBuffer(config);

    if (inlineBuffer) {
      const tables = extension === "csv"
        ? inferTablesFromCsvText(fileName, inlineBuffer.toString("utf8"))
        : await inferTablesFromExcelBuffer(fileName, inlineBuffer);
      return availableDateRangeFromTables(tables);
    }

    if (typeof config.storedFilePath === "string" && config.storedFilePath.trim()) {
      const buffer = await readFile(config.storedFilePath);
      const tables = extension === "csv"
        ? inferTablesFromCsvText(fileName, buffer.toString("utf8"))
        : await inferTablesFromExcelBuffer(fileName, buffer);
      return availableDateRangeFromTables(tables);
    }
  } catch {
    return null;
  }

  return availableDateRangeFromTables(tablesFromSchemaJson(source.schemas).map((table) => ({
    name: table.name,
    columns: table.columns,
    sampleRows: Array.isArray((table as typeof table & { sampleRows?: unknown }).sampleRows)
      ? (table as typeof table & { sampleRows: Array<Record<string, unknown>> }).sampleRows
      : []
  })));
}

async function kpiAssetLibraryFromActiveSource(source: {
  name: string;
  schemas: unknown;
  config: unknown;
} | null) {
  if (!source) {
    return null;
  }

  const fromStoredSchema = kpiAssetLibraryFromSchemaPayload(source.schemas);

  if (fromStoredSchema) {
    return fromStoredSchema;
  }

  const config = asRecord(source.config);
  const fileName = typeof config.fileName === "string" ? config.fileName : source.name;
  const extension = fileExtension(fileName);
  const storage = asRecord(config.storage);
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
        : null;

  try {
    if (objectKey) {
      const objectExtension = extension || fileExtension(objectKey);
      const tables = objectExtension === "csv"
        ? inferTablesFromCsvText(fileName, await readR2ObjectText(objectKey))
        : await inferTablesFromExcelBuffer(fileName, await readR2ObjectBuffer(objectKey));

      return usableKpiAssetLibrary(enrichKpiAssetLibraryWithSampleValues(buildSemanticLayer(tables).kpiAssetLibrary, tables));
    }

    const inlineBuffer = inlineUploadBuffer(config);

    if (inlineBuffer) {
      const tables = extension === "csv"
        ? inferTablesFromCsvText(fileName, inlineBuffer.toString("utf8"))
        : await inferTablesFromExcelBuffer(fileName, inlineBuffer);

      return usableKpiAssetLibrary(enrichKpiAssetLibraryWithSampleValues(buildSemanticLayer(tables).kpiAssetLibrary, tables));
    }

    if (typeof config.storedFilePath === "string" && config.storedFilePath.trim()) {
      const buffer = await readFile(config.storedFilePath);
      const tables = extension === "csv"
        ? inferTablesFromCsvText(fileName, buffer.toString("utf8"))
        : await inferTablesFromExcelBuffer(fileName, buffer);

      return usableKpiAssetLibrary(enrichKpiAssetLibraryWithSampleValues(buildSemanticLayer(tables).kpiAssetLibrary, tables));
    }
  } catch {
    return null;
  }

  return null;
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

function isFailedGuardrailPayload(payload: unknown) {
  const record = asRecord(payload);
  const audit = asRecord(record.reportDataAudit);

  return record.generatedFrom === "full_data_guardrail" ||
    audit.passed === false ||
    (Array.isArray(record.metricResults) && record.metricResults.length === 0 &&
      Array.isArray(record.aggregationResults) && record.aggregationResults.length === 0);
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

function availableDateRangeFromPayload(payload: unknown) {
  const record = asRecord(payload);
  const audit = asRecord(record.reportDataAudit);
  const timeConfig = asRecord(record.timeConfig);
  const dateRange = asRecord(record.dateRange);
  const startDate = typeof audit.dateRangeStart === "string"
    ? audit.dateRangeStart
    : typeof audit.startDate === "string"
      ? audit.startDate
      : typeof timeConfig.startDate === "string"
        ? timeConfig.startDate
        : typeof dateRange.startDate === "string"
          ? dateRange.startDate
          : null;
  const endDate = typeof audit.dateRangeEnd === "string"
    ? audit.dateRangeEnd
    : typeof audit.endDate === "string"
      ? audit.endDate
      : typeof timeConfig.endDate === "string"
        ? timeConfig.endDate
        : typeof dateRange.endDate === "string"
          ? dateRange.endDate
          : null;
  const latestDataDate = typeof audit.latestDataDate === "string"
    ? audit.latestDataDate
    : typeof dateRange.latestDataDate === "string"
      ? dateRange.latestDataDate
      : endDate;
  const dateField = typeof audit.dateField === "string"
    ? audit.dateField
    : typeof timeConfig.defaultTimeField === "string"
      ? timeConfig.defaultTimeField
      : typeof dateRange.dateField === "string"
        ? dateRange.dateField
        : null;

  if (!startDate) {
    return null;
  }

  return { startDate, endDate, latestDataDate, dateField };
}

function filterBriefingMetricResults<T extends { payloadJson?: unknown } | null>(
  briefing: T,
  _visibleMetricIds: Set<string>,
  _visibleMetricsById: Map<string, {
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
        return isBusinessFacingMetricText([
          typeof record.metricName === "string" ? record.metricName : undefined,
          typeof record.displayName === "string" ? record.displayName : undefined,
          typeof record.kpiName === "string" ? record.kpiName : undefined,
          typeof record.formula === "string" ? record.formula : undefined,
          typeof record.metricCategory === "string" ? record.metricCategory : undefined,
          typeof record.sourceDataset === "string" ? record.sourceDataset : undefined
        ]);
      })
    }
  } as T;
}

async function latestWorkspaceSnapshotVersion(workspaceId: string, dataSourceIds: string[] = []) {
  const snapshot = await prisma.schemaSnapshot.findFirst({
    where: {
      workspaceId,
      ...(dataSourceIds.length ? { dataSourceId: { in: dataSourceIds } } : {})
    },
    orderBy: { createdAt: "desc" },
    select: { version: true }
  });

  return snapshot?.version ?? null;
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

function ensureAiReportPayload<T extends Record<string, unknown>>(payload: T): T {
  const existingAiReport = asRecord(payload.aiReport);
  const nestedDailyReport = asRecord(asRecord(payload.composedReports).daily_brief);
  const hasDimensionComparisons =
    Array.isArray(payload.dimensionComparisons) ||
    Array.isArray(nestedDailyReport.dimensionComparisons);
  const causalChainNodes = Array.isArray(asRecord(existingAiReport.causal_chain_analysis).chain_nodes)
    ? asRecord(existingAiReport.causal_chain_analysis).chain_nodes as Array<Record<string, unknown>>
    : [];
  const requiredCausalStagesHaveData = ["问题解决率下降", "KPI总分下降"].every((stage) => {
    const node = causalChainNodes.find((item) => String(item.stage ?? "") === stage);
    if (!node) return false;
    return node.status !== "missing" && (
      node.value !== null && node.value !== undefined ||
      node.score !== null && node.score !== undefined ||
      node.rate !== null && node.rate !== undefined
    );
  });

  const hasCurrentAnalysisShape =
    (existingAiReport.analysisVersion === "ecommerce_object_attention_v1" ||
      existingAiReport.analysisVersion === "metric_object_attention_v1") &&
    Array.isArray(existingAiReport.driver_analysis) &&
    Array.isArray(existingAiReport.causal_chains) &&
    Boolean(existingAiReport.causal_chain_analysis && typeof existingAiReport.causal_chain_analysis === "object") &&
    Array.isArray(asRecord(existingAiReport.causal_chain_analysis).chain_nodes) &&
    requiredCausalStagesHaveData &&
    Boolean(existingAiReport.insights && typeof existingAiReport.insights === "object") &&
    Array.isArray(payload.formulaBreakdowns);

  if (hasCurrentAnalysisShape && !hasDimensionComparisons) {
    return payload;
  }

  const metricResults = Array.isArray(payload.metricResults) ? payload.metricResults as Array<Record<string, unknown>> : [];
  const aggregationResults = Array.isArray(payload.aggregationResults) ? payload.aggregationResults as Array<Record<string, unknown>> : [];

  if (metricResults.length === 0 && aggregationResults.length === 0) return payload;

  return {
    ...payload,
    formulaBreakdowns: buildKpiFormulaBreakdowns(metricResults),
    aiReport: buildKpiAiReportJson({
      metricResults,
      aggregationResults,
      auditReport: asRecord(payload.reportDataAudit),
      composedReport: payload
    })
  };
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

function reportMetricPayloadHasValues(payload: ReportMetricCachePayload | null) {
  const metricResults = Array.isArray(payload?.metricResults) ? payload.metricResults : [];

  return metricResults.some(metricResultHasExplicitValue);
}

function arrayHasItems(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function reportMetricPayloadHasMetricArtifacts(payload: ReportMetricCachePayload) {
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

function reportMetricPayloadHasReusableReport(payload: ReportMetricCachePayload | null, reportMode?: ReportMode) {
  if (!payload) return false;
  if (isFailedGuardrailPayload(payload)) return false;
  if (reportMetricPayloadHasValues(payload)) return true;
  void reportMode;

  return reportMetricPayloadHasMetricArtifacts(payload);
}

function reportMetricCacheMissPayload(
  dateRange: ReturnType<typeof reportMetricTimeWindow>,
  cacheKey: string
): ReportMetricCachePayload {
  return withCacheMeta({
    generatedAt: new Date().toISOString(),
    dateRange: {
      preset: dateRange.preset,
      startDate: dateRange.startDate ?? null,
      endDate: dateRange.endDate ?? null,
      previousStartDate: dateRange.previousStart ? dateRange.previousStart.toISOString().slice(0, 10) : null,
      previousEndDate: dateRange.previousEnd ? dateRange.previousEnd.toISOString().slice(0, 10) : null
    },
    metricResults: [],
    verifiedMetrics: [],
    final_metricResults: [],
    aggregationResults: [],
    trendMetrics: [],
    trendCharts: [],
    timeConfig: {
      hasTimeField: true,
      selectedRange: dateRange.preset,
      startDate: dateRange.startDate ?? null,
      endDate: dateRange.endDate ?? null
    }
  }, "miss", cacheKey);
}

function shouldBypassReportCache(payload: ReportMetricCachePayload | null, reportMode: ReportMode) {
  if (!payload) return false;

  const audit = asRecord(payload.reportDataAudit);
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
    const hasLogisticsKpiReport =
      Boolean(payload.aiReport && typeof payload.aiReport === "object") ||
      Array.isArray(payload.formulaBreakdowns) ||
      Array.isArray(payload.final_metricResults);
    if (!hasLogisticsKpiReport) {
      if (!Array.isArray(dailyReport.dimensionComparisons) || dailyReport.dimensionComparisons.length === 0) {
        return true;
      }
      if (Number(dailyReport.keyFindingsVersion ?? 0) < 2) {
        return true;
      }
    }
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
    if (reportMetricPayloadHasReusableReport(payload, reportMode)) {
      return false;
    }
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

export async function GET(request: Request) {
  try {
    const session = await syncCurrentClerkUser();

    if (!session) {
      return NextResponse.json({ hasData: false, briefing: null, insights: [], recommendations: [] }, { status: 401 });
    }

    const url = new URL(request.url);
    const resolvedDateRange = resolveReportDateRange(dateRangeFromSearchParams(url.searchParams));
    const requestedReportMode = normalizeReportMode(url.searchParams.get("reportMode"));
    const locale = session.user.locale === "zh" ? "zh" : "en";
    const activeSource = await prisma.dataSourceConnection.findFirst({
      where: {
        workspaceId: session.workspace.id,
        isActive: true,
        status: "CONNECTED"
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        id: true,
        name: true,
        schemas: true,
        config: true
      }
    });

    if (!activeSource) {
      return NextResponse.json({
        workspaceId: session.workspace.id,
        hasData: false,
        hasConnectedDataSource: false,
        status: "empty",
        code: "NO_CONNECTED_DATA_SOURCE",
        message: locale === "zh" ? "当前没有已连接的数据源。" : "No connected data source is currently available.",
        briefing: null,
        insights: [],
        recommendations: [],
        reportHistory: [],
        requestedLocale: locale,
        reportLocale: locale,
        usedLocaleFallback: false,
        reportEntitlement: null,
        analysisReport: null,
        kpiAssetLibrary: null,
        availableDateRange: null
      });
    }

    const activeSourceIds = [activeSource.id];
    const cacheSemanticContext = await new SemanticLayerRuntime(prisma).resolveContext(session.workspace.id, activeSource.id);
    const sourceSnapshotVersion = await latestWorkspaceSnapshotVersion(session.workspace.id, activeSourceIds);
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
    const selectedBriefing = briefing && !isFailedGuardrailPayload(briefing.payloadJson)
      ? briefing
      : null;
    const selectedBriefingPayload = selectedBriefing
      ? asRecord(selectedBriefing.payloadJson) as ReportMetricCachePayload
      : null;
    const selectedBriefingHasReusableReport = reportMetricPayloadHasReusableReport(selectedBriefingPayload, requestedReportMode);
    const baseBriefing = selectedBriefingHasReusableReport ? selectedBriefing : null;

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: { in: activeSourceIds }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        schemaJson: true,
        qualityReport: true
      }
    });
    let availableDateRange: Awaited<ReturnType<typeof availableDateRangeFromActiveSource>> = null;
    const cachedLatestDataDate = latestDataDateFromPayload(selectedBriefing?.payloadJson) ??
      latestDataDateFromSnapshot(latestSnapshot);
    const needsAvailableDateRangeForWindow = requestedReportMode !== "custom_report" ||
      (
        resolvedDateRange.preset !== "ALL" &&
        (!resolvedDateRange.startDate || !resolvedDateRange.endDate)
      );
    if (!cachedLatestDataDate && needsAvailableDateRangeForWindow) {
      availableDateRange = await availableDateRangeFromActiveSource(activeSource);
    }
    const latestDataDate = cachedLatestDataDate ??
      availableDateRange?.latestDataDate ??
      availableDateRange?.endDate ??
      null;
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
    const cacheResult = await getReportMetricCache(prisma, {
      workspaceId: session.workspace.id,
      dateRange: {
        preset: effectiveRequestDateRange.preset,
        startDate: effectiveRequestDateRange.startDate,
        endDate: effectiveRequestDateRange.endDate,
        previousStartDate: effectiveRequestDateRange.previousStart ? effectiveRequestDateRange.previousStart.toISOString().slice(0, 10) : undefined,
        previousEndDate: effectiveRequestDateRange.previousEnd ? effectiveRequestDateRange.previousEnd.toISOString().slice(0, 10) : undefined
      },
      sourceSnapshotVersion,
      dataSourceIds: [cacheSemanticContext.dataSourceId],
      domain: cacheSemanticContext.domain,
      semanticSnapshotVersion: cacheSemanticContext.snapshotVersion,
      semanticSchemaHash: cacheSemanticContext.schemaHash,
      queryHash: stableHash({
        reportMode: requestedReportMode,
        dateRange: {
          preset: effectiveRequestDateRange.preset,
          startDate: effectiveRequestDateRange.startDate ?? null,
          endDate: effectiveRequestDateRange.endDate ?? null
        }
      })
    });
    const reusableCachePayload = shouldBypassReportCache(cacheResult.payload, requestedReportMode) || !reportMetricPayloadHasReusableReport(cacheResult.payload, requestedReportMode)
      ? null
      : cacheResult.payload;
    let rangedPayload: ReportMetricCachePayload | null = reusableCachePayload;

    if (rangedPayload && cacheResult.status === "stale") {
      rangedPayload = withCacheMeta(rangedPayload, "stale", cacheResult.cacheKey);
    } else if (rangedPayload) {
      rangedPayload = withCacheMeta(rangedPayload, "hit", cacheResult.cacheKey);
    } else {
      void Boolean(
        resolvedDateRange.preset !== "ALL" ||
        resolvedDateRange.startDate ||
        resolvedDateRange.endDate ||
        resolvedDateRange.previousStart ||
        resolvedDateRange.previousEnd
      );
      rangedPayload = null;
    }
    availableDateRange = availableDateRange ?? availableDateRangeFromPayload(rangedPayload);
    const rangedBriefing = rangedPayload
      ? baseBriefing
        ? {
            ...baseBriefing,
            payloadJson: ensureAiReportPayload({
              ...asRecord(baseBriefing.payloadJson),
              ...rangedPayload
            })
          }
        : {
            id: `computed-${requestedReportMode}-${rangedPayload.generatedAt}`,
            workspaceId: session.workspace.id,
            briefingDate: new Date(),
            title: locale === "zh" ? "实时业务报告" : "Live business report",
            summary: typeof asRecord(rangedPayload.structuredReport).coreSummary === "string"
              ? String(asRecord(rangedPayload.structuredReport).coreSummary)
              : locale === "zh"
                ? "已基于当前数据源生成实时报告。"
                : "Generated from the current data source.",
            confidence: 0,
            payloadJson: ensureAiReportPayload(rangedPayload),
            createdAt: new Date(),
            updatedAt: new Date(),
            insights: []
          }
      : baseBriefing;
    if (rangedPayload && reportMetricPayloadHasValues(rangedPayload)) {
      const insights = baseBriefing?.insights ?? [];
      const recommendations = insights.flatMap((insight) => insight.recommendations);
      const kpiAssetLibrary = kpiAssetLibraryFromSnapshot(latestSnapshot);

      return NextResponse.json({
        workspaceId: session.workspace.id,
        hasData: true,
        hasConnectedDataSource: true,
        briefing: rangedBriefing,
        insights,
        recommendations,
        reportHistory: [],
        requestedLocale: session.user.locale === "zh" ? "zh" : "en",
        reportLocale: briefingLocale(baseBriefing),
        usedLocaleFallback: false,
        reportEntitlement: null,
        analysisReport: analysisReportFromSnapshot(latestSnapshot),
        kpiAssetLibrary,
        availableDateRange
      });
    }

    const requestedSpecificDateRange = effectiveRequestDateRange.preset !== "ALL";
    if (requestedSpecificDateRange) {
      availableDateRange = availableDateRange ?? await availableDateRangeFromActiveSource(activeSource);
      const reportEntitlement = await getReportEntitlementState(session.workspace.id);
      const missPayload = reportMetricCacheMissPayload(effectiveRequestDateRange, cacheResult.cacheKey);

      return NextResponse.json({
        workspaceId: session.workspace.id,
        hasData: false,
        hasConnectedDataSource: true,
        status: "cache_miss",
        code: "REPORT_RANGE_NOT_GENERATED",
        message: locale === "zh"
          ? "当前时间范围尚未生成报告。点击生成报告后，会按所选时间范围计算并缓存结果。"
          : "No report has been generated for this time range. Generate the report to calculate and cache the selected range.",
        briefing: {
          id: `cache-miss-${requestedReportMode}-${cacheResult.cacheKey}`,
          workspaceId: session.workspace.id,
          briefingDate: new Date(),
          title: locale === "zh" ? "当前时间范围尚未生成" : "Range not generated",
          summary: "",
          confidence: 0,
          payloadJson: ensureAiReportPayload(missPayload),
          createdAt: new Date(),
          updatedAt: new Date(),
          insights: []
        },
        insights: [],
        recommendations: [],
        reportHistory: [],
        requestedLocale: session.user.locale === "zh" ? "zh" : "en",
        reportLocale: locale,
        usedLocaleFallback: false,
        reportEntitlement,
        analysisReport: analysisReportFromSnapshot(latestSnapshot),
        kpiAssetLibrary: await kpiAssetLibraryFromActiveSource(activeSource) ?? kpiAssetLibraryFromSnapshot(latestSnapshot),
        availableDateRange
      });
    }

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
    availableDateRange = availableDateRange ?? await availableDateRangeFromActiveSource(activeSource);
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
          payloadJson: ensureAiReportPayload({
            ...visiblePayload,
            composedReports
          })
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
    const insights = baseBriefing?.insights ?? [];
    const recommendations = insights.flatMap((insight) => insight.recommendations);
    const reportEntitlement = await getReportEntitlementState(session.workspace.id);
    const kpiAssetLibrary = await kpiAssetLibraryFromActiveSource(activeSource) ??
      kpiAssetLibraryFromSnapshot(latestSnapshot);
    return NextResponse.json({
      workspaceId: session.workspace.id,
      hasData: Boolean(briefingWithComposedReports || insights.length || recommendations.length),
      hasConnectedDataSource: true,
      briefing: briefingWithComposedReports,
      insights,
      recommendations,
      reportHistory,
      requestedLocale: session.user.locale === "zh" ? "zh" : "en",
      reportLocale: briefingLocale(baseBriefing),
      usedLocaleFallback: false,
      reportEntitlement,
      analysisReport: analysisReportFromSnapshot(latestSnapshot),
      kpiAssetLibrary,
      availableDateRange
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load report data");
  }
}
