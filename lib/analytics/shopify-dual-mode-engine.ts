type ShopifyMoneySet = {
  shopMoney?: {
    amount?: string | number | null;
    currencyCode?: string | null;
  } | null;
} | null;

type ShopifyConnection<T> = {
  edges?: Array<{ node?: T | null } | null> | null;
};

export type ShopifyDataMode = "FULL" | "FALLBACK";

export type ShopifyDualModeClient = {
  fetchGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

export type ShopifyAnalyticsOrder = {
  id?: string | null;
  name?: string | null;
  totalPriceSet?: ShopifyMoneySet;
  subtotalPriceSet?: ShopifyMoneySet;
  totalDiscountsSet?: ShopifyMoneySet;
  totalRefundedSet?: ShopifyMoneySet;
  lineItems?: ShopifyConnection<{
    id?: string | null;
    name?: string | null;
    sku?: string | null;
    quantity?: number | string | null;
    discountedTotalSet?: ShopifyMoneySet;
    product?: { id?: string | null; title?: string | null } | null;
    variant?: { id?: string | null; sku?: string | null } | null;
  }> | null;
  refunds?: Array<{
    id?: string | null;
    totalRefundedSet?: ShopifyMoneySet;
  }> | null;
};

export type ShopifyAnalyticsProduct = {
  id?: string | null;
  title?: string | null;
  productType?: string | null;
  vendor?: string | null;
  variants?: ShopifyConnection<{
    id?: string | null;
    sku?: string | null;
    price?: string | number | null;
  }> | null;
};

export type ShopifyAnalyticsCustomer = {
  id?: string | null;
  numberOfOrders?: number | string | null;
  amountSpent?: {
    amount?: string | number | null;
    currencyCode?: string | null;
  } | null;
};

export type ShopifyAnalyticsOutput = {
  mode: ShopifyDataMode;
  metrics: {
    revenue: number;
    orders: number;
    aov: number;
    skuInsights: Array<{
      sku: string;
      productName?: string | null;
      units?: number;
      revenue?: number;
      popularityScore?: number;
    }>;
    refundRate?: number;
    profit?: number | null;
  };
  confidence: number;
  missingFields: string[];
  data_quality: "full" | "partial";
  estimation_used: boolean;
};

const MODE_PROBE_QUERY = `
  query ShopifyDataModeProbe {
    orders(first: 1, query: "status:any") {
      edges {
        node {
          id
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 1) {
            edges { node { id sku quantity } }
          }
          refunds {
            id
            totalRefundedSet { shopMoney { amount currencyCode } }
          }
        }
      }
    }
  }
`;

const ORDERS_COUNT_QUERY = `
  query ShopifyOrdersCount {
    ordersCount(query: "status:any") {
      count
    }
  }
`;

export async function detectShopifyDataMode(client: ShopifyDualModeClient): Promise<ShopifyDataMode> {
  try {
    await client.fetchGraphQL(MODE_PROBE_QUERY);

    return "FULL";
  } catch (error) {
    if (isAccessBlocked(error)) {
      return "FALLBACK";
    }

    return "FALLBACK";
  }
}

export async function fetchShopifyFallbackOrderCount(client: ShopifyDualModeClient): Promise<number | null> {
  try {
    const data = await client.fetchGraphQL<{ ordersCount?: { count?: number | string | null } | null }>(ORDERS_COUNT_QUERY);
    const count = numberValue(data.ordersCount?.count);

    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

export function runShopifyAnalytics(input: {
  mode: ShopifyDataMode;
  orders?: ShopifyAnalyticsOrder[];
  products?: ShopifyAnalyticsProduct[];
  customers?: ShopifyAnalyticsCustomer[];
  fallbackOrderCount?: number | null;
  historicalAov?: number | null;
  defaultAov?: number | null;
  costBySku?: Record<string, number>;
  missingFields?: string[];
}): ShopifyAnalyticsOutput {
  if (input.mode === "FULL") {
    return runFullAnalytics(input);
  }

  return runFallbackAnalytics(input);
}

function runFullAnalytics(input: {
  orders?: ShopifyAnalyticsOrder[];
  products?: ShopifyAnalyticsProduct[];
  customers?: ShopifyAnalyticsCustomer[];
  costBySku?: Record<string, number>;
  missingFields?: string[];
}): ShopifyAnalyticsOutput {
  const orders = input.orders ?? [];
  const skuMap = new Map<string, { sku: string; productName?: string | null; units: number; revenue: number }>();
  let revenue = 0;
  let refunds = 0;
  let totalCost = 0;

  for (const order of orders) {
    const orderRevenue = moneyAmount(order.totalPriceSet) || moneyAmount(order.subtotalPriceSet);
    revenue += orderRevenue;
    refunds += moneyAmount(order.totalRefundedSet);

    for (const edge of order.lineItems?.edges ?? []) {
      const item = edge?.node;
      if (!item) continue;
      const sku = item.sku ?? item.variant?.sku ?? item.product?.id ?? item.id ?? "unknown";
      const units = numberValue(item.quantity);
      const itemRevenue = moneyAmount(item.discountedTotalSet);
      const current = skuMap.get(sku) ?? { sku, productName: item.name ?? item.product?.title ?? null, units: 0, revenue: 0 };
      current.units += units;
      current.revenue += itemRevenue;
      skuMap.set(sku, current);
      totalCost += (input.costBySku?.[sku] ?? 0) * units;
    }
  }

  const orderCount = orders.length;
  const netSales = Math.max(0, revenue - refunds);

  return {
    mode: "FULL",
    metrics: {
      revenue: netSales,
      orders: orderCount,
      aov: orderCount ? netSales / orderCount : 0,
      skuInsights: Array.from(skuMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      refundRate: revenue > 0 ? refunds / revenue : 0,
      profit: totalCost > 0 ? netSales - totalCost : null
    },
    confidence: 0.95,
    missingFields: input.missingFields ?? [],
    data_quality: "full",
    estimation_used: false
  };
}

function runFallbackAnalytics(input: {
  products?: ShopifyAnalyticsProduct[];
  fallbackOrderCount?: number | null;
  historicalAov?: number | null;
  defaultAov?: number | null;
  missingFields?: string[];
}): ShopifyAnalyticsOutput {
  const products = input.products ?? [];
  const orderCount = Math.max(0, Math.round(numberValue(input.fallbackOrderCount)));
  const aov = positiveNumber(input.historicalAov) ?? positiveNumber(input.defaultAov) ?? estimateAovFromProducts(products) ?? 75;
  const estimatedRevenue = orderCount * aov;
  const missingFields = Array.from(new Set([
    "orders",
    "lineItems",
    "refunds",
    "customers",
    ...(input.missingFields ?? [])
  ]));

  return {
    mode: "FALLBACK",
    metrics: {
      revenue: estimatedRevenue,
      orders: orderCount,
      aov,
      skuInsights: fallbackSkuInsights(products),
      refundRate: undefined,
      profit: null
    },
    confidence: orderCount > 0 ? 0.55 : 0.35,
    missingFields,
    data_quality: "partial",
    estimation_used: true
  };
}

function fallbackSkuInsights(products: ShopifyAnalyticsProduct[]) {
  return products.slice(0, 10).map((product, index) => {
    const firstVariant = product.variants?.edges?.find((edge) => edge?.node)?.node;

    return {
      sku: firstVariant?.sku ?? product.id ?? `product_${index + 1}`,
      productName: product.title ?? null,
      popularityScore: Math.max(1, products.length - index)
    };
  });
}

function estimateAovFromProducts(products: ShopifyAnalyticsProduct[]) {
  const prices = products
    .flatMap((product) => product.variants?.edges?.map((edge) => numberValue(edge?.node?.price)) ?? [])
    .filter((price) => price > 0)
    .slice(0, 25);

  if (!prices.length) return null;

  const averageProductPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

  return Math.max(averageProductPrice, 25);
}

function isAccessBlocked(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return normalized.includes("access denied")
    || normalized.includes("protected-customer-data")
    || normalized.includes("not approved to access");
}

function positiveNumber(value: unknown) {
  const number = numberValue(value);

  return number > 0 ? number : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;

  return Number.isFinite(number) ? number : 0;
}

function moneyAmount(value: ShopifyMoneySet | undefined) {
  return numberValue(value?.shopMoney?.amount);
}
