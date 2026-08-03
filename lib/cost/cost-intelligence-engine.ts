import { resolveCogsSemantic, type CogsSemanticType } from "../semantic/cost/cogs-semantic-resolver";
import { calculateSkuProfitAndAllocation, type SkuAttributionMethod, type SkuRoasStatus } from "../sku/sku-profit-allocation-engine";
import { calculateSkuProfitability, CANONICAL_PROFITABILITY_ENGINE_VERSION, type CogsStatus, type ProfitValidationStatus } from "@/lib/profit/canonical-profitability-engine";

export type CostInputRow = Record<string, unknown>;

export type CostSkuUnit = {
  sku: string;
  product_name?: string;
  category?: string;
  variant_name?: string;
  size?: string;
  color?: string;
  revenue: number;
  quantity: number;
  cogs: number;
  ad_cost_allocated: number | null;
  fulfillment_cost: number;
  shipping_cost: number;
  platform_fee: number;
  payment_fee: number;
  refund_cost: number;
  refund_amount: number;
  reverse_logistics_cost: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  gross_profit?: number;
  operating_cost?: number;
  contribution_profit?: number;
  profitability_confidence?: number;
  validation_status?: ProfitValidationStatus;
  optimization_allowed?: boolean;
  warnings?: string[];
  sku_roas: number;
  roas_value?: number | null;
  roas_display?: string;
  roas_status?: SkuRoasStatus;
  attribution_method?: SkuAttributionMethod;
  attribution_confidence?: number;
  contribution: number;
  risk_score: number;
  profit_confidence: number;
  channel_breakdown: Record<string, number>;
  channel_details?: Array<{ platform: string; revenue: number; quantity: number; profit: number; margin: number; share: number }>;
  ad_allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "unknown" | "none";
  ad_allocation_confidence: number;
  attribution_source?: "meta_ads" | "amazon_ads" | "shopify_ads" | "campaign_attribution" | "sku_allocation" | "revenue_share_fallback" | "unknown" | "none";
  attributed_campaigns?: Array<{
    campaign_id: string;
    raw_spend: number;
    attributed_revenue: number;
    allocated_spend: number;
    allocation_method: "direct" | "campaign_revenue_share";
  }>;
  ads_validation_status?: "PASSED" | "FAILED" | "UNKNOWN";
  ads_validation_warnings?: string[];
  ads_lineage?: {
    raw_platform_spend: number;
    sku_direct_attribution: number;
    campaign_allocation: number;
    revenue_share_fallback: number;
    final_allocated_ads: number | null;
  };
  campaign_ids?: string[];
  attribution_window_start?: string | null;
  attribution_window_end?: string | null;
  stock_level?: number | null;
  available_stock?: number | null;
  sales_velocity?: number;
  days_of_inventory?: number | null;
  stockout_risk?: "high" | "medium" | "low" | "unknown";
  overstock_risk?: "high" | "medium" | "low" | "unknown";
  refund_rate?: number;
  refund_risk?: "high" | "medium" | "low" | "unknown";
  margin_risk?: boolean;
  channel_concentration_risk?: boolean;
  attribution_risk?: boolean;
  overall_risk_score?: number;
  recommended_action?: "SCALE_ADS" | "RESTOCK_FIRST" | "RAISE_PRICE" | "REDUCE_AD_SPEND" | "FIX_MARGIN" | "MONITOR" | "STOP_SKU" | "CLEAR_INVENTORY" | "NEED_MORE_DATA";
  decision_reason?: string;
  expected_impact?: {
    profit_delta_estimate: number;
    revenue_delta_estimate: number;
    risk_delta: string;
    explanation: string;
    estimated: true;
  };
  inventory_confidence?: number;
  cost_breakdown: {
    cogs: number;
    shipping: number;
    ads: number;
    platform_fee: number;
    payment_fee: number;
    fulfillment: number;
    refund: number;
  };
  cogs_type: CogsSemanticType | "mixed";
  cogs_status?: CogsStatus;
  cogs_confidence: number;
  cogs_semantic_warnings: string[];
  estimated_components: string[];
  estimated: boolean;
};

export type CostIntelligenceOutput = {
  totals: {
    revenue: number;
    cogs: number;
    ad_spend: number;
    fulfillment_cost: number;
    shipping_cost: number;
    platform_fee: number;
    payment_fee: number;
    refund_cost: number;
    refund_amount: number;
    reverse_logistics_cost: number;
    total_cost: number;
    estimated_cost: number;
    gross_profit: number;
    operating_cost: number;
    contribution_profit: number;
    net_profit: number;
    margin: number;
    profitability_confidence: number;
    validation_status: ProfitValidationStatus;
    optimization_allowed: boolean;
    warnings: string[];
    engine_version: typeof CANONICAL_PROFITABILITY_ENGINE_VERSION;
  };
  sku_unit_economics: CostSkuUnit[];
  data_quality: {
    cost_confidence: number;
    profit_confidence: number;
    estimated_cost_ratio: number;
    missing_cost_fields: string[];
    estimated_components: string[];
    real_cost_availability: number;
    cogs_confidence: number;
    cogs_type_breakdown: Record<CogsSemanticType, number>;
    cogs_semantic_warnings: string[];
    portfolio_reconciliation: {
      source: "sku_unit_economics" | "portfolio_totals";
      order_revenue: number;
      sku_revenue: number;
      revenue_difference: number;
      cogs_difference: number;
      ads_difference: number;
      operating_cost_difference: number;
      net_profit_difference: number;
      unallocated_costs: number;
      duplicated_costs: number;
      warnings: string[];
    };
  };
};

