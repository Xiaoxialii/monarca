import type { LaunchProductInput } from "@/lib/launch/new-product-launch-optimizer";
import type { CustomerQualitySignal } from "@/lib/launch/product-intelligence/customer-quality-engine";
import type { ProductIntelligence } from "@/lib/launch/product-intelligence/product-intelligence-engine";
import type { SimilarProductResult } from "@/lib/launch/product-intelligence/similar-product-engine";

export type LaunchChannel = "TikTok" | "Shopify" | "Amazon" | "Meta";

export type ChannelFit = {
  channel: LaunchChannel;
  score: number;
  score_components: {
    category_fit: number;
    customer_fit: number;
    historical_performance: number;
    margin_fit: number;
    competition_adjustment: number;
  };
  reason: string[];
};

export function calculateChannelFit(
  product: LaunchProductInput,
  intelligence: ProductIntelligence,
  similar: SimilarProductResult,
  customer: CustomerQualitySignal
): ChannelFit[] {
  const marginFit = Math.min(100, Math.max(30, intelligence.margin * 2));
  const historical = Math.min(100, similar.average_roas * 20);
  const customerFit = Math.min(100, customer.audience_quality_score);
  const visual = intelligence.visual_score;
  const priceCompetition = product.sellingPrice > 90 ? 58 : 78;

  const weightedScore = (components: ChannelFit["score_components"]) => Math.round(
    components.category_fit * 0.25 +
    components.customer_fit * 0.2 +
    components.historical_performance * 0.25 +
    components.margin_fit * 0.18 +
    components.competition_adjustment * 0.12
  );

  const tiktokComponents = {
    category_fit: visual,
    customer_fit: customerFit,
    historical_performance: historical,
    margin_fit: marginFit,
    competition_adjustment: priceCompetition
  };
  const shopifyComponents = {
    category_fit: Math.max(65, visual * 0.72),
    customer_fit: Math.min(100, customerFit + 8),
    historical_performance: historical * 0.9,
    margin_fit: Math.min(100, marginFit + 12),
    competition_adjustment: 84
  };
  const amazonComponents = {
    category_fit: intelligence.product_type === "search_product" ? 88 : 66,
    customer_fit: customerFit * 0.82,
    historical_performance: historical * 0.86,
    margin_fit: marginFit * 0.78,
    competition_adjustment: product.sellingPrice < 25 ? 62 : 73
  };
  const metaComponents = {
    category_fit: visual * 0.88,
    customer_fit: customerFit,
    historical_performance: historical * 0.8,
    margin_fit: marginFit * 0.86,
    competition_adjustment: 75
  };

  const scores: ChannelFit[] = [
    {
      channel: "TikTok",
      score: weightedScore(tiktokComponents),
      score_components: tiktokComponents,
      reason: ["Visual category", "High similar SKU ROAS", "Fast demand discovery"]
    },
    {
      channel: "Shopify",
      score: weightedScore(shopifyComponents),
      score_components: shopifyComponents,
      reason: ["Higher margin capture", "Own customer data", "Better LTV validation"]
    },
    {
      channel: "Amazon",
      score: weightedScore(amazonComponents),
      score_components: amazonComponents,
      reason: ["Search validation", "Marketplace demand signal", "Useful long-tail demand"]
    },
    {
      channel: "Meta",
      score: weightedScore(metaComponents),
      score_components: metaComponents,
      reason: ["Audience retargeting", "Creative testing", "Lookalike segment learning"]
    }
  ];

  return scores
    .map((item) => ({ ...item, score: Math.max(45, Math.min(94, item.score)) }))
    .sort((a, b) => b.score - a.score);
}
