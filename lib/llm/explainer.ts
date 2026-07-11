import type { Decision } from "@/lib/optimization/objective";

export type DecisionExplanation = {
  skuId: string;
  action: Decision["action"];
  explanation: string;
};

export function explainDecision(decision: Decision): DecisionExplanation {
  return {
    skuId: decision.skuId,
    action: decision.action,
    explanation: `SKU ${decision.skuId} is marked ${decision.action} because the optimization engine estimated a profit impact of ${decision.expectedProfitImpact.toFixed(2)} with ${(decision.confidence * 100).toFixed(0)}% confidence.`
  };
}

export function explainDecisions(decisions: Decision[]) {
  return decisions.map(explainDecision);
}
