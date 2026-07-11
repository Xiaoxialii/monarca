import { defaultPolicyWeights, roundRatio, type PolicyWeights } from "@/lib/optimization/objective";
import type { EvolutionEngineResult, ObjectiveFunctionUpdate } from "@/lib/evolution/types";

export function updateObjectiveFunction(input: {
  previousWeights?: PolicyWeights;
  evolution: EvolutionEngineResult;
  allowMutation: boolean;
}): ObjectiveFunctionUpdate {
  const previousWeights = input.previousWeights ?? defaultPolicyWeights;
  const avgConfidence = input.evolution.confidence_updates.length
    ? input.evolution.confidence_updates.reduce((sum, row) => sum + row.next_confidence, 0) / input.evolution.confidence_updates.length
    : 0.5;
  const hasNegativeFeedback = input.evolution.strategy_changes.some((change) =>
    change.change === "decrease" || change.change === "deprecate"
  );
  const hasPositiveFeedback = input.evolution.strategy_changes.some((change) => change.change === "increase");
  const nextWeights = input.allowMutation
    ? mutateWeights(previousWeights, { avgConfidence, hasNegativeFeedback, hasPositiveFeedback })
    : previousWeights;

  return {
    previous_objective: "maximize total_profit = sku_profit - ads_cost - inventory_cost - pricing_loss + efficiency_gain",
    next_objective: input.allowMutation
      ? "maximize long_term_profit + stability_score - volatility_risk, bounded by profit safety constraints"
      : "suggest long_term_profit + stability_score - volatility_risk without applying active objective mutation",
    previous_weights: previousWeights,
    next_weights: nextWeights,
    update_reason: input.allowMutation
      ? "Outcome feedback was available, so the objective was shifted toward long-term profit and stability while preserving profit safety."
      : "No durable objective mutation was applied because the run is in suggest mode or lacks enough feedback.",
    safety_constraints: [
      "profit_safety_constraint",
      "feedback_required",
      "rollback_required",
      "explainability_required",
      "anti_overfit_guardrail"
    ],
    rollback_token: "objective:function:v_next:rollback"
  };
}

function mutateWeights(
  previous: PolicyWeights,
  signal: {
    avgConfidence: number;
    hasNegativeFeedback: boolean;
    hasPositiveFeedback: boolean;
  }
) {
  const stabilityLift = signal.hasNegativeFeedback ? 1.12 : signal.hasPositiveFeedback ? 1.04 : 1.08;
  const profitLift = signal.hasPositiveFeedback ? 1.06 : signal.hasNegativeFeedback ? 0.98 : 1;
  const roasLift = signal.avgConfidence >= 0.75 ? 1.04 : 0.99;

  return {
    profit: roundRatio(previous.profit * profitLift),
    roas: roundRatio(previous.roas * roasLift),
    inventory: roundRatio(previous.inventory * (signal.hasNegativeFeedback ? 1.04 : 1)),
    cac: roundRatio(previous.cac * (signal.hasNegativeFeedback ? 1.05 : 1)),
    stability: roundRatio(previous.stability * stabilityLift)
  };
}
