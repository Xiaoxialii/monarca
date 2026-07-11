import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { AdsResponseModelOutput } from "@/lib/optimization/prediction/ads-response-model";
import type { DemandForecastOutput } from "@/lib/optimization/prediction/demand-forecast-model";
import type { PricingElasticityModelOutput } from "@/lib/optimization/prediction/pricing-elasticity-model";

export type RevenueScenario = "hold" | "increase_ads" | "decrease_ads" | "price_change" | "channel_shift" | "restock";

export type RevenuePredictionInput = {
  sku: string;
  historical_revenue: number;
  sales_velocity: number;
  price: number;
  ads_spend: number;
  channel?: string;
  seasonality?: number;
  scenario: RevenueScenario;
  ads_response: AdsResponseModelOutput;
  pricing_elasticity: PricingElasticityModelOutput;
  demand_forecast: DemandForecastOutput;
  restock_lift?: number;
  base_confidence?: number;
};

export type RevenuePredictionOutput = {
  predicted_revenue: number;
  confidence: number;
  model: "historical_response_weighted_regression";
};

export function predictRevenue(input: RevenuePredictionInput): RevenuePredictionOutput {
  const channelFactor = input.channel === "amazon" ? 1.025 : input.channel === "shopify" ? 1.018 : 1;
  const seasonality = input.seasonality ?? 1;
  const demandTrend = Math.max(-0.45, Math.min(0.6, input.demand_forecast.demand_trend));
  const priceDemandChange = input.pricing_elasticity.demand_change;
  const restockLift = input.restock_lift ?? 0;
  const baseRevenue = input.historical_revenue * Math.max(0.25, 1 + demandTrend * 0.35 + priceDemandChange + restockLift);
  const predictedRevenue = roundCurrency(Math.max(0, baseRevenue * seasonality * channelFactor + input.ads_response.incremental_revenue));
  const confidence = roundRatio(Math.max(0.24, Math.min(0.95,
    (input.base_confidence ?? 0.68) * 0.35 +
      input.ads_response.confidence * 0.25 +
      input.pricing_elasticity.confidence * 0.2 +
      input.demand_forecast.confidence * 0.2
  )));

  return {
    predicted_revenue: predictedRevenue,
    confidence,
    model: "historical_response_weighted_regression"
  };
}
