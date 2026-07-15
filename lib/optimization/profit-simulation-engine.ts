import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";
import { createPredictionProvider, seasonalFactor, type PredictionProvider } from "@/lib/optimization/prediction-provider";
import type { GeneratedAction } from "@/lib/optimization/action-generator";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";

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
  refund_rate: number;
  customer_ltv: number;
  conversion_rate: number;
  prediction_confidence?: number;
  shipping_cost?: number;
  fees?: number;
  fulfillment_cost?: number;
  revenue_growth?: number;
  order_count?: number;
  customer_count?: number;
  repeat_rate?: number;
  product_age_days?: number;
};

export type AdsCampaignInput = {
  campaign_id: string;
  sku?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
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
  prediction_source: "sku_historical_ads" | "similar_sku_benchmark" | "store_level_blended_roas_discounted" | "rule_based_conservative_fallback";
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
  strategic_fit: number;
  feasibility: number;
  evidence_tags: string[];
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
}): ProfitSimulationResult[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));
  const provider = input.predictionProvider ?? createPredictionProvider();

  return input.actions.flatMap((action) => {
    const sku = skuById.get(action.sku);
    if (!sku) return [];
    return [simulateSkuAction(sku, action.portfolio_action, input.ads ?? [], action, provider, input.simulationHorizonDays, input.skus, input.lifecycleBySku?.get(action.sku))];
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
  lifecycle?: SkuLifecycleClassification
): ProfitSimulationResult {
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
  const profitPrediction = predictionProvider.predictProfit({
    sku,
    predictedRevenue: revenuePrediction.predicted_revenue,
    adsCost: recommendedAdsSpend
  });
  const estimatedRevenue = simulationEstimate
    ? roundCurrency(sku.revenue + simulationEstimate.revenue_simulation.incremental_revenue)
    : revenuePrediction.predicted_revenue;
  const predictedProfit = action === "STOP"
    ? 0
    : simulationEstimate
      ? roundCurrency(currentProfit + simulationEstimate.profit_simulation.expected_profit_impact)
      : profitPrediction.predicted_profit;
  const predictedMargin = action === "STOP" ? 0 : profitPrediction.predicted_margin;
  const requiredInventory = action === "STOP"
    ? 0
    : Math.ceil(Math.max(0, sku.quantity * safeRatio(estimatedRevenue, Math.max(1, sku.revenue))));
  const risk = predictionRisk(sku, revenuePrediction.confidence, action, requiredInventory);
  const profitDelta = simulationEstimate
    ? simulationEstimate.profit_simulation.expected_profit_impact
    : roundCurrency(predictedProfit - currentProfit);
  const confidenceBreakdown = buildConfidenceBreakdown({
    sku,
    revenueConfidence: simulationEstimate?.confidence_breakdown.data_confidence ?? revenuePrediction.confidence,
    profitConfidence: profitPrediction.predicted_margin >= 0 ? 0.82 : 0.46,
    requiredInventory,
    attributionConfidence: simulationEstimate?.confidence_breakdown.attribution_confidence ?? sku.prediction_confidence ?? 0.55,
    risk
  });
  const confidence = simulationEstimate?.confidence_breakdown.overall_confidence ?? confidenceBreakdown.overall_confidence;
  const feasibility = generatedAction?.feasibility ?? roundRatio(Math.max(0.1, 1 - risk));
  const strategicFit = strategicFitScore(sku, action, profitDelta, lifecycle);
  const opportunityScore = roundCurrency(Math.max(0, profitDelta) * confidence * feasibility * strategicFit);
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
    predicted_cost: action === "STOP" ? 0 : profitPrediction.predicted_cost,
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
    why: explainSimulation(action, profitDelta),
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
    strategic_fit: strategicFit,
    feasibility,
    evidence_tags: generatedAction?.signals ?? evidenceTagsForSku(sku, profitDelta, requiredInventory),
    before_state: beforeState,
    after_state: afterState,
    revenue_delta: roundCurrency(afterState.revenue - beforeState.revenue),
    cost_delta: roundCurrency((action === "STOP" ? 0 : profitPrediction.predicted_cost) - Math.max(0, sku.revenue - currentProfit)),
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

function resolveRoasSource(sku: PortfolioSkuInput, ads: AdsCampaignInput[], allSkus: PortfolioSkuInput[]) {
  const skuAds = ads.filter((row) => row.sku === sku.sku && row.spend > 0);
  if (skuAds.length) {
    return {
      predictionSource: "sku_historical_ads" as const,
      baseRoas: weightedRoas(skuAds),
      confidence: 0.86
    };
  }

  const similarSkuIds = new Set(allSkus
    .filter((candidate) => candidate.sku !== sku.sku && isSimilarSku(sku, candidate))
    .map((candidate) => candidate.sku));
  const similarAds = ads.filter((row) => row.sku && similarSkuIds.has(row.sku) && row.spend > 0);
  if (similarAds.length) {
    return {
      predictionSource: "similar_sku_benchmark" as const,
      baseRoas: median(similarAds.map((row) => row.roas).filter((value) => Number.isFinite(value) && value > 0)),
      confidence: similarAds.length >= 3 ? 0.74 : 0.62
    };
  }

  const storeAds = ads.filter((row) => row.spend > 0);
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
  return safeRatio(rows.reduce((sum, row) => sum + row.roas * Math.max(1, row.spend), 0), rows.reduce((sum, row) => sum + Math.max(1, row.spend), 0));
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

function lifecycleStrategicFit(action: PortfolioAction, lifecycle?: SkuLifecycleClassification) {
  if (!lifecycle) return 0;
  if (lifecycle.lifecycle_stage === "LAUNCH") {
    if (action === "TEST_AD_SPEND" || action === "PROMOTION_TEST" || action === "PRICE_DOWN_10") return 0.18;
    if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return -0.35;
  }
  if (lifecycle.lifecycle_stage === "GROWTH") {
    if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return 0.16;
    if (action === "STOP" || action === "REDUCE_ADS") return -0.18;
  }
  if (lifecycle.lifecycle_stage === "MATURE") {
    if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "SHIFT_CHANNEL" || action === "REDUCE_INVENTORY") return 0.14;
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
  if (lifecycle.lifecycle_stage === "LAUNCH") return { profit_growth: 0.18, cash_efficiency: 0.22, learning_value: 0.6 };
  if (lifecycle.lifecycle_stage === "GROWTH") return { profit_growth: 0.68, cash_efficiency: 0.17, learning_value: 0.15 };
  if (lifecycle.lifecycle_stage === "MATURE") return { profit_growth: 0.36, cash_efficiency: 0.44, learning_value: 0.2 };
  return { profit_growth: 0.16, cash_efficiency: 0.66, learning_value: 0.18 };
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

function explainSimulation(action: PortfolioAction, profitDelta: number) {
  if (action === "TEST_AD_SPEND") return "Small budget test is simulated to collect SKU-level paid response data before scaling ads.";
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5") return "Ads scaling is simulated because marginal paid demand can lift long-term expected profit.";
  if (action === "REDUCE_ADS") return "Ad spend is reduced because current paid efficiency does not justify the budget level.";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10") return "Price lift is simulated because margin expansion can offset demand elasticity.";
  if (action === "PRICE_DOWN_10") return "Price reduction is simulated to test whether demand expansion offsets lower unit margin.";
  if (action === "RESTOCK_AND_SCALE") return "Inventory expansion is simulated before scaling demand to avoid stock-constrained growth.";
  if (action === "SHIFT_CHANNEL") return "Channel shift is simulated to test whether budget performs better in the stronger commerce channel.";
  if (action === "CREATE_BUNDLE") return "Bundle optimization is simulated to test whether AOV expansion increases contribution profit.";
  if (action === "PROMOTION_TEST") return "Promotion test is simulated with a bounded discount to test conversion lift against margin loss.";
  if (action === "REDUCE_INVENTORY") return "Inventory reduction is simulated to release cash from low-return stock exposure.";
  if (action === "STOP") return "SKU is removed from the active portfolio if predicted profit is below the minimum threshold.";
  return profitDelta >= 0 ? "Hold is simulated as the baseline operating plan." : "Hold is retained only as a baseline comparison.";
}