const COST_BENCHMARKS = {
  cogsRate: 0.45,
  shippingRate: 0.08,
  platformFeeRate: 0.03,
  paymentFeeRate: 0.029,
  refundRate: 0.04
} as const;

type SkuProductMetadata = {
  product_name?: string;
  category?: string;
  variant_name?: string;
  size?: string;
  color?: string;
};

export function calculateCostIntelligence(input: {
  revenue: number;
  refundAmount: number;
  refunds: CostInputRow[];
  orderItems: CostInputRow[];
  products: CostInputRow[];
  orders: CostInputRow[];
  ads: CostInputRow[];
  inventory?: CostInputRow[];
}): CostIntelligenceOutput {
  const { revenue, refundAmount, refunds, orderItems, products, orders, ads, inventory = [] } = input;
  const missingCostFields = new Set<string>();
  const estimatedComponents = new Set<string>();

  const productCostByProductId = new Map<string, number>();
  const productCostBySku = new Map<string, number>();
  const productMetadataByProductId = new Map<string, SkuProductMetadata>();
  const productMetadataByVariantId = new Map<string, SkuProductMetadata>();
  const productMetadataBySku = new Map<string, SkuProductMetadata>();

  for (const product of products) {
    const cost = firstFiniteNumber(product.cost_price, product.product_cost, product.manufacturing_cost, product.procurement_cost, product.cost, product.unit_cost, product.cogs);
    const productId = stringValue(product.product_id);
    const variantId = stringValue(product.variant_id);
    const sku = stringValue(product.sku);
    const metadata = productMetadata(product);
    if (cost !== null) {
      if (productId) productCostByProductId.set(productId, cost);
      if (sku) productCostBySku.set(sku, cost);
    }
    if (productId) productMetadataByProductId.set(productId, metadata);
    if (variantId) productMetadataByVariantId.set(variantId, metadata);
    if (sku) productMetadataBySku.set(sku, metadata);
  }

  let cogs = 0;
  let estimatedCogs = 0;
  let realCostRows = 0;
  let cogsConfidenceTotal = 0;
  let cogsConfidenceWeight = 0;
  const cogsTypeBreakdown: Record<CogsSemanticType, number> = { unit: 0, total: 0, unknown: 0 };
  const cogsSemanticWarnings = new Set<string>();
  const skuRows = new Map<string, CostSkuUnit>();

  for (const item of orderItems) {
    const quantity = numberValue(item.quantity, 1);
    const itemRevenue = roundCurrency(numberValue(item.revenue, numberValue(item.price, numberValue(item.unit_price)) * quantity));
    const sku = stringValue(item.sku) || "UNTRACKED-SKU";
    const costResolution = resolveItemCogs({
      item,
      productCostByProductId,
      productCostBySku,
      quantity,
      itemRevenue
    });
    const rowCogs = costResolution
      ? costResolution.resolution.normalized_cogs
      : roundCurrency((quantity ? itemRevenue / quantity : 0) * COST_BENCHMARKS.cogsRate * quantity);

    if (!costResolution) {
      estimatedCogs += rowCogs;
      cogsConfidenceTotal += 0.2 * Math.max(itemRevenue, 1);
      cogsConfidenceWeight += Math.max(itemRevenue, 1);
      cogsTypeBreakdown.unknown += 1;
    } else {
      realCostRows += 1;
      cogsConfidenceTotal += costResolution.resolution.confidence * Math.max(itemRevenue, 1);
      cogsConfidenceWeight += Math.max(itemRevenue, 1);
      cogsTypeBreakdown[costResolution.resolution.cogs_type] += 1;
      if (costResolution.resolution.estimated_cost_flag || costResolution.resolution.confidence < 0.7) {
        cogsSemanticWarnings.add(`${sku || "UNTRACKED-SKU"}: ${costResolution.resolution.reason}`);
        estimatedComponents.add("cogs_semantic");
      }
    }
    cogs += rowCogs;

    const current = skuRows.get(sku) ?? emptySkuCostRow(sku);
    mergeSkuProductMetadata(
      current,
      productMetadataBySku.get(sku) ??
        productMetadataByVariantId.get(stringValue(item.variant_id)) ??
        productMetadataByProductId.get(stringValue(item.product_id)) ??
        productMetadata(item)
    );
    current.revenue = roundCurrency(current.revenue + itemRevenue);
    current.quantity += quantity;
    current.cogs = roundCurrency(current.cogs + rowCogs);
    current.shipping_cost = roundCurrency(current.shipping_cost + itemCostValue(item, ["shipping_cost", "shipping_expense", "shipping_fee", "carrier_cost", "postage_cost"]));
    current.platform_fee = roundCurrency(current.platform_fee + itemCostValue(item, ["platform_fee", "marketplace_fee", "selling_fee", "commission_fee"]));
    current.payment_fee = roundCurrency(current.payment_fee + itemCostValue(item, ["payment_fee", "processing_fee", "transaction_fee", "stripe_fee"]));
    current.fulfillment_cost = roundCurrency(current.fulfillment_cost + itemCostValue(item, ["fulfillment_cost", "handling_cost", "pick_pack_cost", "warehouse_cost", "storage_cost"]));
    const itemRefundAmount = itemCostValue(item, ["refund_amount", "refund", "returned_amount"]);
    const itemReverseLogistics = itemCostValue(item, ["reverse_logistics_cost", "return_shipping_cost", "refund_shipping_cost"]);
    current.refund_amount = roundCurrency(current.refund_amount + itemRefundAmount);
    current.reverse_logistics_cost = roundCurrency(current.reverse_logistics_cost + itemReverseLogistics);
    current.refund_cost = roundCurrency(current.refund_cost + itemRefundAmount + itemReverseLogistics);
    current.estimated = current.estimated || !costResolution || Boolean(costResolution.resolution.estimated_cost_flag);
    if (costResolution) {
      current.cogs_type = mergeCogsType(current.cogs_type, costResolution.resolution.cogs_type);
      current.cogs_confidence = weightedAverageConfidence({
        existingConfidence: current.cogs_confidence,
        existingWeight: Math.max(current.revenue - itemRevenue, 0),
        nextConfidence: costResolution.resolution.confidence,
        nextWeight: Math.max(itemRevenue, 1)
      });
      if (costResolution.resolution.estimated_cost_flag || costResolution.resolution.confidence < 0.7) {
        current.cogs_semantic_warnings.push(costResolution.resolution.reason);
      }
    } else {
      current.cogs_type = mergeCogsType(current.cogs_type, "unknown");
      current.cogs_confidence = weightedAverageConfidence({
        existingConfidence: current.cogs_confidence,
        existingWeight: Math.max(current.revenue - itemRevenue, 0),
        nextConfidence: 0.2,
        nextWeight: Math.max(itemRevenue, 1)
      });
    }
    skuRows.set(sku, current);
  }

  if (!orderItems.length && revenue > 0) {
    estimatedCogs = roundCurrency(revenue * COST_BENCHMARKS.cogsRate);
    cogs = estimatedCogs;
  }

  if ((orderItems.length && realCostRows < orderItems.length) || (!orderItems.length && revenue > 0)) {
    missingCostFields.add("ecommerce_order_items.cogs");
    estimatedComponents.add("cogs");
  }

  const shipping = aggregateOrderCost({
    rows: orders,
    fields: ["shipping_cost", "shipping_expense"],
    fallback: roundCurrency(revenue * COST_BENCHMARKS.shippingRate),
    missingField: "ecommerce_orders.shipping_cost",
    missingCostFields,
    estimatedComponents,
    componentName: "shipping_cost"
  });
  const handling = aggregateOrderCost({
    rows: orders,
    fields: ["handling_cost", "pick_pack_cost"],
    fallback: 0,
    missingField: "ecommerce_orders.handling_cost",
    missingCostFields,
    estimatedComponents,
    componentName: "handling_cost",
    estimateWhenMissing: false
  });
  const warehouse = aggregateOrderCost({
    rows: orders,
    fields: ["warehouse_cost", "storage_cost"],
    fallback: 0,
    missingField: "ecommerce_orders.warehouse_cost",
    missingCostFields,
    estimatedComponents,
    componentName: "warehouse_cost",
    estimateWhenMissing: false
  });
  const platformFee = aggregateOrderCost({
    rows: orders,
    fields: ["platform_fee", "marketplace_fee", "selling_fee"],
    fallback: roundCurrency(revenue * COST_BENCHMARKS.platformFeeRate),
    missingField: "ecommerce_orders.platform_fee",
    missingCostFields,
    estimatedComponents,
    componentName: "platform_fee"
  });

  const paymentFee = aggregateOrderCost({
    rows: orders,
    fields: ["payment_fee", "processing_fee", "transaction_fee"],
    fallback: roundCurrency(revenue * COST_BENCHMARKS.paymentFeeRate),
    missingField: "ecommerce_orders.payment_fee",
    missingCostFields,
    estimatedComponents,
    componentName: "payment_fee"
  });

  const directSkuShippingCost = roundCurrency(sum(Array.from(skuRows.values()).map((row) => row.shipping_cost)));
  const directSkuPlatformFee = roundCurrency(sum(Array.from(skuRows.values()).map((row) => row.platform_fee)));
  const directSkuPaymentFee = roundCurrency(sum(Array.from(skuRows.values()).map((row) => row.payment_fee)));
  const directSkuFulfillmentCost = roundCurrency(sum(Array.from(skuRows.values()).map((row) => row.fulfillment_cost)));
  const shippingTotal = directSkuShippingCost > 0 ? directSkuShippingCost : shipping.total;
  const platformFeeTotal = directSkuPlatformFee > 0 ? directSkuPlatformFee : platformFee.total;
  const paymentFeeTotal = directSkuPaymentFee > 0 ? directSkuPaymentFee : paymentFee.total;
  const nonShippingFulfillmentCost = directSkuFulfillmentCost > 0 ? directSkuFulfillmentCost : roundCurrency(handling.total + warehouse.total);
  const fulfillmentCost = nonShippingFulfillmentCost;
  const estimatedFulfillmentCost = directSkuShippingCost > 0 || directSkuFulfillmentCost > 0 ? 0 : roundCurrency(shipping.estimated + handling.estimated + warehouse.estimated);

  const adSpend = roundCurrency(sum(ads.map((row) => firstNumber(row.spend, row.ad_spend))));
  if (!ads.length) missingCostFields.add("ecommerce_ads.spend");

  const reverseLogisticsCost = roundCurrency(sum(refunds.map((row) => firstNumber(row.reverse_logistics_cost, row.return_shipping_cost, row.refund_shipping_cost))));
  const directSkuRefundCost = roundCurrency(sum(Array.from(skuRows.values()).map((row) => row.refund_cost)));
  const refundCost = directSkuRefundCost > 0 ? directSkuRefundCost : roundCurrency(refundAmount + reverseLogisticsCost);
  const estimatedRefundCost = refunds.length || directSkuRefundCost > 0 ? 0 : refundAmount;
  if (!refunds.length && refundAmount > 0) {
    missingCostFields.add("ecommerce_refunds.*");
    estimatedComponents.add("refund_cost");
  }

  const totalCost = roundCurrency(cogs + shippingTotal + fulfillmentCost + platformFeeTotal + paymentFeeTotal + refundCost);
  const estimatedCost = roundCurrency(
    estimatedCogs +
      estimatedFulfillmentCost +
      (directSkuPlatformFee > 0 ? 0 : platformFee.estimated) +
      (directSkuPaymentFee > 0 ? 0 : paymentFee.estimated) +
      estimatedRefundCost
  );
  const estimatedCostRatio = safeRatio(estimatedCost, Math.max(totalCost, 1));
  const realCostAvailability = roundRatio(1 - estimatedCostRatio);
  const cogsConfidence = cogsConfidenceWeight > 0 ? roundRatio(cogsConfidenceTotal / cogsConfidenceWeight) : (!orderItems.length && revenue > 0 ? 0.2 : 1);
  const portfolioProfitability = calculateSkuProfitability({
    revenue,
    cogs,
    shippingCost: shippingTotal,
    fulfillmentCost: nonShippingFulfillmentCost,
    platformFee: platformFeeTotal,
    paymentFee: paymentFeeTotal,
    refundCost,
    adSpend,
    cogsStatus: realCostRows > 0 ? (estimatedCogs > 0 ? "ESTIMATED" : "AVAILABLE") : (revenue > 0 ? "MISSING" : "AVAILABLE"),
    cogsConfidence,
    adAllocationMethod: adSpend > 0 ? "REVENUE_SHARE" : "UNKNOWN",
    attributionConfidence: ads.length ? 0.5 : 0.25,
    criticalFieldsMissing: Array.from(missingCostFields)
  });
  const costConfidence = roundRatio(Math.max(0, realCostAvailability * cogsConfidence));
  const profitConfidence = roundRatio(Math.max(0, costConfidence - (!ads.length ? 0.08 : 0)));

  const skuUnitEconomics = allocateSkuEconomics({
    rows: Array.from(skuRows.values()),
    orderItems,
    ads,
    revenue,
    adSpend,
    shippingCost: shippingTotal,
    platformFee: platformFeeTotal,
    paymentFee: paymentFeeTotal,
    fulfillmentCost,
    refundCost,
    estimatedComponents,
    inventory
  });
  const skuTotals = summarizeSkuUnitEconomics(skuUnitEconomics);
  const portfolioSource = skuUnitEconomics.length ? "sku_unit_economics" : "portfolio_totals";
  const reconciledProfitability = portfolioSource === "sku_unit_economics"
    ? calculateSkuProfitability({
        revenue: skuTotals.revenue,
        cogs: skuTotals.cogs,
        shippingCost: skuTotals.shipping_cost,
        fulfillmentCost: skuTotals.fulfillment_cost,
        platformFee: skuTotals.platform_fee,
        paymentFee: skuTotals.payment_fee,
        refundCost: skuTotals.refund_cost,
        adSpend: skuTotals.ad_spend,
        cogsStatus: realCostRows > 0 ? (estimatedCogs > 0 ? "ESTIMATED" : "AVAILABLE") : (skuTotals.revenue > 0 ? "MISSING" : "AVAILABLE"),
        cogsConfidence,
        adAllocationMethod: skuTotals.ad_spend > 0 ? "REVENUE_SHARE" : "UNKNOWN",
        attributionConfidence: ads.length ? 0.5 : 0.25,
        criticalFieldsMissing: Array.from(missingCostFields)
      })
    : portfolioProfitability;
  const reconciledTotalCost = portfolioSource === "sku_unit_economics" ? skuTotals.total_cost : totalCost;
  const reconciledEstimatedCost = portfolioSource === "sku_unit_economics"
    ? roundCurrency(Math.min(estimatedCost, reconciledTotalCost))
    : estimatedCost;
  const reconciledEstimatedCostRatio = safeRatio(reconciledEstimatedCost, Math.max(reconciledTotalCost, 1));
  const reconciledRealCostAvailability = roundRatio(1 - reconciledEstimatedCostRatio);
  const reconciliation = buildPortfolioReconciliation({
    orderRevenue: revenue,
    skuTotals,
    portfolioTotals: {
      revenue,
      cogs,
      ad_spend: adSpend,
      shipping_cost: shippingTotal,
      platform_fee: platformFeeTotal,
      payment_fee: paymentFeeTotal,
      fulfillment_cost: fulfillmentCost,
      refund_cost: refundCost,
      total_cost: totalCost,
      operating_cost: portfolioProfitability.operating_cost,
      net_profit: portfolioProfitability.net_profit
    },
    source: portfolioSource
  });

  return {
    totals: {
      revenue: portfolioSource === "sku_unit_economics" ? skuTotals.revenue : revenue,
      cogs: portfolioSource === "sku_unit_economics" ? skuTotals.cogs : roundCurrency(cogs),
      ad_spend: portfolioSource === "sku_unit_economics" ? skuTotals.ad_spend : adSpend,
      fulfillment_cost: portfolioSource === "sku_unit_economics" ? skuTotals.fulfillment_cost : fulfillmentCost,
      shipping_cost: portfolioSource === "sku_unit_economics" ? skuTotals.shipping_cost : shippingTotal,
      platform_fee: portfolioSource === "sku_unit_economics" ? skuTotals.platform_fee : platformFeeTotal,
      payment_fee: portfolioSource === "sku_unit_economics" ? skuTotals.payment_fee : paymentFeeTotal,
      refund_cost: portfolioSource === "sku_unit_economics" ? skuTotals.refund_cost : refundCost,
      refund_amount: refundAmount,
      reverse_logistics_cost: reverseLogisticsCost,
      total_cost: reconciledTotalCost,
      estimated_cost: reconciledEstimatedCost,
      gross_profit: reconciledProfitability.gross_profit,
      operating_cost: reconciledProfitability.operating_cost,
      contribution_profit: reconciledProfitability.contribution_profit,
      net_profit: reconciledProfitability.net_profit,
      margin: reconciledProfitability.margin,
      profitability_confidence: reconciledProfitability.profitability_confidence,
      validation_status: reconciledProfitability.validation.validation_status,
      optimization_allowed: reconciledProfitability.validation.optimization_allowed,
      warnings: Array.from(new Set([...reconciledProfitability.validation.warnings, ...reconciliation.warnings])),
      engine_version: reconciledProfitability.engine_version
    },
    sku_unit_economics: skuUnitEconomics,
    data_quality: {
      cost_confidence: costConfidence,
      profit_confidence: profitConfidence,
      estimated_cost_ratio: reconciledEstimatedCostRatio,
      missing_cost_fields: Array.from(missingCostFields).sort(),
      estimated_components: Array.from(estimatedComponents).sort(),
      real_cost_availability: reconciledRealCostAvailability,
      cogs_confidence: cogsConfidence,
      cogs_type_breakdown: cogsTypeBreakdown,
      cogs_semantic_warnings: Array.from(cogsSemanticWarnings).sort(),
      portfolio_reconciliation: reconciliation
    }
  };
}

