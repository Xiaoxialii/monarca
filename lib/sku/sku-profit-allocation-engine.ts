import { allocateAdSpendToSkus } from "./sku-ad-allocation-engine";
import { revenueChannelOrNull } from "@/lib/channels/revenue-channel";
import { evaluateInventoryDecision, inferDemandTrendFromOrderDates, type DemandTrend, type InventoryDecision } from "@/lib/inventory/inventory-decision-engine";
import { calculateSalesVelocity, type VelocityConfidence } from "@/lib/inventory/sales-velocity-engine";
import { calculateSkuProfitability, canonicalAdAllocationMethod, type CogsStatus, type ProfitValidationStatus } from "@/lib/profit/canonical-profitability-engine";

const DEFAULT_ROAS_ANOMALY_THRESHOLD = 20;

export type SkuProfitInputRow = {
  sku: string;
  product_name?: string;
  category?: string;
  variant_name?: string;
  size?: string;
  color?: string;
  revenue: number;
  quantity: number;
  cogs: number;
  shipping_cost: number;
  fulfillment_cost: number;
  platform_fee: number;
  payment_fee: number;
  refund_cost: number;
  refund_amount: number;
  reverse_logistics_cost: number;
  estimated_components: string[];
  estimated: boolean;
  cogs_type: "unit" | "total" | "unknown" | "mixed";
  cogs_status?: CogsStatus;
  cogs_confidence: number;
  cogs_semantic_warnings: string[];
};

export type SkuRoasStatus = "not_advertised" | "spent_no_revenue" | "attributed" | "estimated" | "attribution_missing";
export type SkuRoasConfidence = "HIGH" | "MEDIUM" | "LOW";
export type InventoryRiskStatus = "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK" | "EXCESS_INVENTORY" | "OVERSTOCK_RISK" | "LIQUIDATION_RISK" | "HEALTHY" | "OBSERVATION";
export type SkuAttributionMethod =
  | "direct"
  | "campaign_window"
  | "campaign_revenue_share"
  | "conversion_share_fallback"
  | "revenue_share_fallback"
  | "campaign_window_fallback"
  | "unavailable"
  | "unknown"
  | "none";

export type SkuProfitAllocationRow = SkuProfitInputRow & {
  ad_cost_allocated: number | null;
  total_cost: number;
  gross_profit: number;
  operating_cost: number;
  contribution_profit: number;
  net_profit: number;
  margin: number;
  profitability_confidence: number;
  validation_status: ProfitValidationStatus;
  optimization_allowed: boolean;
  warnings: string[];
  sku_roas: number;
  roas_value: number | null;
  roas_display: string;
  roas_status: SkuRoasStatus;
  roas_confidence: SkuRoasConfidence;
  roas_confidence_reason?: string;
  attribution_method: SkuAttributionMethod;
  attribution_confidence: number;
  contribution: number;
  risk_score: number;
  profit_confidence: number;
  channel_breakdown: Record<string, number>;
  channel_details: Array<{ platform: string; revenue: number; quantity: number; profit: number; margin: number; share: number }>;
  ad_allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "unknown" | "none";
  ad_allocation_confidence: number;
  attribution_source: "meta_ads" | "amazon_ads" | "shopify_ads" | "campaign_attribution" | "sku_allocation" | "revenue_share_fallback" | "unknown" | "none";
  attributed_campaigns: Array<{
    campaign_id: string;
    raw_spend: number;
    attributed_revenue: number;
    allocated_spend: number;
    allocation_method: "direct" | "campaign_revenue_share";
  }>;
  ads_validation_status: "PASSED" | "FAILED" | "UNKNOWN";
  ads_validation_warnings: string[];
  ads_lineage: {
    raw_platform_spend: number;
    sku_direct_attribution: number;
    campaign_allocation: number;
    revenue_share_fallback: number;
    final_allocated_ads: number | null;
  };
  campaign_ids: string[];
  attribution_window_start: string | null;
  attribution_window_end: string | null;
  stock_level: number | null;
  available_stock: number | null;
  sales_velocity: number;
  normalized_daily_sales_velocity: number;
  velocity_window_days: number;
  calculation_window_days: number;
  velocity_calculation_basis: "30-day normalized estimate" | "observed order window";
  velocity_confidence: VelocityConfidence;
  data_period_days: number;
  inventory_risk_status: InventoryRiskStatus;
  days_of_inventory: number | null;
  stockout_risk: "high" | "medium" | "low" | "unknown";
  overstock_risk: "high" | "medium" | "low" | "unknown";
  refund_rate: number;
  refund_risk: "high" | "medium" | "low" | "unknown";
  margin_risk: boolean;
  channel_concentration_risk: boolean;
  attribution_risk: boolean;
  overall_risk_score: number;
  recommended_action: "SCALE_ADS" | "RESTOCK_FIRST" | "RAISE_PRICE" | "REDUCE_AD_SPEND" | "FIX_MARGIN" | "MONITOR" | "STOP_SKU" | "CLEAR_INVENTORY" | "NEED_MORE_DATA";
  decision_reason: string;
  expected_impact: {
    profit_delta_estimate: number;
    revenue_delta_estimate: number;
    risk_delta: string;
    explanation: string;
    estimated: true;
  };
  inventory_confidence: number;
  lifecycle_stage?: string;
  lifecycle_confidence?: "HIGH" | "MEDIUM" | "LOW";
  demand_trend?: DemandTrend;
  inventory_decision?: InventoryDecision;
  inventory_risk_score?: number;
  inventory_recommended_action?: InventoryDecision["recommended_action"];
  inventory_risk_reason?: string;
  inventory_value?: number;
  paid_dependency_score?: number;
  organic_sales_ratio?: number;
  cost_breakdown: {
    cogs: number;
    shipping: number;
    ads: number;
    platform_fee: number;
    payment_fee: number;
    fulfillment: number;
    refund: number;
  };
};

