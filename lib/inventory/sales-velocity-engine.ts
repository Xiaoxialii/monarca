export type VelocityConfidence = "HIGH" | "MEDIUM" | "LOW";

export type SalesVelocityInput = {
  totalUnitsSold: number;
  orderDates: Array<string | Date | number | null | undefined>;
  minimumWindowDays?: number;
};

export type SalesVelocityOutput = {
  sales_velocity: number;
  normalized_daily_sales_velocity: number;
  velocity_window_days: number;
  calculation_window_days: number;
  velocity_confidence: VelocityConfidence;
  data_period_days: number;
  calculation_basis: "30-day normalized estimate" | "observed order window";
};

const DEFAULT_MINIMUM_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateSalesVelocity(input: SalesVelocityInput): SalesVelocityOutput {
  const dates = input.orderDates
    .map(toDayTimestamp)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const minimumWindowDays = Math.max(1, input.minimumWindowDays ?? DEFAULT_MINIMUM_WINDOW_DAYS);
  const dataPeriodDays = dates.length >= 2 ? Math.max(0, Math.round((dates[dates.length - 1] - dates[0]) / MS_PER_DAY)) : 0;
  const observationDays = dates.length ? Math.max(dataPeriodDays, minimumWindowDays) : minimumWindowDays;
  const confidence = velocityConfidence(dataPeriodDays);

  const normalizedDailyVelocity = roundRatio(Math.max(0, input.totalUnitsSold) / observationDays);

  return {
    sales_velocity: normalizedDailyVelocity,
    normalized_daily_sales_velocity: normalizedDailyVelocity,
    velocity_window_days: observationDays,
    calculation_window_days: observationDays,
    velocity_confidence: confidence,
    data_period_days: dataPeriodDays,
    calculation_basis: dataPeriodDays < minimumWindowDays ? "30-day normalized estimate" : "observed order window"
  };
}

export function velocityConfidence(dataPeriodDays: number): VelocityConfidence {
  if (dataPeriodDays >= 30) return "HIGH";
  if (dataPeriodDays >= 14) return "MEDIUM";
  return "LOW";
}

function toDayTimestamp(value: string | Date | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
