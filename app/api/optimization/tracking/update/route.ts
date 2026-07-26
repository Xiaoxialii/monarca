import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { updateActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const actions = await updateActionTrackingRecords(workspaceId);

    return NextResponse.json({ ok: true, actions });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    throw error;
  }
}