function resolveItemCogs(input: {
  item: CostInputRow;
  productCostByProductId: Map<string, number>;
  productCostBySku: Map<string, number>;
  quantity: number;
  itemRevenue: number;
}) {
  const { item, productCostByProductId, productCostBySku, quantity, itemRevenue } = input;
  const price = firstFiniteNumber(item.price, item.unit_price, quantity ? itemRevenue / quantity : null);
  const candidates: Array<{ value: unknown; fieldName: string }> = [
    { value: item.cost_price, fieldName: "cost_price" },
    { value: item.product_cost, fieldName: "product_cost" },
    { value: item.manufacturing_cost, fieldName: "manufacturing_cost" },
    { value: item.procurement_cost, fieldName: "procurement_cost" },
    { value: item.unit_cost, fieldName: "unit_cost" },
    { value: item.total_cogs, fieldName: "total_cogs" },
    { value: item.line_cogs, fieldName: "line_cogs" },
    { value: item.line_cost, fieldName: "line_cost" },
    { value: item.row_cogs, fieldName: "row_cogs" },
    { value: item.row_cost, fieldName: "row_cost" },
    { value: item.cogs, fieldName: "cogs" },
    { value: productCostByProductId.get(stringValue(item.product_id)), fieldName: "unit_cost" },
    { value: productCostBySku.get(stringValue(item.sku)), fieldName: "unit_cost" }
  ];

  for (const candidate of candidates) {
    const resolution = resolveCogsSemantic({
      cogs: candidate.value,
      quantity,
      revenue: itemRevenue,
      price,
      fieldName: candidate.fieldName
    });
    if (resolution) return { resolution, fieldName: candidate.fieldName };
  }

  return null;
}

