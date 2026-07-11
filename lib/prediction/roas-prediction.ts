import { roundRatio, safeRatio, type CommerceSkuState } from "@/lib/optimization/objective";

export type RoasPrediction = {
  skuId: string;
  predictedRoas: number;
  confidence: number;
};

export function predictSkuRoas(sku: CommerceSkuState): RoasPrediction {
  const observedRoas = sku.roas ?? safeRatio(sku.revenue, sku.adSpend);
  const margin = sku.margin ?? safeRatio(sku.grossProfit, sku.revenue);
  const inventoryFactor = sku.inventory > sku.salesVelocity * 14 ? 1 : 0.85;
  const predictedRoas = roundRatio(Math.max(0, observedRoas * (0.8 + margin * 0.25) * inventoryFactor));

  return {
    skuId: sku.skuId,
    predictedRoas,
    confidence: roundRatio(Math.max(0.35, Math.min(0.9, sku.adSpend > 0 ? 0.72 : 0.45)))
  };
}

export function predictRoas(skus: CommerceSkuState[]) {
  return skus.map(predictSkuRoas);
}
