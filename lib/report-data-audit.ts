import { DataSourceType, type DataSourceConnection } from "@prisma/client";
import { readCsvRowsFromStorageConfig } from "@/lib/csv-upload-rows";
import {
  findBusinessDateColumn,
  rowDateValue
} from "@/lib/report-date-range";
import type { SchemaTable } from "@/lib/metric-validation";
import {
  ecommerceBusinessFieldMap,
  validateFullDataAnalysisContext,
  type FullDataAnalysisGuardrailResult
} from "@/lib/skills/full-data-analysis-guardrail";

type AuditContext = {
  dataSource: Pick<DataSourceConnection, "id" | "name" | "type" | "config">;
  tables: SchemaTable[];
  schemaJson?: unknown;
};

export type ReportDataAudit = {
  passed: boolean;
  industry: "ecommerce" | "app_market" | "database" | "generic";
  dataScope: "full_file" | "database_query" | "sample_only" | "partial_data" | "unknown" | "mixed";
  totalRows: number | null;
  expectedFullRows: number | null;
  dailyRows: number | null;
  rowsUsedForMetrics: number | null;
  sampleRowsCount: number | null;
  dateField: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  latestDataDate: string | null;
  usesFullData: boolean;
  failures: string[];
  warnings: string[];
  requiredFixes: string[];
  analysisSource: string;
  businessFieldMap: Record<string, string>;
  fullDataGuardrail: FullDataAnalysisGuardrailResult;
  ecommerceFullDataMetrics: {
    totalRows: number;
    latestDataDate: string | null;
    dailyRows: number | null;
    totalOrders: number | null;
    totalCustomers: number | null;
    grossSales: number | null;
    netSales: number | null;
    totalPaid: number | null;
    aov: number | null;
    averageRating: number | null;
    averageRatingSampleSize: number;
    categoryOrders: Record<string, number>;
  } | null;
  ecommerceFields: {
    hasOrderId: boolean;
    hasCustomerId: boolean;
    hasGrossSales: boolean;
    hasNetSales: boolean;
    hasTotalPaid: boolean;
    hasQuantity: boolean;
    hasUnitPrice: boolean;
    hasReturnFlag: boolean;
    hasRating: boolean;
    hasFulfillmentDays: boolean;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function schemaTables(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  return Array.isArray(schema.tables)
    ? schema.tables.filter((table): table is Record<string, unknown> => Boolean(asRecord(table)))
    : [];
}

function schemaSampleRowsCount(schemaJson: unknown) {
  return schemaTables(schemaJson).reduce((sum, table) => {
    const sampleRows = Array.isArray(table.sampleRows) ? table.sampleRows : [];
    const previewRows = Array.isArray(table.previewRows) ? table.previewRows : [];
    return sum + Math.max(sampleRows.length, previewRows.length);
  }, 0);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateText: string, days: number) {
  const value = new Date(`${dateText}T00:00:00.000`);
  value.setDate(value.getDate() + days);
  return isoDate(value);
}

function hasColumn(columns: string[], candidates: string[]) {
  return candidates.some((candidate) => columns.some((column) => column === normalize(candidate) || column.includes(normalize(candidate))));
}

function ecommerceFieldProfile(columns: string[]) {
  return {
    hasOrderId: hasColumn(columns, ["order_id"]),
    hasCustomerId: hasColumn(columns, ["customer_id"]),
    hasGrossSales: hasColumn(columns, ["gross_sales"]),
    hasNetSales: hasColumn(columns, ["net_sales"]),
    hasTotalPaid: hasColumn(columns, ["total_paid", "paid_amount"]),
    hasQuantity: hasColumn(columns, ["quantity"]),
    hasUnitPrice: hasColumn(columns, ["unit_price", "price"]),
    hasReturnFlag: hasColumn(columns, ["is_returned", "return_status", "refund_status"]),
    hasRating: hasColumn(columns, ["customer_rating", "rating", "review_score"]),
    hasFulfillmentDays: hasColumn(columns, ["fulfillment_days", "delivery_days", "shipping_days"])
  };
}

function isEcommerceProfile(columns: string[]) {
  const fields = ecommerceFieldProfile(columns);
  const score = Object.values(fields).filter(Boolean).length;
  return (fields.hasOrderId && (fields.hasNetSales || fields.hasTotalPaid || fields.hasQuantity)) || score >= 5;
}

function businessFieldMapForColumns(columns: string[]) {
  return Object.fromEntries(
    columns.flatMap((column) => {
      const normalized = normalize(column);
      const label = ecommerceBusinessFieldMap[normalized];
      return label ? [[normalized, label]] : [];
    })
  );
}

function latestTrendDate(trendMetrics: Array<Record<string, unknown>> = []) {
  const dates = trendMetrics.flatMap((metric) => {
    const rows = Array.isArray(metric.timeSeries) ? metric.timeSeries : [];
    return rows.flatMap((row) => {
      const record = asRecord(row);
      const date = typeof record.date === "string" ? record.date : "";
      return /^\d{4}-\d{2}-\d{2}/.test(date) ? [date.slice(0, 10)] : [];
    });
  }).sort();
  return dates.at(-1) ?? null;
}

function mergeDataScope(current: ReportDataAudit["dataScope"] | null, next: ReportDataAudit["dataScope"]) {
  return current == null || current === next ? next : "mixed";
}

function expectedRowsFromContext(context: AuditContext) {
  return context.tables.reduce((max, table) => {
    const schemaTable = schemaTables(context.schemaJson).find((item) => normalize(String(item.name ?? "")) === normalize(table.name));
    const rowCount = Number(schemaTable?.rowCount ?? asRecord(table).rowCount);
    return Number.isFinite(rowCount) && rowCount > max ? rowCount : max;
  }, 0);
}

function storageObjectKey(config: Record<string, unknown>) {
  const storage = asRecord(config.storage);
  return typeof storage.key === "string" ? storage.key : null;
}

function storedFilePath(config: Record<string, unknown>) {
  return typeof config.storedFilePath === "string" ? config.storedFilePath : null;
}

function auditScopeFromGuardrail(scope: FullDataAnalysisGuardrailResult["dataScope"], isDatabaseSource: boolean): ReportDataAudit["dataScope"] {
  if (isDatabaseSource && scope === "FULL_DATA") return "database_query";
  if (scope === "FULL_DATA") return "full_file";
  if (scope === "SAMPLE_ONLY") return "sample_only";
  if (scope === "PARTIAL_DATA") return "partial_data";
  return "unknown";
}

function dateRangeFromRows(rows: Array<Record<string, unknown>>, table: SchemaTable) {
  const dateColumn = findBusinessDateColumn(table.columns);
  if (!dateColumn) return { dateField: null, dateRangeStart: null, dateRangeEnd: null, latestDataDate: null };
  const dates = rows
    .flatMap((row) => {
      const date = rowDateValue(row, dateColumn.name);
      return date ? [isoDate(date)] : [];
    })
    .sort();

  return {
    dateField: dateColumn.name,
    dateRangeStart: dates[0] ?? null,
    dateRangeEnd: dates.at(-1) ?? null,
    latestDataDate: dates.at(-1) ?? null
  };
}

function rowsOnBusinessDate(rows: Array<Record<string, unknown>>, table: SchemaTable, targetDate: string | null) {
  if (!targetDate) return 0;
  const dateColumn = findBusinessDateColumn(table.columns);
  if (!dateColumn) return 0;

  return rows.reduce((count, row) => {
    const date = rowDateValue(row, dateColumn.name);
    return date && isoDate(date) === targetDate ? count + 1 : count;
  }, 0);
}

function rowsForBusinessDate(rows: Array<Record<string, unknown>>, table: SchemaTable, targetDate: string | null) {
  if (!targetDate) return [];
  const dateColumn = findBusinessDateColumn(table.columns);
  if (!dateColumn) return [];

  return rows.filter((row) => {
    const date = rowDateValue(row, dateColumn.name);
    return date && isoDate(date) === targetDate;
  });
}

function rowsForBusinessDateRange(rows: Array<Record<string, unknown>>, table: SchemaTable, startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return [];
  const dateColumn = findBusinessDateColumn(table.columns);
  if (!dateColumn) return [];

  return rows.filter((row) => {
    const date = rowDateValue(row, dateColumn.name);
    if (!date) return false;
    const dateText = isoDate(date);
    return dateText >= startDate && dateText <= endDate;
  });
}

function rowValue(row: Record<string, unknown>, fieldName: string) {
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) return row[fieldName];
  const normalized = normalize(fieldName);
  const key = Object.keys(row).find((candidate) => normalize(candidate) === normalized);

  return key ? row[key] : undefined;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw || ["nan", "null", "undefined", "n/a", "na", "none"].includes(raw)) return null;
  const cleaned = value.replace(/[$,%+,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function findColumnName(table: SchemaTable, candidates: string[]) {
  return table.columns.find((column) => candidates.some((candidate) => normalize(column.name) === normalize(candidate)))?.name ??
    table.columns.find((column) => candidates.some((candidate) => normalize(column.name).includes(normalize(candidate))))?.name ??
    null;
}

function roundMetric(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function ecommerceMetricsFromRows(rows: Array<Record<string, unknown>>, table: SchemaTable, latestDate: string | null) {
  const orderColumn = findColumnName(table, ["order_id", "order"]);
  const customerColumn = findColumnName(table, ["customer_id", "customer"]);
  const grossSalesColumn = findColumnName(table, ["gross_sales"]);
  const netSalesColumn = findColumnName(table, ["net_sales"]);
  const totalPaidColumn = findColumnName(table, ["total_paid", "paid_amount"]);
  const ratingColumn = findColumnName(table, ["customer_rating", "rating", "review_score"]);
  const categoryColumn = findColumnName(table, ["category", "product_category"]);
  const orders = new Set<string>();
  const customers = new Set<string>();
  const categoryOrders: Record<string, number> = {};
  let grossSales = 0;
  let netSales = 0;
  let totalPaid = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const row of rows) {
    if (orderColumn) {
      const orderId = String(rowValue(row, orderColumn) ?? "").trim();
      if (orderId) orders.add(orderId);
    }
    if (customerColumn) {
      const customerId = String(rowValue(row, customerColumn) ?? "").trim();
      if (customerId) customers.add(customerId);
    }
    if (grossSalesColumn) grossSales += parseNumber(rowValue(row, grossSalesColumn)) ?? 0;
    if (netSalesColumn) netSales += parseNumber(rowValue(row, netSalesColumn)) ?? 0;
    if (totalPaidColumn) totalPaid += parseNumber(rowValue(row, totalPaidColumn)) ?? 0;
    if (ratingColumn) {
      const rating = parseNumber(rowValue(row, ratingColumn));
      if (rating != null) {
        ratingSum += rating;
        ratingCount += 1;
      }
    }
    if (categoryColumn) {
      const category = String(rowValue(row, categoryColumn) ?? "").trim();
      if (category) categoryOrders[category] = (categoryOrders[category] ?? 0) + 1;
    }
  }

  const totalOrders = orderColumn ? orders.size : rows.length;

  return {
    totalRows: rows.length,
    latestDataDate: latestDate,
    dailyRows: rowsOnBusinessDate(rows, table, latestDate),
    totalOrders,
    totalCustomers: customerColumn ? customers.size : null,
    grossSales: grossSalesColumn ? roundMetric(grossSales) : null,
    netSales: netSalesColumn ? roundMetric(netSales) : null,
    totalPaid: totalPaidColumn ? roundMetric(totalPaid) : null,
    aov: totalOrders > 0 && netSalesColumn ? roundMetric(netSales / totalOrders) : null,
    averageRating: ratingCount > 0 ? roundMetric(ratingSum / ratingCount, 4) : null,
    averageRatingSampleSize: ratingCount,
    categoryOrders
  };
}

function mergeEcommerceMetrics(
  current: ReportDataAudit["ecommerceFullDataMetrics"],
  next: NonNullable<ReportDataAudit["ecommerceFullDataMetrics"]>
) {
  if (!current) return next;
  const categoryOrders = { ...current.categoryOrders };
  for (const [category, count] of Object.entries(next.categoryOrders)) {
    categoryOrders[category] = (categoryOrders[category] ?? 0) + count;
  }
  const totalOrders = (current.totalOrders ?? 0) + (next.totalOrders ?? 0);
  const ratingSampleSize = current.averageRatingSampleSize + next.averageRatingSampleSize;
  const ratingSum = (current.averageRating ?? 0) * current.averageRatingSampleSize +
    (next.averageRating ?? 0) * next.averageRatingSampleSize;

  return {
    totalRows: current.totalRows + next.totalRows,
    latestDataDate: !current.latestDataDate || (next.latestDataDate && next.latestDataDate > current.latestDataDate) ? next.latestDataDate : current.latestDataDate,
    dailyRows: (current.dailyRows ?? 0) + (next.dailyRows ?? 0),
    totalOrders,
    totalCustomers: current.totalCustomers != null && next.totalCustomers != null ? current.totalCustomers + next.totalCustomers : current.totalCustomers ?? next.totalCustomers,
    grossSales: roundMetric((current.grossSales ?? 0) + (next.grossSales ?? 0)),
    netSales: roundMetric((current.netSales ?? 0) + (next.netSales ?? 0)),
    totalPaid: roundMetric((current.totalPaid ?? 0) + (next.totalPaid ?? 0)),
    aov: totalOrders > 0 ? roundMetric(((current.netSales ?? 0) + (next.netSales ?? 0)) / totalOrders) : null,
    averageRating: ratingSampleSize > 0 ? roundMetric(ratingSum / ratingSampleSize, 4) : null,
    averageRatingSampleSize: ratingSampleSize,
    categoryOrders
  };
}

function metricResultNumber(metricResults: Array<Record<string, unknown>>, patterns: RegExp[], formulaPatterns: RegExp[] = []) {
  const result = metricResults.find((item) => {
    const labelText = [
      item.metricName,
      item.displayName
    ].filter(Boolean).join(" ");
    const formulaText = String(item.formula ?? "");

    return patterns.some((pattern) => pattern.test(labelText)) ||
      formulaPatterns.some((pattern) => pattern.test(formulaText));
  });
  const value = result ? parseNumber(result.value) : null;

  return value == null ? null : roundMetric(value);
}

function categoryMetricRows(metricResults: Array<Record<string, unknown>>) {
  const result = metricResults.find((item) => {
    const text = [item.metricName, item.displayName, item.formula].filter(Boolean).join(" ");

    return /category/i.test(text) && /order|count|COUNT/i.test(text) && Array.isArray(item.rows);
  });

  return Array.isArray(result?.rows) ? result.rows.filter((row): row is Record<string, unknown> => Boolean(asRecord(row))) : [];
}

function addMetricMismatchFailures(
  failures: string[],
  fullMetrics: NonNullable<ReportDataAudit["ecommerceFullDataMetrics"]>,
  metricResults: Array<Record<string, unknown>>,
  expectedScopeLabel = "完整文件聚合值"
) {
  const checks: Array<[string, number | null, RegExp[], number]> = [
    ["Total Orders", fullMetrics.totalOrders, [/total orders/i, /^orders$/i, /订单数/], 0.01],
    ["Total Customers", fullMetrics.totalCustomers, [/total customers/i, /^customers$/i, /客户数/], 0.01],
    ["Gross Sales", fullMetrics.grossSales, [/gross sales/i], 0.01],
    ["Net Sales", fullMetrics.netSales, [/net sales/i], 0.01],
    ["Total Paid", fullMetrics.totalPaid, [/total paid/i], 0.01],
    ["AOV", fullMetrics.aov, [/\baov\b/i, /average order value/i], 0.01],
    ["Average Rating", fullMetrics.averageRating, [/average rating/i, /customer rating/i], 0.01]
  ];

  const formulaChecks: Record<string, RegExp[]> = {
    "Total Orders": [/^COUNT_DISTINCT\s*\([^)]*order/i, /^COUNT\s*\(\s*\*\s*\)$/i],
    "Total Customers": [/^COUNT_DISTINCT\s*\([^)]*customer/i]
  };

  for (const [label, expected, patterns, tolerance] of checks) {
    const actual = metricResultNumber(metricResults, patterns, formulaChecks[label] ?? []);
    if (expected != null && actual != null && Math.abs(actual - expected) > tolerance) {
      failures.push(`数据口径校验失败：${label} 指标结果 ${actual} 与${expectedScopeLabel} ${expected} 不一致。`);
    }
  }

  for (const row of categoryMetricRows(metricResults)) {
    const category = String(row.dimension ?? "").trim();
    const actual = parseNumber(row.value);
    const expected = category ? fullMetrics.categoryOrders[category] : null;
    if (category && expected != null && actual != null && Math.abs(actual - expected) > 0.01) {
      failures.push(`数据口径校验失败：${category} orders 指标结果 ${actual} 与${expectedScopeLabel} ${expected} 不一致。`);
    }
  }
}

function isDailyReport(reportType?: string) {
  return /daily|日报|brief/i.test(String(reportType ?? "")) && !/weekly|周报/i.test(String(reportType ?? ""));
}

function isWeeklyReport(reportType?: string) {
  return /weekly|周报/i.test(String(reportType ?? ""));
}

function isMonthlyReport(reportType?: string) {
  return /custom|monthly|month|月经营|月报|月度/i.test(String(reportType ?? ""));
}

function metricResultDateRange(metricResults?: Array<Record<string, unknown>>) {
  for (const metric of metricResults ?? []) {
    const start = typeof metric.dateRangeStart === "string" ? metric.dateRangeStart.slice(0, 10) : null;
    const end = typeof metric.dateRangeEnd === "string" ? metric.dateRangeEnd.slice(0, 10) : null;
    const preset = String(metric.dateRangePreset ?? "").toUpperCase();
    if (start && end && preset !== "ALL") return { start, end };
  }

  return { start: null, end: null };
}

export async function buildReportDataAudit(input: {
  contexts: AuditContext[];
  reportType?: string;
  trendMetrics?: Array<Record<string, unknown>>;
  aggregationResults?: Array<Record<string, unknown>>;
  metricResults?: Array<Record<string, unknown>>;
}) {
  const failures: string[] = [];
  const warnings: string[] = [];
  const allColumns = input.contexts.flatMap((context) => context.tables.flatMap((table) => table.columns.map((column) => normalize(column.name))));
  const ecommerceFields = ecommerceFieldProfile(allColumns);
  const isEcommerce = isEcommerceProfile(allColumns);
  const businessFieldMap = businessFieldMapForColumns(allColumns);
  let dataScope: ReportDataAudit["dataScope"] | null = null;
  let totalRows: number | null = 0;
  let expectedFullRows: number | null = 0;
  let dateField: string | null = null;
  let dateRangeStart: string | null = null;
  let latestDataDate: string | null = null;
  let dailyRows: number | null = null;
  let sampleRowsCount: number | null = 0;
  let fullContextCount = 0;
  let firstStoredFilePath: string | null = null;
  let firstStorageObjectKey: string | null = null;
  let hasDatabaseSource = false;
  let ecommerceFullDataMetrics: ReportDataAudit["ecommerceFullDataMetrics"] = null;
  let ecommerceDailyDataMetrics: ReportDataAudit["ecommerceFullDataMetrics"] = null;
  let ecommerceWeeklyDataMetrics: ReportDataAudit["ecommerceFullDataMetrics"] = null;
  let ecommerceMonthlyDataMetrics: ReportDataAudit["ecommerceFullDataMetrics"] = null;
  let weeklyRows: number | null = null;
  let monthlyRows: number | null = null;
  const requestedMetricRange = metricResultDateRange(input.metricResults);

  for (const context of input.contexts) {
    const config = asRecord(context.dataSource.config);
    const contextExpectedRows = expectedRowsFromContext(context);
    expectedFullRows = Math.max(expectedFullRows ?? 0, contextExpectedRows);
    sampleRowsCount = (sampleRowsCount ?? 0) + schemaSampleRowsCount(context.schemaJson);
    firstStoredFilePath = firstStoredFilePath ?? storedFilePath(config);
    firstStorageObjectKey = firstStorageObjectKey ?? storageObjectKey(config);

    if (context.dataSource.type === DataSourceType.POSTGRESQL) {
      hasDatabaseSource = true;
      fullContextCount += 1;
      dataScope = mergeDataScope(dataScope, "database_query");
      continue;
    }

    if (context.dataSource.type === DataSourceType.CSV || context.dataSource.type === DataSourceType.EXCEL) {
      const rows = await readCsvRowsFromStorageConfig(config).catch(() => null);
      const firstTable = context.tables[0];
      if (!rows?.length || !firstTable) {
        dataScope = mergeDataScope(dataScope, "sample_only");
        continue;
      }
      fullContextCount += 1;
      dataScope = mergeDataScope(dataScope, "full_file");
      totalRows = (totalRows ?? 0) + rows.length;
      const range = dateRangeFromRows(rows, firstTable);
      dateField = dateField ?? range.dateField;
      if (range.dateRangeStart && (!dateRangeStart || range.dateRangeStart < dateRangeStart)) {
        dateRangeStart = range.dateRangeStart;
      }
      if (range.latestDataDate && (!latestDataDate || range.latestDataDate > latestDataDate)) {
        latestDataDate = range.latestDataDate;
        dailyRows = rowsOnBusinessDate(rows, firstTable, latestDataDate);
      } else if (range.latestDataDate && latestDataDate && range.latestDataDate === latestDataDate) {
        dailyRows = (dailyRows ?? 0) + rowsOnBusinessDate(rows, firstTable, latestDataDate);
      }
      if (isEcommerce) {
        ecommerceFullDataMetrics = mergeEcommerceMetrics(
          ecommerceFullDataMetrics,
          ecommerceMetricsFromRows(rows, firstTable, range.latestDataDate)
        );
        const dailyMetricRows = rowsForBusinessDate(rows, firstTable, range.latestDataDate);
        if (dailyMetricRows.length) {
          ecommerceDailyDataMetrics = mergeEcommerceMetrics(
            ecommerceDailyDataMetrics,
            ecommerceMetricsFromRows(dailyMetricRows, firstTable, range.latestDataDate)
          );
        }
        const weeklyStart = range.latestDataDate ? addDays(range.latestDataDate, -6) : null;
        const weeklyMetricRows = rowsForBusinessDateRange(rows, firstTable, weeklyStart, range.latestDataDate);
        if (weeklyMetricRows.length) {
          weeklyRows = (weeklyRows ?? 0) + weeklyMetricRows.length;
          ecommerceWeeklyDataMetrics = mergeEcommerceMetrics(
            ecommerceWeeklyDataMetrics,
            ecommerceMetricsFromRows(weeklyMetricRows, firstTable, range.latestDataDate)
          );
        }
        const monthlyMetricRows = rowsForBusinessDateRange(rows, firstTable, requestedMetricRange.start, requestedMetricRange.end);
        if (monthlyMetricRows.length) {
          monthlyRows = (monthlyRows ?? 0) + monthlyMetricRows.length;
          ecommerceMonthlyDataMetrics = mergeEcommerceMetrics(
            ecommerceMonthlyDataMetrics,
            ecommerceMetricsFromRows(monthlyMetricRows, firstTable, requestedMetricRange.end ?? range.latestDataDate)
          );
        }
      }
    }
  }

  if (dataScope === "database_query") {
    latestDataDate = latestTrendDate(input.trendMetrics) ?? latestDataDate;
    totalRows = totalRows || null;
  }

  const aggregationBusinessTypes = input.aggregationResults?.map((aggregation) => String(aggregation.businessType ?? "")) ?? [];
  if (isEcommerce && aggregationBusinessTypes.includes("app_market")) {
    failures.push("电商订单数据被识别为 App / 应用商店模板，报告未通过行业识别校验。");
  }

  const hasRealRevenue = ecommerceFields.hasGrossSales || ecommerceFields.hasNetSales || ecommerceFields.hasTotalPaid;
  const hasEstimatedGmvMetric = input.metricResults?.some((metric) => /estimated\s*gmv/i.test(`${metric.metricName ?? ""} ${metric.displayName ?? ""}`));
  if (hasRealRevenue && hasEstimatedGmvMetric) {
    warnings.push("已存在真实收入字段，Estimated GMV 不应作为核心收入 KPI。");
  }

  if (input.metricResults?.length) {
    if (isDailyReport(input.reportType) && ecommerceDailyDataMetrics) {
      addMetricMismatchFailures(failures, ecommerceDailyDataMetrics, input.metricResults, "当日完整数据聚合值");
    } else if (isWeeklyReport(input.reportType) && ecommerceWeeklyDataMetrics) {
      addMetricMismatchFailures(failures, ecommerceWeeklyDataMetrics, input.metricResults, "最近 7 天完整数据聚合值");
    } else if (isMonthlyReport(input.reportType) && ecommerceMonthlyDataMetrics) {
      addMetricMismatchFailures(failures, ecommerceMonthlyDataMetrics, input.metricResults, "当前月完整数据聚合值");
    } else if (ecommerceFullDataMetrics) {
      addMetricMismatchFailures(failures, ecommerceFullDataMetrics, input.metricResults);
    }
  }

  if (!latestDataDate) {
    warnings.push("未能从完整数据中识别最新业务日期，时间类报告可信度较低。");
  }

  const metricSource = dataScope === "full_file" || dataScope === "database_query"
    ? "FULL_DATA"
    : dataScope === "sample_only"
      ? "schema.sampleRows"
      : dataScope === "partial_data"
        ? "PARTIAL_DATA"
        : "UNKNOWN";
  const rowsUsedForMetrics = isDailyReport(input.reportType) && dataScope === "full_file" && dailyRows != null
    ? dailyRows
    : isWeeklyReport(input.reportType) && dataScope === "full_file" && weeklyRows != null
      ? weeklyRows
      : isMonthlyReport(input.reportType) && dataScope === "full_file" && monthlyRows != null
        ? monthlyRows
      : totalRows;
  const fullDataAvailable = dataScope === "full_file" || dataScope === "database_query";
  const guardrail = validateFullDataAnalysisContext({
    reportType: input.reportType ?? "report",
    metricSource,
    rowsUsed: totalRows,
    dailyRows,
    rowsUsedForMetrics,
    sampleRowsCount,
    fullDataAvailable,
    expectedFullRows,
    latestDataDate,
    storedFilePath: firstStoredFilePath,
    storageObjectKey: firstStorageObjectKey,
    isDatabaseSource: hasDatabaseSource,
    businessFieldMap,
    detectedIndustry: isEcommerce ? "ecommerce" : aggregationBusinessTypes.includes("app_market") ? "app_market" : "generic"
  });
  failures.push(...guardrail.blockingIssues.filter((issue) => !failures.includes(issue)));
  warnings.push(...guardrail.warnings.filter((warning) => !warnings.includes(warning)));
  const passed = guardrail.canGenerateReport && failures.length === 0;
  return {
    passed,
    industry: isEcommerce ? "ecommerce" : aggregationBusinessTypes.includes("app_market") ? "app_market" : dataScope === "database_query" ? "database" : "generic",
    dataScope: dataScope ? auditScopeFromGuardrail(guardrail.dataScope, dataScope === "database_query") : "sample_only",
    totalRows: totalRows || null,
    expectedFullRows: expectedFullRows || null,
    dailyRows: dailyRows || null,
    rowsUsedForMetrics: rowsUsedForMetrics || null,
    sampleRowsCount: sampleRowsCount || null,
    dateField,
    dateRangeStart,
    dateRangeEnd: latestDataDate,
    latestDataDate,
    usesFullData: fullContextCount === input.contexts.length && fullContextCount > 0,
    failures,
    warnings,
    requiredFixes: guardrail.requiredFixes,
    analysisSource: guardrail.analysisSource,
    businessFieldMap,
    fullDataGuardrail: guardrail,
    ecommerceFullDataMetrics,
    ecommerceFields
  } satisfies ReportDataAudit;
}
