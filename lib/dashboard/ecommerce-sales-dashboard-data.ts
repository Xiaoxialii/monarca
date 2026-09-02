import type { CanonicalDataset } from "@/lib/semantic/types";
import { filterCanonicalDatasetForDateRange } from "@/lib/analytics/analysis-period-engine";
import { validateAnalyticsMetrics, type AnalyticsValidationResult } from "@/lib/analytics/analytics-validation-engine";
import { computeCanonicalEcommerceMetrics, type CanonicalEcommerceMetricOutput } from "@/lib/metrics/canonical-ecommerce-metric-engine";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "@/lib/profit/canonical-profitability-engine";
import { ANALYTICS_METRIC_ENGINE_VERSION } from "@/lib/report-metric-cache";
import { enrichOrderItemsWithCanonicalSku, normalizeProductSkuRows } from "@/lib/sku/sku-intelligence-engine";
import { buildDecisionIntelligenceReportV1, type DecisionIntelligenceReportV1 } from "@/lib/decision-intelligence/decision-intelligence-engine";
import type { ReportDateRangeInput } from "@/lib/report-date-range";

export type EcommerceDashboardDecisionMode = "full" | "sku";

export type EcommerceSalesDashboardData = {
  metrics: CanonicalEcommerceMetricOutput["metrics"] & {
    total_sku_count: number;
  };
  quality: {
    confidence_score: number;
    data_coverage: number;
    missing_fields: string[];
    estimated_metrics: string[];
  };
  trends: {
    daily_revenue: TimeSeriesPoint[];
    weekly_revenue: TimeSeriesPoint[];
    monthly_revenue: TimeSeriesPoint[];
    growth_rate: number | null;
  };
  sku_analysis: {
    top_skus: Array<{ sku: string; revenue: number; quantity: number; share: number; estimated: boolean }>;
    product_performance: Array<{ product_id: string; product_name?: string; revenue: number; quantity: number; share: number; estimated: boolean }>;
    catalog_preview: Array<{ product_name: string; sku: string; variant_id: string; product_id: string }>;
    concentration: {
      top_sku_share: number | null;
      top_product_share: number | null;
      risk_level: "low" | "medium" | "high" | "unknown";
    };
  };
  refund_insights: {
    refund_rate: number;
    refund_amount: number;
    refund_trend: TimeSeriesPoint[];
    top_refunded_products: Array<{ product_id: string; product_name?: string; sku?: string; refund_amount: number; quantity: number }>;
  };
  catalog_health: {
    product_count: number;
    variant_count: number;
    sku_count: number;
    tracked_sku_count: number;
    untracked_sku_count: number;
    catalog_row_count: number;
    sku_density: number | null;
    price_distribution: Array<{ bucket: string; count: number }>;
    product_concentration: number | null;
  };
  decision_report: DecisionIntelligenceReportV1;
  analytics_validation: AnalyticsValidationResult;
  metadata: {
    schema_version: "ecommerce_canonical_v1";
    source_platforms: string[];
    computed_at: string;
    field_mappings?: Array<{
      canonical_field: string;
      source_column: string;
      source_field?: string;
      source_file?: string;
      source_system?: string;
      source_file_type?: string;
      target_entity?: string;
      mapping_confidence: number;
      mapping_method?: string;
      requires_confirmation?: boolean;
      status?: string;
    }>;
    date_range?: {
      preset: string;
      startDate?: string | null;
      endDate?: string | null;
    };
    filtered_row_counts?: Record<string, number>;
    metric_engine_version?: string;
    profitability_engine_version?: string;
  };
};

export type TimeSeriesPoint = {
  period: string;
  revenue: number;
  refund_amount?: number;
};

type CanonicalRow = Record<string, unknown>;

