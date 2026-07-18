/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { prisma } from "@/lib/prisma";
import { recordOptimizationFeedback } from "@/lib/optimization/feedback-learning-engine";
import type {
  ActionEvaluationResult,
  DecisionAttributionSnapshot,
  ActionMetricsSnapshot,
  ActionTrackingRecord,
  ActionTrackingStatus
} from "@/lib/optimization/action-tracking-types";

const STORE_PATH = join(process.cwd(), ".monarca-artifacts", "action-feedback", "actions.json");

type AcceptActionInput = {
  workspace_id: string;
  sku: string;
  lifecycle_stage?: string;
  action_type: string;
  action_payload?: Record<string, unknown>;
  accepted_by?: string | null;
  observation_window_days?: number;
  baseline_metrics?: ActionMetricsSnapshot;
  predicted_metrics?: ActionMetricsSnapshot;
  confidence_score?: number;
};

type RejectActionInput = {
  action_id?: string;
  workspace_id: string;
  user_id?: string | null;
  sku?: string;
  action_type?: string;
  lifecycle_stage?: string;
  action_payload?: Record<string, unknown>;
  baseline_metrics?: ActionMetricsSnapshot;
  predicted_metrics?: ActionMetricsSnapshot;
  confidence_score?: number;
};

type PersistedDecisionAction = {
  id: string;
  workspaceId: string;
  skuId: string;
  actionType: string;
  decisionDrivers: unknown;
  expectedImpact: number;
  actualImpact: number | null;
  confidence: number;
  status: string;
  recommendedAction: string | null;
  optimizationGoal: string | null;
  lifecycleStage: string | null;
  baselineSnapshotId: string | null;
  predictionSnapshotId: string | null;
  actionPayload: unknown;
  createdAt: Date;
  acceptedAt: Date | null;
  executionStartedAt: Date | null;
  executionCompletedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
  evaluatedAt: Date | null;
  updatedAt: Date;
  outcome?: {
    predictedProfit: number;
    realizedProfit: number;
    profitDelta: number;
    accuracy: number | null;
    learningSignals: unknown;
  } | null;
};

export async function listActionTrackingRecords(filter: { workspaceId?: string; status?: ActionTrackingStatus | null } = {}) {
  try {
    const rows = await (prisma as any).decisionAction.findMany({
      where: {
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
        ...(filter.status ? { status: dbStatusFromTrackingStatus(filter.status) } : {})
      },
      include: { outcome: true },
      orderBy: { updatedAt: "desc" }
    }) as PersistedDecisionAction[];

    return rows.map(recordFromDecisionAction);
  } catch {
    return listJsonActionTrackingRecords(filter);
  }
}

export async function getActionTrackingRecord(actionId: string) {
  try {
    const row = await (prisma as any).decisionAction.findUnique({
      where: { id: actionId },
      include: { outcome: true }
    }) as PersistedDecisionAction | null;

    return row ? recordFromDecisionAction(row) : null;
  } catch {
    const records = await readJsonRecords();
    return records.find((record) => record.action_id === actionId) ?? null;
  }
}

export async function acceptActionTrackingRecord(input: AcceptActionInput) {
  try {
    const existing = await (prisma as any).decisionAction.findFirst({
      where: {
        workspaceId: input.workspace_id,
        skuId: input.sku,
        actionType: dbActionType(input.action_type),
        NOT: { status: "REJECTED" }
      },
      include: { outcome: true },
      orderBy: { updatedAt: "desc" }
    }) as PersistedDecisionAction | null;
    const now = new Date();

    if (existing) {
      const snapshots = existing.baselineSnapshotId && existing.predictionSnapshotId
        ? { baselineSnapshotId: existing.baselineSnapshotId, predictionSnapshotId: existing.predictionSnapshotId }
        : await createDecisionSnapshots(input);
      const updated = await (prisma as any).decisionAction.update({
        where: { id: existing.id },
        data: {
          status: existing.status === "RECOMMENDED" || existing.status === "PENDING_APPROVAL" ? "ACCEPTED" : existing.status,
          acceptedAt: existing.acceptedAt ?? now,
          recommendedAction: String(input.action_payload?.action ?? input.action_type),
          optimizationGoal: String(input.action_payload?.optimization_goal ?? input.action_payload?.optimizationGoal ?? input.action_type),
          lifecycleStage: input.lifecycle_stage ?? existing.lifecycleStage,
          baselineSnapshotId: existing.baselineSnapshotId ?? snapshots.baselineSnapshotId,
          predictionSnapshotId: existing.predictionSnapshotId ?? snapshots.predictionSnapshotId,
          actionPayload: buildActionPayload(input, existing.actionPayload)
        },
        include: { outcome: true }
      }) as PersistedDecisionAction;
      await upsertOptimizationDecisionFromAction(input, updated, "ACCEPTED").catch(() => null);
      return recordFromDecisionAction(updated);
    }

    const snapshots = await createDecisionSnapshots(input);
    const created = await (prisma as any).decisionAction.create({
      data: {
        workspaceId: input.workspace_id,
        skuId: input.sku,
        recommendedAction: String(input.action_payload?.action ?? input.action_type),
        optimizationGoal: String(input.action_payload?.optimization_goal ?? input.action_payload?.optimizationGoal ?? input.action_type),
        lifecycleStage: input.lifecycle_stage ?? null,
        actionType: dbActionType(input.action_type),
        decisionDrivers: extractDecisionDrivers(input.action_payload),
        expectedImpact: expectedProfitLiftFromInput(input),
        confidence: input.confidence_score ?? 0,
        status: "ACCEPTED",
        baselineSnapshotId: snapshots.baselineSnapshotId,
        predictionSnapshotId: snapshots.predictionSnapshotId,
        actionPayload: buildActionPayload(input),
        acceptedAt: now
      },
      include: { outcome: true }
    }) as PersistedDecisionAction;
    await upsertOptimizationDecisionFromAction(input, created, "ACCEPTED").catch(() => null);

    return recordFromDecisionAction(created);
  } catch {
    return acceptJsonActionTrackingRecord(input);
  }
}

