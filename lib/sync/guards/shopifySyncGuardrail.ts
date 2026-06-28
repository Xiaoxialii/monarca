type MoneySet = {
  shopMoney?: {
    amount?: string | number | null;
    currencyCode?: string | null;
  } | null;
};

type ShopifyRefund = {
  id?: string | null;
  createdAt?: string | null;
  note?: string | null;
  totalRefundedSet?: MoneySet | null;
  refundLineItems?: {
    edges?: Array<{
      node?: {
        lineItem?: {
          id?: string | null;
        } | null;
      } | null;
    } | null>;
  } | null;
};

export type ShopifyGuardrailOrder = {
  id?: string | null;
  name?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  processedAt?: string | null;
  cancelledAt?: string | null;
  test?: boolean | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  currencyCode?: string | null;
  customer?: { id?: string | null } | null;
  shippingAddress?: {
    country?: string | null;
    province?: string | null;
    city?: string | null;
  } | null;
  totalPriceSet?: MoneySet | null;
  subtotalPriceSet?: MoneySet | null;
  totalDiscountsSet?: MoneySet | null;
  totalRefundedSet?: MoneySet | null;
  totalTaxSet?: MoneySet | null;
  totalShippingPriceSet?: MoneySet | null;
  refunds?: ShopifyRefund[] | null;
  lineItems?: {
    edges?: Array<{
      node?: {
        id?: string | null;
        sku?: string | null;
        name?: string | null;
        quantity?: number | null;
        originalUnitPriceSet?: MoneySet | null;
        discountedTotalSet?: MoneySet | null;
        product?: { id?: string | null } | null;
        variant?: { id?: string | null; sku?: string | null } | null;
      } | null;
    } | null>;
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    } | null;
  } | null;
};

export type ShopifyPaginationAudit = {
  ordersCompleted: boolean;
  productsCompleted: boolean;
  customersCompleted: boolean;
  ordersPageCount: number;
  productsPageCount: number;
  customersPageCount: number;
};

export type ShopifyGuardrailReport = {
  duplicateOrdersDetected: number;
  missingRefunds: number;
  paginationIncomplete: boolean;
  currencyMismatch: boolean;
  currencyList: string[];
  aggregationBlocked: boolean;
  testOrdersFiltered: number;
  cancelledOrdersFiltered: number;
  lineItemIssues: number;
  rateLimitRetries: number;
  orderUpdatesDetected: number;
  refundIssues: number;
  discountIssues: number;
  shippingIssues: number;
  guestCustomersDetected: number;
  warnings: string[];
};

export type ShopifyGuardrailResult<TOrder extends ShopifyGuardrailOrder> = {
  ordersForNormalization: TOrder[];
  guardrailReport: ShopifyGuardrailReport;
};

export function runShopifyGuardrails<TOrder extends ShopifyGuardrailOrder>(input: {
  workspaceId: string;
  orders: TOrder[];
  pagination: ShopifyPaginationAudit;
  rateLimitRetries: number;
}): ShopifyGuardrailResult<TOrder> {
  const seenOrders = new Map<string, TOrder>();
  const warnings: string[] = [];
  let duplicateOrdersDetected = 0;
  let testOrdersFiltered = 0;
  let cancelledOrdersFiltered = 0;
  let lineItemIssues = 0;
  let missingRefunds = 0;
  let refundIssues = 0;
  let orderUpdatesDetected = 0;
  let discountIssues = 0;
  let shippingIssues = 0;
  let guestCustomersDetected = 0;
  const currencySet = new Set<string>();

  for (const order of input.orders) {
    const orderId = stringValue(order.id);

    if (!orderId) {
      duplicateOrdersDetected += 1;
      warnings.push("Order without source_order_id skipped.");
      continue;
    }

    if (order.test) {
      testOrdersFiltered += 1;
      continue;
    }

    if (order.cancelledAt) {
      cancelledOrdersFiltered += 1;
      continue;
    }

    if (order.updatedAt && order.createdAt && order.updatedAt !== order.createdAt) {
      orderUpdatesDetected += 1;
    }

    const currency = stringValue(order.currencyCode) || moneyCurrency(order.totalPriceSet) || moneyCurrency(order.subtotalPriceSet);
    if (currency) currencySet.add(currency);

    if (!order.customer?.id) {
      guestCustomersDetected += 1;
    }

    const lineItems = order.lineItems?.edges ?? [];
    if (order.lineItems?.pageInfo?.hasNextPage) {
      lineItemIssues += 1;
      warnings.push(`Order ${orderId} has paginated line items that were not fully fetched.`);
    }
    for (const edge of lineItems) {
      const item = edge?.node;
      if (!item?.id || (!item.sku && !item.variant?.sku)) {
        lineItemIssues += 1;
      }
    }

    const refundAmount = moneyAmount(order.totalRefundedSet);
    if (refundAmount > 0 && (!order.refunds || order.refunds.length === 0)) {
      missingRefunds += 1;
      warnings.push(`Order ${orderId} has refunded amount but no nested refund records.`);
    }
    for (const refund of order.refunds ?? []) {
      if (!refund.id || !refund.createdAt) {
        refundIssues += 1;
      }
    }

    if (moneyAmount(order.totalDiscountsSet) > moneyAmount(order.subtotalPriceSet)) {
      discountIssues += 1;
    }

    if (moneyAmount(order.totalShippingPriceSet) > moneyAmount(order.totalPriceSet)) {
      shippingIssues += 1;
    }

    const existing = seenOrders.get(orderId);
    if (existing) {
      duplicateOrdersDetected += 1;
      const existingUpdatedAt = Date.parse(existing.updatedAt ?? existing.createdAt ?? "");
      const currentUpdatedAt = Date.parse(order.updatedAt ?? order.createdAt ?? "");
      if (!Number.isFinite(existingUpdatedAt) || currentUpdatedAt >= existingUpdatedAt) {
        seenOrders.set(orderId, order);
      }
      continue;
    }

    seenOrders.set(orderId, order);
  }

  const paginationIncomplete =
    !input.pagination.ordersCompleted ||
    !input.pagination.productsCompleted ||
    !input.pagination.customersCompleted;
  const currencyList = Array.from(currencySet).sort();
  const currencyMismatch = currencyList.length > 1;

  if (paginationIncomplete) {
    warnings.push("Shopify pagination did not complete for at least one resource.");
  }
  if (currencyMismatch) {
    warnings.push("Multiple currencies detected. Cross-currency revenue aggregation must be blocked unless converted amounts exist.");
  }
  if (input.rateLimitRetries > 0) {
    warnings.push(`Shopify rate limit retries: ${input.rateLimitRetries}.`);
  }

  return {
    ordersForNormalization: Array.from(seenOrders.values()),
    guardrailReport: {
      duplicateOrdersDetected,
      missingRefunds,
      paginationIncomplete,
      currencyMismatch,
      currencyList,
      aggregationBlocked: currencyMismatch || paginationIncomplete,
      testOrdersFiltered,
      cancelledOrdersFiltered,
      lineItemIssues,
      rateLimitRetries: input.rateLimitRetries,
      orderUpdatesDetected,
      refundIssues,
      discountIssues,
      shippingIssues,
      guestCustomersDetected,
      warnings
    }
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function moneyCurrency(value: MoneySet | null | undefined) {
  return stringValue(value?.shopMoney?.currencyCode);
}

function moneyAmount(value: MoneySet | null | undefined) {
  const raw = value?.shopMoney?.amount;
  const amount = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;

  return Number.isFinite(amount) ? amount : 0;
}
