import type { CanonicalDataset } from "@/lib/semantic/types";
import { calculateCostIntelligence, type CostSkuUnit } from "@/lib/cost/cost-intelligence-engine";
import { enrichOrderItemsWithCanonicalSku, normalizeProductSkuRows } from "@/lib/sku/sku-intelligence-engine";
import type { SkuAttributionMethod, SkuRoasStatus } from "@/lib/sku/sku-profit-allocation-engine";
import type { CogsStatus, ProfitValidationStatus } from "@/lib/profit/canonical-profitability-engine";
import type { DemandTrend, InventoryDecision } from "@/lib/inventory/inventory-decision-engine";

const SUPPORTED_SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

export type SkuRevenueMetric = {
  sku: string;
  product_name?: string;
  category?: string;
  variant_name?: string;
  size?: string;
  color?: string;
  revenue: number;
  quantity: number;
  estimated: boolean;
};

export type ProductPerformanceMetric = {
  product_id: string;
  product_name?: string;
  revenue: number;
  quantity: number;
  estimated: boolean;
};

export type TimeSeriesMetric = {
  period: string;
  revenue: number;
  orders: number;
  sku_count: number;
};

export type AttributionMetric = {
  order_attribution_coverage: number;
  sku_attribution_coverage: number;
  attribution_model: "last_click" | "multi_touch" | "fallback" | "none";
  roas_by_sku: boolean;
  campaign_performance: Array<{
    campaign_id: string;
    ad_spend: number;
    revenue: number;
    roas: number | null;
    estimated: boolean;
    attribution_status?: "attributed" | "missing";
    attribution_source?: "campaign_attribution";
    attribution_confidence?: number;
  }>;
  sku_attribution: Array<{
    sku: string;
    campaign_id: string;
    revenue: number;
    ad_spend_allocated: number;
    roas: number;
    estimated: boolean;
  }>;
  campaignRevenueCoverage?: number;
  skuRevenueCoverage?: number;
  fallbackUsed?: boolean;
};

export type SkuUnitEconomicsMetric = {
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
  shipping_cost: number;
  platform_fee: number;
  payment_fee: number;
  fulfillment_cost: number;
  refund_amount: number;
  total_cost: number;
  gross_profit?: number;
  operating_cost?: number;
  contribution_profit?: number;
  net_profit: number;
  margin: number;
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
  attributed_campaigns?: CostSkuUnit["attributed_campaigns"];
  ads_validation_status?: "PASSED" | "FAILED" | "UNKNOWN";
  ads_validation_warnings?: string[];
  ads_lineage?: CostSkuUnit["ads_lineage"];
  cogs_status?: CogsStatus;
  cogs_confidence?: number;
  campaign_ids?: string[];
  attribution_window_start?: string | null;
  attribution_window_end?: string | null;
  stock_level?: number | null;
  available_stock?: number | null;
  sales_velocity?: number;
  normalized_daily_sales_velocity?: number;
  velocity_window_days?: number;
  calculation_window_days?: number;
  velocity_calculation_basis?: "30-day normalized estimate" | "observed order window";
  velocity_confidence?: "HIGH" | "MEDIUM" | "LOW";
  data_period_days?: number;
  inventory_risk_status?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK" | "EXCESS_INVENTORY" | "OVERSTOCK_RISK" | "LIQUIDATION_RISK" | "HEALTHY" | "OBSERVATION";
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
  estimated_components: string[];
  estimated: boolean;
};