function summarizeSkuUnitEconomics(rows: CostSkuUnit[]) {
  const totals = {
    revenue: roundCurrency(sum(rows.map((row) => row.revenue))),
    cogs: roundCurrency(sum(rows.map((row) => row.cogs))),
    ad_spend: roundCurrency(sum(rows.map((row) => row.ad_cost_allocated ?? 0))),
    shipping_cost: roundCurrency(sum(rows.map((row) => row.shipping_cost))),
    platform_fee: roundCurrency(sum(rows.map((row) => row.platform_fee))),
    payment_fee: roundCurrency(sum(rows.map((row) => row.payment_fee))),
    fulfillment_cost: roundCurrency(sum(rows.map((row) => row.fulfillment_cost))),
    refund_cost: roundCurrency(sum(rows.map((row) => row.refund_cost))),
    total_cost: roundCurrency(sum(rows.map((row) => row.total_cost))),
    net_profit: roundCurrency(sum(rows.map((row) => row.net_profit)))
  };

  return totals;
}

function buildPortfolioReconciliation(input: {
  orderRevenue: number;
  skuTotals: ReturnType<typeof summarizeSkuUnitEconomics>;
  portfolioTotals: {
    revenue: number;
    cogs: number;
    ad_spend: number;
    shipping_cost: number;
    platform_fee: number;
    payment_fee: number;
    fulfillment_cost: number;
    refund_cost: number;
    total_cost: number;
    operating_cost: number;
    net_profit: number;
  };
  source: "sku_unit_economics" | "portfolio_totals";
}) {
  const portfolioOperatingCost = roundCurrency(
    input.portfolioTotals.ad_spend +
      input.portfolioTotals.shipping_cost +
      input.portfolioTotals.platform_fee +
      input.portfolioTotals.payment_fee +
      input.portfolioTotals.fulfillment_cost +
      input.portfolioTotals.refund_cost
  );
  const skuOperatingCost = roundCurrency(
    input.skuTotals.ad_spend +
      input.skuTotals.shipping_cost +
      input.skuTotals.platform_fee +
      input.skuTotals.payment_fee +
      input.skuTotals.fulfillment_cost +
      input.skuTotals.refund_cost
  );
  const revenueDifference = roundCurrency(input.orderRevenue - input.skuTotals.revenue);
  const cogsDifference = roundCurrency(input.portfolioTotals.cogs - input.skuTotals.cogs);
  const adsDifference = roundCurrency(input.portfolioTotals.ad_spend - input.skuTotals.ad_spend);
  const operatingCostDifference = roundCurrency(portfolioOperatingCost - skuOperatingCost);
  const netProfitDifference = roundCurrency(input.portfolioTotals.net_profit - input.skuTotals.net_profit);
  const unallocatedCosts = roundCurrency(Math.max(0, input.portfolioTotals.total_cost - input.skuTotals.total_cost));
  const duplicatedCosts = roundCurrency(Math.max(0, input.skuTotals.total_cost - input.portfolioTotals.total_cost));
  const warnings: string[] = [];

  if (Math.abs(revenueDifference) > 0.01) {
    warnings.push(`order revenue and SKU revenue differ by ${revenueDifference}`);
  }
  if (Math.abs(cogsDifference) > 0.01 || Math.abs(adsDifference) > 0.01 || Math.abs(operatingCostDifference) > 0.01) {
    warnings.push("portfolio profitability reconciled from SKU unit economics");
  }
  if (unallocatedCosts > 0.01) {
    warnings.push(`unallocated portfolio costs ${unallocatedCosts}`);
  }
  if (duplicatedCosts > 0.01) {
    warnings.push(`duplicated SKU costs ${duplicatedCosts}`);
  }

  return {
    source: input.source,
    order_revenue: roundCurrency(input.orderRevenue),
    sku_revenue: input.skuTotals.revenue,
    revenue_difference: revenueDifference,
    cogs_difference: cogsDifference,
    ads_difference: adsDifference,
    operating_cost_difference: operatingCostDifference,
    net_profit_difference: netProfitDifference,
    unallocated_costs: unallocatedCosts,
    duplicated_costs: duplicatedCosts,
    warnings
  };
}

