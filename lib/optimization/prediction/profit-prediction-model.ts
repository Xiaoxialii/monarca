import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";

export type ProfitPredictionInput = {
  predicted_revenue: number;
  current_revenue: number;
  quantity: number;
  cogs: number;
  ads_cost: number;
  shipping_cost?: number;
  fees?: number;
  refund_rate: number;
};

export type ProfitPredictionOutput = {
  predicted_cost: number;
  predicted_profit: number;
  predicted_margin: number;
  cost_breakdown: {
    cogs: number;
    ads: number;
    shipping: number;
    fees: number;
    refunds: number;
  };
};

export function predictProfit(input: ProfitPredictionInput): ProfitPredictionOutput {
  const cogsRatio = safeRatio(input.cogs * Math.max(1, input.quantity), Math.max(1, input.current_revenue));
  const cogs = roundCurrency(input.predicted_revenue * cogsRatio);
  const shipping = roundCurrency(input.shipping_cost ?? input.quantity * 1.25);
  const fees = roundCurrency(input.fees ?? input.predicted_revenue * 0.035);
  const refunds = roundCurrency(input.predicted_revenue * Math.max(0, input.refund_rate));
  const predictedCost = roundCurrency(cogs + input.ads_cost + shipping + fees + refunds);
  const predictedProfit = roundCurrency(input.predicted_revenue - predictedCost);

  return {
    predicted_cost: predictedCost,
    predicted_profit: predictedProfit,
    predicted_margin: roundRatio(safeRatio(predictedProfit, input.predicted_revenue)),
    cost_breakdown: {
      cogs,
      ads: roundCurrency(input.ads_cost),
      shipping,
      fees,
      refunds
    }
  };
}