export type CanonicalEcommerceMetricOutput = {
  metrics: {
    core: {
      revenue: number;
      orders: number;
      orders_created?: number;
      paid_orders?: number;
      net_revenue_orders?: number;
      cancelled_orders?: number;
      fully_refunded_orders?: number;
      aov: number;
      aov_confidence: "HIGH" | "MEDIUM" | "LOW";
      refund_rate: number;
      sku_revenue: SkuRevenueMetric[];
      product_performance: ProductPerformanceMetric[];
    };
    business: {
      revenue: number;
      gross_profit: number;
      net_profit: number;
      margin: number;
      roas: number;
      cogs: number;
      ad_spend: number;
      shipping_cost: number;
      platform_fee: number;
      payment_fee: number;
      fulfillment_cost: number;
      refund_amount: number;
      total_cost: number;
      operating_cost: number;
      contribution_profit: number;
      real_cost: number;
      estimated_cost: number;
      estimated_cost_ratio: number;
      cost_confidence: number;
      profit_confidence: number;
      profitability_confidence: number;
      validation_status: ProfitValidationStatus;
      optimization_allowed: boolean;
      warnings: string[];
      engine_version: string;
      cogs_coverage_rate: number;
      missing_cost_fields: string[];
      estimated_components: string[];
      portfolio_reconciliation?: {
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
      sku_unit_economics: SkuUnitEconomicsMetric[];
      sku_velocity: Array<{ sku: string; quantity: number; revenue: number }>;
    };
    growth: {
      revenue_growth_rate: number;
      order_growth_rate: number;
      sku_growth_rate: number;
      growth_window_days: number;
      daily: TimeSeriesMetric[];
      weekly: TimeSeriesMetric[];
      monthly: TimeSeriesMetric[];
    };
    customer: {
      ltv: number;
      customer_revenue_ltv: number;
      customer_profit_ltv: number;
      customer_contribution_ltv: number;
      avg_order_value_per_customer: number;
      repeat_purchase_rate: number;
      customer_count: number;
      new_vs_returning_ratio: number;
      acquisition_cost: number | null;
      median_ltv: number;
      p90_ltv: number;
      p95_ltv: number;
      p99_ltv: number;
      top_10_percent_revenue_share: number;
      top_1_percent_revenue_share: number;
      active_customers: number;
      inactive_customers: number;
      avg_orders_per_customer: number;
      purchase_frequency: number;
      new_customers: number;
      dormant_customers: number;
      churned_customers: number;
      avg_customer_lifetime_days: number;
      cohort_by_first_purchase_month: Array<{
        cohort_month: string;
        customers: number;
        revenue: number;
        avg_ltv: number;
        retention_7d: number;
        retention_30d: number;
      }>;
      cohort_retention_7d: number | null;
      cohort_retention_30d: number | null;
      cohort_ltv_curve: Array<{ cohort_month: string; day_0: number; day_7: number; day_30: number; total_ltv: number }>;
      revenue_per_customer_segment: Array<{ segment: string; customers: number; revenue: number; share: number }>;
      profit_per_customer_segment: Array<{ segment: string; customers: number; profit: number; share: number }>;
      ads_cost_per_customer_segment: Array<{ segment: string; customers: number; ad_cost: number; share: number }>;
      ltv_cac_ratio: number | null;
      cac_by_cohort: Array<{ cohort_month: string; cac: number }>;
      payback_period_days: number | null;
      customer_lifecycles: Array<{
        customer_id: string;
        first_order_date: string;
        last_order_date: string;
        lifetime_days: number;
      }>;
      median_customer_lifetime_days: number;
      ltv_confidence: "HIGH" | "MEDIUM" | "LOW";
      cac_confidence: "HIGH" | "MEDIUM" | "LOW";
      cohort_confidence: "HIGH" | "MEDIUM" | "LOW";
      customer_metric_confidence: "HIGH" | "MEDIUM" | "LOW";
      cac: number | null;
      cac_status: "OK" | "INSUFFICIENT_CUSTOMER_HISTORY";
      warnings: string[];
    };
    ads: {
      roas: number;
      cac: number | null;
      cac_confidence: "HIGH" | "MEDIUM" | "LOW";
      cac_status: "OK" | "INSUFFICIENT_CUSTOMER_HISTORY";
      warnings: string[];
      cpa: number;
      mer: number;
      ad_spend: number;
    };
    attribution: AttributionMetric;
    revenue: number;
    orders: number;
    aov: number;
    refund_rate: number;
    sku_revenue: SkuRevenueMetric[];
    product_performance: ProductPerformanceMetric[];
  };
  metadata: {
    schema_version: typeof SUPPORTED_SCHEMA_VERSION;
    computed_at: string;
    data_coverage: number;
    confidence_score: number;
    profit_confidence: number;
    data_quality_components: {
      cost_completeness: number;
      customer_availability: number;
      attribution_completeness: number;
      time_series_quality: number;
    };
    estimated_metrics: string[];
    missing_fields: string[];
    row_counts: Record<string, number>;
    source_platforms: string[];
    audit: {
      input: "canonical_schema_only";
      deterministic: true;
      canonical_input_only: true;
    };
    validation: {
      status: "VALID" | "INVALID";
      revenue_reconciliation: {
        revenue_from_orders: number;
        revenue_from_order_items: number;
        revenue_from_sku_rollup: number;
        displayed_revenue: number;
        difference: number;
      };
      order_reconciliation: {
        unique_order_ids: number;
        displayed_orders: number;
        difference: number;
      };
      warnings: string[];
    };
  };
};

type QualityAccumulator = {
  expected: number;
  present: number;
  missingFields: Set<string>;
  estimatedMetrics: Set<string>;
};

export function computeCanonicalEcommerceMetrics(dataset: CanonicalDataset): CanonicalEcommerceMetricOutput {
  assertSupportedSchema(dataset);

  const quality: QualityAccumulator = {
    expected: 0,
    present: 0,
    missingFields: new Set(),
    estimatedMetrics: new Set()
  };

  const sourceRefunds = dedupeBy(dataset.tables.ecommerce_refunds ?? [], (row) => stringValue(row.refund_id) || stringValue(row.canonical_key));
  const allSourceOrders = dataset.tables.ecommerce_orders ?? [];
  const sourceOrders = attachRefundAmountsToOrders(
    dedupeBy(allSourceOrders, sourceOrderIdentity),
    sourceRefunds
  );
  const orders = filterValidOrders(sourceOrders);
  const orderStatusSummary = summarizeOrderStatuses(sourceOrders, orders);
  const observedOrderWindow = observedDateWindow(sourceOrders.filter(isNonTestNonCancelledOrder));
  const normalizedProducts = normalizeProductSkuRows(dataset.tables.ecommerce_products ?? []);
  const products = dedupeBy(normalizedProducts, (row) => stringValue(row.variant_id) || stringValue(row.product_id) || stringValue(row.canonical_key));
  const enrichedOrderItems = attachNativeOrderIdsToOrderItems(
    enrichOrderItemsWithCanonicalSku(dataset.tables.ecommerce_order_items ?? [], products),
    allSourceOrders
  );
  const validOrderIds = new Set(orders.flatMap(orderMatchValues).filter(Boolean));
  const hasOrderFacts = sourceOrders.length > 0;
  const refunds = validOrderIds.size
    ? sourceRefunds.filter((row) => {
      const orderIds = orderMatchValues(row);
      return !orderIds.length || orderIds.some((orderId) => validOrderIds.has(orderId));
    })
    : hasOrderFacts
      ? []
    : sourceRefunds;
  const orderItemsWithRefunds = attachRefundAmountsToOrderItems(enrichedOrderItems, refunds);
  const matchedOrderItems = validOrderIds.size
    ? orderItemsWithRefunds.filter((row) => orderMatchValues(row).some((orderId) => validOrderIds.has(orderId)))
    : [];
  const scopedOrderItems = validOrderIds.size
    ? (matchedOrderItems.length ? matchedOrderItems : orderItemsWithRefunds)
    : (hasOrderFacts ? [] : orderItemsWithRefunds);
  if (validOrderIds.size && !matchedOrderItems.length && orderItemsWithRefunds.length) {
    quality.estimatedMetrics.add("order_item_order_linkage");
  }
  const orderItems = dedupeBy(scopedOrderItems.map(withNetQuantity), orderItemDedupeKey);
  const sourceAds = dedupeBy(dataset.tables.ecommerce_ads ?? [], (row) => stringValue(row.canonical_key) || adRowIdentity(row));
  const ads = filterAdsToOrderWindow(sourceAds, observedOrderWindow);
  const customers = dedupeBy(dataset.tables.ecommerce_customers ?? [], (row) => stringValue(row.customer_id) || stringValue(row.canonical_key));
  const inventory = dedupeBy(
    (dataset.tables.ecommerce_inventory ?? dataset.tables.inventory ?? []).filter(hasUsableInventorySignal),
    (row) => [row.sku, row.warehouse_id, row.snapshot_date ?? row.date].map(stringValue).join(":") || stringValue(row.canonical_key)
  );

  trackCompleteness(quality, "ecommerce_orders", orders, ["order_id", "revenue"]);
  trackCompleteness(quality, "ecommerce_order_items", orderItems, ["sku", "price", "quantity"]);
  trackCompleteness(quality, "ecommerce_products", products, ["product_id", "product_name"]);
  trackCompleteness(quality, "ecommerce_refunds", refunds, ["amount"]);
  if (ads.length) trackCompleteness(quality, "ecommerce_ads", ads, ["spend"]);
  if (inventory.length) trackCompleteness(quality, "ecommerce_inventory", inventory, ["sku", "stock_level"]);

  const paidOrderCount = new Set(orders.map(sourceOrderIdentity).filter(Boolean)).size;
  const displayOrderCount = paidOrderCount;
  const actualRefundAmount = roundCurrency(sum(refunds.map((row) => firstNumber(row.amount, row.refund_amount))));
  const orderNetRevenueById = buildOrderNetRevenueById(orders);
  const shouldUseOrderNetRevenue = orderNetRevenueById.size > 0;
  const revenueOrderItems = shouldUseOrderNetRevenue
    ? allocateOrderNetRevenueToItems(orderItems, orderNetRevenueById)
    : orderItems;
  const skuRevenue = buildSkuRevenue(revenueOrderItems, quality);
  const revenueFromOrders = roundCurrency(sum(orders.map(orderRevenue)));
  const revenueFromOrderItems = roundCurrency(sum(revenueOrderItems.map((row) => lineItemRevenue(row))));
  const revenueFromSkuRollup = roundCurrency(sum(skuRevenue.map((row) => row.revenue)));
  const revenue = shouldUseOrderNetRevenue && revenueFromOrders > 0
    ? revenueFromOrders
    : revenueFromOrderItems > 0
      ? revenueFromOrderItems
      : revenueFromOrders;
  const effectiveRefundAmount = refunds.length ? actualRefundAmount : 0;
  const productPerformance = buildProductPerformance(revenueOrderItems, products, quality);
  const metricValidation = metricValidationSummary({
    revenueFromOrders,
    revenueFromOrderItems,
    revenueFromSkuRollup,
    displayedRevenue: revenue,
    uniqueOrderIds: paidOrderCount,
    displayedOrders: displayOrderCount
  });
  const business = buildBusinessMetrics({ revenue, refundAmount: effectiveRefundAmount, refunds, orderItems: revenueOrderItems, products, orders, ads, inventory, quality });
  const growth = buildGrowthMetrics({ orders, orderItems: revenueOrderItems, quality });
  const attribution = buildAttributionMetrics({ orders, orderItems: revenueOrderItems, ads, skuUnitEconomics: business.sku_unit_economics, revenue, quality });
  const customerReliability = customerAcquisitionReliability(orders, customers);
  const customer = buildCustomerMetrics({ orders, customers, orderCount: paidOrderCount, adSpend: business.ad_spend, netProfit: business.net_profit, quality, acquisitionReliable: customerReliability.reliable });
  const adsMetrics = buildAdsMetrics({
    revenue: business.revenue,
    orderCount: paidOrderCount,
    adSpend: business.ad_spend,
    customerCount: customer.customer_count,
    newCustomers: acquiredCustomerCount(orders, customers),
    newCustomerReliable: customerReliability.reliable,
    attributionCoverage: attribution.order_attribution_coverage,
    quality
  });

  if (!refunds.length) {
    quality.missingFields.add("ecommerce_refunds.*");
    quality.estimatedMetrics.add("refund_rate");
    quality.estimatedMetrics.add("business.refund_amount");
    quality.estimatedMetrics.add("business.net_profit");
    quality.estimatedMetrics.add("business.margin");
  }
  if (!orderItems.length) {
    quality.estimatedMetrics.add("sku_revenue");
    quality.estimatedMetrics.add("product_performance");
  }

  return {
    metrics: {
      core: {
        revenue,
        orders: displayOrderCount,
        orders_created: orderStatusSummary.orders_created,
        paid_orders: orderStatusSummary.paid_orders,
        net_revenue_orders: orderStatusSummary.net_revenue_orders,
        cancelled_orders: orderStatusSummary.cancelled_orders,
        fully_refunded_orders: orderStatusSummary.fully_refunded_orders,
        aov: paidOrderCount ? roundCurrency(revenue / paidOrderCount) : 0,
        aov_confidence: aovConfidence({ orders, orderCount: paidOrderCount }),
        refund_rate: revenue > 0 ? roundRatio(effectiveRefundAmount / revenue) : 0,
        sku_revenue: skuRevenue,
        product_performance: productPerformance
      },
      business,
      growth,
      customer,
      ads: adsMetrics,
      attribution,
      revenue,
      orders: displayOrderCount,
      aov: paidOrderCount ? roundCurrency(revenue / paidOrderCount) : 0,
      refund_rate: revenue > 0 ? roundRatio(effectiveRefundAmount / revenue) : 0,
      sku_revenue: skuRevenue,
      product_performance: productPerformance
    },
    metadata: {
      schema_version: SUPPORTED_SCHEMA_VERSION,
      computed_at: canonicalComputedAt(dataset),
      data_coverage: coverage(quality),
      confidence_score: confidenceScore({
        quality,
        refundDataPresent: refunds.length > 0,
        costCompleteness: business.cost_confidence,
        customerAvailability: customerConfidence({ orders, customers }),
        attributionCompleteness: attribution.order_attribution_coverage,
        timeSeriesQuality: timeSeriesQuality(growth.daily)
      }),
      profit_confidence: business.profit_confidence,
      data_quality_components: {
        cost_completeness: business.cost_confidence,
        customer_availability: customerConfidence({ orders, customers }),
        attribution_completeness: attribution.order_attribution_coverage,
        time_series_quality: timeSeriesQuality(growth.daily)
      },
      estimated_metrics: Array.from(quality.estimatedMetrics).sort(),
      missing_fields: Array.from(quality.missingFields).sort(),
      row_counts: {
        ecommerce_orders: orders.length,
        ecommerce_order_items: orderItems.length,
        ecommerce_products: products.length,
        ecommerce_customers: dataset.tables.ecommerce_customers?.length ?? 0,
        ecommerce_refunds: refunds.length,
        ecommerce_ads: ads.length,
        ecommerce_inventory: inventory.length
      },
      source_platforms: dataset.metadata?.source_platforms ?? [],
      audit: {
        input: "canonical_schema_only",
        deterministic: true,
        canonical_input_only: true
      },
      validation: metricValidation
    }
  };
}

export const runCanonicalEcommerceMetricEngine = computeCanonicalEcommerceMetrics;

function buildSkuRevenue(rows: Array<Record<string, unknown>>, quality: QualityAccumulator) {
  const bySku = new Map<string, SkuRevenueMetric>();

  for (const row of rows) {
    const sku = stringValue(row.sku);
    if (!sku) continue;

    const quantity = numberValue(row.quantity, 1);
    const itemRevenue = lineItemRevenue(row, quantity);
    const estimated = !hasFiniteNumber(row.revenue) && !hasFiniteNumber(row.net_sales) && (!hasFiniteNumber(row.price) || !hasFiniteNumber(row.quantity));
    if (estimated) quality.estimatedMetrics.add("sku_revenue");

    const current = bySku.get(sku) ?? {
      sku,
      product_name: firstString(row.product_name, row.title, row.name, row.product_title, row.item_name),
      category: firstString(row.category, row.product_category, row.product_type, row.collection, row.department),
      variant_name: firstString(row.variant_name, row.variant_title, row.option_title, row.style, row.model),
      size: firstString(row.size, row.option_size, row.size_name, row.option1),
      color: firstString(row.color, row.colour, row.option_color, row.color_name, row.option2),
      revenue: 0,
      quantity: 0,
      estimated: false
    };
    current.revenue = roundCurrency(current.revenue + itemRevenue);
    current.quantity += quantity;
    current.estimated = current.estimated || estimated;
    bySku.set(sku, current);
  }

  return Array.from(bySku.values()).sort((left, right) => right.revenue - left.revenue || left.sku.localeCompare(right.sku));
}

function buildProductPerformance(
  itemRows: Array<Record<string, unknown>>,
  productRows: Array<Record<string, unknown>>,
  quality: QualityAccumulator
) {
  const productNames = new Map(productRows.map((row) => [stringValue(row.product_id), stringValue(row.product_name)]));
  const byProduct = new Map<string, ProductPerformanceMetric>();

  for (const row of itemRows) {
    const productId = stringValue(row.product_id);
    if (!productId) continue;

    const quantity = numberValue(row.quantity, 1);
    const itemRevenue = lineItemRevenue(row, quantity);
    const estimated = !hasFiniteNumber(row.revenue) && !hasFiniteNumber(row.net_sales) && (!hasFiniteNumber(row.price) || !hasFiniteNumber(row.quantity));
    if (estimated) quality.estimatedMetrics.add("product_performance");

    const current = byProduct.get(productId) ?? {
      product_id: productId,
      product_name: productNames.get(productId) || undefined,
      revenue: 0,
      quantity: 0,
      estimated: false
    };
    current.revenue = roundCurrency(current.revenue + itemRevenue);
    current.quantity += quantity;
    current.estimated = current.estimated || estimated;
    byProduct.set(productId, current);
  }

  return Array.from(byProduct.values()).sort((left, right) => right.revenue - left.revenue || left.product_id.localeCompare(right.product_id));
}

function buildBusinessMetrics(input: {
  revenue: number;
  refundAmount: number;
  refunds: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  quality: QualityAccumulator;
}) {
  const { revenue, refundAmount, refunds, orderItems, products, orders, ads, inventory, quality } = input;
  const cost = calculateCostIntelligence({
    revenue,
    refundAmount,
    refunds,
    orderItems,
    products,
    orders,
    ads,
    inventory
  });

  for (const field of cost.data_quality.missing_cost_fields) {
    quality.missingFields.add(field);
  }
  for (const component of cost.data_quality.estimated_components) {
    quality.estimatedMetrics.add("business.estimated_cost");
    quality.estimatedMetrics.add(`business.${component}`);
  }
  if (cost.data_quality.estimated_components.length) {
    quality.estimatedMetrics.add("business.gross_profit");
    quality.estimatedMetrics.add("business.net_profit");
    quality.estimatedMetrics.add("business.margin");
    quality.estimatedMetrics.add("business.sku_unit_economics");
  }
  if (!ads.length) {
    quality.estimatedMetrics.add("ads.ad_spend");
  }

  return {
    revenue: cost.totals.revenue,
    gross_profit: cost.totals.gross_profit,
    net_profit: cost.totals.net_profit,
    margin: cost.totals.margin,
    roas: safeRatio(cost.totals.revenue, cost.totals.ad_spend),
    cogs: cost.totals.cogs,
    ad_spend: cost.totals.ad_spend,
    shipping_cost: cost.totals.shipping_cost,
    platform_fee: cost.totals.platform_fee,
    payment_fee: cost.totals.payment_fee,
    fulfillment_cost: cost.totals.fulfillment_cost,
    refund_amount: cost.totals.refund_amount,
    total_cost: cost.totals.total_cost,
    operating_cost: cost.totals.operating_cost,
    contribution_profit: cost.totals.contribution_profit,
    real_cost: roundCurrency(Math.max(0, cost.totals.total_cost - cost.totals.estimated_cost)),
    estimated_cost: cost.totals.estimated_cost,
    estimated_cost_ratio: cost.data_quality.estimated_cost_ratio,
    cost_confidence: cost.data_quality.cost_confidence,
    profit_confidence: cost.data_quality.profit_confidence,
    profitability_confidence: cost.totals.profitability_confidence,
    validation_status: cost.totals.validation_status,
    optimization_allowed: cost.totals.optimization_allowed,
    warnings: cost.totals.warnings,
    engine_version: cost.totals.engine_version,
    cogs_coverage_rate: cost.totals.cogs_coverage_rate,
    missing_cost_fields: cost.data_quality.missing_cost_fields,
    estimated_components: cost.data_quality.estimated_components,
    portfolio_reconciliation: cost.data_quality.portfolio_reconciliation,
    sku_unit_economics: cost.sku_unit_economics,
    sku_velocity: buildSkuVelocity(orderItems)
  };
}

function buildGrowthMetrics(input: {
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  quality: QualityAccumulator;
}) {
  const { orders, orderItems, quality } = input;
  const skuByOrderId = new Map<string, Set<string>>();

  for (const item of orderItems) {
    const orderId = stringValue(item.order_id);
    const sku = stringValue(item.sku);
    if (!orderId || !sku) continue;

    const current = skuByOrderId.get(orderId) ?? new Set<string>();
    current.add(sku);
    skuByOrderId.set(orderId, current);
  }

  const dailyBuckets = new Map<string, { revenue: number; orderIds: Set<string>; skus: Set<string> }>();

  for (const order of orders) {
    const period = dayKey(order.order_date);
    const orderId = stringValue(order.order_id);

    if (!period) {
      quality.missingFields.add("ecommerce_orders.order_date");
      quality.estimatedMetrics.add("growth.time_series");
      continue;
    }

    const bucket = dailyBuckets.get(period) ?? { revenue: 0, orderIds: new Set<string>(), skus: new Set<string>() };
    bucket.revenue += orderRevenue(order);
    if (orderId) bucket.orderIds.add(orderId);
    for (const sku of skuByOrderId.get(orderId) ?? []) bucket.skus.add(sku);
    dailyBuckets.set(period, bucket);
  }

  const daily = bucketsToSeries(dailyBuckets);
  const weekly = rollupSeries(daily, (period) => weekKey(period));
  const monthly = rollupSeries(daily, (period) => monthKey(period));

  if (daily.length < 14) {
    quality.estimatedMetrics.add("growth.revenue_growth_rate");
    quality.estimatedMetrics.add("growth.order_growth_rate");
    quality.estimatedMetrics.add("growth.sku_growth_rate");
  }

  const growthWindowDays = observedSeriesWindowDays(daily);

  return {
    revenue_growth_rate: latestGrowthRate(daily, "revenue"),
    order_growth_rate: latestGrowthRate(daily, "orders"),
    sku_growth_rate: latestGrowthRate(daily, "sku_count"),
    growth_window_days: growthWindowDays,
    daily,
    weekly,
    monthly
  };
}

function buildCustomerMetrics(input: {
  orders: Array<Record<string, unknown>>;
  customers: Array<Record<string, unknown>>;
  orderCount: number;
  adSpend: number;
  netProfit: number;
  acquisitionReliable: boolean;
  quality: QualityAccumulator;
}) {
  const { orders, customers, orderCount, adSpend, netProfit, acquisitionReliable, quality } = input;
  const orderIdsByCustomer = new Map<string, Set<string>>();
  const revenueByCustomer = new Map<string, number>();
  const orderDatesByCustomer = new Map<string, string[]>();
  const profileOrderCountByCustomer = new Map<string, number>();
  const profileRevenueByCustomer = new Map<string, number>();

  for (const customer of customers) {
    const customerId = stringValue(customer.customer_id);
    if (!customerId) continue;
    const firstOrderDate = dayKey(firstString(customer.first_order_date, customer.first_order_at, customer.customer_first_order_date));
    const lastOrderDate = dayKey(firstString(customer.last_order_date, customer.last_order_at, customer.customer_last_order_date));
    const dates = [firstOrderDate, lastOrderDate].filter(Boolean);
    if (dates.length) {
      const current = orderDatesByCustomer.get(customerId) ?? [];
      current.push(...dates);
      orderDatesByCustomer.set(customerId, current);
    }
    const profileOrderCount = firstFiniteNumber(customer.total_orders, customer.order_count, customer.orders_count);
    if (profileOrderCount !== null) profileOrderCountByCustomer.set(customerId, Math.max(0, profileOrderCount));
    const profileRevenue = firstFiniteNumber(customer.total_spent, customer.lifetime_value, customer.ltv);
    if (profileRevenue !== null) profileRevenueByCustomer.set(customerId, roundCurrency(profileRevenue));
  }

  for (const order of orders) {
    const customerId = explicitCustomerIdFromOrder(order);
    if (!customerId) continue;

    const orderIds = orderIdsByCustomer.get(customerId) ?? new Set<string>();
    const orderId = stringValue(order.order_id);
    if (orderId) orderIds.add(orderId);
    orderIdsByCustomer.set(customerId, orderIds);
    revenueByCustomer.set(customerId, roundCurrency((revenueByCustomer.get(customerId) ?? 0) + orderRevenue(order)));
    const date = customerLifecycleOrderDate(order);
    if (date) {
      const dates = orderDatesByCustomer.get(customerId) ?? [];
      dates.push(date);
      orderDatesByCustomer.set(customerId, dates);
    }
  }

  for (const [customerId, profileRevenue] of profileRevenueByCustomer.entries()) {
    if (!revenueByCustomer.has(customerId)) revenueByCustomer.set(customerId, profileRevenue);
  }

  const customerIds = new Set<string>([
    ...customers.map((row) => stringValue(row.customer_id)).filter(Boolean),
    ...orderIdsByCustomer.keys()
  ]);
  const customerCount = customerIds.size;
  const customerOrderCoverage = safeRatio(
    orders.filter((order) => explicitCustomerIdFromOrder(order)).length,
    orders.length
  );

  if (!customerCount) {
    quality.missingFields.add("ecommerce_customers.customer_id");
    quality.missingFields.add("ecommerce_orders.customer_id");
    quality.estimatedMetrics.add("customer.customer_count");
    quality.estimatedMetrics.add("customer.ltv");
    quality.estimatedMetrics.add("customer.repeat_purchase_rate");
    quality.estimatedMetrics.add("customer.acquisition_cost");
  } else if (!customers.length) {
    quality.missingFields.add("ecommerce_customers.profile_fields");
  }
  if (customerOrderCoverage < 1 && orders.length) {
    quality.missingFields.add("ecommerce_orders.customer_id");
    quality.estimatedMetrics.add("customer.customer_count");
    quality.estimatedMetrics.add("customer.ltv");
    quality.estimatedMetrics.add("customer.repeat_purchase_rate");
    quality.estimatedMetrics.add("customer.new_vs_returning_ratio");
    quality.estimatedMetrics.add("customer.acquisition_cost");
  }

  const eventLevelCustomerRevenue = sum(Array.from(revenueByCustomer.values()));
  const customerLifetimeValue = customerCount ? eventLevelCustomerRevenue / customerCount : 0;

  const returningCustomers = Array.from(customerIds).filter((customerId) => {
    const observedOrders = orderIdsByCustomer.get(customerId)?.size ?? 0;
    const profileOrders = profileOrderCountByCustomer.get(customerId) ?? 0;
    return Math.max(observedOrders, profileOrders) > 1;
  }).length;
  const newCustomers = acquiredCustomerCount(orders, customers);
  const ltvValues = Array.from(customerIds).map((customerId) => revenueByCustomer.get(customerId) ?? firstNumber(customers.find((row) => stringValue(row.customer_id) === customerId)?.total_spent));
  const activeCustomerCount = Array.from(customerIds).filter((customerId) =>
    (orderIdsByCustomer.get(customerId)?.size ?? 0) > 0 ||
    (profileOrderCountByCustomer.get(customerId) ?? 0) > 0
  ).length;
  const inactiveCustomers = Math.max(0, customerCount - activeCustomerCount);
  const lifecycle = customerLifecycleCounts({ customerIds, orderDatesByCustomer });
  const confidence = customerMetricConfidence({ orderDatesByCustomer, orderIdsByCustomer });
  const canBuildCohorts = confidence.cohort_confidence !== "LOW";
  const cohort = canBuildCohorts
    ? buildCustomerCohorts({ customerIds, revenueByCustomer, orderDatesByCustomer, adSpend })
    : emptyCustomerCohorts();
  const segmentRows = customerValueSegments({
    customerIds,
    revenueByCustomer,
    totalRevenue: eventLevelCustomerRevenue,
    totalProfit: netProfit,
    totalAdSpend: adSpend
  });
  const profileOrderCount = sum(Array.from(profileOrderCountByCustomer.values()));
  const customerOrderCount = orderCount > 0 ? orderCount : profileOrderCount;
  const avgOrderValue = safeRatio(eventLevelCustomerRevenue, customerOrderCount || orderCount);
  const purchaseFrequency = safeRatio(customerOrderCount, activeCustomerCount || customerCount);
  const customerRevenueLtv = roundCurrency(avgOrderValue * purchaseFrequency);
  const grossMargin = safeRatio(netProfit + adSpend, eventLevelCustomerRevenue);
  const customerProfitLtv = roundCurrency(customerRevenueLtv * grossMargin);
  const reliableNewCustomerCount = acquisitionReliable && confidence.cac_confidence !== "LOW" && newCustomers > 0;
  const cac = reliableNewCustomerCount ? safeRatio(adSpend, newCustomers) : null;
  const ltvCacRatio = cac === null ? null : safeRatio(customerLifetimeValue, cac);
  const customerContributionLtv = cac === null ? 0 : roundCurrency(customerRevenueLtv - cac);
  const paybackPeriodDays = customerLifetimeValue > 0 && cac !== null
    ? roundRatio((cac / customerLifetimeValue) * Math.max(1, lifecycle.avgCustomerLifetimeDays))
    : null;
  const repeatCustomersWithZeroLifetime = lifecycle.customerLifecycles.filter((row) => {
    const observedOrders = orderIdsByCustomer.get(row.customer_id)?.size ?? 0;
    const profileOrders = profileOrderCountByCustomer.get(row.customer_id) ?? 0;
    return Math.max(observedOrders, profileOrders) > 1 && row.lifetime_days === 0;
  });
  const warnings = [
    ...(confidence.ltv_confidence === "LOW" ? ["Limited customer history"] : []),
    ...(confidence.ltv_confidence !== "HIGH" ? ["Limited historical window"] : []),
    ...(cac === null && adSpend > 0 ? ["New customer attribution requires multiple order periods"] : []),
    ...(confidence.cohort_confidence === "LOW" ? ["Insufficient cohort history"] : []),
    ...(repeatCustomersWithZeroLifetime.length ? ["Repeat customers require distinct canonical order dates to calculate lifetime days"] : [])
  ];

  return {
    ltv: roundCurrency(customerLifetimeValue),
    customer_revenue_ltv: customerRevenueLtv,
    customer_profit_ltv: customerProfitLtv,
    customer_contribution_ltv: customerContributionLtv,
    avg_order_value_per_customer: customerCount ? roundCurrency(eventLevelCustomerRevenue / customerCount) : 0,
    repeat_purchase_rate: safeRatio(returningCustomers, customerCount),
    customer_count: customerCount,
    new_vs_returning_ratio: safeRatio(newCustomers, customerCount || orderCount),
    acquisition_cost: cac,
    median_ltv: roundCurrency(percentile(ltvValues, 0.5)),
    p90_ltv: roundCurrency(percentile(ltvValues, 0.9)),
    p95_ltv: roundCurrency(percentile(ltvValues, 0.95)),
    p99_ltv: roundCurrency(percentile(ltvValues, 0.99)),
    top_10_percent_revenue_share: topRevenueShare(ltvValues, 0.1),
    top_1_percent_revenue_share: topRevenueShare(ltvValues, 0.01),
    active_customers: activeCustomerCount,
    inactive_customers: inactiveCustomers,
    avg_orders_per_customer: safeRatio(customerOrderCount, customerCount),
    purchase_frequency: safeRatio(customerOrderCount, activeCustomerCount || customerCount),
    new_customers: newCustomers,
    dormant_customers: lifecycle.dormantCustomers,
    churned_customers: lifecycle.churnedCustomers,
    avg_customer_lifetime_days: lifecycle.avgCustomerLifetimeDays,
    cohort_by_first_purchase_month: cohort.cohorts,
    cohort_retention_7d: confidence.cohort_confidence === "LOW" ? null : cohort.retention7d,
    cohort_retention_30d: confidence.cohort_confidence === "LOW" ? null : cohort.retention30d,
    cohort_ltv_curve: cohort.ltvCurve,
    revenue_per_customer_segment: segmentRows.revenue,
    profit_per_customer_segment: segmentRows.profit,
    ads_cost_per_customer_segment: segmentRows.adCost,
    ltv_cac_ratio: ltvCacRatio,
    cac_by_cohort: cohort.cacByCohort,
    payback_period_days: paybackPeriodDays,
    customer_lifecycles: lifecycle.customerLifecycles,
    median_customer_lifetime_days: lifecycle.medianCustomerLifetimeDays,
    ltv_confidence: confidence.ltv_confidence,
    cac_confidence: confidence.cac_confidence,
    cohort_confidence: confidence.cohort_confidence,
    customer_metric_confidence: confidence.customer_metric_confidence,
    cac,
    cac_status: cac === null && adSpend > 0 ? "INSUFFICIENT_CUSTOMER_HISTORY" as const : "OK" as const,
    warnings
  };
}

function customerLifecycleOrderDate(order: Record<string, unknown>) {
  return dayKey(firstString(
    order.created_at,
    order.created_at_source,
    order.processed_at_source,
    order.order_date,
    order.date,
    order.createdAt
  ));
}

function buildAdsMetrics(input: {
  revenue: number;
  orderCount: number;
  adSpend: number;
  customerCount: number;
  newCustomers: number;
  newCustomerReliable: boolean;
  attributionCoverage: number;
  quality: QualityAccumulator;
}) {
  const { revenue, orderCount, adSpend, newCustomers, newCustomerReliable, attributionCoverage, quality } = input;

  if (!adSpend) {
    quality.estimatedMetrics.add("ads.roas");
    quality.estimatedMetrics.add("ads.cac");
    quality.estimatedMetrics.add("ads.cpa");
    quality.estimatedMetrics.add("ads.mer");
  }
  if (adSpend > 0 && attributionCoverage <= 0) {
    quality.missingFields.add("fact_attribution.order_id");
    quality.missingFields.add("fact_attribution.campaign_id");
    quality.estimatedMetrics.add("ads.roas");
  }
  if (adSpend > 0 && !newCustomerReliable) {
    quality.missingFields.add("dim_customers.is_new_customer");
    quality.estimatedMetrics.add("ads.cac");
  }

  return {
    roas: safeRatio(revenue, adSpend),
    cac: newCustomerReliable && newCustomers > 0 ? safeRatio(adSpend, newCustomers) : null,
    cac_confidence: newCustomerReliable && newCustomers > 0 ? "MEDIUM" as const : "LOW" as const,
    cac_status: newCustomerReliable && newCustomers > 0 ? "OK" as const : "INSUFFICIENT_CUSTOMER_HISTORY" as const,
    warnings: newCustomerReliable && newCustomers > 0 ? [] : ["New customer attribution requires multiple order periods"],
    cpa: safeRatio(adSpend, orderCount),
    mer: safeRatio(revenue, adSpend),
    ad_spend: adSpend
  };
}

function customerLifecycleCounts(input: {
  customerIds: Set<string>;
  orderDatesByCustomer: Map<string, string[]>;
}) {
  const allDates = Array.from(input.orderDatesByCustomer.values()).flat().sort();
  const latestDate = allDates.length ? new Date(`${allDates[allDates.length - 1]}T00:00:00.000Z`) : null;
  let dormantCustomers = 0;
  let churnedCustomers = 0;
  let lifetimeTotal = 0;
  let lifetimeCount = 0;
  const customerLifecycles: Array<{ customer_id: string; first_order_date: string; last_order_date: string; lifetime_days: number }> = [];
  const lifetimeValues: number[] = [];

  for (const customerId of input.customerIds) {
    const dates = [...(input.orderDatesByCustomer.get(customerId) ?? [])].sort();
    if (!dates.length) continue;

    const first = new Date(`${dates[0]}T00:00:00.000Z`);
    const last = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
    const lifetimeDays = Math.max(0, daysBetween(first, last));
    lifetimeTotal += lifetimeDays;
    lifetimeValues.push(lifetimeDays);
    lifetimeCount += 1;
    customerLifecycles.push({
      customer_id: customerId,
      first_order_date: dates[0],
      last_order_date: dates[dates.length - 1],
      lifetime_days: lifetimeDays
    });

    if (latestDate) {
      const daysSinceLastOrder = daysBetween(last, latestDate);
      if (daysSinceLastOrder > 90) churnedCustomers += 1;
      else if (daysSinceLastOrder > 30) dormantCustomers += 1;
    }
  }

  return {
    dormantCustomers,
    churnedCustomers,
    avgCustomerLifetimeDays: lifetimeCount ? roundRatio(lifetimeTotal / lifetimeCount) : 0,
    medianCustomerLifetimeDays: roundRatio(percentile(lifetimeValues, 0.5)),
    customerLifecycles
  };
}

function customerMetricConfidence(input: {
  orderDatesByCustomer: Map<string, string[]>;
  orderIdsByCustomer: Map<string, Set<string>>;
}) {
  const allDates = Array.from(input.orderDatesByCustomer.values()).flat().sort();
  const uniqueDates = new Set(allDates);
  const dataPeriodDays = allDates.length >= 2
    ? daysBetween(new Date(`${allDates[0]}T00:00:00.000Z`), new Date(`${allDates[allDates.length - 1]}T00:00:00.000Z`))
    : 0;
  const hasMultipleOrderPeriods = uniqueDates.size >= 2 && dataPeriodDays > 0;
  const hasMultipleCustomerOrders = Array.from(input.orderIdsByCustomer.values()).some((orderIds) => orderIds.size > 1);
  const customer_metric_confidence = hasMultipleOrderPeriods && dataPeriodDays >= 30
    ? "HIGH" as const
    : hasMultipleOrderPeriods || hasMultipleCustomerOrders
      ? "MEDIUM" as const
      : "LOW" as const;
  const ltv_confidence = dataPeriodDays >= 30
    ? "HIGH" as const
    : hasMultipleOrderPeriods || hasMultipleCustomerOrders
      ? "MEDIUM" as const
      : "LOW" as const;
  const cac_confidence = dataPeriodDays >= 14 && hasMultipleOrderPeriods ? (dataPeriodDays >= 30 ? "HIGH" as const : "MEDIUM" as const) : "LOW" as const;
  const cohort_confidence = dataPeriodDays >= 14 && hasMultipleOrderPeriods ? (dataPeriodDays >= 30 ? "HIGH" as const : "MEDIUM" as const) : "LOW" as const;

  return {
    customer_metric_confidence,
    ltv_confidence,
    cac_confidence,
    cohort_confidence,
    data_period_days: dataPeriodDays
  };
}

function emptyCustomerCohorts() {
  return {
    cohorts: [],
    retention7d: 0,
    retention30d: 0,
    ltvCurve: [],
    cacByCohort: []
  };
}

function buildCustomerCohorts(input: {
  customerIds: Set<string>;
  revenueByCustomer: Map<string, number>;
  orderDatesByCustomer: Map<string, string[]>;
  adSpend: number;
}) {
  const cohorts = new Map<string, {
    customerIds: string[];
    revenue: number;
    retained7d: number;
    retained30d: number;
    ltvDay0: number;
    ltvDay7: number;
    ltvDay30: number;
  }>();
  const totalCustomersWithDates = Array.from(input.customerIds).filter((customerId) => (input.orderDatesByCustomer.get(customerId) ?? []).length > 0).length;

  for (const customerId of input.customerIds) {
    const dates = [...(input.orderDatesByCustomer.get(customerId) ?? [])].sort();
    if (!dates.length) continue;
    const firstDate = new Date(`${dates[0]}T00:00:00.000Z`);
    const cohortMonth = dates[0].slice(0, 7);
    const revenue = input.revenueByCustomer.get(customerId) ?? 0;
    const current = cohorts.get(cohortMonth) ?? {
      customerIds: [],
      revenue: 0,
      retained7d: 0,
      retained30d: 0,
      ltvDay0: 0,
      ltvDay7: 0,
      ltvDay30: 0
    };
    current.customerIds.push(customerId);
    current.revenue = roundCurrency(current.revenue + revenue);

    const has7dRetention = dates.some((date) => {
      const diff = daysBetween(firstDate, new Date(`${date}T00:00:00.000Z`));
      return diff > 0 && diff <= 7;
    });
    const has30dRetention = dates.some((date) => {
      const diff = daysBetween(firstDate, new Date(`${date}T00:00:00.000Z`));
      return diff > 0 && diff <= 30;
    });
    if (has7dRetention) current.retained7d += 1;
    if (has30dRetention) current.retained30d += 1;

    // Order-level revenue is not retained here, so curve points use customer LTV once the customer is retained by that window.
    current.ltvDay0 = roundCurrency(current.ltvDay0 + revenue);
    current.ltvDay7 = roundCurrency(current.ltvDay7 + (has7dRetention ? revenue : 0));
    current.ltvDay30 = roundCurrency(current.ltvDay30 + (has30dRetention ? revenue : 0));
    cohorts.set(cohortMonth, current);
  }

  const rows = Array.from(cohorts.entries())
    .map(([cohortMonth, cohort]) => ({
      cohort_month: cohortMonth,
      customers: cohort.customerIds.length,
      revenue: roundCurrency(cohort.revenue),
      avg_ltv: cohort.customerIds.length ? roundCurrency(cohort.revenue / cohort.customerIds.length) : 0,
      retention_7d: safeRatio(cohort.retained7d, cohort.customerIds.length),
      retention_30d: safeRatio(cohort.retained30d, cohort.customerIds.length)
    }))
    .sort((left, right) => left.cohort_month.localeCompare(right.cohort_month));

  const ltvCurve = Array.from(cohorts.entries())
    .map(([cohortMonth, cohort]) => ({
      cohort_month: cohortMonth,
      day_0: cohort.customerIds.length ? roundCurrency(cohort.ltvDay0 / cohort.customerIds.length) : 0,
      day_7: cohort.customerIds.length ? roundCurrency(cohort.ltvDay7 / cohort.customerIds.length) : 0,
      day_30: cohort.customerIds.length ? roundCurrency(cohort.ltvDay30 / cohort.customerIds.length) : 0,
      total_ltv: cohort.customerIds.length ? roundCurrency(cohort.revenue / cohort.customerIds.length) : 0
    }))
    .sort((left, right) => left.cohort_month.localeCompare(right.cohort_month));

  const cacByCohort = rows.map((row) => ({
    cohort_month: row.cohort_month,
    cac: safeRatio(input.adSpend * safeRatio(row.customers, totalCustomersWithDates), row.customers)
  }));
  const cohortCount = rows.reduce((total, row) => total + row.customers, 0);

  return {
    cohorts: rows,
    retention7d: cohortCount ? roundRatio(rows.reduce((total, row) => total + row.retention_7d * row.customers, 0) / cohortCount) : 0,
    retention30d: cohortCount ? roundRatio(rows.reduce((total, row) => total + row.retention_30d * row.customers, 0) / cohortCount) : 0,
    ltvCurve,
    cacByCohort
  };
}

function customerValueSegments(input: {
  customerIds: Set<string>;
  revenueByCustomer: Map<string, number>;
  totalRevenue: number;
  totalProfit: number;
  totalAdSpend: number;
}) {
  const customers = Array.from(input.customerIds)
    .map((customerId) => ({ customerId, revenue: input.revenueByCustomer.get(customerId) ?? 0 }))
    .sort((left, right) => right.revenue - left.revenue || left.customerId.localeCompare(right.customerId));
  const count = customers.length;
  const topOneEnd = Math.max(1, Math.ceil(count * 0.01));
  const topTenEnd = Math.max(topOneEnd, Math.ceil(count * 0.1));
  const middleEnd = Math.max(topTenEnd, Math.ceil(count * 0.5));
  const buckets = [
    { segment: "Top 1%", rows: customers.slice(0, topOneEnd) },
    { segment: "Next 9%", rows: customers.slice(topOneEnd, topTenEnd) },
    { segment: "Middle 40%", rows: customers.slice(topTenEnd, middleEnd) },
    { segment: "Bottom 50%", rows: customers.slice(middleEnd) }
  ];

  const revenue = buckets.map((bucket) => {
    const bucketRevenue = roundCurrency(sum(bucket.rows.map((row) => row.revenue)));
    return {
      segment: bucket.segment,
      customers: bucket.rows.length,
      revenue: bucketRevenue,
      share: safeRatio(bucketRevenue, input.totalRevenue)
    };
  });
  const profit = revenue.map((row) => ({
    segment: row.segment,
    customers: row.customers,
    profit: roundCurrency(input.totalProfit * row.share),
    share: row.share
  }));
  const adCost = revenue.map((row) => ({
    segment: row.segment,
    customers: row.customers,
    ad_cost: roundCurrency(input.totalAdSpend * row.share),
    share: row.share
  }));

  return { revenue, profit, adCost };
}

function buildAttributionMetrics(input: {
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
  skuUnitEconomics: SkuUnitEconomicsMetric[];
  revenue: number;
  quality: QualityAccumulator;
}): AttributionMetric {
  const { orders, orderItems, ads, quality } = input;
  const adSpend = roundCurrency(sum(ads.map(adSpendValue)));
  const campaignAdSpend = new Map<string, number>();
  for (const ad of ads) {
    const campaignId = firstString(ad.campaign_id, ad.utm_campaign, ad.ad_id);
    if (!campaignId) continue;
    campaignAdSpend.set(campaignId, roundCurrency((campaignAdSpend.get(campaignId) ?? 0) + adSpendValue(ad)));
  }

  const orderAttribution = new Map<string, { campaignId: string; adId: string; source: string }>();
  for (const order of orders) {
    const orderId = stringValue(order.order_id);
    if (!orderId) continue;
    const campaignId = firstString(order.campaign_id, order.utm_campaign, order.marketing_campaign_id);
    const adId = firstString(order.ad_id, order.utm_ad_id);
    const source = firstString(order.utm_source, order.source_provider, order.platform);
    if (!campaignId && !adId) continue;
    orderAttribution.set(orderId, {
      campaignId: campaignId || adId,
      adId: adId || campaignId || "",
      source
    });
  }

  for (const item of orderItems) {
    const orderId = stringValue(item.order_id);
    if (!orderId || orderAttribution.has(orderId)) continue;
    const campaignId = firstString(item.campaign_id, item.utm_campaign, item.marketing_campaign_id);
    const adId = firstString(item.ad_id, item.utm_ad_id);
    const source = firstString(item.utm_source, item.source_provider, item.platform);
    if (!campaignId && !adId) continue;
    orderAttribution.set(orderId, {
      campaignId: campaignId || adId,
      adId: adId || campaignId || "",
      source
    });
  }

  const orderAttributionCoverage = safeRatio(orderAttribution.size, orders.length);
  const model: AttributionMetric["attribution_model"] = orderAttribution.size > 0 ? "last_click" : "none";

  const skuRevenueRows = buildSkuRevenue(orderItems, quality);
  const totalSkuRevenue = sum(skuRevenueRows.map((row) => row.revenue));
  const revenueByCampaignSku = new Map<string, { sku: string; campaign_id: string; revenue: number }>();

  for (const item of orderItems) {
    const orderId = stringValue(item.order_id);
    const attributed = orderAttribution.get(orderId);
    if (!attributed?.campaignId) continue;
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const quantity = numberValue(item.quantity, 1);
    const itemRevenue = firstNumber(item.revenue, item.net_sales, firstNumber(item.price, item.unit_price) * quantity);
    const key = `${attributed.campaignId}:${sku}`;
    const current = revenueByCampaignSku.get(key) ?? { sku, campaign_id: attributed.campaignId, revenue: 0 };
    current.revenue = roundCurrency(current.revenue + itemRevenue);
    revenueByCampaignSku.set(key, current);
  }

  const revenueByCampaign = new Map<string, number>();
  for (const row of revenueByCampaignSku.values()) {
    revenueByCampaign.set(row.campaign_id, roundCurrency((revenueByCampaign.get(row.campaign_id) ?? 0) + row.revenue));
  }

  const skuAttribution = Array.from(revenueByCampaignSku.values()).map((row) => {
    const campaignRevenue = revenueByCampaign.get(row.campaign_id) ?? 0;
    const campaignSpend = campaignAdSpend.get(row.campaign_id) ?? 0;
    const adSpendAllocated = campaignRevenue > 0 ? roundCurrency(campaignSpend * (row.revenue / campaignRevenue)) : 0;

    return {
      sku: row.sku,
      campaign_id: row.campaign_id,
      revenue: row.revenue,
      ad_spend_allocated: adSpendAllocated,
      roas: safeRatio(row.revenue, adSpendAllocated),
      estimated: false
    };
  });

  const attributedSkuRevenue = sum(skuAttribution.map((row) => row.revenue));
  const skuAttributionCoverage = safeRatio(attributedSkuRevenue, totalSkuRevenue);

  if (ads.length && !orderAttribution.size) {
    quality.missingFields.add("ecommerce_orders.utm_campaign");
    quality.missingFields.add("ecommerce_orders.ad_id");
    quality.missingFields.add("fact_attribution.order_id");
    quality.missingFields.add("fact_attribution.campaign_id");
    quality.estimatedMetrics.add("attribution.order_to_ad");
    quality.estimatedMetrics.add("attribution.sku_to_campaign");
    quality.estimatedMetrics.add("attribution.roas_by_sku");
  }
  if (!ads.length) {
    quality.missingFields.add("ecommerce_ads.*");
    quality.estimatedMetrics.add("attribution.roas_by_sku");
  }

  const campaignIds = new Set<string>([
    ...campaignAdSpend.keys(),
    ...revenueByCampaign.keys()
  ]);

  return {
    order_attribution_coverage: orderAttributionCoverage,
    sku_attribution_coverage: skuAttributionCoverage,
    campaignRevenueCoverage: safeRatio(sum(Array.from(revenueByCampaign.values())), input.revenue),
    skuRevenueCoverage: skuAttributionCoverage,
    fallbackUsed: ads.length > 0 && revenueByCampaign.size === 0,
    attribution_model: model,
    roas_by_sku: skuAttribution.length > 0 && adSpend > 0 && orderAttributionCoverage > 0,
    campaign_performance: Array.from(campaignIds)
      .sort()
      .map((campaignId) => {
        const campaignSpend = campaignAdSpend.get(campaignId) ?? 0;
        const campaignRev = revenueByCampaign.get(campaignId) ?? 0;
        return {
          campaign_id: campaignId,
          ad_spend: campaignSpend,
          revenue: campaignRev,
          roas: campaignRev > 0 && campaignSpend > 0 ? safeRatio(campaignRev, campaignSpend) : null,
          estimated: !revenueByCampaign.has(campaignId),
          attribution_status: campaignRev > 0 ? "attributed" : "missing",
          attribution_source: "campaign_attribution",
          attribution_confidence: campaignRev > 0 ? Math.max(0.35, Math.min(0.9, orderAttributionCoverage)) : 0
        };
      }),
    sku_attribution: skuAttribution
      .sort((left, right) => right.revenue - left.revenue || left.sku.localeCompare(right.sku))
  };
}

function acquiredCustomerCount(orders: Array<Record<string, unknown>>, customers: Array<Record<string, unknown>>) {
  const orderDatesByCustomer = new Map<string, string[]>();
  const observedWindow = observedDateWindow(orders);
  for (const order of orders) {
    const customerId = explicitCustomerIdFromOrder(order);
    if (!customerId) continue;

    const date = customerLifecycleOrderDate(order);
    if (!date) continue;
    const dates = orderDatesByCustomer.get(customerId) ?? [];
    dates.push(date);
    orderDatesByCustomer.set(customerId, dates);
  }

  const explicitFirstPurchaseCustomers = observedWindow
    ? customers.filter((customer) => {
      const customerId = stringValue(customer.customer_id);
      if (!customerId && typeof customer.is_new_customer !== "boolean") return false;
      const firstOrderDate = dayKey(firstString(customer.first_order_date, customer.first_order_at, customer.customer_first_order_date));
      if (firstOrderDate) return firstOrderDate >= observedWindow.start && firstOrderDate <= observedWindow.end;
      return Boolean(customerId && customer.is_new_customer === true && orderDatesByCustomer.has(customerId));
    }).length
    : 0;

  if (explicitFirstPurchaseCustomers) return explicitFirstPurchaseCustomers;

  return Array.from(orderDatesByCustomer.values()).filter((dates) => {
    if (!dates.length || !observedWindow) return false;
    const firstOrderDate = [...dates].sort()[0];
    return firstOrderDate >= observedWindow.start && firstOrderDate <= observedWindow.end;
  }).length;
}

function customerAcquisitionReliability(orders: Array<Record<string, unknown>>, customers: Array<Record<string, unknown>>) {
  const explicitNewCustomerRows = customers.filter((customer) => typeof customer.is_new_customer === "boolean").length;
  const customerOrderRows = customers.filter((customer) => firstFiniteNumber(customer.total_orders, customer.order_count) !== null).length;
  const orderCustomerRows = orders.filter((order) => explicitCustomerIdFromOrder(order)).length;
  const customerCoverage = safeRatio(orderCustomerRows, orders.length);
  const customerProfileCoverage = safeRatio(explicitNewCustomerRows + customerOrderRows, customers.length);
  const newCustomers = acquiredCustomerCount(orders, customers);
  const dataPeriodDays = orderDataPeriodDays(orders);
  const hasMultipleOrderPeriods = dataPeriodDays >= 14;
  const reliable = newCustomers > 0 && (
    explicitNewCustomerRows > 0 ||
    customerProfileCoverage >= 0.8 ||
    (orders.length > 0 && customerCoverage >= 0.8)
  ) && hasMultipleOrderPeriods;

  return {
    reliable,
    customerCoverage,
    customerProfileCoverage,
    newCustomers,
    dataPeriodDays
  };
}

function orderDataPeriodDays(orders: Array<Record<string, unknown>>) {
  const dates = orders
    .map((order) => dayKey(firstString(order.order_date, order.created_at, order.date, order.createdAt)))
    .filter((date): date is string => Boolean(date))
    .sort();
  if (dates.length < 2) return 0;
  return daysBetween(new Date(`${dates[0]}T00:00:00.000Z`), new Date(`${dates[dates.length - 1]}T00:00:00.000Z`));
}

function explicitCustomerIdFromOrder(order: Record<string, unknown>) {
  return stringValue(order.customer_id) || stringValue(order.source_customer_id);
}

function customerConfidence(input: {
  orders: Array<Record<string, unknown>>;
  customers: Array<Record<string, unknown>>;
}) {
  const { orders } = input;
  if (!orders.length) return 0;
  const explicitCustomerOrders = orders.filter((order) => stringValue(order.customer_id) || stringValue(order.source_customer_id)).length;
  const orderCoverage = safeRatio(explicitCustomerOrders, orders.length);
  return roundRatio(orderCoverage);
}

function timeSeriesQuality(rows: TimeSeriesMetric[]) {
  if (!rows.length) return 0;
  if (rows.length === 1) return 0.35;
  if (rows.length < 7) return 0.65;
  return 1;
}

function aovConfidence(input: { orders: Array<Record<string, unknown>>; orderCount: number }): "HIGH" | "MEDIUM" | "LOW" {
  if (!input.orders.length || !input.orderCount) return "LOW";
  const orderIdRows = input.orders.filter((row) => stringValue(row.order_id)).length;
  const orderCompleteness = safeRatio(orderIdRows, input.orders.length);
  const duplicateRatio = input.orders.length > 0 ? 1 - safeRatio(input.orderCount, input.orders.length) : 1;

  if (orderCompleteness >= 0.98 && duplicateRatio <= 0.01) return "HIGH";
  if (orderCompleteness >= 0.8 && duplicateRatio <= 0.1) return "MEDIUM";
  return "LOW";
}

function metricValidationSummary(input: {
  revenueFromOrders: number;
  revenueFromOrderItems: number;
  revenueFromSkuRollup: number;
  displayedRevenue: number;
  uniqueOrderIds: number;
  displayedOrders: number;
}) {
  const revenueBaseline = input.revenueFromOrderItems > 0 ? input.revenueFromOrderItems : input.revenueFromOrders;
  const difference = roundCurrency(input.displayedRevenue - revenueBaseline);
  const warnings: string[] = [];
  const tolerance = 0.01;

  if (Math.abs(difference) > tolerance) {
    warnings.push(`displayed revenue differs from canonical revenue by ${difference}`);
  }
  const skuDifference = roundCurrency(input.displayedRevenue - input.revenueFromSkuRollup);
  if (input.revenueFromSkuRollup > 0 && Math.abs(skuDifference) > tolerance) {
    warnings.push(`displayed revenue differs from SKU rollup by ${skuDifference}`);
  }
  const orderDifference = input.displayedOrders - input.uniqueOrderIds;
  if (orderDifference !== 0) {
    warnings.push(`displayed orders differ from distinct order ids by ${orderDifference}`);
  }

  return {
    status: warnings.length ? "INVALID" as const : "VALID" as const,
    revenue_reconciliation: {
      revenue_from_orders: input.revenueFromOrders,
      revenue_from_order_items: input.revenueFromOrderItems,
      revenue_from_sku_rollup: input.revenueFromSkuRollup,
      displayed_revenue: input.displayedRevenue,
      difference
    },
    order_reconciliation: {
      unique_order_ids: input.uniqueOrderIds,
      displayed_orders: input.displayedOrders,
      difference: orderDifference
    },
    warnings
  };
}

function buildSkuVelocity(rows: Array<Record<string, unknown>>) {
  const bySku = new Map<string, { sku: string; quantity: number; revenue: number }>();
  for (const row of rows) {
    const sku = stringValue(row.sku);
    if (!sku) continue;

    const quantity = numberValue(row.quantity, 1);
    const revenue = numberValue(row.price) * quantity;
    const current = bySku.get(sku) ?? { sku, quantity: 0, revenue: 0 };
    current.quantity += quantity;
    current.revenue = roundCurrency(current.revenue + revenue);
    bySku.set(sku, current);
  }

  return Array.from(bySku.values()).sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue || left.sku.localeCompare(right.sku));
}

