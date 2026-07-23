import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";

export type AdsResponseModelInput = {
  sku: string;
  campaign_history?: Array<{
    sku?: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    roas: number | null;
  }>;
  spend: number;
  additional_spend: number;
  revenue: number;
  margin: number;
};

export type AdsResponseModelOutput = {
  additional_spend: number;
  incremental_revenue: number;
  incremental_profit: number;
  marginal_roas: number;
  confidence: number;
};

function hasUsableRoas(row: NonNullable<AdsResponseModelInput["campaign_history"]>[number]): row is NonNullable<AdsResponseModelInput["campaign_history"]>[number] & { roas: number } {
  return typeof row.roas === "number" && Number.isFinite(row.roas) && row.roas > 0;
}

export function predictAdsResponse(input: AdsResponseModelInput): AdsResponseModelOutput {
  const campaignRows = (input.campaign_history ?? [])
    .filter((row) => !row.sku || row.sku === input.sku)
    .filter(hasUsableRoas);
  const weightedRoas = campaignRows.length
    ? campaignRows.reduce((sum, row) => sum + row.roas * Math.max(1, row.spend), 0) / campaignRows.reduce((sum, row) => sum + Math.max(1, row.spend), 0)
    : safeRatio(input.revenue, input.spend);
  const clickDepth = campaignRows.length
    ? campaignRows.reduce((sum, row) => sum + safeRatio(row.clicks, row.impressions), 0) / campaignRows.length
    : 0.03;
  const conversionDepth = campaignRows.length
    ? campaignRows.reduce((sum, row) => sum + safeRatio(row.conversions, Math.max(1, row.clicks)), 0) / campaignRows.length
    : 0.04;
  const scaleRatio = safeRatio(Math.max(0, input.additional_spend), Math.max(1, input.spend));
  const diminishingReturn = input.additional_spend > 0 ? Math.max(0.42, 1 - scaleRatio * 0.28) : 1;
  const marginalRoas = Math.max(0, weightedRoas * diminishingReturn);
  const incrementalRevenue = roundCurrency(input.additional_spend * marginalRoas);
  const incrementalProfit = roundCurrency(incrementalRevenue * Math.max(0, input.margin) - Math.max(0, input.additional_spend));
  const confidence = Math.max(0.28, Math.min(0.94, 0.48 + Math.min(0.18, campaignRows.length * 0.04) + Math.min(0.12, clickDepth * 2) + Math.min(0.12, conversionDepth) - Math.max(0, scaleRatio - 0.5) * 0.16));

  return {
    additional_spend: roundCurrency(input.additional_spend),
    incremental_revenue: incrementalRevenue,
    incremental_profit: incrementalProfit,
    marginal_roas: roundRatio(marginalRoas),
    confidence: roundRatio(confidence)
  };
}
