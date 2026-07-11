import type { Decision } from "@/lib/optimization/objective";

export type ExecutableAction = {
  actionId: string;
  skuId: string;
  action: Decision["action"];
  status: "pending_review";
  confidence: number;
  expectedProfitImpact: number;
};

export function generateActions(decisions: Decision[]): ExecutableAction[] {
  return decisions.map((decision) => ({
    actionId: `policy-${decision.skuId.toLowerCase()}-${decision.action.toLowerCase()}`,
    skuId: decision.skuId,
    action: decision.action,
    status: "pending_review",
    confidence: decision.confidence,
    expectedProfitImpact: decision.expectedProfitImpact
  }));
}
