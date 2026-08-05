import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";
import { createPredictionProvider, seasonalFactor, type PredictionProvider } from "@/lib/optimization/prediction-provider";
import type { GeneratedAction } from "@/lib/optimization/action-generator";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import { lifecycleThresholdMultiplier, type BusinessObjective, type DynamicThresholdProfile } from "@/lib/optimization/dynamic-threshold-engine";
import type { PolicyTrace } from "@/lib/optimization/policy/optimization-policy-types";
import type { DecisionContractValidationMetadata } from "@/lib/optimization/decision-contract-validator";
import type { CogsStatus } from "@/lib/profit/canonical-profitability-engine";
import type { DecisionConfidenceResult } from "@/lib/optimization/decision-confidence-engine";
import type { DecisionQuality } from "@/lib/optimization/decision-governance-engine";
import type { DecisionReadiness } from "@/lib/optimization/decision-readiness-engine";

export type PortfolioSkuInput = {
  sku: string;
  category?: string;
  channel?: string;
  revenue: number;
  quantity: number;
  price: number;
  cogs: number;
  ads_spend: number;
  margin: number;
  net_profit: number;
  inventory: number;
  sales_velocity: number;
  normalized_daily_sales_velocity?: number;
  sales_velocity_confidence?: "HIGH" | "MEDIUM" | "LOW";
  velocity_window_days?: number;
  calculation_window_days?: number;
  velocity_calculation_basis?: "30-day normalized estimate" | "observed order window";
  data_period_days?: number;
  inventory_risk_status?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK" | "EXCESS_INVENTORY";
  refund_rate: number;
  customer_ltv: number;
  conversion_rate: number;
  prediction_confidence?: number;
  profitability_confidence?: number;
  optimization_allowed?: boolean;
  warnings?: string[];
  cogs_status?: CogsStatus;
  cogs_confidence?: number;
  ad_allocation_method?: string;
  attribution_confidence?: number;
  roas_confidence?: "HIGH" | "MEDIUM" | "LOW";
  roas_confidence_reason?: string;
  cac_confidence?: "HIGH" | "MEDIUM" | "LOW";
  customer_metric_confidence?: "HIGH" | "MEDIUM" | "LOW";
  shipping_cost?: number;
  fees?: number;
  fulfillment_cost?: number;
  revenue_growth?: number;
  order_count?: number;
  order_period_count?: number;
  customer_count?: number;
  repeat_rate?: number;
  product_age_days?: number;
  competitor_price?: number;
  market_median_price?: number;
  market_price_low?: number;
  market_price_high?: number;
  similar_sku_price?: number;
  price_elasticity?: number;
  order_growth?: number;
  conversion_trend?: number;
};

export type AdsCampaignInput = {
  campaign_id: string;
  sku?: string;
  channel?: string;
  category?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number | null;
  attribution_status?: "attributed" | "estimated" | "missing";
  attribution_source?: "campaign_attribution" | "sku_allocation" | "channel_history" | "category_benchmark";
  attribution_confidence?: number;
};

export type BusinessConstraintsInput = {
  total_ads_budget: number;
  inventory_capacity: number;
  available_cash?: number;
  target_margin: number;
  max_price_change: number;
  minimum_profit: number;
  minimum_confidence?: number;
  simulation_horizon_days?: number;
};

export type PortfolioOptimizationInput = {
  skus: PortfolioSkuInput[];
  ads?: AdsCampaignInput[];
  constraints: BusinessConstraintsInput;
  industry?: string;
  business_objective?: BusinessObjective;
};

export type PortfolioAction =
  | "HOLD"
  | "TEST_AD_SPEND"
  | "SCALE_ADS"
  | "REDUCE_ADS"
  | "PRICE_UP_5"
  | "PRICE_UP_10"
  | "PRICE_DOWN_10"
  | "SCALE_ADS_PRICE_UP_5"
  | "RESTOCK_AND_SCALE"
  | "SHIFT_CHANNEL"
  | "CREATE_BUNDLE"
  | "PROMOTION_TEST"
  | "REDUCE_INVENTORY"
  | "STOP";

export type RevenuePrediction = {
  predicted_revenue: number;
  confidence: number;
};

export type DemandElasticityPrediction = {
  price_change: number;
  demand_change: number;
  profit_change: number;
  confidence?: number;
};

export type AdsResponsePrediction = {
  current_spend?: number;
  additional_spend: number;
  incremental_revenue: number;
  incremental_profit: number;
  marginal_roas?: number;
  confidence?: number;
};

export type ConfidenceBreakdown = {
  revenue_prediction_confidence: number;
  profit_model_confidence: number;
  inventory_confidence: number;
  attribution_confidence: number;
  overall_confidence: number;
};

export type SimulationEstimate = {
  action_type: "INCREASE_AD_SPEND" | "TEST_AD_SPEND" | "OTHER";
  sku: string;
  simulation_window: {
    days: number;
    start?: string;
    end?: string;
  };
  investment: {
    additional_ad_spend: number;
    ad_budget_period: "daily" | "weekly" | "monthly" | "simulation_window";
    daily_budget_delta: number;
  };
  prediction_source:
    | "sku_historical_ads"
    | "sku_allocation"
    | "channel_history"
    | "category_benchmark"
    | "similar_sku_benchmark"
    | "store_level_blended_roas_discounted"
    | "rule_based_conservative_fallback";
  revenue_simulation: {
    base_roas: number;
    marginal_roas: number;
    diminishing_return_factor: number;
    attribution_confidence_factor: number;
    inventory_capacity_factor: number;
    incremental_revenue: number;
  };
  cost_simulation: {
    additional_ad_spend: number;
    incremental_shipping_cost: number;
    incremental_platform_fee: number;
    incremental_payment_fee: number;
    expected_refund_cost: number;
    incremental_fulfillment_cost: number;
  };
  profit_simulation: {
    contribution_margin: number;
    gross_incremental_profit: number;
    incremental_profit: number;
    expected_profit_impact: number;
  };
  confidence_breakdown: {
    data_confidence: number;
    attribution_confidence: number;
    inventory_confidence: number;
    margin_confidence: number;
    overall_confidence: number;
  };
  estimated_components: string[];
  warnings: string[];
};

