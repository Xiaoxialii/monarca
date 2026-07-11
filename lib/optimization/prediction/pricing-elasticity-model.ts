import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";

export type PricingElasticityModelInput = {
  sku: string;
  historical_price: number;
  quantity: number;
  revenue: number;
  margin: number;
  customer_ltv?: number;
  category?: string;
};

export type PricingElasticityModelOutput = {
  current_price: number;
  simulated_price: number;
  price_change: number;
  demand_change: number;
  revenue_change: number;
  profit_change: number;
  confidence: number;
};

export function predictPricingElasticity(input: PricingElasticityModelInput, priceChange: number, maxPriceChange = 0.2): PricingElasticityModelOutput {
  const boundedPriceChange = Math.max(-Math.abs(maxPriceChange), Math.min(Math.abs(maxPriceChange), priceChange));
  const normalizedCategory = input.category?.toLowerCase() ?? "";
  const baseElasticity = normalizedCategory.includes("fashion") || normalizedCategory.includes("apparel") ? -1.32 : -1.04;
  const ltvBuffer = Math.min(0.2, safeRatio(input.customer_ltv ?? 0, Math.max(1, input.historical_price * 10)) * 0.08);
  const demandChange = boundedPriceChange * baseElasticity + Math.max(0, boundedPriceChange) * ltvBuffer;
  const revenueAfterDemand = input.revenue * (1 + boundedPriceChange) * Math.max(0, 1 + demandChange);
  const profitChange = roundCurrency((revenueAfterDemand - input.revenue) * Math.max(0.05, input.margin));
  const confidence = Math.max(0.32, Math.min(0.9, 0.62 + (input.quantity > 50 ? 0.1 : 0) - Math.abs(boundedPriceChange) * 1.1));

  return {
    current_price: roundCurrency(input.historical_price),
    simulated_price: roundCurrency(input.historical_price * (1 + boundedPriceChange)),
    price_change: roundRatio(boundedPriceChange),
    demand_change: roundRatio(demandChange),
    revenue_change: roundCurrency(revenueAfterDemand - input.revenue),
    profit_change: profitChange,
    confidence: roundRatio(confidence)
  };
}