export function calculateSkuProfitAndAllocation(input: {
  rows: SkuProfitInputRow[];
  orderItems: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
  inventory?: Array<Record<string, unknown>>;
}): SkuProfitAllocationRow[] {
  const rows = input.rows.filter((row) => row.sku);
  if (!rows.length) return [];

  const adAllocations = new Map(
    allocateAdSpendToSkus({
      skuRows: rows.map((row) => ({ sku: row.sku, revenue: row.revenue, quantity: row.quantity })),
      orderItems: input.orderItems,
      ads: input.ads
    }).map((row) => [row.sku, row])
  );
  const channelBreakdowns = buildChannelBreakdowns(input.orderItems);
  const inventoryBySku = buildInventoryBySku(input.inventory ?? []);
  const velocityBySku = buildSalesVelocityBySku(input.orderItems, input.orders ?? []);
  const demandTrendBySku = buildDemandTrendBySku(input.orderItems, input.orders ?? []);

  const allocated = rows.map((row) => {
    const adAllocation = adAllocations.get(row.sku);
    const adCostAllocated = adAllocation?.allocated_ad_spend === null
      ? null
      : roundCurrency(adAllocation?.allocated_ad_spend ?? 0);
    const adSpendForProfit = adCostAllocated ?? 0;
    const adAllocationMethod = adAllocation?.allocation_method ?? "none";
    const adAllocationConfidence = adAllocation?.allocation_confidence ?? 0.25;
    const hasUnknownAds = adAllocationMethod === "unknown" || adAllocation?.ads_validation_status === "UNKNOWN";
    const profitability = calculateSkuProfitability({
      sku: row.sku,
      revenue: row.revenue,
      cogs: row.cogs,
      shippingCost: row.shipping_cost,
      fulfillmentCost: row.fulfillment_cost,
      platformFee: row.platform_fee,
      paymentFee: row.payment_fee,
      refundCost: row.refund_cost,
      adSpend: adSpendForProfit,
      cogsStatus: row.cogs_status ?? (row.cogs > 0 ? (row.estimated_components.includes("cogs") ? "ESTIMATED" : "AVAILABLE") : row.revenue > 0 ? "MISSING" : "AVAILABLE"),
      cogsConfidence: row.cogs_confidence,
      adAllocationMethod: canonicalAdAllocationMethod(adAllocationMethod),
      attributionConfidence: adAllocationConfidence,
      criticalFieldsMissing: row.estimated_components
    });
    const totalCost = profitability.total_cost;
    const netProfit = profitability.net_profit;
    const margin = profitability.margin;
    const inventory = inventoryBySku.get(row.sku);
    const inventoryConfidence = inventory ? 1 : 0;
    const velocity = velocityBySku.get(row.sku) ?? calculateSalesVelocity({ totalUnitsSold: row.quantity, orderDates: [] });
    const salesVelocity = velocity.normalized_daily_sales_velocity;
    const daysOfInventory = inventory && salesVelocity > 0 ? roundRatio(inventory.available_stock / salesVelocity) : null;
    const inventoryRiskStatus = inventoryRiskStatusFromRunway(daysOfInventory, velocity.velocity_confidence);
    const stockoutRisk = stockoutRiskLevel(daysOfInventory, inventory, velocity.velocity_confidence);
    const overstockRisk = overstockRiskLevel(daysOfInventory, salesVelocity, inventory);
    const refundRate = safeRatio(row.refund_cost, row.revenue);
    const refundRisk = refundRiskLevel(refundRate, row.estimated_components.includes("refund_cost"));
    const channelRecord = channelBreakdowns.get(row.sku) ?? {};
    const channelConcentrationRisk = Object.values(channelRecord).some((value) => row.revenue > 0 && value / row.revenue > 0.7);
    const attributionRisk = adAllocationConfidence < 0.6 || adAllocation?.allocation_method === "unavailable" || hasUnknownAds;
    const roasState = buildSkuRoasState({
      revenue: row.revenue,
      adSpendAllocated: adSpendForProfit,
      allocationMethod: adAllocation?.allocation_method ?? "none",
      allocationConfidence: adAllocationConfidence,
      campaignIds: adAllocation?.campaign_ids ?? []
    });
    const estimatedComponents = Array.from(new Set([
      ...row.estimated_components,
      ...(adAllocation && !["direct", "campaign_window", "campaign_revenue_share", "none"].includes(adAllocation.allocation_method)
        ? ["ad_allocation"]
        : []),
      ...(inventory ? [] : ["inventory"])
    ])).sort();
    const profitConfidence = skuProfitConfidence({
      estimatedComponentCount: estimatedComponents.length,
      cogsConfidence: row.cogs_confidence,
      adAllocationConfidence,
      inventoryConfidence
    });
    const marginRisk = margin < 0.15;
    const overallRiskScore = skuRiskScore({
      revenue: row.revenue,
      quantity: row.quantity,
      margin,
      refundCost: row.refund_cost,
      estimatedComponentCount: estimatedComponents.length,
      stockoutRisk,
      refundRisk,
      channelConcentrationRisk,
      attributionRisk
    });
    const decision = recommendSkuAction({
      margin,
      quantity: row.quantity,
      roasStatus: roasState.roas_status,
      roasValue: roasState.roas_value,
      stockoutRisk,
      overstockRisk,
      salesVelocity,
      netProfit,
      profitConfidence,
      inventoryAvailable: Boolean(inventory),
      attributionConfidence: roasState.attribution_confidence,
      roasConfidence: roasState.roas_confidence,
      adAllocationMethod
    });
    const expectedImpact = expectedSkuImpact({
      action: decision.action,
      revenue: row.revenue,
      netProfit,
      margin,
      adCostAllocated: adSpendForProfit,
      totalCost
    });
    const lifecycleStage = lifecycleStageFromSignals({
      margin,
      netProfit,
      salesVelocity,
      daysOfInventory,
      dataPeriodDays: velocity.data_period_days
    });
    const lifecycleConfidence: "HIGH" | "MEDIUM" | "LOW" = velocity.data_period_days >= 30 ? "HIGH" : velocity.data_period_days >= 14 ? "MEDIUM" : "LOW";
    const inventoryDecision = evaluateInventoryDecision({
      sku: row.sku,
      lifecycle_stage: lifecycleStage,
      lifecycle_confidence: lifecycleConfidence,
      stock: inventory?.available_stock ?? 0,
      sold: row.quantity,
      revenue: row.revenue,
      cogs: row.cogs,
      margin,
      net_profit: netProfit,
      contribution_profit: profitability.contribution_profit,
      sales_velocity: salesVelocity,
      velocity_confidence: velocity.velocity_confidence,
      data_period_days: velocity.data_period_days,
      runway_days: daysOfInventory,
      channel_details: buildChannelDetails({ channelRecord, totalRevenue: row.revenue, netProfit, quantity: row.quantity }),
      ad_spend: adSpendForProfit,
      roas_confidence: roasState.roas_confidence,
      demandTrend: demandTrendBySku.get(row.sku) ?? null
    });

    return {
      ...row,
      ad_cost_allocated: adCostAllocated,
      total_cost: totalCost,
      gross_profit: profitability.gross_profit,
      operating_cost: profitability.operating_cost,
      contribution_profit: profitability.contribution_profit,
      net_profit: netProfit,
      margin,
      profitability_confidence: profitability.profitability_confidence,
      validation_status: profitability.validation.validation_status,
      optimization_allowed: profitability.validation.optimization_allowed && !hasUnknownAds && adAllocationConfidence >= 0.4,
      warnings: Array.from(new Set([
        ...profitability.validation.warnings,
        ...(adAllocation?.warnings ?? [])
      ])),
      sku_roas: roasState.roas_value ?? 0,
      roas_value: roasState.roas_value,
      roas_display: roasState.roas_display,
      roas_status: roasState.roas_status,
      roas_confidence: roasState.roas_confidence,
      roas_confidence_reason: roasState.roas_confidence_reason,
      attribution_method: roasState.attribution_method,
      attribution_confidence: roasState.attribution_confidence,
      contribution: 0,
      risk_score: overallRiskScore,
      profit_confidence: profitConfidence,
      channel_breakdown: channelRecord,
      channel_details: buildChannelDetails({ channelRecord, totalRevenue: row.revenue, netProfit, quantity: row.quantity }),
      ad_allocation_method: adAllocationMethod,
      ad_allocation_confidence: adAllocationConfidence,
      attribution_source: adAllocation?.attribution_source ?? "none",
      attributed_campaigns: adAllocation?.attributed_campaigns ?? [],
      ads_validation_status: adAllocation?.ads_validation_status ?? "PASSED",
      ads_validation_warnings: adAllocation?.warnings ?? [],
      ads_lineage: adAllocation?.lineage ?? {
        raw_platform_spend: 0,
        sku_direct_attribution: 0,
        campaign_allocation: 0,
        revenue_share_fallback: 0,
        final_allocated_ads: adCostAllocated
      },
      campaign_ids: adAllocation?.campaign_ids ?? [],
      attribution_window_start: adAllocation?.attribution_window_start ?? null,
      attribution_window_end: adAllocation?.attribution_window_end ?? null,
      stock_level: inventory?.stock_level ?? null,
      available_stock: inventory?.available_stock ?? null,
      sales_velocity: salesVelocity,
      normalized_daily_sales_velocity: velocity.normalized_daily_sales_velocity,
      velocity_window_days: velocity.velocity_window_days,
      calculation_window_days: velocity.calculation_window_days,
      velocity_calculation_basis: velocity.calculation_basis,
      velocity_confidence: velocity.velocity_confidence,
      data_period_days: velocity.data_period_days,
      inventory_risk_status: inventoryRiskStatus,
      days_of_inventory: daysOfInventory,
      stockout_risk: stockoutRisk,
      overstock_risk: overstockRisk,
      refund_rate: refundRate,
      refund_risk: refundRisk,
      margin_risk: marginRisk,
      channel_concentration_risk: channelConcentrationRisk,
      attribution_risk: attributionRisk,
      overall_risk_score: overallRiskScore,
      recommended_action: decision.action,
      decision_reason: decision.reason,
      expected_impact: expectedImpact,
      inventory_confidence: inventoryConfidence,
      lifecycle_stage: lifecycleStage,
      lifecycle_confidence: lifecycleConfidence,
      demand_trend: inventoryDecision.demandTrend,
      inventory_decision: inventoryDecision,
      inventory_risk_score: inventoryDecision.inventoryRiskScore,
      inventory_recommended_action: inventoryDecision.recommended_action,
      inventory_risk_reason: inventoryDecision.reasons[0] ?? "Inventory decision uses profitability, demand, coverage, and capital signals.",
      inventory_value: inventoryDecision.inventory_value,
      paid_dependency_score: inventoryDecision.paid_dependency_score,
      organic_sales_ratio: inventoryDecision.organic_sales_ratio,
      cost_breakdown: {
        cogs: row.cogs,
        shipping: row.shipping_cost,
        ads: adSpendForProfit,
        platform_fee: row.platform_fee,
        payment_fee: row.payment_fee,
        fulfillment: row.fulfillment_cost,
        refund: row.refund_cost
      },
      estimated_components: estimatedComponents,
      estimated: row.estimated || estimatedComponents.length > row.estimated_components.length
    };
  });

  const totalSkuProfit = sum(allocated.map((row) => row.net_profit));
  return allocated
    .map((row) => ({
      ...row,
      contribution: safeRatio(row.net_profit, totalSkuProfit)
    }))
    .sort((left, right) => right.net_profit - left.net_profit || left.sku.localeCompare(right.sku));
}

