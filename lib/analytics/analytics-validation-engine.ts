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
  const sourceOrders = dedupeBy(input.dataset.tables.ecommerce_orders ?? [], sourceOrderIdentity);
  const orders = sourceOrders.filter(isValidRevenueOrder);
  const validOrderIds = new Set(orders.flatMap(orderMatchValues).filter(Boolean));
  const sourceItems = input.dataset.tables.ecommerce_order_items ?? [];
  const hasOrderFacts = sourceOrders.length > 0;
  const scopedItems = validOrderIds.size
    ? sourceItems.filter((row) => orderMatchValues(row).some((orderId) => validOrderIds.has(orderId)))
    : hasOrderFacts
      ? []
      : sourceItems;
  const orderItems = dedupeBy(scopedItems, (row) => stringValue(row.canonical_key) || [row.order_id, row.variant_id, row.product_id, row.sku].map(stringValue).join(":"));
  const revenueFromOrders = roundCurrency(sum(orders.map(orderRevenue)));
  const revenueFromOrderItems = roundCurrency(sum(orderItems.map(lineItemRevenue)));
  const revenueFromSkuRollup = roundCurrency(sum(input.metrics.core.sku_revenue.map((row) => row.revenue)));
  const displayedRevenue = roundCurrency(firstNumber(
    input.metrics.revenue,
    input.metrics.core.revenue,
    input.metrics.business.revenue
  ));
  const revenueBaseline = orders.length ? revenueFromOrders : revenueFromOrderItems;
  const uniqueOrderIds = new Set(orders.map(sourceOrderIdentity).filter(Boolean)).size;
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
  if (hasOrderFacts && !orders.length) {
    errors.push("No valid paid revenue orders are available in the selected canonical snapshot.");
  }
  if (Math.abs(displayedRevenue - revenueFromSkuRollup) > tolerance && revenueFromSkuRollup > 0) {
    warnings.push(`Revenue does not fully reconcile with SKU rollup: ${roundCurrency(displayedRevenue - revenueFromSkuRollup)}`);
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

function sourceOrderIdentity(row: CanonicalRow) {
  const nativeOrderId = stringValue(row.source_order_id || row.native_order_id || row.amazon_order_id || row.external_order_id);
  const sourceId = stringValue(row.source_id);
  const orderId = stringValue(row.order_id);
  if (nativeOrderId) return nativeOrderId;
  if (sourceId && !sourceId.includes("gid://shopify/Order/") && sourceId !== orderId) return sourceId;
  return orderId || sourceId || stringValue(row.canonical_key);
}

function orderMatchValues(row: CanonicalRow) {
  return [
    row.source_order_id,
    row.native_order_id,
    row.amazon_order_id,
    row.external_order_id,
    row.order_id,
    row.source_id
  ].map(stringValue).filter(Boolean);
}

const VALID_REVENUE_STATUSES = new Set(["paid", "partially_refunded", "captured", "settled"]);
const INVALID_REVENUE_STATUSES = new Set(["cancelled", "canceled", "failed", "pending", "unpaid", "voided"]);

function isValidRevenueOrder(row: CanonicalRow) {
  if (
    truthyFlag(row.is_test) ||
    truthyFlag(row.test) ||
    truthyFlag(row.is_cancelled) ||
    truthyFlag(row.cancelled) ||
    Boolean(stringValue(row.cancelled_at)) ||
    Boolean(stringValue(row.cancelled_at_source))
  ) {
    return false;
  }

  const explicitPaymentStatus = firstString(row.financial_status, row.payment_status);
  const fallbackStatus = firstString(row.status, row.order_status);
  const financialStatus = normalizeStatus(explicitPaymentStatus || fallbackStatus);
  const hasOrderDate = Boolean(dayKey(firstString(row.order_date, row.date, row.created_at, row.createdAt, row.processed_at)));
  const explicitPaidFlag = truthyFlag(row.is_paid) || truthyFlag(row.paid) || truthyFlag(row.isPaid);
  if (explicitPaidFlag && financialStatus !== "authorized" && !INVALID_REVENUE_STATUSES.has(financialStatus)) return true;
  if (!financialStatus) return hasPositiveCommerceRevenueOrPayment(row);
  if (INVALID_REVENUE_STATUSES.has(financialStatus)) return false;
  if (financialStatus === "authorized") return false;
  if (financialStatus === "partially_paid") return paidAmount(row) !== null;
  if (financialStatus === "refunded") return true;
  if (!explicitPaymentStatus) return hasOrderDate && hasPositiveCommerceRevenueOrPayment(row);
  return VALID_REVENUE_STATUSES.has(financialStatus);
}

function dayKey(value: unknown) {
  const text = firstString(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function orderRevenue(row: CanonicalRow) {
  return firstNumber(computedNetRevenue(row), row.net_revenue, row.net_amount, row.net_total, row.total_paid, row.net_sales, row.revenue, row.gross_sales);
}

function lineItemRevenue(row: CanonicalRow) {
  const quantity = firstNumber(row.quantity) || 1;
  return roundCurrency(firstNumber(computedNetRevenue(row), row.net_revenue, row.net_amount, row.net_total, row.net_sales, row.revenue, row.gross_sales, firstNumber(row.price, row.unit_price) * quantity));
}

function computedNetRevenue(row: CanonicalRow) {
  if (stringValue(row.revenue_allocation_source) === "order_net_revenue") {
    const allocatedNet = firstFiniteNumber(row.net_revenue, row.net_sales, row.revenue);
    if (allocatedNet !== null) return roundCurrency(Math.max(0, allocatedNet));
  }

  if (!hasFiniteNumber(row.gross_sales)) {
    const explicitNet = firstFiniteNumber(row.net_revenue, row.netRevenue, row.net_amount, row.netAmount, row.net_total, row.netTotal);
    if (explicitNet !== null) return roundCurrency(Math.max(0, explicitNet));

    if (!hasRevenueAdjustment(row)) return null;

    const legacyPreRefundRevenue = firstFiniteNumber(row.revenue, row.sales, row.gmv, row.amount, row.total, row.subtotal, row.net_sales, row.netSales);
    if (legacyPreRefundRevenue === null) return null;
    return roundCurrency(Math.max(0, legacyPreRefundRevenue -
      firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
      firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund)));
  }

  return roundCurrency(
    Math.max(0, firstNumber(row.gross_sales) -
      firstNumber(row.discount, row.discount_amount, row.total_discount, row.discounts) -
      firstNumber(row.refund, row.refund_amount, row.refunded_amount, row.total_refund))
  );
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function hasFiniteNumber(value: unknown) {
  return Number.isFinite(numericValue(value));
}

function numericValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
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

function paidAmount(row: CanonicalRow) {
  return firstFiniteNumber(row.paid_amount, row.amount_paid, row.total_paid, row.captured_amount, row.net_payment);
}

function hasPositiveCommerceRevenueOrPayment(row: CanonicalRow) {
  return firstNumber(
    row.total_paid,
    row.paid_amount,
    row.amount_paid,
    row.captured_amount,
    row.net_payment,
    row.gross_sales,
    row.total_price,
    row.total,
    row.revenue
  ) > 0;
}

function truthyFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

function normalizeStatus(value: unknown) {
  return stringValue(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
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