export async function rejectActionTrackingRecord(input: RejectActionInput) {
  try {
    const existing = input.action_id
      ? await (prisma as any).decisionAction.findFirst({
        where: {
          id: input.action_id,
          workspaceId: input.workspace_id
        },
        include: { outcome: true }
      }) as PersistedDecisionAction | null
      : await (prisma as any).decisionAction.findFirst({
        where: {
          workspaceId: input.workspace_id,
          ...(input.sku ? { skuId: input.sku } : {}),
          ...(input.action_type ? { actionType: dbActionType(input.action_type) } : {})
        },
        include: { outcome: true },
        orderBy: { updatedAt: "desc" }
      }) as PersistedDecisionAction | null;

    if (!existing) {
      if (!input.sku || !input.action_type) return null;

      const created = await (prisma as any).decisionAction.create({
        data: {
          workspaceId: input.workspace_id,
          skuId: input.sku,
          recommendedAction: String(input.action_payload?.action ?? input.action_type),
          optimizationGoal: String(input.action_payload?.optimization_goal ?? input.action_payload?.optimizationGoal ?? input.action_type),
          lifecycleStage: input.lifecycle_stage ?? null,
          actionType: dbActionType(input.action_type),
          decisionDrivers: extractDecisionDrivers(input.action_payload),
          expectedImpact: expectedProfitLiftFromRejectInput(input),
          confidence: input.confidence_score ?? 0,
          status: "REJECTED",
          actionPayload: buildRejectedActionPayload(input)
        },
        include: { outcome: true }
      }) as PersistedDecisionAction;
      await upsertOptimizationDecisionFromRejectedAction(input, created).catch(() => null);
      return recordFromDecisionAction(created);
    }

    const updated = await (prisma as any).decisionAction.update({
      where: { id: existing.id },
      data: {
        status: "REJECTED",
        actionPayload: mergeTrackingPayload(existing.actionPayload, {
          rejected_at: new Date().toISOString()
        })
      },
      include: { outcome: true }
    }) as PersistedDecisionAction;
    await upsertOptimizationDecisionFromRejectedAction(input, updated).catch(() => null);

    return recordFromDecisionAction(updated);
  } catch {
    return rejectJsonActionTrackingRecord(input);
  }
}

export async function startActionTrackingRecord(input: { workspaceId?: string; actionId: string }) {
  try {
    const now = new Date();
    const row = await (prisma as any).decisionAction.findFirst({
      where: {
        id: input.actionId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {})
      },
      include: { outcome: true }
    }) as PersistedDecisionAction | null;

    if (!row) return null;

    const updated = await (prisma as any).decisionAction.update({
      where: { id: row.id },
      data: {
        status: "EXECUTING",
        executionStartedAt: row.executionStartedAt ?? now,
        executedAt: row.executedAt ?? now
      },
      include: { outcome: true }
    }) as PersistedDecisionAction;

    await (prisma as any).optimizationDecision.updateMany({
      where: { trackingActionId: row.id },
      data: {
        executionStatus: "EXECUTING",
        executionStartDate: row.executionStartedAt ?? now,
        learningStatus: "TRACKING"
      }
    }).catch(() => null);

    return recordFromDecisionAction(updated);
  } catch {
    const records = await readJsonRecords();
    const now = new Date().toISOString();
    const record = records.find((item) =>
      item.action_id === input.actionId &&
      (!input.workspaceId || item.workspace_id === input.workspaceId)
    );
    if (!record) return null;
    record.status = "running";
    record.updated_at = now;
    await writeJsonRecords(records);
    return record;
  }
}

export async function updateActionTrackingRecords(workspaceId?: string) {
  try {
    const rows = await (prisma as any).decisionAction.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        status: { in: ["ACCEPTED", "EXECUTING"] }
      },
      include: { outcome: true }
    }) as PersistedDecisionAction[];
    const now = new Date();

    for (const row of rows) {
      const record = recordFromDecisionAction(row);
      const predictedLift = predictedProfitLift(record);
      const baselineProfit = record.baseline_metrics.profit ?? 0;
      const elapsedRatio = progressRatio(record, now);
      const realizedLift = predictedLift * (0.28 + elapsedRatio * 0.52);
      const actualMetrics = {
        ...record.actual_metrics,
        profit: roundMoney(baselineProfit + realizedLift),
        revenue: maybeAdd(record.baseline_metrics.revenue, predictedLift * 1.45 * elapsedRatio),
        ad_spend: record.predicted_metrics.ad_spend ?? record.baseline_metrics.ad_spend,
        roas: record.predicted_metrics.roas ?? record.baseline_metrics.roas,
        sold_units: record.predicted_metrics.sold_units ?? record.baseline_metrics.sold_units,
        stock: record.predicted_metrics.stock ?? record.baseline_metrics.stock
      };
      const nextRecord = { ...record, actual_metrics: actualMetrics };
      const attribution = calculateDecisionAttribution(nextRecord);
      const nextStatus = elapsedRatio >= 1 ? "COMPLETED" : "EXECUTING";

      await (prisma as any).decisionAction.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          actualImpact: attribution.attributed_profit_change,
          completedAt: nextStatus === "COMPLETED" ? now : row.completedAt,
          executionStartedAt: row.executionStartedAt ?? now,
          executionCompletedAt: nextStatus === "COMPLETED" ? now : row.executionCompletedAt,
          executedAt: row.executedAt ?? now,
          actionPayload: mergeTrackingPayload(row.actionPayload, {
            actual_metrics: actualMetrics,
            attribution
          })
        }
      });
      await writeDecisionTrackingSnapshot(row, nextRecord, attribution, now).catch(() => null);
      await syncOptimizationDecisionExecution(row.id, nextStatus, actualProfitLift(nextRecord), attribution).catch(() => null);
    }

    return listActionTrackingRecords({ workspaceId });
  } catch {
    return updateJsonActionTrackingRecords(workspaceId);
  }
}

