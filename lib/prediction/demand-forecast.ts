import { roundRatio, type CommerceSkuState } from "@/lib/optimization/objective";

export type DemandForecast = {
  skuId: string;
  forecastQuantity: number;
  horizonDays: number;
  confidence: number;
};

export function forecastSkuDemand(sku: CommerceSkuState, horizonDays = 30): DemandForecast {
  const velocity = Math.max(0, sku.salesVelocity);
  const inventoryCap = Math.max(0, sku.inventory);
  const unconstrainedDemand = velocity * horizonDays;
  const forecastQuantity = roundRatio(Math.min(unconstrainedDemand, inventoryCap));
  const inventoryCoverage = velocity > 0 ? inventoryCap / velocity : 0;

  return {
    skuId: sku.skuId,
    forecastQuantity,
    horizonDays,
    confidence: roundRatio(Math.max(0.35, Math.min(0.9, 0.55 + Math.min(inventoryCoverage, horizonDays) / horizonDays * 0.25)))
  };
}

export function forecastDemand(skus: CommerceSkuState[], horizonDays = 30) {
  return skus.map((sku) => forecastSkuDemand(sku, horizonDays));
}
