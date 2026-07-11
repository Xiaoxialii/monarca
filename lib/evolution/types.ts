import type { CommerceState, Decision, PolicyWeights } from "@/lib/optimization/objective";
import type { PolicyUpdateResult } from "@/lib/feedback/policy-update";
import type { DecisionOutcome } from "@/lib/feedback/outcome-tracker";
import type { OptimizationLayerV2Report } from "@/lib/optimization/optimization-layer-v2";

export type EvolutionExecutionMode = "suggest" | "evolution";

export type EvolutionSafetyConstraint =
  | "profit_safety_constraint"
  | "feedback_required"
  | "rollback_required"
  | "explainability_required"
  | "anti_overfit_guardrail";

export type StrategyChange = {
  strategy: string;
  change: "increase" | "decrease" | "hold" | "deprecate";
  reason: string;
  evidence: string[];
  confidence: number;
  rollback_token: string;
};

export type RuleChange = {
  rule_id: string;
  previous_rule: string;
  proposed_rule: string;
  reason: string;
  evidence: string[];
  confidence: number;
  reversible: true;
  rollback_token: string;
};

export type ConfidenceUpdate = {
  target: string;
  previous_confidence: number;
  next_confidence: number;
  reason: string;
};

export type GeneratedPolicy = {
  policy_id: string;
  rule: string;
  action: "scale_ads" | "reduce_ads" | "raise_price" | "hold" | "stop_sku" | "inventory_review";
  confidence: number;
  evidence: string[];
  rollback_token: string;
};

export type ObjectiveFunctionUpdate = {
  previous_objective: string;
  next_objective: string;
  previous_weights: PolicyWeights;
  next_weights: PolicyWeights;
  update_reason: string;
  safety_constraints: EvolutionSafetyConstraint[];
  rollback_token: string;
};

export type StrategyMutation = {
  strategy: "aggressive_scale" | "conservative_scale" | "profit_first" | "growth_first" | "profit_stability";
  expected_profit: number;
  expected_profit_delta: number;
  risk: number;
  confidence: number;
  explanation: string;
};

export type EvolutionEngineResult = {
  strategy_changes: StrategyChange[];
  rule_changes: RuleChange[];
  confidence_updates: ConfidenceUpdate[];
  learning_summary: string;
  safety_constraints: EvolutionSafetyConstraint[];
};

export type SelfEvolvingCommerceInput = {
  state: CommerceState;
  mode?: EvolutionExecutionMode;
  actualOutcomes?: Record<string, number>;
  currentPolicyWeights?: PolicyWeights;
};

export type SelfEvolvingCommerceResult = {
  version: "self_evolving_commerce_os_v1";
  mode: EvolutionExecutionMode;
  best_actions: Decision[];
  executed_actions: Array<Decision & { execution_mode: "suggested" | "evolution_applied" }>;
  policy_updates: GeneratedPolicy[];
  objective_function_update: ObjectiveFunctionUpdate;
  strategy_mutations: StrategyMutation[];
  evolution_log: Array<{
    event: string;
    detail: string;
    reversible: boolean;
  }>;
  feedback: {
    outcomes: DecisionOutcome[];
    policy_update: PolicyUpdateResult;
  };
  optimization_report: OptimizationLayerV2Report;
  confidence: number;
  system_version: "v_next";
  safety_constraints: EvolutionSafetyConstraint[];
};
