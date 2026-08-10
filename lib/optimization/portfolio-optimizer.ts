import { solveBudgetAllocation, type PortfolioBudgetPlan } from "@/lib/optimization/budget-allocation-solver";
import { constraintsApplied, groupValidPortfolioSimulations } from "@/lib/optimization/constraint-engine";
import { buildInventoryPlan, inventoryUtilization, type InventoryPlan } from "@/lib/optimization/inventory-constraint-engine";
import { generateOptimizationActions } from "@/lib/optimization/action-generator";
import { detectOptimizationOpportunities } from "@/lib/optimization/opportunity-engine";
import { simulatePricingOptimization, type PricingPlan } from "@/lib/optimization/pricing-simulator";
import { solveGlobalPortfolio } from "@/lib/optimization/portfolio-solver";
import { type DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";
import { assessPortfolioInventoryHealth, assessSelectedInventoryMix, type InventoryHealthAssessment } from "@/lib/optimization/inventory-health-score";
import { classifySkuLifecycles, type SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { buildAIEvidence, type AIEvidenceCard } from "@/lib/decision-intelligence/evidence-engine";
import {
  buildDecisionContract,
  canonicalOptimizationAction,
  isInventoryRestockRequired,
  logDecisionValidationChange,
  validateDecision,
  type CanonicalOptimizationAction,
  type DecisionContract
} from "@/lib/optimization/action-taxonomy";
import { buildScenarioComparison, type AIDecisionSelection, type AIScenario } from "@/lib/optimization/scenario-engine";
import {
  simulateGeneratedActions,
  type PortfolioOptimizationInput,
  type ProfitSimulationResult
} from "@/lib/optimization/profit-simulation-engine";
import {
  validatePortfolioSimulationContracts,
  type DecisionContractValidationMetadata
} from "@/lib/optimization/decision-contract-validator";
import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import { dynamicThresholdProfileFromPolicy } from "@/lib/optimization/policy/optimization-policy";
import { getOptimizationPolicyForInput } from "@/lib/optimization/policy/policy-loader";
import type { OptimizationPolicy, PolicyTrace } from "@/lib/optimization/policy/optimization-policy-types";
import {
  decisionConfidenceEvaluator,
  type DecisionConfidenceResult
} from "@/lib/optimization/decision-confidence-engine";
import { governDecision, type DecisionQuality } from "@/lib/optimization/decision-governance-engine";
import { evaluateDecisionReadiness, type DecisionReadiness } from "@/lib/optimization/decision-readiness-engine";

export type OptimizationActionTiming = {
  action_start_at: string;
  simulation_window_days: number;
  simulation_window_start: string;
  simulation_window_end: string;
  baseline_period_start: string;
  baseline_period_end: string;
  tracking_window_days: number;
  tracking_window_start: string;
  tracking_window_end: string;
  timing_source: "report_generated_at" | "latest_data_date_plus_one" | "accepted_at" | "fallback_today";
  ad_budget_period?: "daily" | "weekly" | "monthly" | "simulation_window";
  inventory_snapshot_at?: string;
};

export type PortfolioRecommendation = {
  sku: string;
  action: string;
  decision_action: DecisionAction;
  skuRole: SkuPortfolioRole;
  recommendedActions: string[];
  current_profit: number;
  predicted_profit: number;
  profit_delta: number;
  confidence: number;
  opportunity_score: number;
  action_score: number;
  risk: number;
  risk_level: string;
  cash_impact: number;
  time_to_impact: string;
  optimization_goal: string;
  unified_action: string;
  canonical_action: CanonicalOptimizationAction | null;
  decision_contract: DecisionContract;
  validation?: DecisionContractValidationMetadata;
  display: ActionDisplayMetadata;
  reasoning: ActionReasoningMetadata;
  opportunity_type?: string;
  evidence_tags: string[];
  lifecycle_stage?: SkuLifecycleStage;
  lifecycle?: SkuLifecycleClassification;
  why: string;
  evidence: string[];
  decisionDrivers: DecisionDriver[];
  causalExplanation: DecisionCausalExplanation;
  simulation: {
    predicted_revenue: number;
    predicted_margin: number;
    current_ads_spend: number;
    recommended_ads_spend: number;
    simulated_price: number;
    required_inventory: number;
    revenue_delta: number;
    cost_delta: number;
    margin_change: number;
    inventory_impact: number;
  };
  simulation_horizon: {
    days: number;
    label: string;
  };
  simulation_estimate?: ProfitSimulationResult["simulation_estimate"];
  timing: OptimizationActionTiming;
  prediction_type: "rule_based" | "statistical" | "ml_model";
  confidence_breakdown: ProfitSimulationResult["confidence_breakdown"];
  decision_confidence?: DecisionConfidenceResult;
  decision_quality?: DecisionQuality;
  decision_readiness?: DecisionReadiness;
  signal_quality?: DecisionConfidenceResult["signal_quality"];
  blocked_signals?: string[];
  required_cash: number;
  strategic_fit: number;
  policy_trace?: PolicyTrace;
  before_state: ProfitSimulationResult["before_state"];
  after_state: ProfitSimulationResult["after_state"];
  scenario_results: Array<{
    action: string;
    profit_delta: number;
    revenue_delta: number;
    confidence: number;
    action_score: number;
    risk: number;
    selected: boolean;
  }>;
  alternative_actions: Array<{
    action: string;
    profit_delta: number;
    confidence: number;
    action_score: number;
    risk_level: string;
  }>;
  ai_evidence: AIEvidenceCard[];
  scenarios: AIScenario[];
  selected_scenario: AIScenario;
  decision_explanation: AIDecisionSelection;
  sku_decision_object: SKUDecisionObject;
};

export type DecisionAction = "SCALE" | "REDUCE" | "OPTIMIZE" | "MONITOR";

export type SkuPortfolioRole = "ACQUISITION" | "PROFIT" | "GROWTH" | "DRAIN";

export type PortfolioAction = {
  skuId: string;
  action: DecisionAction;
  skuRole: SkuPortfolioRole;
  recommendedActions: string[];
  decisionDrivers: DecisionDriver[];
  risks: string[];
  expectedProfitImpact: number;
  confidence: number;
};

export type DecisionDriver = {
  category: string;
  metric: string;
  value: string;
  impact: "positive" | "negative" | "risk";
};

export type DecisionCausalExplanation = {
  evidence: string[];
  businessMeaning: string;
  decision: string;
};

export type DecisionSummary = {
  totalProfitImpact: number;
  scaleCount: number;
  reduceCount: number;
  optimizeCount: number;
  stopCount: number;
  fixCount: number;
  monitorCount: number;
  inventoryRisk: number;
  budgetOpportunity: number;
};

export type PortfolioAllocationRecommendation = {
  current: Array<{ bucket: string; share: number; amount: number }>;
  recommended: Array<{ bucket: string; share: number; amount: number }>;
  narrative: string;
};

export type SKUDecision = {
  skuId: string;
  action: DecisionAction;
  skuRole: SkuPortfolioRole;
  sourceAction: string;
  inventoryRisk: boolean;
  budgetOpportunity: boolean;
  lifecycle_stage?: SkuLifecycleStage;
  lifecycle?: SkuLifecycleClassification;
  expectedProfitImpact: number;
  estimatedProfitImpact: number;
  confidence: number;
  action_score: number;
  risk: number;
  risk_level: string;
  cash_impact: number;
  time_to_impact: string;
  optimization_goal: string;
  unified_action: string;
  canonical_action: CanonicalOptimizationAction | null;
  decision_contract: DecisionContract;
  validation?: DecisionContractValidationMetadata;
  policy_trace?: PolicyTrace;
  display: ActionDisplayMetadata;
  reasoning: ActionReasoningMetadata;
  priority: number;
  reasons: string[];
  decisionDrivers: DecisionDriver[];
  causalExplanation: DecisionCausalExplanation;
  risks: string[];
  comparisonInsights: string[];
  recommendedActions: string[];
  recommendedExecution: string[];
  evidence: {
    margin: number;
    roas: number | null;
    inventoryRunwayDays: number | null;
    revenueDelta: number;
    marginChange: number;
  };
  simulation_horizon: ProfitSimulationResult["simulation_horizon"];
  simulation_estimate?: ProfitSimulationResult["simulation_estimate"];
  timing: OptimizationActionTiming;
  confidence_breakdown: ProfitSimulationResult["confidence_breakdown"];
  decision_confidence?: DecisionConfidenceResult;
  decision_quality?: DecisionQuality;
  decision_readiness?: DecisionReadiness;
  signal_quality?: DecisionConfidenceResult["signal_quality"];
  blocked_signals?: string[];
  constraints_passed: string[];
  ai_evidence: AIEvidenceCard[];
  scenarios: AIScenario[];
  alternative_actions: Array<{
    action: string;
    profit_delta: number;
    confidence: number;
    action_score: number;
    risk_level: string;
  }>;
  selected_scenario: AIScenario;
  decision_explanation: AIDecisionSelection;
  tracking_status: "RECOMMENDED" | "ACCEPTED" | "RUNNING" | "COMPLETED" | "LEARNED";
  feedback: {
    prediction_error: number | null;
    actual_profit_lift: number | null;
    learned: boolean;
  };
  sku_decision_object: SKUDecisionObject;
};

export type SKUDecisionObject = {
  sku: string;
  lifecycle_stage?: SkuLifecycleStage;
  optimization_goal: string;
  action: string;
  display: ActionDisplayMetadata;
  reasoning: ActionReasoningMetadata;
  policy_trace?: PolicyTrace;
  expected_profit_impact: number;
  why_selected: string;
  alternative_actions: SKUDecision["alternative_actions"];
  simulation: {
    predicted_revenue: number;
    predicted_profit: number;
    profit_delta: number;
    confidence: number;
    risk: number;
    cash_impact: number;
    inventory_impact: number;
    time_to_impact: string;
  };
  current_metrics: {
    profit: number;
    revenue: number;
    margin: number;
    roas: number | null;
    stock: number;
    ads_spend: number;
  };
  recommended_action: string;
  evidence: AIEvidenceCard[];
  scenarios: AIScenario[];
  selected_scenario: AIScenario;
  confidence: number;
  decision_confidence?: DecisionConfidenceResult;
  decision_quality?: DecisionQuality;
  decision_readiness?: DecisionReadiness;
  signal_quality?: DecisionConfidenceResult["signal_quality"];
  blocked_signals?: string[];
  tracking_status: "RECOMMENDED" | "ACCEPTED" | "RUNNING" | "COMPLETED" | "LEARNED";
  feedback: {
    prediction_error: number | null;
    actual_profit_lift: number | null;
    learned: boolean;
  };
};

export type ActionDisplayMetadata = {
  title: string;
  icon: string;
  category: string;
  description: string;
  subtitle: string;
  reason: string;
  impact_label: string;
};

export type ActionReasoningMetadata = {
  title: string;
  reasons: Array<{
    signal: string;
    metric: string;
    explanation: string;
  }>;
  summary: string;
};

export type PortfolioRiskAlert = {
  type: "inventory" | "budget" | "confidence" | "margin";
  message: string;
  affectedSkus: string[];
  severity: "low" | "medium" | "high";
};

export type PortfolioExecutionStep = {
  step: number;
  action: DecisionAction;
  description: string;
  skuIds: string[];
  estimatedProfitImpact: number;
};

export type PortfolioOptimizationResult = {
  version: "sku_portfolio_optimization_v2";
  algorithm: "prediction_driven_global_portfolio_solver";
  optimization_summary: {
    input_sku_count: number;
    total_opportunities: number;
    scenarios_tested: number;
    action_distribution: Record<string, number>;
    expected_profit_gain: number;
    current_portfolio_profit: number;
    optimized_portfolio_profit: number;
    total_expected_profit_gain: number;
    selected_sku_count: number;
    ads_budget_used: number;
    inventory_required: number;
    inventory_utilization: number;
    cash_required: number;
    inventory_health: InventoryHealthAssessment;
    clear_inventory_ratio: number;
    clear_inventory_impact_ratio: number;
    clear_inventory_cash_recovery_ratio: number;
    max_allowed_clear_inventory_ratio: number;
    inventory_risk_level: InventoryHealthAssessment["inventory_risk_level"];
    simulation_horizon_days: number;
    constraints_applied: string[];
  };
  prediction_summary: {
    simulation_source: "prediction_model";
    models_used: string[];
    prediction_type: "rule_based" | "statistical" | "ml_model";
    prediction_confidence: number;
  };
  optimization_policy: OptimizationPolicy;
  threshold_profile: DynamicThresholdProfile;
  recommended_portfolio: PortfolioRecommendation[];
  portfolioSummary: DecisionSummary;
  lifecycleSummary: LifecycleSummary;
  lifecycleClassifications: SkuLifecycleClassification[];
  allocationRecommendation: PortfolioAllocationRecommendation;
  skuDecisions: SKUDecision[];
  riskAlerts: PortfolioRiskAlert[];
  executionPlan: PortfolioExecutionStep[];
  budget_plan: PortfolioBudgetPlan[];
  pricing_plan: PricingPlan[];
  inventory_plan: InventoryPlan[];
  total_expected_profit_gain: number;
  optimization_confidence: number;
  greedy_single_sku_baseline: {
    sku: string | null;
    profit_delta: number;
  };
  simulations: ProfitSimulationResult[];
};

export type LifecycleSummary = {
  totalSkus: number;
  launch: number;
  growth: number;
  mature: number;
  declining: number;
  unknown: number;
  insufficientHistory: number;
};

const MAX_OPTIMIZATION_SKU_CANDIDATES = 320;

export function optimizeSkuPortfolio(input: PortfolioOptimizationInput): PortfolioOptimizationResult {
  const optimizationInput = limitOptimizationInput(input);
  const optimizationPolicy = getOptimizationPolicyForInput(optimizationInput);
  const thresholdProfile = dynamicThresholdProfileFromPolicy(optimizationPolicy);
  const lifecycleClassifications = classifySkuLifecycles({
    skus: optimizationInput.skus,
    ads: optimizationInput.ads ?? [],
    policy: optimizationPolicy
  });
  const lifecycleBySku = new Map(lifecycleClassifications.map((row) => [row.sku, row]));
  const opportunities = detectOptimizationOpportunities(optimizationInput.skus, thresholdProfile);
  const generatedActions = generateOptimizationActions({
    skus: optimizationInput.skus,
    opportunities,
    lifecycleBySku,
    thresholdProfile,
    policy: optimizationPolicy
  });
  const simulatedActions = applyDecisionConfidenceGate(simulateGeneratedActions({
    skus: optimizationInput.skus,
    ads: optimizationInput.ads ?? [],
    actions: generatedActions,
    simulationHorizonDays: optimizationInput.constraints.simulation_horizon_days ?? 30,
    lifecycleBySku,
    thresholdProfile
  }), optimizationInput, optimizationPolicy);
  const contractValidation = validatePortfolioSimulationContracts(simulatedActions, {
    policy: optimizationPolicy,
    constraints: optimizationInput.constraints,
    logger: logDecisionContractRejection
  });
  const simulations = applyOptimizationQueueEligibilityGate(contractValidation.valid, optimizationInput, optimizationPolicy);
  const validBySku = groupValidPortfolioSimulations(optimizationInput, simulations, optimizationPolicy);
  const selected = solveGlobalPortfolio(validBySku, optimizationInput, optimizationPolicy);
  const selectedDecisionRows = selected.rows;
  const selectedRows = selectedDecisionRows.filter((row) => row.action !== "STOP");
  const currentPortfolioProfit = roundCurrency(input.skus.reduce((sum, sku) => sum + sku.net_profit, 0));
  const totalGain = roundCurrency(selected.delta);
  const optimizedPortfolioProfit = roundCurrency(currentPortfolioProfit + totalGain);
  const budgetPlan = solveBudgetAllocation({
    simulations,
    ads: optimizationInput.ads ?? [],
    constraints: optimizationInput.constraints
  });
  const pricingPlan = simulatePricingOptimization(optimizationInput.skus)
    .filter((plan) => Math.abs((plan.optimal_price - plan.current_price) / Math.max(1, plan.current_price)) <= optimizationInput.constraints.max_price_change);
  const inventoryPlan = buildInventoryPlan(optimizationInput.skus, simulations, optimizationInput.constraints);
  const greedyBaseline = bestSingleSkuBaseline(validBySku);
  const confidence = selectedRows.length
    ? selectedRows.reduce((sum, row) => sum + row.confidence, 0) / selectedRows.length
    : 0;
  const portfolioRecommendations = selectedRows
    .sort((left, right) => right.action_score - left.action_score || right.opportunity_score - left.opportunity_score || left.sku.localeCompare(right.sku))
    .map((row) => toRecommendation(row, simulations));
  const skuDecisions = buildSkuDecisions(selectedDecisionRows, simulations);
  const portfolioSummary = buildDecisionSummary({
    rows: selectedDecisionRows,
    simulations,
    totalGain,
    constraints: input.constraints
  });
  const selectedInventoryMix = assessSelectedInventoryMix(selectedRows);

  return {
    version: "sku_portfolio_optimization_v2",
    algorithm: "prediction_driven_global_portfolio_solver",
    optimization_summary: {
      input_sku_count: input.skus.length,
      total_opportunities: selectedRows.length,
      scenarios_tested: simulations.length,
      action_distribution: actionDistribution(selectedRows),
      expected_profit_gain: totalGain,
      current_portfolio_profit: currentPortfolioProfit,
      optimized_portfolio_profit: optimizedPortfolioProfit,
      total_expected_profit_gain: totalGain,
      selected_sku_count: selectedRows.length,
      ads_budget_used: roundCurrency(selectedRows.reduce((sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend), 0)),
      inventory_required: selectedRows.reduce((sum, row) => sum + row.required_inventory, 0),
      inventory_utilization: inventoryUtilization(selectedRows, input.constraints.inventory_capacity),
      cash_required: roundCurrency(selectedRows.reduce((sum, row) => sum + row.required_cash, 0)),
      inventory_health: assessPortfolioInventoryHealth(optimizationInput.skus),
      clear_inventory_ratio: selectedInventoryMix.clear_inventory_ratio,
      clear_inventory_impact_ratio: selectedInventoryMix.clear_inventory_impact_ratio,
      clear_inventory_cash_recovery_ratio: selectedInventoryMix.clear_inventory_cash_recovery_ratio,
      max_allowed_clear_inventory_ratio: selectedInventoryMix.max_clear_inventory_ratio,
      inventory_risk_level: selectedInventoryMix.inventory_risk_level,
      simulation_horizon_days: optimizationInput.constraints.simulation_horizon_days ?? 30,
      constraints_applied: constraintsApplied(input)
    },
    prediction_summary: {
      simulation_source: "prediction_model",
      models_used: Array.from(new Set(simulations.flatMap((row) => row.prediction_models))),
      prediction_type: simulations[0]?.prediction_type ?? "rule_based",
      prediction_confidence: roundRatio(confidence)
    },
    optimization_policy: optimizationPolicy,
    threshold_profile: thresholdProfile,
    recommended_portfolio: portfolioRecommendations,
    portfolioSummary,
    lifecycleSummary: buildLifecycleSummary(lifecycleClassifications, input.skus.length),
    lifecycleClassifications,
    allocationRecommendation: buildAllocationRecommendation({
      rows: selectedDecisionRows,
      input,
      budgetPlan
    }),
    skuDecisions,
    riskAlerts: buildRiskAlerts(selectedDecisionRows),
    executionPlan: buildExecutionPlan(skuDecisions),
    budget_plan: budgetPlan,
    pricing_plan: pricingPlan,
    inventory_plan: inventoryPlan,
    total_expected_profit_gain: totalGain,
    optimization_confidence: roundRatio(Math.max(0.35, Math.min(0.95, confidence))),
    greedy_single_sku_baseline: greedyBaseline,
    simulations
  };
}

function limitOptimizationInput(input: PortfolioOptimizationInput): PortfolioOptimizationInput {
  if (input.skus.length <= MAX_OPTIMIZATION_SKU_CANDIDATES) {
    return input;
  }

  const rankedSkus = input.skus
    .slice()
    .sort((left, right) => optimizationSkuScore(right) - optimizationSkuScore(left))
    .slice(0, MAX_OPTIMIZATION_SKU_CANDIDATES);

  const candidateSkuSet = new Set(rankedSkus.map((sku) => sku.sku));

  return {
    ...input,
    skus: rankedSkus,
    ads: (input.ads ?? []).filter((row) => !row.sku || candidateSkuSet.has(row.sku)),
    constraints: {
      ...input.constraints,
      inventory_capacity: Math.max(1, rankedSkus.reduce((sum, row) => sum + row.inventory, 0))
    }
  };
}

function applyDecisionConfidenceGate(
  rows: ProfitSimulationResult[],
  input: PortfolioOptimizationInput,
  policy: OptimizationPolicy
): ProfitSimulationResult[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));

  return rows.map((row) => {
    const sku = skuById.get(row.sku);
    if (!sku) return row;
    const decisionConfidence = decisionConfidenceEvaluator({ sku, simulation: row, policy });
    const governance = governDecision({
      action: row.action,
      unifiedAction: row.unified_action,
      simulation: row,
      confidence: decisionConfidence
    });
    const readiness = evaluateDecisionReadiness({
      sku,
      action: row.action,
      unifiedAction: row.unified_action,
      confidence: decisionConfidence,
      governance
    });
    if (governance.allowed) {
      return {
        ...row,
        decision_confidence: decisionConfidence,
        decision_quality: governance.decision_quality,
        decision_readiness: readiness,
        confidence: Math.min(row.confidence, Math.max(0.35, decisionConfidence.overall_confidence_score))
      };
    }

    const blockedEvidence = [
      ...row.evidence,
      `decision_confidence=${decisionConfidence.confidence_level}`,
      ...governance.decision_quality.blocked_signals.map((reason) => `blocked=${reason}`)
    ];

    return {
      ...row,
      selected: false,
      decision_confidence: decisionConfidence,
      decision_quality: governance.decision_quality,
      decision_readiness: readiness,
      confidence: Math.min(row.confidence, decisionConfidence.overall_confidence_score),
      action_score: 0,
      opportunity_score: 0,
      risk: Math.max(row.risk, 0.72),
      risk_level: "High",
      evidence: Array.from(new Set(blockedEvidence)),
      evidence_tags: Array.from(new Set([...row.evidence_tags, "decision_confidence_blocked"])),
      policy_trace: row.policy_trace ? {
        ...row.policy_trace,
        failedRules: Array.from(new Set([
          ...(row.policy_trace.failedRules ?? []),
          ...governance.decision_quality.blocked_signals
        ]))
      } : row.policy_trace
    };
  });
}

