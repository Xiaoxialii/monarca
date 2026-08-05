import { roundRatio } from "@/lib/optimization/objective";
import type { PortfolioAction, PortfolioSkuInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import { governDecision } from "@/lib/optimization/decision-governance-engine";

export type DecisionConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type DecisionConfidenceResult = {
  overall_confidence_score: number;
  confidence_level: DecisionConfidenceLevel;
  signal_confidence: {
    profitability: DecisionConfidenceLevel;
    attribution: DecisionConfidenceLevel;
    lifecycle: DecisionConfidenceLevel;
    inventory: DecisionConfidenceLevel;
    prediction: DecisionConfidenceLevel;
    roas: DecisionConfidenceLevel;
    customer: DecisionConfidenceLevel;
  };
  roas_validation: {
    raw_roas: number | null;
    normalized_roas: number | null;
    confidence: DecisionConfidenceLevel;
    reason?: string;
  };
  evidence_quality: {
    profitability: DecisionConfidenceLevel;
    attribution: DecisionConfidenceLevel;
    inventory: DecisionConfidenceLevel;
    lifecycle: DecisionConfidenceLevel | "UNKNOWN";
    prediction: DecisionConfidenceLevel;
    roas: DecisionConfidenceLevel;
    customer: DecisionConfidenceLevel;
  };
  signal_quality: {
    profitability: DecisionConfidenceLevel;
    attribution: DecisionConfidenceLevel;
    inventory: DecisionConfidenceLevel;
    lifecycle: DecisionConfidenceLevel | "UNKNOWN";
    prediction: DecisionConfidenceLevel;
    roas: DecisionConfidenceLevel;
    customer: DecisionConfidenceLevel;
  };
  blocking_reasons: string[];
  blocked_signals: string[];
  warnings: string[];
};

export function decisionConfidenceEvaluator(input: {
  sku: PortfolioSkuInput;
  simulation: ProfitSimulationResult;
  policy?: OptimizationPolicy;
}): DecisionConfidenceResult {
  const policy = input.policy ?? DEFAULT_OPTIMIZATION_POLICY;
  const sku = input.sku;
  const row = input.simulation;
  const rawRoas = row.current_ads_spend > 0 ? roundRatio(row.before_state.revenue / Math.max(1, row.current_ads_spend)) : null;
  const roasValidation = validateRoasConfidence({
    rawRoas,
    spend: row.current_ads_spend,
    attributionConfidence: sku.attribution_confidence,
    skuRoasConfidence: sku.roas_confidence,
    anomalyThreshold: policy.thresholds.advertising.scaleAds.roasAnomalyThreshold ?? 20
  });
  const profitability = levelFromScore(sku.profitability_confidence ?? (sku.net_profit > 0 && sku.margin > 0 ? 0.78 : 0.48));
  const attribution = levelFromScore(sku.attribution_confidence ?? row.confidence_breakdown.attribution_confidence ?? 0.45);
  const lifecycle = lifecycleConfidenceLevel(row);
  const inventory = inventoryConfidenceLevel(sku, row);
  const prediction = levelFromScore(sku.prediction_confidence ?? row.confidence_breakdown.overall_confidence ?? row.confidence);
  const customer = customerConfidenceLevel(sku);
  const signalScores = [
    scoreFromLevel(profitability),
    scoreFromLevel(attribution),
    scoreFromLevel(lifecycle),
    scoreFromLevel(inventory),
    scoreFromLevel(prediction),
    scoreFromLevel(roasValidation.confidence),
    scoreFromLevel(customer)
  ];
  const warnings = collectWarnings({
    row,
    sku,
    lifecycle,
    roasReason: roasValidation.reason,
    inventory
  });
  const blockingReasons = blockingReasonsForAction({
    action: row.action,
    unifiedAction: row.unified_action,
    hasReduceAdsProfitRecoveryEvidence: row.action === "REDUCE_ADS"
      ? row.profit_delta > 0 && row.recommended_ads_spend < row.current_ads_spend
      : true,
    profitability,
    attribution,
    lifecycle,
    inventory,
    prediction,
    roas: roasValidation.confidence,
    customer,
    warnings
  });
  const score = roundRatio(signalScores.reduce((sum, value) => sum + value, 0) / Math.max(1, signalScores.length));

  return {
    overall_confidence_score: score,
    confidence_level: levelFromScore(score),
    signal_confidence: {
      profitability,
      attribution,
      lifecycle,
      inventory,
      prediction,
      roas: roasValidation.confidence,
      customer
    },
    roas_validation: roasValidation,
    evidence_quality: {
      profitability,
      attribution,
      inventory,
      lifecycle: lifecycle === "LOW" && row.lifecycle_stage === "UNKNOWN" ? "UNKNOWN" : lifecycle,
      prediction,
      roas: roasValidation.confidence,
      customer
    },
    signal_quality: {
      profitability,
      attribution,
      inventory,
      lifecycle: lifecycle === "LOW" && row.lifecycle_stage === "UNKNOWN" ? "UNKNOWN" : lifecycle,
      prediction,
      roas: roasValidation.confidence,
      customer
    },
    blocking_reasons: blockingReasons,
    blocked_signals: blockingReasons,
    warnings
  };
}

export function actionAllowedByDecisionConfidence(input: {
  action: PortfolioAction;
  unifiedAction?: ProfitSimulationResult["unified_action"];
  simulation?: ProfitSimulationResult;
  confidence: DecisionConfidenceResult;
}) {
  return governDecision(input).allowed;
}

export function confidenceLevelFromScore(score: number): DecisionConfidenceLevel {
  return levelFromScore(score);
}

function validateRoasConfidence(input: {
  rawRoas: number | null;
  spend: number;
  attributionConfidence?: number;
  skuRoasConfidence?: DecisionConfidenceLevel;
  anomalyThreshold: number;
}): DecisionConfidenceResult["roas_validation"] {
  if (input.rawRoas === null) {
    return {
      raw_roas: null,
      normalized_roas: null,
      confidence: "LOW",
      reason: "Missing SKU ad spend attribution"
    };
  }
  if (input.skuRoasConfidence === "LOW") {
    return {
      raw_roas: input.rawRoas,
      normalized_roas: null,
      confidence: "LOW",
      reason: "ROAS marked low confidence upstream"
    };
  }
  if (input.spend < 25) {
    return {
      raw_roas: input.rawRoas,
      normalized_roas: null,
      confidence: "LOW",
      reason: "Insufficient attributed ad spend"
    };
  }
  if (input.rawRoas > input.anomalyThreshold) {
    return {
      raw_roas: input.rawRoas,
      normalized_roas: null,
      confidence: "LOW",
      reason: "ROAS anomaly requires attribution validation"
    };
  }
  const attribution = input.attributionConfidence ?? 0.55;
  if (attribution >= 0.75 && input.spend >= 100) {
    return { raw_roas: input.rawRoas, normalized_roas: input.rawRoas, confidence: "HIGH" };
  }
  if (attribution >= 0.55) {
    return { raw_roas: input.rawRoas, normalized_roas: input.rawRoas, confidence: "MEDIUM" };
  }
  return {
    raw_roas: input.rawRoas,
    normalized_roas: null,
    confidence: "LOW",
    reason: "Insufficient ad attribution"
  };
}

function lifecycleConfidenceLevel(row: ProfitSimulationResult): DecisionConfidenceLevel {
  if (!row.lifecycle) return "LOW";
  if (row.lifecycle.lifecycle_stage === "UNKNOWN" || row.lifecycle.lifecycle_stage === "INSUFFICIENT_HISTORY") return "LOW";
  return row.lifecycle.lifecycle_confidence;
}

function inventoryConfidenceLevel(sku: PortfolioSkuInput, row: ProfitSimulationResult): DecisionConfidenceLevel {
  if (sku.sales_velocity_confidence === "LOW") return "LOW";
  if (sku.sales_velocity_confidence === "MEDIUM") return "MEDIUM";
  if (row.confidence_breakdown.inventory_confidence >= 0.75) return "HIGH";
  if (row.confidence_breakdown.inventory_confidence >= 0.55) return "MEDIUM";
  return "LOW";
}

function customerConfidenceLevel(sku: PortfolioSkuInput): DecisionConfidenceLevel {
  const explicit = sku.cac_confidence ?? sku.customer_metric_confidence;
  if (explicit) return explicit;
  return "LOW";
}

function collectWarnings(input: {
  row: ProfitSimulationResult;
  sku: PortfolioSkuInput;
  lifecycle: DecisionConfidenceLevel;
  inventory: DecisionConfidenceLevel;
  roasReason?: string;
}) {
  const warnings: string[] = [];
  if (input.lifecycle === "LOW") warnings.push("Lifecycle ignored due to insufficient history");
  if (input.roasReason) warnings.push(input.roasReason);
  if (input.inventory === "LOW" && (input.row.action === "REDUCE_INVENTORY" || input.row.action === "RESTOCK_AND_SCALE")) {
    warnings.push("Inventory action requires more reliable velocity history");
  }
  if (input.sku.attribution_confidence !== undefined && input.sku.attribution_confidence < 0.65) {
    warnings.push("Attribution confidence below automatic action threshold");
  }
  return Array.from(new Set(warnings));
}

function blockingReasonsForAction(input: {
  action: PortfolioAction;
  unifiedAction: ProfitSimulationResult["unified_action"];
  hasReduceAdsProfitRecoveryEvidence: boolean;
  profitability: DecisionConfidenceLevel;
  attribution: DecisionConfidenceLevel;
  lifecycle: DecisionConfidenceLevel;
  inventory: DecisionConfidenceLevel;
  prediction: DecisionConfidenceLevel;
  roas: DecisionConfidenceLevel;
  customer: DecisionConfidenceLevel;
  warnings: string[];
}) {
  const reasons: string[] = [];
  const needsInventory = input.action === "RESTOCK_AND_SCALE" ||
    input.action === "REDUCE_INVENTORY" ||
    input.unifiedAction === "RESTOCK" ||
    input.unifiedAction === "REDUCE_INVENTORY";
  const isControlledAdTest = input.action === "TEST_AD_SPEND";
  const needsRoas = input.action === "SCALE_ADS" ||
    input.action === "SCALE_ADS_PRICE_UP_5" ||
    input.action === "REDUCE_ADS" ||
    (input.unifiedAction === "SCALE_ADS" && !isControlledAdTest);
  const needsLifecycleTrend = input.action === "REDUCE_INVENTORY" ||
    input.action === "STOP" ||
    input.unifiedAction === "STOP_SKU" ||
    input.unifiedAction === "REALLOCATE_BUDGET";

  if (needsRoas && input.roas === "LOW") reasons.push("ROAS confidence is LOW");
  if (needsRoas && input.attribution === "LOW") reasons.push("Attribution confidence is LOW");
  if (input.action === "REDUCE_ADS" && !input.hasReduceAdsProfitRecoveryEvidence) reasons.push("Reduce ads requires positive profit recovery evidence");
  if (input.unifiedAction === "SCALE_ADS" && !isControlledAdTest && input.profitability === "LOW") reasons.push("Profitability confidence is LOW");
  if (input.unifiedAction === "SCALE_ADS" && !isControlledAdTest && input.prediction === "LOW") reasons.push("Prediction confidence is LOW");
  if (((input.unifiedAction === "SCALE_ADS" && !isControlledAdTest) || input.unifiedAction === "EXPAND_CHANNEL") && input.customer === "LOW") reasons.push("Customer signal ignored: CAC confidence LOW");
  if (((input.unifiedAction === "SCALE_ADS" && !isControlledAdTest) || needsInventory) && input.inventory === "LOW") reasons.push("Inventory confidence is LOW");
  if (input.action === "STOP" && input.inventory === "LOW") reasons.push("Inventory confidence is LOW");
  if (needsLifecycleTrend && input.lifecycle === "LOW") reasons.push("Lifecycle trend confidence is LOW");

  const blockingWarnings = input.warnings.filter((warning) => {
    if (/Lifecycle ignored/i.test(warning)) return needsLifecycleTrend;
    if (/Attribution confidence below/i.test(warning)) return needsRoas;
    if (/ROAS|anomaly|ad attribution|attributed ad spend/i.test(warning)) return needsRoas;
    if (/Inventory action requires/i.test(warning)) return needsInventory;
    return /requires/i.test(warning);
  });

  return Array.from(new Set([...reasons, ...blockingWarnings]));
}

function scoreFromLevel(level: DecisionConfidenceLevel) {
  if (level === "HIGH") return 0.88;
  if (level === "MEDIUM") return 0.66;
  return 0.35;
}

function levelFromScore(score: number): DecisionConfidenceLevel {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.55) return "MEDIUM";
  return "LOW";
}