export async function completeActionTrackingRecord(input: { workspaceId?: string; actionId: string; actual_metrics?: ActionMetricsSnapshot }) {
  try {
    const row = await (prisma as any).decisionAction.findFirst({
      where: {
        id: input.actionId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {})
      },
      include: { outcome: true }
    }) as PersistedDecisionAction | null;

    if (!row) return null;

    const record = recordFromDecisionAction(row);
    const actualMetrics = {
      ...record.actual_metrics,
      ...input.actual_metrics
    };
    if (actualMetrics.profit == null) {
      actualMetrics.profit = roundMoney((record.baseline_metrics.profit ?? 0) + predictedProfitLift(record));
    }
    const nextRecord = { ...record, actual_metrics: actualMetrics };
    const actualImpact = actualProfitLift(nextRecord);
    const attribution = calculateDecisionAttribution(nextRecord);
    const outcomeStatus = outcomeStatusForAttribution(attribution);
    const now = new Date();

    const updated = await (prisma as any).decisionAction.update({
      where: { id: row.id },
      data: {
        status: "COMPLETED",
        actualImpact: attribution.attributed_profit_change,
        completedAt: now,
        executionCompletedAt: now,
        actionPayload: mergeTrackingPayload(row.actionPayload, {
          actual_metrics: actualMetrics,
          attribution
        }),
        outcome: {
          upsert: {
            create: {
              baselineProfit: record.baseline_metrics.profit ?? 0,
              expectedProfitChange: predictedProfitLift(record),
              actualProfitChange: actualImpact,
              attributedProfitChange: attribution.attributed_profit_change,
              organicProfitChange: attribution.organic_profit_change,
              profitVariance: roundMoney(attribution.attributed_profit_change - predictedProfitLift(record)),
              outcomeStatus,
              predictedProfit: predictedProfitLift(record),
              realizedProfit: attribution.attributed_profit_change,
              profitDelta: roundMoney(attribution.attributed_profit_change - predictedProfitLift(record)),
              attributionJson: attribution,
              learningSignals: []
            },
            update: {
              baselineProfit: record.baseline_metrics.profit ?? 0,
              expectedProfitChange: predictedProfitLift(record),
              actualProfitChange: actualImpact,
              attributedProfitChange: attribution.attributed_profit_change,
              organicProfitChange: attribution.organic_profit_change,
              profitVariance: roundMoney(attribution.attributed_profit_change - predictedProfitLift(record)),
              outcomeStatus,
              predictedProfit: predictedProfitLift(record),
              realizedProfit: attribution.attributed_profit_change,
              profitDelta: roundMoney(attribution.attributed_profit_change - predictedProfitLift(record)),
              attributionJson: attribution
            }
          }
        }
      },
      include: { outcome: true }
    }) as PersistedDecisionAction;
    await writeDecisionTrackingSnapshot(row, nextRecord, attribution, now).catch(() => null);
    await syncOptimizationDecisionOutcome(row.id, actualImpact, attribution).catch(() => null);

    return recordFromDecisionAction(updated);
  } catch {
    return completeJsonActionTrackingRecord(input);
  }
}

export async function evaluateActionTrackingRecord(input: { workspaceId?: string; actionId?: string }) {
  try {
    const rows = await (prisma as any).decisionAction.findMany({
      where: {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.actionId ? { id: input.actionId } : {}),
        status: { in: ["COMPLETED", "EXECUTING"] }
      },
      include: { outcome: true }
    }) as PersistedDecisionAction[];
    const now = new Date();
    const updatedRecords: ActionTrackingRecord[] = [];

    for (const row of rows) {
      const record = recordFromDecisionAction(row);
      const predictedLift = predictedProfitLift(record);
      const actualLift = actualProfitLift(record);
      const attribution = calculateDecisionAttribution(record);
      const attributedLift = attribution.attributed_profit_change;
      const gap = roundMoney(attributedLift - predictedLift);
      const errorRate = roundRatio(Math.abs(gap) / Math.max(1, Math.abs(predictedLift)));
      const outcomeStatus = outcomeStatusForAttribution(attribution);
      const resultLabel: ActionEvaluationResult["result_label"] = errorRate <= 0.2 ? "win" : errorRate <= 0.55 ? "neutral" : "miss";
      const feedback = recordOptimizationFeedback({
        action: record.action_type,
        sku: record.sku,
        predicted_profit: predictedLift,
        predicted_revenue: record.predicted_metrics.revenue,
        confidence: record.confidence_score,
        actual_profit: attributedLift,
        actual_revenue: record.actual_metrics.revenue
      });
      const learningSignals = extractDecisionDrivers(record.action_payload);
      const evaluationResult: ActionEvaluationResult = {
        predicted_vs_actual_gap: gap,
        error_rate: errorRate,
        result_label: resultLabel,
        outcome_status: outcomeStatus,
        attribution,
        learning_feedback: learningFeedbackForOutcome(outcomeStatus, errorRate, feedback.confidence_adjustment),
        evaluated_at: now.toISOString()
      };

      const updated = await (prisma as any).decisionAction.update({
        where: { id: row.id },
        data: {
          status: "LEARNED",
          evaluatedAt: now,
          actionPayload: mergeTrackingPayload(row.actionPayload, {
            evaluation_result: evaluationResult,
            learning_feedback: evaluationResult.learning_feedback
          }),
          outcome: {
            upsert: {
              create: {
                baselineProfit: record.baseline_metrics.profit ?? 0,
                expectedProfitChange: predictedLift,
                actualProfitChange: actualLift,
                attributedProfitChange: attributedLift,
                organicProfitChange: attribution.organic_profit_change,
                profitVariance: gap,
                outcomeStatus,
                predictedProfit: predictedLift,
                realizedProfit: attributedLift,
                profitDelta: gap,
                accuracy: roundRatio(1 - errorRate),
                attributionJson: attribution,
                learningSignals
              },
              update: {
                baselineProfit: record.baseline_metrics.profit ?? 0,
                expectedProfitChange: predictedLift,
                actualProfitChange: actualLift,
                attributedProfitChange: attributedLift,
                organicProfitChange: attribution.organic_profit_change,
                profitVariance: gap,
                outcomeStatus,
                predictedProfit: predictedLift,
                realizedProfit: attributedLift,
                profitDelta: gap,
                accuracy: roundRatio(1 - errorRate),
                attributionJson: attribution,
                learningSignals
              }
            }
          }
        },
        include: { outcome: true }
      }) as PersistedDecisionAction;
      await createOptimizationLearningRecord(row, record, predictedLift, attributedLift, gap, outcomeStatus === "POSITIVE").catch(() => null);
      await syncOptimizationDecisionLearning(row.id, actualLift, gap, attribution, outcomeStatus).catch(() => null);

      updatedRecords.push(recordFromDecisionAction(updated));
    }

    return updatedRecords;
  } catch {
    return evaluateJsonActionTrackingRecord(input);
  }
}

