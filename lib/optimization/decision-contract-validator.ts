import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import type {
  BusinessConstraintsInput,
  PortfolioAction,
  ProfitSimulationResult
} from "@/lib/optimization/profit-simulation-engine";

export type DecisionContractIssue = {
  field: string;
  message: string;
};

export type DecisionContractValidationResult = {
  valid: boolean;
  errors: DecisionContractIssue[];
  warnings: DecisionContractIssue[];
  checked_rules: string[];
};

export type DecisionContractValidationMetadata = {
  status: "PASSED" | "FAILED";
  checked_rules: string[];
  errors?: string[];
  warnings?: string[];
};

export type DecisionContractCandidate = Partial<ProfitSimulationResult> & {
  action?: PortfolioAction | string;
  canonical_action?: string;
  unified_action?: string;
  current_inventory?: number | null;
  required_inventory?: number | null;
  inventory_gap?: number | null;
  inventory_impact?: number | null;
  inventory_coverage_days?: number | null;
  ads_spend?: number | null;
  estimated_roas?: number | null;
  margin?: number | null;
  prediction_confidence?: number | null;
  current_price?: number | null;
  new_price?: number | null;
  price_change_percentage?: number | null;
  price_elasticity_confidence?: number | null;
  conversion_stability?: number | null;
  current_profit?: number | null;
  predicted_profit?: number | null;
  predicted_profit_delta?: number | null;
  profit_delta?: number | null;
  predicted_margin?: number | null;
  predicted_revenue?: number | null;
  required_cash?: number | null;
  available_cash?: number | null;
};

export function validateDecisionContract(
  decision: DecisionContractCandidate,
  input: {
    policy?: OptimizationPolicy;
    constraints?: BusinessConstraintsInput;
  } = {}
): DecisionContractValidationResult {
  const policy = input.policy ?? DEFAULT_OPTIMIZATION_POLICY;
  const errors: DecisionContractIssue[] = [];
  const warnings: DecisionContractIssue[] = [];
  const checked_rules: string[] = [];
  const action = normalizedAction(decision);

  if (!action) {
    errors.push({ field: "action", message: "Missing action type." });
    return { valid: false, errors, warnings, checked_rules: ["action_type_present"] };
  }

  checked_rules.push("action_type_present");

  if (isRestockAction(action)) {
    checked_rules.push("inventory_evidence_present", "inventory_gap_positive", "inventory_gap_consistent");
    validateRestockEvidence(decision, errors);
  }

  if (isInventoryReductionAction(action)) {
    checked_rules.push("excess_inventory_evidence_present", "excess_inventory_threshold_passed");
    validateInventoryReductionEvidence(decision, policy, errors);
  }

  if (isAdvertisingAction(action)) {
    checked_rules.push("advertising_evidence_present", "advertising_policy_threshold_passed", "inventory_coverage_present");
    validateAdvertisingEvidence(action, decision, policy, errors);
  }

  if (isPricingAction(action)) {
    checked_rules.push("pricing_evidence_present", "pricing_policy_threshold_passed");
    validatePricingEvidence(decision, policy, errors, warnings);
  }

  checked_rules.push("profit_delta_consistent", "predicted_margin_consistent", "cash_constraint_consistent");
  validateSimulationConsistency(decision, input.constraints, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checked_rules
  };
}

export function validationMetadata(result: DecisionContractValidationResult): DecisionContractValidationMetadata {
  return {
    status: result.valid ? "PASSED" : "FAILED",
    checked_rules: result.checked_rules,
    ...(result.errors.length ? { errors: result.errors.map((issue) => `${issue.field}: ${issue.message}`) } : {}),
    ...(result.warnings.length ? { warnings: result.warnings.map((issue) => `${issue.field}: ${issue.message}`) } : {})
  };
}

