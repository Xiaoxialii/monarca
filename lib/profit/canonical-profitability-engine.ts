export const CANONICAL_PROFITABILITY_ENGINE_VERSION = "v2.1-profitability-reconciliation" as const;

export type CogsStatus = "AVAILABLE" | "ESTIMATED" | "MISSING";
export type CanonicalAdAllocationMethod = "DIRECT_SKU" | "CAMPAIGN" | "REVENUE_SHARE" | "UNKNOWN";
export type ProfitValidationStatus = "PASSED" | "WARNING" | "FAILED";

export type CanonicalProfitabilityInput = {
  sku?: string;
  revenue: number;
  cogs: number;
  shippingCost?: number;
  fulfillmentCost?: number;
  platformFee?: number;
  paymentFee?: number;
  refundCost?: number;
  adSpend?: number;
  cogsStatus?: CogsStatus;
  cogsConfidence?: number;
  adAllocationMethod?: CanonicalAdAllocationMethod;
  attributionConfidence?: number;
  explicitLossSku?: boolean;
  criticalFieldsMissing?: string[];
};

export type ProfitValidationResult = {
  revenue_valid: boolean;
  cogs_valid: boolean;
  ads_valid: boolean;
  margin_valid: boolean;
  attribution_confidence: number;
  optimization_allowed: boolean;
  validation_status: ProfitValidationStatus;
  warnings: string[];
};

export type CanonicalProfitabilityOutput = {
  engine_version: typeof CANONICAL_PROFITABILITY_ENGINE_VERSION;
  revenue: number;
  cogs: number;
  gross_profit: number;
  shipping_cost: number;
  fulfillment_cost: number;
  platform_fee: number;
  payment_fee: number;
  refund_cost: number;
  operating_cost: number;
  contribution_profit: number;
  ad_spend: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  cogs_status: CogsStatus;
  cogs_confidence: number;
  ad_allocation_method: CanonicalAdAllocationMethod;
  attribution_confidence: number;
  profitability_confidence: number;
  validation: ProfitValidationResult;
};

export function calculateSkuProfitability(input: CanonicalProfitabilityInput): CanonicalProfitabilityOutput {
  const revenue = money(input.revenue);
  const cogs = money(input.cogs);
  const shippingCost = money(input.shippingCost ?? 0);
  const fulfillmentCost = money(input.fulfillmentCost ?? 0);
  const platformFee = money(input.platformFee ?? 0);
  const paymentFee = money(input.paymentFee ?? 0);
  const refundCost = money(input.refundCost ?? 0);
  const adSpend = money(input.adSpend ?? 0);
  const operatingCost = money(shippingCost + fulfillmentCost + platformFee + paymentFee + refundCost);
  const totalCost = money(cogs + operatingCost + adSpend);
  const grossProfit = money(revenue - cogs);
  const contributionProfit = money(revenue - cogs - operatingCost);
  const netProfit = money(contributionProfit - adSpend);
  const margin = ratio(netProfit, revenue);
  const cogsStatus = input.cogsStatus ?? inferCogsStatus({ cogs, revenue, cogsConfidence: input.cogsConfidence });
  const cogsConfidence = confidence(input.cogsConfidence ?? confidenceForCogsStatus(cogsStatus));
  const adAllocationMethod = input.adAllocationMethod ?? "UNKNOWN";
  const attributionConfidence = confidence(input.attributionConfidence ?? confidenceForAdMethod(adAllocationMethod));
  const validation = validateProfitability({
    ...input,
    revenue,
    cogs,
    adSpend,
    margin,
    cogsStatus,
    cogsConfidence,
    attributionConfidence
  });
  const validationPenalty = validation.validation_status === "FAILED" ? 0.45 : validation.validation_status === "WARNING" ? 0.18 : 0;
  const missingPenalty = Math.min(0.25, (input.criticalFieldsMissing?.length ?? 0) * 0.08);
  const profitabilityConfidence = confidence(Math.min(cogsConfidence, attributionConfidence || 1) - validationPenalty - missingPenalty);

  return {
    engine_version: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    revenue,
    cogs,
    gross_profit: grossProfit,
    shipping_cost: shippingCost,
    fulfillment_cost: fulfillmentCost,
    platform_fee: platformFee,
    payment_fee: paymentFee,
    refund_cost: refundCost,
    operating_cost: operatingCost,
    contribution_profit: contributionProfit,
    ad_spend: adSpend,
    total_cost: totalCost,
    net_profit: netProfit,
    margin,
    cogs_status: cogsStatus,
    cogs_confidence: cogsConfidence,
    ad_allocation_method: adAllocationMethod,
    attribution_confidence: attributionConfidence,
    profitability_confidence: profitabilityConfidence,
    validation
  };
}