export function buildEcommerceSalesDashboardData(
  dataset: CanonicalDataset,
  options: { decisionMode?: EcommerceDashboardDecisionMode; dateRange?: Partial<ReportDateRangeInput> | null } = {}
): EcommerceSalesDashboardData {
  const filtered = filterCanonicalDatasetForDateRange(dataset, options.dateRange);
  const metricDataset = adaptCanonicalDatasetForMetrics(filtered.dataset);
  const metricResult = computeCanonicalEcommerceMetrics(metricDataset);
  const orders = metricDataset.tables.ecommerce_orders;
  const items = metricDataset.tables.ecommerce_order_items;
  const products = metricDataset.tables.ecommerce_products;
  const refunds = metricDataset.tables.ecommerce_refunds;
  const productSkuValues = products.map((row) => stringValue(row.sku)).filter(Boolean);
  const trackedSkuCount = new Set(productSkuValues.filter((sku) => !isUntrackedSku(sku))).size;
  const untrackedSkuCount = new Set(productSkuValues.filter(isUntrackedSku)).size;
  const productCount = uniqueCatalogProductCount(products);
  const variantCount = uniqueCatalogVariantCount(products);
  const totalSkuCount = uniqueSkuCountAcrossSources(metricDataset.tables);
  const productRevenueTotal = metricResult.metrics.product_performance.reduce((sum, row) => sum + row.revenue, 0);
  const skuRevenueTotal = metricResult.metrics.sku_revenue.reduce((sum, row) => sum + row.revenue, 0);
  const topSkuRevenue = metricResult.metrics.sku_revenue[0]?.revenue ?? 0;
  const topProductRevenue = metricResult.metrics.product_performance[0]?.revenue ?? 0;
  const topSkuShare = skuRevenueTotal > 0 ? roundRatio(topSkuRevenue / skuRevenueTotal) : null;
  const topProductShare = productRevenueTotal > 0 ? roundRatio(topProductRevenue / productRevenueTotal) : null;
  const metrics = {
    ...metricResult.metrics,
    total_sku_count: totalSkuCount
  };
  const analyticsValidation = validateAnalyticsMetrics({
    dataset: metricDataset,
    metrics: metricResult.metrics
  });
  const decisionReport = {
    ...buildDecisionIntelligenceReportV1({
      ...metricResult,
      metrics,
      decisionMode: options.decisionMode ?? "full"
    }),
    analytics_validation: analyticsValidation
  } as DecisionIntelligenceReportV1;

  return {
    metrics,
    quality: {
      confidence_score: metricResult.metadata.confidence_score,
      data_coverage: metricResult.metadata.data_coverage,
      missing_fields: metricResult.metadata.missing_fields,
      estimated_metrics: metricResult.metadata.estimated_metrics
    },
    trends: {
      daily_revenue: aggregateRevenueByPeriod(orders, "day"),
      weekly_revenue: aggregateRevenueByPeriod(orders, "week"),
      monthly_revenue: aggregateRevenueByPeriod(orders, "month"),
      growth_rate: growthRate(aggregateRevenueByPeriod(orders, "day"))
    },
    sku_analysis: {
      top_skus: metricResult.metrics.sku_revenue.slice(0, 10).map((row) => ({
        ...row,
        share: skuRevenueTotal > 0 ? roundRatio(row.revenue / skuRevenueTotal) : 0
      })),
      product_performance: metricResult.metrics.product_performance.slice(0, 10).map((row) => ({
        ...row,
        share: productRevenueTotal > 0 ? roundRatio(row.revenue / productRevenueTotal) : 0
      })),
      catalog_preview: products.slice(0, 10).map((row) => ({
        product_name: firstString(row.product_name) || firstString(row.product_id) || "Unknown product",
        sku: firstString(row.sku) || "Untracked SKU",
        variant_id: firstString(row.variant_id) || "n/a",
        product_id: firstString(row.product_id) || "n/a"
      })),
      concentration: {
        top_sku_share: topSkuShare,
        top_product_share: topProductShare,
        risk_level: concentrationRisk(topSkuShare ?? topProductShare)
      }
    },
    refund_insights: {
      refund_rate: metricResult.metrics.refund_rate,
      refund_amount: roundCurrency(refunds.reduce((sum, row) => sum + numberValue(row.amount), 0)),
      refund_trend: aggregateRefundsByPeriod(refunds, "day"),
      top_refunded_products: topRefundedProducts(refunds, items, products)
    },
    catalog_health: {
      product_count: productCount,
      variant_count: variantCount,
      sku_count: totalSkuCount,
      tracked_sku_count: trackedSkuCount,
      untracked_sku_count: untrackedSkuCount,
      catalog_row_count: products.length,
      sku_density: productCount ? roundRatio(totalSkuCount / productCount) : null,
      price_distribution: priceDistribution(products, items),
      product_concentration: topProductShare
    },
    decision_report: decisionReport,
    analytics_validation: analyticsValidation,
    metadata: {
      schema_version: metricResult.metadata.schema_version,
      source_platforms: metricResult.metadata.source_platforms,
      computed_at: metricResult.metadata.computed_at,
      field_mappings: dataset.metadata.field_mappings?.map((mapping) => ({
        ...mapping,
        source_field: mapping.source_column,
        source_file: sourceFileLabel(mapping.source_system),
        status: mapping.requires_confirmation ? "NEEDS_CONFIRMATION" : "AVAILABLE"
      })),
      date_range: {
        preset: filtered.dateRange.preset,
        startDate: filtered.dateRange.startDate ?? null,
        endDate: filtered.dateRange.endDate ?? null
      },
      filtered_row_counts: filtered.filteredRowCounts,
      metric_engine_version: ANALYTICS_METRIC_ENGINE_VERSION,
      profitability_engine_version: CANONICAL_PROFITABILITY_ENGINE_VERSION
    }
  };
}