export function validatePortfolioSimulationContracts(
  simulations: ProfitSimulationResult[],
  input: {
    policy?: OptimizationPolicy;
    constraints?: BusinessConstraintsInput;
    logger?: (event: {
      sku: string;
      action: string;
      validation: DecisionContractValidationMetadata;
      timestamp: string;
    }) => void;
  } = {}
) {
  const valid: ProfitSimulationResult[] = [];
  const rejected: Array<{ simulation: ProfitSimulationResult; validation: DecisionContractValidationMetadata }> = [];

  for (const simulation of simulations) {
    const result = validateDecisionContract(simulation, {
      policy: input.policy,
      constraints: input.constraints
    });
    const validation = validationMetadata(result);
    const row = { ...simulation, validation };

    if (result.valid) {
      valid.push(row);
    } else {
      rejected.push({ simulation: row, validation });
      input.logger?.({
        sku: simulation.sku,
        action: String(simulation.action),
        validation,
        timestamp: new Date().toISOString()
      });
    }
  }

  return { valid, rejected };
}

function validateRestockEvidence(decision: DecisionContractCandidate, errors: DecisionContractIssue[]) {
  const currentInventory = numberValue(decision.current_inventory ?? decision.before_state?.inventory);
  const requiredInventory = numberValue(decision.required_inventory ?? decision.after_state?.inventory_required);
  const inventoryGap = numberValue(decision.inventory_gap ?? decision.inventory_impact);

  if (currentInventory === null) errors.push({ field: "current_inventory", message: "Missing current_inventory for inventory action." });
  if (requiredInventory === null) errors.push({ field: "required_inventory", message: "Missing required_inventory for inventory action." });
  if (inventoryGap === null) errors.push({ field: "inventory_gap", message: "Missing inventory_gap for inventory action." });
  if (currentInventory === null || requiredInventory === null || inventoryGap === null) return;

  const computedGap = requiredInventory - currentInventory;
  if (Math.abs(inventoryGap - computedGap) > 0.01) {
    errors.push({ field: "inventory_gap", message: `inventory_gap must equal required_inventory - current_inventory (${computedGap}).` });
  }
  if (inventoryGap <= 0 || computedGap <= 0) {
    errors.push({ field: "inventory_gap", message: "RESTOCK requires inventory_gap > 0." });
  }
}

function validateInventoryReductionEvidence(
  decision: DecisionContractCandidate,
  policy: OptimizationPolicy,
  errors: DecisionContractIssue[]
) {
  const coverage = inventoryCoverageDays(decision);
  if (coverage === null) {
    errors.push({ field: "inventory_coverage_days", message: "Missing inventory_coverage_days for inventory reduction action." });
    return;
  }
  if (coverage <= policy.thresholds.inventory.excessInventoryDays) {
    errors.push({
      field: "inventory_coverage_days",
      message: `Inventory reduction requires coverage above ${policy.thresholds.inventory.excessInventoryDays} days.`
    });
  }
}