export type ProfitSimulationResult = {
  sku: string;
  category?: string;
  channel?: string;
  action: PortfolioAction;
  selected: boolean;
  current_price: number;
  simulated_price: number;
  current_ads_spend: number;
  recommended_ads_spend: number;
  current_inventory: number;
  required_inventory: number;
  current_profit: number;
  predicted_revenue: number;
  predicted_profit: number;
  profit_delta: number;
  predicted_margin: number;
  confidence: number;
  risk: number;
  revenue_prediction: RevenuePrediction;
  demand_elasticity: DemandElasticityPrediction;
  ads_response: AdsResponsePrediction;
  predicted_cost: number;
  simulation_source: "prediction_model";
  simulation_estimate?: SimulationEstimate;
  simulation_horizon: {
    days: number;
    label: string;
  };
  prediction_type: "rule_based" | "statistical" | "ml_model";
  confidence_breakdown: ConfidenceBreakdown;
  required_cash: number;
  prediction_models: string[];
  why: string;
  evidence: string[];
  opportunity_type?: GeneratedAction["opportunity_type"];
  generated_action?: GeneratedAction["action"];
  lifecycle_stage?: SkuLifecycleStage;
  lifecycle?: SkuLifecycleClassification;
  lifecycle_objective?: {
    profit_growth: number;
    cash_efficiency: number;
    learning_value: number;
  };
  opportunity_score: number;
  action_score: number;
  execution_feasibility: number;
  strategic_value: number;
  risk_penalty: number;
  price_risk_penalty: number;
  cash_impact: number;
  time_to_impact: "immediate" | "short" | "medium" | "long";
  risk_level: "Low" | "Medium" | "High";
  market_reference_price?: number;
  optimization_goal: "GROWTH" | "PROFIT" | "INVENTORY" | "PORTFOLIO_HEALTH";
  unified_action:
    | "SCALE_ADS"
    | "EXPAND_CHANNEL"
    | "OPTIMIZE_PRICE"
    | "REALLOCATE_BUDGET"
    | "RESTOCK"
    | "REDUCE_INVENTORY"
    | "REDUCE_WASTE"
    | "STOP_SKU"
    | "HOLD";
  strategic_fit: number;
  feasibility: number;
  evidence_tags: string[];
  policy_trace?: PolicyTrace;
  validation?: DecisionContractValidationMetadata;
  decision_confidence?: DecisionConfidenceResult;
  decision_quality?: DecisionQuality;
  decision_readiness?: DecisionReadiness;
  before_state: {
    revenue: number;
    profit: number;
    ad_spend: number;
    price: number;
    inventory: number;
    margin: number;
  };
  after_state: {
    revenue: number;
    profit: number;
    ad_spend: number;
    price: number;
    inventory_required: number;
    margin: number;
  };
  revenue_delta: number;
  cost_delta: number;
  margin_change: number;
  inventory_impact: number;
};

export function simulatePortfolioSkuActions(sku: PortfolioSkuInput, ads: AdsCampaignInput[] = []): ProfitSimulationResult[] {
  const actions: PortfolioAction[] = [
    "HOLD",
    "SCALE_ADS",
    "REDUCE_ADS",
    "PRICE_UP_5",
    "PRICE_UP_10",
    "PRICE_DOWN_10",
    "SCALE_ADS_PRICE_UP_5",
    "RESTOCK_AND_SCALE",
    "STOP"
  ];

  return actions.map((action) => simulateSkuAction(sku, action, ads));
}

export function simulatePortfolioActions(input: PortfolioOptimizationInput): ProfitSimulationResult[] {
  return input.skus.flatMap((sku) => simulatePortfolioSkuActions(sku, input.ads ?? []));
}

export function simulateGeneratedActions(input: {
  skus: PortfolioSkuInput[];
  ads?: AdsCampaignInput[];
  actions: GeneratedAction[];
  predictionProvider?: PredictionProvider;
  simulationHorizonDays?: number;
  lifecycleBySku?: Map<string, SkuLifecycleClassification>;
  thresholdProfile?: DynamicThresholdProfile;
}): ProfitSimulationResult[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));
  const provider = input.predictionProvider ?? createPredictionProvider();

  return input.actions.flatMap((action) => {
    const sku = skuById.get(action.sku);
    if (!sku) return [];
    return [simulateSkuAction(sku, action.portfolio_action, input.ads ?? [], action, provider, input.simulationHorizonDays, input.skus, input.lifecycleBySku?.get(action.sku), input.thresholdProfile)];
  });
}

