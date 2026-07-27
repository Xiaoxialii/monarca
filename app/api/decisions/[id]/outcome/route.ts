import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { resolveDecisionReference } from "@/app/api/decisions/[id]/resolve";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const { id } = await context.params;
    const reference = await resolveDecisionReference({ id, workspaceId });
    if (!reference?.recommendationId) return NextResponse.json({ ok: false, message: "Decision outcome not found." }, { status: 404 });

    const recommendation = await prisma.optimizationDecision.findFirst({
      where: { id: reference.recommendationId, workspaceId },
      include: {
        actions: { orderBy: { updatedAt: "desc" }, take: 1, include: { outcome: true } },
        baselineSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
        executionMetrics: { orderBy: { date: "desc" }, take: 30 },
        outcomes: { orderBy: { updatedAt: "desc" }, take: 1 },
        decisionLearnings: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
    if (!recommendation) return NextResponse.json({ ok: false, message: "Recommendation not found." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      recommendation,
      action: recommendation.actions[0] ?? null,
      baseline: recommendation.baselineSnapshots[0] ?? null,
      outcome: recommendation.outcomes[0] ?? recommendation.actions[0]?.outcome ?? null,
      executionMetrics: recommendation.executionMetrics,
      learnings: recommendation.decisionLearnings
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
