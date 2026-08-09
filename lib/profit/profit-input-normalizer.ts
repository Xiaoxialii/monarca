import type { EcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-data";
import { calculateSkuProfitability, canonicalAdAllocationMethod } from "@/lib/profit/canonical-profitability-engine";

export type ProfitInputRow = {
  sku: string;
  revenue: number;
  ad_spend: number;
  units: number;
  refunds: number;
  cogs: number;
  shipping_cost: number;
  fulfillment_cost: number;
  warehouse_cost: number;
  platform_fee: number;
  payment_fee: number;
  operating_cost: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  cogs_status: string;
  cogs_confidence: number;
  ad_allocation_method: string;
  attribution_confidence: number;
  profitability_confidence: number;
  validation_status: string;
  optimization_allowed: boolean;
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

const OPTIMIZATION_CORE_REQUIREMENTS = [
  "orders.order_id",
  "orders.order_date",
  "order_items.sku",
  "order_items.quantity",
  "order_items.revenue",
  "products.sku_or_product_id",
  "cost.unit_cost_or_cogs",
  "cost.shipping_cost",
  "cost.platform_fee",
  "cost.payment_fee",
  "refunds.order_id",
  "refunds.refund_amount",
  "ads.ad_spend",
  "ads.sku_or_product_id",
  "inventory.sku",
  "inventory.inventory_on_hand",
  "channel.channel_or_platform"
] as const;

const OPTIMIZATION_CORE_FIELD_ALIASES: Record<typeof OPTIMIZATION_CORE_REQUIREMENTS[number], RegExp[]> = {
  "orders.order_id": [/ecommerce_orders\.\*/, /ecommerce_orders\.order_id/, /^orders?\.order_id$/i],
  "orders.order_date": [/ecommerce_orders\.order_date/, /^orders?\.order_date$/i],
  "order_items.sku": [/ecommerce_order_items\.\*/, /ecommerce_order_items\.sku/, /line_?items?.*sku/i],
  "order_items.quantity": [/ecommerce_order_items\.\*/, /ecommerce_order_items\.quantity/, /line_?items?.*quantity/i],
  "order_items.revenue": [/ecommerce_order_items\.\*/, /ecommerce_order_items\.(revenue|price|paid_amount|order_amount|net_sales)/, /line_?items?.*(revenue|price|amount)/i],
  "products.sku_or_product_id": [/ecommerce_products\.\*/, /ecommerce_products\.(sku|product_id|variant_id)/, /products?.*(sku|product_id)/i],
  "cost.unit_cost_or_cogs": [/ecommerce_order_items\.cogs/, /cogs|unit_cost|product_cost/i],
  "cost.shipping_cost": [/ecommerce_orders\.shipping_cost/, /shipping_(cost|fee|expense)|carrier_cost|postage_cost/i],
  "cost.platform_fee": [/ecommerce_orders\.platform_fee/, /platform_fee|marketplace_fee|selling_fee|commission_fee/i],
  "cost.payment_fee": [/ecommerce_orders\.payment_fee/, /payment_fee|processing_fee|transaction_fee|stripe_fee/i],
  "refunds.order_id": [/ecommerce_refunds\.\*/, /ecommerce_refunds\.order_id/, /refunds?.*order_id/i],
  "refunds.refund_amount": [/ecommerce_refunds\.\*/, /ecommerce_refunds\.(amount|refund_amount)/, /refund/i],
  "ads.ad_spend": [/ecommerce_ads\.\*/, /ecommerce_ads\.spend/, /ad_spend|ads?_spend|spend/i],
  "ads.sku_or_product_id": [/ecommerce_ads\.\*/, /ecommerce_ads\.(sku|product_id|variant_id)/, /ads?.*(sku|product_id)/i],
  "inventory.sku": [/ecommerce_inventory\.\*/, /ecommerce_inventory\.sku/, /inventory.*sku/i],
  "inventory.inventory_on_hand": [/ecommerce_inventory\.\*/, /ecommerce_inventory\.(stock_level|inventory_on_hand|available_stock|stock)/, /inventory_on_hand|stock_level|available_stock/i],
  "channel.channel_or_platform": [/channel|platform|source_platform/i]
};

export function normalizeProfitInputs(data: EcommerceSalesDashboardData): ProfitInputModel {
  const report = data.decision_report;
  const topProfitSkus = report.sku_breakdown.top_profit_skus;
  const topRevenueSkus = report.sku_breakdown.top_revenue_skus;
  const revenueBySku = new Map(topRevenueSkus.map((row) => [row.sku, row]));
  const sourceMissingFields = Array.from(new Set(data.quality.missing_fields ?? []));
  const missingFields = optimizationMissingFields(data, sourceMissingFields);
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
    const shipping = numberValue(costBreakdown?.shipping);
    const platformFee = numberValue(costBreakdown?.platform_fee);
    const paymentFee = numberValue(costBreakdown?.payment_fee);
    const refunds = numberValue(costBreakdown?.refund);
    const adSpend = "ad_cost_allocated" in row ? numberValue(row.ad_cost_allocated) : 0;
    const revenue = numberValue(row.revenue);
    const profitability = calculateSkuProfitability({
      revenue,
      cogs,
      shippingCost: shipping,
      fulfillmentCost: fulfillment + warehouse,
      platformFee,
      paymentFee,
      refundCost: refunds,
      adSpend,
      cogsStatus: "cogs_status" in row ? row.cogs_status : undefined,
      cogsConfidence: "cogs_confidence" in row ? numberValue(row.cogs_confidence) : undefined,
      adAllocationMethod: canonicalAdAllocationMethod("ad_allocation_method" in row ? row.ad_allocation_method : undefined),
      attributionConfidence: "attribution_confidence" in row ? numberValue(row.attribution_confidence) : undefined
    });
    const rowMissingFields = missingFields.filter((field) => /cogs|unit_cost|shipping|platform_fee|payment_fee|refund|ads|spend|inventory/i.test(field));

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
      shipping_cost: shipping,
      fulfillment_cost: fulfillment,
      warehouse_cost: warehouse,
      platform_fee: platformFee,
      payment_fee: paymentFee,
      operating_cost: profitability.operating_cost,
      total_cost: profitability.total_cost,
      net_profit: profitability.net_profit,
      margin: profitability.margin,
      cogs_status: profitability.cogs_status,
      cogs_confidence: profitability.cogs_confidence,
      ad_allocation_method: profitability.ad_allocation_method,
      attribution_confidence: profitability.attribution_confidence,
      profitability_confidence: profitability.profitability_confidence,
      validation_status: profitability.validation.validation_status,
      optimization_allowed: profitability.validation.optimization_allowed,
      gross_profit: profitability.gross_profit,
      contribution_margin: profitability.margin,
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
  const missing = optimizationMissingRequirementSet(data, Array.from(new Set(missingFields)));
  const present = OPTIMIZATION_CORE_REQUIREMENTS.length - missing.size;

  return Math.max(0, Math.min(100, Math.round((present / OPTIMIZATION_CORE_REQUIREMENTS.length) * 100)));
}

function optimizationMissingFields(data: EcommerceSalesDashboardData, missingFields: string[]) {
  const missingRequirements = optimizationMissingRequirementSet(data, missingFields);
  return OPTIMIZATION_CORE_REQUIREMENTS.filter((requirement) => missingRequirements.has(requirement));
}

function optimizationMissingRequirementSet(data: EcommerceSalesDashboardData, missingFields: string[]) {
  const missing = new Set<typeof OPTIMIZATION_CORE_REQUIREMENTS[number]>();

  for (const requirement of OPTIMIZATION_CORE_REQUIREMENTS) {
    const aliases = OPTIMIZATION_CORE_FIELD_ALIASES[requirement];
    if (aliases.some((pattern) => missingFields.some((field) => pattern.test(field)))) {
      missing.add(requirement);
    }
  }

  const skuRevenueRows = data.metrics.core.sku_revenue;
  const skuUnitRows = data.metrics.business.sku_unit_economics ?? [];
  const totalSkuRevenue = skuRevenueRows.reduce((sum, row) => sum + numberValue(row.revenue), 0);
  const totalSkuQuantity = skuRevenueRows.reduce((sum, row) => sum + numberValue(row.quantity), 0);
  const hasSkuUnitRows = skuUnitRows.length > 0;
  const sourcePlatforms = data.metadata.source_platforms ?? [];

  if (data.metrics.core.orders > 0) missing.delete("orders.order_id");
  if (data.trends.daily_revenue.length > 0 || !missingFields.some((field) => /order_date/i.test(field))) missing.delete("orders.order_date");
  if (skuRevenueRows.length > 0) {
    missing.delete("order_items.sku");
    missing.delete("products.sku_or_product_id");
  }
  if (totalSkuQuantity > 0) missing.delete("order_items.quantity");
  if (totalSkuRevenue > 0) missing.delete("order_items.revenue");
  if (data.catalog_health.sku_count > 0 || data.catalog_health.catalog_row_count > 0) missing.delete("products.sku_or_product_id");
  if (hasSkuUnitRows && skuUnitRows.some((row) => numberValue(row.cogs) > 0 && row.cogs_status !== "MISSING")) missing.delete("cost.unit_cost_or_cogs");
  if (!missingFields.some((field) => /shipping_cost/i.test(field))) missing.delete("cost.shipping_cost");
  if (!missingFields.some((field) => /platform_fee/i.test(field))) missing.delete("cost.platform_fee");
  if (!missingFields.some((field) => /payment_fee/i.test(field))) missing.delete("cost.payment_fee");
  if (!missingFields.some((field) => /refund/i.test(field)) || data.refund_insights.refund_amount > 0) {
    missing.delete("refunds.order_id");
    missing.delete("refunds.refund_amount");
  }
  if (numberValue(data.metrics.ads.ad_spend) > 0 || numberValue(data.metrics.business.ad_spend) > 0) missing.delete("ads.ad_spend");
  if (
    data.metrics.attribution.sku_attribution_coverage > 0 ||
    skuUnitRows.some((row) => numberValue(row.ad_cost_allocated) > 0) ||
    !missingFields.some((field) => /ecommerce_ads\.\*|ecommerce_ads\.(sku|product_id|variant_id)/i.test(field))
  ) {
    missing.delete("ads.sku_or_product_id");
  }
  if (data.catalog_health.sku_count > 0 || hasSkuUnitRows) missing.delete("inventory.sku");
  if (
    skuUnitRows.some((row) => numberValue(row.stock_level ?? row.available_stock) > 0) ||
    !missingFields.some((field) => /inventory|stock/i.test(field))
  ) {
    missing.delete("inventory.inventory_on_hand");
  }
  if (sourcePlatforms.length > 0 || skuUnitRows.some((row) => Object.keys(row.channel_breakdown ?? {}).length > 0)) missing.delete("channel.channel_or_platform");

  return missing;
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
