export type ActiveDecisionStatus =
  | "ACCEPTED"
  | "EXECUTING"
  | "COMPLETED"
  | "EVALUATED"
  | "SUPERSEDED";

export type ExistingActionEvaluation =
  | "CONTINUE"
  | "MONITOR"
  | "REPLACE"
  | "COMPLETE";

export type ActiveDecisionActionContext = {
  actionId: string;
  recommendationId: string | null;
  actionType: string;
  status: ActiveDecisionStatus;
  acceptedAt: string | null;
  optimizationRunId: string | null;
  decisionInstanceKey: string | null;
  expectedProfitImpact: number | null;
  actualProfitImpact: number | null;
  adBudgetChange: number | null;
  daysSinceAccepted: number | null;
  evaluation: ExistingActionEvaluation;
};

export type ActiveDecisionContext = {
  skuId: string;
  activeActions: ActiveDecisionActionContext[];
};