function recordFromDecisionAction(row: PersistedDecisionAction): ActionTrackingRecord {
  const payload = safeRecord(row.actionPayload);
  const tracking = safeRecord(payload.tracking);
  const baselineMetrics = metricsFromUnknown(tracking.baseline_metrics);
  const predictedMetrics = metricsFromUnknown(tracking.predicted_metrics);
  const actualMetrics = metricsFromUnknown(tracking.actual_metrics);
  const attribution = attributionFromUnknown(tracking.attribution);
  if (row.actualImpact != null && actualMetrics.profit == null) {
    actualMetrics.profit = roundMoney((baselineMetrics.profit ?? 0) + row.actualImpact);
  }

  return {
    action_id: row.id,
    workspace_id: row.workspaceId,
    sku: row.skuId,
    lifecycle_stage: asString(tracking.lifecycle_stage) ?? row.lifecycleStage ?? undefined,
    action_type: asString(tracking.action_type_original) ?? row.recommendedAction ?? row.actionType,
    action_payload: payload,
    accepted_by: asString(tracking.accepted_by),
    accepted_at: iso(row.acceptedAt),
    rejected_at: asString(tracking.rejected_at),
    status: trackingStatusFromDbStatus(row.status),
    observation_window_days: numberFromUnknown(tracking.observation_window_days) ?? 7,
    baseline_metrics: baselineMetrics,
    predicted_metrics: predictedMetrics,
    actual_metrics: actualMetrics,
    attribution,
    evaluation_result: evaluationResultFromUnknown(tracking.evaluation_result),
    confidence_score: row.confidence,
    learning_feedback: asString(tracking.learning_feedback),
    created_at: iso(row.createdAt) ?? new Date().toISOString(),
    updated_at: iso(row.updatedAt) ?? new Date().toISOString()
  };
}

function buildActionPayload(input: AcceptActionInput, existingPayload?: unknown) {
  const payload = {
    ...safeRecord(existingPayload),
    ...(input.action_payload ?? {})
  };
  return {
    ...payload,
    tracking: {
      ...safeRecord(safeRecord(existingPayload).tracking),
      action_type_original: input.action_type,
      lifecycle_stage: input.lifecycle_stage,
      accepted_by: input.accepted_by ?? null,
      observation_window_days: input.observation_window_days ?? 7,
      baseline_metrics: input.baseline_metrics ?? {},
      predicted_metrics: input.predicted_metrics ?? {},
      actual_metrics: safeRecord(safeRecord(existingPayload).tracking).actual_metrics ?? {},
      evaluation_result: safeRecord(safeRecord(existingPayload).tracking).evaluation_result ?? null,
      learning_feedback: safeRecord(safeRecord(existingPayload).tracking).learning_feedback ?? null
    }
  };
}

async function createDecisionSnapshots(input: AcceptActionInput) {
  const payload = input.action_payload ?? {};
  const common = {
    workspaceId: input.workspace_id,
    skuId: input.sku,
    acceptedAction: String(payload.action ?? input.action_type),
    lifecycle: input.lifecycle_stage ?? null,
    optimizationGoal: String(payload.optimization_goal ?? payload.optimizationGoal ?? input.action_type),
    alternatives: alternativeActionsFromPayload(payload),
    reasoning: safeRecord(payload.decision_explanation ?? payload.reasoning),
    confidence: input.confidence_score ?? 0
  };
  const [baseline, prediction] = await Promise.all([
    (prisma as any).decisionSnapshot.create({
      data: {
        ...common,
        snapshotType: "BASELINE",
        baselineMetrics: input.baseline_metrics ?? {},
        predictedMetrics: {},
      }
    }),
    (prisma as any).decisionSnapshot.create({
      data: {
        ...common,
        snapshotType: "PREDICTION",
        baselineMetrics: {},
        predictedMetrics: {
          ...(input.predicted_metrics ?? {}),
          expected_profit_impact: expectedProfitLiftFromInput(input),
          expected_revenue_impact: roundMoney((input.predicted_metrics?.revenue ?? 0) - (input.baseline_metrics?.revenue ?? 0)),
          expected_cost_change: expectedCostChange(input.baseline_metrics ?? {}, input.predicted_metrics ?? {}),
          expected_ad_spend: roundMoney(Math.max(0, (input.predicted_metrics?.ad_spend ?? 0) - (input.baseline_metrics?.ad_spend ?? 0))),
          confidence: input.confidence_score ?? 0
        }
      }
    })
  ]);

  return {
    baselineSnapshotId: baseline.id as string,
    predictionSnapshotId: prediction.id as string
  };
}

function buildRejectedActionPayload(input: RejectActionInput) {
  return {
    ...(input.action_payload ?? {}),
    tracking: {
      action_type_original: input.action_type,
      lifecycle_stage: input.lifecycle_stage,
      rejected_at: new Date().toISOString(),
      observation_window_days: 0,
	    baseline_metrics: input.baseline_metrics ?? {},
	    predicted_metrics: input.predicted_metrics ?? {},
	    actual_metrics: {},
	    attribution: null,
	    evaluation_result: null,
      learning_feedback: "User rejected this recommendation; future thresholds should account for acceptance behavior."
    }
  };
}

function mergeTrackingPayload(payload: unknown, updates: Record<string, unknown>) {
  const current = safeRecord(payload);
  return {
    ...current,
    tracking: {
      ...safeRecord(current.tracking),
      ...updates
    }
  };
}

function extractDecisionDrivers(payload?: Record<string, unknown>) {
  const drivers = payload?.decision_drivers ?? payload?.decisionDrivers;
  return Array.isArray(drivers) ? drivers : [];
}

function expectedProfitLiftFromInput(input: AcceptActionInput) {
  return roundMoney(Math.max(0, (input.predicted_metrics?.profit ?? 0) - (input.baseline_metrics?.profit ?? 0)));
}

function expectedProfitLiftFromRejectInput(input: RejectActionInput) {
  return roundMoney(Math.max(0, (input.predicted_metrics?.profit ?? 0) - (input.baseline_metrics?.profit ?? 0)));
}