export function emptyEcommerceCanonicalDataset(sourcePlatforms: string[] = []): CanonicalDataset {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: [],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    },
    metadata: {
      source_platforms: sourcePlatforms,
      normalized_at: "1970-01-01T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: 0,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0
    }
  };
}

export function adaptCanonicalDatasetForMetrics(dataset: CanonicalDataset): CanonicalDataset {
  const shouldSpreadSingleMonthOrders = shouldSpreadOrdersAcrossMonth(dataset.tables.ecommerce_orders);
  const ecommerceProducts = normalizeProductSkuRows(dataset.tables.ecommerce_products.map((row) => ({
    ...row,
    platform: canonicalPlatform(row),
    product_name: firstString(row.product_name),
    product_id: firstString(row.product_id, row.variant_id),
    variant_id: firstString(row.variant_id),
    price: firstNumber(row.price, row.unit_price),
    sku: firstString(row.sku)
  })));
  const ecommerceOrderItems = enrichOrderItemsWithCanonicalSku(dataset.tables.ecommerce_order_items.map((row) => {
    const quantity = firstNumber(row.quantity) || 1;
    const price = firstNumber(row.price, row.unit_price, safeDivide(rowRevenue(row), quantity));

    return {
      ...row,
      platform: canonicalPlatform(row),
      quantity,
      price,
      product_name: firstString(row.product_name),
      product_id: firstString(row.product_id),
      variant_id: firstString(row.variant_id),
      sku: firstString(row.sku)
    };
  }), ecommerceProducts);

  return {
    ...dataset,
    tables: {
      ecommerce_orders: dataset.tables.ecommerce_orders.map((row, index) => {
        const orderDate = firstString(row.order_date, row.created_at_source, row.processed_at_source);
        const revenue = rowRevenue(row);
        return {
          ...row,
          platform: canonicalPlatform(row),
          revenue,
          net_revenue: revenue,
          order_date: shouldSpreadSingleMonthOrders ? spreadMonthDate(orderDate, index) : orderDate,
          currency: firstString(row.currency),
          status: firstString(row.status, row.order_status, row.financial_status)
        };
      }),
      ecommerce_order_items: ecommerceOrderItems,
      ecommerce_products: ecommerceProducts,
      ecommerce_customers: dataset.tables.ecommerce_customers.map((row) => ({
        ...row,
        platform: canonicalPlatform(row)
      })),
      ecommerce_refunds: dataset.tables.ecommerce_refunds.map((row) => ({
        ...row,
        platform: canonicalPlatform(row),
        amount: firstNumber(row.amount, row.refund_amount),
        refund_date: firstString(row.refund_date, row.created_at_source),
        reason: firstString(row.reason, row.refund_reason)
      })),
      ecommerce_ads: (dataset.tables.ecommerce_ads ?? []).map((row) => ({
        ...row,
        platform: canonicalPlatform(row),
        spend: adSpendValue(row),
        impressions: firstNumber(row.impressions),
        clicks: firstNumber(row.clicks),
        conversions: firstNumber(row.conversions),
        attribution_revenue: firstNumber(row.attribution_revenue, row.purchase_value, row.revenue),
        date: firstString(row.date, row.month)
      })),
      ecommerce_inventory: ((dataset.tables.ecommerce_inventory ?? dataset.tables.inventory ?? []) as CanonicalRow[]).map((row) => {
        const stockLevel = firstFiniteNumber(row.stock_level, row.on_hand, row.inventory_quantity, row.available_stock, row.available);
        const availableStock = firstFiniteNumber(row.available_stock, row.available, row.stock_level, row.on_hand, row.inventory_quantity);
        const reservedStock = firstFiniteNumber(row.reserved_stock, row.reserved);
        const value = firstInventoryValue(row);

        const snapshotDate = firstString(
          row.snapshot_date,
          row.snapshotDate,
          row["Snapshot Date"],
          row["Snapshot date"],
          row["snapshot date"],
          row.as_of_date,
          row.asOfDate,
          row["As of Date"],
          row["as of date"],
          row.report_as_of_date,
          row.date,
          row.month
        );

        return {
          ...row,
          platform: canonicalPlatform(row),
          sku: firstString(row.sku),
          warehouse_id: firstString(row.warehouse_id, row.warehouse),
          ...(stockLevel !== null ? { stock_level: stockLevel } : {}),
          ...(availableStock !== null ? { available_stock: availableStock, available: availableStock } : {}),
          ...(reservedStock !== null ? { reserved_stock: reservedStock } : {}),
          ...(value !== null ? { inventory_value: value, inventory_cost: value } : {}),
          reorder_point: firstNumber(row.reorder_point),
          fulfillment_days: firstNumber(row.fulfillment_days, row.fulfillment_time, row.fulfillment_time_days),
          date: snapshotDate,
          snapshot_date: snapshotDate
        };
      })
    },
    metadata: {
      ...dataset.metadata,
      source_platforms: dataset.metadata?.source_platforms?.length
        ? dataset.metadata.source_platforms
        : Array.from(new Set(dataset.tables.ecommerce_orders.map(canonicalPlatform).filter(Boolean)))
    }
  };
}