function buildDemandTrendBySku(orderItems: Array<Record<string, unknown>>, orders: Array<Record<string, unknown>>) {
  const orderDateById = new Map<string, string>();
  for (const order of orders) {
    const orderId = stringValue(order.order_id);
    const date = firstDateString(order.order_date, order.date, order.created_at, order.createdAt);
    if (orderId && date) orderDateById.set(orderId, date);
  }

  const datesBySku = new Map<string, string[]>();
  const quantityBySku = new Map<string, number>();
  for (const item of orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const orderId = stringValue(item.order_id);
    const date = firstDateString(item.order_date, item.date, item.created_at, item.createdAt) ?? orderDateById.get(orderId);
    quantityBySku.set(sku, roundRatio((quantityBySku.get(sku) ?? 0) + numberValue(item.quantity, 1)));
    if (!date) continue;
    const dates = datesBySku.get(sku) ?? [];
    dates.push(date);
    datesBySku.set(sku, dates);
  }

  return new Map(Array.from(quantityBySku.entries()).map(([sku, quantity]) => [
    sku,
    inferDemandTrendFromOrderDates({
      totalUnitsSold: quantity,
      orderDates: datesBySku.get(sku) ?? []
    })
  ]));
}

function buildChannelBreakdowns(orderItems: Array<Record<string, unknown>>) {
  const bySku = new Map<string, Record<string, number>>();
  for (const item of orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const platform = revenueChannelOrNull(firstString(item.platform, item.source_provider, item.channel));
    if (!platform) continue;
    const quantity = numberValue(item.quantity, 1);
    const revenue = firstNumber(item.revenue, item.net_sales, firstNumber(item.price, item.unit_price) * quantity);
    if (revenue <= 0) continue;
    const current = bySku.get(sku) ?? {};
    current[platform] = roundCurrency((current[platform] ?? 0) + revenue);
    bySku.set(sku, current);
  }
  return bySku;
}

