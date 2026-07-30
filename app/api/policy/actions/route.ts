import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { buildDecisionImpactPayload } from "@/lib/policy/action-impact-tracker";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { findOptimizationReportCache, optimizationReportCachePayload } from "@/lib/dashboard/optimization-report-cache";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const url = new URL(request.url);
    const decisionInstancePrefix = url.searchParams.get("decisionInstancePrefix")
      ?? (url.searchParams.get("scope") === "current_optimization"
        ? await currentOptimizationDecisionInstancePrefix(workspaceId)
        : null);
    const actions = await listActionTrackingRecords({ workspaceId, decisionInstancePrefix });
    const payload = buildDecisionImpactPayload(actions);
    return NextResponse.json({
      ok: true,
      ...payload
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to load policy actions", error);
    return NextResponse.json({
      ok: false,
      message: "Failed to load policy actions.",
      ...buildDecisionImpactPayload([])
    }, { status: 500 });
  }
}

async function currentOptimizationDecisionInstancePrefix(workspaceId: string) {
  const cache = await findOptimizationReportCache(prisma, {
    workspaceId,
    mode: "full"
  });
  if (!cache) return "__no_current_optimization__:";

  const payload = optimizationReportCachePayload(cache);
  return `${optimizationReportKey(payload)}:`;
}

function optimizationReportKey(report: Record<string, unknown>) {
  const optimizationRun = asRecord(report.optimizationRun);
  return String(
    optimizationRun.optimization_run_id ||
    optimizationRun.completed_at ||
    report.generatedAt ||
    "current-optimization-report"
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
