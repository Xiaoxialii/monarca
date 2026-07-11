import { NextResponse } from "next/server";
import { updateActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const { workspaceId } = await resolveActionSession();
  const actions = await updateActionTrackingRecords(workspaceId);

  return NextResponse.json({ ok: true, actions });
}
