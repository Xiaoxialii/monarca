import { NextResponse } from "next/server";
import { acceptActionTrackingRecord } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { workspaceId, userId } = await resolveActionSession();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  if (!body || typeof body.sku !== "string" || typeof body.action_type !== "string") {
    return NextResponse.json({ ok: false, message: "sku and action_type are required." }, { status: 400 });
  }

  const record = await acceptActionTrackingRecord({
    workspace_id: workspaceId,
    sku: body.sku,
    action_type: body.action_type,
    action_payload: asRecord(body.action_payload),
    accepted_by: userId,
    observation_window_days: typeof body.observation_window_days === "number" ? body.observation_window_days : 7,
    baseline_metrics: asRecord(body.baseline_metrics),
    predicted_metrics: asRecord(body.predicted_metrics),
    confidence_score: typeof body.confidence_score === "number" ? body.confidence_score : 0
  });

  return NextResponse.json({ ok: true, action: record });
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number> : {};
}