function buildChannelDetails(input: {
  channelRecord: Record<string, number>;
  totalRevenue: number;
  netProfit: number;
  quantity: number;
}) {
  return Object.entries(input.channelRecord)
    .filter(([, revenue]) => revenue > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([platform, revenue]) => {
      const share = safeRatio(revenue, input.totalRevenue);
      const profit = roundCurrency(input.netProfit * share);
      return {
        platform,
        revenue: roundCurrency(revenue),
        quantity: Math.round(input.quantity * share),
        profit,
        margin: safeRatio(profit, revenue),
        share
      };
    });
}

function buildInventoryBySku(rows: Array<Record<string, unknown>>) {
  const bySku = new Map<string, { stock_level: number; available_stock: number }>();
  for (const row of rows) {
    const sku = stringValue(row.sku);
    if (!sku) continue;
    const stock = firstNumber(row.stock_level, row.on_hand, row.inventory_quantity, row.available_stock, row.available);
    const reserved = firstNumber(row.reserved_stock, row.reserved, row.committed);
    const explicitAvailable = firstNumber(row.available_stock, row.available);
    const available = explicitAvailable || Math.max(0, stock - reserved);
    const current = bySku.get(sku) ?? { stock_level: 0, available_stock: 0 };
    current.stock_level = roundCurrency(current.stock_level + stock);
    current.available_stock = roundCurrency(current.available_stock + available);
    bySku.set(sku, current);
  }
  return bySku;
}