async function upsertOptimizationDecisionFromAction(input: AcceptActionInput, action: PersistedDecisionAction, decisionStatus: "ACCEPTED") {
  const payload = safeRecord(input.action_payload);
  const baseline = input.baseline_metrics ?? {};
  const predicted = input.predicted_metrics ?? {};
  const now = new Date();

  await (prisma as any).optimizationDecision.upsert({
    where: { id: await optimizationDecisionIdForAction(action.id) },
    create: {
      workspaceId: input.workspace_id,
      userId: input.accepted_by ?? null,
      skuId: input.sku,
      recommendedAction: String(payload.action ?? input.action_type),
      optimizationGoal: String(payload.optimization_goal ?? payload.optimizationGoal ?? action.actionType),
      lifecycleStage: input.lifecycle_stage ?? null,
      expectedProfitImpact: expectedProfitLiftFromInput(input),
      expectedRevenueImpact: roundMoney((predicted.revenue ?? 0) - (baseline.revenue ?? 0)),
      expectedCostChange: expectedCostChange(baseline, predicted),
      expectedAdSpend: roundMoney(Math.max(0, (predicted.ad_spend ?? 0) - (baseline.ad_spend ?? 0))),
      confidence: input.confidence_score ?? 0,
      riskScore: numberFromUnknown(payload.risk_score) ?? numberFromUnknown(payload.riskScore) ?? 0,
      alternativeActions: alternativeActionsFromPayload(payload),
      decisionStatus,
      acceptedBy: input.accepted_by ?? null,
      acceptedAt: action.acceptedAt ?? now,
      executionStatus: "NOT_STARTED",
      trackingActionId: action.id,
      learningStatus: "ACCEPTED"
    },
    update: {
      decisionStatus,
      acceptedBy: input.accepted_by ?? null,
      acceptedAt: action.acceptedAt ?? now,
      executionStatus: "NOT_STARTED",
      trackingActionId: action.id,
      expectedProfitImpact: expectedProfitLiftFromInput(input),
      expectedRevenueImpact: roundMoney((predicted.revenue ?? 0) - (baseline.revenue ?? 0)),
      expectedCostChange: expectedCostChange(baseline, predicted),
      expectedAdSpend: roundMoney(Math.max(0, (predicted.ad_spend ?? 0) - (baseline.ad_spend ?? 0))),
      confidence: input.confidence_score ?? 0,
      learningStatus: "ACCEPTED"
    }
  });
}

async function upsertOptimizationDecisionFromRejectedAction(input: RejectActionInput, action: PersistedDecisionAction) {
  const payload = safeRecord(input.action_payload ?? safeRecord(action.actionPayload));
  const baseline = input.baseline_metrics ?? metricsFromUnknown(safeRecord(safeRecord(action.actionPayload).tracking).baseline_metrics);
  const predicted = input.predicted_metrics ?? metricsFromUnknown(safeRecord(safeRecord(action.actionPayload).tracking).predicted_metrics);
  const now = new Date();

  await (prisma as any).optimizationDecision.upsert({
    where: { id: await optimizationDecisionIdForAction(action.id) },
    create: {
      workspaceId: input.workspace_id,
      userId: input.user_id ?? null,
      skuId: input.sku ?? action.skuId,
      recommendedAction: String(payload.action ?? input.action_type ?? action.actionType),
      optimizationGoal: String(payload.optimization_goal ?? payload.optimizationGoal ?? action.actionType),
      lifecycleStage: input.lifecycle_stage ?? null,
      expectedProfitImpact: expectedProfitLiftFromRejectInput(input),
      expectedRevenueImpact: roundMoney((predicted.revenue ?? 0) - (baseline.revenue ?? 0)),
      expectedCostChange: expectedCostChange(baseline, predicted),
      expectedAdSpend: roundMoney(Math.max(0, (predicted.ad_spend ?? 0) - (baseline.ad_spend ?? 0))),
      confidence: input.confidence_score ?? action.confidence ?? 0,
      riskScore: numberFromUnknown(payload.risk_score) ?? numberFromUnknown(payload.riskScore) ?? 0,
      alternativeActions: alternativeActionsFromPayload(payload),
      decisionStatus: "REJECTED",
      rejectedAt: now,
      executionStatus: "NOT_STARTED",
      trackingActionId: action.id,
      learningStatus: "REJECTED_BY_USER"
    },
    update: {
      decisionStatus: "REJECTED",
      rejectedAt: now,
      executionStatus: "NOT_STARTED",
      trackingActionId: action.id,
      learningStatus: "REJECTED_BY_USER"
    }
  });
}

async function syncOptimizationDecisionExecution(
  actionId: string,
  status: string,
  actualProfitChange: number,
  attribution: DecisionAttributionSnapshot
) {
  await (prisma as any).optimizationDecision.updateMany({
    where: { trackingActionId: actionId },
    data: {
      executionStatus: status === "COMPLETED" ? "COMPLETED" : "EXECUTING",
      executionEndDate: status === "COMPLETED" ? new Date() : undefined,
      actualProfitChange,
      attributedProfitChange: attribution.attributed_profit_change,
      organicProfitChange: attribution.organic_profit_change,
      outcomeStatus: outcomeStatusForAttribution(attribution),
      attributionJson: attribution,
      learningStatus: status === "COMPLETED" ? "READY_TO_LEARN" : "TRACKING"
    }
  });
}

async function syncOptimizationDecisionOutcome(
  actionId: string,
  actualProfitChange: number,
  attribution: DecisionAttributionSnapshot
) {
  const rows = await (prisma as any).optimizationDecision.findMany({ where: { trackingActionId: actionId } });
  for (const row of rows) {
    await (prisma as any).optimizationDecision.update({
      where: { id: row.id },
      data: {
        executionStatus: "COMPLETED",
        executionEndDate: new Date(),
        actualProfitChange,
        attributedProfitChange: attribution.attributed_profit_change,
        organicProfitChange: attribution.organic_profit_change,
        outcomeStatus: outcomeStatusForAttribution(attribution),
        attributionJson: attribution,
        predictionError: roundMoney(attribution.attributed_profit_change - (row.expectedProfitImpact ?? 0)),
        learningStatus: "READY_TO_LEARN"
      }
    });
  }
}

