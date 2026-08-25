import { AdvertisingMappingStatus, CreativeAttributionLevel } from "@prisma/client";
import {
  CANONICAL_PROFITABILITY_ENGINE_VERSION,
  calculateSkuProfitability
} from "@/lib/profit/canonical-profitability-engine";
import {
  CREATIVE_ATTRIBUTION_VERSION,
  CREATIVE_DATA_VERSION,
  type CreativeIntelligencePerformanceDaily,
  type CreativeReadinessDecision
} from "@/lib/ads/creative-intelligence/types";
import {
  configuredCreativeAnalysisThresholds,
  evaluateCreativeReadiness
} from "@/lib/ads/creative-intelligence/data-quality";

export type CreativeSkuEconomics = {
  sku: string;
  revenue?: number | null;
  cogs?: number | null;
  shippingCost?: number | null;
  fulfillmentCost?: number | null;
  platformFee?: number | null;
  paymentFee?: number | null;
  refundCost?: number | null;
  cogsStatus?: "AVAILABLE" | "ESTIMATED" | "MISSING" | null;
  cogsConfidence?: number | null;
  costCompleteness?: number | null;
};

export type CreativeProfitMapping = {
  id?: string | null;
  sku?: string | null;
  status: string;
  mappingConfidence: number;
  mappingVersion?: number | null;
  mappingMethod?: string | null;
};

export type CreativeProfitSnapshotInput = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceAdId?: string | null;
  sourceCreativeId?: string | null;
  creativeAssetId?: string | null;
  metricScope?: string;
  attributionLevel?: CreativeAttributionLevel;
  attributionMethod?: string;
  attributionConfidence?: number;
  mapping?: CreativeProfitMapping | null;
  performanceRows: CreativeIntelligencePerformanceDaily[];
  skuEconomics?: CreativeSkuEconomics | null;
  dateWindowStart: Date;
  dateWindowEnd: Date;
  multiAssetNotAttributable?: boolean;
  multiSkuUnallocated?: boolean;
};

export type CreativeProfitSnapshotOutput = {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceAdId?: string | null;
  sourceCreativeId?: string | null;
  creativeAssetId?: string | null;
  sku?: string | null;
  metricScope: string;
  attributionLevel: CreativeAttributionLevel;
  attributionMethod: string;
  attributionConfidence: number;
  mappingId?: string | null;
  mappingVersion: number;
  profitabilityEngineVersion: string;
  attributionVersion: string;
  dataVersion: string;
  dateWindowStart: Date;
  dateWindowEnd: Date;
  adSpend?: number | null;
  attributedOrders?: number | null;
  attributedRevenue?: number | null;
  attributedCogs?: number | null;
  attributedOperatingCost?: number | null;
  attributedContributionProfit?: number | null;
  netProfitAfterAds?: number | null;
  netMargin?: number | null;
  roas?: number | null;
  contributionRoas?: number | null;
  profitPerAdDollar?: number | null;
  cac?: number | null;
  breakEvenRoas?: number | null;
  breakEvenCpa?: number | null;
  costCompleteness: number;
  readiness: CreativeReadinessDecision["readiness"];
  canCompareAssets: boolean;
  comparisonBlockReason?: string | null;
  warningsJson: Record<string, unknown>;
};

