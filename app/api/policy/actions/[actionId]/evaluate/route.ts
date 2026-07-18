import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { evaluateActionTrackingRecord } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ actionId: string }> }) {
  const { workspaceId } = await resolveActionSession();
  const { actionId } = await context.params;
  const actions = await evaluateActionTrackingRecord({ workspaceId, actionId });

  if (!actions.length) return NextResponse.json({ ok: false, message: "Action not found or not ready to evaluate." }, { status: 404 });
  return NextResponse.json({ ok: true, actions });
}
