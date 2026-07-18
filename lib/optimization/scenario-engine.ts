import type { ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import { roundCurrency, roundRatio } from "@/lib/optimization/objective";

export type AIScenario = {
  scenario_id: string;
  action: string;
  label: string;
  expected_profit: number;
  expected_profit_lift: number;
  expected_revenue_lift: number;
  confidence: number;
  risk: number;
  action_score: number;
  cash_impact: number;
  inventory_impact: number;
  time_to_impact: string;
  risk_level: string;
  selected: boolean;
  constraints: Array<"budget" | "inventory" | "margin" | "confidence">;
};

export type AIDecisionSelection = {
  selected_action: string;
  alternatives_considered: string[];
  selection_reason: string;
  expected_best_result: number;
  satisfied_constraints: Array<"budget" | "inventory" | "margin" | "confidence">;
};

export function buildScenarioComparison(input: {
  selected: ProfitSimulationResult;
  candidates: ProfitSimulationResult[];
}): {
  scenarios: AIScenario[];
  selected_scenario: AIScenario;
  decision_explanation: AIDecisionSelection;
} {
  const selectedAction = input.selected.action;
  const unique = new Map<string, ProfitSimulationResult>();

  for (const candidate of input.candidates) {
    if (candidate.sku !== input.selected.sku) continue;
    if (!unique.has(candidate.action)) unique.set(candidate.action, candidate);
  }

  if (!unique.has(selectedAction)) unique.set(selectedAction, input.selected);

  const ranked = Array.from(unique.values())
    .sort((left, right) => right.action_score - left.action_score || right.opportunity_score - left.opportunity_score || right.profit_delta - left.profit_delta)
    .slice(0, 5);

  const withHold = ranked.some((row) => row.action === "HOLD")
    ? ranked
    : [...ranked, buildHoldScenario(input.selected)];

  const scenarios = withHold
    .slice()
    .sort((left, right) => (left.action === selectedAction ? -1 : right.action === selectedAction ? 1 : right.action_score - left.action_score))
    .slice(0, 4)
    .map((row) => toScenario(row, row.action === selectedAction));

  const selectedScenario = scenarios.find((scenario) => scenario.selected) ?? toScenario(input.selected, true);
  const alternatives = scenarios.filter((scenario) => !scenario.selected);

  return {
    scenarios,
    selected_scenario: selectedScenario,
    decision_explanation: {
      selected_action: selectedScenario.action,
      alternatives_considered: alternatives.map((scenario) => scenario.action),
      selection_reason: buildSelectionReason(selectedScenario),
      expected_best_result: selectedScenario.expected_profit_lift,
      satisfied_constraints: selectedScenario.constraints
    }
  };
}

function toScenario(row: ProfitSimulationResult, selected: boolean): AIScenario {
  return {
    scenario_id: `${row.sku}-${row.action}`,
    action: row.action,
    label: scenarioLabel(row.action),
    expected_profit: row.predicted_profit,
    expected_profit_lift: row.profit_delta,
    expected_revenue_lift: row.revenue_delta,
    confidence: row.confidence,
    risk: row.risk,
    action_score: row.action_score,
    cash_impact: row.cash_impact,
    inventory_impact: row.inventory_impact,
    time_to_impact: row.time_to_impact,
    risk_level: row.risk_level,
    selected,
    constraints: constraintsPassed(row)
  };
}

function buildHoldScenario(row: ProfitSimulationResult): ProfitSimulationResult {
  return {
    ...row,
    action: "HOLD",
    recommended_ads_spend: row.current_ads_spend,
    predicted_profit: row.current_profit,
    profit_delta: 0,
    predicted_revenue: row.before_state.revenue,
    revenue_delta: 0,
    confidence: Math.max(0.5, Math.min(row.confidence, 0.72)),
    opportunity_score: 0,
    action_score: 0,
    cash_impact: 0,
    time_to_impact: "immediate",
    risk_level: "Low"
  };
}

function constraintsPassed(row: ProfitSimulationResult): AIScenario["constraints"] {
  const constraints: AIScenario["constraints"] = [];
  if (row.required_cash >= 0) constraints.push("budget");
  if (row.required_inventory <= row.current_inventory || row.action === "RESTOCK_AND_SCALE") constraints.push("inventory");
  if (row.predicted_margin >= 0.15) constraints.push("margin");
  if (row.confidence >= 0.6) constraints.push("confidence");
  return constraints;
}

function buildSelectionReason(scenario: AIScenario) {
  const lift = roundCurrency(scenario.expected_profit_lift).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const confidence = roundRatio(scenario.confidence * 100);
  return `Selected ${scenario.label} because it has the strongest risk-adjusted incremental profit (${lift}) with ${confidence}% confidence while satisfying ${scenario.constraints.join(", ")} constraints.`;
}

function scenarioLabel(action: string) {
  if (/SCALE_ADS|INCREASE_AD|SHIFT_CHANNEL|CREATE_BUNDLE/i.test(action)) return "Increase Ads";
  if (/PRICE_UP|RAISE_PRICE/i.test(action)) return "Raise Price";
  if (/PRICE_DOWN|PROMOTION|DISCOUNT/i.test(action)) return "Discount Test";
  if (/REDUCE_ADS/i.test(action)) return "Reduce Ads";
  if (/RESTOCK/i.test(action)) return "Restock";
  if (/TEST_AD/i.test(action)) return "Test Ads";
  if (/STOP/i.test(action)) return "Stop SKU";
  if (/HOLD/i.test(action)) return "Hold";
  return action.replaceAll("_", " ");
}
