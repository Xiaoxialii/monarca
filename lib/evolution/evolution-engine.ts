import { roundCurrency, roundRatio, safeRatio, type CommerceState } from "@/lib/optimization/objective";
import type { DecisionOutcome } from "@/lib/feedback/outcome-tracker";
import type { PolicyUpdateResult } from "@/lib/feedback/policy-update";
import type { EvolutionEngineResult, RuleChange, StrategyChange } from "@/lib/evolution/types";

export function runEvolutionEngine(input: {
  state: CommerceState;
  outcomes: DecisionOutcome[];
  policyUpdate: PolicyUpdateResult;
}): EvolutionEngineResult {
  const effectiveness = evaluateStrategyEffectiveness(input.outcomes);
  const strategyChanges = buildStrategyChanges(input.state, effectiveness);
  const ruleChanges = buildRuleChanges(input.state, effectiveness);
  const confidenceUpdates = input.outcomes.map((outcome, index) => {
    const reward = input.policyUpdate.rewards[index];
    return {
      target: outcome.skuId,
      previous_confidence: roundRatio(Math.max(0.35, Math.min(0.95, outcome.predictedProfitImpact / Math.max(1, Math.abs(outcome.actualProfitImpact))))),
      next_confidence: roundRatio(Math.max(0.35, Math.min(0.95, reward?.reward ?? 0.35))),
      reason: (reward?.reward ?? 0) >= 1 ? "Actual outcome met or exceeded predicted profit impact." : "Actual outcome underperformed predicted profit impact."
    };
  });

  return {
    strategy_changes: strategyChanges,
    rule_changes: ruleChanges,
    confidence_updates: confidenceUpdates,
    learning_summary: summarizeLearning(effectiveness, strategyChanges, ruleChanges),
    safety_constraints: [
      "profit_safety_constraint",
      "feedback_required",
      "rollback_required",
      "explainability_required",
      "anti_overfit_guardrail"
    ]
  };
}

function evaluateStrategyEffectiveness(outcomes: DecisionOutcome[]) {
  const actualProfit = roundCurrency(outcomes.reduce((sum, outcome) => sum + outcome.actualProfitImpact, 0));
  const predictedProfit = roundCurrency(outcomes.reduce((sum, outcome) => sum + outcome.predictedProfitImpact, 0));
  const accuracy = safeRatio(actualProfit, Math.max(1, predictedProfit));
  const failedActions = outcomes.filter((outcome) => outcome.actualProfitImpact < 0 || outcome.actualProfitImpact < outcome.predictedProfitImpact * 0.65);
  const winningActions = outcomes.filter((outcome) => outcome.actualProfitImpact >= outcome.predictedProfitImpact);

  return {
    actualProfit,
    predictedProfit,
    accuracy,
    failedActions,
    winningActions,
    hasFeedback: outcomes.length > 0
  };
}

function buildStrategyChanges(
  state: CommerceState,
  effectiveness: ReturnType<typeof evaluateStrategyEffectiveness>
): StrategyChange[] {
  if (!effectiveness.hasFeedback) {
    return [{
      strategy: "learning_hold",
      change: "hold",
      reason: "No execution outcomes were provided, so strategy mutation is held in suggest mode.",
      evidence: ["feedback_required"],
      confidence: 0.35,
      rollback_token: rollbackToken("strategy", "learning_hold")
    }];
  }

  const portfolioRoas = safeRatio(
    state.skus.reduce((sum, sku) => sum + sku.revenue, 0),
    state.skus.reduce((sum, sku) => sum + sku.adSpend, 0)
  );

  if (effectiveness.accuracy >= 1 && portfolioRoas >= 2) {
    return [{
      strategy: "profitable_scaling",
      change: "increase",
      reason: "Execution feedback outperformed predicted profit and portfolio ROAS supports controlled scaling.",
      evidence: [`accuracy=${effectiveness.accuracy}`, `portfolio_roas=${portfolioRoas}`],
      confidence: 0.82,
      rollback_token: rollbackToken("strategy", "profitable_scaling")
    }];
  }

  if (effectiveness.failedActions.length > effectiveness.winningActions.length) {
    return [{
      strategy: "aggressive_scaling",
      change: "decrease",
      reason: "More actions underperformed than outperformed, so scaling pressure should be reduced.",
      evidence: [`failed_actions=${effectiveness.failedActions.length}`, `winning_actions=${effectiveness.winningActions.length}`],
      confidence: 0.76,
      rollback_token: rollbackToken("strategy", "aggressive_scaling")
    }];
  }

  return [{
    strategy: "profit_stability",
    change: "increase",
    reason: "Feedback is mixed, so the system shifts toward stability without changing hard constraints.",
    evidence: [`accuracy=${effectiveness.accuracy}`],
    confidence: 0.68,
    rollback_token: rollbackToken("strategy", "profit_stability")
  }];
}

