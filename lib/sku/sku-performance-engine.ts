import { runSkuIntelligence } from "@/lib/sku/sku-intelligence-engine";

type CanonicalRow = Record<string, unknown>;

export type SkuPerformanceOutput = ReturnType<typeof computeSkuPerformance>;

export function computeSkuPerformance(input: {
  orderItems: CanonicalRow[];
  products: CanonicalRow[];
}) {
  const intelligence = runSkuIntelligence(input);

  return {
    sku_metrics: intelligence.sku_metrics.map((row, index) => ({
      sku: row.sku,
      revenue: row.revenue,
      quantity: row.quantity,
      product_id: row.product_id,
      variant_id: row.variant_id,
      share: row.share,
      rank: index + 1,
      unmapped: row.unmapped
    })),
    metadata: intelligence.metadata
  };
}
