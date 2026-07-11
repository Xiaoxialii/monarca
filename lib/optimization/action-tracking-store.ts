import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { recordOptimizationFeedback } from "@/lib/optimization/feedback-learning-engine";
import type {
  ActionEvaluationResult,
  ActionMetricsSnapshot,
  ActionTrackingRecord,
  ActionTrackingStatus
} from "@/lib/optimization/action-tracking-types";

const STORE_PATH = join(process.cwd(), ".monarca-artifacts", "action-feedback", "actions.json");

type AcceptActionInput = {
  workspace_id: string;
  sku: string;
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
  sku?: string;
  action_type?: string;
};

export async function listActionTrackingRecords(filter: { workspaceId?: string; status?: ActionTrackingStatus | null } = {}) {
  const records = await readRecords();
  return records
    .filter((record) => !filter.workspaceId || record.workspace_id === filter.workspaceId)
    .filter((record) => !filter.status || record.status === filter.status)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export async function getActionTrackingRecord(actionId: string) {
  const records = await readRecords();
  return records.find((record) => record.action_id === actionId) ?? null;
}

export async function acceptActionTrackingRecord(input: AcceptActionInput) {
  const records = await readRecords();
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
    await writeRecords(records);
    return existing;
  }

  const record: ActionTrackingRecord = {
    action_id: randomUUID(),
    workspace_id: input.workspace_id,
    sku: input.sku,
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
  await writeRecords(records);
  return record;
}

export async function rejectActionTrackingRecord(input: RejectActionInput) {
  const records = await readRecords();
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
  await writeRecords(records);
  return record;
}

export async function updateActionTrackingRecords(workspaceId?: string) {
  const records = await readRecords();
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
    record.updated_at = now.toISOString();
  }

  await writeRecords(records);
  return listActionTrackingRecords({ workspaceId });
}

export async function evaluateActionTrackingRecord(input: { workspaceId?: string; actionId?: string }) {
  const records = await readRecords();
  const now = new Date().toISOString();
  const targets = records.filter((record) =>
    (!input.workspaceId || record.workspace_id === input.workspaceId) &&
    (!input.actionId || record.action_id === input.actionId) &&
    (record.status === "completed" || record.status === "running")
  );

  for (const record of targets) {
    const predictedLift = predictedProfitLift(record);
    const actualLift = actualProfitLift(record);
    const gap = roundMoney(actualLift - predictedLift);
    const errorRate = roundRatio(Math.abs(gap) / Math.max(1, Math.abs(predictedLift)));
    const resultLabel: ActionEvaluationResult["result_label"] = errorRate <= 0.2 ? "win" : errorRate <= 0.55 ? "neutral" : "miss";
    const feedback = recordOptimizationFeedback({
      action: record.action_type,
      sku: record.sku,
      predicted_profit: predictedLift,
      predicted_revenue: record.predicted_metrics.revenue,
      confidence: record.confidence_score,
      actual_profit: actualLift,
      actual_revenue: record.actual_metrics.revenue
    });

    record.evaluation_result = {
      predicted_vs_actual_gap: gap,
      error_rate: errorRate,
      result_label: resultLabel,
      learning_feedback: `Prediction error ${Math.round(errorRate * 100)}%; confidence adjustment ${Math.round(feedback.confidence_adjustment * 100)}%.`,
      evaluated_at: now
    };
    record.learning_feedback = record.evaluation_result.learning_feedback;
    record.status = "learned";
    record.updated_at = now;
  }

  await writeRecords(records);
  return targets;
}

async function readRecords(): Promise<ActionTrackingRecord[]> {
  try {
    const text = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRecords(records: ActionTrackingRecord[]) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(records, null, 2));
}

function predictedProfitLift(record: ActionTrackingRecord) {
  return Math.max(0, (record.predicted_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0));
}

function actualProfitLift(record: ActionTrackingRecord) {
  return Math.max(0, (record.actual_metrics.profit ?? 0) - (record.baseline_metrics.profit ?? 0));
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
