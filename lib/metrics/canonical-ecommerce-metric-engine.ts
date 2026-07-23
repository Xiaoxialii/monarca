import type { CanonicalDataset } from "@/lib/semantic/types";
import { calculateCostIntelligence } from "@/lib/cost/cost-intelligence-engine";
import { enrichOrderItemsWithCanonicalSku, normalizeProductSkuRows } from "@/lib/sku/sku-intelligence-engine";
import type { SkuAttributionMethod, SkuRoasStatus } from "@/lib/sku/sku-profit-allocation-engine";

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
  ad_cost_allocated: number;
  shipping_cost: number;
  platform_fee: number;
  payment_fee: number;
  fulfillment_cost: number;
  refund_amount: number;
  total_cost: number;
  net_profit: number;
  margin: number;
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
  ad_allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "none";
  ad_allocation_confidence: number;
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
  estimated_components: string[];
  estimated: boolean;
};

export type CanonicalEcommerceMetricOutput = {
  metrics: {
    core: {
      revenue: number;
      orders: number;
      aov: number;
      refund_rate: number;
      sku_revenue: SkuRevenueMetric[];
      product_performance: ProductPerformanceMetric[];
    };
    business: {
      gross_profit: number;
      net_profit: number;
      margin: number;
      cogs: number;
      ad_spend: number;
      shipping_cost: number;
      platform_fee: number;
      payment_fee: number;
      fulfillment_cost: number;
      refund_amount: number;
      total_cost: number;
      real_cost: number;
      estimated_cost: number;
      estimated_cost_ratio: number;
      cost_confidence: number;
      profit_confidence: number;
      missing_cost_fields: string[];
      estimated_components: string[];
      sku_unit_economics: SkuUnitEconomicsMetric[];
      sku_velocity: Array<{ sku: string; quantity: number; revenue: number }>;
    };
    growth: {
      revenue_growth_rate: number;
      order_growth_rate: number;
      sku_growth_rate: number;
      daily: TimeSeriesMetric[];
      weekly: TimeSeriesMetric[];
      monthly: TimeSeriesMetric[];
    };
    customer: {
      ltv: number;
      avg_order_value_per_customer: number;
      repeat_purchase_rate: number;
      customer_count: number;
      new_vs_returning_ratio: number;
      acquisition_cost: number;
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
      cohort_retention_7d: number;
      cohort_retention_30d: number;
      cohort_ltv_curve: Array<{ cohort_month: string; day_0: number; day_7: number; day_30: number; total_ltv: number }>;
      revenue_per_customer_segment: Array<{ segment: string; customers: number; revenue: number; share: number }>;
      profit_per_customer_segment: Array<{ segment: string; customers: number; profit: number; share: number }>;
      ads_cost_per_customer_segment: Array<{ segment: string; customers: number; ad_cost: number; share: number }>;
      ltv_cac_ratio: number;
      cac_by_cohort: Array<{ cohort_month: string; cac: number }>;
      payback_period_days: number | null;
    };
    ads: {
      roas: number;
      cac: number;
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
  };
};

type QualityAccumulator = {
  expected: number;
  present: number;
  missingFields: Set<string>;
  estimatedMetrics: Set<string>;
};

const COST_BENCHMARKS = {
  refundRate: 0.04
} as const;

export function computeCanonicalEcommerceMetrics(dataset: CanonicalDataset): CanonicalEcommerceMetricOutput {
  assertSupportedSchema(dataset);

  const quality: QualityAccumulator = {
    expected: 0,
    present: 0,
    missingFields: new Set(),
    estimatedMetrics: new Set()
  };

  const orders = dedupeBy(dataset.tables.ecommerce_orders ?? [], (row) => stringValue(row.order_id) || stringValue(row.canonical_key));
  const normalizedProducts = normalizeProductSkuRows(dataset.tables.ecommerce_products ?? []);
  const products = dedupeBy(normalizedProducts, (row) => stringValue(row.variant_id) || stringValue(row.product_id) || stringValue(row.canonical_key));
  const enrichedOrderItems = enrichOrderItemsWithCanonicalSku(dataset.tables.ecommerce_order_items ?? [], products);
  const orderItems = dedupeBy(enrichedOrderItems, (row) => stringValue(row.canonical_key) || [row.order_id, row.variant_id, row.product_id, row.sku].map(stringValue).join(":"));
  const refunds = dedupeBy(dataset.tables.ecommerce_refunds ?? [], (row) => stringValue(row.refund_id) || stringValue(row.canonical_key));
  const ads = dedupeBy(dataset.tables.ecommerce_ads ?? [], (row) => stringValue(row.ad_id) || stringValue(row.campaign_id) || stringValue(row.canonical_key));
  const customers = dedupeBy(dataset.tables.ecommerce_customers ?? [], (row) => stringValue(row.customer_id) || stringValue(row.canonical_key));
  const inventory = dedupeBy(dataset.tables.ecommerce_inventory ?? dataset.tables.inventory ?? [], (row) => [row.sku, row.warehouse_id, row.date].map(stringValue).join(":") || stringValue(row.canonical_key));

  trackCompleteness(quality, "ecommerce_orders", orders, ["order_id", "revenue"]);
  trackCompleteness(quality, "ecommerce_order_items", orderItems, ["sku", "price", "quantity"]);
  trackCompleteness(quality, "ecommerce_products", products, ["product_id", "product_name"]);
  trackCompleteness(quality, "ecommerce_refunds", refunds, ["amount"]);
  if (ads.length) trackCompleteness(quality, "ecommerce_ads", ads, ["spend"]);
  if (inventory.length) trackCompleteness(quality, "ecommerce_inventory", inventory, ["sku", "stock_level"]);

  const revenue = roundCurrency(sum(orders.map(orderRevenue)));
  const orderCount = new Set(orders.map((row) => stringValue(row.order_id)).filter(Boolean)).size;
  const actualRefundAmount = roundCurrency(sum(refunds.map((row) => firstNumber(row.amount, row.refund_amount))));
  const effectiveRefundAmount = refunds.length ? actualRefundAmount : roundCurrency(revenue * COST_BENCHMARKS.refundRate);
  const skuRevenue = buildSkuRevenue(orderItems, quality);
  const productPerformance = buildProductPerformance(orderItems, products, quality);
  const business = buildBusinessMetrics({ revenue, refundAmount: effectiveRefundAmount, refunds, orderItems, products, orders, ads, inventory, quality });
  const growth = buildGrowthMetrics({ orders, orderItems, quality });
  const attribution = buildAttributionMetrics({ orders, orderItems, ads, skuUnitEconomics: business.sku_unit_economics, revenue, quality });
  const customer = buildCustomerMetrics({ orders, customers, orderCount, adSpend: business.ad_spend, netProfit: business.net_profit, quality });
  const adsMetrics = buildAdsMetrics({
    revenue,
    orderCount,
    adSpend: business.ad_spend,
    customerCount: customer.customer_count,
    newCustomers: newCustomerCount(orders, customers),
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
        orders: orderCount,
        aov: orderCount ? roundCurrency(revenue / orderCount) : 0,
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
      orders: orderCount,
      aov: orderCount ? roundCurrency(revenue / orderCount) : 0,
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
      }
    }
  };
}

