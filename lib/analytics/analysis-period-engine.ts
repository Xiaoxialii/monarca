import type { CanonicalDataset } from "@/lib/semantic/types";
import {
  normalizeReportDateRange,
  resolveReportDateRange,
  type ReportDateRangeInput,
  type ResolvedReportDateRange
} from "@/lib/report-date-range";

type CanonicalRow = Record<string, unknown>;

export type FilteredCanonicalDataset = {
  dataset: CanonicalDataset;
  dateRange: ResolvedReportDateRange;
  filteredRowCounts: Record<string, number>;
};

const orderDateFields = ["order_date", "created_at_source", "processed_at_source", "created_at", "paid_at", "date"];
const itemDateFields = ["order_date", "created_at_source", "processed_at_source", "created_at", "date"];
const refundDateFields = ["refund_date", "created_at_source", "created_at", "date"];
const adsDateFields = ["ad_date", "date", "report_date", "month", "created_at"];

export function filterCanonicalDatasetForDateRange(
  dataset: CanonicalDataset,
  input?: Partial<ReportDateRangeInput> | null,
  now = new Date()
): FilteredCanonicalDataset {
  const requested = normalizeReportDateRange(input ?? { preset: "ALL" });
  const dateRange = resolveReportDateRange(requested, now);

  if (dateRange.preset === "ALL" || !dateRange.currentStart || !dateRange.currentEnd) {
    return {
      dataset,
      dateRange,
      filteredRowCounts: rowCounts(dataset)
    };
  }

  const currentStart = dateRange.currentStart;
  const currentEnd = dateRange.currentEnd;
  const sourceTables = dataset.tables;
  const orders = (sourceTables.ecommerce_orders ?? []).filter((row) => rowInRange(row, orderDateFields, currentStart, currentEnd));
  const orderIds = new Set(orders.map((row) => stringValue(row.order_id)).filter(Boolean));
  const customerIds = new Set(orders.map((row) => firstString(row.customer_id, row.source_customer_id)).filter(Boolean));
  const ecommerceOrderItems = (sourceTables.ecommerce_order_items ?? []).filter((row) => {
    const orderId = stringValue(row.order_id);
    if (orderId && orderIds.has(orderId)) return true;
    return rowInRange(row, itemDateFields, currentStart, currentEnd);
  });
  const ecommerceRefunds = (sourceTables.ecommerce_refunds ?? []).filter((row) => {
    const orderId = stringValue(row.order_id);
    if (orderId && orderIds.has(orderId)) return true;
    return rowInRange(row, refundDateFields, currentStart, currentEnd);
  });
  const ecommerceAds = (sourceTables.ecommerce_ads ?? []).filter((row) => {
    if (!hasAnyDate(row, adsDateFields)) return false;
    return rowInRange(row, adsDateFields, currentStart, currentEnd);
  });
  const ecommerceCustomers = (sourceTables.ecommerce_customers ?? [])
    .filter((row) => customerIds.size === 0 || customerIds.has(stringValue(row.customer_id)))
    .map(stripAllTimeCustomerAggregates);

  const filtered: CanonicalDataset = {
    ...dataset,
    tables: {
      ...sourceTables,
      ecommerce_orders: orders,
      ecommerce_order_items: ecommerceOrderItems,
      ecommerce_customers: ecommerceCustomers,
      ecommerce_refunds: ecommerceRefunds,
      ecommerce_ads: ecommerceAds,
      ecommerce_products: sourceTables.ecommerce_products ?? [],
      ecommerce_inventory: sourceTables.ecommerce_inventory ?? sourceTables.inventory ?? []
    },
    metadata: {
      ...dataset.metadata,
      analysis_date_range: {
        preset: dateRange.preset,
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null
      }
    } as CanonicalDataset["metadata"]
  };

  return {
    dataset: filtered,
    dateRange,
    filteredRowCounts: rowCounts(filtered)
  };
}

function stripAllTimeCustomerAggregates(row: CanonicalRow) {
  const periodScoped = { ...row };
  for (const field of [
    "total_orders",
    "order_count",
    "orders_count",
    "total_spent",
    "lifetime_value",
    "ltv",
    "first_order_date",
    "first_order_at",
    "customer_first_order_date",
    "last_order_date",
    "last_order_at",
    "customer_last_order_date"
  ]) {
    delete periodScoped[field];
  }
  return periodScoped;
}

function rowCounts(dataset: CanonicalDataset) {
  return Object.fromEntries(
    Object.entries(dataset.tables).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0])
  );
}

function rowInRange(row: CanonicalRow, fields: string[], start: Date, end: Date) {
  const date = firstDate(row, fields);
  return Boolean(date && date.getTime() >= start.getTime() && date.getTime() <= end.getTime());
}

function hasAnyDate(row: CanonicalRow, fields: string[]) {
  return Boolean(firstDate(row, fields));
}

function firstDate(row: CanonicalRow, fields: string[]) {
  for (const field of fields) {
    const date = parseDate(row[field]);
    if (date) return date;
  }
  return null;
}

function parseDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 20_000 && value < 80_000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86_400_000);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value).trim();
    if (text) return text;
  }
  return "";
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}
