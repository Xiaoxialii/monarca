import { NextResponse } from "next/server";
import { rejectActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await resolveActionSession(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    const record = await rejectActionTrackingRecord({
      workspace_id: workspaceId,
      user_id: userId,
      action_id: typeof body?.action_id === "string" ? body.action_id : undefined,
      sku: typeof body?.sku === "string" ? body.sku : undefined,
      action_type: typeof body?.action_type === "string" ? body.action_type : undefined,
      lifecycle_stage: typeof body?.lifecycle_stage === "string" ? body.lifecycle_stage : undefined,
      action_payload: asRecord(body?.action_payload),
      baseline_metrics: asRecord(body?.baseline_metrics),
      predicted_metrics: asRecord(body?.predicted_metrics),
      confidence_score: typeof body?.confidence_score === "number" ? body.confidence_score : 0
    });

    if (!record) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });

    return NextResponse.json({ ok: true, action: record });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to reject action", error);
    return NextResponse.json({ ok: false, message: "Failed to reject action." }, { status: 500 });
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number> : {};
}