export function simulateSkuAction(
  sku: PortfolioSkuInput,
  action: PortfolioAction,
  ads: AdsCampaignInput[] = [],
  generatedAction?: GeneratedAction,
  predictionProvider: PredictionProvider = createPredictionProvider(),
  simulationHorizonDays = 30,
  allSkus: PortfolioSkuInput[] = [sku],
  lifecycle?: SkuLifecycleClassification,
  thresholdProfile?: DynamicThresholdProfile
): ProfitSimulationResult {
  const isHoldAction = action === "HOLD";
  const priceChange = priceChangeForAction(action);
  const adsMultiplier = adsMultiplierForAction(action);
  const restockLift = action === "RESTOCK_AND_SCALE" ? 0.16 : action === "REDUCE_INVENTORY" ? -0.04 : 0;
  const bundleLift = action === "CREATE_BUNDLE" ? 0.08 : 0;
  const promotionLift = action === "PROMOTION_TEST" ? 0.06 : 0;
  const channelLift = action === "SHIFT_CHANNEL" ? 0.05 : 0;
  const currentProfit = roundCurrency(sku.net_profit);
  const simulatedPrice = roundCurrency(Math.max(0.01, sku.price * (1 + priceChange)));
  const recommendedAdsSpend = roundCurrency(Math.max(0, generatedAction ? sku.ads_spend + generatedAction.budget_delta : sku.ads_spend * adsMultiplier));
  const demandForecast = predictionProvider.predictDemand(sku);
  const demandElasticity = predictionProvider.predictPriceElasticity(sku, priceChange);
  const adsResponse = predictionProvider.predictAdResponse({
    sku,
    ads,
    additionalSpend: recommendedAdsSpend - sku.ads_spend
  });
  const simulationEstimate = isIncreaseAdSpendAction(action)
    ? buildIncrementalProfitSimulationEstimate({
      sku,
      action,
      ads,
      allSkus,
      simulationHorizonDays,
      additionalAdSpend: Math.max(0, generatedAction?.budget_delta ?? recommendedAdsSpend - sku.ads_spend)
    })
    : undefined;
  const revenuePrediction = predictionProvider.predictRevenue({
    sku,
    action,
    seasonality: seasonalFactor(sku.category),
    priceChange,
    adsResponse,
    priceElasticity: demandElasticity,
    demandForecast,
    restockLift: restockLift + bundleLift + promotionLift + channelLift
  });
  const standardProfitPrediction = predictionProvider.predictProfit({
    sku,
    predictedRevenue: revenuePrediction.predicted_revenue,
    adsCost: recommendedAdsSpend
  });
  const explicitPriceSimulation = isPriceAction(action)
    ? simulatePriceActionProfit({
      sku,
      action,
      priceChange,
      simulatedPrice,
      recommendedAdsSpend,
      demandElasticity
    })
    : null;
  const estimatedRevenue = isHoldAction
    ? roundCurrency(sku.revenue)
    : explicitPriceSimulation
      ? explicitPriceSimulation.predicted_revenue
      : simulationEstimate
        ? roundCurrency(sku.revenue + simulationEstimate.revenue_simulation.incremental_revenue)
        : revenuePrediction.predicted_revenue;
  const predictedProfit = isHoldAction
    ? currentProfit
    : action === "STOP"
    ? 0
    : explicitPriceSimulation
      ? explicitPriceSimulation.predicted_profit
      : simulationEstimate
      ? roundCurrency(currentProfit + simulationEstimate.profit_simulation.expected_profit_impact)
      : standardProfitPrediction.predicted_profit;
  const predictedMargin = isHoldAction ? roundRatio(sku.margin) : action === "STOP" ? 0 : explicitPriceSimulation ? explicitPriceSimulation.predicted_margin : standardProfitPrediction.predicted_margin;
  const requiredInventory = isHoldAction
    ? sku.inventory
    : action === "STOP"
    ? 0
    : Math.ceil(Math.max(0, sku.quantity * safeRatio(estimatedRevenue, Math.max(1, sku.revenue))));
  const risk = predictionRisk(sku, revenuePrediction.confidence, action, requiredInventory);
  const profitDelta = isHoldAction
    ? 0
    : simulationEstimate
    ? simulationEstimate.profit_simulation.expected_profit_impact
    : roundCurrency(predictedProfit - currentProfit);
  const confidenceBreakdown = buildConfidenceBreakdown({
    sku,
    revenueConfidence: simulationEstimate?.confidence_breakdown.data_confidence ?? revenuePrediction.confidence,
    profitConfidence: predictedMargin >= 0 ? 0.82 : 0.46,
    requiredInventory,
    attributionConfidence: simulationEstimate?.confidence_breakdown.attribution_confidence ?? sku.prediction_confidence ?? 0.55,
    risk
  });
  const confidence = simulationEstimate?.confidence_breakdown.overall_confidence ?? confidenceBreakdown.overall_confidence;
  const feasibility = generatedAction?.feasibility ?? roundRatio(Math.max(0.1, 1 - risk));
  const lifecycleFit = lifecycleFitScore(action, lifecycle, thresholdProfile);
  const strategicFit = strategicFitScore(sku, action, profitDelta, lifecycle);
  const strategicValue = strategicValueScore(sku, action, lifecycle, thresholdProfile);
  const riskPenalty = riskPenaltyForAction(action, risk, profitDelta, thresholdProfile);
  const priceRiskPenalty = priceRiskPenaltyForAction({
    sku,
    action,
    priceChange,
    demandElasticity,
    requiredInventory,
    thresholdProfile
  });
  const actionScore = isHoldAction ? 0 : roundCurrency(profitDelta * confidence * feasibility * lifecycleFit * strategicValue - riskPenalty - priceRiskPenalty);
  const opportunityScore = roundCurrency(Math.max(0, actionScore));
  const requiredCash = roundCurrency(
    Math.max(0, recommendedAdsSpend - sku.ads_spend) +
      Math.max(0, requiredInventory - sku.inventory) * Math.max(0, sku.cogs)
  );
  const beforeState = {
    revenue: roundCurrency(sku.revenue),
    profit: currentProfit,
    ad_spend: roundCurrency(sku.ads_spend),
    price: roundCurrency(sku.price),
    inventory: sku.inventory,
    margin: roundRatio(sku.margin)
  };
  const afterState = {
    revenue: estimatedRevenue,
    profit: predictedProfit,
    ad_spend: recommendedAdsSpend,
    price: simulatedPrice,
    inventory_required: requiredInventory,
    margin: predictedMargin
  };

  return {
    sku: sku.sku,
    category: sku.category,
    channel: sku.channel,
    action,
    selected: action !== "STOP",
    current_price: roundCurrency(sku.price),
    simulated_price: simulatedPrice,
    current_ads_spend: roundCurrency(sku.ads_spend),
    recommended_ads_spend: recommendedAdsSpend,
    current_inventory: sku.inventory,
    required_inventory: requiredInventory,
    current_profit: currentProfit,
    predicted_revenue: estimatedRevenue,
    predicted_profit: predictedProfit,
    profit_delta: profitDelta,
    predicted_margin: predictedMargin,
    confidence,
    risk,
    revenue_prediction: revenuePrediction,
    demand_elasticity: demandElasticity,
    ads_response: adsResponse,
    simulation_estimate: simulationEstimate,
    predicted_cost: isHoldAction ? Math.max(0, sku.revenue - currentProfit) : action === "STOP" ? 0 : explicitPriceSimulation?.predicted_cost ?? standardProfitPrediction.predicted_cost,
    simulation_source: "prediction_model",
    simulation_horizon: {
      days: simulationHorizonDays,
      label: `${simulationHorizonDays} days`
    },
    prediction_type: predictionProvider.mode,
    confidence_breakdown: confidenceBreakdown,
    required_cash: requiredCash,
    prediction_models: [
      "revenue-prediction-model",
      "profit-prediction-model",
      "ads-response-model",
      "pricing-elasticity-model",
      "demand-forecast-model"
    ],
    why: explainSimulation(action, profitDelta, requiredInventory, sku.inventory),
    evidence: [
      `margin=${roundRatio(sku.margin)}`,
      `conversion_rate=${roundRatio(sku.conversion_rate)}`,
      `refund_rate=${roundRatio(sku.refund_rate)}`,
      `customer_ltv=${roundCurrency(sku.customer_ltv)}`,
      ...(lifecycle ? [`lifecycle_stage=${lifecycle.lifecycle_stage}`, `lifecycle_confidence=${lifecycle.confidence}`] : [])
    ],
    opportunity_type: generatedAction?.opportunity_type,
    generated_action: generatedAction?.action,
    lifecycle_stage: lifecycle?.lifecycle_stage,
    lifecycle,
    lifecycle_objective: lifecycleObjectiveWeights(lifecycle),
    opportunity_score: opportunityScore,
    action_score: actionScore,
    execution_feasibility: feasibility,
    strategic_value: strategicValue,
    risk_penalty: riskPenalty,
    price_risk_penalty: priceRiskPenalty,
    cash_impact: roundCurrency(requiredCash - Math.max(0, sku.net_profit < 0 ? 0 : 0)),
    time_to_impact: timeToImpact(action, requiredInventory, sku.inventory),
    risk_level: riskLevel(risk),
    market_reference_price: marketReasonablePrice(sku) ?? undefined,
    optimization_goal: optimizationGoalForAction(action, requiredInventory, sku.inventory),
    unified_action: unifiedActionForAction(action, requiredInventory, sku.inventory),
    strategic_fit: roundRatio(strategicFit * lifecycleFit),
    feasibility,
    evidence_tags: generatedAction?.signals ?? evidenceTagsForSku(sku, profitDelta, requiredInventory),
    policy_trace: generatedAction?.policy_trace,
    before_state: beforeState,
    after_state: afterState,
    revenue_delta: roundCurrency(afterState.revenue - beforeState.revenue),
    cost_delta: isHoldAction ? 0 : roundCurrency((action === "STOP" ? 0 : explicitPriceSimulation?.predicted_cost ?? standardProfitPrediction.predicted_cost) - Math.max(0, sku.revenue - currentProfit)),
    margin_change: roundRatio(afterState.margin - beforeState.margin),
    inventory_impact: requiredInventory - sku.inventory
  };
}