function aggregateRevenueByPeriod(rows: CanonicalRow[], granularity: "day" | "week" | "month") {
  const map = new Map<string, number>();

  for (const row of rows) {
    const period = periodKey(firstString(row.order_date), granularity);
    if (!period) continue;
    map.set(period, roundCurrency((map.get(period) ?? 0) + rowRevenue(row)));
  }

  return Array.from(map.entries())
    .map(([period, revenue]) => ({ period, revenue }))
    .sort((left, right) => left.period.localeCompare(right.period));
}

function shouldSpreadOrdersAcrossMonth(rows: CanonicalRow[]) {
  if (rows.length <= 31) return false;

  const dates = new Set(
    rows
      .map((row) => firstString(row.order_date, row.created_at_source, row.processed_at_source))
      .filter(Boolean)
  );
  if (dates.size !== 1) return false;

  const [date] = Array.from(dates);
  return /^\d{4}-\d{2}-01$/.test(date);
}

function spreadMonthDate(date: string, index: number) {
  const match = /^(\d{4})-(\d{2})-01$/.exec(date);
  if (!match) return date;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = (index % daysInMonth) + 1;
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
}

function sourceFileLabel(sourceSystem?: string) {
  const normalized = String(sourceSystem ?? "").toLowerCase();
  if (normalized === "meta_ads" || normalized === "meta" || normalized === "facebook_ads") return "Meta Ads";
  if (normalized === "google_ads") return "Google Ads";
  if (normalized === "amazon_ads") return "Amazon Ads";
  if (normalized === "shopify_ads") return "Shopify Ads";
  return sourceSystem || "Uploaded file";
}

function aggregateRefundsByPeriod(rows: CanonicalRow[], granularity: "day" | "week" | "month") {
  const map = new Map<string, number>();

  for (const row of rows) {
    const period = periodKey(firstString(row.refund_date), granularity);
    if (!period) continue;
    map.set(period, roundCurrency((map.get(period) ?? 0) + numberValue(row.amount)));
  }

  return Array.from(map.entries())
    .map(([period, refund_amount]) => ({ period, revenue: refund_amount, refund_amount }))
    .sort((left, right) => left.period.localeCompare(right.period));
}

function topRefundedProducts(refunds: CanonicalRow[], items: CanonicalRow[], products: CanonicalRow[]) {
  const itemsByOrder = new Map<string, CanonicalRow[]>();
  for (const item of items) {
    const orderId = stringValue(item.order_id);
    if (!orderId) continue;
    itemsByOrder.set(orderId, [...(itemsByOrder.get(orderId) ?? []), item]);
  }
  const productNames = new Map(products.map((row) => [stringValue(row.product_id), stringValue(row.product_name)]));
  const map = new Map<string, { product_id: string; product_name?: string; sku?: string; refund_amount: number; quantity: number }>();

  for (const refund of refunds) {
    const orderItems = itemsByOrder.get(stringValue(refund.order_id)) ?? [];
    const amount = numberValue(refund.amount);
    const share = orderItems.length ? amount / orderItems.length : amount;
    for (const item of orderItems) {
      const productId = stringValue(item.product_id) || "unknown";
      const current = map.get(productId) ?? {
        product_id: productId,
        product_name: productNames.get(productId) || stringValue(item.product_name) || undefined,
        sku: stringValue(item.sku) || undefined,
        refund_amount: 0,
        quantity: 0
      };
      current.refund_amount = roundCurrency(current.refund_amount + share);
      current.quantity += numberValue(item.quantity, 1);
      map.set(productId, current);
    }
  }

  return Array.from(map.values()).sort((left, right) => right.refund_amount - left.refund_amount).slice(0, 10);
}

