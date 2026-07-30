export type CanonicalOptimizationAction =
  | "RESTOCK_INVENTORY"
  | "INCREASE_AD_SPEND"
  | "SCALE_ADS"
  | "REDUCE_ADS"
  | "CLEAR_EXCESS_INVENTORY"
  | "REDUCE_INVENTORY"
  | "ADJUST_PRICE"
  | "STOP_SKU"
  | "HOLD";

export type CanonicalOptimizationGroup = "GROWTH" | "INVENTORY" | "PROFIT" | "PORTFOLIO_HEALTH";
export type NormalizedDecisionAction = CanonicalOptimizationAction | "INCREASE_BUDGET";

export type NormalizedDecisionCategory = "GROWTH" | "INVENTORY" | "PROFIT" | "PORTFOLIO_HEALTH";

export type NormalizedDecision = {
  action: NormalizedDecisionAction;
  category: NormalizedDecisionCategory;
  title: string;
  hasInventoryEvidence: boolean;
  trace: DecisionTrace;
};

export type DecisionEvidence = InventoryRestockEvidenceInput & {
  roas?: number | null;
  margin?: number | null;
  conversionRate?: number | null;
  adBudgetChange?: number | null;
  priceChange?: number | null;
  riskTypes?: DecisionRiskTypes;
};

export type DecisionImpact = {
  expectedProfitChange?: number | null;
  revenueChange?: number | null;
  costChange?: number | null;
};

export type DecisionTrace = {
  originalAction: string | null;
  finalAction: NormalizedDecisionAction;
  validationReason: string;
  rejectedActions: Array<{ action: string; reason: string }>;
  evidence: {
    inventory_gap: number | null;
    current_inventory: number | null;
    required_inventory: number | null;
    inventory_delta: number | null;
    stockout_risk: boolean | string | null;
    roas: number | null;
    ad_budget_change: number | null;
    expected_profit_change: number | null;
  };
};

export type DecisionContract = {
  action: NormalizedDecisionAction;
  category: NormalizedDecisionCategory;
  evidence: DecisionEvidence;
  impact: DecisionImpact;
  confidence: number | null;
  reasoning: string;
  trace: DecisionTrace;
  validation?: {
    status: "PASSED" | "FAILED";
    checked_rules: string[];
    errors?: string[];
    warnings?: string[];
  };
};

export type DecisionRiskTypes = {
  inventory_shortage_risk: boolean;
  execution_risk: number | null;
  model_confidence: number | null;
  business_risk: string | number | null;
};

export const INVENTORY_COVERAGE_RESTOCK_THRESHOLD_DAYS = 14;

export type InventoryRestockEvidenceInput = {
  inventoryRisk?: boolean | null;
  stockoutRisk?: boolean | string | null;
  inventoryGap?: number | null;
  inventoryDelta?: number | null;
  recommendedInventoryChange?: number | null;
  requiredInventory?: number | null;
  currentInventory?: number | null;
  recommendedText?: string | null;
};

export type ValidateDecisionInput = InventoryRestockEvidenceInput & {
  sku?: string | null;
  originalAction?: string | null;
  canonicalAction?: string | null;
  sourceAction?: string | null;
  action?: string | null;
  unifiedAction?: string | null;
  adBudgetChange?: number | null;
  roas?: number | null;
  margin?: number | null;
  conversionRate?: number | null;
  expectedProfitImpact?: number | null;
  revenueChange?: number | null;
  costChange?: number | null;
  priceChange?: number | null;
  displayTitle?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  riskTypes?: DecisionRiskTypes;
};

export function isInventoryRestockRequired(input: InventoryRestockEvidenceInput): boolean {
  const requiredInventory = finiteNumber(input.requiredInventory);
  const currentInventory = finiteNumber(input.currentInventory);
  const hasInventoryPair = requiredInventory !== null && currentInventory !== null;
  const computedInventoryGap = hasInventoryPair ? requiredInventory - currentInventory : null;
  const inventoryGap = finiteNumber(input.inventoryGap) ?? computedInventoryGap;
  const inventoryDelta = finiteNumber(input.inventoryDelta);
  const recommendedInventoryChange = finiteNumber(input.recommendedInventoryChange) ?? inventoryDelta;

  if (hasInventoryPair) return requiredInventory > currentInventory;
  if (inventoryGap !== null) return inventoryGap > 0;
  if (recommendedInventoryChange !== null) return recommendedInventoryChange > 0;

  return false;
}