function bucketsToSeries(buckets: Map<string, { revenue: number; orderIds: Set<string>; skus: Set<string> }>): TimeSeriesMetric[] {
  return Array.from(buckets.entries())
    .map(([period, bucket]) => ({
      period,
      revenue: roundCurrency(bucket.revenue),
      orders: bucket.orderIds.size,
      sku_count: bucket.skus.size
    }))
    .sort((left, right) => left.period.localeCompare(right.period));
}

function observedSeriesWindowDays(rows: TimeSeriesMetric[]) {
  const dates = rows
    .map((row) => dayKey(row.period))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (!dates.length) return 0;
  if (dates.length === 1) return 1;

  return daysBetween(
    new Date(`${dates[0]}T00:00:00.000Z`),
    new Date(`${dates[dates.length - 1]}T00:00:00.000Z`)
  ) + 1;
}

function rollupSeries(rows: TimeSeriesMetric[], getPeriod: (period: string) => string) {
  const buckets = new Map<string, TimeSeriesMetric>();
  for (const row of rows) {
    const period = getPeriod(row.period);
    const current = buckets.get(period) ?? { period, revenue: 0, orders: 0, sku_count: 0 };
    current.revenue = roundCurrency(current.revenue + row.revenue);
    current.orders += row.orders;
    current.sku_count += row.sku_count;
    buckets.set(period, current);
  }

  return Array.from(buckets.values()).sort((left, right) => left.period.localeCompare(right.period));
}

