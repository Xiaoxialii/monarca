import { budgetConstrainedSelection, filterValidCandidates } from "@/lib/optimization/constraints";
import {
  buildOptimizationCandidates,
  calculateProfitObjective,
  defaultPolicyWeights,
  type CommerceState,
  type Decision,
  type OptimizationCandidate
} from "@/lib/optimization/objective";

export type OptimizationResult = {
  decisions: Decision[];
  selectedCandidates: OptimizationCandidate[];
  objectiveValue: number;
  budgetUsed: number;
};

export class ProfitOptimizer {
  solve(state: CommerceState): Decision[] {
    return this.optimize(state).decisions;
  }

  optimize(state: CommerceState): OptimizationResult {
    const weights = state.policyWeights ?? defaultPolicyWeights;
    const candidates = state.skus
      .flatMap((sku) => buildOptimizationCandidates(sku, weights))
      .sort((left, right) => right.objectiveScore - left.objectiveScore || right.expectedProfitImpact - left.expectedProfitImpact);
    const validCandidates = filterValidCandidates(candidates, state);
    const selectedCandidates = budgetConstrainedSelection(validCandidates, state.constraints.budgetLimit);

    return {
      decisions: selectedCandidates.map(({ skuId, action, confidence, expectedProfitImpact }) => ({
        skuId,
        action,
        confidence,
        expectedProfitImpact
      })),
      selectedCandidates,
      objectiveValue: calculateProfitObjective(selectedCandidates),
      budgetUsed: selectedCandidates.reduce((sum, candidate) => sum + candidate.expectedAdSpend, 0)
    };
  }
}

export function runOptimization(state: CommerceState) {
  return new ProfitOptimizer().optimize(state);
}
