import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { completeActionTrackingRecord } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  const { workspaceId } = await resolveActionSession(request);
  const { actionId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const actualMetrics = body?.actual_metrics && typeof body.actual_metrics === "object" && !Array.isArray(body.actual_metrics)
    ? body.actual_metrics as Record<string, number>
    : undefined;

  const action = await completeActionTrackingRecord({
    workspaceId,
    actionId,
    actual_metrics: actualMetrics
  });

  if (!action) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });
  return NextResponse.json({ ok: true, action });
}
