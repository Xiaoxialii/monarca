import type { Decision } from "@/lib/optimization/objective";

export type DecisionOutcome = {
  decisionId: string;
  skuId: string;
  action: Decision["action"];
  predictedProfitImpact: number;
  actualProfitImpact: number;
  observedAt: string;
};

export function trackOutcome(decision: Decision, actualProfitImpact: number, observedAt = new Date().toISOString()): DecisionOutcome {
  return {
    decisionId: `outcome-${decision.skuId.toLowerCase()}-${decision.action.toLowerCase()}`,
    skuId: decision.skuId,
    action: decision.action,
    predictedProfitImpact: decision.expectedProfitImpact,
    actualProfitImpact,
    observedAt
  };
}
