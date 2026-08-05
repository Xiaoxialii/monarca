import type { CanonicalEcommerceMetricOutput } from "@/lib/metrics/canonical-ecommerce-metric-engine";
import type { CanonicalDataset } from "@/lib/semantic/types";

type CanonicalRow = Record<string, unknown>;

export type AnalyticsValidationResult = {
  status: "VALID" | "INVALID";
  warnings: string[];
  errors: string[];
  reconciliation: {
    revenue_from_orders: number;
    revenue_from_order_items: number;
    revenue_from_sku_rollup: number;
    displayed_revenue: number;
    revenue_difference: number;
    unique_order_ids: number;
    displayed_orders: number;
    order_count_difference: number;
    cogs_difference: number;
    ads_difference: number;
    operating_cost_difference: number;
    net_profit_difference: number;
    repeat_customers: number;
    one_time_customers: number;
    total_customers: number;
  };
};

const tolerance = 0.01;

export function validateAnalyticsMetrics(input: {
  dataset: CanonicalDataset;
  metrics: CanonicalEcommerceMetricOutput["metrics"];
}): AnalyticsValidationResult {
  const orders = dedupeBy(input.dataset.tables.ecommerce_orders ?? [], (row) => stringValue(row.order_id) || stringValue(row.canonical_key));
  const orderItems = dedupeBy(input.dataset.tables.ecommerce_order_items ?? [], (row) => stringValue(row.canonical_key) || [row.order_id, row.variant_id, row.product_id, row.sku].map(stringValue).join(":"));
  const revenueFromOrders = roundCurrency(sum(orders.map(orderRevenue)));
  const revenueFromOrderItems = roundCurrency(sum(orderItems.map(lineItemRevenue)));
  const revenueFromSkuRollup = roundCurrency(sum(input.metrics.core.sku_revenue.map((row) => row.revenue)));
  const displayedRevenue = roundCurrency(input.metrics.business.revenue);
  const revenueBaseline = orderItems.length ? revenueFromOrderItems : revenueFromOrders;
  const uniqueOrderIds = new Set(orders.map((row) => stringValue(row.order_id)).filter(Boolean)).size;
  const displayedOrders = input.metrics.core.orders;
  const business = input.metrics.business;
  const skuRows = business.sku_unit_economics;
  const skuCogs = roundCurrency(sum(skuRows.map((row) => row.cogs)));
  const skuAds = roundCurrency(sum(skuRows.map((row) => row.ad_cost_allocated ?? 0)));
  const skuOperatingCost = roundCurrency(sum(skuRows.map((row) =>
    row.shipping_cost +
    row.platform_fee +
    row.payment_fee +
    row.fulfillment_cost +
    row.refund_amount
  )));
  const skuNetProfit = roundCurrency(sum(skuRows.map((row) => row.net_profit)));
  const portfolioOperatingCost = roundCurrency(
    business.shipping_cost +
      business.platform_fee +
      business.payment_fee +
      business.fulfillment_cost +
      business.refund_amount
  );
  const expectedNetProfit = roundCurrency(business.revenue - business.total_cost);
  const repeatCustomers = Math.round(input.metrics.customer.repeat_purchase_rate * input.metrics.customer.customer_count);
  const oneTimeCustomers = Math.max(0, input.metrics.customer.customer_count - repeatCustomers);

  const reconciliation = {
    revenue_from_orders: revenueFromOrders,
    revenue_from_order_items: revenueFromOrderItems,
    revenue_from_sku_rollup: revenueFromSkuRollup,
    displayed_revenue: displayedRevenue,
    revenue_difference: roundCurrency(displayedRevenue - revenueBaseline),
    unique_order_ids: uniqueOrderIds,
    displayed_orders: displayedOrders,
    order_count_difference: displayedOrders - uniqueOrderIds,
    cogs_difference: roundCurrency(business.cogs - skuCogs),
    ads_difference: roundCurrency(business.ad_spend - skuAds),
    operating_cost_difference: roundCurrency(portfolioOperatingCost - skuOperatingCost),
    net_profit_difference: roundCurrency(business.net_profit - skuNetProfit),
    repeat_customers: repeatCustomers,
    one_time_customers: oneTimeCustomers,
    total_customers: input.metrics.customer.customer_count
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (Math.abs(reconciliation.revenue_difference) > tolerance) {
    errors.push(`Revenue does not reconcile with ${orderItems.length ? "order item" : "order"} revenue: ${reconciliation.revenue_difference}`);
  }
  if (Math.abs(displayedRevenue - revenueFromSkuRollup) > tolerance && revenueFromSkuRollup > 0) {
    errors.push(`Revenue does not reconcile with SKU rollup: ${roundCurrency(displayedRevenue - revenueFromSkuRollup)}`);
  }
  if (reconciliation.order_count_difference !== 0) {
    errors.push(`Displayed orders do not match COUNT(DISTINCT order_id): ${reconciliation.order_count_difference}`);
  }
  if (Math.abs(roundCurrency(business.net_profit - expectedNetProfit)) > tolerance) {
    errors.push(`Net profit does not equal revenue - total cost: ${roundCurrency(business.net_profit - expectedNetProfit)}`);
  }
  if (Math.abs(reconciliation.cogs_difference) > tolerance ||
      Math.abs(reconciliation.ads_difference) > tolerance ||
      Math.abs(reconciliation.operating_cost_difference) > tolerance ||
      Math.abs(reconciliation.net_profit_difference) > tolerance) {
    warnings.push("Portfolio totals differ from SKU rollup; inspect unallocated or duplicated costs.");
  }
  if (repeatCustomers + oneTimeCustomers !== input.metrics.customer.customer_count) {
    errors.push("Customer reconciliation failed: repeat + one-time customers does not equal total customers.");
  }

  return {
    status: errors.length ? "INVALID" : "VALID",
    warnings,
    errors,
    reconciliation
  };
}

function dedupeBy<T>(rows: T[], getKey: (row: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const key = getKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(row);
  }
  return result;
}

function orderRevenue(row: CanonicalRow) {
  return firstNumber(row.revenue, row.net_sales, row.total_paid, row.gross_sales);
}

function lineItemRevenue(row: CanonicalRow) {
  const quantity = firstNumber(row.quantity) || 1;
  return roundCurrency(firstNumber(row.revenue, row.net_sales, firstNumber(row.price, row.unit_price) * quantity));
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,%\s,]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
