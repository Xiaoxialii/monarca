import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { resolveDecisionReference } from "@/app/api/decisions/[id]/resolve";
import { prisma } from "@/lib/prisma";
import { startDecisionExecution } from "@/lib/decision-outcome/closed-loop-service";
import { startActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const evaluationWindowDays = typeof body?.evaluationWindowDays === "number" ? body.evaluationWindowDays : undefined;
    const reference = await resolveDecisionReference({ id, workspaceId });
    if (!reference) return NextResponse.json({ ok: false, message: "Decision not found." }, { status: 404 });

    if (!reference.recommendationId && reference.actionId) {
      const action = await startActionTrackingRecord({ workspaceId, actionId: reference.actionId });
      if (!action) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });
      const refreshed = await resolveDecisionReference({ id: reference.actionId, workspaceId });
      if (!refreshed?.recommendationId) {
        return NextResponse.json({ ok: false, message: "Recommendation could not be created for this action." }, { status: 409 });
      }
      const started = await startDecisionExecution(prisma, {
        workspaceId,
        actionId: reference.actionId,
        recommendationId: refreshed.recommendationId,
        evaluationWindowDays
      });
      return NextResponse.json({ ok: true, action, started });
    }

    const started = await startDecisionExecution(prisma, {
      workspaceId,
      actionId: reference.actionId,
      recommendationId: reference.recommendationId ?? undefined,
      evaluationWindowDays
    });
    if (!started) return NextResponse.json({ ok: false, message: "Recommendation not found." }, { status: 404 });

    return NextResponse.json({ ok: true, started });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