function buildIncrementalProfitSimulationEstimate(input: {
  sku: PortfolioSkuInput;
  action: PortfolioAction;
  ads: AdsCampaignInput[];
  allSkus: PortfolioSkuInput[];
  simulationHorizonDays: number;
  additionalAdSpend: number;
}): SimulationEstimate {
  const estimatedComponents: string[] = [];
  const warnings: string[] = [];
  const days = input.simulationHorizonDays || 30;
  const source = resolveRoasSource(input.sku, input.ads, input.allSkus);
  const currentSpend = Math.max(0, input.sku.ads_spend);
  const additionalAdSpend = roundCurrency(Math.max(0, input.additionalAdSpend));
  const scaleRatio = currentSpend > 0 ? additionalAdSpend / Math.max(1, currentSpend) : 0;
  const coldStartAds = currentSpend <= 0;
  const diminishingReturnFactor = coldStartAds
    ? 0.5
    : Math.max(0.35, 1 - scaleRatio * 0.28);
  if (coldStartAds) warnings.push("cold_start_ads");
  const marginalRoas = roundRatio(source.baseRoas * 0.65);
  const attributionConfidenceFactor = attributionFactor(source.predictionSource);
  const contributionMarginResult = contributionMargin(input.sku);
  if (contributionMarginResult.estimated) estimatedComponents.push("contribution_margin");
  const inventory = inventoryCapacity(input.sku, additionalAdSpend * marginalRoas * diminishingReturnFactor * attributionConfidenceFactor);
  if (inventory.estimated) estimatedComponents.push("inventory_capacity");
  const incrementalRevenue = roundCurrency(
    additionalAdSpend *
      marginalRoas *
      diminishingReturnFactor *
      attributionConfidenceFactor *
      inventory.factor
  );
  const futureDemandUnits = input.sku.price > 0 ? incrementalRevenue / input.sku.price : 0;
  const shippingCostPerUnit = input.sku.shipping_cost ?? portfolioAverage(input.allSkus, "shipping_cost") ?? 0;
  const fulfillmentCostPerUnit = input.sku.fulfillment_cost ?? portfolioAverage(input.allSkus, "fulfillment_cost") ?? 0;
  if (input.sku.shipping_cost === undefined) estimatedComponents.push("shipping_cost_per_unit");
  if (input.sku.fulfillment_cost === undefined) estimatedComponents.push("fulfillment_cost_per_unit");
  const feeRate = input.sku.fees !== undefined && input.sku.revenue > 0
    ? Math.max(0, input.sku.fees / input.sku.revenue)
    : 0.035;
  if (input.sku.fees === undefined) estimatedComponents.push("platform_payment_fee_rate");
  const platformFeeRate = feeRate * 0.7;
  const paymentFeeRate = feeRate * 0.3;
  const incrementalShippingCost = roundCurrency(futureDemandUnits * shippingCostPerUnit);
  const incrementalPlatformFee = roundCurrency(incrementalRevenue * platformFeeRate);
  const incrementalPaymentFee = roundCurrency(incrementalRevenue * paymentFeeRate);
  const expectedRefundCost = roundCurrency(incrementalRevenue * Math.max(0, input.sku.refund_rate));
  const incrementalFulfillmentCost = roundCurrency(futureDemandUnits * fulfillmentCostPerUnit);
  const grossIncrementalProfit = roundCurrency(incrementalRevenue * contributionMarginResult.margin);
  const incrementalProfit = roundCurrency(
    grossIncrementalProfit -
      additionalAdSpend -
      incrementalShippingCost -
      incrementalPlatformFee -
      incrementalPaymentFee -
      expectedRefundCost -
      incrementalFulfillmentCost
  );
  const dataConfidence = source.confidence;
  const attributionConfidence = attributionConfidenceFactor;
  const inventoryConfidence = inventory.estimated ? 0.45 : inventory.factor >= 0.95 ? 0.9 : Math.max(0.35, inventory.factor);
  const marginConfidence = contributionMarginResult.estimated ? 0.58 : 0.82;
  const overallConfidence = roundRatio(
    dataConfidence * 0.34 +
      attributionConfidence * 0.24 +
      inventoryConfidence * 0.2 +
      marginConfidence * 0.22
  );
  if (source.predictionSource !== "sku_historical_ads") warnings.push(`prediction_source=${source.predictionSource}`);
  if (inventory.factor < 0.8) warnings.push("inventory_capacity_limited");

  return {
    action_type: input.action === "TEST_AD_SPEND" ? "TEST_AD_SPEND" : "INCREASE_AD_SPEND",
    sku: input.sku.sku,
    simulation_window: {
      days
    },
    investment: {
      additional_ad_spend: additionalAdSpend,
      ad_budget_period: "simulation_window",
      daily_budget_delta: roundCurrency(additionalAdSpend / Math.max(1, days))
    },
    prediction_source: source.predictionSource,
    revenue_simulation: {
      base_roas: roundRatio(source.baseRoas),
      marginal_roas: marginalRoas,
      diminishing_return_factor: roundRatio(diminishingReturnFactor),
      attribution_confidence_factor: roundRatio(attributionConfidenceFactor),
      inventory_capacity_factor: roundRatio(inventory.factor),
      incremental_revenue: incrementalRevenue
    },
    cost_simulation: {
      additional_ad_spend: additionalAdSpend,
      incremental_shipping_cost: incrementalShippingCost,
      incremental_platform_fee: incrementalPlatformFee,
      incremental_payment_fee: incrementalPaymentFee,
      expected_refund_cost: expectedRefundCost,
      incremental_fulfillment_cost: incrementalFulfillmentCost
    },
    profit_simulation: {
      contribution_margin: roundRatio(contributionMarginResult.margin),
      gross_incremental_profit: grossIncrementalProfit,
      incremental_profit: incrementalProfit,
      expected_profit_impact: incrementalProfit
    },
    confidence_breakdown: {
      data_confidence: roundRatio(dataConfidence),
      attribution_confidence: roundRatio(attributionConfidence),
      inventory_confidence: roundRatio(inventoryConfidence),
      margin_confidence: roundRatio(marginConfidence),
      overall_confidence: Math.max(0.05, Math.min(0.95, overallConfidence))
    },
    estimated_components: Array.from(new Set(estimatedComponents)),
    warnings: Array.from(new Set(warnings))
  };
}

