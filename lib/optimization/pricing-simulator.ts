import { roundCurrency } from "@/lib/optimization/objective";
import { simulateSkuAction, type PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";

export type PricingPlan = {
  sku: string;
  current_price: number;
  optimal_price: number;
  expected_profit_delta: number;
  simulations: Array<{
    price_change: "-10%" | "+5%" | "+10%";
    simulated_price: number;
    revenue_change: number;
    demand_change: number;
    profit_change: number;
  }>;
  why: string;
  confidence: number;
};

export function simulatePricingOptimization(skus: PortfolioSkuInput[]): PricingPlan[] {
  return skus
    .map((sku) => {
      const down = simulateSkuAction(sku, "PRICE_DOWN_10");
      const up5 = simulateSkuAction(sku, "PRICE_UP_5");
      const up10 = simulateSkuAction(sku, "PRICE_UP_10");
      const simulations = [
        toPriceSimulation("-10%", sku.revenue, down),
        toPriceSimulation("+5%", sku.revenue, up5),
        toPriceSimulation("+10%", sku.revenue, up10)
      ];
      const best = [down, up5, up10].sort((left, right) => right.profit_delta - left.profit_delta)[0];

      return {
        sku: sku.sku,
        current_price: roundCurrency(sku.price),
        optimal_price: best.simulated_price,
        expected_profit_delta: best.profit_delta,
        simulations,
        why: best.profit_delta > 0
          ? "Price elasticity simulation indicates this price point produces the strongest expected profit."
          : "No tested price move improves profit enough to justify a price change.",
        confidence: best.confidence
      };
    })
    .filter((plan) => plan.expected_profit_delta > 0)
    .sort((left, right) => right.expected_profit_delta - left.expected_profit_delta);
}

function toPriceSimulation(
  label: "-10%" | "+5%" | "+10%",
  currentRevenue: number,
  result: ReturnType<typeof simulateSkuAction>
) {
  return {
    price_change: label,
    simulated_price: result.simulated_price,
    revenue_change: roundCurrency(result.predicted_revenue - currentRevenue),
    demand_change: result.demand_elasticity.demand_change,
    profit_change: result.profit_delta
  };
}
