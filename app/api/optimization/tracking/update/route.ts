import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { updateActionTrackingRecords } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function POST() {
  const { workspaceId } = await resolveActionSession();
  const actions = await updateActionTrackingRecords(workspaceId);

  return NextResponse.json({ ok: true, actions });
}