function buildSalesVelocityBySku(orderItems: Array<Record<string, unknown>>, orders: Array<Record<string, unknown>>) {
  const orderDateById = new Map<string, string>();
  for (const order of orders) {
    const orderId = stringValue(order.order_id);
    const date = firstDateString(order.order_date, order.date, order.created_at, order.createdAt);
    if (orderId && date) orderDateById.set(orderId, date);
  }

  const datesBySku = new Map<string, string[]>();
  const quantityBySku = new Map<string, number>();
  for (const item of orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const orderId = stringValue(item.order_id);
    const date = firstDateString(item.order_date, item.date, item.created_at, item.createdAt) ?? orderDateById.get(orderId);
    quantityBySku.set(sku, roundRatio((quantityBySku.get(sku) ?? 0) + numberValue(item.quantity, 1)));
    if (!date) continue;
    const dates = datesBySku.get(sku) ?? [];
    dates.push(date);
    datesBySku.set(sku, dates);
  }

  return new Map(Array.from(quantityBySku.entries()).map(([sku, quantity]) => [
    sku,
    calculateSalesVelocity({
      totalUnitsSold: quantity,
      orderDates: datesBySku.get(sku) ?? []
    })
  ]));
}

function skuProfitConfidence(input: {
  estimatedComponentCount: number;
  cogsConfidence: number;
  adAllocationConfidence: number;
  inventoryConfidence: number;
}) {
  const estimatePenalty = Math.min(0.45, input.estimatedComponentCount * 0.09);
  const inventoryPenalty = input.inventoryConfidence ? 0 : 0.08;
  return roundRatio(Math.max(0, Math.min(input.cogsConfidence, input.adAllocationConfidence) - estimatePenalty - inventoryPenalty));
}

