import type { PrismaClient } from "@prisma/client";
import { evaluateExistingAction } from "@/lib/optimization/decision-context/active-decision-context";
import type {
  ActiveDecisionActionContext,
  ActiveDecisionContext,
  ActiveDecisionStatus
} from "@/lib/optimization/decision-context/decision-context-types";

type PersistedDecisionActionContextRow = {
  id: string;
  skuId: string;
  actionType: string;
  recommendedAction: string | null;
  status: string;
  expectedImpact: number | null;
  actualImpact: number | null;
  acceptedAt: Date | null;
  actionPayload: unknown;
  updatedAt: Date;
};

const ACTIVE_DECISION_STATUSES = ["ACCEPTED", "EXECUTING", "COMPLETED", "EVALUATED", "LEARNED"] as const;

export async function loadActiveDecisionContexts(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    statuses?: readonly string[];
    now?: Date;
  }
): Promise<Map<string, ActiveDecisionContext>> {
  const decisionAction = (prisma as unknown as {
    decisionAction?: {
      findMany: (args: Record<string, unknown>) => Promise<PersistedDecisionActionContextRow[]>;
    };
  }).decisionAction;
  if (!decisionAction) return new Map();

  const rows = await decisionAction.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: { in: input.statuses?.length ? input.statuses : ACTIVE_DECISION_STATUSES }
    },
    select: {
      id: true,
      skuId: true,
      actionType: true,
      recommendedAction: true,
      status: true,
      expectedImpact: true,
      actualImpact: true,
      acceptedAt: true,
      actionPayload: true,
      updatedAt: true
    },
    orderBy: { updatedAt: "desc" },
    take: 5000
  });

  const now = input.now ?? new Date();
  const contexts = new Map<string, ActiveDecisionContext>();

  for (const row of rows) {
    const skuId = String(row.skuId ?? "").trim();
    if (!skuId) continue;
    const payload = asRecord(row.actionPayload);
    const tracking = asRecord(payload.tracking);
    const acceptedAt = row.acceptedAt ? row.acceptedAt.toISOString() : null;
    const action: Omit<ActiveDecisionActionContext, "evaluation"> = {
      actionId: row.id,
      actionType: String(tracking.action_type_original ?? payload.action ?? row.recommendedAction ?? row.actionType),
      status: activeDecisionStatus(row.status),
      acceptedAt,
      optimizationRunId: stringOrNull(payload.optimization_run_id) ?? optimizationRunIdFromInstanceKey(payload.decision_instance_key),
      decisionInstanceKey: stringOrNull(payload.decision_instance_key),
      expectedProfitImpact: numberOrNull(row.expectedImpact),
      actualProfitImpact: numberOrNull(row.actualImpact),
      daysSinceAccepted: acceptedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(acceptedAt)) / 86_400_000)) : null
    };
    const activeAction = {
      ...action,
      evaluation: evaluateExistingAction(action)
    };
    const context = contexts.get(skuId) ?? { skuId, activeActions: [] };
    context.activeActions.push(activeAction);
    contexts.set(skuId, context);
  }

  return contexts;
}

function activeDecisionStatus(status: string): ActiveDecisionStatus {
  if (status === "EXECUTING") return "EXECUTING";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "EVALUATED" || status === "LEARNED") return "EVALUATED";
  return "ACCEPTED";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optimizationRunIdFromInstanceKey(value: unknown) {
  const key = stringOrNull(value);
  if (!key) return null;
  return key.split(":")[0] || null;
}
