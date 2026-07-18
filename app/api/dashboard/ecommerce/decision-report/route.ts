import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import {
  loadEcommerceSalesDashboardData,
  loadLatestLocalEcommerceSalesDashboardData,
  type LoadDashboardResult
} from "@/lib/dashboard/ecommerce-sales-dashboard-loader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const decisionMode = url.searchParams.get("mode") === "sku" ? "sku" : "full";

  if (process.env.ENABLE_LOCAL_ARTIFACT_STORE === "true") {
    const localFallback = loadLatestLocalEcommerceSalesDashboardData(undefined, decisionMode);

    if (localFallback) {
      return dashboardResponse(localFallback);
    }
  }

  let session: Awaited<ReturnType<typeof syncCurrentClerkUser>>;

  try {
    session = await syncCurrentClerkUser();
  } catch (error) {
    const fallback = loadLatestLocalEcommerceSalesDashboardData(undefined, decisionMode);

    if (fallback) {
      return dashboardResponse(fallback, error);
    }

    throw error;
  }

  if (!session) {
    const fallback = loadLatestLocalEcommerceSalesDashboardData(undefined, decisionMode);

    if (fallback) {
      return dashboardResponse(fallback);
    }

    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." },
      { status: 401 }
    );
  }

  let result: LoadDashboardResult;

  try {
    result = await loadEcommerceSalesDashboardData({
      workspaceId: session.workspace.id,
      dataSourceId: url.searchParams.get("dataSourceId"),
      decisionMode
    });
  } catch (error) {
    const fallback = process.env.ENABLE_LOCAL_ARTIFACT_STORE === "true"
      ? loadLatestLocalEcommerceSalesDashboardData(session.workspace.id, decisionMode)
        ?? loadLatestLocalEcommerceSalesDashboardData(undefined, decisionMode)
      : null;

    if (fallback) {
      return dashboardResponse(fallback, error);
    }

    throw error;
  }

  return dashboardResponse(result);
}

function dashboardResponse(result: LoadDashboardResult, fallbackReason?: unknown) {
  return NextResponse.json({
    ok: true,
    state: result.state,
    hasConnectedDataSource: result.state === "ready",
    message: result.message,
    decision_report: result.data.decision_report,
    portfolioSummary: result.data.decision_report.portfolioSummary,
    allocationRecommendation: result.data.decision_report.allocationRecommendation,
    skuDecisions: result.data.decision_report.skuDecisions,
    riskAlerts: result.data.decision_report.riskAlerts,
    executionPlan: result.data.decision_report.executionPlan,
    generated_at: result.data.metadata.computed_at,
    source_platforms: result.data.metadata.source_platforms,
    lineage: result.lineage ?? null,
    fallback_reason: fallbackReason instanceof Error ? fallbackReason.message : undefined
  });
}
