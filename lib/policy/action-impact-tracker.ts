import type { ActionTrackingRecord, ActionTrackingStatus } from "@/lib/optimization/action-tracking-types";

export type DecisionImpactSummary = {
  totalDecisionsGenerated: number;
  acceptedDecisions: number;
  completedActions: number;
  estimatedProfitImpact: number;
  realizedProfitImpact: number;
  predictionAccuracy: number | null;
};

export type DecisionImpactRow = {
  id: string;
  sku: string;
  actionType: string;
  sourceAction: string | null;
  recommendedAction: string;
  decisionDrivers: string[];
  expectedImpact: number;
  actualImpact: number | null;
  status: ActionTrackingStatus;
  executionStatus: "NOT_STARTED" | "EXECUTING" | "COMPLETED";
  measurementStatus: "NOT_STARTED" | "TRACKING" | "COMPLETED";
  observationDays: number;
  observationWindow: number;
  evaluationStatus: "PENDING" | "EVALUATED";
  confidence: number;
  estimatedCompletion: string | null;
  lifecycle: {
    recommended: string;
    accepted: string | null;
    executing: string | null;
    completed: string | null;
    evaluated: string | null;
  };
  learning: string | null;
};

export type DecisionLearningSummary = {
  bestPerformingActions: Array<{ action: string; averageProfitLift: number; count: number }>;
  mostReliableSignals: string[];
};

export type DecisionImpactPayload = {
  summary: DecisionImpactSummary;
  activeDecisions: DecisionImpactRow[];
  completedActions: DecisionImpactRow[];
  outcomeAnalysis: Array<{
    id: string;
    sku: string;
    decision: string;
    predictedProfit: number;
    realizedProfit: number;
    impactRatio: number | null;
    learning: string;
  }>;
  learningInsights: DecisionLearningSummary;
};

export function buildDecisionImpactPayload(records: ActionTrackingRecord[]): DecisionImpactPayload {
  const rows = records.map(decisionRowFromRecord);
  const completed = rows.filter((row) => row.status === "completed" || row.status === "learned");
  const estimatedProfitImpact = rows.reduce((sum, row) => sum + row.expectedImpact, 0);
  const realizedProfitImpact = completed.reduce((sum, row) => sum + (row.actualImpact ?? 0), 0);
  const acceptedDecisions = rows.filter((row) => row.status !== "pending" && row.status !== "rejected").length;
  const accuracyRows = completed.filter((row) => row.expectedImpact > 0 && row.actualImpact !== null);
  const predictionAccuracy = accuracyRows.length
    ? Math.round(
      accuracyRows.reduce((sum, row) => {
        const ratio = Math.min(row.actualImpact ?? 0, row.expectedImpact) / Math.max(1, row.expectedImpact);
        return sum + ratio;
      }, 0) / accuracyRows.length * 100
    )
    : null;

  return {
    summary: {
      totalDecisionsGenerated: rows.length,
      acceptedDecisions,
      completedActions: completed.length,
      estimatedProfitImpact,
      realizedProfitImpact,
      predictionAccuracy
    },
    activeDecisions: rows.filter((row) => row.status !== "completed" && row.status !== "learned" && row.status !== "rejected"),
    completedActions: completed,
    outcomeAnalysis: completed.map((row) => ({
      id: row.id,
      sku: row.sku,
      decision: row.recommendedAction,
      predictedProfit: row.expectedImpact,
      realizedProfit: row.actualImpact ?? 0,
      impactRatio: row.expectedImpact > 0 && row.actualImpact !== null ? Math.round((row.actualImpact / row.expectedImpact) * 100) : null,
      learning: row.learning ?? "Outcome recorded for future policy improvement."
    })),
    learningInsights: buildLearningSummary(completed)
  };
}

function decisionRowFromRecord(record: ActionTrackingRecord): DecisionImpactRow {
  const expectedImpact = expectedProfitLift(record);
  const actualImpact = hasActualOutcome(record) ? actualProfitLift(record) : null;
  const observationWindow = Math.max(1, record.observation_window_days || 30);
  const observationDays = observationDaysFromRecord(record, observationWindow);
  const isEvaluated = Boolean(record.evaluation_result);
  const isMeasuring = record.status === "running" || record.status === "completed" || record.status === "learned";
  return {
    id: record.action_id,
    sku: record.sku,
    actionType: record.action_type,
    sourceAction: asString(record.action_payload.action) ?? asString(record.action_payload.sourceAction),
    recommendedAction: actionLabel(record),
    decisionDrivers: decisionDrivers(record),
    expectedImpact,
    actualImpact,
    status: record.status,
    executionStatus: executionStatusFromRecord(record),
    measurementStatus: isEvaluated ? "COMPLETED" : isMeasuring ? "TRACKING" : "NOT_STARTED",
    observationDays,
    observationWindow,
    evaluationStatus: isEvaluated ? "EVALUATED" : "PENDING",
    confidence: Math.round((record.confidence_score || 0) * 100),
    estimatedCompletion: estimatedCompletionDate(record),
    lifecycle: {
      recommended: record.created_at,
      accepted: record.accepted_at,
      executing: record.status === "running" || record.status === "completed" || record.status === "learned" ? record.updated_at : null,
      completed: record.status === "completed" || record.status === "learned" ? record.updated_at : null,
      evaluated: record.evaluation_result?.evaluated_at ?? null
    },
    learning: record.learning_feedback ?? record.evaluation_result?.learning_feedback ?? null
  };
}