const MIN_INCREMENTAL_NET_PROFIT_ROI = 0.2;
const LOW_ATTRIBUTION_CONFIDENCE_CUTOFF = 0.55;
const UNIFORM_BUDGET_SPREAD_MIN_SKUS = 10;
const UNIFORM_BUDGET_SPREAD_COVERAGE_RATIO = 0.75;
const UNIFORM_BUDGET_SPREAD_KEEP_RATIO = 0.25;

function applyOptimizationQueueEligibilityGate(
  rows: ProfitSimulationResult[],
  input: PortfolioOptimizationInput,
  policy: OptimizationPolicy
): ProfitSimulationResult[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));
  const eligibleRows = rows.filter((row) => {
    if (row.profit_delta <= 0) return false;

    const sku = skuById.get(row.sku);
    const currentMargin = sku?.margin ?? row.before_state.margin;
    if (currentMargin <= 0 || row.predicted_margin <= 0) return false;

    if (!isIncrementalAdsOptimizationAction(row)) return true;

    const additionalAdSpend = additionalAdSpendForSimulation(row);
    if (additionalAdSpend <= 0) return false;
    if (row.profit_delta / additionalAdSpend < MIN_INCREMENTAL_NET_PROFIT_ROI) return false;
    if (!hasEnoughInventoryForAdScaling(row, sku, policy)) return false;
    if (attributionConfidenceForSimulation(row, sku) < LOW_ATTRIBUTION_CONFIDENCE_CUTOFF) return false;
    if (sku?.roas_confidence === "LOW") return false;

    return true;
  });

  return removeUniformBudgetSpreadRows(eligibleRows, input);
}

