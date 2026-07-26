import { NextResponse } from "next/server";
import { updateActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { workspaceId } = await resolveActionSession(request);
  const actions = await updateActionTrackingRecords(workspaceId);

  return NextResponse.json({ ok: true, actions });
}