export function inventoryRestockUnits(input: Pick<InventoryRestockEvidenceInput, "requiredInventory" | "currentInventory">): number {
  const requiredInventory = finiteNumber(input.requiredInventory);
  const currentInventory = finiteNumber(input.currentInventory);
  if (requiredInventory === null || currentInventory === null) return 0;
  return Math.max(0, Math.round(requiredInventory - currentInventory));
}

export function validateDecision(input: ValidateDecisionInput): NormalizedDecision {
  const sourceAction = normalizeAction(input.sourceAction);
  const action = normalizeAction(input.action);
  const unifiedAction = normalizeAction(input.unifiedAction);
  const canonicalAction = normalizeAction(input.canonicalAction);
  const originalAction = normalizeAction(input.originalAction ?? input.canonicalAction ?? input.unifiedAction ?? input.sourceAction ?? input.action) || null;
  const recommendedText = `${input.recommendedText ?? ""}`.toLowerCase();
  const displayTitle = `${input.displayTitle ?? ""}`.toLowerCase();
  const hasInventoryEvidence = isInventoryRestockRequired(input);
  const adBudgetChange = finiteNumber(input.adBudgetChange) ?? 0;
  const roas = finiteNumber(input.roas);
  const expectedProfitImpact = finiteNumber(input.expectedProfitImpact) ?? 0;
  const priceChange = finiteNumber(input.priceChange) ?? 0;
  const hasPricingOpportunity =
    canonicalAction === "ADJUST_PRICE" ||
    unifiedAction === "OPTIMIZE_PRICE" ||
    sourceAction.includes("PRICE") ||
    sourceAction === "PROMOTION_TEST" ||
    priceChange !== 0;
  const hasAdExpansionEvidence =
    adBudgetChange > 0 ||
    sourceAction.includes("SCALE") ||
    action === "SCALE" ||
    unifiedAction === "SCALE_ADS" ||
    canonicalAction === "SCALE_ADS" ||
    recommendedText.includes("advertising") ||
    recommendedText.includes("ads") ||
    displayTitle.includes("scale ads") ||
    (expectedProfitImpact > 0 && roas !== null && roas > 1);

  if (sourceAction === "HOLD" || action === "HOLD" || action === "MONITOR" || canonicalAction === "HOLD" || unifiedAction === "HOLD") {
    return normalized("HOLD", "No valid action cleared validation.");
  }

  if (
    canonicalAction === "RESTOCK_INVENTORY" ||
    sourceAction === "RESTOCK_AND_SCALE" ||
    sourceAction.includes("RESTOCK") ||
    unifiedAction === "RESTOCK"
  ) {
    if (hasInventoryEvidence) return normalized("RESTOCK_INVENTORY", "Inventory shortage evidence is present.");
    if (hasAdExpansionEvidence) return normalized("SCALE_ADS", "No inventory gap detected; growth evidence supports scaling ads.", [{ action: "RESTOCK_INVENTORY", reason: "No inventory gap detected." }]);
    if (hasPricingOpportunity) return normalized("ADJUST_PRICE", "No inventory gap detected; pricing evidence supports price adjustment.", [{ action: "RESTOCK_INVENTORY", reason: "No inventory gap detected." }]);
    return normalized("HOLD", "No inventory gap or stronger alternative evidence detected.", [{ action: "RESTOCK_INVENTORY", reason: "No inventory gap detected." }]);
  }

  if (canonicalAction === "SCALE_ADS" || canonicalAction === "INCREASE_BUDGET" || sourceAction.includes("SCALE") || action === "SCALE" || unifiedAction === "SCALE_ADS") {
    return normalized("SCALE_ADS", "Growth action evidence is present.");
  }

  if (canonicalAction === "CLEAR_EXCESS_INVENTORY" || canonicalAction === "REDUCE_INVENTORY" || sourceAction === "REDUCE_INVENTORY" || unifiedAction === "REDUCE_INVENTORY" || recommendedText.includes("clear excess inventory")) {
    return normalized("REDUCE_INVENTORY", "Inventory reduction action evidence is present.");
  }

  if (hasPricingOpportunity) {
    return normalized("ADJUST_PRICE", "Pricing opportunity evidence is present.");
  }

  if (canonicalAction === "REDUCE_ADS" || sourceAction === "REDUCE_ADS" || action === "REDUCE_ADS" || unifiedAction === "REDUCE_WASTE" || unifiedAction === "REALLOCATE_BUDGET") {
    return normalized("REDUCE_ADS", "Ad efficiency or budget reallocation evidence is present.");
  }

  if (canonicalAction === "STOP_SKU" || sourceAction === "STOP" || unifiedAction === "STOP_SKU") {
    return normalized("STOP_SKU", "Portfolio health evidence supports exiting this SKU.");
  }

  if (hasAdExpansionEvidence) return normalized("SCALE_ADS", "Growth evidence supports scaling ads.");
  return normalized("HOLD", "No valid action evidence detected.");

  function normalized(nextAction: NormalizedDecisionAction, validationReason: string, rejectedActions: DecisionTrace["rejectedActions"] = []): NormalizedDecision {
    return {
      action: nextAction,
      category: decisionCategory(nextAction),
      title: decisionTitle(nextAction),
      hasInventoryEvidence,
      trace: buildDecisionTrace({
        input,
        originalAction,
        finalAction: nextAction,
        validationReason,
        rejectedActions
      })
    };
  }
}

