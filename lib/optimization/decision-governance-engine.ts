import type { PortfolioAction, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import type { DecisionConfidenceResult, DecisionConfidenceLevel } from "@/lib/optimization/decision-confidence-engine";

export type DecisionQuality = {
  confidence: DecisionConfidenceLevel;
  signal_confidence: DecisionConfidenceResult["signal_confidence"];
  blocked_signals: string[];
  data_limitations: string[];
  decision_allowed: string[];
};

export type DecisionGovernanceResult = {
  allowed: boolean;
  decision_quality: DecisionQuality;
};

export function governDecision(input: {
  action: PortfolioAction;
  unifiedAction?: ProfitSimulationResult["unified_action"];
  simulation?: ProfitSimulationResult;
  confidence: DecisionConfidenceResult;
}): DecisionGovernanceResult {
  const blockedSignals = new Set(input.confidence.blocked_signals);
  const dataLimitations = new Set(input.confidence.warnings);
  const action = input.action;
  const unifiedAction = input.unifiedAction;

  const block = (reason: string, limitation?: string) => {
    blockedSignals.add(reason);
    if (limitation) dataLimitations.add(limitation);
  };

  const lifecycleUnavailable = input.confidence.signal_confidence.lifecycle === "LOW";
  const inventoryLow = input.confidence.signal_confidence.inventory === "LOW";
  const attributionLow = input.confidence.signal_confidence.attribution === "LOW";
  const roasLow = input.confidence.signal_confidence.roas === "LOW";
  const customerLow = input.confidence.signal_confidence.customer === "LOW";
  const predictionLow = input.confidence.signal_confidence.prediction === "LOW";
  const profitabilityLow = input.confidence.signal_confidence.profitability === "LOW";

  const isScaleAds = action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || unifiedAction === "SCALE_ADS";
  const isControlledAdTest = action === "TEST_AD_SPEND";
  const isLowRiskAction = action === "HOLD" || isControlledAdTest || action === "PROMOTION_TEST";
  const isMediumRiskAction = isScaleAds ||
    action === "SHIFT_CHANNEL" ||
    action === "CREATE_BUNDLE" ||
    action === "PRICE_UP_5" ||
    action === "PRICE_UP_10" ||
    unifiedAction === "EXPAND_CHANNEL" ||
    unifiedAction === "OPTIMIZE_PRICE";
  const isReduceAds = action === "REDUCE_ADS" || unifiedAction === "REALLOCATE_BUDGET";
  const isInventoryAction = action === "RESTOCK_AND_SCALE" ||
    action === "REDUCE_INVENTORY" ||
    unifiedAction === "RESTOCK" ||
    unifiedAction === "REDUCE_INVENTORY";
  const isStop = action === "STOP" || unifiedAction === "STOP_SKU";
  const isHighRiskAction = isStop || action === "REDUCE_INVENTORY" || unifiedAction === "REDUCE_INVENTORY";
  const isAcquisitionBudgetIncrease = isScaleAds ||
    action === "SHIFT_CHANNEL" ||
    action === "CREATE_BUNDLE" ||
    unifiedAction === "EXPAND_CHANNEL";

  if ((isReduceAds || isStop) && lifecycleUnavailable) {
    block("Lifecycle unavailable: only one period", "Lifecycle signal treated as reporting only.");
  }

  if ((isInventoryAction || isStop) && inventoryLow) {
    block("Inventory velocity confidence low", "Inventory risk treated as potential, not confirmed.");
  }

  if (isScaleAds && !isControlledAdTest && roasLow) {
    block("Normalized ROAS unavailable", input.confidence.roas_validation.reason ?? "Raw ROAS cannot drive optimizer.");
  }

  if (((isScaleAds && !isControlledAdTest) || isReduceAds) && attributionLow) {
    block("Advertising attribution confidence low", "Advertising signal treated as reporting only.");
  }

  if (isAcquisitionBudgetIncrease && !isControlledAdTest && customerLow) {
    block("Customer acquisition confidence unavailable", "CAC/LTV signals are reporting only.");
  }

  if (isScaleAds && !isControlledAdTest && profitabilityLow) block("Profitability confidence low");
  if (isScaleAds && !isControlledAdTest && predictionLow) block("Prediction confidence low");

  if (isMediumRiskAction && profitabilityLow) {
    block("Profitability evidence required for medium risk action");
  }

  if (isHighRiskAction && (profitabilityLow || predictionLow)) {
    block("High risk action requires stronger confidence");
  }

  if (action === "REDUCE_ADS") {
    const hasProfitRecoveryEvidence = input.simulation
      ? input.simulation.profit_delta > 0 && input.simulation.recommended_ads_spend < input.simulation.current_ads_spend
      : false;
    if (!hasProfitRecoveryEvidence) block("Reduce ads requires positive profit recovery evidence");
  }

  if (isLowRiskAction) {
    blockedSignals.clear();
    if (lifecycleUnavailable) dataLimitations.add("Lifecycle confidence low; action limited to controlled learning.");
    if (roasLow) dataLimitations.add(input.confidence.roas_validation.reason ?? "ROAS confidence low; raw ROAS not used for scaling.");
    if (inventoryLow) dataLimitations.add("Inventory confidence low; inventory risk treated as observation only.");
    if (customerLow) dataLimitations.add("CAC/LTV confidence low; customer signal treated as reporting only.");
  }

  const allowed = blockedSignals.size === 0;

  return {
    allowed,
    decision_quality: {
      confidence: input.confidence.confidence_level,
      signal_confidence: input.confidence.signal_confidence,
      blocked_signals: Array.from(blockedSignals),
      data_limitations: Array.from(dataLimitations),
      decision_allowed: allowed ? ["Action allowed"] : ["Observation only"]
    }
  };
}
