import { NextResponse } from "next/server";
import {
  acceptActionTrackingRecord,
  getDbActionTrackingRecordByDecisionInstanceKey,
  getDbActionTrackingRecordByRecommendationId
} from "@/lib/optimization/action-tracking-store";
import { findOptimizationReportCache, optimizationReportCachePayload } from "@/lib/dashboard/optimization-report-cache";
import { findLatestReportSnapshotLegacy } from "@/lib/dashboard/snapshot-store";
import { prisma } from "@/lib/prisma";
import { resolveActionSession } from "@/app/api/actions/session";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await resolveActionSession(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const skuId = typeof body?.sku_id === "string"
      ? body.sku_id.trim()
      : typeof body?.sku === "string"
        ? body.sku.trim()
        : "";

    if (!body || !skuId || typeof body.action_type !== "string") {
      return NextResponse.json({ ok: false, message: "sku_id and action_type are required." }, { status: 400 });
    }
    const optimizationRunId = typeof body.optimization_run_id === "string"
      ? body.optimization_run_id.trim()
      : "";
    const decisionId = typeof body.decision_id === "string"
      ? body.decision_id.trim()
      : "";
    const recommendationId = typeof body.recommendation_id === "string"
      ? body.recommendation_id.trim()
      : typeof asRecord(body.action_payload).recommendation_id === "string"
        ? String(asRecord(body.action_payload).recommendation_id).trim()
        : "";
    if (!optimizationRunId || optimizationRunId === "current-optimization-report" || !decisionId || !recommendationId) {
      console.error("Accept action request is missing canonical decision identity", {
        sku: skuId,
        action_type: body.action_type,
        optimization_run_id: optimizationRunId || null,
        decision_id: decisionId || null,
        recommendation_id: recommendationId || null
      });
      return NextResponse.json({
        ok: false,
        message: "Current optimization run, decision id, and recommendation id are required before accepting an action."
      }, { status: 400 });
    }
    const recommendationExists = await currentOptimizationRecommendationExists(workspaceId, recommendationId);
    if (!recommendationExists) {
      console.error("Accept action recommendation id is not present in the current optimization snapshot", {
        sku: skuId,
        action_type: body.action_type,
        optimization_run_id: optimizationRunId,
        recommendation_id: recommendationId,
        workspaceId
      });
      return NextResponse.json({
        ok: false,
        message: "Accepted recommendation is not present in the current optimization snapshot."
      }, { status: 409 });
    }
    const requestedDecisionInstanceKey = canonicalDecisionInstanceKey(recommendationId);
    const actionPayload = {
      ...asRecord(body.action_payload),
      sku_id: skuId,
      optimization_run_id: optimizationRunId,
      decision_id: decisionId,
      recommendation_id: recommendationId,
      decision_instance_key: requestedDecisionInstanceKey
    };
    console.log("[accept request]", {
      sku: skuId,
      actionType: body.action_type,
      recommendationId,
      decisionInstanceKey: requestedDecisionInstanceKey,
      workspaceId
    });

    const record = await acceptActionTrackingRecord({
      workspace_id: workspaceId,
      sku: skuId,
      lifecycle_stage: typeof body.lifecycle_stage === "string" ? body.lifecycle_stage : undefined,
      action_type: body.action_type,
      action_payload: actionPayload,
      accepted_by: userId,
      observation_window_days: typeof body.observation_window_days === "number" ? body.observation_window_days : 7,
      baseline_metrics: asRecord(body.baseline_metrics),
      predicted_metrics: asRecord(body.predicted_metrics),
      confidence_score: typeof body.confidence_score === "number" ? body.confidence_score : 0,
      require_database: true
    });
    const persistedDecisionInstanceKey = typeof record.action_payload?.decision_instance_key === "string"
      ? record.action_payload.decision_instance_key.trim()
      : "";
    console.info("[action-accept:persisted]", {
      sku: skuId,
      action_type: body.action_type,
      action_id: record.action_id,
      decision_instance_key: persistedDecisionInstanceKey || null
    });
    if (requestedDecisionInstanceKey && persistedDecisionInstanceKey !== requestedDecisionInstanceKey) {
      console.error("Accepted action missing requested decision instance key", {
        sku: skuId,
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
    const verifiedRecord = await getDbActionTrackingRecordByRecommendationId(workspaceId, recommendationId)
      ?? await getDbActionTrackingRecordByDecisionInstanceKey(workspaceId, requestedDecisionInstanceKey);
    if (!verifiedRecord) {
      console.error("Accepted action was not readable after persistence", {
        sku: skuId,
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
      sku: skuId,
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

function canonicalDecisionInstanceKey(recommendationId: string) {
  return recommendationId;
}

async function currentOptimizationRecommendationExists(workspaceId: string, recommendationId: string) {
  const cache = await findOptimizationReportCache(prisma, {
    workspaceId,
    mode: "full"
  });
  if (cache && optimizationPayloadIncludesRecommendation(optimizationReportCachePayload(cache), recommendationId)) {
    return true;
  }

  for (const mode of ["full", "sku"] as const) {
    const reportSnapshot = await findLatestReportSnapshotLegacy(prisma, {
      workspaceId,
      reportType: `optimization_decision_report:${mode}`,
      cacheKey: "latest"
    });
    if (optimizationPayloadIncludesRecommendation(asRecord(reportSnapshot?.contentJson), recommendationId)) {
      return true;
    }
  }

  return false;
}

function optimizationPayloadIncludesRecommendation(payload: Record<string, unknown>, recommendationId: string) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const rows = [
    ...asArray(optimization.skuDecisions),
    ...asArray(optimization.recommended_portfolio),
    ...asArray(report.skuDecisions),
    ...asArray(payload.skuDecisions)
  ];

  return rows.some((row) => asRecord(row).recommendation_id === recommendationId);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
