import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { resolveDecisionReference } from "@/app/api/decisions/[id]/resolve";
import { prisma } from "@/lib/prisma";
import { evaluateDecisionOutcome } from "@/lib/decision-outcome/closed-loop-service";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const { id } = await context.params;
    const reference = await resolveDecisionReference({ id, workspaceId });
    if (!reference?.recommendationId) return NextResponse.json({ ok: false, message: "Recommendation not found." }, { status: 404 });

    const evaluated = await evaluateDecisionOutcome(prisma, {
      workspaceId,
      recommendationId: reference.recommendationId
    });
    if (!evaluated) return NextResponse.json({ ok: false, message: "Decision outcome could not be evaluated." }, { status: 409 });

    return NextResponse.json({ ok: true, evaluated });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
