import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import {
  findLatestDecisionSnapshot,
  snapshotPerformance
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

  return NextResponse.json({
    ok: true,
    state: "empty",
    hasConnectedDataSource: false,
    message: "No generated optimization snapshot is available yet.",
    decision_report: null,
    portfolioSummary: null,
    allocationRecommendation: null,
    skuDecisions: [],
    riskAlerts: [],
    executionPlan: [],
    generated_at: null,
    source_platforms: [],
    lineage: null,
    warning: "DECISION_SNAPSHOT_MISS",
    performance: snapshotPerformance(startedAt, "snapshot")
  });
}