function isIncrementalAdsOptimizationAction(row: ProfitSimulationResult) {
  return [
    "TEST_AD_SPEND",
    "SCALE_ADS",
    "SCALE_ADS_PRICE_UP_5",
    "RESTOCK_AND_SCALE",
    "SHIFT_CHANNEL",
    "CREATE_BUNDLE"
  ].includes(row.action) || row.unified_action === "SCALE_ADS" || row.unified_action === "EXPAND_CHANNEL";
}

function additionalAdSpendForSimulation(row: ProfitSimulationResult) {
  return roundCurrency(Math.max(0, row.recommended_ads_spend - row.current_ads_spend));
}

function attributionConfidenceForSimulation(
  row: ProfitSimulationResult,
  sku: PortfolioOptimizationInput["skus"][number] | undefined
) {
  return row.confidence_breakdown.attribution_confidence ?? sku?.attribution_confidence ?? sku?.prediction_confidence ?? 0;
}

function hasEnoughInventoryForAdScaling(
  row: ProfitSimulationResult,
  sku: PortfolioOptimizationInput["skus"][number] | undefined,
  policy: OptimizationPolicy
) {
  if (row.current_inventory < row.required_inventory) return false;
  if (!sku || sku.sales_velocity <= 0) return row.current_inventory > 0;

  const coverageDays = sku.inventory / Math.max(0.1, sku.sales_velocity);
  const minimumCoverageDays = Math.min(
    row.simulation_horizon.days,
    policy.thresholds.advertising.scaleAds.minimumInventoryCoverageDays
  );

  return coverageDays >= minimumCoverageDays;
}

function removeUniformBudgetSpreadRows(
  rows: ProfitSimulationResult[],
  input: PortfolioOptimizationInput
) {
  const scaleRows = rows.filter((row) => isIncrementalAdsOptimizationAction(row) && additionalAdSpendForSimulation(row) > 0);
  const skuCount = Math.max(1, new Set(input.skus.map((sku) => sku.sku)).size);
  const distinctBudgetDeltas = new Set(scaleRows.map((row) => Math.round(additionalAdSpendForSimulation(row))));
  const looksLikeUniformBudgetSpread =
    scaleRows.length >= UNIFORM_BUDGET_SPREAD_MIN_SKUS &&
    scaleRows.length / skuCount >= UNIFORM_BUDGET_SPREAD_COVERAGE_RATIO &&
    distinctBudgetDeltas.size <= 2;

  if (!looksLikeUniformBudgetSpread) return rows;

  const keepCount = Math.max(3, Math.ceil(skuCount * UNIFORM_BUDGET_SPREAD_KEEP_RATIO));
  const keepKeys = new Set(scaleRows
    .slice()
    .sort((left, right) => {
      const leftSpend = additionalAdSpendForSimulation(left);
      const rightSpend = additionalAdSpendForSimulation(right);
      const leftRoi = leftSpend > 0 ? left.profit_delta / leftSpend : 0;
      const rightRoi = rightSpend > 0 ? right.profit_delta / rightSpend : 0;

      return rightRoi - leftRoi ||
        right.profit_delta - left.profit_delta ||
        right.confidence - left.confidence ||
        left.sku.localeCompare(right.sku);
    })
    .slice(0, keepCount)
    .map((row) => optimizationSimulationKey(row)));

  return rows.filter((row) => !isIncrementalAdsOptimizationAction(row) || keepKeys.has(optimizationSimulationKey(row)));
}

function optimizationSimulationKey(row: ProfitSimulationResult) {
  return `${row.sku}:${row.action}:${row.generated_action ?? ""}:${row.recommended_ads_spend}:${row.profit_delta}`;
}

function optimizationSkuScore(sku: PortfolioOptimizationInput["skus"][number]) {
  const confidence = sku.prediction_confidence ?? 0.55;
  const marginScore = Math.max(0, sku.margin) * 2000;
  const profitScore = Math.max(0, sku.net_profit);
  const revenueScore = Math.max(0, sku.revenue) * 0.15;
  const stockScore = sku.inventory > 0 && sku.sales_velocity > 0 ? 120 : 0;

  return (profitScore + revenueScore + marginScore + stockScore) * Math.max(0.25, confidence);
}

function toRecommendation(row: ProfitSimulationResult, simulations: ProfitSimulationResult[]): PortfolioRecommendation {
  const decision = classifyDecisionAction(row);
  const skuRole = classifySkuRole(row, decision);
  const timing = buildActionTiming(row);
  const skuScenarios = buildScenarioComparison({
    selected: row,
    candidates: simulations.filter((scenario) => scenario.sku === row.sku)
  });
  const inventoryRisk = isInventoryRiskRow(row);
  const validatorInput = decisionValidatorInput(row, decision, inventoryRisk);
  const normalizedDecision = validateDecision(validatorInput);
  logDecisionValidationChange({ sku: row.sku, originalAction: validatorInput.originalAction, normalized: normalizedDecision });
  const canonicalAction = canonicalOptimizationAction(validatorInput);
  const decisionContract = withDecisionContractValidation(buildDecisionContract(validatorInput), row.validation);
  const aiEvidence = buildAIEvidence({
    simulation: row,
    portfolioMarginBenchmark: portfolioMarginBenchmark(simulations),
    lifecycle: row.lifecycle
  });
  const display = buildActionDisplayMetadata(row);
  const reasoning = buildActionReasoningMetadata(row);
  const skuDecisionObject = buildSkuDecisionObject(row, aiEvidence, skuScenarios);

  return {
    sku: row.sku,
    action: row.action,
    decision_action: decision,
    skuRole,
    recommendedActions: buildRecommendedActions(row, decision),
    current_profit: row.current_profit,
    predicted_profit: row.predicted_profit,
    profit_delta: row.profit_delta,
    confidence: row.confidence,
    opportunity_score: row.opportunity_score,
    action_score: row.action_score,
    risk: row.risk,
    risk_level: row.risk_level,
    cash_impact: row.cash_impact,
    time_to_impact: row.time_to_impact,
    optimization_goal: row.optimization_goal,
    unified_action: row.unified_action,
    canonical_action: canonicalAction,
    decision_contract: decisionContract,
    validation: row.validation,
    display,
    reasoning,
    opportunity_type: row.opportunity_type,
    evidence_tags: row.evidence_tags,
    lifecycle_stage: row.lifecycle_stage,
    lifecycle: row.lifecycle,
    why: row.why,
    evidence: row.evidence,
    decisionDrivers: buildDecisionDrivers(row, decision),
    causalExplanation: buildCausalExplanation(row, decision),
    simulation: {
      predicted_revenue: row.predicted_revenue,
      predicted_margin: row.predicted_margin,
      current_ads_spend: row.current_ads_spend,
      recommended_ads_spend: row.recommended_ads_spend,
      simulated_price: row.simulated_price,
      required_inventory: row.required_inventory,
      revenue_delta: row.revenue_delta,
      cost_delta: row.cost_delta,
      margin_change: row.margin_change,
      inventory_impact: row.inventory_impact
    },
    simulation_horizon: row.simulation_horizon,
    simulation_estimate: row.simulation_estimate,
    timing,
    prediction_type: row.prediction_type,
    confidence_breakdown: row.confidence_breakdown,
    decision_confidence: row.decision_confidence,
    decision_quality: row.decision_quality,
    decision_readiness: row.decision_readiness,
    signal_quality: row.decision_confidence?.signal_quality,
    blocked_signals: row.decision_quality?.blocked_signals ?? row.decision_confidence?.blocked_signals,
    required_cash: row.required_cash,
    strategic_fit: row.strategic_fit,
    policy_trace: row.policy_trace,
    before_state: row.before_state,
    after_state: row.after_state,
    scenario_results: simulations
      .filter((scenario) => scenario.sku === row.sku)
      .sort((left, right) => right.action_score - left.action_score || right.opportunity_score - left.opportunity_score)
      .slice(0, 4)
      .map((scenario) => ({
        action: scenario.action,
        profit_delta: scenario.profit_delta,
        revenue_delta: scenario.revenue_delta,
        confidence: scenario.confidence,
        action_score: scenario.action_score,
        risk: scenario.risk,
        selected: scenario.action === row.action
      })),
    alternative_actions: alternativeActions(row, simulations),
    ai_evidence: aiEvidence,
    scenarios: skuScenarios.scenarios,
    selected_scenario: skuScenarios.selected_scenario,
    decision_explanation: skuScenarios.decision_explanation,
    sku_decision_object: skuDecisionObject
  };
}

