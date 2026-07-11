import { trackOutcome } from "@/lib/feedback/outcome-tracker";
import { updatePolicyWeights } from "@/lib/feedback/policy-update";
import { runOptimizationLayerV2 } from "@/lib/optimization/optimization-layer-v2";
import { runOptimization } from "@/lib/optimization/solver";
import { runPolicy } from "@/lib/policy/policy-engine";
import { runEvolutionEngine } from "@/lib/evolution/evolution-engine";
import { updateObjectiveFunction } from "@/lib/evolution/objective-function-updater";
import { generatePoliciesFromFeedback } from "@/lib/evolution/policy-generator";
import { generateStrategyMutations } from "@/lib/evolution/strategy-mutation-system";
import { roundRatio } from "@/lib/optimization/objective";
import type { SelfEvolvingCommerceInput, SelfEvolvingCommerceResult } from "@/lib/evolution/types";

export function runSelfEvolvingCommerceOS(input: SelfEvolvingCommerceInput): SelfEvolvingCommerceResult {
  const mode = input.mode ?? "suggest";
  const bestActions = runPolicy(input.state);
  const optimizationReport = runOptimizationLayerV2(input.state);
  const optimization = runOptimization(input.state);
  const outcomes = bestActions
    .filter((decision) => input.actualOutcomes?.[decision.skuId] != null)
    .map((decision) => trackOutcome(decision, Number(input.actualOutcomes?.[decision.skuId])));
  const policyUpdate = updatePolicyWeights(outcomes, input.currentPolicyWeights ?? input.state.policyWeights);
  const evolution = runEvolutionEngine({
    state: input.state,
    outcomes,
    policyUpdate
  });
  const allowMutation = mode === "evolution" && outcomes.length > 0;
  const objectiveUpdate = updateObjectiveFunction({
    previousWeights: input.currentPolicyWeights ?? input.state.policyWeights,
    evolution,
    allowMutation
  });
  const policyUpdates = generatePoliciesFromFeedback({
    state: input.state,
    evolution,
    allowMutation
  });
  const strategyMutations = generateStrategyMutations({
    state: input.state,
    optimizationReport,
    evolution
  });
  const executedActions = bestActions.map((action) => ({
    ...action,
    execution_mode: allowMutation ? "evolution_applied" as const : "suggested" as const
  }));

  return {
    version: "self_evolving_commerce_os_v1",
    mode,
    best_actions: bestActions,
    executed_actions: executedActions,
    policy_updates: allowMutation ? policyUpdates : policyUpdates.map((policy) => ({
      ...policy,
      rule: `SUGGESTED ONLY: ${policy.rule}`
    })),
    objective_function_update: objectiveUpdate,
    strategy_mutations: strategyMutations,
    evolution_log: [
      {
        event: "performance_observed",
        detail: outcomes.length
          ? `${outcomes.length} outcomes were compared against predicted profit impact.`
          : "No outcomes were provided, so mutation is blocked by feedback_required.",
        reversible: true
      },
      {
        event: "strategy_effectiveness_evaluated",
        detail: evolution.learning_summary,
        reversible: true
      },
      {
        event: allowMutation ? "policy_mutation_applied" : "policy_mutation_suggested",
        detail: allowMutation
          ? `${policyUpdates.length} policy updates are eligible for activation in v_next.`
          : `${policyUpdates.length} policy updates were generated as suggestions only.`,
        reversible: true
      },
      {
        event: allowMutation ? "objective_function_updated" : "objective_function_update_blocked",
        detail: objectiveUpdate.update_reason,
        reversible: true
      },
      {
        event: "optimization_re_run",
        detail: `Re-ran optimization with ${optimization.selectedCandidates.length} selected candidates and ${strategyMutations.length} strategy mutations.`,
        reversible: true
      }
    ],
    feedback: {
      outcomes,
      policy_update: policyUpdate
    },
    optimization_report: optimizationReport,
    confidence: confidenceScore({
      outcomeCount: outcomes.length,
      policyUpdateCount: policyUpdates.length,
      mutationCount: strategyMutations.length,
      mode
    }),
    system_version: "v_next",
    safety_constraints: evolution.safety_constraints
  };
}

function confidenceScore(input: {
  outcomeCount: number;
  policyUpdateCount: number;
  mutationCount: number;
  mode: "suggest" | "evolution";
}) {
  const feedbackBoost = Math.min(0.2, input.outcomeCount * 0.04);
  const mutationCoverage = Math.min(0.12, (input.policyUpdateCount + input.mutationCount) * 0.01);
  const modePenalty = input.mode === "evolution" && input.outcomeCount === 0 ? 0.2 : 0;
  return roundRatio(Math.max(0.35, Math.min(0.93, 0.62 + feedbackBoost + mutationCoverage - modePenalty)));
}
