import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { getActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const { actionId } = await context.params;
    const record = await getActionTrackingRecord(actionId);

    if (!record || record.workspace_id !== workspaceId) {
      return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, action: record });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to load action." }, { status: 500 });
  }
}
