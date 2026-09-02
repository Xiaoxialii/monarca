import { NextResponse } from "next/server";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { decisionSnapshotFreshness } from "@/lib/dashboard/decision-snapshot-lifecycle";
import {
  findOptimizationReportCache,
  optimizationReportCachePayload
} from "@/lib/dashboard/optimization-report-cache";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "@/lib/profit/canonical-profitability-engine";
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

function staleOptimizationReportPayload(input: {
  loadedState: string;
  loadedMessage?: string | null;
  freshnessReason?: string | null;
}) {
  return {
    ok: true,
    state: "stale",
    status: "STALE",
    hasConnectedDataSource: true,
    decision_report: null,
    message: input.loadedMessage ?? "Current canonical report is not ready; cached report is stale and was not reused.",
    diagnostics: {
      calculation_status: "stale_cache_rejected",
      live_state: input.loadedState,
      stale_reason: input.freshnessReason ?? "unknown",
      cache_hit: false,
      fallback_source: null,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION
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

  if (loaded.state === "unavailable" && /failed validation|validation/i.test(loaded.message ?? "")) {
    return NextResponse.json({
      ok: true,
      state: "unavailable",
      status: "FAILED_VALIDATION",
      hasConnectedDataSource: true,
      message: loaded.message,
      decision_report: null,
      generated_at: loaded.data?.metadata.computed_at ?? null,
      date_range: loaded.data?.metadata.date_range ?? null,
      analytics_validation: loaded.data?.analytics_validation ?? null,
      source_platforms: loaded.data?.metadata.source_platforms ?? [],
      diagnostics: {
        calculation_status: "canonical_validation_failed",
        cache_hit: false,
        fallback_source: null,
        report_snapshot_id: null,
        schema_snapshot_id: loaded.lineage?.schemaSnapshotId ?? null,
        source_artifact_ids: loaded.lineage?.manifestKey ? [loaded.lineage.manifestKey] : [],
        metric_engine_version: loaded.data?.metadata.metric_engine_version ?? null,
        profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
        generated_at: loaded.data?.metadata.computed_at ?? null
      },
      lineage: loaded.lineage
        ? {
            ...loaded.lineage,
            generatedAt: dateToIso(loaded.data?.metadata.computed_at)
          }
        : null
    });
  }

  if (loaded.state !== "ready" || !loaded.data?.decision_report) {
    const cachedReport = await findOptimizationReportCache(prisma, {
      workspaceId: session.workspace.id,
      mode: "full"
    });

    if (cachedReport) {
      const freshness = await decisionSnapshotFreshness(prisma, {
        workspaceId: session.workspace.id,
        snapshot: {
          algorithmVersion: cachedReport.algorithmVersion,
          optimizationVersion: cachedReport.optimizationVersion,
          profitabilityEngineVersion: cachedReport.profitabilityEngineVersion,
          canonicalSnapshotVersion: cachedReport.canonicalSnapshotVersion,
          metricSnapshotVersion: cachedReport.metricSnapshotVersion,
          simulationVersion: cachedReport.simulationVersion,
          inputHash: cachedReport.inputHash
        }
      }).catch((error) => {
        console.warn("[ecommerce-report] optimization cache freshness check failed", {
          workspace_id: session.workspace.id,
          cache_id: cachedReport.id,
          error: error instanceof Error ? error.message : String(error)
        });
        return { isFresh: false, reason: "freshness_check_failed" };
      });

      if (!freshness.isFresh) {
        return NextResponse.json(staleOptimizationReportPayload({
          loadedState: loaded.state,
          loadedMessage: loaded.message,
          freshnessReason: freshness.reason
        }));
      }

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
        },
        diagnostics: {
          calculation_status: "fallback_cache_reused",
          cache_hit: true,
          cache_id: cachedReport.id,
          report_snapshot_id: cachedReport.sourceReportSnapshotId,
          decision_snapshot_id: cachedReport.sourceDecisionSnapshotId,
          metric_engine_version: cachedReport.metricSnapshotVersion,
          profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
          generated_at: payload.generated_at
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
    diagnostics: {
      calculation_status: loaded.state === "ready" ? "canonical_live" : loaded.state,
      cache_hit: false,
      fallback_source: null,
      report_snapshot_id: null,
      schema_snapshot_id: loaded.lineage?.schemaSnapshotId ?? null,
      source_artifact_ids: loaded.lineage?.manifestKey ? [loaded.lineage.manifestKey] : [],
      metric_engine_version: loaded.data?.metadata.metric_engine_version ?? null,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      generated_at: loaded.data?.metadata.computed_at ?? null
    },
    lineage: loaded.lineage
      ? {
          ...loaded.lineage,
          generatedAt: dateToIso(loaded.data?.metadata.computed_at)
        }
      : null
  });
}