function aggregateOrderCost(input: {
  rows: CostInputRow[];
  fields: string[];
  fallback: number;
  missingField: string;
  missingCostFields: Set<string>;
  estimatedComponents: Set<string>;
  componentName: string;
  estimateWhenMissing?: boolean;
}) {
  const estimateWhenMissing = input.estimateWhenMissing ?? true;
  const values = input.rows.map((row) => firstFiniteNumber(...input.fields.map((field) => row[field])));
  const explicitRows = values.filter((value): value is number => value !== null);
  const explicit = roundCurrency(sum(explicitRows));
  const shouldEstimate = estimateWhenMissing && input.rows.length > 0 && explicitRows.length < input.rows.length;
  const estimated = shouldEstimate ? estimateMissingOrderCost(input.rows, values, input.fallback) : 0;

  if (input.rows.length && explicitRows.length < input.rows.length) {
    input.missingCostFields.add(input.missingField);
    if (shouldEstimate) input.estimatedComponents.add(input.componentName);
  }

  return {
    explicit,
    estimated,
    total: roundCurrency(explicit + estimated)
  };
}

function allocateSkuEconomics(input: {
  rows: CostSkuUnit[];
  orderItems: CostInputRow[];
  ads: CostInputRow[];
  revenue: number;
  adSpend: number;
  shippingCost: number;
  platformFee: number;
  paymentFee: number;
  fulfillmentCost: number;
  refundCost: number;
  estimatedComponents: Set<string>;
  inventory: CostInputRow[];
}) {
  const { rows, shippingCost, platformFee, paymentFee, fulfillmentCost, refundCost, estimatedComponents } = input;
  if (!rows.length) return [];
  const allocationRevenue = roundCurrency(sum(rows.map((row) => row.revenue)));
  const directShippingCost = roundCurrency(sum(rows.map((row) => row.shipping_cost)));
  const directPlatformFee = roundCurrency(sum(rows.map((row) => row.platform_fee)));
  const directPaymentFee = roundCurrency(sum(rows.map((row) => row.payment_fee)));
  const directFulfillmentCost = roundCurrency(sum(rows.map((row) => row.fulfillment_cost)));
  const directRefundCost = roundCurrency(sum(rows.map((row) => row.refund_cost)));
  const allocatableShippingCost = roundCurrency(Math.max(0, shippingCost - directShippingCost));
  const allocatablePlatformFee = roundCurrency(Math.max(0, platformFee - directPlatformFee));
  const allocatablePaymentFee = roundCurrency(Math.max(0, paymentFee - directPaymentFee));
  const allocatableFulfillmentCost = roundCurrency(Math.max(0, fulfillmentCost - directFulfillmentCost));
  const allocatableRefundCost = roundCurrency(Math.max(0, refundCost - directRefundCost));

  const allocatedNonAdCosts = rows
    .map((row) => {
      const share = allocationRevenue > 0 ? row.revenue / allocationRevenue : 1 / rows.length;
      const allocatedShippingCost = roundCurrency(row.shipping_cost + allocatableShippingCost * share);
      const allocatedPlatformFee = roundCurrency(row.platform_fee + allocatablePlatformFee * share);
      const allocatedPaymentFee = roundCurrency(row.payment_fee + allocatablePaymentFee * share);
      const allocatedFulfillmentCost = roundCurrency(row.fulfillment_cost + allocatableFulfillmentCost * share);
      const allocatedRefundCost = roundCurrency(row.refund_cost + allocatableRefundCost * share);
      const skuEstimatedComponents = skuEstimatedComponentsForRow(row, estimatedComponents);

      return {
        ...row,
        ad_cost_allocated: 0,
        shipping_cost: allocatedShippingCost,
        platform_fee: allocatedPlatformFee,
        payment_fee: allocatedPaymentFee,
        fulfillment_cost: allocatedFulfillmentCost,
        refund_cost: allocatedRefundCost,
        refund_amount: allocatedRefundCost,
        total_cost: roundCurrency(row.cogs + allocatedShippingCost + allocatedFulfillmentCost + allocatedPlatformFee + allocatedPaymentFee + allocatedRefundCost),
        net_profit: 0,
        margin: 0,
        sku_roas: 0,
        roas_value: null,
        roas_display: "No Ads",
        roas_status: "not_advertised",
        attribution_method: "none",
        attribution_confidence: 1,
        contribution: 0,
        risk_score: 0,
        profit_confidence: 0,
        cost_breakdown: {
          cogs: row.cogs,
          shipping: allocatedShippingCost,
          ads: 0,
          platform_fee: allocatedPlatformFee,
          payment_fee: allocatedPaymentFee,
          fulfillment: allocatedFulfillmentCost,
          refund: allocatedRefundCost
        },
        channel_breakdown: {},
        ad_allocation_method: "none" as const,
        ad_allocation_confidence: 1,
        estimated_components: skuEstimatedComponents,
        estimated: row.estimated || skuEstimatedComponents.length > 0
      };
    });

  return calculateSkuProfitAndAllocation({
    rows: allocatedNonAdCosts,
    orderItems: input.orderItems,
    ads: input.ads,
    inventory: input.inventory
  });
}