function estimatedCompletionDate(record: ActionTrackingRecord) {
  if (!record.accepted_at) return null;
  const acceptedAt = new Date(record.accepted_at);
  if (Number.isNaN(acceptedAt.getTime())) return null;
  acceptedAt.setDate(acceptedAt.getDate() + Math.max(1, record.observation_window_days || 7));
  return acceptedAt.toISOString();
}

function observationDaysFromRecord(record: ActionTrackingRecord, observationWindow: number) {
  if (record.status !== "running" && record.status !== "completed" && record.status !== "learned") return 0;
  const measurementStartedAt = record.status === "running"
    ? record.updated_at
    : record.accepted_at;
  if (!measurementStartedAt) return 0;
  const startedAt = new Date(measurementStartedAt);
  if (Number.isNaN(startedAt.getTime())) return 0;
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(observationWindow, elapsed));
}

function executionStatusFromRecord(record: ActionTrackingRecord): DecisionImpactRow["executionStatus"] {
  if (!record.accepted_at || record.status === "pending") return "NOT_STARTED";
  if (record.status === "running") return "EXECUTING";
  if (record.status === "completed" || record.status === "learned") return "COMPLETED";
  return "NOT_STARTED";
}

function buildLearningSummary(rows: DecisionImpactRow[]): DecisionLearningSummary {
  const byAction = new Map<string, { total: number; count: number }>();
  const signalCounts = new Map<string, number>();

  for (const row of rows) {
    const current = byAction.get(row.recommendedAction) ?? { total: 0, count: 0 };
    current.total += row.actualImpact ?? 0;
    current.count += 1;
    byAction.set(row.recommendedAction, current);
    for (const driver of row.decisionDrivers) {
      signalCounts.set(driver, (signalCounts.get(driver) ?? 0) + 1);
    }
  }

  return {
    bestPerformingActions: Array.from(byAction.entries())
      .map(([action, value]) => ({ action, averageProfitLift: value.count ? value.total / value.count : 0, count: value.count }))
      .sort((a, b) => b.averageProfitLift - a.averageProfitLift)
      .slice(0, 4),
    mostReliableSignals: Array.from(signalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([signal]) => signal)
      .slice(0, 5)
  };
}

function actionLabel(record: ActionTrackingRecord) {
  const payloadAction = asString(record.action_payload.display_action) ||
    asString(record.action_payload.displayAction) ||
    asString(record.action_payload.normalized_action_title) ||
    asString(record.action_payload.action) ||
    asString(record.action_payload.sourceAction);
  if (payloadAction) return sentenceCase(payloadAction);
  return sentenceCase(record.action_type);
}

function decisionDrivers(record: ActionTrackingRecord) {
  const payloadDrivers = record.action_payload.decision_drivers ?? record.action_payload.decisionDrivers;
  if (Array.isArray(payloadDrivers)) {
    return payloadDrivers.map((driver) => {
      if (typeof driver === "string") return driver;
      if (driver && typeof driver === "object") {
        const item = driver as Record<string, unknown>;
        return asString(item.label) || asString(item.metric) || asString(item.reason) || asString(item.signal);
      }
      return null;
    }).filter((driver): driver is string => Boolean(driver)).slice(0, 4);
  }

  const fallback = [
    record.lifecycle_stage ? `${sentenceCase(record.lifecycle_stage)} lifecycle` : null,
    record.predicted_metrics.profit != null ? "Profit lift forecast" : null,
    record.predicted_metrics.ad_spend != null ? "Budget simulation" : null,
    record.confidence_score ? "Confidence score" : null
  ].filter((driver): driver is string => Boolean(driver));
  return fallback.length ? fallback : ["Policy recommendation"];
}

function expectedProfitLift(record: ActionTrackingRecord) {
  if (record.predicted_metrics.profit_delta != null) {
    return roundMoney(Math.max(0, record.predicted_metrics.profit_delta));
  }
  return roundMoney(Math.max(0, (record.predicted_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0)));
}

function actualProfitLift(record: ActionTrackingRecord) {
  return roundMoney((record.actual_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0));
}

function hasActualOutcome(record: ActionTrackingRecord) {
  return record.actual_metrics.profit != null || record.actual_metrics.revenue != null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sentenceCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