function skuRiskScore(input: {
  revenue: number;
  quantity: number;
  margin: number;
  refundCost: number;
  estimatedComponentCount: number;
  stockoutRisk: "high" | "medium" | "low" | "unknown";
  refundRisk: "high" | "medium" | "low" | "unknown";
  channelConcentrationRisk: boolean;
  attributionRisk: boolean;
}) {
  const marginRisk = input.margin < 0 ? 0.5 : input.margin < 0.1 ? 0.3 : input.margin < 0.25 ? 0.15 : 0.05;
  const refundRisk = input.refundRisk === "high" ? 0.22 : input.refundRisk === "medium" ? 0.12 : 0.03;
  const stockRisk = input.stockoutRisk === "high" ? 0.22 : input.stockoutRisk === "medium" ? 0.12 : input.stockoutRisk === "unknown" ? 0.08 : 0.02;
  const velocityRisk = input.quantity <= 1 ? 0.15 : input.quantity < 5 ? 0.08 : 0.02;
  const estimationRisk = Math.min(0.3, input.estimatedComponentCount * 0.06);
  const concentrationRisk = input.channelConcentrationRisk ? 0.08 : 0;
  const attributionRisk = input.attributionRisk ? 0.08 : 0;
  return roundRatio(Math.min(1, marginRisk + refundRisk + stockRisk + velocityRisk + estimationRisk + concentrationRisk + attributionRisk));
}

function stockoutRiskLevel(daysOfInventory: number | null, inventory: { stock_level: number; available_stock: number } | undefined, velocityConfidence: VelocityConfidence): SkuProfitAllocationRow["stockout_risk"] {
  if (!inventory || daysOfInventory === null) return "unknown";
  if (velocityConfidence === "LOW") return "unknown";
  if (daysOfInventory < 7) return "high";
  if (daysOfInventory <= 21) return "medium";
  return "low";
}

function inventoryRiskStatusFromRunway(
  daysOfInventory: number | null,
  velocityConfidence: VelocityConfidence
): SkuProfitAllocationRow["inventory_risk_status"] {
  if (daysOfInventory !== null && daysOfInventory < 14) {
    return velocityConfidence === "LOW" ? "LOW_CONFIDENCE_STOCK_RISK" : "STOCKOUT_RISK";
  }
  if (daysOfInventory !== null && daysOfInventory > 90) {
    return "EXCESS_INVENTORY";
  }
  return velocityConfidence === "LOW" ? "INSUFFICIENT_DATA" : "OK";
}

function lifecycleStageFromSignals(input: {
  margin: number;
  netProfit: number;
  salesVelocity: number;
  daysOfInventory: number | null;
  dataPeriodDays: number;
}) {
  if (input.dataPeriodDays < 14) return "UNKNOWN";
  if (input.netProfit > 0 && input.margin >= 0.25 && input.salesVelocity >= 3 && (input.daysOfInventory ?? 0) < 90) return "GROWTH";
  if (input.netProfit > 0 && input.margin >= 0.18) return "MATURE";
  if (input.netProfit <= 0 || (input.daysOfInventory ?? 0) > 120) return "DECLINING";
  return "MATURE";
}

function overstockRiskLevel(daysOfInventory: number | null, salesVelocity: number, inventory?: { stock_level: number; available_stock: number }): SkuProfitAllocationRow["overstock_risk"] {
  if (!inventory || daysOfInventory === null) return "unknown";
  if (daysOfInventory > 90) return "high";
  if (daysOfInventory > 60) return "medium";
  return "low";
}

function refundRiskLevel(refundRate: number, estimated: boolean): SkuProfitAllocationRow["refund_risk"] {
  if (estimated) return "unknown";
  if (refundRate > 0.08) return "high";
  if (refundRate >= 0.03) return "medium";
  return "low";
}