function buildDecisionSummary(input: {
  rows: ProfitSimulationResult[];
  simulations: ProfitSimulationResult[];
  totalGain: number;
  constraints: PortfolioOptimizationInput["constraints"];
}): DecisionSummary {
  const counts = countDecisionActions(input.rows);
  const inventoryRiskRows = input.rows.filter(isInventoryRiskRow);
  const scalableBudgetOpportunity = input.rows.reduce(
    (sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend),
    0
  );
  const reducibleBudgetOpportunity = input.simulations
    .filter((row) => classifyDecisionAction(row) === "REDUCE" || row.action === "REDUCE_ADS")
    .reduce((sum, row) => sum + Math.max(0, row.current_ads_spend - row.recommended_ads_spend), 0);

  return {
    totalProfitImpact: roundCurrency(input.totalGain),
    scaleCount: counts.SCALE,
    reduceCount: counts.REDUCE,
    optimizeCount: counts.OPTIMIZE,
    stopCount: counts.REDUCE,
    fixCount: counts.OPTIMIZE,
    monitorCount: counts.MONITOR,
    inventoryRisk: inventoryRiskRows.length,
    budgetOpportunity: roundCurrency(Math.min(input.constraints.total_ads_budget, scalableBudgetOpportunity + reducibleBudgetOpportunity))
  };
}

function actionDistribution(rows: ProfitSimulationResult[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.unified_action] = (counts[row.unified_action] ?? 0) + 1;
    return counts;
  }, {
    SCALE_ADS: 0,
    EXPAND_CHANNEL: 0,
    OPTIMIZE_PRICE: 0,
    REALLOCATE_BUDGET: 0,
    RESTOCK: 0,
    REDUCE_INVENTORY: 0,
    REDUCE_WASTE: 0,
    STOP_SKU: 0
  });
}

function alternativeActions(row: ProfitSimulationResult, simulations: ProfitSimulationResult[]) {
  return simulations
    .filter((scenario) => scenario.sku === row.sku && scenario.action !== row.action)
    .sort((left, right) => right.action_score - left.action_score || right.profit_delta - left.profit_delta)
    .slice(0, 4)
    .map((scenario) => ({
      action: scenario.action,
      profit_delta: scenario.profit_delta,
      confidence: scenario.confidence,
      action_score: scenario.action_score,
      risk_level: scenario.risk_level
    }));
}

function buildLifecycleSummary(classifications: SkuLifecycleClassification[], fallbackTotal: number): LifecycleSummary {
  return {
    totalSkus: fallbackTotal,
    launch: classifications.filter((row) => row.lifecycle_stage === "LAUNCH").length,
    growth: classifications.filter((row) => row.lifecycle_stage === "GROWTH").length,
    mature: classifications.filter((row) => row.lifecycle_stage === "MATURE").length,
    declining: classifications.filter((row) => row.lifecycle_stage === "DECLINING").length,
    unknown: classifications.filter((row) => row.lifecycle_stage === "UNKNOWN").length,
    insufficientHistory: classifications.filter((row) => row.lifecycle_stage === "INSUFFICIENT_HISTORY").length
  };
}

function isInventoryRiskRow(row: ProfitSimulationResult) {
  return row.required_inventory > row.current_inventory;
}

function withDecisionContractValidation(
  contract: DecisionContract,
  validation?: DecisionContractValidationMetadata
): DecisionContract {
  return {
    ...contract,
    validation: validation ?? {
      status: "PASSED",
      checked_rules: ["decision_contract_validator_not_available"]
    }
  };
}

function logDecisionContractRejection(input: {
  sku: string;
  action: string;
  validation: DecisionContractValidationMetadata;
  timestamp: string;
}) {
  if (!shouldLogDecisionContractRejection()) return;
  const reason = input.validation.errors?.join("; ") ?? "Unknown validation failure.";
  console.warn(JSON.stringify({
    event: "decision_contract_rejected",
    sku: input.sku,
    action: input.action,
    validation_reason: reason,
    timestamp: input.timestamp
  }));
}

const DECISION_CONTRACT_REJECTION_LOG_LIMIT = 20;
let decisionContractRejectionLogCount = 0;

function shouldLogDecisionContractRejection() {
  decisionContractRejectionLogCount += 1;
  if (decisionContractRejectionLogCount <= DECISION_CONTRACT_REJECTION_LOG_LIMIT) return true;
  if (decisionContractRejectionLogCount === DECISION_CONTRACT_REJECTION_LOG_LIMIT + 1) {
    console.warn(JSON.stringify({
      event: "decision_contract_rejected_suppressed",
      suppressed_after: DECISION_CONTRACT_REJECTION_LOG_LIMIT,
      timestamp: new Date().toISOString()
    }));
  }
  return false;
}

function isRestockInventoryAction(row: ProfitSimulationResult) {
  return isInventoryRestockRequired({
    requiredInventory: row.required_inventory,
    currentInventory: row.current_inventory,
    inventoryDelta: row.inventory_impact
  });
}

function decisionValidatorInput(row: ProfitSimulationResult, decision: DecisionAction, inventoryShortageRisk: boolean) {
  return {
    sku: row.sku,
    originalAction: candidateCanonicalActionForSimulation(row),
    sourceAction: row.action,
    action: decision,
    unifiedAction: row.unified_action,
    inventoryRisk: inventoryShortageRisk,
    requiredInventory: row.required_inventory,
    currentInventory: row.current_inventory,
    inventoryGap: row.required_inventory - row.current_inventory,
    inventoryDelta: row.inventory_impact,
    adBudgetChange: row.recommended_ads_spend - row.current_ads_spend,
    roas: row.current_ads_spend > 0 ? roundRatio(row.before_state.revenue / Math.max(1, row.current_ads_spend)) : null,
    margin: row.before_state.margin,
    conversionRate: null,
    expectedProfitImpact: row.profit_delta,
    revenueChange: row.revenue_delta,
    costChange: row.cost_delta,
    priceChange: row.current_price > 0 ? roundRatio((row.simulated_price - row.current_price) / row.current_price) : 0,
    confidence: row.confidence,
    reasoning: row.why,
    recommendedText: row.evidence.join(" "),
    riskTypes: {
      inventory_shortage_risk: inventoryShortageRisk,
      execution_risk: row.risk,
      model_confidence: row.confidence,
      business_risk: row.risk_level
    }
  };
}

function candidateCanonicalActionForSimulation(row: ProfitSimulationResult) {
  if (row.action === "RESTOCK_AND_SCALE" || row.unified_action === "RESTOCK") return "RESTOCK_INVENTORY";
  if (row.action === "SCALE_ADS" || row.action === "SCALE_ADS_PRICE_UP_5" || row.action === "TEST_AD_SPEND") return "SCALE_ADS";
  if (row.action === "SHIFT_CHANNEL" || row.action === "CREATE_BUNDLE") return "SCALE_ADS";
  if (row.action === "PRICE_UP_5" || row.action === "PRICE_UP_10" || row.action === "PRICE_DOWN_10" || row.action === "PROMOTION_TEST" || row.unified_action === "OPTIMIZE_PRICE") return "ADJUST_PRICE";
  if (row.action === "REDUCE_INVENTORY" || row.unified_action === "REDUCE_INVENTORY") return "REDUCE_INVENTORY";
  if (row.action === "REDUCE_ADS" || row.unified_action === "REALLOCATE_BUDGET" || row.unified_action === "REDUCE_WASTE") return "REDUCE_ADS";
  if (row.action === "STOP" || row.unified_action === "STOP_SKU") return "STOP_SKU";
  return "HOLD";
}

function hasBudgetOpportunity(row: ProfitSimulationResult) {
  return Math.max(0, row.recommended_ads_spend - row.current_ads_spend) > 0
    || Math.max(0, row.current_ads_spend - row.recommended_ads_spend) > 0
    || row.action.includes("AD");
}

function buildSkuDecisions(rows: ProfitSimulationResult[], simulations: ProfitSimulationResult[]): SKUDecision[] {
  const ranked = rows
    .slice()
    .sort((left, right) => right.action_score - left.action_score || right.opportunity_score - left.opportunity_score || right.profit_delta - left.profit_delta);

  return ranked.map((row, index) => {
    const decision = classifyDecisionAction(row);
    const skuRole = classifySkuRole(row, decision);
    const inventoryRisk = isInventoryRiskRow(row);
    const validatorInput = decisionValidatorInput(row, decision, inventoryRisk);
    const normalizedDecision = validateDecision(validatorInput);
    logDecisionValidationChange({ sku: row.sku, originalAction: validatorInput.originalAction, normalized: normalizedDecision });
    const canonicalAction = canonicalOptimizationAction(validatorInput);
    const decisionContract = withDecisionContractValidation(buildDecisionContract(validatorInput), row.validation);
    const skuScenarios = buildScenarioComparison({
      selected: row,
      candidates: simulations.filter((scenario) => scenario.sku === row.sku)
    });
    const aiEvidence = buildAIEvidence({
      simulation: row,
      portfolioMarginBenchmark: portfolioMarginBenchmark(simulations),
      lifecycle: row.lifecycle
    });
    const skuDecisionObject = buildSkuDecisionObject(row, aiEvidence, skuScenarios);
    const display = buildActionDisplayMetadata(row);
    const reasoning = buildActionReasoningMetadata(row);
    const alternatives = simulations
      .filter((scenario) => scenario.sku === row.sku && scenario.action !== row.action)
      .sort((left, right) => right.opportunity_score - left.opportunity_score)
      .slice(0, 2);
    const betterRows = ranked.filter((candidate) => candidate.sku !== row.sku && candidate.opportunity_score > row.opportunity_score).slice(0, 2);

    return {
      skuId: row.sku,
      action: decision,
      skuRole,
      sourceAction: row.action,
      inventoryRisk,
      budgetOpportunity: hasBudgetOpportunity(row),
      lifecycle_stage: row.lifecycle_stage,
      lifecycle: row.lifecycle,
      expectedProfitImpact: roundCurrency(row.profit_delta),
      estimatedProfitImpact: roundCurrency(row.profit_delta),
      confidence: row.confidence,
      action_score: row.action_score,
      risk: row.risk,
      risk_level: row.risk_level,
      cash_impact: row.cash_impact,
      time_to_impact: row.time_to_impact,
      optimization_goal: row.optimization_goal,
      unified_action: row.unified_action,
      canonical_action: canonicalAction,
      decision_contract: decisionContract,
      validation: row.validation,
      policy_trace: row.policy_trace,
      display,
      reasoning,
      priority: index + 1,
      reasons: buildDecisionReasons(row, decision),
      decisionDrivers: buildDecisionDrivers(row, decision),
      causalExplanation: buildCausalExplanation(row, decision),
      risks: buildDecisionRisks(row),
      comparisonInsights: buildComparisonInsights(row, alternatives, betterRows),
      recommendedActions: buildRecommendedActions(row, decision),
      recommendedExecution: buildRecommendedExecution(row, decision),
      evidence: {
        margin: row.before_state.margin,
        roas: row.current_ads_spend > 0 ? roundRatio(row.before_state.revenue / Math.max(1, row.current_ads_spend)) : null,
        inventoryRunwayDays: row.current_inventory > 0 && row.required_inventory > 0
          ? roundRatio(row.current_inventory / Math.max(1, row.required_inventory / 30))
          : null,
        revenueDelta: row.revenue_delta,
        marginChange: row.margin_change
      },
      simulation_horizon: row.simulation_horizon,
      simulation_estimate: row.simulation_estimate,
      timing: buildActionTiming(row),
      confidence_breakdown: row.confidence_breakdown,
      decision_confidence: row.decision_confidence,
      decision_quality: row.decision_quality,
      decision_readiness: row.decision_readiness,
      signal_quality: row.decision_confidence?.signal_quality,
      blocked_signals: row.decision_quality?.blocked_signals ?? row.decision_confidence?.blocked_signals,
      constraints_passed: buildConstraintsPassed(row),
      ai_evidence: aiEvidence,
      scenarios: skuScenarios.scenarios,
      alternative_actions: alternativeActions(row, simulations),
      selected_scenario: skuScenarios.selected_scenario,
      decision_explanation: skuScenarios.decision_explanation,
      tracking_status: "RECOMMENDED",
      feedback: {
        prediction_error: null,
        actual_profit_lift: null,
        learned: false
      },
      sku_decision_object: skuDecisionObject
    };
  });
}

