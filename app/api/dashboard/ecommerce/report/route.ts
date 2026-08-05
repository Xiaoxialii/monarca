import { NextResponse } from "next/server";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import {
  findOptimizationReportCache,
  optimizationReportCachePayload
} from "@/lib/dashboard/optimization-report-cache";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { prisma } from "@/lib/prisma";
import { dateRangeFromSearchParams } from "@/lib/report-date-range";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

function dateToIso(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function withOperatingReportFallbackFields(report: unknown, generatedAt: unknown) {
  const record = asRecord(report);
  const executiveSummary = asRecord(record.executive_summary);
  const performanceOverview = asRecord(record.performance_overview);
  const generatedDate = dateToIso(typeof generatedAt === "string" || generatedAt instanceof Date ? generatedAt : null)?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10);

  return {
    ...record,
    growth_overview: {
      revenue_growth_rate: 0,
      order_growth_rate: 0,
      sku_growth_rate: 0,
      daily: [
        {
          date: generatedDate,
          revenue: numericValue(executiveSummary.revenue ?? performanceOverview.revenue),
          orders: numericValue(performanceOverview.orders),
          sku_count: numericValue(executiveSummary.sku_count)
        }
      ],
      weekly: [],
      monthly: [],
      ...asRecord(record.growth_overview)
    }
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateRange = dateRangeFromSearchParams(url.searchParams);
  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] dashboard.ecommerce.report.GET", session);

  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId: session.workspace.id,
    decisionMode: "full",
    dateRange
  }).catch((error) => ({
    state: "unavailable" as const,
    message: error instanceof Error ? error.message : "Ecommerce report data is unavailable.",
    data: null,
    lineage: null
  }));

  if (loaded.state !== "ready" || !loaded.data?.decision_report) {
    const cachedReport = await findOptimizationReportCache(prisma, {
      workspaceId: session.workspace.id,
      mode: "full"
    });

    if (cachedReport) {
      const payload = optimizationReportCachePayload(cachedReport);
      const decisionReport = withOperatingReportFallbackFields(payload.decision_report, payload.generated_at);

      return NextResponse.json({
        ...payload,
        state: payload.state === "ready" ? "ready" : payload.state,
        status: payload.state === "ready" ? "ready" : payload.state,
        hasConnectedDataSource: payload.hasConnectedDataSource === true,
        decision_report: decisionReport,
        message: payload.message ?? loaded.message ?? "Loaded operating report from the latest optimization snapshot.",
        fallback: {
          source: "optimization_report_cache",
          liveState: loaded.state,
          liveMessage: loaded.message ?? null
        }
      });
    }
  }

  return NextResponse.json({
    ok: true,
    state: loaded.state,
    status: loaded.state,
    hasConnectedDataSource: loaded.state !== "empty" || Boolean(loaded.data?.metadata.source_platforms.length),
    message: loaded.message,
    decision_report: loaded.data?.decision_report ?? null,
    generated_at: loaded.data?.metadata.computed_at ?? null,
    date_range: loaded.data?.metadata.date_range ?? null,
    analytics_validation: loaded.data?.analytics_validation ?? null,
    source_platforms: loaded.data?.metadata.source_platforms ?? [],
    lineage: loaded.lineage
      ? {
          ...loaded.lineage,
          generatedAt: dateToIso(loaded.data?.metadata.computed_at)
        }
      : null
  });
}
