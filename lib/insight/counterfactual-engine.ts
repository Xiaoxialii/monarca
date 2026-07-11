export type V2DecisionSignal =
  | "increase_ads"
  | "decrease_ads"
  | "adjust_price"
  | "reallocate_budget"
  | "reduce_sku_exposure"
  | "inventory_action"
  | "increase_cac_efficiency_focus"
  | "stop_scaling_negative_margin_skus";

export type CounterfactualScenario = {
  scenario_id: string;
  insight_id: string;
  sku: string;
  baseline_profit_change: number;
  no_action_outcome: {
    projected_profit_delta: number;
    projected_margin_delta: number;
    risk: "low" | "medium" | "high" | "critical";
  };
  action_outcomes: Array<{
    decision_signal: V2DecisionSignal;
    projected_profit_delta: number;
    projected_margin_delta: number;
    confidence_score: number;
    rationale: string;
  }>;
};

export type ActionRanking = {
  action_id: string;
  decision_signal: V2DecisionSignal;
  priority_score: number;
  expected_profit_delta: number;
  expected_margin_delta: number;
  confidence_score: number;
  affected_skus: string[];
  evidence_insight_ids: string[];
};

export type ProfitDriverDecomposition = {
  insight_id: string;
  sku: string;
  drivers: Array<{
    driver: string;
    contribution_percentage: number;
    direction: "positive" | "negative";
    estimated_profit_impact: number;
    affected_channel: string;
  }>;
};

export type LearningFeedbackLoop = {
  feedback_id: string;
  status: "ready_for_tracking";
  expected_metric_movements: Array<{
    decision_signal: V2DecisionSignal;
    metric: "profit" | "margin" | "roas" | "inventory_coverage" | "refund_rate";
    expected_direction: "up" | "down" | "stable";
    measurement_window_days: number;
  }>;
  learning_events: Array<{
    event_id: string;
    action_id: string;
    observed_profit_delta: number | null;
    observed_margin_delta: number | null;
    confidence_after_learning: number | null;
  }>;
};

export type DecisionIntelligenceV2 = {
  version: "decision_intelligence_v2";
  counterfactual_scenarios: CounterfactualScenario[];
  action_rankings: ActionRanking[];
  profit_driver_decomposition: ProfitDriverDecomposition[];
  learning_feedback_loop: LearningFeedbackLoop;
};

export type CounterfactualInsightInput = {
  insight_id: string;
  sku: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence_score: number;
  profit_change: {
    absolute: number;
    percentage: number;
  };
  root_causes: Array<{
    driver: string;
    impact: number;
    direction: "positive" | "negative";
    affected_channel: string;
    affected_skus: string[];
  }>;
  decision_signals: V2DecisionSignal[];
};

export function buildDecisionIntelligenceV2(insights: CounterfactualInsightInput[]): DecisionIntelligenceV2 {
  const counterfactualScenarios = insights.map(buildCounterfactualScenario);
  const actionRankings = rankActions(counterfactualScenarios);

  return {
    version: "decision_intelligence_v2",
    counterfactual_scenarios: counterfactualScenarios,
    action_rankings: actionRankings,
    profit_driver_decomposition: insights.map(buildProfitDriverDecomposition),
    learning_feedback_loop: buildLearningFeedbackLoop(actionRankings)
  };
}

function buildCounterfactualScenario(insight: CounterfactualInsightInput): CounterfactualScenario {
  const baseline = insight.profit_change.absolute;
  const negativePressure = Math.min(1, Math.abs(Math.min(0, insight.profit_change.percentage)));
  const risk = insight.severity;
  const noActionMultiplier = risk === "critical" ? 1.35 : risk === "high" ? 1.2 : risk === "medium" ? 1.1 : 1.03;
  const actionOutcomes = insight.decision_signals.map((signal) => {
    const effect = actionEffect(signal);
    const pressureBase = Math.max(Math.abs(baseline), 1);
    const projectedProfitDelta = baseline < 0
      ? roundCurrency(pressureBase * effect.recoveryRate)
      : roundCurrency(pressureBase * effect.upsideRate);

    return {
      decision_signal: signal,
      projected_profit_delta: projectedProfitDelta,
      projected_margin_delta: roundRatio((baseline < 0 ? negativePressure : Math.abs(insight.profit_change.percentage)) * effect.marginRate),
      confidence_score: roundRatio(Math.max(0.1, Math.min(1, insight.confidence_score * effect.confidenceMultiplier))),
      rationale: effect.rationale
    };
  });

  return {
    scenario_id: `counterfactual-${insight.insight_id}`,
    insight_id: insight.insight_id,
    sku: insight.sku,
    baseline_profit_change: baseline,
    no_action_outcome: {
      projected_profit_delta: roundCurrency(baseline < 0 ? baseline * noActionMultiplier : baseline * 0.65),
      projected_margin_delta: roundRatio(insight.profit_change.percentage * (baseline < 0 ? noActionMultiplier : 0.65)),
      risk
    },
    action_outcomes: actionOutcomes
  };
}