function buildSkuDecisionObject(
  row: ProfitSimulationResult,
  evidence: AIEvidenceCard[],
  scenarioComparison: ReturnType<typeof buildScenarioComparison>
): SKUDecisionObject {
  const roas = row.current_ads_spend > 0 ? roundRatio(row.before_state.revenue / Math.max(1, row.current_ads_spend)) : null;
  const display = buildActionDisplayMetadata(row);
  const reasoning = buildActionReasoningMetadata(row);

  return {
    sku: row.sku,
    lifecycle_stage: row.lifecycle_stage,
    optimization_goal: row.optimization_goal,
    action: row.unified_action,
    display,
    reasoning,
    policy_trace: row.policy_trace,
    expected_profit_impact: row.profit_delta,
    why_selected: scenarioComparison.decision_explanation.selection_reason,
    alternative_actions: scenarioComparison.scenarios
      .filter((scenario) => !scenario.selected)
      .map((scenario) => ({
        action: scenario.action,
        profit_delta: scenario.expected_profit_lift,
        confidence: scenario.confidence,
        action_score: scenario.action_score,
        risk_level: scenario.risk_level
      })),
    simulation: {
      predicted_revenue: row.predicted_revenue,
      predicted_profit: row.predicted_profit,
      profit_delta: row.profit_delta,
      confidence: row.confidence,
      risk: row.risk,
      cash_impact: row.cash_impact,
      inventory_impact: row.inventory_impact,
      time_to_impact: row.time_to_impact
    },
    current_metrics: {
      profit: row.current_profit,
      revenue: row.before_state.revenue,
      margin: row.before_state.margin,
      roas,
      stock: row.current_inventory,
      ads_spend: row.current_ads_spend
    },
    recommended_action: row.action,
    evidence,
    scenarios: scenarioComparison.scenarios,
    selected_scenario: scenarioComparison.selected_scenario,
    confidence: row.confidence,
    decision_confidence: row.decision_confidence,
    decision_quality: row.decision_quality,
    decision_readiness: row.decision_readiness,
    signal_quality: row.decision_confidence?.signal_quality,
    blocked_signals: row.decision_quality?.blocked_signals ?? row.decision_confidence?.blocked_signals,
    tracking_status: "RECOMMENDED",
    feedback: {
      prediction_error: null,
      actual_profit_lift: null,
      learned: false
    }
  };
}