async function syncOptimizationDecisionLearning(
  actionId: string,
  actualProfitChange: number,
  predictionError: number,
  attribution: DecisionAttributionSnapshot,
  outcomeStatus: "POSITIVE" | "NEGATIVE" | "NEUTRAL"
) {
  await (prisma as any).optimizationDecision.updateMany({
    where: { trackingActionId: actionId },
    data: {
      actualProfitChange,
      attributedProfitChange: attribution.attributed_profit_change,
      organicProfitChange: attribution.organic_profit_change,
      outcomeStatus,
      attributionJson: attribution,
      predictionError,
      learningStatus: "LEARNED"
    }
  });
}

async function createOptimizationLearningRecord(
  row: PersistedDecisionAction,
  record: ActionTrackingRecord,
  predictedLift: number,
  actualLift: number,
  error: number,
  success: boolean
) {
  await (prisma as any).optimizationLearningRecord.create({
    data: {
      workspaceId: row.workspaceId,
      skuCategory: asString(safeRecord(record.action_payload).sku_category),
      industry: asString(safeRecord(record.action_payload).industry),
      lifecycle: record.lifecycle_stage ?? null,
      action: record.action_type,
      prediction: predictedLift,
      actual: actualLift,
      error,
      success,
      confidence: record.confidence_score,
      metadataJson: {
        sku: record.sku,
        result: success ? "win" : "miss",
        tracking_action_id: row.id,
        attribution: record.attribution ?? null
      }
    }
  });
}

async function optimizationDecisionIdForAction(actionId: string) {
  const existing = await (prisma as any).optimizationDecision.findFirst({
    where: { trackingActionId: actionId },
    select: { id: true }
  });
  return existing?.id ?? `od_${actionId}`;
}

async function writeDecisionTrackingSnapshot(
  row: PersistedDecisionAction,
  record: ActionTrackingRecord,
  attribution: DecisionAttributionSnapshot,
  now: Date
) {
  const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const acceptedAt = row.acceptedAt ?? now;
  const dayIndex = Math.max(1, Math.ceil((snapshotDate.getTime() - acceptedAt.getTime()) / (24 * 60 * 60 * 1000)) + 1);

  await (prisma as any).decisionTrackingSnapshot.upsert({
    where: {
      decisionId_snapshotDate: {
        decisionId: row.id,
        snapshotDate
      }
    },
    create: {
      workspaceId: row.workspaceId,
      decisionId: row.id,
      snapshotDate,
      dayIndex,
      baselineMetrics: record.baseline_metrics,
      expectedMetrics: record.predicted_metrics,
      actualMetrics: record.actual_metrics,
      attributedMetrics: {
        profit: attribution.attributed_profit_change,
        revenue: attribution.attributed_revenue_change,
        ad_spend: attribution.attributed_ad_spend_change
      },
      organicMetrics: {
        profit: attribution.organic_profit_change,
        revenue: attribution.organic_revenue_change
      }
    },
    update: {
      dayIndex,
      baselineMetrics: record.baseline_metrics,
      expectedMetrics: record.predicted_metrics,
      actualMetrics: record.actual_metrics,
      attributedMetrics: {
        profit: attribution.attributed_profit_change,
        revenue: attribution.attributed_revenue_change,
        ad_spend: attribution.attributed_ad_spend_change
      },
      organicMetrics: {
        profit: attribution.organic_profit_change,
        revenue: attribution.organic_revenue_change
      }
    }
  });
}

function calculateDecisionAttribution(record: ActionTrackingRecord): DecisionAttributionSnapshot {
  const actualProfitChange = actualProfitLift(record);
  const actualRevenueChange = metricDelta(record.actual_metrics.revenue, record.baseline_metrics.revenue);
  const adSpendChange = metricDelta(record.actual_metrics.ad_spend, record.baseline_metrics.ad_spend);
  const expectedProfit = predictedProfitLift(record);
  const expectedAdSpend = metricDelta(record.predicted_metrics.ad_spend, record.baseline_metrics.ad_spend);
  const actionWeight = attributionWeightForAction(record.action_type, expectedAdSpend, adSpendChange);
  const attributedProfit = roundMoney(actualProfitChange * actionWeight);
  const attributedRevenue = roundMoney(actualRevenueChange * actionWeight);

  return {
    attributed_profit_change: attributedProfit,
    organic_profit_change: roundMoney(actualProfitChange - attributedProfit),
    attributed_revenue_change: attributedRevenue,
    organic_revenue_change: roundMoney(actualRevenueChange - attributedRevenue),
    attributed_ad_spend_change: roundMoney(expectedAdSpend ? Math.min(Math.max(0, adSpendChange), Math.abs(expectedAdSpend)) : Math.max(0, adSpendChange)),
    confidence: attributionConfidence(expectedProfit, actualProfitChange, actionWeight),
    method: "baseline_expected_actual_split"
  };
}

function attributionWeightForAction(actionType: string, expectedAdSpend: number, actualAdSpend: number) {
  const normalized = actionType.toUpperCase();
  if (normalized.includes("SCALE") || normalized.includes("ADS")) {
    const spendMatch = expectedAdSpend > 0 ? Math.min(1, Math.max(0.25, actualAdSpend / expectedAdSpend)) : 0.7;
    return Math.max(0.45, Math.min(0.9, 0.55 + spendMatch * 0.25));
  }
  if (normalized.includes("PRICE") || normalized.includes("OPTIMIZE")) return 0.72;
  if (normalized.includes("INVENTORY") || normalized.includes("RESTOCK")) return 0.66;
  if (normalized.includes("CHANNEL")) return 0.68;
  if (normalized.includes("REDUCE")) return 0.75;
  return 0.6;
}

function attributionConfidence(expectedProfit: number, actualProfit: number, actionWeight: number) {
  const scale = Math.max(1, Math.abs(expectedProfit), Math.abs(actualProfit));
  const volatilityPenalty = Math.min(0.3, Math.abs(actualProfit - expectedProfit) / scale);
  return roundRatio(Math.max(0.25, Math.min(0.92, actionWeight - volatilityPenalty * 0.4)));
}

function outcomeStatusForAttribution(attribution: DecisionAttributionSnapshot): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (attribution.attributed_profit_change > 0.01) return "POSITIVE";
  if (attribution.attributed_profit_change < -0.01) return "NEGATIVE";
  return "NEUTRAL";
}

