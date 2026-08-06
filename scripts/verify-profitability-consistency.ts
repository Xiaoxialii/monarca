type ProfitabilityRow = {
  sku?: string;
  revenue?: number;
  cogs?: number;
  advertisingSpend?: number;
  ad_spend?: number;
  ad_cost_allocated?: number | null;
  shippingCost?: number;
  shipping_cost?: number;
  fulfillmentCost?: number;
  fulfillment_cost?: number;
  platformFee?: number;
  platform_fee?: number;
  paymentFee?: number;
  payment_fee?: number;
  refundCost?: number;
  refund_cost?: number;
  totalCost?: number;
  total_cost?: number;
  netProfit?: number;
  net_profit?: number;
  margin?: number;
};

export type ProfitabilityConsistencyIssue = {
  sku: string;
  field: string;
  expected: number;
  actual: number;
  difference: number;
};

export type ProfitabilityConsistencyResult = {
  status: "PASSED" | "FAILED";
  checked: number;
  issues: ProfitabilityConsistencyIssue[];
};

const TOLERANCE = 0.02;

export function verifyProfitabilityConsistency(rows: ProfitabilityRow[], tolerance = TOLERANCE): ProfitabilityConsistencyResult {
  const issues: ProfitabilityConsistencyIssue[] = [];

  rows.forEach((row, index) => {
    const sku = row.sku || `ROW_${index + 1}`;
    const revenue = money(row.revenue);
    const cogs = money(row.cogs);
    const ads = money(row.advertisingSpend ?? row.ad_spend ?? row.ad_cost_allocated ?? 0);
    const shipping = money(row.shippingCost ?? row.shipping_cost ?? 0);
    const fulfillment = money(row.fulfillmentCost ?? row.fulfillment_cost ?? 0);
    const platformFee = money(row.platformFee ?? row.platform_fee ?? 0);
    const paymentFee = money(row.paymentFee ?? row.payment_fee ?? 0);
    const refundCost = money(row.refundCost ?? row.refund_cost ?? 0);
    const expectedTotalCost = money(cogs + ads + shipping + fulfillment + platformFee + paymentFee + refundCost);
    const actualTotalCost = money(row.totalCost ?? row.total_cost);
    const expectedNetProfit = money(revenue - expectedTotalCost);
    const actualNetProfit = money(row.netProfit ?? row.net_profit);
    const expectedMargin = ratio(expectedNetProfit, revenue);
    const actualMargin = ratio(row.margin ?? 0, 1);

    compare({ issues, sku, field: "total_cost", expected: expectedTotalCost, actual: actualTotalCost, tolerance });
    compare({ issues, sku, field: "net_profit", expected: expectedNetProfit, actual: actualNetProfit, tolerance });
    compare({ issues, sku, field: "margin", expected: expectedMargin, actual: actualMargin, tolerance: 0.0002 });

    if (cogs > revenue + tolerance) {
      issues.push({ sku, field: "cogs_sanity", expected: revenue, actual: cogs, difference: money(cogs - revenue) });
    }
    if (ads > revenue + tolerance) {
      issues.push({ sku, field: "ads_sanity", expected: revenue, actual: ads, difference: money(ads - revenue) });
    }
  });

  return {
    status: issues.length ? "FAILED" : "PASSED",
    checked: rows.length,
    issues
  };
}

function compare(input: {
  issues: ProfitabilityConsistencyIssue[];
  sku: string;
  field: string;
  expected: number;
  actual: number;
  tolerance: number;
}) {
  const difference = money(input.actual - input.expected);
  if (Math.abs(difference) <= input.tolerance) return;
  input.issues.push({
    sku: input.sku,
    field: input.field,
    expected: input.expected,
    actual: input.actual,
    difference
  });
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}
