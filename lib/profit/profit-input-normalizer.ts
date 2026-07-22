import type { EcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-data";

export type ProfitInputRow = {
  sku: string;
  revenue: number;
  ad_spend: number;
  units: number;
  refunds: number;
  cogs: number;
  fulfillment_cost: number;
  warehouse_cost: number;
  gross_profit: number;
  contribution_margin: number;
  confidence: number;
  missingFields: string[];
};

export type ProfitInputModel = {
  rows: ProfitInputRow[];
  totals: {
    revenue: number;
    ad_spend: number;
    units: number;
    refunds: number;
    cogs: number;
    fulfillment_cost: number;
    warehouse_cost: number;
    gross_profit: number;
    contribution_margin: number;
  };
  profitDataCoverage: number;
  optimizationLevel: "full_profit_optimization" | "growth_ad_optimization" | "sales_trend_insights" | "catalog_only";
  missingFields: string[];
  confidenceScore: number;
};

const PROFIT_REQUIREMENTS = [
  "sales_order_history",
  "order_line_items",
  "refunds",
  "customers",
  "inventory",
  "unit_costs",
  "fulfillment_costs",
  "warehouse_costs",
  "ad_spend"
] as const;

const MISSING_FIELD_ALIASES: Record<typeof PROFIT_REQUIREMENTS[number], RegExp[]> = {
  sales_order_history: [/ecommerce_orders\.\*/, /orders/i],
  order_line_items: [/ecommerce_order_items\.\*/, /line_?items/i],
  refunds: [/ecommerce_refunds\.\*/, /refund/i],
  customers: [/ecommerce_customers\.customer_id/, /customer/i],
  inventory: [/ecommerce_inventory\.\*/, /inventory|stock/i],
  unit_costs: [/ecommerce_order_items\.cogs/, /cogs|unit_cost/i],
  fulfillment_costs: [/fulfillment|handling_cost/i],
  warehouse_costs: [/warehouse_cost/i],
  ad_spend: [/ecommerce_ads\.\*/, /ecommerce_ads\.spend/, /ad_spend|spend/i]
};

export function normalizeProfitInputs(data: EcommerceSalesDashboardData): ProfitInputModel {
  const report = data.decision_report;
  const topProfitSkus = report.sku_breakdown.top_profit_skus;
  const topRevenueSkus = report.sku_breakdown.top_revenue_skus;
  const revenueBySku = new Map(topRevenueSkus.map((row) => [row.sku, row]));
  const missingFields = Array.from(new Set(data.quality.missing_fields ?? []));
  const totals = {
    revenue: numberValue(report.performance_overview.revenue),
    ad_spend: numberValue(report.performance_overview.ad_spend),
    units: topRevenueSkus.reduce((sum, row) => sum + numberValue(row.quantity), 0),
    refunds: numberValue(data.refund_insights.refund_amount),
    cogs: 0,
    fulfillment_cost: 0,
    warehouse_cost: 0,
    gross_profit: numberValue(report.performance_overview.gross_profit),
    contribution_margin: numberValue(report.performance_overview.margin)
  };

  const rows = (topProfitSkus.length ? topProfitSkus : topRevenueSkus).map((row) => {
    const revenueRow = revenueBySku.get(row.sku);
    const costBreakdown = "cost_breakdown" in row ? row.cost_breakdown : null;
    const cogs = numberValue(costBreakdown?.cogs);
    const fulfillment = numberValue(costBreakdown?.fulfillment);
    const warehouse = numberValue((costBreakdown as Record<string, unknown> | null)?.warehouse);
    const refunds = numberValue(costBreakdown?.refund);
    const adSpend = "ad_cost_allocated" in row ? numberValue(row.ad_cost_allocated) : 0;
    const revenue = numberValue(row.revenue);
    const grossProfit = "net_profit" in row ? numberValue(row.net_profit) + adSpend : revenue - cogs - fulfillment - warehouse - refunds;
    const margin = revenue > 0 ? roundRatio(grossProfit / revenue) : 0;
    const rowMissingFields = missingFields.filter((field) => /cogs|fulfillment|handling|warehouse|refund|ads|spend/i.test(field));

    totals.cogs += cogs;
    totals.fulfillment_cost += fulfillment;
    totals.warehouse_cost += warehouse;

    return {
      sku: row.sku,
      revenue,
      ad_spend: adSpend,
      units: numberValue(row.quantity ?? revenueRow?.quantity),
      refunds,
      cogs,
      fulfillment_cost: fulfillment,
      warehouse_cost: warehouse,
      gross_profit: roundCurrency(grossProfit),
      contribution_margin: margin,
      confidence: numberValue("profit_confidence" in row ? row.profit_confidence : data.quality.confidence_score),
      missingFields: rowMissingFields
    };
  });
  const coverage = profitDataCoverage(data, missingFields);

  return {
    rows,
    totals: {
      ...totals,
      units: Math.round(totals.units),
      refunds: roundCurrency(totals.refunds),
      cogs: roundCurrency(totals.cogs),
      fulfillment_cost: roundCurrency(totals.fulfillment_cost),
      warehouse_cost: roundCurrency(totals.warehouse_cost),
      gross_profit: roundCurrency(totals.gross_profit),
      contribution_margin: roundRatio(totals.contribution_margin)
    },
    profitDataCoverage: coverage,
    optimizationLevel: optimizationLevel(coverage),
    missingFields,
    confidenceScore: roundRatio(Math.min(1, Math.max(0, data.quality.confidence_score * (coverage / 100))))
  };
}

export function profitDataCoverage(data: EcommerceSalesDashboardData, missingFields = data.quality.missing_fields ?? []) {
  const missing = new Set<typeof PROFIT_REQUIREMENTS[number]>();

  for (const requirement of PROFIT_REQUIREMENTS) {
    const aliases = MISSING_FIELD_ALIASES[requirement];
    if (aliases.some((pattern) => missingFields.some((field) => pattern.test(field)))) {
      missing.add(requirement);
    }
  }

  if (data.metrics.core.orders > 0) missing.delete("sales_order_history");
  if (data.metrics.core.sku_revenue.length > 0) missing.delete("order_line_items");
  if (data.metrics.ads.ad_spend > 0) missing.delete("ad_spend");
  if (data.catalog_health.sku_count > 0 || data.catalog_health.catalog_row_count > 0) {
    missing.delete("inventory");
  }
  if (data.refund_insights.refund_amount > 0 || !missingFields.some((field) => /refund/i.test(field))) {
    missing.delete("refunds");
  }

  const present = PROFIT_REQUIREMENTS.length - missing.size;
  return Math.max(0, Math.min(100, Math.round((present / PROFIT_REQUIREMENTS.length) * 100)));
}

function optimizationLevel(coverage: number): ProfitInputModel["optimizationLevel"] {
  if (coverage >= 95) return "full_profit_optimization";
  if (coverage >= 70) return "growth_ad_optimization";
  if (coverage >= 40) return "sales_trend_insights";
  return "catalog_only";
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
