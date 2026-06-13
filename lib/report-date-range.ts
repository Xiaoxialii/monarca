import type { SchemaColumn } from "@/lib/metric-validation";

export type DateRangePreset = "DAILY" | "WEEKLY" | "TODAY" | "7D" | "30D" | "90D" | "12M" | "ALL" | "CUSTOM";

export type ReportDateRangeInput = {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  previousStartDate?: string;
  previousEndDate?: string;
};

export type ResolvedReportDateRange = {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  currentStart?: Date;
  currentEnd?: Date;
  previousStart?: Date;
  previousEnd?: Date;
};

const presetDays: Partial<Record<DateRangePreset, number>> = {
  "DAILY": 1,
  "WEEKLY": 7,
  "TODAY": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
  "12M": 365
};

const preferredBusinessTimeFields = [
  "order_date",
  "created_at",
  "paid_at",
  "transaction_date",
  "payment_date",
  "event_date",
  "event_time",
  "review_date",
  "signup_date",
  "completed_at",
  "timestamp",
  "date",
  "updated_at"
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const normalized = /^\d{4}$/.test(text) ? `${text}-01-01` : /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
  const date = new Date(normalized);

  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeReportDateRange(value: unknown): ReportDateRangeInput {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const preset = record.preset === "DAILY" || record.preset === "WEEKLY" ||
    record.preset === "TODAY" || record.preset === "7D" || record.preset === "30D" || record.preset === "90D" ||
    record.preset === "12M" || record.preset === "ALL" || record.preset === "CUSTOM"
    ? record.preset
    : "ALL";

  return {
    preset,
    startDate: typeof record.startDate === "string" ? record.startDate : undefined,
    endDate: typeof record.endDate === "string" ? record.endDate : undefined,
    previousStartDate: typeof record.previousStartDate === "string" ? record.previousStartDate : undefined,
    previousEndDate: typeof record.previousEndDate === "string" ? record.previousEndDate : undefined
  };
}

export function dateRangeFromSearchParams(searchParams: URLSearchParams): ReportDateRangeInput {
  return normalizeReportDateRange({
    preset: searchParams.get("dateRangePreset") ?? searchParams.get("preset") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    previousStartDate: searchParams.get("previousStartDate") ?? undefined,
    previousEndDate: searchParams.get("previousEndDate") ?? undefined
  });
}

export function resolveReportDateRange(input: ReportDateRangeInput, now = new Date()): ResolvedReportDateRange {
  const preset = input.preset;

  if (preset === "ALL") {
    return { preset };
  }

  const end = parseDate(input.endDate) ?? now;
  const currentEnd = new Date(end);
  currentEnd.setHours(23, 59, 59, 999);

  let currentStart: Date | null = null;

  if (preset === "CUSTOM") {
    currentStart = parseDate(input.startDate);
    if (!currentStart) {
      return { preset: "ALL" };
    }
  } else {
    const days = presetDays[preset] ?? 30;
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - days + 1);
  }

  currentStart.setHours(0, 0, 0, 0);

  if (currentStart.getTime() > currentEnd.getTime()) {
    throw new Error("Invalid date range: startDate must be before endDate");
  }

  const durationMs = currentEnd.getTime() - currentStart.getTime() + 1;
  const explicitPreviousStart = parseDate(input.previousStartDate);
  const explicitPreviousEnd = parseDate(input.previousEndDate);
  const previousEnd = explicitPreviousEnd ? new Date(explicitPreviousEnd) : new Date(currentStart.getTime() - 1);
  const previousStart = explicitPreviousStart ? new Date(explicitPreviousStart) : new Date(previousEnd.getTime() - durationMs + 1);
  previousStart.setHours(0, 0, 0, 0);
  previousEnd.setHours(23, 59, 59, 999);

  return {
    preset,
    startDate: isoDate(currentStart),
    endDate: isoDate(currentEnd),
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  };
}

export function findBusinessDateColumn(
  columns: Array<Pick<SchemaColumn, "name" | "type">>,
  manualField?: string | null
) {
  if (manualField) {
    const manual = columns.find((column) => normalize(column.name) === normalize(manualField));
    if (manual) return manual;
  }

  const exact = preferredBusinessTimeFields
    .map((candidate) => columns.find((column) => normalize(column.name) === normalize(candidate)))
    .find(Boolean);

  if (exact) {
    return exact;
  }

  return columns.find((column) => {
    const name = normalize(column.name);
    const type = String(column.type ?? "").toLowerCase();

    return /date|time|timestamp/.test(type) &&
      preferredBusinessTimeFields.some((candidate) => name.includes(normalize(candidate)));
  }) ?? null;
}

export function rowDateValue(row: Record<string, unknown>, fieldName: string) {
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
    return parseDate(row[fieldName]);
  }

  const normalized = normalize(fieldName);
  const matchingKey = Object.keys(row).find((key) => normalize(key) === normalized);
  return matchingKey ? parseDate(row[matchingKey]) : null;
}

export function rowInDateRange(row: Record<string, unknown>, fieldName: string, range: ResolvedReportDateRange) {
  if (!range.currentStart || !range.currentEnd) {
    return true;
  }

  const date = rowDateValue(row, fieldName);
  return Boolean(date && date >= range.currentStart && date <= range.currentEnd);
}

export function rowInPreviousDateRange(row: Record<string, unknown>, fieldName: string, range: ResolvedReportDateRange) {
  if (!range.previousStart || !range.previousEnd) {
    return false;
  }

  const date = rowDateValue(row, fieldName);
  return Boolean(date && date >= range.previousStart && date <= range.previousEnd);
}

export function filterRowsByReportDateRange(
  rows: Array<Record<string, unknown>>,
  fieldName: string | null | undefined,
  range: ResolvedReportDateRange
) {
  if (!fieldName || !range.currentStart || !range.currentEnd) {
    return rows;
  }

  return rows.filter((row) => rowInDateRange(row, fieldName, range));
}

export function filterRowsByPreviousReportDateRange(
  rows: Array<Record<string, unknown>>,
  fieldName: string | null | undefined,
  range: ResolvedReportDateRange
) {
  if (!fieldName || !range.previousStart || !range.previousEnd) {
    return [];
  }

  return rows.filter((row) => rowInPreviousDateRange(row, fieldName, range));
}

export function dateRangeCacheKey(range: ResolvedReportDateRange, dateField?: string | null) {
  return JSON.stringify({
    dateField: dateField ?? null,
    preset: range.preset,
    startDate: range.startDate ?? null,
    endDate: range.endDate ?? null
  });
}