function validateProfitability(input: CanonicalProfitabilityInput & {
  revenue: number;
  cogs: number;
  adSpend: number;
  margin: number;
  cogsStatus: CogsStatus;
  cogsConfidence: number;
  attributionConfidence: number;
}): ProfitValidationResult {
  const warnings: string[] = [];
  const revenueValid = input.revenue >= 0;
  const cogsValid = input.cogs >= 0 && (input.cogs <= input.revenue || Boolean(input.explicitLossSku));
  const adsValid = input.adSpend >= 0;
  const marginValid = input.margin >= -1 && input.margin <= 1;

  if (!revenueValid) warnings.push("Revenue is negative.");
  if (!cogsValid) warnings.push("COGS exceeds revenue without explicit loss SKU marker.");
  if (!adsValid) warnings.push("Advertising spend is negative.");
  if (!marginValid) warnings.push("Margin is outside -100% to 100% sanity range.");
  if (input.cogsStatus === "MISSING") warnings.push("COGS is missing; profit may be overstated.");
  if (input.criticalFieldsMissing?.length) warnings.push(`Critical profitability fields missing: ${input.criticalFieldsMissing.join(", ")}.`);
  if (input.attributionConfidence < 0.65) warnings.push("Ad attribution confidence is below growth-action threshold.");

  const hardValid = revenueValid && cogsValid && adsValid && marginValid;
  const optimizationAllowed = hardValid && input.cogsStatus !== "MISSING" && input.cogsConfidence > 0 && input.attributionConfidence >= 0.4;
  const validationStatus: ProfitValidationStatus = !hardValid ? "FAILED" : warnings.length ? "WARNING" : "PASSED";

  return {
    revenue_valid: revenueValid,
    cogs_valid: cogsValid,
    ads_valid: adsValid,
    margin_valid: marginValid,
    attribution_confidence: input.attributionConfidence,
    optimization_allowed: optimizationAllowed,
    validation_status: validationStatus,
    warnings
  };
}

export function canonicalAdAllocationMethod(method: string | null | undefined): CanonicalAdAllocationMethod {
  if (method === "direct") return "DIRECT_SKU";
  if (method === "campaign_window" || method === "campaign_revenue_share") return "CAMPAIGN";
  if (method === "conversion_share" || method === "revenue_share" || method === "equal_distribution") return "REVENUE_SHARE";
  return "UNKNOWN";
}

function inferCogsStatus(input: { cogs: number; revenue: number; cogsConfidence?: number | null }): CogsStatus {
  if (input.cogs > 0 && (input.cogsConfidence ?? 1) >= 0.8) return "AVAILABLE";
  if (input.cogs > 0) return "ESTIMATED";
  if (input.revenue > 0) return "MISSING";
  return "AVAILABLE";
}

function confidenceForCogsStatus(status: CogsStatus) {
  if (status === "AVAILABLE") return 1;
  if (status === "ESTIMATED") return 0.65;
  return 0;
}

function confidenceForAdMethod(method: CanonicalAdAllocationMethod) {
  if (method === "DIRECT_SKU") return 0.95;
  if (method === "CAMPAIGN") return 0.78;
  if (method === "REVENUE_SHARE") return 0.5;
  return 0.25;
}

function confidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, ratio(value, 1)));
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  return Math.round((numerator / denominator + Number.EPSILON) * 10000) / 10000;
}