function buildRuleChanges(
  state: CommerceState,
  effectiveness: ReturnType<typeof evaluateStrategyEffectiveness>
): RuleChange[] {
  if (!effectiveness.hasFeedback) return [];

  const avgMargin = safeRatio(
    state.skus.reduce((sum, sku) => sum + sku.grossProfit, 0),
    state.skus.reduce((sum, sku) => sum + sku.revenue, 0)
  );
  const avgRoas = safeRatio(
    state.skus.reduce((sum, sku) => sum + (sku.roas ?? safeRatio(sku.revenue, sku.adSpend)), 0),
    state.skus.length
  );
  const changes: RuleChange[] = [];

  if (effectiveness.accuracy < 0.8) {
    changes.push({
      rule_id: "scale_ads_threshold",
      previous_rule: "IF ROAS > 1.5 AND margin > 0.18 THEN scale_ads",
      proposed_rule: `IF ROAS > ${Math.max(1.8, roundRatio(avgRoas * 0.9))} AND margin > ${Math.max(0.2, roundRatio(avgMargin * 0.9))} THEN scale_ads`,
      reason: "Scaling underperformed, so thresholds are tightened using portfolio feedback.",
      evidence: [`accuracy=${effectiveness.accuracy}`, `avg_roas=${avgRoas}`, `avg_margin=${avgMargin}`],
      confidence: 0.74,
      reversible: true,
      rollback_token: rollbackToken("rule", "scale_ads_threshold")
    });
  }

  if (effectiveness.accuracy >= 1.05) {
    changes.push({
      rule_id: "budget_expansion_threshold",
      previous_rule: "IF ROAS > 3 THEN expand_budget",
      proposed_rule: `IF ROAS > ${Math.max(2.5, roundRatio(avgRoas * 0.85))} AND profit_feedback_positive THEN expand_budget`,
      reason: "Positive feedback supports slightly broader budget expansion while requiring profit confirmation.",
      evidence: [`accuracy=${effectiveness.accuracy}`, `avg_roas=${avgRoas}`],
      confidence: 0.8,
      reversible: true,
      rollback_token: rollbackToken("rule", "budget_expansion_threshold")
    });
  }

  return changes;
}

function summarizeLearning(
  effectiveness: ReturnType<typeof evaluateStrategyEffectiveness>,
  strategyChanges: StrategyChange[],
  ruleChanges: RuleChange[]
) {
  if (!effectiveness.hasFeedback) {
    return "No outcome feedback was provided, so the system generated explainable suggestions but did not mutate active policy.";
  }

  return [
    `Predicted profit impact was ${effectiveness.predictedProfit}; actual impact was ${effectiveness.actualProfit}.`,
    `Strategy updates=${strategyChanges.length}; rule updates=${ruleChanges.length}.`,
    "All mutations include rollback tokens and remain bounded by profit safety constraints."
  ].join(" ");
}

function rollbackToken(scope: string, id: string) {
  return `${scope}:${id}:rollback:v_next`;
}
