import { generateActions, type ExecutableAction } from "@/lib/policy/action-generator";
import { DecisionMaker } from "@/lib/policy/decision-maker";
import type { CommerceState, Decision } from "@/lib/optimization/objective";

export type PolicyRunResult = {
  decisions: Decision[];
  actions: ExecutableAction[];
  policyVersion: "policy_engine_v1";
};

export class PolicyEngine {
  constructor(private readonly decisionMaker = new DecisionMaker()) {}

  runPolicy(state: CommerceState): PolicyRunResult {
    const decisions = this.stabilizeDecisions(this.decisionMaker.run(state));

    return {
      decisions,
      actions: generateActions(decisions),
      policyVersion: "policy_engine_v1"
    };
  }

  private stabilizeDecisions(decisions: Decision[]): Decision[] {
    return decisions
      .filter((decision) => decision.confidence >= 0.35)
      .sort((left, right) => right.expectedProfitImpact - left.expectedProfitImpact || left.skuId.localeCompare(right.skuId));
  }
}

export function runPolicy(state: CommerceState): Decision[] {
  return new PolicyEngine().runPolicy(state).decisions;
}
