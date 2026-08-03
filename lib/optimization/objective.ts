import { calculateSkuProfitability } from "@/lib/profit/canonical-profitability-engine";

export type CommerceSkuState = {
  skuId: string;
  revenue: number;
  quantity: number;
  grossProfit: number;
  netProfit?: number;
  cogs?: number;
  operatingCost?: number;
  adSpend: number;
  inventory: number;
  salesVelocity: number;
  cac?: number;
  roas?: number;
  margin?: number;
};

export type CommerceState = {
  skus: CommerceSkuState[];
  constraints: {
    budgetLimit: number;
    cashFlowLimit?: number;
    minRoas?: number;
    maxCac?: number;
  };
  policyWeights?: PolicyWeights;
};

export type PolicyWeights = {
  profit: number;
  roas: number;
  inventory: number;
  cac: number;
  stability: number;
};

export type DecisionAction = "SCALE" | "STOP" | "FIX";

export type Decision = {
  skuId: string;
  action: DecisionAction;
  confidence: number;
  expectedProfitImpact: number;
};

export type OptimizationCandidate = Decision & {
  expectedAdSpend: number;
  expectedInventoryUse: number;
  objectiveScore: number;
  reasons: string[];
};

export const defaultPolicyWeights: PolicyWeights = {
  profit: 1,
  roas: 0.2,
  inventory: 0.15,
  cac: 0.15,
  stability: 0.1
};

export function calculateCommerceSkuProfitability(sku: CommerceSkuState) {
  const cogs = sku.cogs ?? Math.max(0, sku.revenue - sku.grossProfit);

  return calculateSkuProfitability({
    revenue: sku.revenue,
    cogs,
    fulfillmentCost: sku.operatingCost ?? 0,
    adSpend: sku.adSpend,
    cogsStatus: sku.cogs != null ? "AVAILABLE" : "ESTIMATED",
    cogsConfidence: sku.cogs != null ? 1 : 0.6,
    adAllocationMethod: sku.adSpend > 0 ? "UNKNOWN" : "DIRECT_SKU",
    attributionConfidence: sku.adSpend > 0 ? 0.25 : 1
  });
}

export function commerceSkuNetProfit(sku: CommerceSkuState) {
  return roundCurrency(sku.netProfit ?? calculateCommerceSkuProfitability(sku).net_profit);
}

export function commerceSkuMargin(sku: CommerceSkuState) {
  return sku.margin ?? calculateCommerceSkuProfitability(sku).margin;
}

export function calculateProfitObjective(candidates: OptimizationCandidate[]) {
  return roundCurrency(candidates.reduce((sum, candidate) => sum + candidate.expectedProfitImpact - candidate.expectedAdSpend, 0));
}

export function buildOptimizationCandidates(sku: CommerceSkuState, weights: PolicyWeights = defaultPolicyWeights): OptimizationCandidate[] {
  const baselineProfit = commerceSkuNetProfit(sku);
  const roas = sku.roas ?? safeRatio(sku.revenue, sku.adSpend);
  const margin = commerceSkuMargin(sku);
  const scaleProfitImpact = roundCurrency(Math.max(0, baselineProfit * 0.16 + sku.grossProfit * 0.04));
  const fixProfitImpact = roundCurrency(Math.max(0, Math.abs(Math.min(0, baselineProfit)) * 0.35 + sku.revenue * Math.max(0, 0.18 - margin)));
  const stopProfitImpact = roundCurrency(sku.adSpend + Math.abs(Math.min(0, baselineProfit)));

  return [
    scoreCandidate({
      skuId: sku.skuId,
      action: "SCALE",
      confidence: confidenceFromSignals([baselineProfit > 0, roas >= 1.5, sku.inventory > sku.salesVelocity * 14]),
      expectedProfitImpact: scaleProfitImpact,
      expectedAdSpend: roundCurrency(Math.max(10, sku.adSpend * 0.18)),
      expectedInventoryUse: roundRatio(Math.max(1, sku.salesVelocity * 7)),
      reasons: ["positive_profit", "scale_candidate"]
    }, sku, weights),
    scoreCandidate({
      skuId: sku.skuId,
      action: "STOP",
      confidence: confidenceFromSignals([baselineProfit < 0, roas < 1, sku.adSpend > 0]),
      expectedProfitImpact: stopProfitImpact,
      expectedAdSpend: 0,
      expectedInventoryUse: 0,
      reasons: ["profit_leakage_control", "stop_loss_candidate"]
    }, sku, weights),
    scoreCandidate({
      skuId: sku.skuId,
      action: "FIX",
      confidence: confidenceFromSignals([margin < 0.18, roas < 1.5, sku.inventory <= sku.salesVelocity * 14]),
      expectedProfitImpact: fixProfitImpact,
      expectedAdSpend: roundCurrency(Math.max(0, sku.adSpend * 0.05)),
      expectedInventoryUse: roundRatio(Math.max(0, sku.salesVelocity * 3)),
      reasons: ["margin_or_inventory_repair", "stability_candidate"]
    }, sku, weights)
  ];
}

function scoreCandidate(
  candidate: Omit<OptimizationCandidate, "objectiveScore">,
  sku: CommerceSkuState,
  weights: PolicyWeights
): OptimizationCandidate {
  const roas = sku.roas ?? safeRatio(sku.revenue, sku.adSpend);
  const cacPenalty = sku.cac ? sku.cac * weights.cac : 0;
  const inventoryPenalty = candidate.expectedInventoryUse > sku.inventory ? weights.inventory * 100 : 0;
  const stabilityBonus = candidate.action === "FIX" ? weights.stability * 25 : 0;
  const objectiveScore = roundCurrency(
    candidate.expectedProfitImpact * weights.profit +
      roas * weights.roas * 20 +
      stabilityBonus -
      candidate.expectedAdSpend -
      cacPenalty -
      inventoryPenalty
  );

  return {
    ...candidate,
    objectiveScore
  };
}

function confidenceFromSignals(signals: boolean[]) {
  const positive = signals.filter(Boolean).length;
  return roundRatio(Math.max(0.35, Math.min(0.95, 0.45 + positive * 0.16)));
}

export function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? roundRatio(numerator / denominator) : 0;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