function skuEstimatedComponentsForRow(row: CostSkuUnit, globalEstimatedComponents: Set<string>) {
  const components = new Set<string>();
  if (row.estimated) components.add("cogs");
  if (row.cogs_semantic_warnings.length || globalEstimatedComponents.has("cogs_semantic")) components.add("cogs_semantic");
  if (globalEstimatedComponents.has("shipping_cost")) components.add("shipping");
  if (globalEstimatedComponents.has("platform_fee")) components.add("platform_fee");
  if (globalEstimatedComponents.has("payment_fee")) components.add("payment_fee");
  if (globalEstimatedComponents.has("refund_cost")) components.add("refund");
  return Array.from(components).sort();
}

function itemCostValue(row: CostInputRow, fields: string[]) {
  return firstFiniteNumber(...fields.map((field) => row[field])) ?? 0;
}

function estimateMissingOrderCost(rows: CostInputRow[], values: Array<number | null>, fallback: number) {
  const missingRows = rows.filter((_, index) => values[index] === null);
  if (!missingRows.length) return 0;
  const totalRevenue = sum(rows.map(orderCostRevenue));
  const missingRevenue = sum(missingRows.map(orderCostRevenue));
  if (totalRevenue > 0) {
    return roundCurrency(fallback * (missingRevenue / totalRevenue));
  }
  return roundCurrency(fallback * (missingRows.length / rows.length));
}

