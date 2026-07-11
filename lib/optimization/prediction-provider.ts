import { predictAdsResponse as predictAdsResponseModel } from "@/lib/optimization/prediction/ads-response-model";
import { forecastDemand } from "@/lib/optimization/prediction/demand-forecast-model";
import { predictPricingElasticity } from "@/lib/optimization/prediction/pricing-elasticity-model";
import { predictProfit } from "@/lib/optimization/prediction/profit-prediction-model";
import { predictRevenue as predictRevenueModel } from "@/lib/optimization/prediction/revenue-prediction-model";
import type {
  AdsCampaignInput,
  PortfolioAction,
  PortfolioSkuInput
} from "@/lib/optimization/profit-simulation-engine";
import type { PricingElasticityModelOutput } from "@/lib/optimization/prediction/pricing-elasticity-model";
import type { RevenuePredictionOutput } from "@/lib/optimization/prediction/revenue-prediction-model";

export type PredictionProviderMode = "rule_based" | "statistical" | "ml_model";

export type PredictionProvider = {
  mode: PredictionProviderMode;
  predictDemand(input: PortfolioSkuInput): ReturnType<typeof forecastDemand>;
  predictPriceElasticity(input: PortfolioSkuInput, priceChange: number): PricingElasticityModelOutput;
  predictAdResponse(input: {
    sku: PortfolioSkuInput;
    ads: AdsCampaignInput[];
    additionalSpend: number;
  }): ReturnType<typeof predictAdsResponseModel>;
  predictRevenue(input: {
    sku: PortfolioSkuInput;
    action: PortfolioAction;
    seasonality: number;
    priceChange: number;
    adsResponse: ReturnType<typeof predictAdsResponseModel>;
    priceElasticity: PricingElasticityModelOutput;
    demandForecast: ReturnType<typeof forecastDemand>;
    restockLift: number;
  }): RevenuePredictionOutput;
  predictProfit(input: {
    sku: PortfolioSkuInput;
    predictedRevenue: number;
    adsCost: number;
  }): ReturnType<typeof predictProfit>;
};

export function createPredictionProvider(mode: PredictionProviderMode = "rule_based"): PredictionProvider {
  return {
    mode,
    predictDemand(input) {
      return forecastDemand({
        sku: input.sku,
        quantity: input.quantity,
        sales_velocity: input.sales_velocity,
        inventory: input.inventory,
        conversion_rate: input.conversion_rate,
        seasonality: seasonalFactor(input.category)
      });
    },
    predictPriceElasticity(input, priceChange) {
      return predictPricingElasticity({
        sku: input.sku,
        historical_price: input.price,
        quantity: input.quantity,
        revenue: input.revenue,
        margin: input.margin,
        customer_ltv: input.customer_ltv,
        category: input.category
      }, priceChange, 0.2);
    },
    predictAdResponse(input) {
      return predictAdsResponseModel({
        sku: input.sku.sku,
        campaign_history: input.ads,
        spend: input.sku.ads_spend,
        additional_spend: input.additionalSpend,
        revenue: input.sku.revenue,
        margin: input.sku.margin
      });
    },
    predictRevenue(input) {
      return predictRevenueModel({
        sku: input.sku.sku,
        historical_revenue: input.sku.revenue,
        sales_velocity: input.sku.sales_velocity,
        price: input.sku.price,
        ads_spend: input.sku.ads_spend,
        channel: input.sku.channel,
        seasonality: input.seasonality,
        scenario: scenarioForAction(input.action),
        ads_response: input.adsResponse,
        pricing_elasticity: input.priceElasticity,
        demand_forecast: input.demandForecast,
        restock_lift: input.restockLift,
        base_confidence: input.sku.prediction_confidence
      });
    },
    predictProfit(input) {
      return predictProfit({
        predicted_revenue: input.predictedRevenue,
        current_revenue: input.sku.revenue,
        quantity: input.sku.quantity,
        cogs: input.sku.cogs,
        ads_cost: input.adsCost,
        shipping_cost: input.sku.shipping_cost,
        fees: input.sku.fees,
        refund_rate: input.sku.refund_rate
      });
    }
  };
}

export function seasonalFactor(category?: string) {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("seasonal")) return 1.08;
  if (normalized.includes("evergreen")) return 1.02;
  return 1;
}

export function scenarioForAction(action: PortfolioAction) {
  if (action === "SCALE_ADS" || action === "SCALE_ADS_PRICE_UP_5") return "increase_ads";
  if (action === "REDUCE_ADS") return "decrease_ads";
  if (action === "PRICE_UP_5" || action === "PRICE_UP_10" || action === "PRICE_DOWN_10") return "price_change";
  if (action === "RESTOCK_AND_SCALE") return "restock";
  return "hold";
}
