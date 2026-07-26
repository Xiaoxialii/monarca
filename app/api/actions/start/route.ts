import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { startActionTrackingRecord } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { workspaceId } = await resolveActionSession(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const actionId = typeof body?.action_id === "string" ? body.action_id : null;

  if (!actionId) return NextResponse.json({ ok: false, message: "action_id is required." }, { status: 400 });

  const action = await startActionTrackingRecord({ workspaceId, actionId });
  if (!action) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });

  return NextResponse.json({ ok: true, action });
}