function orderCostRevenue(row: CostInputRow) {
  return firstFiniteNumber(row.revenue, row.net_sales, row.total_paid, row.gross_sales) ?? 0;
}

function emptySkuCostRow(sku: string): CostSkuUnit {
  return {
    sku,
    revenue: 0,
    quantity: 0,
    cogs: 0,
    ad_cost_allocated: 0,
    fulfillment_cost: 0,
    shipping_cost: 0,
    platform_fee: 0,
    payment_fee: 0,
    refund_cost: 0,
    refund_amount: 0,
    reverse_logistics_cost: 0,
    total_cost: 0,
    net_profit: 0,
    margin: 0,
    sku_roas: 0,
    roas_value: null,
    roas_display: "No Ads",
    roas_status: "not_advertised",
    attribution_method: "none",
    attribution_confidence: 1,
    contribution: 0,
    risk_score: 0,
    profit_confidence: 0,
    channel_breakdown: {},
    ad_allocation_method: "none",
    ad_allocation_confidence: 1,
    cost_breakdown: {
      cogs: 0,
      shipping: 0,
      ads: 0,
      platform_fee: 0,
      payment_fee: 0,
      fulfillment: 0,
      refund: 0
    },
    cogs_type: "unknown",
    cogs_status: "MISSING",
    cogs_confidence: 0,
    cogs_semantic_warnings: [],
    estimated_components: [],
    estimated: false
  };
}

