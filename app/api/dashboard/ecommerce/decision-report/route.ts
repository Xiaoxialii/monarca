import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import {
  loadEcommerceSalesDashboardData,
  type LoadDashboardResult
} from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import {
  findLatestDecisionSnapshot,
  snapshotPerformance,
  upsertDecisionSnapshot
} from "@/lib/dashboard/snapshot-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const decisionMode = url.searchParams.get("mode") === "sku" ? "sku" : "full";
  const optimizationType = decisionMode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION";

  let session: Awaited<ReturnType<typeof syncCurrentClerkUser>>;

  try {
    session = await syncCurrentClerkUser();
  } catch (error) {
    throw error;
  }

  if (!session) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." },
      { status: 401 }
    );
  }

  const snapshot = await findLatestDecisionSnapshot(prisma, {
    workspaceId: session.workspace.id,
    optimizationType
  });

  if (snapshot?.recommendationsJson) {
    return NextResponse.json({
      ...(snapshot.recommendationsJson as Record<string, unknown>),
      snapshot: {
        id: snapshot.id,
        type: "DecisionSnapshot",
        createdAt: snapshot.createdAt.toISOString()
      },
      performance: snapshotPerformance(startedAt, "snapshot")
    });
  }

  let result: LoadDashboardResult;

  try {
    result = await loadEcommerceSalesDashboardData({
      workspaceId: session.workspace.id,
      dataSourceId: url.searchParams.get("dataSourceId"),
      decisionMode
    });
  } catch (error) {
    throw error;
  }

  const payload = dashboardPayload(result, {
    warning: "SNAPSHOT_MISS_FALLBACK_LIVE_OPTIMIZATION"
  });

  void upsertDecisionSnapshot(prisma, {
    workspaceId: session.workspace.id,
    optimizationType,
    content: payload,
    assumptions: {
      decisionMode,
      fallbackGeneratedAt: new Date().toISOString()
    }
  }).catch((error) => {
    console.warn("Failed to save decision snapshot fallback result", error);
  });

  return NextResponse.json({
    ...payload,
    performance: snapshotPerformance(startedAt, "fallback")
  });
}

function dashboardPayload(result: LoadDashboardResult, options: { warning?: string; fallbackReason?: unknown } = {}) {
  return {
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
    warning: options.warning,
    fallback_reason: options.fallbackReason instanceof Error ? options.fallbackReason.message : undefined
  };
}
