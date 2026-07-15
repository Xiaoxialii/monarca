import type { LaunchProductInput } from "@/lib/launch/new-product-launch-optimizer";
import type { CustomerQualitySignal } from "@/lib/launch/product-intelligence/customer-quality-engine";
import type { ProductIntelligence } from "@/lib/launch/product-intelligence/product-intelligence-engine";
import type { SimilarProductResult } from "@/lib/launch/product-intelligence/similar-product-engine";

export type LaunchDemandForecast = {
  day_7_demand: number;
  day_14_demand: number;
  day_30_demand: number;
  expected_orders: number;
  expected_revenue: number;
  expected_profit: number;
  confidence: number;
  algorithm: "weighted_similar_sku_forecast";
  weighted_order_formula: string;
};

export function forecastLaunchDemand(
  product: LaunchProductInput,
  intelligence: ProductIntelligence,
  similar: SimilarProductResult,
  customer: CustomerQualitySignal
): LaunchDemandForecast {
  const weightedOrdersNumerator = similar.similar_products.reduce(
    (sum, item) => sum + item.first_30_day_sales * item.similarity_score,
    0
  );
  const similarityTotal = similar.similar_products.reduce((sum, item) => sum + item.similarity_score, 0) || 1;
  const similarOrders = weightedOrdersNumerator / similarityTotal;
  const inventoryCap = product.initialInventory * 0.95;
  const qualityFactor = customer.audience_quality_score / 76;
  const visualFactor = intelligence.visual_score / 82;
  const expected_orders = Math.round(Math.min(inventoryCap, similarOrders * qualityFactor * visualFactor));
  const expected_revenue = Math.round(expected_orders * product.sellingPrice);
  const contributionMargin = product.sellingPrice > 0
    ? Math.max(0.08, (product.sellingPrice - product.cogs - product.fulfillmentCost) / product.sellingPrice)
    : 0.35;
  const expected_profit = Math.round(expected_revenue * contributionMargin - expected_orders * customer.cac);
  const confidence = Math.round(Math.min(86, 54 + similar.analyzed_count * 1.2 + customer.audience_quality_score * 0.18));

  return {
    day_7_demand: Math.round(expected_orders * 0.18),
    day_14_demand: Math.round(expected_orders * 0.43),
    day_30_demand: expected_orders,
    expected_orders,
    expected_revenue,
    expected_profit,
    confidence,
    algorithm: "weighted_similar_sku_forecast",
    weighted_order_formula: "sum(similarity_i * historical_orders_i) / sum(similarity_i)"
  };
}