function recommendSkuAction(input: {
  margin: number;
  quantity: number;
  roasStatus: SkuRoasStatus;
  roasValue: number | null;
  roasConfidence: SkuRoasConfidence;
  attributionConfidence: number;
  adAllocationMethod: SkuProfitAllocationRow["ad_allocation_method"];
  stockoutRisk: "high" | "medium" | "low" | "unknown";
  overstockRisk: "high" | "medium" | "low" | "unknown";
  salesVelocity: number;
  netProfit: number;
  profitConfidence: number;
  inventoryAvailable: boolean;
}) {
  if (input.roasStatus === "attribution_missing") {
    return { action: "NEED_MORE_DATA" as const, reason: "This SKU has sales, but advertising-to-order attribution data is missing; ad contribution cannot be judged." };
  }
  if (input.adAllocationMethod === "unknown" || input.attributionConfidence < 0.4) {
    return { action: "NEED_MORE_DATA" as const, reason: "Advertising spend exists, but SKU-level attribution is too weak to make a profitability decision." };
  }
  if (input.roasStatus === "spent_no_revenue" && input.margin < 0.2) {
    return { action: "REDUCE_AD_SPEND" as const, reason: "This SKU has ad spend but no attributed revenue; check campaign efficiency." };
  }
  if (input.profitConfidence < 0.3) return { action: "NEED_MORE_DATA" as const, reason: "Cost or attribution confidence is too low." };
  if (input.roasValue !== null && input.roasConfidence === "LOW" && input.roasValue > DEFAULT_ROAS_ANOMALY_THRESHOLD) {
    return { action: "NEED_MORE_DATA" as const, reason: "ROAS anomaly requires attribution validation before scaling." };
  }
  if (input.netProfit < 0 && input.quantity < 5) return { action: "STOP_SKU" as const, reason: "Negative profit with weak sales velocity." };
  if (input.overstockRisk === "high" && input.salesVelocity < 1) return { action: "CLEAR_INVENTORY" as const, reason: "Inventory days are high while sales velocity is low." };
  if (input.margin < 0.12 && input.quantity >= 10) return { action: "RAISE_PRICE" as const, reason: "Sales velocity is healthy but SKU margin is low." };
  if (input.roasValue !== null && input.roasValue < 1 && input.margin < 0.2) {
    return { action: "REDUCE_AD_SPEND" as const, reason: "Attributed ad efficiency and margin are both weak." };
  }
  if (input.roasValue !== null && input.roasValue > 2 && input.margin > 0.2 && input.stockoutRisk === "high" && input.inventoryAvailable) {
    return { action: "RESTOCK_FIRST" as const, reason: "Profitable demand exists, but inventory is constrained." };
  }
  if (input.roasValue !== null && input.roasValue > 2 && input.margin > 0.2 && input.stockoutRisk !== "high" && input.attributionConfidence >= 0.65) {
    return { action: "SCALE_ADS" as const, reason: "SKU has strong ROAS, margin, and no high stockout risk." };
  }
  if (input.roasValue !== null && input.roasValue > 2 && input.margin > 0.2 && input.stockoutRisk !== "high") {
    return { action: "NEED_MORE_DATA" as const, reason: "ROAS is estimated from low-confidence ad attribution; run a controlled spend test before scaling." };
  }
  if (input.margin < 0.18) return { action: "FIX_MARGIN" as const, reason: "Margin is below operating threshold." };
  if (input.roasStatus === "not_advertised") {
    return { action: "MONITOR" as const, reason: "This SKU currently has no advertising records, so SKU-level ROAS cannot be evaluated." };
  }
  return { action: "MONITOR" as const, reason: "SKU economics are acceptable without an urgent action." };
}

function expectedSkuImpact(input: {
  action: SkuProfitAllocationRow["recommended_action"];
  revenue: number;
  netProfit: number;
  margin: number;
  adCostAllocated: number;
  totalCost: number;
}) {
  if (input.action === "SCALE_ADS") {
    const revenueDelta = roundCurrency(input.revenue * 0.1);
    const nonAdCostRate = safeRatio(Math.max(0, input.totalCost - input.adCostAllocated), input.revenue);
    return {
      profit_delta_estimate: roundCurrency(revenueDelta * (1 - nonAdCostRate) - input.adCostAllocated * 0.1),
      revenue_delta_estimate: revenueDelta,
      risk_delta: "higher ad exposure",
      explanation: "Assumes ad spend and revenue both rise 10% with current non-ad cost rate.",
      estimated: true as const
    };
  }
  if (input.action === "RAISE_PRICE") {
    const revenueDelta = roundCurrency(input.revenue * 0.05 * 0.98);
    return {
      profit_delta_estimate: roundCurrency(revenueDelta),
      revenue_delta_estimate: revenueDelta,
      risk_delta: "slight demand risk",
      explanation: "Assumes a 5% price lift with 2% demand softness.",
      estimated: true as const
    };
  }
  if (input.action === "REDUCE_AD_SPEND") {
    const revenueDelta = roundCurrency(-input.revenue * 0.05);
    return {
      profit_delta_estimate: roundCurrency(input.adCostAllocated * 0.2 + revenueDelta * input.margin),
      revenue_delta_estimate: revenueDelta,
      risk_delta: "lower acquisition volume",
      explanation: "Assumes ad spend drops 20% while revenue softens 5%.",
      estimated: true as const
    };
  }
  if (input.action === "STOP_SKU") {
    return {
      profit_delta_estimate: roundCurrency(Math.max(0, -input.netProfit)),
      revenue_delta_estimate: roundCurrency(-input.revenue),
      risk_delta: "SKU exposure removed",
      explanation: "Avoids future negative contribution from this SKU.",
      estimated: true as const
    };
  }
  if (input.action === "RESTOCK_FIRST") {
    return {
      profit_delta_estimate: 0,
      revenue_delta_estimate: 0,
      risk_delta: "stockout risk reduced",
      explanation: "No immediate profit delta; prevents lost sales before scaling demand.",
      estimated: true as const
    };
  }
  return {
    profit_delta_estimate: 0,
    revenue_delta_estimate: 0,
    risk_delta: "unchanged",
    explanation: "No quantified operating change is applied.",
    estimated: true as const
  };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const stringified = stringValue(value);
    if (stringified) return stringified;
  }
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = parseNumber(value);
    if (numeric !== null) return numeric;
  }
  return 0;
}

