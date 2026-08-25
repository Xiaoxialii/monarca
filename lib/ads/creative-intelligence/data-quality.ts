import { CreativeAnalysisReadiness } from "@prisma/client";
import type { CreativeReadinessDecision } from "@/lib/ads/creative-intelligence/types";

export type CreativeAnalysisThresholds = {
  minimumDays: number;
  minimumImpressions: number;
  minimumOutboundClicks: number;
  minimumSpend: number;
  mappingConfidence: number;
  attributionConfidence: number;
};

export const DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS: CreativeAnalysisThresholds = {
  minimumDays: 3,
  minimumImpressions: 3000,
  minimumOutboundClicks: 100,
  minimumSpend: 100,
  mappingConfidence: 0.8,
  attributionConfidence: 0.7
};

export function configuredCreativeAnalysisThresholds(env: Record<string, string | undefined> = process.env): CreativeAnalysisThresholds {
  return {
    minimumDays: positiveNumber(env.CREATIVE_ANALYSIS_MIN_DAYS, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.minimumDays),
    minimumImpressions: positiveNumber(env.CREATIVE_ANALYSIS_MIN_IMPRESSIONS, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.minimumImpressions),
    minimumOutboundClicks: positiveNumber(env.CREATIVE_ANALYSIS_MIN_OUTBOUND_CLICKS, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.minimumOutboundClicks),
    minimumSpend: positiveNumber(env.CREATIVE_ANALYSIS_MIN_SPEND, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.minimumSpend),
    mappingConfidence: ratioNumber(env.CREATIVE_ANALYSIS_MAPPING_CONFIDENCE, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.mappingConfidence),
    attributionConfidence: ratioNumber(env.CREATIVE_ANALYSIS_ATTRIBUTION_CONFIDENCE, DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS.attributionConfidence)
  };
}

export function evaluateCreativeReadiness(input: {
  runningDays: number;
  impressions: number;
  outboundClicks: number;
  spend: number;
  mappingStatus?: string | null;
  mappingConfidence?: number | null;
  attributionConfidence?: number | null;
  costCompleteness?: number | null;
  hasMissingCogs?: boolean;
  hasMissingOperatingCosts?: boolean;
  inventoryConstrained?: boolean;
  multiAssetNotAttributable?: boolean;
  multiSkuUnallocated?: boolean;
  isLearning?: boolean;
  thresholds?: CreativeAnalysisThresholds;
}): CreativeReadinessDecision {
  const thresholds = input.thresholds ?? DEFAULT_CREATIVE_ANALYSIS_THRESHOLDS;
  const warnings: string[] = [];

  if (!input.mappingStatus || ["UNMAPPED", "REJECTED", "AMBIGUOUS", "NEEDS_REVIEW"].includes(input.mappingStatus)) {
    warnings.push("Ad is not reliably mapped to a SKU.");
    return blocked(CreativeAnalysisReadiness.UNMAPPED_SKU, warnings);
  }
  if ((input.mappingConfidence ?? 0) < thresholds.mappingConfidence) {
    warnings.push(`Mapping confidence is below ${thresholds.mappingConfidence}.`);
    return blocked(CreativeAnalysisReadiness.LOW_ATTRIBUTION_CONFIDENCE, warnings);
  }
  if ((input.attributionConfidence ?? 0) < thresholds.attributionConfidence) {
    warnings.push(`Attribution confidence is below ${thresholds.attributionConfidence}.`);
    return blocked(CreativeAnalysisReadiness.LOW_ATTRIBUTION_CONFIDENCE, warnings);
  }
  if (input.multiAssetNotAttributable) {
    warnings.push("This creative contains multiple assets. Performance is available at the ad level and cannot be reliably attributed to an individual image or text asset.");
    return blocked(CreativeAnalysisReadiness.MULTI_ASSET_NOT_ATTRIBUTABLE, warnings);
  }
  if (input.multiSkuUnallocated) {
    warnings.push("This ad promotes multiple SKUs and platform product-level allocation is unavailable.");
    return blocked(CreativeAnalysisReadiness.LOW_ATTRIBUTION_CONFIDENCE, warnings);
  }
  if (input.hasMissingCogs || input.hasMissingOperatingCosts || (input.costCompleteness ?? 0) < 0.75) {
    warnings.push("COGS or key operating costs are missing.");
    return blocked(CreativeAnalysisReadiness.MISSING_COST_DATA, warnings);
  }
  if (input.inventoryConstrained) {
    warnings.push("Inventory constraints may suppress performance.");
    return blocked(CreativeAnalysisReadiness.INVENTORY_CONSTRAINED, warnings);
  }
  if (input.isLearning) {
    warnings.push("Ad is still in learning or has unstable delivery.");
    return blocked(CreativeAnalysisReadiness.LEARNING, warnings);
  }

  const enoughVolume =
    input.impressions >= thresholds.minimumImpressions ||
    input.outboundClicks >= thresholds.minimumOutboundClicks ||
    input.spend >= thresholds.minimumSpend;
  if (input.runningDays < thresholds.minimumDays || !enoughVolume) {
    warnings.push(`Needs at least ${thresholds.minimumDays} days and enough exposure, clicks, or spend.`);
    return blocked(CreativeAnalysisReadiness.INSUFFICIENT_DATA, warnings);
  }

  return {
    readiness: CreativeAnalysisReadiness.READY_FOR_CREATIVE_ANALYSIS,
    canCompareAssets: true,
    comparisonBlockReason: null,
    warnings
  };
}

function blocked(readiness: CreativeAnalysisReadiness, warnings: string[]): CreativeReadinessDecision {
  return {
    readiness,
    canCompareAssets: false,
    comparisonBlockReason: warnings[0] ?? readiness,
    warnings
  };
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ratioNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}
