import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { rejectActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

type OptimizationDecisionRow = {
  skuId: string;
  lifecycleStage?: string | null;
  recommendedAction: string;
  optimizationGoal: string;
  alternativeActions: unknown;
  expectedProfitImpact: number;
  expectedRevenueImpact: number;
  expectedAdSpend: number;
  confidence: number;
};

type PrismaWithOptimizationDecision = typeof prisma & {
  optimizationDecision: {
    findFirst(args: unknown): Promise<OptimizationDecisionRow | null>;
  };
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actionSession = await resolveActionSession(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (actionSession instanceof NextResponse) return actionSession;
  const { workspaceId, userId } = actionSession;
  const { id } = await context.params;

  const decision = await (prisma as PrismaWithOptimizationDecision).optimizationDecision.findFirst({
    where: { id, workspaceId }
  }).catch(() => null);

  if (!decision) return NextResponse.json({ ok: false, message: "Decision not found." }, { status: 404 });

  const action = await rejectActionTrackingRecord({
    workspace_id: workspaceId,
    user_id: userId,
    sku: decision.skuId,
    lifecycle_stage: decision.lifecycleStage ?? undefined,
    action_type: decision.recommendedAction,
    action_payload: {
      action: decision.recommendedAction,
      optimization_goal: decision.optimizationGoal,
      scenarios: decision.alternativeActions
    },
    baseline_metrics: { profit: 0, ad_spend: 0 },
    predicted_metrics: { profit: decision.expectedProfitImpact, revenue: decision.expectedRevenueImpact, ad_spend: decision.expectedAdSpend },
    confidence_score: decision.confidence
  });

  return NextResponse.json({ ok: true, action });
}