function learningFeedbackForOutcome(outcomeStatus: "POSITIVE" | "NEGATIVE" | "NEUTRAL", errorRate: number, confidenceAdjustment: number) {
  if (outcomeStatus === "NEGATIVE") {
    return `Negative impact; reduce confidence for similar actions. Prediction error ${Math.round(errorRate * 100)}%; confidence adjustment ${Math.round(confidenceAdjustment * 100)}%.`;
  }
  if (errorRate <= 0.2) {
    return `Positive impact; prediction was directionally accurate. Prediction error ${Math.round(errorRate * 100)}%; confidence adjustment ${Math.round(confidenceAdjustment * 100)}%.`;
  }
  return `Positive impact, but model over/underestimated the action. Prediction error ${Math.round(errorRate * 100)}%; confidence adjustment ${Math.round(confidenceAdjustment * 100)}%.`;
}

function metricDelta(actual?: number, baseline?: number) {
  return roundMoney((actual ?? 0) - (baseline ?? 0));
}

function alternativeActionsFromPayload(payload: Record<string, unknown>) {
  const scenarios = payload.scenarios ?? payload.alternative_actions ?? payload.alternativeActions;
  return Array.isArray(scenarios) ? scenarios : [];
}

function expectedCostChange(baseline: ActionMetricsSnapshot, predicted: ActionMetricsSnapshot) {
  const revenueDelta = (predicted.revenue ?? 0) - (baseline.revenue ?? 0);
  const profitDelta = (predicted.profit ?? 0) - (baseline.profit ?? 0);
  return roundMoney(revenueDelta - profitDelta);
}

function dbActionType(actionType: string) {
  const normalized = actionType.toUpperCase();
  return normalized === "SCALE" || normalized === "REDUCE" || normalized === "OPTIMIZE" || normalized === "MONITOR"
    ? normalized
    : "MONITOR";
}

function dbStatusFromTrackingStatus(status: ActionTrackingStatus) {
  switch (status) {
    case "pending":
      return "PENDING_APPROVAL";
    case "accepted":
      return "ACCEPTED";
    case "running":
      return "EXECUTING";
    case "completed":
      return "COMPLETED";
    case "learned":
      return "LEARNED";
    case "rejected":
      return "REJECTED";
    default:
      return undefined;
  }
}

function trackingStatusFromDbStatus(status: string): ActionTrackingStatus {
  switch (status) {
    case "PENDING_APPROVAL":
    case "RECOMMENDED":
      return "pending";
    case "ACCEPTED":
      return "accepted";
    case "EXECUTING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "EVALUATED":
    case "LEARNED":
      return "learned";
    case "REJECTED":
      return "rejected";
    default:
      return "pending";
  }
}