export const runCanonicalEcommerceMetricEngine = computeCanonicalEcommerceMetrics;

function buildSkuRevenue(rows: Array<Record<string, unknown>>, quality: QualityAccumulator) {
  const bySku = new Map<string, SkuRevenueMetric>();

  for (const row of rows) {
    const sku = stringValue(row.sku);
    if (!sku) continue;

    const price = numberValue(row.price);
    const quantity = numberValue(row.quantity, 1);
    const estimated = !hasFiniteNumber(row.price) || !hasFiniteNumber(row.quantity);
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
    current.revenue = roundCurrency(current.revenue + (price * quantity));
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

    const price = numberValue(row.price);
    const quantity = numberValue(row.quantity, 1);
    const estimated = !hasFiniteNumber(row.price) || !hasFiniteNumber(row.quantity);
    if (estimated) quality.estimatedMetrics.add("product_performance");

    const current = byProduct.get(productId) ?? {
      product_id: productId,
      product_name: productNames.get(productId) || undefined,
      revenue: 0,
      quantity: 0,
      estimated: false
    };
    current.revenue = roundCurrency(current.revenue + (price * quantity));
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
    gross_profit: cost.totals.gross_profit,
    net_profit: cost.totals.net_profit,
    margin: cost.totals.margin,
    cogs: cost.totals.cogs,
    ad_spend: cost.totals.ad_spend,
    shipping_cost: cost.totals.shipping_cost,
    platform_fee: cost.totals.platform_fee,
    payment_fee: cost.totals.payment_fee,
    fulfillment_cost: cost.totals.fulfillment_cost,
    refund_amount: cost.totals.refund_amount,
    total_cost: cost.totals.total_cost,
    real_cost: roundCurrency(Math.max(0, cost.totals.total_cost - cost.totals.estimated_cost)),
    estimated_cost: cost.totals.estimated_cost,
    estimated_cost_ratio: cost.data_quality.estimated_cost_ratio,
    cost_confidence: cost.data_quality.cost_confidence,
    profit_confidence: cost.data_quality.profit_confidence,
    missing_cost_fields: cost.data_quality.missing_cost_fields,
    estimated_components: cost.data_quality.estimated_components,
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

  if (daily.length < 2) {
    quality.estimatedMetrics.add("growth.revenue_growth_rate");
    quality.estimatedMetrics.add("growth.order_growth_rate");
    quality.estimatedMetrics.add("growth.sku_growth_rate");
  }

  return {
    revenue_growth_rate: latestGrowthRate(daily, "revenue"),
    order_growth_rate: latestGrowthRate(daily, "orders"),
    sku_growth_rate: latestGrowthRate(daily, "sku_count"),
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
  quality: QualityAccumulator;
}) {
  const { orders, customers, orderCount, adSpend, netProfit, quality } = input;
  const orderIdsByCustomer = new Map<string, Set<string>>();
  const revenueByCustomer = new Map<string, number>();
  const orderDatesByCustomer = new Map<string, string[]>();

  for (const order of orders) {
    const customerId = explicitCustomerIdFromOrder(order);
    if (!customerId) continue;

    const orderIds = orderIdsByCustomer.get(customerId) ?? new Set<string>();
    const orderId = stringValue(order.order_id);
    if (orderId) orderIds.add(orderId);
    orderIdsByCustomer.set(customerId, orderIds);
    revenueByCustomer.set(customerId, roundCurrency((revenueByCustomer.get(customerId) ?? 0) + orderRevenue(order)));
    const date = dayKey(firstString(order.order_date, order.created_at, order.date, order.createdAt));
    if (date) {
      const dates = orderDatesByCustomer.get(customerId) ?? [];
      dates.push(date);
      orderDatesByCustomer.set(customerId, dates);
    }
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

  const returningCustomers = Array.from(orderIdsByCustomer.values()).filter((orderIds) => orderIds.size > 1).length;
  const newCustomers = newCustomerCount(orders, customers);
  const ltvValues = Array.from(customerIds).map((customerId) => revenueByCustomer.get(customerId) ?? firstNumber(customers.find((row) => stringValue(row.customer_id) === customerId)?.total_spent));
  const activeCustomerCount = Array.from(orderIdsByCustomer.values()).filter((orderIds) => orderIds.size > 0).length;
  const inactiveCustomers = Math.max(0, customerCount - activeCustomerCount);
  const lifecycle = customerLifecycleCounts({ customerIds, orderDatesByCustomer });
  const cohort = buildCustomerCohorts({ customerIds, revenueByCustomer, orderDatesByCustomer, adSpend });
  const segmentRows = customerValueSegments({
    customerIds,
    revenueByCustomer,
    totalRevenue: eventLevelCustomerRevenue,
    totalProfit: netProfit,
    totalAdSpend: adSpend
  });
  const ltvCacRatio = safeRatio(customerLifetimeValue, safeRatio(adSpend, newCustomers));
  const paybackPeriodDays = customerLifetimeValue > 0 && adSpend > 0 && newCustomers > 0
    ? roundRatio((safeRatio(adSpend, newCustomers) / customerLifetimeValue) * Math.max(1, lifecycle.avgCustomerLifetimeDays))
    : null;

  return {
    ltv: roundCurrency(customerLifetimeValue),
    avg_order_value_per_customer: customerCount ? roundCurrency(eventLevelCustomerRevenue / customerCount) : 0,
    repeat_purchase_rate: safeRatio(returningCustomers, customerCount),
    customer_count: customerCount,
    new_vs_returning_ratio: safeRatio(newCustomers, customerCount || orderCount),
    acquisition_cost: safeRatio(adSpend, newCustomers),
    median_ltv: roundCurrency(percentile(ltvValues, 0.5)),
    p90_ltv: roundCurrency(percentile(ltvValues, 0.9)),
    p95_ltv: roundCurrency(percentile(ltvValues, 0.95)),
    p99_ltv: roundCurrency(percentile(ltvValues, 0.99)),
    top_10_percent_revenue_share: topRevenueShare(ltvValues, 0.1),
    top_1_percent_revenue_share: topRevenueShare(ltvValues, 0.01),
    active_customers: activeCustomerCount,
    inactive_customers: inactiveCustomers,
    avg_orders_per_customer: safeRatio(orderCount, customerCount),
    purchase_frequency: safeRatio(orderCount, activeCustomerCount || customerCount),
    new_customers: newCustomers,
    dormant_customers: lifecycle.dormantCustomers,
    churned_customers: lifecycle.churnedCustomers,
    avg_customer_lifetime_days: lifecycle.avgCustomerLifetimeDays,
    cohort_by_first_purchase_month: cohort.cohorts,
    cohort_retention_7d: cohort.retention7d,
    cohort_retention_30d: cohort.retention30d,
    cohort_ltv_curve: cohort.ltvCurve,
    revenue_per_customer_segment: segmentRows.revenue,
    profit_per_customer_segment: segmentRows.profit,
    ads_cost_per_customer_segment: segmentRows.adCost,
    ltv_cac_ratio: ltvCacRatio,
    cac_by_cohort: cohort.cacByCohort,
    payback_period_days: paybackPeriodDays
  };
}

function buildAdsMetrics(input: {
  revenue: number;
  orderCount: number;
  adSpend: number;
  customerCount: number;
  newCustomers: number;
  attributionCoverage: number;
  quality: QualityAccumulator;
}) {
  const { revenue, orderCount, adSpend, newCustomers, attributionCoverage, quality } = input;

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
  if (adSpend > 0 && !newCustomers) {
    quality.missingFields.add("dim_customers.is_new_customer");
    quality.estimatedMetrics.add("ads.cac");
  }

  return {
    roas: attributionCoverage > 0 ? safeRatio(revenue, adSpend) : 0,
    cac: safeRatio(adSpend, newCustomers),
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

  for (const customerId of input.customerIds) {
    const dates = [...(input.orderDatesByCustomer.get(customerId) ?? [])].sort();
    if (!dates.length) continue;

    const first = new Date(`${dates[0]}T00:00:00.000Z`);
    const last = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
    const lifetimeDays = Math.max(1, daysBetween(first, last) + 1);
    lifetimeTotal += lifetimeDays;
    lifetimeCount += 1;

    if (latestDate) {
      const daysSinceLastOrder = daysBetween(last, latestDate);
      if (daysSinceLastOrder > 90) churnedCustomers += 1;
      else if (daysSinceLastOrder > 30) dormantCustomers += 1;
    }
  }

  return {
    dormantCustomers,
    churnedCustomers,
    avgCustomerLifetimeDays: lifetimeCount ? roundRatio(lifetimeTotal / lifetimeCount) : 0
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
  const buckets = [
    { segment: "Top 1%", rows: customers.slice(0, Math.max(1, Math.ceil(count * 0.01))) },
    { segment: "Top 10%", rows: customers.slice(0, Math.max(1, Math.ceil(count * 0.1))) },
    { segment: "Middle 40%", rows: customers.slice(Math.max(1, Math.ceil(count * 0.1)), Math.max(1, Math.ceil(count * 0.5))) },
    { segment: "Bottom 50%", rows: customers.slice(Math.max(1, Math.ceil(count * 0.5))) }
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
  const adSpend = roundCurrency(sum(ads.map((row) => firstNumber(row.spend, row.ad_spend))));
  const campaignAdSpend = new Map<string, number>();
  for (const ad of ads) {
    const campaignId = firstString(ad.campaign_id, ad.utm_campaign, ad.ad_id);
    if (!campaignId) continue;
    campaignAdSpend.set(campaignId, roundCurrency((campaignAdSpend.get(campaignId) ?? 0) + firstNumber(ad.spend, ad.ad_spend)));
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

function newCustomerCount(orders: Array<Record<string, unknown>>, customers: Array<Record<string, unknown>>) {
  const orderIdsByCustomer = new Map<string, Set<string>>();
  for (const order of orders) {
    const customerId = explicitCustomerIdFromOrder(order);
    if (!customerId) continue;

    const orderIds = orderIdsByCustomer.get(customerId) ?? new Set<string>();
    const orderId = stringValue(order.order_id);
    if (orderId) orderIds.add(orderId);
    orderIdsByCustomer.set(customerId, orderIds);
  }

  const explicitNewCustomers = customers.filter((customer) => {
    if (typeof customer.is_new_customer === "boolean") return customer.is_new_customer;
    const totalOrders = firstFiniteNumber(customer.total_orders, customer.order_count);
    return totalOrders !== null && totalOrders <= 1;
  }).length;

  if (explicitNewCustomers) return explicitNewCustomers;

  return Array.from(orderIdsByCustomer.values()).filter((orderIds) => orderIds.size <= 1).length;
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
  if (rows.length < 2) return 0;

  const current = rows[rows.length - 1][field];
  const previous = rows[rows.length - 2][field];
  return safeRatio(current - previous, previous);
}

function dayKey(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return "";

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

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function orderRevenue(row: Record<string, unknown>) {
  return firstNumber(row.revenue, row.net_sales, row.total_paid, row.gross_sales);
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
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function hasFiniteNumber(value: unknown) {
  return Number.isFinite(Number(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
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
