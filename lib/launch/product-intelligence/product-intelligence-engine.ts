import type { LaunchProductInput } from "@/lib/launch/new-product-launch-optimizer";

export type LaunchSeasonality = "spring" | "summer" | "fall" | "winter" | "evergreen";

export type ProductIntelligence = {
  category_id: string;
  category: string;
  price_band: "value" | "mid_market" | "premium";
  margin: number;
  product_type: "visual_product" | "utility_product" | "search_product";
  visual_score: number;
  customer_segment: string;
  seasonality: LaunchSeasonality;
  purchase_intent: number;
  feature_vector: {
    category_id: string;
    price_percentile: number;
    margin: number;
    visual_score: number;
    seasonality: LaunchSeasonality;
    customer_segment: string;
    purchase_intent: number;
  };
  signals: string[];
};

export function analyzeProductIntelligence(product: LaunchProductInput): ProductIntelligence {
  const categoryText = `${product.category} ${product.subcategory} ${product.productDescription}`.toLowerCase();
  const margin = product.sellingPrice > 0
    ? (product.sellingPrice - product.cogs - product.fulfillmentCost) / product.sellingPrice
    : 0;
  const visualKeywords = /(dress|fashion|beauty|jewelry|home|decor|lamp|style|summer|ceramic|case)/i;
  const searchKeywords = /(replacement|part|tool|office|organizer|travel|case|adapter)/i;
  const visual_score = visualKeywords.test(categoryText) ? 86 : 58;
  const product_type = visual_score >= 78
    ? "visual_product"
    : searchKeywords.test(categoryText)
      ? "search_product"
      : "utility_product";
  const price_band = product.sellingPrice < 30 ? "value" : product.sellingPrice <= 90 ? "mid_market" : "premium";
  const price_percentile = price_band === "value" ? 0.28 : price_band === "mid_market" ? 0.62 : 0.88;
  const seasonality = /summer|dress|vacation|travel/i.test(categoryText)
    ? "summer"
    : /holiday|gift|winter/i.test(categoryText)
      ? "winter"
      : "evergreen";

  const category_id = normalizeCategoryId(product.category || "uncategorized");
  const purchase_intent = Math.round(
    Math.min(96, Math.max(35, visual_score * 0.42 + price_percentile * 24 + Math.max(0, margin) * 100 * 0.34))
  );

  return {
    category_id,
    category: product.category || "Uncategorized",
    price_band,
    margin: Math.round(margin * 10000) / 100,
    product_type,
    visual_score,
    customer_segment: product.targetCustomer || "General ecommerce buyers",
    seasonality,
    purchase_intent,
    feature_vector: {
      category_id,
      price_percentile,
      margin,
      visual_score,
      seasonality,
      customer_segment: product.targetCustomer || "General ecommerce buyers",
      purchase_intent
    },
    signals: [
      visual_score >= 78 ? "Visual Product: High" : "Visual Product: Moderate",
      product.sellingPrice < 75 ? "Impulse Purchase: High" : "Impulse Purchase: Medium",
      margin >= 0.4 ? "Margin: Strong" : "Margin: Moderate",
      `Purchase intent: ${purchase_intent}/100`,
      `Seasonality: ${seasonality}`
    ]
  };
}

function normalizeCategoryId(category: string) {
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "uncategorized";
}