async function listJsonActionTrackingRecords(filter: { workspaceId?: string; status?: ActionTrackingStatus | null } = {}) {
  const records = await readJsonRecords();
  return records
    .filter((record) => !filter.workspaceId || record.workspace_id === filter.workspaceId)
    .filter((record) => !filter.status || record.status === filter.status)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

async function acceptJsonActionTrackingRecord(input: AcceptActionInput) {
  const records = await readJsonRecords();
  const now = new Date().toISOString();
  const existing = records.find((record) =>
    record.workspace_id === input.workspace_id &&
    record.sku === input.sku &&
    record.action_type === input.action_type &&
    record.status !== "rejected"
  );

  if (existing) {
    existing.status = existing.status === "pending" ? "accepted" : existing.status;
    existing.accepted_at = existing.accepted_at ?? now;
    existing.updated_at = now;
    await writeJsonRecords(records);
    return existing;
  }

  const record: ActionTrackingRecord = {
    action_id: randomUUID(),
    workspace_id: input.workspace_id,
    sku: input.sku,
    lifecycle_stage: input.lifecycle_stage,
    action_type: input.action_type,
    action_payload: input.action_payload ?? {},
    accepted_by: input.accepted_by ?? null,
    accepted_at: now,
    status: "accepted",
    observation_window_days: input.observation_window_days ?? 7,
    baseline_metrics: input.baseline_metrics ?? {},
    predicted_metrics: input.predicted_metrics ?? {},
    actual_metrics: {},
    evaluation_result: null,
    confidence_score: input.confidence_score ?? 0,
    learning_feedback: null,
    created_at: now,
    updated_at: now
  };

  records.unshift(record);
  await writeJsonRecords(records);
  return record;
}

async function rejectJsonActionTrackingRecord(input: RejectActionInput) {
  const records = await readJsonRecords();
  const now = new Date().toISOString();
  const record = input.action_id
    ? records.find((item) => item.action_id === input.action_id)
    : records.find((item) =>
      item.workspace_id === input.workspace_id &&
      (!input.sku || item.sku === input.sku) &&
      (!input.action_type || item.action_type === input.action_type)
    );

  if (!record) return null;

  record.status = "rejected";
  record.rejected_at = now;
  record.updated_at = now;
  await writeJsonRecords(records);
  return record;
}

async function updateJsonActionTrackingRecords(workspaceId?: string) {
  const records = await readJsonRecords();
  const now = new Date();

  for (const record of records) {
    if (workspaceId && record.workspace_id !== workspaceId) continue;
    if (record.status !== "accepted" && record.status !== "running") continue;

    const predictedLift = predictedProfitLift(record);
    const baselineProfit = record.baseline_metrics.profit ?? 0;
    const elapsedRatio = progressRatio(record, now);
    const realizedLift = predictedLift * (0.28 + elapsedRatio * 0.52);

    record.status = elapsedRatio >= 1 ? "completed" : "running";
	    record.actual_metrics = {
	      ...record.actual_metrics,
	      profit: roundMoney(baselineProfit + realizedLift),
      revenue: maybeAdd(record.baseline_metrics.revenue, predictedLift * 1.45 * elapsedRatio),
      ad_spend: record.predicted_metrics.ad_spend ?? record.baseline_metrics.ad_spend,
      roas: record.predicted_metrics.roas ?? record.baseline_metrics.roas,
      sold_units: record.predicted_metrics.sold_units ?? record.baseline_metrics.sold_units,
	      stock: record.predicted_metrics.stock ?? record.baseline_metrics.stock
	    };
	    record.attribution = calculateDecisionAttribution(record);
	    record.updated_at = now.toISOString();
  }

  await writeJsonRecords(records);
  return listJsonActionTrackingRecords({ workspaceId });
}

async function completeJsonActionTrackingRecord(input: { workspaceId?: string; actionId: string; actual_metrics?: ActionMetricsSnapshot }) {
  const records = await readJsonRecords();
  const now = new Date().toISOString();
  const record = records.find((item) =>
    item.action_id === input.actionId &&
    (!input.workspaceId || item.workspace_id === input.workspaceId)
  );

  if (!record) return null;

  record.status = "completed";
  record.actual_metrics = {
    ...record.actual_metrics,
    ...input.actual_metrics
  };
	  if (record.actual_metrics.profit == null) {
	    const predictedLift = predictedProfitLift(record);
	    record.actual_metrics.profit = roundMoney((record.baseline_metrics.profit ?? 0) + predictedLift);
	  }
	  record.attribution = calculateDecisionAttribution(record);
	  record.updated_at = now;
  await writeJsonRecords(records);
  return record;
}

async function evaluateJsonActionTrackingRecord(input: { workspaceId?: string; actionId?: string }) {
  const records = await readJsonRecords();
  const now = new Date().toISOString();
  const targets = records.filter((record) =>
    (!input.workspaceId || record.workspace_id === input.workspaceId) &&
    (!input.actionId || record.action_id === input.actionId) &&
    (record.status === "completed" || record.status === "running")
  );

  for (const record of targets) {
	    const predictedLift = predictedProfitLift(record);
	    const attribution = calculateDecisionAttribution(record);
	    const attributedLift = attribution.attributed_profit_change;
	    const gap = roundMoney(attributedLift - predictedLift);
	    const errorRate = roundRatio(Math.abs(gap) / Math.max(1, Math.abs(predictedLift)));
	    const outcomeStatus = outcomeStatusForAttribution(attribution);
	    const resultLabel: ActionEvaluationResult["result_label"] = errorRate <= 0.2 ? "win" : errorRate <= 0.55 ? "neutral" : "miss";
	    const feedback = recordOptimizationFeedback({
      action: record.action_type,
      sku: record.sku,
      predicted_profit: predictedLift,
      predicted_revenue: record.predicted_metrics.revenue,
      confidence: record.confidence_score,
	      actual_profit: attributedLift,
	      actual_revenue: record.actual_metrics.revenue
	    });

	    record.attribution = attribution;
	    record.evaluation_result = {
	      predicted_vs_actual_gap: gap,
	      error_rate: errorRate,
	      result_label: resultLabel,
	      outcome_status: outcomeStatus,
	      attribution,
	      learning_feedback: learningFeedbackForOutcome(outcomeStatus, errorRate, feedback.confidence_adjustment),
	      evaluated_at: now
	    };
    record.learning_feedback = record.evaluation_result.learning_feedback;
    record.status = "learned";
    record.updated_at = now;
  }

  await writeJsonRecords(records);
  return targets;
}

async function readJsonRecords(): Promise<ActionTrackingRecord[]> {
  try {
    const text = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJsonRecords(records: ActionTrackingRecord[]) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(records, null, 2));
}

function predictedProfitLift(record: ActionTrackingRecord) {
  return roundMoney((record.predicted_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0));
}

function actualProfitLift(record: ActionTrackingRecord) {
  return roundMoney((record.actual_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0));
}

function progressRatio(record: ActionTrackingRecord, now: Date) {
  if (!record.accepted_at) return 0;
  const acceptedAt = Date.parse(record.accepted_at);
  if (!Number.isFinite(acceptedAt)) return 0;
  const windowMs = Math.max(1, record.observation_window_days) * 24 * 60 * 60 * 1000;
  return Math.min(1, Math.max(0.08, (now.getTime() - acceptedAt) / windowMs));
}

function maybeAdd(value: number | undefined, delta: number) {
  return value == null ? undefined : roundMoney(value + delta);
}

function metricsFromUnknown(value: unknown): ActionMetricsSnapshot {
  const record = safeRecord(value);
	  return {
	    revenue: numberFromUnknown(record.revenue),
	    profit: numberFromUnknown(record.profit),
	    orders: numberFromUnknown(record.orders),
	    roas: numberFromUnknown(record.roas),
    sold_units: numberFromUnknown(record.sold_units),
    stock: numberFromUnknown(record.stock),
    ad_spend: numberFromUnknown(record.ad_spend)
  };
}

function evaluationResultFromUnknown(value: unknown): ActionEvaluationResult | null {
  const record = safeRecord(value);
  const gap = numberFromUnknown(record.predicted_vs_actual_gap);
  const errorRate = numberFromUnknown(record.error_rate);
  const resultLabel = record.result_label === "win" || record.result_label === "neutral" || record.result_label === "miss"
    ? record.result_label
    : null;
	  const learningFeedback = asString(record.learning_feedback);
	  const evaluatedAt = asString(record.evaluated_at);
	  if (gap == null || errorRate == null || !resultLabel || !learningFeedback || !evaluatedAt) return null;
	  return {
	    predicted_vs_actual_gap: gap,
	    error_rate: errorRate,
	    result_label: resultLabel,
	    outcome_status: record.outcome_status === "POSITIVE" || record.outcome_status === "NEGATIVE" || record.outcome_status === "NEUTRAL" ? record.outcome_status : undefined,
	    attribution: attributionFromUnknown(record.attribution) ?? undefined,
	    learning_feedback: learningFeedback,
	    evaluated_at: evaluatedAt
	  };
	}

function attributionFromUnknown(value: unknown): DecisionAttributionSnapshot | null {
  const record = safeRecord(value);
  const attributedProfit = numberFromUnknown(record.attributed_profit_change);
  const organicProfit = numberFromUnknown(record.organic_profit_change);
  const attributedRevenue = numberFromUnknown(record.attributed_revenue_change);
  const organicRevenue = numberFromUnknown(record.organic_revenue_change);
  const attributedAdSpend = numberFromUnknown(record.attributed_ad_spend_change);
  const confidence = numberFromUnknown(record.confidence);
  if (
    attributedProfit == null ||
    organicProfit == null ||
    attributedRevenue == null ||
    organicRevenue == null ||
    attributedAdSpend == null ||
    confidence == null
  ) return null;

  return {
    attributed_profit_change: attributedProfit,
    organic_profit_change: organicProfit,
    attributed_revenue_change: attributedRevenue,
    organic_revenue_change: organicRevenue,
    attributed_ad_spend_change: attributedAdSpend,
    confidence,
    method: "baseline_expected_actual_split"
  };
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
