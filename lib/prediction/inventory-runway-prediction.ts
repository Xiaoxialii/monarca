import { roundRatio, type CommerceSkuState } from "@/lib/optimization/objective";

export type InventoryRunwayPrediction = {
  skuId: string;
  runwayDays: number | null;
  constrained: boolean;
  confidence: number;
};

export function predictSkuInventoryRunway(sku: CommerceSkuState): InventoryRunwayPrediction {
  if (sku.salesVelocity <= 0) {
    return {
      skuId: sku.skuId,
      runwayDays: null,
      constrained: false,
      confidence: 0.4
    };
  }

  const runwayDays = roundRatio(sku.inventory / sku.salesVelocity);

  return {
    skuId: sku.skuId,
    runwayDays,
    constrained: runwayDays < 14,
    confidence: roundRatio(Math.max(0.45, Math.min(0.9, 0.65 + Math.min(runwayDays, 30) / 120)))
  };
}

export function predictInventoryRunway(skus: CommerceSkuState[]) {
  return skus.map(predictSkuInventoryRunway);
}
