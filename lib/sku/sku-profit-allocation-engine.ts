import { allocateAdSpendToSkus } from "./sku-ad-allocation-engine";
import { revenueChannelOrNull } from "@/lib/channels/revenue-channel";

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
  cogs_confidence: number;
  cogs_semantic_warnings: string[];
};

export type SkuRoasStatus = "not_advertised" | "spent_no_revenue" | "attributed" | "estimated" | "attribution_missing";
export type SkuAttributionMethod =
  | "direct"
  | "campaign_window"
  | "campaign_revenue_share"
  | "conversion_share_fallback"
  | "revenue_share_fallback"
  | "campaign_window_fallback"
  | "unavailable"
  | "none";

export type SkuProfitAllocationRow = SkuProfitInputRow & {
  ad_cost_allocated: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  sku_roas: number;
  roas_value: number | null;
  roas_display: string;
  roas_status: SkuRoasStatus;
  attribution_method: SkuAttributionMethod;
  attribution_confidence: number;
  contribution: number;
  risk_score: number;
  profit_confidence: number;
  channel_breakdown: Record<string, number>;
  channel_details: Array<{ platform: string; revenue: number; quantity: number; profit: number; margin: number; share: number }>;
  ad_allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "none";
  ad_allocation_confidence: number;
  campaign_ids: string[];
  attribution_window_start: string | null;
  attribution_window_end: string | null;
  stock_level: number | null;
  available_stock: number | null;
  sales_velocity: number;
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
  ads: Array<Record<string, unknown>>;
  inventory?: Array<Record<string, unknown>>;
}) {
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
  const activeDaysBySku = buildActiveDaysBySku(input.orderItems);

  const allocated = rows.map((row) => {
    const adAllocation = adAllocations.get(row.sku);
    const adCostAllocated = roundCurrency(adAllocation?.allocated_ad_spend ?? 0);
    const totalCost = roundCurrency(
      row.cogs +
        row.shipping_cost +
        row.fulfillment_cost +
        row.platform_fee +
        row.payment_fee +
        row.refund_cost +
        adCostAllocated
    );
    const netProfit = roundCurrency(row.revenue - totalCost);
    const margin = safeRatio(netProfit, row.revenue);
    const inventory = inventoryBySku.get(row.sku);
    const inventoryConfidence = inventory ? 1 : 0;
    const salesVelocity = roundRatio(row.quantity / Math.max(1, activeDaysBySku.get(row.sku) ?? 1));
    const daysOfInventory = inventory && salesVelocity > 0 ? roundRatio(inventory.available_stock / salesVelocity) : null;
    const stockoutRisk = stockoutRiskLevel(daysOfInventory, inventory);
    const overstockRisk = overstockRiskLevel(daysOfInventory, salesVelocity, inventory);
    const refundRate = safeRatio(row.refund_cost, row.revenue);
    const refundRisk = refundRiskLevel(refundRate, row.estimated_components.includes("refund_cost"));
    const channelRecord = channelBreakdowns.get(row.sku) ?? {};
    const channelConcentrationRisk = Object.values(channelRecord).some((value) => row.revenue > 0 && value / row.revenue > 0.7);
    const attributionRisk = (adAllocation?.allocation_confidence ?? 1) < 0.6 || adAllocation?.allocation_method === "unavailable";
    const roasState = buildSkuRoasState({
      revenue: row.revenue,
      adSpendAllocated: adCostAllocated,
      allocationMethod: adAllocation?.allocation_method ?? "none",
      allocationConfidence: adAllocation?.allocation_confidence ?? 1,
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
      adAllocationConfidence: adAllocation?.allocation_confidence ?? 1,
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
      inventoryAvailable: Boolean(inventory)
    });
    const expectedImpact = expectedSkuImpact({
      action: decision.action,
      revenue: row.revenue,
      netProfit,
      margin,
      adCostAllocated,
      totalCost
    });

    return {
      ...row,
      ad_cost_allocated: adCostAllocated,
      total_cost: totalCost,
      net_profit: netProfit,
      margin,
      sku_roas: roasState.roas_value ?? 0,
      roas_value: roasState.roas_value,
      roas_display: roasState.roas_display,
      roas_status: roasState.roas_status,
      attribution_method: roasState.attribution_method,
      attribution_confidence: roasState.attribution_confidence,
      contribution: 0,
      risk_score: overallRiskScore,
      profit_confidence: profitConfidence,
      channel_breakdown: channelRecord,
      channel_details: buildChannelDetails({ channelRecord, totalRevenue: row.revenue, netProfit, quantity: row.quantity }),
      ad_allocation_method: adAllocation?.allocation_method ?? "none",
      ad_allocation_confidence: adAllocation?.allocation_confidence ?? 1,
      campaign_ids: adAllocation?.campaign_ids ?? [],
      attribution_window_start: adAllocation?.attribution_window_start ?? null,
      attribution_window_end: adAllocation?.attribution_window_end ?? null,
      stock_level: inventory?.stock_level ?? null,
      available_stock: inventory?.available_stock ?? null,
      sales_velocity: salesVelocity,
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
      cost_breakdown: {
        cogs: row.cogs,
        shipping: row.shipping_cost,
        ads: adCostAllocated,
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

function buildActiveDaysBySku(orderItems: Array<Record<string, unknown>>) {
  const datesBySku = new Map<string, Set<string>>();
  for (const item of orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const date = firstDateString(item.order_date, item.date, item.created_at, item.createdAt);
    if (!date) continue;
    const dates = datesBySku.get(sku) ?? new Set<string>();
    dates.add(date);
    datesBySku.set(sku, dates);
  }
  return new Map(Array.from(datesBySku.entries()).map(([sku, dates]) => [sku, Math.max(1, dates.size)]));
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

function stockoutRiskLevel(daysOfInventory: number | null, inventory?: { stock_level: number; available_stock: number }): SkuProfitAllocationRow["stockout_risk"] {
  if (!inventory || daysOfInventory === null) return "unknown";
  if (daysOfInventory < 7) return "high";
  if (daysOfInventory <= 21) return "medium";
  return "low";
}

function overstockRiskLevel(daysOfInventory: number | null, salesVelocity: number, inventory?: { stock_level: number; available_stock: number }): SkuProfitAllocationRow["overstock_risk"] {
  if (!inventory || daysOfInventory === null) return "unknown";
  if (daysOfInventory > 90 && salesVelocity < 1) return "high";
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
  if (input.roasStatus === "spent_no_revenue" && input.margin < 0.2) {
    return { action: "REDUCE_AD_SPEND" as const, reason: "This SKU has ad spend but no attributed revenue; check campaign efficiency." };
  }
  if (input.profitConfidence < 0.3) return { action: "NEED_MORE_DATA" as const, reason: "Cost or attribution confidence is too low." };
  if (input.netProfit < 0 && input.quantity < 5) return { action: "STOP_SKU" as const, reason: "Negative profit with weak sales velocity." };
  if (input.overstockRisk === "high" && input.salesVelocity < 1) return { action: "CLEAR_INVENTORY" as const, reason: "Inventory days are high while sales velocity is low." };
  if (input.margin < 0.12 && input.quantity >= 10) return { action: "RAISE_PRICE" as const, reason: "Sales velocity is healthy but SKU margin is low." };
  if (input.roasValue !== null && input.roasValue < 1 && input.margin < 0.2) {
    return { action: "REDUCE_AD_SPEND" as const, reason: "Attributed ad efficiency and margin are both weak." };
  }
  if (input.roasValue !== null && input.roasValue > 2 && input.margin > 0.2 && input.stockoutRisk === "high" && input.inventoryAvailable) {
    return { action: "RESTOCK_FIRST" as const, reason: "Profitable demand exists, but inventory is constrained." };
  }
  if (input.roasValue !== null && input.roasValue > 2 && input.margin > 0.2 && input.stockoutRisk !== "high") {
    return { action: "SCALE_ADS" as const, reason: "SKU has strong ROAS, margin, and no high stockout risk." };
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
    const costRate = safeRatio(input.totalCost, input.revenue);
    return {
      profit_delta_estimate: roundCurrency(revenueDelta * (1 - costRate) - input.adCostAllocated * 0.1),
      revenue_delta_estimate: revenueDelta,
      risk_delta: "higher ad exposure",
      explanation: "Assumes ad spend and revenue both rise 10% with current cost rate.",
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

  if (!hasSpend && !hasCampaign && attributionMethod !== "unavailable") {
    return {
      roas_value: null,
      roas_display: "No Ads",
      roas_status: "not_advertised" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence
    };
  }

  if (hasSpend && !hasRevenue) {
    return {
      roas_value: 0,
      roas_display: "0.00",
      roas_status: "spent_no_revenue" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence
    };
  }

  if (hasSpend && attributionMethod === "direct") {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    return {
      roas_value: value,
      roas_display: formatRoas(value),
      roas_status: "attributed" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence
    };
  }

  if (isFallback && hasSpend) {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    return {
      roas_value: value,
      roas_display: `Estimated ${formatRoas(value)}`,
      roas_status: "estimated" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence
    };
  }

  if (hasSpend) {
    const value = safeRatio(input.revenue, input.adSpendAllocated);
    return {
      roas_value: value,
      roas_display: formatRoas(value),
      roas_status: "attributed" as const,
      attribution_method: attributionMethod,
      attribution_confidence: confidence
    };
  }

  if (hasRevenue || attributionMethod === "unavailable") {
    return {
      roas_value: null,
      roas_display: "Attribution missing",
      roas_status: "attribution_missing" as const,
      attribution_method: attributionMethod,
      attribution_confidence: Math.min(confidence, 0.3)
    };
  }

  return {
    roas_value: null,
    roas_display: "No Ads",
    roas_status: "not_advertised" as const,
    attribution_method: attributionMethod,
    attribution_confidence: confidence
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