function validateAdvertisingEvidence(
  action: string,
  decision: DecisionContractCandidate,
  policy: OptimizationPolicy,
  errors: DecisionContractIssue[]
) {
  const currentAdsSpend = numberValue(decision.ads_spend ?? decision.current_ads_spend ?? decision.before_state?.ad_spend);
  const estimatedRoas = numberValue(decision.estimated_roas ?? decision.ads_response?.marginal_roas);
  const margin = numberValue(decision.margin ?? decision.before_state?.margin);
  const confidence = numberValue(decision.prediction_confidence ?? decision.confidence);
  const coverage = inventoryCoverageDays(decision);

  if (currentAdsSpend === null) errors.push({ field: "ads_spend", message: "Missing ads_spend for advertising action." });
  if (margin === null) errors.push({ field: "margin", message: "Missing margin for advertising action." });
  if (confidence === null) errors.push({ field: "prediction_confidence", message: "Missing prediction_confidence for advertising action." });
  if (coverage === null) errors.push({ field: "inventory_coverage_days", message: "Missing inventory_coverage_days for advertising action." });

  if (action === "TEST_AD_SPEND") {
    if (margin !== null && margin <= 0) {
      errors.push({ field: "margin", message: "TEST_AD_SPEND requires positive margin evidence." });
    }
    if (confidence !== null && confidence < Math.max(0.28, policy.thresholds.portfolioHealth.minimumConfidence - 0.2)) {
      errors.push({ field: "prediction_confidence", message: "Prediction confidence is too low for controlled ad testing." });
    }
    return;
  }

  if (estimatedRoas === null) errors.push({ field: "estimated_roas", message: "Missing estimated_roas for advertising action." });

  if (isScaleAdsAction(action) && estimatedRoas !== null && estimatedRoas < policy.thresholds.advertising.scaleAds.minimumMarginalRoas) {
    errors.push({ field: "estimated_roas", message: `ROAS ${estimatedRoas} is below scale ads threshold ${policy.thresholds.advertising.scaleAds.minimumMarginalRoas}.` });
  }
  if (isScaleAdsAction(action) && margin !== null && margin < policy.thresholds.advertising.scaleAds.minimumMargin) {
    errors.push({ field: "margin", message: `Margin ${margin} is below scale ads threshold ${policy.thresholds.advertising.scaleAds.minimumMargin}.` });
  }
  if (isScaleAdsAction(action) && confidence !== null && confidence < policy.thresholds.advertising.scaleAds.minimumConfidence) {
    errors.push({ field: "prediction_confidence", message: `Prediction confidence ${confidence} is below scale ads threshold ${policy.thresholds.advertising.scaleAds.minimumConfidence}.` });
  }
  if (action === "REDUCE_ADS" && estimatedRoas !== null && estimatedRoas > policy.thresholds.advertising.reduceAds.roasThreshold) {
    errors.push({ field: "estimated_roas", message: `REDUCE_ADS requires ROAS at or below ${policy.thresholds.advertising.reduceAds.roasThreshold}.` });
  }
}

function validatePricingEvidence(
  decision: DecisionContractCandidate,
  policy: OptimizationPolicy,
  errors: DecisionContractIssue[],
  warnings: DecisionContractIssue[]
) {
  const currentPrice = numberValue(decision.current_price ?? decision.before_state?.price);
  const newPrice = numberValue(decision.new_price ?? decision.simulated_price ?? decision.after_state?.price);
  const priceChange = numberValue(decision.price_change_percentage ?? percentChange(currentPrice, newPrice));
  const elasticityConfidence = numberValue(decision.price_elasticity_confidence ?? decision.demand_elasticity?.confidence);
  const conversionStability = numberValue(decision.conversion_stability ?? decision.confidence_breakdown?.revenue_prediction_confidence);

  if (currentPrice === null) errors.push({ field: "current_price", message: "Missing current_price for pricing action." });
  if (newPrice === null) errors.push({ field: "new_price", message: "Missing new_price for pricing action." });
  if (priceChange === null) errors.push({ field: "price_change_percentage", message: "Missing price_change_percentage for pricing action." });
  if (elasticityConfidence === null) errors.push({ field: "price_elasticity_confidence", message: "Missing price elasticity evidence for pricing action." });
  if (conversionStability === null) errors.push({ field: "conversion_stability", message: "Missing conversion stability evidence for pricing action." });

  if (elasticityConfidence !== null && elasticityConfidence < policy.thresholds.pricing.minimumElasticityConfidence) {
    errors.push({
      field: "price_elasticity_confidence",
      message: `Elasticity confidence ${elasticityConfidence} is below pricing threshold ${policy.thresholds.pricing.minimumElasticityConfidence}.`
    });
  }
  if (conversionStability !== null && conversionStability < policy.thresholds.pricing.minimumConversionStability) {
    errors.push({
      field: "conversion_stability",
      message: `Conversion stability ${conversionStability} is below pricing threshold ${policy.thresholds.pricing.minimumConversionStability}.`
    });
  }
  if (priceChange !== null && priceChange > 0 && decision.market_reference_price == null) {
    warnings.push({ field: "market_reference_price", message: "Market price comparison is unavailable for price increase." });
  }
}

