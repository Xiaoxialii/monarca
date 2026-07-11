import { roundCurrency, roundRatio, safeRatio } from "@/lib/optimization/objective";
import type { AdsCampaignInput, BusinessConstraintsInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";

export type PortfolioBudgetPlan = {
  sku: string;
  campaign: string;
  old_budget: number;
  new_budget: number;
  current_budget: number;
  recommended_budget: number;
  expected_profit_gain: number;
  marginal_roas: number;
  reason: string;
};

export function solveBudgetAllocation(input: {
  simulations: ProfitSimulationResult[];
  ads: AdsCampaignInput[];
  constraints: BusinessConstraintsInput;
}): PortfolioBudgetPlan[] {
  const candidates = bestScalableRows(input.simulations)
    .map((result) => {
      const campaign = campaignForSku(result.sku, input.ads);
      const additionalBudget = Math.max(0, result.recommended_ads_spend - result.current_ads_spend);
      const reducibleBudget = result.action === "REDUCE_ADS"
        ? Math.max(0, result.current_ads_spend - result.recommended_ads_spend)
        : 0;
      const spendDelta = additionalBudget > 0 ? additionalBudget : -reducibleBudget;
      const marginalRoas = safeRatio(Math.max(0, result.ads_response.incremental_revenue), Math.max(1, additionalBudget));

      return {
        sku: result.sku,
        campaign: campaign?.campaign_id ?? `portfolio-${result.sku}`,
        old_budget: roundCurrency(result.current_ads_spend),
        new_budget: roundCurrency(result.recommended_ads_spend),
        current_budget: roundCurrency(result.current_ads_spend),
        recommended_budget: roundCurrency(result.recommended_ads_spend),
        expected_profit_gain: roundCurrency(result.profit_delta),
        marginal_roas: marginalRoas,
        spend_delta: roundCurrency(spendDelta),
        reason: result.action === "REDUCE_ADS"
          ? "Reduce budget because predicted incremental profit is weak or negative."
          : "Increase budget because marginal ROAS and profit response are favorable."
      };
    })
    .filter((row) => row.expected_profit_gain > 0 || row.spend_delta < 0)
    .sort((left, right) => right.marginal_roas - left.marginal_roas || right.expected_profit_gain - left.expected_profit_gain);

  const plans: PortfolioBudgetPlan[] = [];
  let usedBudget = 0;

  for (const candidate of candidates) {
    if (candidate.spend_delta > 0 && usedBudget + candidate.spend_delta > input.constraints.total_ads_budget) continue;
    usedBudget = roundCurrency(usedBudget + Math.max(0, candidate.spend_delta));
    const plan = {
      sku: candidate.sku,
      campaign: candidate.campaign,
      old_budget: candidate.old_budget,
      new_budget: candidate.new_budget,
      current_budget: candidate.current_budget,
      recommended_budget: candidate.recommended_budget,
      expected_profit_gain: candidate.expected_profit_gain,
      marginal_roas: candidate.marginal_roas,
      reason: candidate.reason
    };
    plans.push({
      ...plan,
      marginal_roas: roundRatio(plan.marginal_roas)
    });
  }

  return plans;
}

function bestScalableRows(simulations: ProfitSimulationResult[]) {
  const bySku = new Map<string, ProfitSimulationResult[]>();
  for (const result of simulations) {
    if (result.action === "SCALE_ADS" || result.action === "SCALE_ADS_PRICE_UP_5" || result.action === "REDUCE_ADS") {
      bySku.set(result.sku, [...(bySku.get(result.sku) ?? []), result]);
    }
  }

  return Array.from(bySku.values()).map((rows) =>
    rows.sort((left, right) => right.profit_delta - left.profit_delta)[0]
  );
}

function campaignForSku(sku: string, ads: AdsCampaignInput[]) {
  return ads.find((campaign) => campaign.sku === sku) ?? ads[0] ?? null;
}