function buildActionDisplayMetadata(row: ProfitSimulationResult): ActionDisplayMetadata {
  const horizon = row.simulation_horizon?.label ?? "30 days";
  const priceChange = row.current_price > 0
    ? roundRatio((row.simulated_price - row.current_price) / row.current_price)
    : 0;
  const pricePercent = `${priceChange >= 0 ? "+" : ""}${roundRatio(priceChange * 100)}%`;
  const budgetDelta = roundCurrency(row.recommended_ads_spend - row.current_ads_spend);
  const inventoryDelta = row.required_inventory - row.current_inventory;
  const isAdWasteReduction = row.action === "REDUCE_ADS" && (row.opportunity_type === "AD_EFFICIENCY" || row.opportunity_type === "PORTFOLIO");
  const restockRequired = isRestockInventoryAction(row);

  if (row.action === "PRICE_UP_5" || row.action === "PRICE_UP_10" || (row.unified_action === "OPTIMIZE_PRICE" && priceChange > 0)) {
    return {
      title: `Increase Price ${pricePercent}`,
      icon: "💰",
      category: "Profit Optimization",
      description: `Raise price by ${pricePercent}`,
      subtitle: `Raise price by ${pricePercent}`,
      reason: "Current margin supports price increase with limited demand impact.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.action === "PRICE_DOWN_10" || (row.unified_action === "OPTIMIZE_PRICE" && priceChange < 0)) {
    return {
      title: `Decrease Price ${Math.abs(roundRatio(priceChange * 100))}%`,
      icon: "💰",
      category: "Profit Optimization",
      description: `Lower price by ${Math.abs(roundRatio(priceChange * 100))}% to improve demand`,
      subtitle: `Lower price by ${Math.abs(roundRatio(priceChange * 100))}% to improve demand`,
      reason: "Demand elasticity suggests volume growth will offset margin reduction.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.action === "PROMOTION_TEST") {
    return {
      title: "Run Promotion 10%",
      icon: "🏷️",
      category: "Profit Optimization",
      description: "Apply 10% discount test",
      subtitle: "Apply 10% discount test",
      reason: "Promotion test checks whether demand lift offsets lower unit margin.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.unified_action === "SCALE_ADS" || (row.action === "RESTOCK_AND_SCALE" && !restockRequired)) {
    return {
      title: "Scale Ads",
      icon: "🚀",
      category: "Growth Optimization",
      description: `Increase advertising budget by ${formatSignedCurrency(Math.max(0, budgetDelta))} / ${horizon}`,
      subtitle: `Increase ads budget ${formatSignedCurrency(Math.max(0, budgetDelta))} / ${horizon}`,
      reason: "ROAS and margin support additional spend.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.unified_action === "REALLOCATE_BUDGET" && !isAdWasteReduction) {
    return {
      title: "Reallocate Budget",
      icon: "🔄",
      category: "Portfolio Health",
      description: `Move ${formatSignedCurrency(Math.abs(budgetDelta))} budget toward higher-profit channels`,
      subtitle: `Reallocate budget ${formatSignedCurrency(Math.abs(budgetDelta))} / ${horizon}`,
      reason: "Same budget can generate higher profit.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.action === "REDUCE_ADS" || row.unified_action === "REDUCE_WASTE") {
    return {
      title: `Reduce Ad Waste ${formatSignedCurrency(budgetDelta)}`,
      icon: "🛑",
      category: "Portfolio Health",
      description: `Reduce inefficient ad spend by ${formatSignedCurrency(Math.abs(budgetDelta))} / ${horizon}`,
      subtitle: `Reduce inefficient ad spend ${formatSignedCurrency(budgetDelta)} / ${horizon}`,
      reason: "Marginal ROAS is below target.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit recovery over ${horizon}.`
    };
  }

  if (row.unified_action === "EXPAND_CHANNEL" || row.action === "SHIFT_CHANNEL") {
    return {
      title: "Expand Channel",
      icon: "🌎",
      category: "Growth Optimization",
      description: row.channel ? `Launch ${row.channel} channel test` : "Launch new channel test",
      subtitle: row.channel ? `Launch ${row.channel} channel test` : "Move budget to stronger channel",
      reason: "Simulation shows higher channel profitability.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if ((row.unified_action === "RESTOCK" || row.action === "RESTOCK_AND_SCALE") && restockRequired) {
    return {
      title: `Restock ${Math.max(0, inventoryDelta).toLocaleString("en-US")} units`,
      icon: "📦",
      category: "Inventory Optimization",
      description: `Add ${Math.max(0, inventoryDelta).toLocaleString("en-US")} units inventory`,
      subtitle: `Add ${Math.max(0, inventoryDelta).toLocaleString("en-US")} units inventory`,
      reason: "Demand exceeds available stock.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.unified_action === "REDUCE_INVENTORY" || row.action === "REDUCE_INVENTORY") {
    return {
      title: `Clear Excess Inventory ${Math.abs(row.inventory_impact).toLocaleString("en-US")} units`,
      icon: "🏷",
      category: "Inventory Optimization",
      description: `Clear ${Math.abs(row.inventory_impact).toLocaleString("en-US")} excess units from active inventory exposure`,
      subtitle: `Clear excess inventory by ${Math.abs(row.inventory_impact).toLocaleString("en-US")} units`,
      reason: "Slow velocity and cash tied up.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
    };
  }

  if (row.unified_action === "STOP_SKU" || row.action === "STOP") {
    return {
      title: "Exit SKU",
      icon: "❌",
      category: "Portfolio Health",
      description: "Exit SKU from active optimization portfolio",
      subtitle: "Exit SKU",
      reason: "Negative profit trend and limited recovery potential.",
      impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit recovery over ${horizon}.`
    };
  }

  return {
    title: "Hold and Monitor",
    icon: "⏸",
    category: "Portfolio Health",
    description: "Keep current operating plan and monitor next signal window",
    subtitle: "Hold current plan",
    reason: "No alternative cleared the risk-adjusted profit threshold.",
    impact_label: `AI predicts ${formatSignedCurrency(row.profit_delta)} profit over ${horizon}.`
  };
}

function buildActionReasoningMetadata(row: ProfitSimulationResult): ActionReasoningMetadata {
  const roas = row.current_ads_spend > 0 ? roundRatio(row.before_state.revenue / Math.max(1, row.current_ads_spend)) : null;
  const marginalRoas = row.simulation_estimate?.revenue_simulation.marginal_roas ?? (roas ? roundRatio(roas * 0.82) : null);
  const stockCoverageDays = row.current_inventory > 0 && row.required_inventory > 0
    ? roundRatio(row.current_inventory / Math.max(1, row.required_inventory / Math.max(1, row.simulation_horizon.days)))
    : null;
  const expectedDemand = Math.max(0, row.required_inventory);
  const velocity = roundRatio(expectedDemand / Math.max(1, row.simulation_horizon.days));
  const priceChange = row.current_price > 0 ? roundRatio((row.simulated_price - row.current_price) / row.current_price) : 0;
  const elasticity = row.demand_elasticity?.demand_change ?? (priceChange > 0 ? -0.04 : 0.08);
  const budgetDelta = roundCurrency(row.recommended_ads_spend - row.current_ads_spend);
  const inventoryValue = roundCurrency(Math.max(0, row.current_inventory) * Math.max(0, row.current_price * Math.max(0.15, row.before_state.margin)));
  const cashReleased = roundCurrency(Math.max(0, -row.inventory_impact) * Math.max(0, row.current_price * Math.max(0.15, row.before_state.margin)));
  const isAdWasteReduction = row.action === "REDUCE_ADS" && (row.opportunity_type === "AD_EFFICIENCY" || row.opportunity_type === "PORTFOLIO");
  const restockRequired = isRestockInventoryAction(row);

  if (row.unified_action === "SCALE_ADS" || (row.action === "RESTOCK_AND_SCALE" && !restockRequired)) {
    return {
      title: "Why AI selected Increase Ads Budget",
      reasons: [
        { signal: "Strong advertising efficiency", metric: `ROAS: ${roas ?? "n/a"} · Benchmark: 2.8`, explanation: "Paid demand is efficient enough to justify additional spend." },
        { signal: "Positive incremental profit", metric: `Simulation: ${formatSignedCurrency(row.profit_delta)} profit impact`, explanation: "Profit impact is calculated after ads, fees, fulfillment, and refund costs." },
        { signal: "Inventory supports growth", metric: `Stock coverage: ${stockCoverageDays ? `${stockCoverageDays} days` : "available"}`, explanation: "Inventory can support the extra demand created by advertising." }
      ],
      summary: "This SKU has profitable demand and enough inventory capacity to support additional advertising spend."
    };
  }

  if (row.unified_action === "EXPAND_CHANNEL") {
    return {
      title: "Why AI selected Expand Channel",
      reasons: [
        { signal: "Similar products perform well in this channel", metric: `Category ROAS: ${marginalRoas ?? 4.5}`, explanation: "Comparable channel signals indicate room to test another demand path." },
        { signal: "Channel opportunity detected", metric: row.channel ? `Current: ${row.channel} · Recommendation: launch channel test` : "Recommendation: launch channel test", explanation: "The SKU is not limited to one demand source in the scenario set." },
        { signal: "Profit potential positive", metric: `Expected impact: ${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`, explanation: "The channel path cleared risk-adjusted profit scoring." }
      ],
      summary: "AI identified an additional profitable channel opportunity."
    };
  }

  if (row.unified_action === "OPTIMIZE_PRICE") {
    if (row.action === "PROMOTION_TEST") {
      return {
        title: "Why AI selected Run Promotion",
        reasons: [
          { signal: "Promotion test opportunity", metric: "Discount test: 10%", explanation: "AI is testing whether added demand offsets lower unit margin." },
          { signal: "Demand elasticity supports test", metric: `Elasticity: ${roundRatio(elasticity)}`, explanation: "The simulation expects conversion lift to stay within a profitable range." },
          { signal: "Simulation predicts higher profit", metric: `Expected impact: ${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`, explanation: "Profit impact comes from simulated contribution profit, not revenue lift." }
        ],
        summary: "AI recommends a bounded promotion test to validate demand lift while controlling margin risk."
      };
    }

    const direction = priceChange >= 0 ? "Increase Price" : "Decrease Price";
    const marketPrice = row.market_reference_price;
    return {
      title: `Why AI selected ${direction}`,
      reasons: [
        {
          signal: priceChange > 0 ? "Current price below market" : "Demand stimulation opportunity",
          metric: priceChange > 0 && marketPrice ? `Current: ${formatCurrencyValue(row.current_price)} · Market: ${formatCurrencyValue(marketPrice)}` : `Current margin: ${roundRatio(row.before_state.margin * 100)}%`,
          explanation: priceChange > 0 ? "Price lift is only eligible when market evidence shows the SKU is underpriced." : "Lower price is used when demand or inventory pressure needs stimulation."
        },
        { signal: "Demand remains stable", metric: `Elasticity: ${roundRatio(elasticity)}`, explanation: "The simulation expects demand impact to stay within the profitable range." },
        { signal: "Simulation predicts higher profit", metric: `Expected impact: ${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`, explanation: "Profit impact comes from simulated contribution profit, not revenue lift." }
      ],
      summary: "AI found a better price point that improves profit while maintaining expected demand."
    };
  }

  if (row.unified_action === "REALLOCATE_BUDGET" && !isAdWasteReduction) {
    return {
      title: "Why AI selected Budget Reallocation",
      reasons: [
        { signal: "Channel profitability difference detected", metric: `Marginal ROAS: ${marginalRoas ?? "below target"}`, explanation: "The current spend path is less profitable than alternatives." },
        { signal: "Same budget can generate higher profit", metric: `Move budget: ${formatSignedCurrency(Math.abs(budgetDelta))}`, explanation: "AI reallocates spend toward stronger contribution profit." },
        { signal: "Profit recovery positive", metric: `Expected recovery: ${formatSignedCurrency(row.profit_delta)}`, explanation: "The selected action improves profit by reducing inefficient spend." }
      ],
      summary: "AI reallocates budget toward higher-profit channels."
    };
  }

  if (row.unified_action === "RESTOCK" && restockRequired) {
    return {
      title: "Why AI selected Restock Inventory",
      reasons: [
        { signal: "Demand exceeds available inventory", metric: `Sales velocity: ${velocity} units/day`, explanation: "Expected demand is higher than current inventory can support." },
        { signal: "Stockout risk detected", metric: `Inventory coverage: ${stockCoverageDays ? `${stockCoverageDays} days` : "limited"}`, explanation: "Inventory shortage can cap profitable demand." },
        { signal: "Additional inventory creates profit opportunity", metric: `Simulation: ${formatSignedCurrency(row.profit_delta)} profit`, explanation: "Restocking lets the SKU capture expected demand." }
      ],
      summary: "AI recommends replenishment to capture expected demand."
    };
  }

  if (row.unified_action === "REDUCE_INVENTORY") {
    return {
      title: "Why AI selected Clear Excess Inventory",
      reasons: [
        { signal: "Low inventory velocity", metric: `Sales velocity: ${velocity} units/day`, explanation: "Inventory is moving slower than the current stock position requires." },
        { signal: "Inventory exceeds demand forecast", metric: `Current stock: ${row.current_inventory.toLocaleString("en-US")} units · Expected 30D demand: ${expectedDemand.toLocaleString("en-US")} units`, explanation: "The SKU has more inventory than the simulation expects to sell." },
        { signal: "Capital is locked in excess inventory", metric: `Inventory value: ${formatCurrencyValue(inventoryValue)} · Cash released: ${formatSignedCurrency(cashReleased)}`, explanation: "Clearing excess inventory improves cash efficiency and lowers holding risk." }
      ],
      summary: "AI recommends clearing excess inventory to improve cash efficiency and reduce holding risk."
    };
  }

  if (row.unified_action === "REDUCE_WASTE" || row.action === "REDUCE_ADS") {
    return {
      title: "Why AI selected Reduce Waste",
      reasons: [
        { signal: "Low marginal ROAS", metric: `Marginal ROAS: ${marginalRoas ?? "below target"}`, explanation: "Additional spend is not producing enough contribution profit." },
        { signal: "Spend exceeds profit contribution", metric: `Ad waste: ${formatCurrencyValue(Math.abs(budgetDelta))}`, explanation: "The budget can be better used elsewhere in the portfolio." },
        { signal: "Better allocation opportunities exist", metric: `Expected profit recovery: ${formatSignedCurrency(row.profit_delta)}`, explanation: "Solver found higher risk-adjusted use of resources." }
      ],
      summary: "AI identified inefficient spending that reduces portfolio profitability."
    };
  }

  if (row.unified_action === "STOP_SKU") {
    return {
      title: "Why AI selected Exit SKU",
      reasons: [
        { signal: "Negative profitability trend", metric: `Current profit: ${formatCurrencyValue(row.current_profit)}`, explanation: "The SKU does not meet the profit threshold." },
        { signal: "Low demand recovery probability", metric: `Risk level: ${row.risk_level}`, explanation: "Simulation does not show enough recovery potential." },
        { signal: "Capital tied in declining product", metric: `Avoided future loss: ${formatSignedCurrency(row.profit_delta)}`, explanation: "Exiting protects portfolio profitability." }
      ],
      summary: "AI recommends exiting this SKU to protect portfolio profitability."
    };
  }

  return {
    title: "Why AI selected Hold and Monitor",
    reasons: [
      { signal: "No stronger action cleared constraints", metric: `Expected impact: ${formatSignedCurrency(row.profit_delta)}`, explanation: "Alternatives did not beat the risk-adjusted baseline." }
    ],
    summary: "AI recommends monitoring until a stronger operating signal appears."
  };
}

function portfolioMarginBenchmark(simulations: ProfitSimulationResult[]) {
  const margins = simulations
    .map((row) => row.before_state.margin)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!margins.length) return 0.274;
  return margins[Math.floor(margins.length / 2)] ?? 0.274;
}

function buildActionTiming(row: ProfitSimulationResult): OptimizationActionTiming {
  const windowDays = row.simulation_horizon?.days ?? 30;
  const actionStart = startOfUtcDay(new Date());
  const simulationEnd = addUtcDays(actionStart, Math.max(0, windowDays - 1));
  const baselineEnd = addUtcDays(actionStart, -1);
  const baselineStart = addUtcDays(baselineEnd, -Math.max(0, windowDays - 1));

  return {
    action_start_at: actionStart.toISOString(),
    simulation_window_days: windowDays,
    simulation_window_start: toDateOnly(actionStart),
    simulation_window_end: toDateOnly(simulationEnd),
    baseline_period_start: toDateOnly(baselineStart),
    baseline_period_end: toDateOnly(baselineEnd),
    tracking_window_days: windowDays,
    tracking_window_start: toDateOnly(actionStart),
    tracking_window_end: toDateOnly(simulationEnd),
    timing_source: "report_generated_at",
    ad_budget_period: isAdBudgetAction(row.action) ? "simulation_window" : undefined,
    inventory_snapshot_at: actionStart.toISOString()
  };
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isAdBudgetAction(action: string) {
  return /AD|ADS|BUDGET|SCALE/i.test(action);
}

function buildConstraintsPassed(row: ProfitSimulationResult) {
  const passed = ["budget", "margin", "confidence"];
  if (row.required_inventory <= row.current_inventory || row.action === "RESTOCK_AND_SCALE") passed.push("inventory");
  if (row.required_cash >= 0) passed.push("cash");
  return passed;
}

function buildAllocationRecommendation(input: {
  rows: ProfitSimulationResult[];
  input: PortfolioOptimizationInput;
  budgetPlan: PortfolioBudgetPlan[];
}): PortfolioAllocationRecommendation {
  const currentSpend = input.input.skus.reduce((sum, sku) => sum + sku.ads_spend, 0);
  const recommendedSpend = input.rows.reduce((sum, row) => sum + row.recommended_ads_spend, 0);
  const totalRecommendedBudget = Math.max(1, recommendedSpend);
  const growthRows = input.rows.filter((row) => classifyDecisionAction(row) === "SCALE");
  const fixRows = input.rows.filter((row) => classifyDecisionAction(row) === "OPTIMIZE");
  const stopRows = input.rows.filter((row) => classifyDecisionAction(row) === "REDUCE");
  const monitorRows = input.rows.filter((row) => classifyDecisionAction(row) === "MONITOR");

  return {
    current: [
      { bucket: "Acquisition SKUs", share: 0.7, amount: roundCurrency(currentSpend * 0.7) },
      { bucket: "Profit SKUs", share: 0.2, amount: roundCurrency(currentSpend * 0.2) },
      { bucket: "Testing", share: 0.1, amount: roundCurrency(currentSpend * 0.1) }
    ],
    recommended: [
      {
        bucket: "Profit Growth SKUs",
        share: roundRatio(growthRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0) / totalRecommendedBudget),
        amount: roundCurrency(growthRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0))
      },
      {
        bucket: "High Potential Fixes",
        share: roundRatio(fixRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0) / totalRecommendedBudget),
        amount: roundCurrency(fixRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0))
      },
      {
        bucket: "Monitor / Data Collection",
        share: roundRatio(monitorRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0) / totalRecommendedBudget),
        amount: roundCurrency(monitorRows.reduce((sum, row) => sum + row.recommended_ads_spend, 0))
      },
      {
        bucket: "Exit / Reduce Exposure",
        share: roundRatio(stopRows.reduce((sum, row) => sum + row.current_ads_spend, 0) / Math.max(1, currentSpend)),
        amount: roundCurrency(stopRows.reduce((sum, row) => sum + row.current_ads_spend, 0))
      }
    ],
    narrative: input.budgetPlan.length
      ? "Budget is shifted from lower-response exposure toward SKUs with stronger estimated marginal profit."
      : "Current budget stays constrained while the portfolio is filtered toward higher-confidence profit actions."
  };
}

function buildRiskAlerts(rows: ProfitSimulationResult[]): PortfolioRiskAlert[] {
  const inventorySkus = rows
    .filter((row) => row.required_inventory > row.current_inventory)
    .map((row) => row.sku)
    .slice(0, 8);
  const lowConfidenceSkus = rows
    .filter((row) => row.confidence < 0.6)
    .map((row) => row.sku)
    .slice(0, 8);
  const marginSkus = rows
    .filter((row) => row.predicted_margin < 0.15)
    .map((row) => row.sku)
    .slice(0, 8);
  const alerts: PortfolioRiskAlert[] = [];

  if (inventorySkus.length) {
    alerts.push({
      type: "inventory",
      message: "Some selected actions require inventory coverage before scaling exposure.",
      affectedSkus: inventorySkus,
      severity: inventorySkus.length > 5 ? "high" : "medium"
    });
  }
  if (lowConfidenceSkus.length) {
    alerts.push({
      type: "confidence",
      message: "Some actions should remain monitored because prediction confidence is limited.",
      affectedSkus: lowConfidenceSkus,
      severity: "medium"
    });
  }
  if (marginSkus.length) {
    alerts.push({
      type: "margin",
      message: "Margin-sensitive SKUs need cost or price fixes before aggressive scaling.",
      affectedSkus: marginSkus,
      severity: "medium"
    });
  }

  return alerts;
}

function buildExecutionPlan(decisions: SKUDecision[]): PortfolioExecutionStep[] {
  const grouped = {
    SCALE: decisions.filter((row) => row.action === "SCALE"),
    OPTIMIZE: decisions.filter((row) => row.action === "OPTIMIZE"),
    REDUCE: decisions.filter((row) => row.action === "REDUCE"),
    MONITOR: decisions.filter((row) => row.action === "MONITOR")
  };

  const steps: PortfolioExecutionStep[] = [
    {
      step: 1,
      action: "SCALE",
      description: "Move budget and exposure toward SKUs with the highest estimated profit impact.",
      skuIds: grouped.SCALE.slice(0, 8).map((row) => row.skuId),
      estimatedProfitImpact: roundCurrency(grouped.SCALE.reduce((sum, row) => sum + Math.max(0, row.estimatedProfitImpact), 0))
    },
    {
      step: 2,
      action: "OPTIMIZE",
      description: "Fix price, margin, inventory, or conversion constraints before scaling.",
      skuIds: grouped.OPTIMIZE.slice(0, 8).map((row) => row.skuId),
      estimatedProfitImpact: roundCurrency(grouped.OPTIMIZE.reduce((sum, row) => sum + Math.max(0, row.estimatedProfitImpact), 0))
    },
    {
      step: 3,
      action: "REDUCE",
      description: "Reduce spend or exposure on SKUs where the portfolio solver favors removal or budget protection.",
      skuIds: grouped.REDUCE.slice(0, 8).map((row) => row.skuId),
      estimatedProfitImpact: roundCurrency(grouped.REDUCE.reduce((sum, row) => sum + Math.max(0, row.estimatedProfitImpact), 0))
    }
  ];

  return steps.filter((step) => step.skuIds.length > 0 || step.estimatedProfitImpact > 0);
}

function countDecisionActions(rows: ProfitSimulationResult[]) {
  return rows.reduce(
    (counts, row) => {
      counts[classifyDecisionAction(row)] += 1;
      return counts;
    },
    { SCALE: 0, REDUCE: 0, OPTIMIZE: 0, MONITOR: 0 } satisfies Record<DecisionAction, number>
  );
}

function classifyDecisionAction(row: ProfitSimulationResult): DecisionAction {
  if (row.action === "STOP" || row.action === "REDUCE_ADS") return "REDUCE";
  if (row.action === "TEST_AD_SPEND") return "OPTIMIZE";
  if (row.action === "SCALE_ADS" || row.action === "SCALE_ADS_PRICE_UP_5" || row.action === "SHIFT_CHANNEL" || row.action === "CREATE_BUNDLE") return "SCALE";
  if (row.action === "RESTOCK_AND_SCALE") return row.required_inventory > row.current_inventory ? "OPTIMIZE" : "SCALE";
  if (row.action === "PRICE_UP_5" || row.action === "PRICE_UP_10" || row.action === "PRICE_DOWN_10" || row.action === "PROMOTION_TEST" || row.action === "REDUCE_INVENTORY") return "OPTIMIZE";
  if (row.profit_delta > 0 && row.confidence >= 0.65) return "SCALE";
  return "MONITOR";
}

function classifySkuRole(row: ProfitSimulationResult, decision: DecisionAction): SkuPortfolioRole {
  const margin = row.before_state.margin;
  const roas = row.current_ads_spend > 0 ? row.before_state.revenue / Math.max(1, row.current_ads_spend) : null;
  const runway = inventoryRunwayDays(row);

  if (row.current_profit < 0 || row.predicted_margin < 0.12 || decision === "REDUCE") return "DRAIN";
  if (decision === "SCALE" && row.profit_delta > 0 && row.revenue_delta > 0) return "GROWTH";
  if (margin >= 0.35 || row.current_profit >= 2500) return "PROFIT";
  if (roas !== null && roas >= 2 && margin < 0.35) return "ACQUISITION";
  if (runway !== null && runway < 14 && row.revenue_delta > 0) return "GROWTH";
  return margin >= 0.25 ? "PROFIT" : "ACQUISITION";
}

function buildDecisionDrivers(row: ProfitSimulationResult, decision: DecisionAction): DecisionDriver[] {
  const margin = row.before_state.margin;
  const marginChange = row.margin_change;
  const revenueChangeRate = safeRate(row.revenue_delta, row.before_state.revenue);
  const budgetDelta = row.recommended_ads_spend - row.current_ads_spend;
  const runwayDays = inventoryRunwayDays(row);
  const roas = row.current_ads_spend > 0 ? row.before_state.revenue / Math.max(1, row.current_ads_spend) : null;

  if (decision === "SCALE") {
    return compactDrivers([
      {
        category: "Demand Signal",
        metric: "Simulated Revenue Lift",
        value: `${formatSignedPercent(revenueChangeRate)} under selected action`,
        impact: revenueChangeRate >= 0 ? "positive" : "risk"
      },
      {
        category: "Profit Impact",
        metric: "Estimated Incremental Profit",
        value: `${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`,
        impact: row.profit_delta >= 0 ? "positive" : "negative"
      },
      {
        category: "Margin Strength",
        metric: "Contribution Margin",
        value: `${formatPercentValue(margin)} current / ${formatSignedPercent(marginChange)} change`,
        impact: margin >= 0.35 || marginChange >= 0 ? "positive" : "risk"
      },
      {
        category: "Inventory Status",
        metric: "Stock Runway",
        value: runwayDays === null ? "Needs validation" : `${roundRatio(runwayDays)} days coverage`,
        impact: row.required_inventory <= row.current_inventory ? "positive" : "risk"
      }
    ]);
  }

  if (decision === "REDUCE") {
    return compactDrivers([
      {
        category: "Ad Efficiency",
        metric: "Budget Reduction",
        value: budgetDelta < 0 ? `${formatSignedCurrency(budgetDelta)} spend change` : "Spend not justified by simulation",
        impact: "negative"
      },
      {
        category: "Profit Impact",
        metric: "Marginal Profit",
        value: `${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`,
        impact: row.profit_delta < 0 ? "negative" : "risk"
      },
      {
        category: "Margin Signal",
        metric: "Predicted Margin",
        value: `${formatPercentValue(row.predicted_margin)} after action`,
        impact: row.predicted_margin < 0.15 ? "negative" : "risk"
      },
      {
        category: "Recovery Signal",
        metric: "Revenue Simulation",
        value: `${formatSignedCurrency(row.revenue_delta)} revenue change`,
        impact: row.revenue_delta < 0 ? "negative" : "risk"
      }
    ]);
  }

  if (decision === "OPTIMIZE") {
    const rootCause = row.action.includes("RESTOCK") && isRestockInventoryAction(row)
      ? "Inventory coverage constrains scale"
      : row.action.includes("PRICE")
        ? "Price and margin need adjustment"
        : "Operating constraint limits scaling";

    return compactDrivers([
      {
        category: "Root Cause",
        metric: "Constraint",
        value: rootCause,
        impact: "risk"
      },
      {
        category: "Profit Impact",
        metric: "Estimated Fix Value",
        value: `${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`,
        impact: row.profit_delta >= 0 ? "positive" : "risk"
      },
      {
        category: "Margin Response",
        metric: "Margin Change",
        value: formatSignedPercent(marginChange),
        impact: marginChange >= 0 ? "positive" : "risk"
      },
      {
        category: "Inventory Status",
        metric: "Required Inventory",
        value: `${numberText(row.required_inventory)} required / ${numberText(row.current_inventory)} available`,
        impact: row.required_inventory <= row.current_inventory ? "positive" : "risk"
      }
    ]);
  }

  return compactDrivers([
    {
      category: "Data Sufficiency",
      metric: "Prediction Confidence",
      value: formatPercentValue(row.confidence),
      impact: row.confidence >= 0.65 ? "positive" : "risk"
    },
    {
      category: "Profit Impact",
      metric: "Estimated Impact",
      value: `${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}`,
      impact: row.profit_delta > 0 ? "positive" : "risk"
    },
    {
      category: "Observation Need",
      metric: "Decision Readiness",
      value: "More outcome data needed before scale or stop",
      impact: "risk"
    },
    roas === null ? null : {
      category: "Ad Efficiency",
      metric: "Current Revenue / Ad Spend",
      value: `${roundRatio(roas)}x`,
      impact: roas >= 2 ? "positive" : "risk"
    }
  ]);
}

function buildCausalExplanation(row: ProfitSimulationResult, decision: DecisionAction): DecisionCausalExplanation {
  const drivers = buildDecisionDrivers(row, decision);
  const evidence = drivers.slice(0, 3).map((driver) => `${driver.category}: ${driver.metric} ${driver.value}`);
  const budgetDelta = Math.max(0, row.recommended_ads_spend - row.current_ads_spend);

  if (decision === "SCALE") {
    return {
      evidence,
      businessMeaning: "Demand, margin, and inventory signals indicate positive marginal profit potential.",
      decision: budgetDelta > 0
        ? `Increase advertising budget by ${formatCurrencyValue(budgetDelta)} and track profit lift.`
        : "Increase exposure within current budget constraints and track profit lift."
    };
  }

  if (decision === "REDUCE") {
    return {
      evidence,
      businessMeaning: "The SKU consumes resources that can be reallocated to stronger portfolio opportunities.",
      decision: "Reduce exposure or stop inefficient campaigns, then reallocate budget."
    };
  }

  if (decision === "OPTIMIZE") {
    return {
      evidence,
      businessMeaning: "The SKU has profit potential, but a constraint must be fixed before scaling.",
      decision: row.action.includes("RESTOCK") && isRestockInventoryAction(row)
        ? "Resolve inventory coverage before increasing demand."
        : row.action.includes("PRICE")
          ? "Run a controlled price adjustment before scaling."
          : "Fix the limiting operating metric before increasing exposure."
    };
  }

  return {
    evidence,
    businessMeaning: "Current evidence is not strong enough for an irreversible portfolio move.",
    decision: "Monitor until confidence or outcome data improves."
  };
}

function buildDecisionReasons(row: ProfitSimulationResult, decision: DecisionAction) {
  const reasons: string[] = [];
  if (decision === "SCALE") {
    if (row.profit_delta > 0) reasons.push(`Estimated marginal profit impact is ${roundCurrency(row.profit_delta)}.`);
    if (row.margin_change >= 0) reasons.push("Margin remains stable or improves in the selected simulation.");
    if (row.required_inventory <= row.current_inventory) reasons.push("Inventory can support the simulated demand window.");
  } else if (decision === "REDUCE") {
    reasons.push("Portfolio solver favors reducing exposure versus keeping current allocation.");
    if (row.current_ads_spend > row.recommended_ads_spend) reasons.push("Ad budget can be protected or reallocated.");
    if (row.predicted_margin < 0.15) reasons.push("Predicted margin is below the portfolio threshold.");
  } else if (decision === "OPTIMIZE") {
    if (row.action.includes("PRICE")) reasons.push("Price simulation indicates margin can be improved before scaling.");
    if (row.action.includes("RESTOCK") && isRestockInventoryAction(row)) reasons.push("Inventory coverage constrains the growth scenario.");
    if (row.margin_change > 0) reasons.push("The fix improves contribution margin.");
  } else {
    reasons.push("Current evidence is not strong enough for immediate scale or stop action.");
  }
  if (row.revenue_delta > 0) reasons.push(`Revenue simulation changes by ${roundCurrency(row.revenue_delta)}.`);
  return reasons.slice(0, 4);
}

function buildDecisionRisks(row: ProfitSimulationResult) {
  const risks: string[] = [];
  if (row.confidence < 0.65) risks.push("Prediction confidence is moderate; track outcome before larger execution.");
  if (row.required_inventory > row.current_inventory) risks.push("Inventory coverage must be validated before execution.");
  if (row.margin_change < -0.03) risks.push("The selected action may reduce margin.");
  if (row.risk > 0.25) risks.push("Simulation risk is elevated versus other portfolio actions.");
  return risks.length ? risks : ["No material constraint breach detected in simulation."];
}

function buildComparisonInsights(row: ProfitSimulationResult, alternatives: ProfitSimulationResult[], strongerRows: ProfitSimulationResult[]) {
  const insights: string[] = [];
  const bestAlternative = alternatives[0];
  if (bestAlternative) {
    insights.push(`${row.action} was selected over ${bestAlternative.action} because its opportunity score is ${roundCurrency(row.opportunity_score)} versus ${roundCurrency(bestAlternative.opportunity_score)}.`);
  }
  if (strongerRows.length) {
    insights.push(`Higher-priority SKUs such as ${strongerRows.map((item) => item.sku).join(", ")} receive allocation first because their simulated profit impact is stronger.`);
  } else {
    insights.push("This SKU is among the highest-ranked portfolio opportunities in the current simulation set.");
  }
  return insights;
}

function buildRecommendedExecution(row: ProfitSimulationResult, decision: DecisionAction) {
  if (decision === "SCALE") {
    const budgetDelta = Math.max(0, row.recommended_ads_spend - row.current_ads_spend);
    return [
      budgetDelta > 0 ? `Increase advertising budget by ${roundCurrency(budgetDelta)}.` : "Increase exposure without exceeding current budget constraints.",
      "Track revenue, contribution profit, and inventory consumption during the observation window."
    ];
  }
  if (decision === "REDUCE") {
    return [
      "Reduce ad exposure or pause low-value campaigns for this SKU.",
      "Reallocate freed budget to higher opportunity-score SKUs."
    ];
  }
  if (decision === "OPTIMIZE") {
    if (row.action === "TEST_AD_SPEND") return ["Run a small budget ad response test.", "Collect SKU-level paid response data before scaling."];
    if (row.action.includes("RESTOCK") && isRestockInventoryAction(row)) return ["Validate stock availability before scaling demand.", "Execute inventory allocation before increasing exposure."];
    if (row.action.includes("PRICE")) return ["Run the selected price adjustment as a controlled test.", "Track demand elasticity and margin response."];
    return ["Fix the limiting metric before scaling.", "Re-run simulation after the fix is applied."];
  }
  return ["Continue collecting data.", "Re-evaluate after the next reporting window."];
}

function buildRecommendedActions(row: ProfitSimulationResult, decision: DecisionAction) {
  if (decision === "SCALE") {
    const budgetDelta = Math.max(0, row.recommended_ads_spend - row.current_ads_spend);
    const actions = [
      budgetDelta > 0 ? `Increase advertising budget by ${formatCurrencyValue(budgetDelta)}` : "Increase exposure within current budget",
      "Reserve inventory for the simulated demand window"
    ];
    if (row.action.includes("PRICE_UP")) actions.push("Run a controlled price lift with scale");
    return actions;
  }

  if (decision === "REDUCE") {
    return [
      "Reduce advertising spend on this SKU",
      "Stop inefficient campaigns if marginal profit stays weak",
      "Reallocate budget to higher opportunity-score SKUs"
    ];
  }

  if (decision === "OPTIMIZE") {
    if (row.action === "TEST_AD_SPEND") {
      const budgetDelta = Math.max(0, row.recommended_ads_spend - row.current_ads_spend);
      return [`Run small budget ad response test${budgetDelta > 0 ? ` with ${formatCurrencyValue(budgetDelta)} / ${row.simulation_horizon.label}` : ""}`, "Collect SKU-level marginal ROAS before scaling"];
    }
    if (row.action.includes("RESTOCK") && isRestockInventoryAction(row)) {
      return ["Increase inventory allocation before demand scaling", "Re-run scale simulation after stock is available"];
    }
    if (row.action.includes("PRICE")) {
      return ["Run a controlled price adjustment", "Track demand elasticity and contribution margin"];
    }
    return ["Improve conversion or cost structure", "Re-run portfolio simulation after the fix"];
  }

  return ["Continue controlled testing", "Watch trend until confidence improves"];
}

function compactDrivers(drivers: Array<DecisionDriver | null>): DecisionDriver[] {
  return drivers.filter((driver): driver is DecisionDriver => Boolean(driver));
}

function safeRate(delta: number, base: number) {
  if (!Number.isFinite(delta) || !Number.isFinite(base) || Math.abs(base) < 1) return 0;
  return delta / Math.abs(base);
}

function inventoryRunwayDays(row: ProfitSimulationResult) {
  if (row.current_inventory <= 0 || row.required_inventory <= 0) return null;
  return row.current_inventory / Math.max(1, row.required_inventory / 30);
}

function formatSignedCurrency(value: number) {
  const rounded = roundCurrency(value);
  return `${rounded >= 0 ? "+" : "-"}$${Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyValue(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedPercent(value: number) {
  const rounded = roundRatio(value) * 100;
  return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded).toFixed(2)}%`;
}

function formatPercentValue(value: number) {
  return `${(roundRatio(value) * 100).toFixed(2)}%`;
}

function numberText(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function bestSingleSkuBaseline(validBySku: Map<string, ProfitSimulationResult[]>) {
  const best = Array.from(validBySku.values())
    .flat()
    .filter((row) => row.action !== "STOP")
    .sort((left, right) => right.profit_delta - left.profit_delta)[0];
  return {
    sku: best?.sku ?? null,
    profit_delta: roundCurrency(best?.profit_delta ?? 0)
  };
}