function priceDistribution(products: CanonicalRow[], items: CanonicalRow[]) {
  const prices = [
    ...products.map((row) => numberValue(row.price)).filter((value) => value > 0),
    ...items.map((row) => numberValue(row.price)).filter((value) => value > 0)
  ];
  const buckets = [
    { bucket: "0-25", min: 0, max: 25, count: 0 },
    { bucket: "25-50", min: 25, max: 50, count: 0 },
    { bucket: "50-100", min: 50, max: 100, count: 0 },
    { bucket: "100-250", min: 100, max: 250, count: 0 },
    { bucket: "250+", min: 250, max: Infinity, count: 0 }
  ];

  for (const price of prices) {
    const bucket = buckets.find((item) => price >= item.min && price < item.max);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ bucket, count }) => ({ bucket, count }));
}

function uniqueCatalogProductCount(products: CanonicalRow[]) {
  const productIds = new Set(products.map((row) => stringValue(row.product_id)).filter(Boolean));

  return productIds.size || products.length;
}

function uniqueCatalogVariantCount(products: CanonicalRow[]) {
  const variantIds = new Set(
    products
      .map((row) => stringValue(row.variant_id) || stringValue(row.product_id))
      .filter(Boolean)
  );

  return variantIds.size || products.length;
}

function uniqueSkuCountAcrossSources(tables: CanonicalDataset["tables"]) {
  const skuValues = new Set<string>();
  const rowsBySource = [
    tables.ecommerce_order_items,
    tables.ecommerce_products,
    tables.ecommerce_refunds,
    tables.ecommerce_ads ?? [],
    (tables.ecommerce_inventory ?? tables.inventory ?? []) as CanonicalRow[]
  ];

  for (const rows of rowsBySource) {
    for (const row of rows as CanonicalRow[]) {
      const sku = stringValue(row.sku);
      if (sku) skuValues.add(sku);
    }
  }

  return skuValues.size;
}

function isUntrackedSku(sku: string) {
  return sku.toUpperCase().startsWith("SKU-UNTRACKED-");
}

function growthRate(points: TimeSeriesPoint[]) {
  if (points.length < 2) return null;
  const previous = points.at(-2)?.revenue ?? 0;
  const current = points.at(-1)?.revenue ?? 0;

  if (previous === 0) return current > 0 ? 1 : null;
  return roundRatio((current - previous) / previous);
}

function concentrationRisk(share: number | null | undefined): "low" | "medium" | "high" | "unknown" {
  if (share === null || share === undefined) return "unknown";
  if (share >= 0.6) return "high";
  if (share >= 0.35) return "medium";
  return "low";
}

function periodKey(value: string, granularity: "day" | "week" | "month") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (granularity === "day") return date.toISOString().slice(0, 10);
  if (granularity === "month") return date.toISOString().slice(0, 7);

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);

  return start.toISOString().slice(0, 10);
}

function canonicalPlatform(row: CanonicalRow) {
  return firstString(row.platform, row.source_provider) || "canonical";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }

  return 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function safeDivide(value: number, divisor: number) {
  return divisor ? value / divisor : 0;
}

function computedNetRevenue(row: CanonicalRow) {
  if (firstString(row.revenue_allocation_source) === "order_net_revenue") {
    const allocatedNet = firstFiniteNumber(row.net_revenue, row.net_sales, row.revenue);
    if (allocatedNet !== null) return roundCurrency(Math.max(0, allocatedNet));
  }

  const paymentStatus = firstString(row.financial_status, row.payment_status, row.status, row.order_status).toLowerCase().replace(/[\s-]+/g, "_");
  if (paymentStatus === "partially_paid") {
    const paid = firstFiniteNumber(row.paid_amount, row.amount_paid, row.total_paid, row.captured_amount, row.net_payment);
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

    return roundCurrency(Math.max(0, legacyPreRefundRevenue -
      firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
      firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund)));
  }

  return roundCurrency(Math.max(0, grossSales -
    firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
    firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund)));
}

function rowRevenue(row: CanonicalRow) {
  return firstNumber(
    computedNetRevenue(row),
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

function adSpendValue(row: CanonicalRow) {
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

function firstInventoryValue(row: CanonicalRow) {
  return firstFiniteNumber(
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
  );
}

function hasRevenueAdjustment(row: CanonicalRow) {
  return firstFiniteNumber(
    row.discount,
    row.discount_amount,
    row.total_discount,
    row.discounts,
    row.refund,
    row.refund_amount,
    row.refunded_amount,
    row.total_refund
  ) !== null;
}

function numberValue(value: unknown, fallback = 0) {
  const number = numericValue(value);

  return Number.isFinite(number) ? number : fallback;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
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

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
