import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspaceId } = await resolveActionSession(request);
  const actions = await listActionTrackingRecords({ workspaceId });

  return NextResponse.json({ ok: true, actions });
}