export function normalizeDecision(input: ValidateDecisionInput): NormalizedDecision {
  return validateDecision(input);
}

export function buildDecisionContract(input: ValidateDecisionInput): DecisionContract {
  const normalized = validateDecision(input);
  return {
    action: normalized.action,
    category: normalized.category,
    evidence: {
      inventoryRisk: input.inventoryRisk,
      stockoutRisk: input.stockoutRisk,
      inventoryGap: input.inventoryGap,
      inventoryDelta: input.inventoryDelta,
      recommendedInventoryChange: input.recommendedInventoryChange,
      requiredInventory: input.requiredInventory,
      currentInventory: input.currentInventory,
      recommendedText: input.recommendedText,
      roas: input.roas,
      margin: input.margin,
      conversionRate: input.conversionRate,
      adBudgetChange: input.adBudgetChange,
      priceChange: input.priceChange,
      riskTypes: input.riskTypes
    },
    impact: {
      expectedProfitChange: input.expectedProfitImpact,
      revenueChange: input.revenueChange,
      costChange: input.costChange
    },
    confidence: finiteNumber(input.confidence),
    reasoning: input.reasoning ?? normalized.trace.validationReason,
    trace: normalized.trace
  };
}

export function decisionCategory(action: NormalizedDecisionAction): NormalizedDecisionCategory {
  if (action === "SCALE_ADS" || action === "INCREASE_AD_SPEND" || action === "INCREASE_BUDGET") return "GROWTH";
  if (action === "RESTOCK_INVENTORY" || action === "CLEAR_EXCESS_INVENTORY" || action === "REDUCE_INVENTORY") return "INVENTORY";
  if (action === "ADJUST_PRICE") return "PROFIT";
  return "PORTFOLIO_HEALTH";
}

export function decisionTitle(action: NormalizedDecisionAction): string {
  if (action === "SCALE_ADS" || action === "INCREASE_AD_SPEND" || action === "INCREASE_BUDGET") return "Scale Ads";
  if (action === "RESTOCK_INVENTORY") return "Restock Inventory";
  if (action === "CLEAR_EXCESS_INVENTORY" || action === "REDUCE_INVENTORY") return "Clear Excess Inventory";
  if (action === "ADJUST_PRICE") return "Adjust Price";
  if (action === "REDUCE_ADS") return "Reduce Ad Waste";
  if (action === "STOP_SKU") return "Exit SKU";
  return "No Action Required";
}

