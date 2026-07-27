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
    if (!reference?.recommendationId) return NextResponse.json({ ok: false, message: "Recommendation not found." }, { status: 404 });

    const learnings = await prisma.decisionLearning.findMany({
      where: {
        recommendationId: reference.recommendationId,
        workspaceId
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    return NextResponse.json({ ok: true, learnings });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