function rankActions(scenarios: CounterfactualScenario[]): ActionRanking[] {
  const grouped = new Map<V2DecisionSignal, ActionRanking>();

  for (const scenario of scenarios) {
    for (const outcome of scenario.action_outcomes) {
      const current = grouped.get(outcome.decision_signal) ?? {
        action_id: `action-${outcome.decision_signal}`,
        decision_signal: outcome.decision_signal,
        priority_score: 0,
        expected_profit_delta: 0,
        expected_margin_delta: 0,
        confidence_score: 0,
        affected_skus: [],
        evidence_insight_ids: []
      };
      current.expected_profit_delta = roundCurrency(current.expected_profit_delta + outcome.projected_profit_delta);
      current.expected_margin_delta = roundRatio(current.expected_margin_delta + outcome.projected_margin_delta);
      current.confidence_score = Math.max(current.confidence_score, outcome.confidence_score);
      current.affected_skus = Array.from(new Set([...current.affected_skus, scenario.sku]));
      current.evidence_insight_ids = Array.from(new Set([...current.evidence_insight_ids, scenario.insight_id]));
      grouped.set(outcome.decision_signal, current);
    }
  }

  return Array.from(grouped.values())
    .map((action) => ({
      ...action,
      priority_score: roundRatio(
        Math.max(0, action.expected_profit_delta) * 0.001 +
          Math.abs(action.expected_margin_delta) * 10 +
          action.confidence_score * 2 +
          action.evidence_insight_ids.length * 0.25
      )
    }))
    .sort((left, right) => right.priority_score - left.priority_score || right.expected_profit_delta - left.expected_profit_delta);
}

function buildProfitDriverDecomposition(insight: CounterfactualInsightInput): ProfitDriverDecomposition {
  return {
    insight_id: insight.insight_id,
    sku: insight.sku,
    drivers: insight.root_causes.map((cause) => ({
      driver: cause.driver,
      contribution_percentage: cause.impact,
      direction: cause.direction,
      estimated_profit_impact: roundCurrency(insight.profit_change.absolute * cause.impact),
      affected_channel: cause.affected_channel
    }))
  };
}

function buildLearningFeedbackLoop(actions: ActionRanking[]): LearningFeedbackLoop {
  return {
    feedback_id: "decision-intelligence-v2-feedback",
    status: "ready_for_tracking",
    expected_metric_movements: actions.slice(0, 8).map((action) => ({
      decision_signal: action.decision_signal,
      metric: expectedMetric(action.decision_signal),
      expected_direction: expectedDirection(action.decision_signal),
      measurement_window_days: action.decision_signal === "inventory_action" ? 30 : 14
    })),
    learning_events: []
  };
}

function actionEffect(signal: V2DecisionSignal) {
  const effects: Record<V2DecisionSignal, {
    recoveryRate: number;
    upsideRate: number;
    marginRate: number;
    confidenceMultiplier: number;
    rationale: string;
  }> = {
    increase_ads: { recoveryRate: 0.12, upsideRate: 0.18, marginRate: 0.04, confidenceMultiplier: 0.8, rationale: "Positive-margin SKU has room for traffic expansion." },
    decrease_ads: { recoveryRate: 0.28, upsideRate: 0.04, marginRate: 0.08, confidenceMultiplier: 0.9, rationale: "Reducing inefficient ad exposure limits contribution-profit leakage." },
    adjust_price: { recoveryRate: 0.22, upsideRate: 0.08, marginRate: 0.1, confidenceMultiplier: 0.75, rationale: "Pricing action targets margin erosion detected at SKU level." },
    reallocate_budget: { recoveryRate: 0.24, upsideRate: 0.12, marginRate: 0.07, confidenceMultiplier: 0.85, rationale: "Cross-channel distortion suggests budget movement may improve profit mix." },
    reduce_sku_exposure: { recoveryRate: 0.18, upsideRate: 0.03, marginRate: 0.06, confidenceMultiplier: 0.8, rationale: "Lower exposure reduces losses from negative or weak contribution SKUs." },
    inventory_action: { recoveryRate: 0.2, upsideRate: 0.08, marginRate: 0.05, confidenceMultiplier: 0.7, rationale: "Inventory constraint changes fulfillment capacity and paid efficiency." },
    increase_cac_efficiency_focus: { recoveryRate: 0.16, upsideRate: 0.05, marginRate: 0.05, confidenceMultiplier: 0.8, rationale: "CAC efficiency work targets paid-media leakage before further scale." },
    stop_scaling_negative_margin_skus: { recoveryRate: 0.3, upsideRate: 0.02, marginRate: 0.09, confidenceMultiplier: 0.88, rationale: "Stopping scale on negative-margin SKUs prevents compounding profit loss." }
  };
  return effects[signal];
}

function expectedMetric(signal: V2DecisionSignal): LearningFeedbackLoop["expected_metric_movements"][number]["metric"] {
  if (signal === "inventory_action") return "inventory_coverage";
  if (signal === "decrease_ads" || signal === "increase_cac_efficiency_focus" || signal === "reallocate_budget") return "roas";
  if (signal === "adjust_price" || signal === "stop_scaling_negative_margin_skus") return "margin";
  return "profit";
}

function expectedDirection(signal: V2DecisionSignal): LearningFeedbackLoop["expected_metric_movements"][number]["expected_direction"] {
  if (signal === "decrease_ads" || signal === "reduce_sku_exposure") return "down";
  return "up";
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
