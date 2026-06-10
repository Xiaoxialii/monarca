import { resolveReportDateRange, type ReportDateRangeInput } from "@/lib/report-date-range";
import type { ReportMode } from "@/lib/report-composers";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000`);
  value.setDate(value.getDate() + days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function previousMonthSameDayWindow(date: string) {
  const currentEnd = new Date(`${date}T00:00:00.000`);
  const previousMonthStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth() - 1, 1);
  const previousMonthEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 0);
  const requestedEndDay = currentEnd.getDate();
  const endDay = Math.min(requestedEndDay, previousMonthEnd.getDate());
  const startYear = previousMonthStart.getFullYear();
  const startMonth = String(previousMonthStart.getMonth() + 1).padStart(2, "0");
  const endDate = new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth(), endDay);
  const endYear = endDate.getFullYear();
  const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
  const endDayText = String(endDate.getDate()).padStart(2, "0");

  return {
    startDate: `${startYear}-${startMonth}-01`,
    endDate: `${endYear}-${endMonth}-${endDayText}`
  };
}

export function reportMetricTimeWindow({
  reportMode,
  requestedRange,
  latestDataDate
}: {
  reportMode: ReportMode;
  requestedRange: ReportDateRangeInput;
  latestDataDate?: string | null;
}) {
  if (reportMode === "daily_brief") {
    if (!latestDataDate) {
      throw new Error("当前无法生成真实报告：未能从完整数据中识别最新业务日期。");
    }
    return resolveReportDateRange({ preset: "DAILY", startDate: latestDataDate, endDate: latestDataDate });
  }

  if (reportMode === "weekly_report") {
    if (!latestDataDate) {
      throw new Error("当前无法生成真实报告：未能从完整数据中识别最新业务日期。");
    }
    return resolveReportDateRange({ preset: "WEEKLY", startDate: addDays(latestDataDate, -6), endDate: latestDataDate });
  }

  if (reportMode === "custom_report") {
    if (requestedRange.preset === "ALL" || !requestedRange.startDate || !requestedRange.endDate) {
      if (!latestDataDate) {
        throw new Error("当前无法生成真实报告：未能从完整数据中识别最新业务日期。");
      }
      const previousMonth = previousMonthSameDayWindow(latestDataDate);
      return resolveReportDateRange({
        preset: "CUSTOM",
        startDate: monthStart(latestDataDate),
        endDate: latestDataDate,
        previousStartDate: previousMonth.startDate,
        previousEndDate: previousMonth.endDate
      });
    }
  }

  return resolveReportDateRange(requestedRange);
}
