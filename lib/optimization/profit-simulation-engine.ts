import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";
import { createPredictionProvider, seasonalFactor, type PredictionProvider } from "@/lib/optimization/prediction-provider";
import type { GeneratedAction } from "@/lib/optimization/action-generator";

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
}): ProfitSimulationResult[] {
  const skuById = new Map(input.skus.map((sku) => [sku.sku, sku]));
  const provider = input.predictionProvider ?? createPredictionProvider();

  return input.actions.flatMap((action) => {
    const sku = skuById.get(action.sku);
    if (!sku) return [];
    return [simulateSkuAction(sku, action.portfolio_action, input.ads ?? [], action, provider, input.simulationHorizonDays)];
  });
}

export function simulateSkuAction(
  sku: PortfolioSkuInput,
  action: PortfolioAction,
  ads: AdsCampaignInput[] = [],
  generatedAction?: GeneratedAction,
  predictionProvider: PredictionProvider = createPredictionProvider(),
  simulationHorizonDays = 30
): ProfitSimulationResult {
  const priceChange = priceChangeForAction(action);
  const adsMultiplier = adsMultiplierForAction(action);
  const restockLift = action === "RESTOCK_AND_SCALE" ? 0.16 : action === "REDUCE_INVENTORY" ? -0.04 : 0;
  const bundleLift = action === "CREATE_BUNDLE" ? 0.08 : 0;
  const promotionLift = action === "PROMOTION_TEST" ? 0.06 : 0;
  const channelLift = action === "SHIFT_CHANNEL" ? 0.05 : 0;
  const currentProfit = roundCurrency(sku.net_profit);
  const simulatedPrice = roundCurrency(Math.max(0.01, sku.price * (1 + priceChange)));
  const recommendedAdsSpend = roundCurrency(Math.max(0, sku.ads_spend * adsMultiplier));
  const demandForecast = predictionProvider.predictDemand(sku);
  const demandElasticity = predictionProvider.predictPriceElasticity(sku, priceChange);
  const adsResponse = predictionProvider.predictAdResponse({
    sku,
    ads,
    additionalSpend: recommendedAdsSpend - sku.ads_spend
  });
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
  const predictedProfit = action === "STOP"
    ? 0
    : profitPrediction.predicted_profit;
  const predictedMargin = action === "STOP" ? 0 : profitPrediction.predicted_margin;
  const requiredInventory = action === "STOP"
    ? 0
    : Math.ceil(Math.max(0, sku.quantity * safeRatio(revenuePrediction.predicted_revenue, Math.max(1, sku.revenue))));
  const risk = predictionRisk(sku, revenuePrediction.confidence, action, requiredInventory);
  const profitDelta = roundCurrency(predictedProfit - currentProfit);
  const confidenceBreakdown = buildConfidenceBreakdown({
    sku,
    revenueConfidence: revenuePrediction.confidence,
    profitConfidence: profitPrediction.predicted_margin >= 0 ? 0.82 : 0.46,
    requiredInventory,
    attributionConfidence: sku.prediction_confidence ?? 0.55,
    risk
  });
  const confidence = confidenceBreakdown.overall_confidence;
  const feasibility = generatedAction?.feasibility ?? roundRatio(Math.max(0.1, 1 - risk));
  const strategicFit = strategicFitScore(sku, action, profitDelta);
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
    revenue: revenuePrediction.predicted_revenue,
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
    predicted_revenue: revenuePrediction.predicted_revenue,
    predicted_profit: predictedProfit,
    profit_delta: profitDelta,
    predicted_margin: predictedMargin,
    confidence,
    risk,
    revenue_prediction: revenuePrediction,
    demand_elasticity: demandElasticity,
    ads_response: adsResponse,
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
      `customer_ltv=${roundCurrency(sku.customer_ltv)}`
    ],
    opportunity_type: generatedAction?.opportunity_type,
    generated_action: generatedAction?.action,
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

function priceChangeForAction(action: PortfolioAction) {
  if (action === "PRICE_UP_5" || action === "SCALE_ADS_PRICE_UP_5") return 0.05;
  if (action === "PRICE_UP_10") return 0.1;
  if (action === "PRICE_DOWN_10" || action === "PROMOTION_TEST") return -0.1;
  return 0;
}

function adsMultiplierForAction(action: PortfolioAction) {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5" || action === "RESTOCK_AND_SCALE") return 1.45;
  if (action === "SHIFT_CHANNEL") return 1.18;
  if (action === "REDUCE_ADS") return 0.55;
  if (action === "STOP") return 0;
  return 1;
}

function strategicFitScore(sku: PortfolioSkuInput, action: PortfolioAction, profitDelta: number) {
  const marginFit = sku.margin >= 0.35 ? 0.12 : sku.margin >= 0.2 ? 0.06 : -0.08;
  const demandFit = sku.sales_velocity > 0 ? Math.min(0.12, sku.sales_velocity / 160) : -0.06;
  const actionFit = action === "SCALE_ADS" || action === "RESTOCK_AND_SCALE" || action === "SCALE_ADS_PRICE_UP_5"
    ? 0.08
    : action === "REDUCE_ADS" || action === "STOP"
      ? sku.net_profit < 0 ? 0.12 : 0
      : 0.04;
  const deltaFit = profitDelta > 0 ? 0.08 : -0.12;

  return roundRatio(Math.max(0.25, Math.min(1.25, 1 + marginFit + demandFit + actionFit + deltaFit)));
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