function latestGrowthRate(rows: TimeSeriesMetric[], field: keyof Pick<TimeSeriesMetric, "revenue" | "orders" | "sku_count">) {
  const windowDays = 7;
  if (rows.length < windowDays * 2) return 0;

  const currentRows = rows.slice(-windowDays);
  const previousRows = rows.slice(-(windowDays * 2), -windowDays);
  const current = sum(currentRows.map((row) => Number(row[field]) || 0)) / windowDays;
  const previous = sum(previousRows.map((row) => Number(row[field]) || 0)) / windowDays;
  return safeRatio(current - previous, previous);
}

function dayKey(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}(?:$|[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function weekKey(period: string) {
  const date = new Date(`${period}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return period;

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(period: string) {
  return period.slice(0, 7);
}

function assertSupportedSchema(dataset: CanonicalDataset) {
  if (dataset.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`Unsupported canonical schema version: ${String(dataset.schema_version)}`);
  }
}

function canonicalComputedAt(dataset: CanonicalDataset) {
  const normalizedAt = dataset.metadata?.normalized_at;

  if (typeof normalizedAt === "string" && normalizedAt.trim()) {
    return normalizedAt;
  }

  return "1970-01-01T00:00:00.000Z";
}

function trackCompleteness(
  quality: QualityAccumulator,
  table: keyof CanonicalDataset["tables"],
  rows: Array<Record<string, unknown>>,
  requiredFields: string[]
) {
  if (!rows.length) {
    quality.missingFields.add(`${table}.*`);
    return;
  }

  for (const row of rows) {
    for (const field of requiredFields) {
      quality.expected += 1;
      if (hasValue(row[field])) {
        quality.present += 1;
      } else {
        quality.missingFields.add(`${table}.${field}`);
      }
    }
  }
}

function confidenceScore(input: {
  quality: QualityAccumulator;
  refundDataPresent: boolean;
  costCompleteness: number;
  customerAvailability: number;
  attributionCompleteness: number;
  timeSeriesQuality: number;
}) {
  const { quality, refundDataPresent, costCompleteness, customerAvailability, attributionCompleteness, timeSeriesQuality } = input;
  const base = coverage(quality);
  const missingPenalty = Math.min(0.3, quality.missingFields.size * 0.035);
  const refundPenalty = refundDataPresent ? 0 : 0.08;
  const estimationPenalty = Math.min(0.2, quality.estimatedMetrics.size * 0.04);
  const foundationScore = (
    costCompleteness * 0.4 +
    customerAvailability * 0.2 +
    attributionCompleteness * 0.2 +
    timeSeriesQuality * 0.2
  );
  const fieldScore = Math.max(0, Math.min(1, base - missingPenalty - refundPenalty - estimationPenalty));

  return roundRatio(Math.max(0, Math.min(1, (fieldScore * 0.45) + (foundationScore * 0.55))));
}

function coverage(quality: QualityAccumulator) {
  if (!quality.expected) return 0;

  return roundRatio(quality.present / quality.expected);
}

function dedupeBy(rows: Array<Record<string, unknown>>, getKey: (row: Record<string, unknown>) => string) {
  const seen = new Map<string, Record<string, unknown>>();

  rows.forEach((row, index) => {
    const key = getKey(row) || `row:${index}`;
    seen.set(key, row);
  });

  return Array.from(seen.values());
}

function adRowIdentity(row: Record<string, unknown>) {
  const adId = stringValue(row.ad_id);
  if (adId) {
    return [
      "ad",
      adId,
      stringValue(row.sku),
      stringValue(row.product_sku),
      firstString(row.ad_date, row.date, row.report_date),
      stringValue(row.platform),
      stringValue(row.source_provider)
    ].join(":");
  }

  return [
    "adrow",
    stringValue(row.campaign_id),
    stringValue(row.utm_campaign),
    stringValue(row.sku),
    stringValue(row.product_sku),
    firstString(row.ad_date, row.date, row.report_date),
    stringValue(row.platform),
    stringValue(row.source_provider),
    String(adSpendValue(row))
  ].join(":");
}

function attachRefundAmountsToOrders(
  rows: Array<Record<string, unknown>>,
  refunds: Array<Record<string, unknown>>
) {
  const refundByOrder = new Map<string, number>();
  for (const refund of refunds) {
    const amount = refundAmountValue(refund);
    if (amount <= 0) continue;
    for (const key of orderMatchValues(refund)) {
      refundByOrder.set(key, roundCurrency((refundByOrder.get(key) ?? 0) + amount));
    }
  }

  return rows.map((row) => {
    if (hasPositiveRefundAmount(row) || !hasPreRefundRevenueSignal(row)) return row;
    const refundAmount = orderMatchValues(row).reduce((total, key) => Math.max(total, refundByOrder.get(key) ?? 0), 0);
    if (refundAmount <= 0) return row;

    return {
      ...row,
      refund_amount: refundAmount,
      refund_source: "ecommerce_refunds"
    };
  });
}

function attachRefundAmountsToOrderItems(
  rows: Array<Record<string, unknown>>,
  refunds: Array<Record<string, unknown>>
) {
  const refundByLine = new Map<string, { amount: number; quantity: number }>();
  for (const refund of refunds) {
    const amount = refundAmountValue(refund);
    const quantity = refundQuantityValue(refund);
    if (amount <= 0 && quantity <= 0) continue;
    for (const key of orderItemMatchValues(refund)) {
      const current = refundByLine.get(key) ?? { amount: 0, quantity: 0 };
      refundByLine.set(key, {
        amount: roundCurrency(current.amount + amount),
        quantity: roundRatio(current.quantity + quantity)
      });
    }
  }

  if (!refundByLine.size) return rows;

  return rows.map((row) => {
    if (!hasPreRefundRevenueSignal(row)) return row;
    const refund = orderItemMatchValues(row).reduce((current, key) => {
      const next = refundByLine.get(key);
      if (!next) return current;
      return {
        amount: Math.max(current.amount, next.amount),
        quantity: Math.max(current.quantity, next.quantity)
      };
    }, { amount: 0, quantity: 0 });
    if (refund.amount <= 0 && refund.quantity <= 0) return row;

    return {
      ...row,
      ...(hasPositiveRefundAmount(row) ? {} : { refund_amount: refund.amount }),
      ...(firstFiniteNumber(row.refunded_quantity, row.refund_quantity, row.returned_quantity) !== null ? {} : { refunded_quantity: refund.quantity }),
      refund_source: "ecommerce_refunds"
    };
  });
}

function refundAmountValue(row: Record<string, unknown>) {
  return firstNumber(row.amount, row.refund_amount, row.refunded_amount, row.total_refund);
}

function refundQuantityValue(row: Record<string, unknown>) {
  return firstNumber(row.quantity, row.refunded_quantity, row.refund_quantity, row.returned_quantity);
}

function hasPositiveRefundAmount(row: Record<string, unknown>) {
  return firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund) > 0;
}

function hasPreRefundRevenueSignal(row: Record<string, unknown>) {
  return hasFiniteNumber(row.gross_sales) ||
    hasFiniteNumber(row.grossSales) ||
    hasFiniteNumber(row.gross_revenue) ||
    hasFiniteNumber(row.grossRevenue) ||
    hasFiniteNumber(row.sales) ||
    hasFiniteNumber(row.gmv) ||
    hasFiniteNumber(row.amount) ||
    hasFiniteNumber(row.total) ||
    hasFiniteNumber(row.subtotal);
}

function orderMatchValues(row: Record<string, unknown>) {
  return uniqueStrings([
    row.native_order_id,
    row.nativeOrderId,
    row.order_id,
    row.orderId,
    row.source_order_id,
    row.sourceOrderId,
    row.amazon_order_id,
    row.shopify_order_id,
    nativeOrderIdFromRow(row)
  ]);
}

function orderItemMatchValues(row: Record<string, unknown>) {
  const orderIds = orderMatchValues(row);
  const lineIds = uniqueStrings([
    row.source_line_item_id,
    row.sourceLineItemId,
    row.line_item_id,
    row.lineItemId,
    row.order_item_id,
    row.orderItemId
  ]);
  if (!lineIds.length) return [];

  return [
    ...lineIds.map((lineId) => `line:${lineId}`),
    ...orderIds.flatMap((orderId) => lineIds.map((lineId) => `order-line:${orderId}:${lineId}`))
  ];
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map(stringValue).map((value) => value.trim()).filter(Boolean)));
}

function sourceOrderIdentity(row: Record<string, unknown>) {
  const sourceOrderId = firstString(row.native_order_id, row.nativeOrderId, row.source_order_id, row.sourceOrderId, row.order_id, row.orderId, row.amazon_order_id, row.shopify_order_id);
  const nativeOrderId = nativeOrderIdFromRow(row);
  if (!sourceOrderId && !nativeOrderId) return "";
  const workspace = firstString(row.workspace_id, row.workspaceId);
  const sourceAccount = firstString(row.source_account_id, row.sourceAccountId, row.account_id, row.accountId, row.shop_id, row.seller_id);
  const nativeProvider = nativeProviderFromOrderId(nativeOrderId || sourceOrderId);

  if (nativeProvider) {
    return [
      "native-source-order",
      workspace || "unknown",
      nativeProvider,
      normalizeIdentityPart(nativeOrderId || sourceOrderId)
    ].join(":");
  }

  const scopedParts = [
    workspace,
    firstString(row.data_source_id, row.dataSourceId, row.connection_id, row.connectionId),
    sourceAccount,
    sourceOrderId
  ];

  if (scopedParts.slice(0, 3).some(Boolean)) {
    return ["source-order", ...scopedParts.map((part) => part || "unknown")].join(":");
  }

  return ["source-order", sourceOrderId].join(":");
}

const NATIVE_ORDER_PROVIDER_KEYS = ["amazon", "shopify"] as const;
const NATIVE_ORDER_ID_PATTERNS = [
  [/^AMZ[-_:]/i, /^\d{3}-\d{7}-\d{7}$/],
  [/^gid:\/\/shopify\/Order\//i]
] as const;

function nativeProviderFromOrderId(value: string) {
  const normalized = value.trim();
  const index = NATIVE_ORDER_ID_PATTERNS.findIndex((patterns) => patterns.some((pattern) => pattern.test(normalized)));
  if (index >= 0) return NATIVE_ORDER_PROVIDER_KEYS[index] ?? "";
  return "";
}

function nativeOrderIdFromRow(row: Record<string, unknown>) {
  const candidates = [
    row.native_order_id,
    row.nativeOrderId,
    row.source_order_id,
    row.sourceOrderId,
    row.order_id,
    row.orderId,
    row.amazon_order_id,
    row.shopify_order_id,
    row.source_id,
    row.sourceId
  ].map(firstString).map((value) => value.trim()).filter(Boolean);

  for (const providerIndex of [0, 1]) {
    const value = candidates.find((candidate) => NATIVE_ORDER_ID_PATTERNS[providerIndex]?.some((pattern) => pattern.test(candidate)));
    if (value) return value;
  }

  return "";
}

function normalizeIdentityPart(value: string) {
  return value.trim().toLowerCase();
}

function orderItemDedupeKey(row: Record<string, unknown>) {
  const orderId = stringValue(row.order_id);
  if (orderId) {
    const sourceOrderId = nativeOrderIdFromRow(row) || firstString(row.native_order_id, row.nativeOrderId, row.source_order_id, row.sourceOrderId, row.order_id, row.orderId, row.amazon_order_id, row.shopify_order_id);
    const nativeProvider = nativeProviderFromOrderId(sourceOrderId);
    return [
      "order-item",
      firstString(row.workspace_id, row.workspaceId),
      nativeProvider ? `native:${nativeProvider}` : firstString(row.data_source_id, row.dataSourceId),
      nativeProvider ? "" : firstString(row.source_account_id, row.sourceAccountId, row.account_id, row.accountId, row.shop_id, row.seller_id),
      normalizeIdentityPart(sourceOrderId),
      nativeProvider ? "" : firstString(row.source_line_item_id, row.sourceLineItemId, row.line_item_id, row.lineItemId, row.order_item_id, row.orderItemId),
      nativeProvider ? "" : orderId,
      firstString(row.sku, row.product_sku, row.seller_sku),
      firstString(row.asin),
      nativeProvider ? "" : firstString(row.variant_id),
      nativeProvider ? "" : firstString(row.product_id),
      nativeProvider ? "" : firstString(row.product_name, row.title, row.item_name, row.name),
      String(numberValue(row.quantity, 1)),
      String(lineItemRevenueBasisForAllocation(row)),
      String(firstNumber(row.cogs, row.item_cost, row.unit_cost, row.cost_price))
    ].join(":");
  }

  return stringValue(row.canonical_key);
}

function attachNativeOrderIdsToOrderItems(
  items: Array<Record<string, unknown>>,
  orders: Array<Record<string, unknown>>
) {
  if (!items.length || !orders.length) return items;

  const nativeOrderIdByOrderMatch = new Map<string, string>();
  for (const order of orders) {
    const nativeOrderId = nativeOrderIdFromRow(order);
    if (!nativeOrderId) continue;
    for (const matchValue of orderMatchValues(order)) {
      nativeOrderIdByOrderMatch.set(matchValue, nativeOrderId);
    }
  }

  if (!nativeOrderIdByOrderMatch.size) return items;

  return items.map((item) => {
    const nativeOrderId = orderMatchValues(item)
      .map((matchValue) => nativeOrderIdByOrderMatch.get(matchValue))
      .find(Boolean);
    return nativeOrderId ? { ...item, native_order_id: nativeOrderId } : item;
  });
}

function buildOrderNetRevenueById(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const orderId = orderAllocationIdentity(row);
    if (!orderId || !hasExplicitCommerceRevenue(row)) continue;
    map.set(orderId, orderRevenue(row));
  }
  return map;
}

function allocateOrderNetRevenueToItems(
  rows: Array<Record<string, unknown>>,
  orderNetRevenueById: Map<string, number>
) {
  const rowsByOrderId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const orderId = orderAllocationIdentity(row);
    if (!orderId || !orderNetRevenueById.has(orderId)) continue;
    rowsByOrderId.set(orderId, [...(rowsByOrderId.get(orderId) ?? []), row]);
  }

  const allocatedRevenueByRow = new Map<Record<string, unknown>, number>();
  for (const [orderId, orderRows] of rowsByOrderId) {
    const orderRevenueValue = orderNetRevenueById.get(orderId) ?? 0;
    const bases = orderRows.map((row) => Math.max(0, lineItemRevenueBasisForAllocation(row)));
    const totalBasis = roundCurrency(sum(bases));
    const netQuantities = orderRows.map((row) => Math.max(0, numberValue(row.quantity, 0)));
    const totalNetQuantity = roundRatio(sum(netQuantities));
    const allocationBasis = totalBasis > 0 ? bases : netQuantities;
    const totalAllocationBasis = totalBasis > 0 ? totalBasis : totalNetQuantity;
    if (totalAllocationBasis <= 0) continue;

    let allocatedSoFar = 0;
    orderRows.forEach((row, index) => {
      const allocated = index === orderRows.length - 1
        ? roundCurrency(orderRevenueValue - allocatedSoFar)
        : roundCurrency(orderRevenueValue * (allocationBasis[index] / totalAllocationBasis));
      allocatedSoFar = roundCurrency(allocatedSoFar + allocated);
      allocatedRevenueByRow.set(row, allocated);
    });
  }

  return rows.map((row) => {
    const allocatedRevenue = allocatedRevenueByRow.get(row);
    if (allocatedRevenue === undefined) return row;
    return {
      ...row,
      revenue: allocatedRevenue,
      net_sales: allocatedRevenue,
      net_revenue: allocatedRevenue,
      revenue_allocation_source: "order_net_revenue"
    };
  });
}

function orderAllocationIdentity(row: Record<string, unknown>) {
  return sourceOrderIdentity(row) || stringValue(row.order_id);
}

const VALID_FINANCIAL_STATUSES = new Set([
  "paid",
  "partially_refunded",
  "captured",
  "settled"
]);

const INVALID_FINANCIAL_STATUSES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "pending",
  "unpaid",
  "voided"
]);

function filterValidOrders(rows: Array<Record<string, unknown>>) {
  return rows.filter(isValidOrder);
}

function isNonTestNonCancelledOrder(row: Record<string, unknown>) {
  return !truthyFlag(row.is_test) &&
    !truthyFlag(row.test) &&
    !truthyFlag(row.is_cancelled) &&
    !truthyFlag(row.cancelled) &&
    !Boolean(stringValue(row.cancelled_at)) &&
    !Boolean(stringValue(row.cancelled_at_source)) &&
    !["cancelled", "canceled"].includes(normalizeStatus(firstString(row.financial_status, row.payment_status, row.status, row.order_status)));
}

function isValidOrder(row: Record<string, unknown>) {
  if (!isNonTestNonCancelledOrder(row)) return false;

  const explicitPaymentStatus = firstString(row.financial_status, row.payment_status);
  const fallbackStatus = firstString(row.status, row.order_status);
  const financialStatus = normalizeStatus(explicitPaymentStatus || fallbackStatus);
  const hasOrderDate = Boolean(dayKey(firstString(row.order_date, row.date, row.created_at, row.createdAt, row.processed_at)));
  const explicitPaidFlag = truthyFlag(row.is_paid) || truthyFlag(row.paid) || truthyFlag(row.isPaid);
  if (explicitPaidFlag && financialStatus !== "authorized" && !INVALID_FINANCIAL_STATUSES.has(financialStatus)) return true;
  if (!financialStatus) return hasPositiveCommerceRevenueOrPayment(row);
  if (INVALID_FINANCIAL_STATUSES.has(financialStatus)) return false;
  if (financialStatus === "authorized") return false;
  if (financialStatus === "partially_paid") return paidAmount(row) !== null;
  if (financialStatus === "refunded") return true;
  if (!explicitPaymentStatus) return hasOrderDate && hasPositiveCommerceRevenueOrPayment(row);
  return VALID_FINANCIAL_STATUSES.has(financialStatus);
}

function withNetQuantity(row: Record<string, unknown>) {
  const quantity = itemNetQuantity(row);
  if (quantity === numberValue(row.quantity, 1)) return row;

  return {
    ...row,
    quantity,
    source_quantity: row.quantity,
    quantity_adjustment_source: "refunded_quantity"
  };
}

function itemNetQuantity(row: Record<string, unknown>) {
  const explicitNetQuantity = firstFiniteNumber(row.net_quantity, row.quantity_net, row.net_units, row.units_sold_net);
  if (explicitNetQuantity !== null) return Math.max(0, explicitNetQuantity);

  const quantity = numberValue(row.quantity, 1);
  const refundedQuantity = firstFiniteNumber(row.refunded_quantity, row.refund_quantity, row.returned_quantity);
  if (refundedQuantity !== null && !quantityAlreadyNet(row)) return Math.max(0, quantity - refundedQuantity);

  return quantity;
}

function quantityAlreadyNet(row: Record<string, unknown>) {
  return truthyFlag(row.quantity_is_net) ||
    truthyFlag(row.is_net_quantity) ||
    hasValue(row.net_quantity) ||
    hasValue(row.quantity_net) ||
    hasValue(row.net_units) ||
    hasValue(row.units_sold_net);
}

function hasExplicitCommerceRevenue(row: Record<string, unknown>) {
  return [
    computedOrderNetRevenue(row),
    row.net_revenue,
    row.netRevenue,
    row.net_amount,
    row.netAmount,
    row.net_total,
    row.netTotal,
    row.total_paid
  ].some((value) => value !== null && hasFiniteNumber(value));
}

function computedOrderNetRevenue(row: Record<string, unknown>) {
  if (firstString(row.revenue_allocation_source) === "order_net_revenue") {
    const allocatedNet = firstFiniteNumber(row.net_revenue, row.net_sales, row.revenue);
    if (allocatedNet !== null) return roundCurrency(Math.max(0, allocatedNet));
  }

  const paymentStatus = normalizeStatus(firstString(row.financial_status, row.payment_status, row.status, row.order_status));
  if (paymentStatus === "partially_paid") {
    const paid = paidAmount(row);
    if (paid === null) return null;
    return roundCurrency(Math.max(0, paid - firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund)));
  }

  const grossSales = firstFiniteNumber(row.gross_sales, row.grossSales);
  if (grossSales === null) {
    const explicitNet = firstFiniteNumber(row.net_revenue, row.netRevenue, row.net_amount, row.netAmount, row.net_total, row.netTotal);
    if (explicitNet !== null) return roundCurrency(Math.max(0, explicitNet));

    if (!hasRevenueAdjustment(row)) return null;

    const legacyPreRefundRevenue = firstFiniteNumber(row.revenue, row.sales, row.gmv, row.amount, row.total, row.subtotal, row.net_sales, row.netSales);
    if (legacyPreRefundRevenue === null) return null;

    return roundCurrency(
      Math.max(0, legacyPreRefundRevenue -
        firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
        firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund))
    );
  }
  return roundCurrency(
    Math.max(0, grossSales -
      firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
      firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund))
  );
}

function lineItemRevenueBasisForAllocation(row: Record<string, unknown>, quantity = numberValue(row.quantity, 1)) {
  return firstNumber(
    computedLineItemNetRevenue(row),
    row.net_revenue,
    row.netRevenue,
    row.net_amount,
    row.netAmount,
    row.net_total,
    row.netTotal,
    row.net_sales,
    row.gross_sales,
    row.revenue,
    firstNumber(row.price, row.unit_price) * quantity
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function orderRevenue(row: Record<string, unknown>) {
  return firstNumber(
    computedOrderNetRevenue(row),
    row.net_revenue,
    row.netRevenue,
    row.net_amount,
    row.netAmount,
    row.net_total,
    row.netTotal,
    row.total_paid,
    row.net_sales,
    row.revenue,
    row.gross_sales
  );
}

function lineItemRevenue(row: Record<string, unknown>, quantity = numberValue(row.quantity, 1)) {
  return roundCurrency(firstNumber(
    computedLineItemNetRevenue(row),
    row.net_revenue,
    row.netRevenue,
    row.net_amount,
    row.netAmount,
    row.net_total,
    row.netTotal,
    row.net_sales,
    row.revenue,
    row.gross_sales,
    firstNumber(row.price, row.unit_price) * quantity
  ));
}

function computedLineItemNetRevenue(row: Record<string, unknown>) {
  if (firstString(row.revenue_allocation_source) === "order_net_revenue") {
    const allocatedNet = firstFiniteNumber(row.net_revenue, row.net_sales, row.revenue);
    if (allocatedNet !== null) return roundCurrency(Math.max(0, allocatedNet));
  }

  const paymentStatus = normalizeStatus(firstString(row.financial_status, row.payment_status, row.status, row.order_status));
  if (paymentStatus === "partially_paid") {
    const paid = paidAmount(row);
    if (paid === null) return null;
    return roundCurrency(Math.max(0, paid - firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund)));
  }

  const grossSales = firstFiniteNumber(row.gross_sales, row.grossSales);
  if (grossSales === null) {
    const explicitNet = firstFiniteNumber(row.net_revenue, row.netRevenue, row.net_amount, row.netAmount, row.net_total, row.netTotal);
    if (explicitNet !== null) return roundCurrency(Math.max(0, explicitNet));

    if (!hasRevenueAdjustment(row)) return null;

    const legacyPreRefundRevenue = firstFiniteNumber(row.revenue, row.sales, row.gmv, row.amount, row.total, row.subtotal, row.net_sales, row.netSales);
    if (legacyPreRefundRevenue === null) return null;

    return roundCurrency(
      Math.max(0, legacyPreRefundRevenue -
        firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
        firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund))
    );
  }
  return roundCurrency(
    Math.max(0, grossSales -
      firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
      firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund))
  );
}

function paidAmount(row: Record<string, unknown>) {
  return firstFiniteNumber(row.paid_amount, row.amount_paid, row.total_paid, row.captured_amount, row.net_payment);
}

function hasPositiveCommerceRevenueOrPayment(row: Record<string, unknown>) {
  const paid = paidAmount(row);
  if (paid !== null) return paid > 0;
  return orderRevenue(row) > 0;
}

function adSpendValue(row: Record<string, unknown>) {
  return firstNumber(
    row.spend,
    row.ad_spend,
    row.ads_spend,
    row.amount_spent,
    row.amountSpent,
    row["amount spent"],
    row["Amount spent"],
    row.total_spend,
    row.total_ad_spend,
    row.ad_cost,
    row.cost
  );
}

function hasRevenueAdjustment(row: Record<string, unknown>) {
  return hasFiniteNumber(row.discount) ||
    hasFiniteNumber(row.discount_amount) ||
    hasFiniteNumber(row.total_discount) ||
    hasFiniteNumber(row.discounts) ||
    hasFiniteNumber(row.refund) ||
    hasFiniteNumber(row.refund_amount) ||
    hasFiniteNumber(row.refunded_amount) ||
    hasFiniteNumber(row.total_refund);
}

function summarizeOrderStatuses(sourceOrders: Array<Record<string, unknown>>, paidOrders: Array<Record<string, unknown>>) {
  const paidOrderIds = new Set(paidOrders.map(sourceOrderIdentity).filter(Boolean));
  const nonTestOrders = sourceOrders.filter((row) => !truthyFlag(row.is_test) && !truthyFlag(row.test));
  const cancelledOrders = nonTestOrders.filter((row) => !isValidOrder(row));
  const fullyRefundedOrders = nonTestOrders.filter((row) => {
    const status = normalizeStatus(firstString(row.financial_status, row.payment_status, row.status, row.order_status));
    return status === "refunded" || (computedOrderNetRevenue(row) === 0 && firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund) > 0);
  });
  const netRevenueOrders = paidOrders.filter((row) => orderRevenue(row) > 0);

  return {
    orders_created: new Set(sourceOrders.map(sourceOrderIdentity).filter(Boolean)).size,
    paid_orders: paidOrderIds.size,
    net_revenue_orders: new Set(netRevenueOrders.map(sourceOrderIdentity).filter(Boolean)).size,
    cancelled_orders: new Set(cancelledOrders.map(sourceOrderIdentity).filter(Boolean)).size,
    fully_refunded_orders: new Set(fullyRefundedOrders.map(sourceOrderIdentity).filter(Boolean)).size
  };
}

function observedDateWindow(rows: Array<Record<string, unknown>>) {
  const days = rows
    .map((row) => dayKey(firstString(row.order_date, row.date, row.created_at, row.createdAt, row.processed_at)))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (!days.length) return null;
  return { start: days[0], end: days[days.length - 1] };
}

function filterAdsToOrderWindow(rows: Array<Record<string, unknown>>, window: { start: string; end: string } | null) {
  if (!window) return rows;
  return rows.filter((row) => {
    const date = dayKey(firstString(row.date, row.ad_date, row.report_date, row.day, row.created_at, row.createdAt));
    if (!date) return true;
    return date >= window.start && date <= window.end;
  });
}

function hasUsableInventorySignal(row: Record<string, unknown>) {
  return [
    row.stock_level,
    row.on_hand,
    row.inventory_quantity,
    row.available_stock,
    row.available,
    row.reserved_stock,
    row.inventory_value,
    row.inventoryValue,
    row.total_inventory_value,
    row.totalInventoryValue,
    row["Inventory Value"],
    row["Inventory value"],
    row["inventory value"],
    row["Total Inventory Value"],
    row["Total inventory value"],
    row["total inventory value"],
    row["inventory-value"],
    row.inventory_unit_cost,
    row.unit_cost,
    row.inventory_cost,
    row.inventoryAssetValue,
    row.inventory_asset_value,
    row.stock_value,
    row.stockValue,
    row.stock_asset_value,
    row.on_hand_value,
    row.total_value,
    row.totalValue,
    row.value
  ].some(hasFiniteNumber);
}

function firstNumber(...values: unknown[]) {
  return firstFiniteNumber(...values) ?? 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value).trim();
    if (text) return text;
  }
  return "";
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function numberValue(value: unknown, fallback = 0) {
  const number = numericValue(value);

  return Number.isFinite(number) ? number : fallback;
}

function hasFiniteNumber(value: unknown) {
  return Number.isFinite(numericValue(value));
}

function numericValue(value: unknown) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value);

  const normalized = value.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!normalized) return NaN;

  return Number(normalized);
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function truthyFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function normalizeStatus(value: unknown) {
  return stringValue(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? roundRatio(numerator / denominator) : 0;
}

function percentile(values: number[], quantile: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function topRevenueShare(values: number[], share: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => right - left);
  if (!sorted.length) return 0;
  const count = Math.max(1, Math.ceil(sorted.length * share));
  return safeRatio(sum(sorted.slice(0, count)), sum(sorted));
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}
