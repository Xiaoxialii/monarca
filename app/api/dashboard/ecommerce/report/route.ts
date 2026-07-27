import { NextResponse } from "next/server";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
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

export async function GET(request: Request) {
  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] dashboard.ecommerce.report.GET", session);

  const loaded = await loadEcommerceSalesDashboardData({
    workspaceId: session.workspace.id,
    decisionMode: "full"
  });

  return NextResponse.json({
    ok: true,
    state: loaded.state,
    status: loaded.state,
    hasConnectedDataSource: loaded.state !== "empty" || Boolean(loaded.data.metadata.source_platforms.length),
    message: loaded.message,
    decision_report: loaded.data.decision_report,
    generated_at: loaded.data.metadata.computed_at,
    source_platforms: loaded.data.metadata.source_platforms,
    lineage: loaded.lineage
      ? {
          ...loaded.lineage,
          generatedAt: dateToIso(loaded.data.metadata.computed_at)
        }
      : null
  });
}