function numberValue(value: unknown, fallback = 0) {
  return parseNumber(value) ?? fallback;
}

function firstDateString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function safeRatio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return roundRatio(numerator / denominator);
}

function buildSkuRoasState(input: {
  revenue: number;
  adSpendAllocated: number;
  allocationMethod: SkuProfitAllocationRow["ad_allocation_method"];
  allocationConfidence: number;
  campaignIds: string[];
}) {
  const attributionMethod = normalizeAttributionMethod(input.allocationMethod);
  const hasSpend = input.adSpendAllocated > 0;
  const hasRevenue = input.revenue > 0;
  const hasCampaign = input.campaignIds.length > 0;
  const isFallback = attributionMethod.includes("fallback") || ["conversion_share", "revenue_share", "equal_distribution"].includes(input.allocationMethod);
  const confidence = isFallback ? Math.min(input.allocationConfidence, 0.5) : input.allocationConfidence;
  const roasQuality = (value: number): { roas_confidence: SkuRoasConfidence; roas_confidence_reason?: string } => {
    if (value > DEFAULT_ROAS_ANOMALY_THRESHOLD) {
      return {
        roas_confidence: "LOW",
        roas_confidence_reason: "ROAS anomaly requires attribution validation"
      };
    }
    if (confidence >= 0.8 && attributionMethod === "direct") return { roas_confidence: "HIGH" };
    if (confidence >= 0.65 && !isFallback) return { roas_confidence: "MEDIUM" };
    return {
      roas_confidence: "LOW",
      roas_confidence_reason: isFallback ? "ROAS uses fallback ad allocation" : "Ad attribution confidence is low"
    };
  };

  if (!hasSpend && !hasCampaign && attributionMethod !== "unavailable") {
    return {
      roas_value: null,
      roas_display: "No Ads",
      roas_status: "not_advertised" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence,
      roas_confidence: "LOW" as const,
      roas_confidence_reason: "No advertising spend is available"
    };
  }

  if (hasSpend && !hasRevenue) {
    return {
      roas_value: 0,
      roas_display: "0.00",
      roas_status: "spent_no_revenue" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence,
      roas_confidence: "MEDIUM" as const
    };
  }

  if (hasSpend && attributionMethod === "direct") {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    const quality = roasQuality(value);
    return {
      roas_value: value,
      roas_display: formatRoas(value),
      roas_status: "attributed" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence,
      ...quality
    };
  }

  if (isFallback && hasSpend) {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    const quality = roasQuality(value);
    return {
      roas_value: value,
      roas_display: `Estimated ${formatRoas(value)}`,
      roas_status: "estimated" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence,
      ...quality
    };
  }

  if (hasSpend) {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    const quality = roasQuality(value);
    return {
      roas_value: value,
      roas_display: formatRoas(value),
      roas_status: "attributed" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence,
      ...quality
    };
  }

  if (hasRevenue || attributionMethod === "unavailable") {
    return {
      roas_value: null,
      roas_display: "Attribution missing",
      roas_status: "attribution_missing" as const,
      attribution_method: attributionMethod,
      attribution_confidence: Math.min(confidence, 0.3),
      roas_confidence: "LOW" as const,
      roas_confidence_reason: "Advertising attribution is missing"
    };
  }

  return {
    roas_value: null,
    roas_display: "No Ads",
    roas_status: "not_advertised" as const,
    attribution_method: attributionMethod,
    attribution_confidence: confidence,
    roas_confidence: "LOW" as const,
    roas_confidence_reason: "No advertising spend is available"
  };
}

function normalizeAttributionMethod(method: SkuProfitAllocationRow["ad_allocation_method"]): SkuAttributionMethod {
  if (method === "conversion_share" || method === "equal_distribution") return "conversion_share_fallback";
  if (method === "revenue_share") return "revenue_share_fallback";
  if (method === "campaign_window") return "campaign_window_fallback";
  return method;
}

function formatRoas(value: number) {
  return value.toFixed(2);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