function validateSimulationConsistency(
  decision: DecisionContractCandidate,
  constraints: BusinessConstraintsInput | undefined,
  errors: DecisionContractIssue[],
  warnings: DecisionContractIssue[]
) {
  const currentProfit = numberValue(decision.current_profit ?? decision.before_state?.profit);
  const predictedProfit = numberValue(decision.predicted_profit ?? decision.after_state?.profit);
  const profitDelta = numberValue(decision.predicted_profit_delta ?? decision.profit_delta);
  const predictedRevenue = numberValue(decision.predicted_revenue ?? decision.after_state?.revenue);
  const predictedMargin = numberValue(decision.predicted_margin ?? decision.after_state?.margin);
  const requiredCash = numberValue(decision.required_cash);
  const availableCash = numberValue(decision.available_cash ?? constraints?.available_cash);

  if (currentProfit !== null && predictedProfit !== null && profitDelta !== null) {
    const expectedDelta = roundMoney(predictedProfit - currentProfit);
    if (Math.abs(roundMoney(profitDelta) - expectedDelta) > 0.05) {
      errors.push({ field: "predicted_profit_delta", message: `predicted_profit_delta must equal predicted_profit - current_profit (${expectedDelta}).` });
    }
  }

  if (predictedProfit !== null && predictedRevenue !== null && predictedRevenue > 0 && predictedMargin !== null) {
    const expectedMargin = roundRatio(predictedProfit / predictedRevenue);
    if (Math.abs(roundRatio(predictedMargin) - expectedMargin) > 0.08) {
      warnings.push({ field: "predicted_margin", message: `predicted_margin differs from predicted_profit / predicted_revenue (${expectedMargin}); verify margin basis.` });
    }
  }

  if (availableCash !== null && requiredCash !== null && requiredCash > availableCash) {
    errors.push({ field: "required_cash", message: `required_cash ${requiredCash} exceeds available_cash ${availableCash}.` });
  } else if (requiredCash === null) {
    warnings.push({ field: "required_cash", message: "required_cash is missing; cash consistency could not be checked." });
  }
}

function normalizedAction(decision: DecisionContractCandidate) {
  return String(decision.action ?? decision.canonical_action ?? decision.unified_action ?? "").trim().toUpperCase();
}

function isRestockAction(action: string) {
  return action === "RESTOCK" || action === "RESTOCK_INVENTORY" || action === "RESTOCK_AND_SCALE";
}

function isInventoryReductionAction(action: string) {
  return action === "REDUCE_INVENTORY" || action === "CLEARANCE" || action === "CLEAR_EXCESS_INVENTORY" || action === "REDUCE_WASTE";
}

function isAdvertisingAction(action: string) {
  return action === "SCALE_ADS" || action === "TEST_AD_SPEND" || action === "REDUCE_ADS" || action === "INCREASE_AD_SPEND";
}

function isScaleAdsAction(action: string) {
  return action === "SCALE_ADS" || action === "INCREASE_AD_SPEND";
}

function isPricingAction(action: string) {
  return action === "ADJUST_PRICE" || action === "OPTIMIZE_PRICE" || action === "PRICE_UP" || action === "PRICE_DOWN" || action.startsWith("PRICE_UP_") || action.startsWith("PRICE_DOWN_") || action === "SCALE_ADS_PRICE_UP_5";
}

function inventoryCoverageDays(decision: DecisionContractCandidate) {
  const explicit = numberValue(decision.inventory_coverage_days);
  if (explicit !== null) return explicit;

  const currentInventory = numberValue(decision.current_inventory ?? decision.before_state?.inventory);
  const requiredInventory = numberValue(decision.required_inventory ?? decision.after_state?.inventory_required);
  const horizonDays = numberValue(decision.simulation_horizon?.days) ?? 30;
  if (currentInventory === null || requiredInventory === null || requiredInventory <= 0) return null;

  return roundRatio(currentInventory / Math.max(1, requiredInventory / Math.max(1, horizonDays)));
}

function percentChange(currentValue: number | null, nextValue: number | null) {
  if (currentValue === null || nextValue === null || currentValue <= 0) return null;
  return roundRatio((nextValue - currentValue) / currentValue);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
