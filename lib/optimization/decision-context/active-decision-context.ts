import type {
  ActiveDecisionActionContext,
  ActiveDecisionContext,
  ExistingActionEvaluation
} from "@/lib/optimization/decision-context/decision-context-types";

export function evaluateExistingAction(action: Pick<ActiveDecisionActionContext, "status" | "expectedProfitImpact" | "actualProfitImpact" | "daysSinceAccepted">): ExistingActionEvaluation {
  if (action.status === "COMPLETED" || action.status === "EVALUATED") return "COMPLETE";
  if (action.daysSinceAccepted != null && action.daysSinceAccepted < 7) return "MONITOR";
  if (action.actualProfitImpact == null) return "MONITOR";
  if (action.actualProfitImpact < 0) return "REPLACE";
  if (action.expectedProfitImpact != null && action.expectedProfitImpact > 0 && action.actualProfitImpact >= action.expectedProfitImpact * 0.8) {
    return "CONTINUE";
  }
  return action.actualProfitImpact > 0 ? "CONTINUE" : "MONITOR";
}

export function activeDecisionContextForSku(
  contexts: Map<string, ActiveDecisionContext> | undefined,
  skuId: string
) {
  const context = contexts?.get(skuId);
  if (!context?.activeActions.length) return null;

  const currentAction = context.activeActions[0];
  return {
    skuId: context.skuId,
    current_action: currentAction.actionType,
    previous_status: currentAction.status,
    previous_expected_profit: currentAction.expectedProfitImpact,
    previous_actual_profit: currentAction.actualProfitImpact,
    accepted_at: currentAction.acceptedAt,
    days_since_accepted: currentAction.daysSinceAccepted,
    optimization_run_id: currentAction.optimizationRunId,
    decision_instance_key: currentAction.decisionInstanceKey,
    evaluation: currentAction.evaluation,
    active_actions: context.activeActions
  };
}