function usableRoas(row: AdsCampaignInput) {
  return typeof row.roas === "number" && Number.isFinite(row.roas) && row.roas > 0;
}

function resolveRoasSource(sku: PortfolioSkuInput, ads: AdsCampaignInput[], allSkus: PortfolioSkuInput[]) {
  const skuAds = ads.filter((row) => row.sku === sku.sku && row.spend > 0 && usableRoas(row));
  if (skuAds.length) {
    const confidence = skuAds.reduce((sum, row) => sum + (row.attribution_confidence ?? 0.86) * Math.max(1, row.spend), 0) /
      skuAds.reduce((sum, row) => sum + Math.max(1, row.spend), 0);
    return {
      predictionSource: skuAds.some((row) => row.attribution_source === "sku_allocation")
        ? "sku_allocation" as const
        : "sku_historical_ads" as const,
      baseRoas: weightedRoas(skuAds),
      confidence: Math.max(0.35, Math.min(0.86, confidence))
    };
  }

  const similarSkuIds = new Set(allSkus
    .filter((candidate) => candidate.sku !== sku.sku && isSimilarSku(sku, candidate))
    .map((candidate) => candidate.sku));
  const similarAds = ads.filter((row) => row.sku && similarSkuIds.has(row.sku) && row.spend > 0 && usableRoas(row));
  if (similarAds.length) {
    return {
      predictionSource: "similar_sku_benchmark" as const,
      baseRoas: median(similarAds.map((row) => row.roas).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)),
      confidence: similarAds.length >= 3 ? 0.74 : 0.62
    };
  }

  const channelAds = ads.filter((row) => row.channel && sku.channel && row.channel === sku.channel && row.spend > 0 && usableRoas(row));
  if (channelAds.length) {
    return {
      predictionSource: "channel_history" as const,
      baseRoas: weightedRoas(channelAds),
      confidence: 0.6
    };
  }

  const categoryAds = ads.filter((row) => row.category && sku.category && row.category === sku.category && row.spend > 0 && usableRoas(row));
  if (categoryAds.length) {
    return {
      predictionSource: "category_benchmark" as const,
      baseRoas: weightedRoas(categoryAds),
      confidence: 0.54
    };
  }

  const storeAds = ads.filter((row) => row.spend > 0 && usableRoas(row));
  if (storeAds.length) {
    return {
      predictionSource: "store_level_blended_roas_discounted" as const,
      baseRoas: weightedRoas(storeAds) * 0.6,
      confidence: 0.48
    };
  }

  return {
    predictionSource: "rule_based_conservative_fallback" as const,
    baseRoas: 1.5,
    confidence: 0.3
  };
}

function weightedRoas(rows: AdsCampaignInput[]) {
  const usableRows = rows.filter(usableRoas);
  return safeRatio(usableRows.reduce((sum, row) => sum + (row.roas ?? 0) * Math.max(1, row.spend), 0), usableRows.reduce((sum, row) => sum + Math.max(1, row.spend), 0));
}

function isSimilarSku(left: PortfolioSkuInput, right: PortfolioSkuInput) {
  return left.category === right.category ||
    left.channel === right.channel ||
    Math.abs(left.margin - right.margin) <= 0.12 ||
    Math.abs(safeRatio(left.price, Math.max(1, right.price)) - 1) <= 0.35;
}