export function calculateCreativeProfitSnapshot(input: CreativeProfitSnapshotInput): CreativeProfitSnapshotOutput {
  const metrics = aggregatePerformance(input.performanceRows);
  const attributionConfidence = clamp(input.attributionConfidence ?? average(input.performanceRows.map((row) => row.attributionConfidence)) ?? 0);
  const mapping = input.mapping ?? null;
  const skuEconomics = input.skuEconomics ?? null;
  const costCompleteness = clamp(skuEconomics?.costCompleteness ?? inferCostCompleteness(skuEconomics));
  const hasReliableMapping = mapping?.status === AdvertisingMappingStatus.AUTO_CONFIRMED || mapping?.status === AdvertisingMappingStatus.MANUALLY_CONFIRMED;
  const criticalMissing: string[] = [];
  if (!skuEconomics || skuEconomics.cogsStatus === "MISSING" || !numberValue(skuEconomics.cogs)) criticalMissing.push("cost.unit_cost_or_cogs");
  if (!skuEconomics || costCompleteness < 0.75) criticalMissing.push("operating_costs");

  const readiness = evaluateCreativeReadiness({
    runningDays: activeDayCount(input.performanceRows),
    impressions: metrics.impressions,
    outboundClicks: metrics.outboundClicks,
    spend: metrics.spend,
    mappingStatus: mapping?.status ?? null,
    mappingConfidence: mapping?.mappingConfidence ?? 0,
    attributionConfidence,
    costCompleteness,
    hasMissingCogs: criticalMissing.includes("cost.unit_cost_or_cogs"),
    hasMissingOperatingCosts: criticalMissing.includes("operating_costs"),
    multiAssetNotAttributable: input.multiAssetNotAttributable,
    multiSkuUnallocated: input.multiSkuUnallocated,
    thresholds: configuredCreativeAnalysisThresholds()
  });

  const revenue = metrics.revenue;
  const economicsRevenue = numberValue(skuEconomics?.revenue);
  const revenueShare = economicsRevenue > 0 ? Math.min(1, revenue / economicsRevenue) : 1;
  const cogs = scaleCost(skuEconomics?.cogs, revenueShare);
  const shipping = scaleCost(skuEconomics?.shippingCost, revenueShare);
  const fulfillment = scaleCost(skuEconomics?.fulfillmentCost, revenueShare);
  const platformFee = scaleCost(skuEconomics?.platformFee, revenueShare);
  const paymentFee = scaleCost(skuEconomics?.paymentFee, revenueShare);
  const refundCost = scaleCost(skuEconomics?.refundCost, revenueShare);
  const canComputeProfit = hasReliableMapping && !criticalMissing.length;
  const profitability = canComputeProfit
    ? calculateSkuProfitability({
        sku: mapping?.sku ?? undefined,
        revenue,
        cogs,
        shippingCost: shipping,
        fulfillmentCost: fulfillment,
        platformFee,
        paymentFee,
        refundCost,
        adSpend: metrics.spend,
        cogsStatus: skuEconomics?.cogsStatus ?? undefined,
        cogsConfidence: skuEconomics?.cogsConfidence ?? undefined,
        adAllocationMethod: "DIRECT_SKU",
        attributionConfidence,
        criticalFieldsMissing: criticalMissing
      })
    : null;
  const contributionProfit = profitability?.contribution_profit ?? null;
  const breakEvenRoas = contributionProfit !== null && revenue > 0 ? round(metrics.spend / revenue) : null;

  return {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    provider: input.provider,
    sourceAccountId: input.sourceAccountId,
    sourceAdId: input.sourceAdId ?? null,
    sourceCreativeId: input.sourceCreativeId ?? null,
    creativeAssetId: input.creativeAssetId ?? null,
    sku: mapping?.sku ?? null,
    metricScope: input.metricScope ?? "AD",
    attributionLevel: input.attributionLevel ?? CreativeAttributionLevel.AD,
    attributionMethod: input.attributionMethod ?? "AD_LEVEL_MAPPING",
    attributionConfidence,
    mappingId: mapping?.id ?? null,
    mappingVersion: mapping?.mappingVersion ?? 1,
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    attributionVersion: CREATIVE_ATTRIBUTION_VERSION,
    dataVersion: CREATIVE_DATA_VERSION,
    dateWindowStart: input.dateWindowStart,
    dateWindowEnd: input.dateWindowEnd,
    adSpend: metrics.spend,
    attributedOrders: metrics.purchases,
    attributedRevenue: revenue,
    attributedCogs: profitability?.cogs ?? null,
    attributedOperatingCost: profitability?.operating_cost ?? null,
    attributedContributionProfit: contributionProfit,
    netProfitAfterAds: profitability?.net_profit ?? null,
    netMargin: profitability?.margin ?? null,
    roas: metrics.spend > 0 ? round(revenue / metrics.spend) : null,
    contributionRoas: contributionProfit !== null && metrics.spend > 0 ? round(contributionProfit / metrics.spend) : null,
    profitPerAdDollar: profitability?.net_profit !== undefined && metrics.spend > 0 ? round(profitability.net_profit / metrics.spend) : null,
    cac: metrics.purchases > 0 ? round(metrics.spend / metrics.purchases) : null,
    breakEvenRoas,
    breakEvenCpa: metrics.purchases > 0 && contributionProfit !== null ? round(contributionProfit / metrics.purchases) : null,
    costCompleteness,
    readiness: readiness.readiness,
    canCompareAssets: readiness.canCompareAssets,
    comparisonBlockReason: readiness.comparisonBlockReason ?? null,
    warningsJson: {
      warnings: readiness.warnings,
      missingFields: criticalMissing,
      formulas: {
        contributionProfit: "Revenue - COGS - Operating Cost",
        netProfit: "Contribution Profit - Advertising Spend"
      }
    }
  };
}

function aggregatePerformance(rows: CreativeIntelligencePerformanceDaily[]): {
  impressions: number;
  outboundClicks: number;
  spend: number;
  purchases: number;
  revenue: number;
} {
  return {
    impressions: sum(rows.map((row) => row.impressions)),
    outboundClicks: sum(rows.map((row) => row.outboundClicks ?? row.clicks)),
    spend: round(sum(rows.map((row) => row.spend))),
    purchases: sum(rows.map((row) => row.purchases ?? row.conversions)),
    revenue: round(sum(rows.map((row) => row.attributedRevenue ?? row.purchaseConversionValue)))
  };
}

function activeDayCount(rows: CreativeIntelligencePerformanceDaily[]) {
  return new Set(rows.map((row) => row.date.toISOString().slice(0, 10))).size;
}

function inferCostCompleteness(economics: CreativeSkuEconomics | null | undefined) {
  if (!economics) return 0;
  const fields = [economics.cogs, economics.shippingCost, economics.fulfillmentCost, economics.platformFee, economics.paymentFee, economics.refundCost];
  return fields.filter((field) => field !== null && field !== undefined).length / fields.length;
}

function scaleCost(value: number | null | undefined, revenueShare: number) {
  return round(numberValue(value) * revenueShare);
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + numberValue(value), 0);
}

function average(values: Array<number | null | undefined>) {
  const valid = values.map(numberValue).filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0;
}
