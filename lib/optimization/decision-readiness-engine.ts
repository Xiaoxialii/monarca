import type { PortfolioAction, PortfolioSkuInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import type { DecisionConfidenceResult, DecisionConfidenceLevel } from "@/lib/optimization/decision-confidence-engine";
import type { DecisionGovernanceResult } from "@/lib/optimization/decision-governance-engine";
import { roundRatio } from "@/lib/optimization/objective";

export type DecisionReadinessAction =
  | "MONITOR"
  | "TEST_AD_SPEND"
  | "PROMOTION_TEST"
  | "SCALE_ADS"
  | "REDUCE_ADS"
  | "RESTOCK"
  | "REDUCE_INVENTORY"
  | "PRICE_CHANGE"
  | "STOP"
  | "LIFECYCLE_ACTION"
  | "LIFECYCLE_DECISION"
  | "PORTFOLIO_REALLOCATION"
  | "ACQUISITION_SCALING";

export type DecisionSignalReadiness = {
  data_confidence: DecisionConfidenceLevel;
  signal_confidence: DecisionConfidenceLevel;
};

export type DecisionReadiness = {
  score: number;
  decision_readiness_score: number;
  confidence_level: DecisionConfidenceLevel;
  signal_readiness: {
    profitability: DecisionSignalReadiness;
    attribution: DecisionSignalReadiness;
    lifecycle: DecisionSignalReadiness;
    inventory: DecisionSignalReadiness;
    prediction: DecisionSignalReadiness;
    roas: DecisionSignalReadiness;
    customer: DecisionSignalReadiness;
  };
  blocked_actions: DecisionReadinessAction[];
  allowed_actions: DecisionReadinessAction[];
  limitations: string[];
  data_limitations: string[];
};

export function evaluateDecisionReadiness(input: {
  sku: PortfolioSkuInput;
  action: PortfolioAction;
  unifiedAction?: ProfitSimulationResult["unified_action"];
  confidence: DecisionConfidenceResult;
  governance: DecisionGovernanceResult;
}): DecisionReadiness {
  const blockedActions = new Set<DecisionReadinessAction>();
  const allowedActions = new Set<DecisionReadinessAction>(["MONITOR"]);
  const dataLimitations = new Set(input.governance.decision_quality.data_limitations);
  const signal = input.confidence.signal_confidence;
  const isControlledAdTest = input.action === "TEST_AD_SPEND";
  const isPromotionTest = input.action === "PROMOTION_TEST";

  if (signal.lifecycle === "LOW") {
    blockedActions.add("LIFECYCLE_ACTION");
    blockedActions.add("LIFECYCLE_DECISION");
    blockedActions.add("PORTFOLIO_REALLOCATION");
    dataLimitations.add("Lifecycle unavailable: insufficient historical periods.");
  }

  if (signal.inventory === "LOW" || input.sku.sales_velocity_confidence === "LOW") {
    blockedActions.add("RESTOCK");
    blockedActions.add("REDUCE_INVENTORY");
    blockedActions.add("STOP");
    dataLimitations.add("Inventory velocity confidence low; inventory signal is observation only.");
  }

  if (signal.roas === "LOW" || input.confidence.roas_validation.normalized_roas === null) {
    if (!isControlledAdTest) blockedActions.add("SCALE_ADS");
    dataLimitations.add(input.confidence.roas_validation.reason ?? "Normalized ROAS unavailable.");
  } else {
    allowedActions.add("SCALE_ADS");
  }

  if (signal.attribution === "LOW") {
    if (!isControlledAdTest) blockedActions.add("SCALE_ADS");
    blockedActions.add("REDUCE_ADS");
    dataLimitations.add("Advertising attribution confidence low.");
  }

  if (signal.customer === "LOW") {
    blockedActions.add("ACQUISITION_SCALING");
    if (!isControlledAdTest) blockedActions.add("SCALE_ADS");
    dataLimitations.add("CAC confidence unavailable; customer signal is reporting only.");
  }

  if (signal.profitability === "LOW" || signal.prediction === "LOW") {
    if (!isControlledAdTest) blockedActions.add("SCALE_ADS");
    blockedActions.add("PRICE_CHANGE");
    dataLimitations.add("Profitability or prediction confidence below decision threshold.");
  }

  if (input.action.includes("PRICE") || input.unifiedAction === "OPTIMIZE_PRICE") {
    if (!isPromotionTest && (signal.profitability === "LOW" || signal.prediction === "LOW")) {
      blockedActions.add("PRICE_CHANGE");
      dataLimitations.add("Price changes require reliable profitability and prediction signals.");
    } else {
      allowedActions.add("PRICE_CHANGE");
    }
  }

  for (const reason of input.governance.decision_quality.blocked_signals) {
    dataLimitations.add(reason);
  }

  if (input.governance.allowed && !blockedActions.has("REDUCE_ADS")) allowedActions.add("REDUCE_ADS");
  if (input.governance.allowed && !blockedActions.has("RESTOCK")) allowedActions.add("RESTOCK");
  if (input.governance.allowed && !blockedActions.has("REDUCE_INVENTORY")) allowedActions.add("REDUCE_INVENTORY");
  if (input.governance.allowed && isControlledAdTest) allowedActions.add("TEST_AD_SPEND");
  if (input.governance.allowed && isPromotionTest) allowedActions.add("PROMOTION_TEST");
  for (const blocked of blockedActions) {
    allowedActions.delete(blocked);
  }
  allowedActions.add("MONITOR");

  const score = roundRatio(Math.max(0, Math.min(100, input.confidence.overall_confidence_score * 100 - blockedActions.size * 8)));
  const signalReadiness = buildSignalReadiness(input.confidence);
  const confidenceLevel = levelFromReadinessScore(score);

  return {
    score,
    decision_readiness_score: score,
    confidence_level: confidenceLevel,
    signal_readiness: signalReadiness,
    blocked_actions: Array.from(blockedActions),
    allowed_actions: Array.from(allowedActions),
    limitations: Array.from(dataLimitations),
    data_limitations: Array.from(dataLimitations)
  };
}

function levelFromReadinessScore(score: number): DecisionConfidenceLevel {
  if (score >= 75) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function buildSignalReadiness(confidence: DecisionConfidenceResult): DecisionReadiness["signal_readiness"] {
  const signal = confidence.signal_confidence;
  return {
    profitability: splitConfidence(signal.profitability),
    attribution: splitConfidence(signal.attribution),
    lifecycle: splitConfidence(signal.lifecycle),
    inventory: splitConfidence(signal.inventory),
    prediction: splitConfidence(signal.prediction),
    roas: splitConfidence(signal.roas),
    customer: splitConfidence(signal.customer)
  };
}

function splitConfidence(signalConfidence: DecisionConfidenceLevel): DecisionSignalReadiness {
  return {
    data_confidence: signalConfidence,
    signal_confidence: signalConfidence
  };
}
