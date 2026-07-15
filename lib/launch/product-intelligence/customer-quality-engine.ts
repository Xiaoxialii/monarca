import type { ProductIntelligence } from "@/lib/launch/product-intelligence/product-intelligence-engine";

export type CustomerQualitySignal = {
  audience_quality_score: number;
  best_customer_segment: string;
  expected_ltv: number;
  conversion_rate: number;
  repeat_purchase_probability: number;
  cac: number;
  score_components: {
    conversion_rate_score: number;
    repeat_rate_score: number;
    ltv_index_score: number;
    engagement_score: number;
  };
  formula: "conversion_rate_40_repeat_30_ltv_20_engagement_10";
  signals: string[];
};

export function analyzeCustomerQuality(intelligence: ProductIntelligence, price: number): CustomerQualitySignal {
  const visualBoost = intelligence.product_type === "visual_product" ? 12 : 4;
  const marginBoost = intelligence.margin >= 40 ? 8 : 2;
  const conversion_rate = Math.round((2.9 + visualBoost / 12 + marginBoost / 20) * 10) / 10;
  const repeat_purchase_probability = intelligence.category.toLowerCase().includes("fashion") ? 32 : 24;
  const expected_ltv = Math.round(price * (1.35 + repeat_purchase_probability / 100));
  const cac = Math.round(Math.max(7, price * 0.22) * 100) / 100;
  const conversion_rate_score = Math.min(100, conversion_rate * 18);
  const repeat_rate_score = Math.min(100, repeat_purchase_probability * 2.4);
  const ltv_index_score = Math.min(100, (expected_ltv / Math.max(price, 1)) * 42);
  const engagement_score = Math.min(100, intelligence.purchase_intent);
  const audience_quality_score = Math.round(
    conversion_rate_score * 0.4 +
    repeat_rate_score * 0.3 +
    ltv_index_score * 0.2 +
    engagement_score * 0.1
  );

  return {
    audience_quality_score,
    best_customer_segment: intelligence.customer_segment,
    expected_ltv,
    conversion_rate,
    repeat_purchase_probability,
    cac,
    score_components: {
      conversion_rate_score: Math.round(conversion_rate_score),
      repeat_rate_score: Math.round(repeat_rate_score),
      ltv_index_score: Math.round(ltv_index_score),
      engagement_score: Math.round(engagement_score)
    },
    formula: "conversion_rate_40_repeat_30_ltv_20_engagement_10",
    signals: [
      audience_quality_score >= 75 ? "High intent audience detected" : "Moderate intent audience detected",
      `Conversion: +${Math.round(conversion_rate * 5)}% vs baseline`,
      `Repeat purchase probability: ${repeat_purchase_probability}%`,
      `Expected LTV: $${expected_ltv.toLocaleString()}`
    ]
  };
}