function median(values: number[]) {
  if (!values.length) return 1.5;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function attributionFactor(source: SimulationEstimate["prediction_source"]) {
  if (source === "sku_historical_ads") return 0.85;
  if (source === "sku_allocation") return 0.72;
  if (source === "channel_history") return 0.58;
  if (source === "category_benchmark") return 0.5;
  if (source === "similar_sku_benchmark") return 0.55;
  if (source === "store_level_blended_roas_discounted") return 0.65;
  return 0.35;
}

function inventoryCapacity(sku: PortfolioSkuInput, estimatedIncrementalRevenue: number) {
  if (!Number.isFinite(sku.inventory)) return { factor: 0.75, estimated: true };
  const futureDemandUnits = sku.price > 0 ? estimatedIncrementalRevenue / sku.price : 0;
  if (futureDemandUnits <= 0) return { factor: 1, estimated: false };
  return {
    factor: Math.max(0, Math.min(1, sku.inventory / futureDemandUnits)),
    estimated: false
  };
}

function contributionMargin(sku: PortfolioSkuInput) {
  if (sku.revenue > 0 && Number.isFinite(sku.net_profit) && Number.isFinite(sku.ads_spend)) {
    return {
      margin: Math.max(0, Math.min(0.9, (sku.net_profit + sku.ads_spend) / sku.revenue)),
      estimated: false
    };
  }
  return {
    margin: Math.max(0, Math.min(0.9, sku.margin)),
    estimated: true
  };
}

function portfolioAverage(skus: PortfolioSkuInput[], key: "shipping_cost" | "fulfillment_cost") {
  const values = skus.map((sku) => sku[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isIncreaseAdSpendAction(action: PortfolioAction) {
  return action === "TEST_AD_SPEND" || action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE" || action === "SHIFT_CHANNEL";
}

function isPriceAction(action: PortfolioAction) {
  return action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST";
}

function simulatePriceActionProfit(input: {
  sku: PortfolioSkuInput;
  action: PortfolioAction;
  priceChange: number;
  simulatedPrice: number;
  recommendedAdsSpend: number;
  demandElasticity: DemandElasticityPrediction;
}) {
  const elasticity = typeof input.sku.price_elasticity === "number"
    ? input.sku.price_elasticity
    : input.demandElasticity.price_change !== 0
      ? input.demandElasticity.demand_change / input.demandElasticity.price_change
      : -0.8;
  const promotionLift = input.action === "PROMOTION_TEST" ? 0.08 : 0;
  const demandMultiplier = Math.max(0.25, 1 + input.priceChange * elasticity + promotionLift);
  const currentDemand = Math.max(0, input.sku.quantity);
  const newOrders = Math.max(0, currentDemand * demandMultiplier);
  const predictedRevenue = roundCurrency(input.simulatedPrice * newOrders);
  const cogs = roundCurrency(input.sku.cogs * newOrders);
  const shipping = roundCurrency((input.sku.shipping_cost ?? 1.25) * newOrders);
  const fees = roundCurrency(input.sku.fees != null
    ? input.sku.fees * safeRatio(predictedRevenue, Math.max(1, input.sku.revenue))
    : predictedRevenue * 0.035);
  const refunds = roundCurrency(predictedRevenue * Math.max(0, input.sku.refund_rate));
  const predictedCost = roundCurrency(cogs + input.recommendedAdsSpend + shipping + fees + refunds);
  const predictedProfit = roundCurrency(predictedRevenue - predictedCost);

  return {
    predicted_revenue: predictedRevenue,
    predicted_profit: predictedProfit,
    predicted_cost: predictedCost,
    predicted_margin: roundRatio(safeRatio(predictedProfit, predictedRevenue)),
    new_orders: roundRatio(newOrders),
    elasticity: roundRatio(elasticity)
  };
}

function priceChangeForAction(action: PortfolioAction) {
  if (action === "PRICE_UP_5" || action === "SCALE_ADS_PRICE_UP_5") return 0.05;
  if (action === "PRICE_UP_10") return 0.1;
  if (action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return -0.1;
  return 0;
}

function adsMultiplierForAction(action: PortfolioAction) {
  if (action === "TEST_AD_SPEND") return 1;
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return 1.45;
  if (action === "SHIFT_CHANNEL") return 1.18;
  if (action === "REDUCE_ADS") return 0.55;
  if (action === "STOP") return 0;
  return 1;
}

function strategicFitScore(sku: PortfolioSkuInput, action: PortfolioAction, profitDelta: number, lifecycle?: SkuLifecycleClassification) {
  const marginFit = sku.margin >= 0.35 ? 0.12 : sku.margin >= 0.2 ? 0.06 : -0.08;
  const demandFit = sku.sales_velocity > 0 ? Math.min(0.12, sku.sales_velocity / 160) : -0.06;
  const actionFit = action === "SCALE_ADS" || action === "RESTOCK_AND_SCALE" || action === "SCALE_ADS_PRICE_UP_5" || action === "TEST_AD_SPEND"
    ? 0.08
    : action === "REDUCE_ADS" || action === "STOP"
      ? sku.net_profit < 0 ? 0.12 : 0
      : 0.04;
  const deltaFit = profitDelta > 0 ? 0.08 : -0.12;
  const lifecycleFit = lifecycleStrategicFit(action, lifecycle);

  return roundRatio(Math.max(0.25, Math.min(1.35, 1 + marginFit + demandFit + actionFit + deltaFit + lifecycleFit)));
}

function strategicValueScore(sku: PortfolioSkuInput, action: PortfolioAction, lifecycle?: SkuLifecycleClassification, thresholdProfile?: DynamicThresholdProfile) {
  const lifecycleValue = lifecycleStrategicFit(action, lifecycle);
  const longTermGrowth = action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE" ? 0.22 : 0;
  const marginQuality = action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "REDUCE_ADS" ? Math.max(0.08, sku.margin * 0.28) : 0;
  const inventoryValue = action === "RESTOCK_AND_SCALE" || action === "REDUCE_INVENTORY" ? 0.16 : 0;
  const healthValue = action === "STOP" || action === "REDUCE_ADS" ? (sku.net_profit < 0 ? 0.28 : 0.08) : 0;
  const growthValue = action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" ? 0.1 : 0;
  const objectiveValue = thresholdProfile?.business_objective === "GROWTH" && (action === "SCALE_ADS" || action === "SHIFT_CHANNEL")
    ? 0.16
    : thresholdProfile?.business_objective === "PROFIT" && (action.includes("PRICE") || action === "REDUCE_ADS")
      ? 0.14
      : thresholdProfile?.business_objective === "CASH_RECOVERY" && (action === "REDUCE_INVENTORY" || action === "STOP" || action === "REDUCE_ADS")
        ? 0.18
        : 0;

  return roundRatio(Math.max(0.35, Math.min(1.55, 1 + lifecycleValue + longTermGrowth + marginQuality + inventoryValue + healthValue + growthValue + objectiveValue)));
}

function lifecycleFitScore(action: PortfolioAction, lifecycle?: SkuLifecycleClassification, thresholdProfile?: DynamicThresholdProfile) {
  if (isLowConfidenceLifecycle(lifecycle)) return 1;
  const stage = lifecycle?.lifecycle_stage;
  const adjustment = lifecycleThresholdMultiplier(thresholdProfile ?? defaultThresholdProfile(), stage);
  const base = 1 + lifecycleStrategicFit(action, lifecycle);

  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") {
    return roundRatio(Math.max(0.45, Math.min(1.45, base / adjustment.scale_ads_multiplier)));
  }
  if (action.includes("PRICE") || action === "PROMOTION_TEST") {
    return roundRatio(Math.max(0.45, Math.min(1.45, base / adjustment.price_multiplier)));
  }
  if (action === "REDUCE_ADS" || action === "REDUCE_INVENTORY" || action === "STOP") {
    return roundRatio(Math.max(0.45, Math.min(1.45, base / adjustment.cash_recovery_multiplier)));
  }
  if (action === "TEST_AD_SPEND" || action === "SHIFT_CHANNEL") {
    return roundRatio(Math.max(0.45, Math.min(1.45, base * adjustment.learning_value_multiplier)));
  }

  return roundRatio(Math.max(0.45, Math.min(1.45, base)));
}

function riskPenaltyForAction(action: PortfolioAction, risk: number, profitDelta: number, thresholdProfile?: DynamicThresholdProfile) {
  const actionRisk = action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5"
    ? 0.18
    : action === "SHIFT_CHANNEL" || action === "PRICE_UP_5" || action === "PRICE_UP_10"
      ? 0.1
      : action === "STOP"
        ? 0.14
        : 0.07;
  const objectiveDiscount = thresholdProfile?.business_objective === "GROWTH" && (action === "SCALE_ADS" || action === "SHIFT_CHANNEL")
    ? 0.88
    : thresholdProfile?.business_objective === "CASH_RECOVERY" && (action === "REDUCE_ADS" || action === "REDUCE_INVENTORY" || action === "STOP")
      ? 0.82
      : 1;
  return roundCurrency((risk + actionRisk) * Math.max(25, Math.abs(profitDelta)) * 0.42 * objectiveDiscount);
}

function priceRiskPenaltyForAction(input: {
  sku: PortfolioSkuInput;
  action: PortfolioAction;
  priceChange: number;
  demandElasticity: DemandElasticityPrediction;
  requiredInventory: number;
  thresholdProfile?: DynamicThresholdProfile;
}) {
  if (!(input.action === "PRICE_UP_5" || input.action === "PRICE_UP_10" || input.action === "SCALE_ADS_PRICE_UP_5")) return 0;

  const elasticity = typeof input.sku.price_elasticity === "number"
    ? input.sku.price_elasticity
    : input.demandElasticity.price_change !== 0
      ? input.demandElasticity.demand_change / input.demandElasticity.price_change
      : -0.8;
  const coverageDays = input.sku.sales_velocity > 0 ? input.sku.inventory / Math.max(0.1, input.sku.sales_velocity) : 999;
  const excessThreshold = input.thresholdProfile?.inventory_threshold.excess_coverage_days ?? 90;
  const restockThreshold = input.thresholdProfile?.inventory_threshold.restock_coverage_days ?? 21;
  const marketPrice = marketReasonablePrice(input.sku);
  const marketRisk = marketPrice && input.sku.price < marketPrice ? 0 : 0.28;
  const elasticityRisk = Math.max(0, Math.abs(Math.min(0, elasticity)) - 0.85);
  const demandVolatilityRisk = Math.max(0, -(input.sku.revenue_growth ?? 0)) + Math.max(0, -(input.sku.order_growth ?? 0)) + Math.max(0, -(input.sku.conversion_trend ?? 0));
  const inventoryPressureRisk = coverageDays > excessThreshold || coverageDays < restockThreshold ? 0.22 : 0;
  const risk = marketRisk + elasticityRisk + demandVolatilityRisk + inventoryPressureRisk;

  return roundCurrency(risk * Math.max(50, input.sku.revenue * Math.abs(input.priceChange) * Math.max(0.08, input.sku.margin)));
}

function marketReasonablePrice(sku: PortfolioSkuInput) {
  const prices = [
    sku.market_median_price,
    sku.competitor_price,
    sku.similar_sku_price,
    sku.market_price_high && sku.market_price_low ? (sku.market_price_high + sku.market_price_low) / 2 : undefined
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (!prices.length) return null;
  return prices.reduce((sum, value) => sum + value, 0) / prices.length;
}

function defaultThresholdProfile(): DynamicThresholdProfile {
  return {
    source: "system_default",
    business_objective: "BALANCED",
    industry: "general ecommerce",
    user_benchmark: { roas: 2.5, margin: 0.3, conversion_rate: 0.02, inventory_turnover: 0.18, cac: 35 },
    scale_ads_threshold: { marginal_roas: 2.2, confidence: 0.65, margin: 0.3, inventory_coverage_days: 30, customer_quality: 0.45 },
    price_threshold: { market_gap: 0.1, elasticity: -0.5, margin_headroom: 0.22, conversion_stability: 0.012 },
    channel_threshold: { channel_fit_score: 0.52, confidence: 0.58, margin: 0.24 },
    inventory_threshold: { restock_coverage_days: 21, excess_coverage_days: 90, turnover: 0.12 },
    portfolio_health_threshold: { marginal_roas: 1.35, minimum_profit: 0, confidence: 0.48, recovery_probability: 0.32 },
    lifecycle_adjustments: {
      LAUNCH: { scale_ads_multiplier: 1.35, price_multiplier: 1.15, cash_recovery_multiplier: 0.9, learning_value_multiplier: 1.35 },
      GROWTH: { scale_ads_multiplier: 0.9, price_multiplier: 1.05, cash_recovery_multiplier: 1, learning_value_multiplier: 1.05 },
      MATURE: { scale_ads_multiplier: 1.1, price_multiplier: 0.9, cash_recovery_multiplier: 0.85, learning_value_multiplier: 0.95 },
      DECLINING: { scale_ads_multiplier: 1.35, price_multiplier: 0.95, cash_recovery_multiplier: 0.72, learning_value_multiplier: 0.9 },
      UNKNOWN: { scale_ads_multiplier: 1.5, price_multiplier: 1, cash_recovery_multiplier: 1, learning_value_multiplier: 1.25 },
      INSUFFICIENT_HISTORY: { scale_ads_multiplier: 1.5, price_multiplier: 1, cash_recovery_multiplier: 1, learning_value_multiplier: 1.35 }
    }
  };
}

function hasRestockNeed(requiredInventory: number, currentInventory: number) {
  return requiredInventory > currentInventory;
}

function timeToImpact(action: PortfolioAction, requiredInventory = 0, currentInventory = 0): ProfitSimulationResult["time_to_impact"] {
  if (action === "REDUCE_ADS" || action === "STOP" || action === "PRICE_UP_5") return "immediate";
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "PRICE_UP_10") return "short";
  if (action === "SHIFT_CHANNEL" || action === "PROMOTION_TEST" || action === "CREATE_BUNDLE") return "medium";
  if (action === "RESTOCK_AND_SCALE") return hasRestockNeed(requiredInventory, currentInventory) ? "long" : "short";
  return "short";
}

function riskLevel(risk: number): ProfitSimulationResult["risk_level"] {
  if (risk >= 0.45) return "High";
  if (risk >= 0.22) return "Medium";
  return "Low";
}

function optimizationGoalForAction(action: PortfolioAction, requiredInventory = 0, currentInventory = 0): ProfitSimulationResult["optimization_goal"] {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE" || action === "TEST_AD_SPEND") return "GROWTH";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return "PROFIT";
  if (action === "RESTOCK_AND_SCALE") return hasRestockNeed(requiredInventory, currentInventory) ? "INVENTORY" : "GROWTH";
  if (action === "REDUCE_INVENTORY") return "INVENTORY";
  return "PORTFOLIO_HEALTH";
}

function unifiedActionForAction(action: PortfolioAction, requiredInventory = 0, currentInventory = 0): ProfitSimulationResult["unified_action"] {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "TEST_AD_SPEND") return "SCALE_ADS";
  if (action === "SHIFT_CHANNEL" || action === "CREATE_BUNDLE") return "EXPAND_CHANNEL";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return "OPTIMIZE_PRICE";
  if (action === "REDUCE_ADS") return "REALLOCATE_BUDGET";
  if (action === "RESTOCK_AND_SCALE") return hasRestockNeed(requiredInventory, currentInventory) ? "RESTOCK" : "SCALE_ADS";
  if (action === "REDUCE_INVENTORY") return "REDUCE_INVENTORY";
  if (action === "STOP") return "STOP_SKU";
  if (action === "HOLD") return "HOLD";
  return "REDUCE_WASTE";
}

function lifecycleStrategicFit(action: PortfolioAction, lifecycle?: SkuLifecycleClassification) {
  if (!lifecycle) return 0;
  if (isLowConfidenceLifecycle(lifecycle)) return 0;
  if (lifecycle.lifecycle_stage === "LAUNCH") {
    if (action === "TEST_AD_SPEND" || action === "PROMOTION_TEST" || action === "PRICE_DOWN_10") return 0.18;
    if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return -0.35;
  }
  if (lifecycle.lifecycle_stage === "GROWTH") {
    if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return 0.16;
    if (action === "STOP" || action === "REDUCE_ADS") return -0.18;
  }
  if (lifecycle.lifecycle_stage === "MATURE") {
    if (action === "SHIFT_CHANNEL" || action === "REDUCE_INVENTORY" || action === "REDUCE_ADS") return 0.12;
    if (action === "PRICE_UP_5" || action === "PRICE_UP_10") return 0.04;
    if (action === "SCALE_ADS_PRICE_UP_5") return -0.1;
  }
  if (lifecycle.lifecycle_stage === "DECLINING") {
    if (action === "REDUCE_ADS" || action === "REDUCE_INVENTORY" || action === "STOP" || action === "PRICE_DOWN_10") return 0.18;
    if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return -0.35;
  }
  return 0;
}

function lifecycleObjectiveWeights(lifecycle?: SkuLifecycleClassification) {
  if (!lifecycle) return undefined;
  if (isLowConfidenceLifecycle(lifecycle)) return undefined;
  if (lifecycle.lifecycle_stage === "LAUNCH") return { profit_growth: 0.18, cash_efficiency: 0.22, learning_value: 0.6 };
  if (lifecycle.lifecycle_stage === "GROWTH") return { profit_growth: 0.68, cash_efficiency: 0.17, learning_value: 0.15 };
  if (lifecycle.lifecycle_stage === "MATURE") return { profit_growth: 0.36, cash_efficiency: 0.44, learning_value: 0.2 };
  return { profit_growth: 0.16, cash_efficiency: 0.66, learning_value: 0.18 };
}

function isLowConfidenceLifecycle(lifecycle?: SkuLifecycleClassification) {
  return !lifecycle ||
    lifecycle.lifecycle_confidence === "LOW" ||
    lifecycle.lifecycle_stage === "UNKNOWN" ||
    lifecycle.lifecycle_stage === "INSUFFICIENT_HISTORY";
}

function buildConfidenceBreakdown(input: {
  sku: PortfolioSkuInput;
  revenueConfidence: number;
  profitConfidence: number;
  requiredInventory: number;
  attributionConfidence: number;
  risk: number;
}): ConfidenceBreakdown {
  const inventoryConfidence = input.requiredInventory <= input.sku.inventory
    ? 0.9
    : input.sku.inventory > 0
      ? 0.58
      : 0.35;
  const attributionConfidence = Math.max(0.2, Math.min(0.95, input.attributionConfidence));
  const blendedOverall = roundRatio(
    input.revenueConfidence * 0.34 +
      input.profitConfidence * 0.28 +
      inventoryConfidence * 0.2 +
      attributionConfidence * 0.18 -
      input.risk * 0.12
  );
  const overall = Math.min(blendedOverall, attributionConfidence + 0.22);

  return {
    revenue_prediction_confidence: roundRatio(input.revenueConfidence),
    profit_model_confidence: roundRatio(input.profitConfidence),
    inventory_confidence: roundRatio(inventoryConfidence),
    attribution_confidence: roundRatio(attributionConfidence),
    overall_confidence: Math.max(0.05, Math.min(0.95, roundRatio(overall)))
  };
}

function predictionRisk(sku: PortfolioSkuInput, confidence: number, action: PortfolioAction, requiredInventory: number) {
  const confidenceRisk = confidence < 0.6 ? 0.2 : 0.05;
  const inventoryRisk = requiredInventory > sku.inventory && action !== "RESTOCK_AND_SCALE" ? 0.22 : 0;
  const demandRisk = sku.conversion_rate < 0.01 ? 0.14 : 0;
  const refundRisk = sku.refund_rate > 0.2 ? 0.12 : 0;
  return roundRatio(Math.min(0.85, confidenceRisk + inventoryRisk + demandRisk + refundRisk));
}

function evidenceTagsForSku(sku: PortfolioSkuInput, profitDelta: number, requiredInventory: number) {
  const tags: string[] = [];
  if (sku.margin >= 0.25) tags.push("high_margin");
  if (profitDelta > 0) tags.push("positive_incremental_profit");
  if (requiredInventory <= sku.inventory) tags.push("inventory_available");
  if (sku.conversion_rate > 0) tags.push("conversion_data_available");
  return tags.length ? tags : ["baseline_simulation"];
}

function explainSimulation(action: PortfolioAction, profitDelta: number, requiredInventory = 0, currentInventory = 0) {
  if (action === "TEST_AD_SPEND") return "Small budget test is simulated to collect SKU-level paid response data before scaling ads.";
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5") return "Ads scaling is simulated because marginal paid demand can lift long-term expected profit.";
  if (action === "REDUCE_ADS") return "Ad spend is reduced because current paid efficiency does not justify the budget level.";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10") return "Price lift is simulated because margin expansion can offset demand elasticity.";
  if (action === "PRICE_DOWN_10") return "Price reduction is simulated to test whether demand expansion offsets lower unit margin.";
  if (action === "RESTOCK_AND_SCALE") {
    return hasRestockNeed(requiredInventory, currentInventory)
      ? "Inventory expansion is simulated before scaling demand to avoid stock-constrained growth."
      : "Demand scaling is simulated because current inventory can support the expected growth window.";
  }
  if (action === "SHIFT_CHANNEL") return "Channel shift is simulated to test whether budget performs better in the stronger commerce channel.";
  if (action === "CREATE_BUNDLE") return "Bundle optimization is simulated to test whether AOV expansion increases contribution profit.";
  if (action === "PROMOTION_TEST") return "Promotion test is simulated with a bounded discount to test conversion lift against margin loss.";
  if (action === "REDUCE_INVENTORY") return "Inventory reduction is simulated to release cash from low-return stock exposure.";
  if (action === "STOP") return "SKU is removed from the active portfolio if predicted profit is below the minimum threshold.";
  return profitDelta >= 0 ? "Hold is simulated as the baseline operating plan." : "Hold is retained only as a baseline comparison.";
}