export function logDecisionValidationChange(input: { sku?: string | null; originalAction?: string | null; normalized: NormalizedDecision }) {
  const originalAction = normalizeAction(input.originalAction);
  if (!originalAction || originalAction === input.normalized.action) return;
  if (!shouldLogDecisionValidatorChange()) return;
  console.info("[decision-validator]", {
    sku: input.sku ?? null,
    original_action: originalAction,
    final_action: input.normalized.action,
    validation_reason: input.normalized.trace.validationReason,
    timestamp: new Date().toISOString()
  });
}

const DECISION_VALIDATOR_LOG_LIMIT = 20;
let decisionValidatorLogCount = 0;

function shouldLogDecisionValidatorChange() {
  decisionValidatorLogCount += 1;
  if (decisionValidatorLogCount <= DECISION_VALIDATOR_LOG_LIMIT) return true;
  if (decisionValidatorLogCount === DECISION_VALIDATOR_LOG_LIMIT + 1) {
    console.info("[decision-validator]", {
      suppressed: true,
      message: `Further decision validation change logs suppressed after ${DECISION_VALIDATOR_LOG_LIMIT} entries.`,
      timestamp: new Date().toISOString()
    });
  }
  return false;
}

export function canonicalOptimizationAction(input: {
  sourceAction?: string | null;
  action?: string | null;
  unifiedAction?: string | null;
  canonicalAction?: string | null;
  inventoryRisk?: boolean | null;
  requiredInventory?: number | null;
  currentInventory?: number | null;
  recommendedText?: string | null;
}): CanonicalOptimizationAction | null {
  const normalized = normalizeDecision(input);
  if (normalized.action === "INCREASE_BUDGET") return "INCREASE_AD_SPEND";
  return normalized.action;
}

export function isCanonicalOptimizationAction(value: unknown): value is CanonicalOptimizationAction {
  return value === "RESTOCK_INVENTORY" ||
    value === "INCREASE_AD_SPEND" ||
    value === "SCALE_ADS" ||
    value === "REDUCE_ADS" ||
    value === "CLEAR_EXCESS_INVENTORY" ||
    value === "REDUCE_INVENTORY" ||
    value === "ADJUST_PRICE" ||
    value === "STOP_SKU" ||
    value === "HOLD";
}

export function canonicalOptimizationGroup(action: CanonicalOptimizationAction): {
  goal: CanonicalOptimizationGroup;
  actionLabel: string;
} {
  return { goal: decisionCategory(action), actionLabel: decisionTitle(action) };
}

function normalizeAction(value: string | null | undefined) {
  return `${value ?? ""}`.trim().toUpperCase();
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildDecisionTrace(input: {
  input: ValidateDecisionInput;
  originalAction: string | null;
  finalAction: NormalizedDecisionAction;
  validationReason: string;
  rejectedActions: DecisionTrace["rejectedActions"];
}): DecisionTrace {
  const requiredInventory = finiteNumber(input.input.requiredInventory);
  const currentInventory = finiteNumber(input.input.currentInventory);
  const inventoryGap = finiteNumber(input.input.inventoryGap) ??
    (requiredInventory !== null && currentInventory !== null ? requiredInventory - currentInventory : null);

  return {
    originalAction: input.originalAction,
    finalAction: input.finalAction,
    validationReason: input.validationReason,
    rejectedActions: input.rejectedActions,
    evidence: {
      inventory_gap: inventoryGap,
      current_inventory: currentInventory,
      required_inventory: requiredInventory,
      inventory_delta: finiteNumber(input.input.inventoryDelta ?? input.input.recommendedInventoryChange),
      stockout_risk: input.input.stockoutRisk ?? null,
      roas: finiteNumber(input.input.roas),
      ad_budget_change: finiteNumber(input.input.adBudgetChange),
      expected_profit_change: finiteNumber(input.input.expectedProfitImpact)
    }
  };
}
