import { NextResponse } from "next/server";
import { evaluateActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { workspaceId } = await resolveActionSession(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const actions = await evaluateActionTrackingRecord({
    workspaceId,
    actionId: typeof body?.action_id === "string" ? body.action_id : undefined
  });

  return NextResponse.json({ ok: true, actions });
}
