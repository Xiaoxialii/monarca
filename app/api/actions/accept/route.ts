import { NextResponse } from "next/server";
import { acceptActionTrackingRecord, getActionTrackingRecordByDecisionInstanceKey } from "@/lib/optimization/action-tracking-store";
import { resolveActionSession } from "@/app/api/actions/session";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await resolveActionSession(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    if (!body || typeof body.sku !== "string" || typeof body.action_type !== "string") {
      return NextResponse.json({ ok: false, message: "sku and action_type are required." }, { status: 400 });
    }
    const actionPayload = asRecord(body.action_payload);
    const requestedDecisionInstanceKey = typeof actionPayload.decision_instance_key === "string"
      ? actionPayload.decision_instance_key.trim()
      : "";
    if (!requestedDecisionInstanceKey) {
      console.error("Accept action request is missing decision instance key", {
        sku: body.sku,
        action_type: body.action_type
      });
      return NextResponse.json({
        ok: false,
        message: "Current optimization decision key is required before accepting an action."
      }, { status: 400 });
    }
    console.info("[action-accept:request]", {
      sku: body.sku,
      action_type: body.action_type,
      decision_instance_key: requestedDecisionInstanceKey
    });

    const record = await acceptActionTrackingRecord({
      workspace_id: workspaceId,
      sku: body.sku,
      lifecycle_stage: typeof body.lifecycle_stage === "string" ? body.lifecycle_stage : undefined,
      action_type: body.action_type,
      action_payload: actionPayload,
      accepted_by: userId,
      observation_window_days: typeof body.observation_window_days === "number" ? body.observation_window_days : 7,
      baseline_metrics: asRecord(body.baseline_metrics),
      predicted_metrics: asRecord(body.predicted_metrics),
      confidence_score: typeof body.confidence_score === "number" ? body.confidence_score : 0
    });
    const persistedDecisionInstanceKey = typeof record.action_payload?.decision_instance_key === "string"
      ? record.action_payload.decision_instance_key.trim()
      : "";
    console.info("[action-accept:persisted]", {
      sku: body.sku,
      action_type: body.action_type,
      action_id: record.action_id,
      decision_instance_key: persistedDecisionInstanceKey || null
    });
    if (requestedDecisionInstanceKey && persistedDecisionInstanceKey !== requestedDecisionInstanceKey) {
      console.error("Accepted action missing requested decision instance key", {
        sku: body.sku,
        action_type: body.action_type,
        requestedDecisionInstanceKey,
        persistedDecisionInstanceKey,
        actionId: record.action_id
      });
      return NextResponse.json({
        ok: false,
        message: "Accepted action was not persisted for the current optimization decision."
      }, { status: 500 });
    }
    const verifiedRecord = await getActionTrackingRecordByDecisionInstanceKey(workspaceId, requestedDecisionInstanceKey);
    if (!verifiedRecord) {
      console.error("Accepted action was not readable after persistence", {
        sku: body.sku,
        action_type: body.action_type,
        requestedDecisionInstanceKey,
        actionId: record.action_id
      });
      return NextResponse.json({
        ok: false,
        message: "Accepted action was not readable after persistence."
      }, { status: 500 });
    }

    console.info("[action-accept]", {
      sku: body.sku,
      action_type: body.action_type,
      action_id: verifiedRecord.action_id,
      decision_instance_key: persistedDecisionInstanceKey || null
    });
    return NextResponse.json({ ok: true, action: verifiedRecord });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to accept action", error);
    return NextResponse.json({ ok: false, message: "Failed to accept action." }, { status: 500 });
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
