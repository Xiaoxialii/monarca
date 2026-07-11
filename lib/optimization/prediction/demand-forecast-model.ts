import { roundRatio } from "@/lib/optimization/objective";

export type DemandForecastInput = {
  sku: string;
  quantity: number;
  sales_velocity: number;
  inventory: number;
  conversion_rate: number;
  seasonality?: number;
};

export type DemandForecastOutput = {
  future_demand: number;
  sales_velocity: number;
  demand_trend: number;
  inventory_consumption: number;
  confidence: number;
};

export function forecastDemand(input: DemandForecastInput): DemandForecastOutput {
  const velocity = Math.max(0, input.sales_velocity || input.quantity / 30);
  const seasonality = input.seasonality ?? 1;
  const conversionSignal = input.conversion_rate >= 0.04 ? 1.08 : input.conversion_rate <= 0.01 ? 0.88 : 1;
  const futureDemand = Math.max(0, velocity * 30 * seasonality * conversionSignal);
  const trend = velocity > 0 ? futureDemand / Math.max(1, input.quantity) - 1 : 0;
  const inventoryConsumption = Math.min(input.inventory, futureDemand);
  const confidence = Math.max(0.3, Math.min(0.94, 0.64 + Math.min(0.16, velocity / 100) + (input.quantity > 20 ? 0.08 : 0) - (input.inventory <= 0 ? 0.12 : 0)));

  return {
    future_demand: Math.round(futureDemand),
    sales_velocity: roundRatio(velocity),
    demand_trend: roundRatio(trend),
    inventory_consumption: Math.round(inventoryConsumption),
    confidence: roundRatio(confidence)
  };
}
