import type { CanonicalDataset } from "@/lib/semantic/types";
import { filterCanonicalDatasetForDateRange } from "@/lib/analytics/analysis-period-engine";
import { validateAnalyticsMetrics, type AnalyticsValidationResult } from "@/lib/analytics/analytics-validation-engine";
import { computeCanonicalEcommerceMetrics, type CanonicalEcommerceMetricOutput } from "@/lib/metrics/canonical-ecommerce-metric-engine";
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
    date_range?: {
      preset: string;
      startDate?: string | null;
      endDate?: string | null;
    };
    filtered_row_counts?: Record<string, number>;
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
  const itemSkuCount = new Set(items.map((row) => stringValue(row.sku)).filter(Boolean)).size;
  const productSkuValues = products.map((row) => stringValue(row.sku)).filter(Boolean);
  const productSkuCount = new Set(productSkuValues).size;
  const trackedSkuCount = new Set(productSkuValues.filter((sku) => !isUntrackedSku(sku))).size;
  const untrackedSkuCount = new Set(productSkuValues.filter(isUntrackedSku)).size;
  const productCount = uniqueCatalogProductCount(products);
  const variantCount = uniqueCatalogVariantCount(products);
  const totalSkuCount = itemSkuCount || productSkuCount;
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
      sku_count: productSkuCount || totalSkuCount,
      tracked_sku_count: trackedSkuCount,
      untracked_sku_count: untrackedSkuCount,
      catalog_row_count: products.length,
      sku_density: productCount ? roundRatio((productSkuCount || totalSkuCount) / productCount) : null,
      price_distribution: priceDistribution(products, items),
      product_concentration: topProductShare
    },
    decision_report: decisionReport,
    analytics_validation: analyticsValidation,
    metadata: {
      schema_version: metricResult.metadata.schema_version,
      source_platforms: metricResult.metadata.source_platforms,
      computed_at: metricResult.metadata.computed_at,
      date_range: {
        preset: filtered.dateRange.preset,
        startDate: filtered.dateRange.startDate ?? null,
        endDate: filtered.dateRange.endDate ?? null
      },
      filtered_row_counts: filtered.filteredRowCounts
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
    const price = firstNumber(row.price, row.unit_price, safeDivide(firstNumber(row.net_sales, row.gross_sales), quantity));

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
        return {
          ...row,
          platform: canonicalPlatform(row),
          revenue: firstNumber(row.revenue, row.net_sales, row.total_paid, row.gross_sales),
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
        spend: firstNumber(row.spend, row.ad_spend),
        impressions: firstNumber(row.impressions),
        clicks: firstNumber(row.clicks),
        conversions: firstNumber(row.conversions),
        attribution_revenue: firstNumber(row.attribution_revenue, row.purchase_value, row.revenue),
        date: firstString(row.date, row.month)
      })),
      ecommerce_inventory: ((dataset.tables.ecommerce_inventory ?? dataset.tables.inventory ?? []) as CanonicalRow[]).map((row) => ({
        ...row,
        platform: canonicalPlatform(row),
        sku: firstString(row.sku),
        warehouse_id: firstString(row.warehouse_id, row.warehouse),
        stock_level: firstNumber(row.stock_level, row.on_hand, row.inventory_quantity, row.available_stock, row.available),
        available_stock: firstNumber(row.available_stock, row.available, row.stock_level, row.on_hand, row.inventory_quantity),
        reserved_stock: firstNumber(row.reserved_stock, row.reserved),
        reorder_point: firstNumber(row.reorder_point),
        fulfillment_days: firstNumber(row.fulfillment_days, row.fulfillment_time, row.fulfillment_time_days),
        date: firstString(row.date, row.snapshot_date, row.month)
      }))
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
    map.set(period, roundCurrency((map.get(period) ?? 0) + numberValue(row.revenue)));
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
    const number = Number(value);
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

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
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
