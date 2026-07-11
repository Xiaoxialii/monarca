import { NextResponse } from "next/server";
import { rejectActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { workspaceId } = await resolveActionSession();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  const record = await rejectActionTrackingRecord({
    workspace_id: workspaceId,
    action_id: typeof body?.action_id === "string" ? body.action_id : undefined,
    sku: typeof body?.sku === "string" ? body.sku : undefined,
    action_type: typeof body?.action_type === "string" ? body.action_type : undefined
  });

  if (!record) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });

  return NextResponse.json({ ok: true, action: record });
}