function productMetadata(row: CostInputRow): SkuProductMetadata {
  return {
    product_name: firstString(row.product_name, row.title, row.name, row.product_title, row.item_name),
    category: firstString(row.category, row.product_category, row.product_type, row.collection, row.department),
    variant_name: firstString(row.variant_name, row.variant_title, row.option_title, row.style, row.model),
    size: firstString(row.size, row.option_size, row.size_name, row.option1),
    color: firstString(row.color, row.colour, row.option_color, row.color_name, row.option2)
  };
}

function mergeSkuProductMetadata(target: CostSkuUnit, metadata: SkuProductMetadata) {
  target.product_name ||= metadata.product_name;
  target.category ||= metadata.category;
  target.variant_name ||= metadata.variant_name;
  target.size ||= metadata.size;
  target.color ||= metadata.color;
}

function mergeCogsType(current: CogsSemanticType | "mixed", next: CogsSemanticType): CogsSemanticType | "mixed" {
  if (current === "unknown") return next;
  if (current === next) return current;
  return "mixed";
}

function weightedAverageConfidence(input: {
  existingConfidence: number;
  existingWeight: number;
  nextConfidence: number;
  nextWeight: number;
}) {
  const totalWeight = input.existingWeight + input.nextWeight;
  if (totalWeight <= 0) return roundRatio(input.nextConfidence);
  return roundRatio(((input.existingConfidence * input.existingWeight) + (input.nextConfidence * input.nextWeight)) / totalWeight);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const string = stringValue(value);
    if (string) return string;
  }
  return undefined;
}

function safeRatio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return roundRatio(numerator / denominator);
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
