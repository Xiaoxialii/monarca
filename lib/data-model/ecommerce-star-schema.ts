import type { CanonicalDataset } from "@/lib/semantic/types";
import { enrichOrderItemsWithCanonicalSku, normalizeProductSkuRows } from "@/lib/sku/sku-intelligence-engine";

export const ECOMMERCE_STAR_SCHEMA_VERSION = "ecommerce_star_schema_v1" as const;
const SOURCE_SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

export type FactOrder = {
  order_id: string;
  customer_id: string;
  sku: string;
  revenue: number;
  quantity: number;
  discount: number;
  refund_amount: number;
  order_date: string;
  platform: string;
  product_id?: string;
  currency?: string;
  status?: string;
  campaign_id?: string;
  ad_id?: string;
  utm_source?: string;
  session_id?: string;
  canonical_key: string;
};

export type FactAd = {
  ad_id: string;
  campaign_id: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  date: string;
  attribution_revenue?: number;
  canonical_key: string;
};

export type FactBehavior = {
  session_id: string;
  customer_id: string;
  page_views: number;
  add_to_cart: number;
  checkout: number;
  purchase: number;
  date: string;
  platform: string;
  canonical_key: string;
};

export type FactInventorySnapshot = {
  sku: string;
  warehouse_id: string;
  stock_level: number;
  reserved_stock: number;
  fulfillment_time: number;
  date: string;
  platform: string;
  canonical_key: string;
};

export type FactAttribution = {
  order_id: string;
  ad_id: string;
  campaign_id: string;
  session_id: string;
  utm_source: string;
  attribution_model: "last_click" | "multi_touch" | "fallback";
  revenue: number;
  ad_spend_allocated: number;
  platform: string;
  canonical_key: string;
};

export type FactCost = {
  sku: string;
  cogs: number;
  shipping_cost: number;
  platform_fee: number;
  payment_fee: number;
  fulfillment_cost: number;
  date: string;
  platform: string;
  canonical_key: string;
};

export type DimCustomer = {
  customer_id: string;
  first_order_date: string;
  last_order_date: string;
  country: string;
  lifetime_value: number;
  order_count: number;
  is_new_customer: boolean;
  is_returning_customer: boolean;
};

export type DimProduct = {
  sku: string;
  product_id: string;
  product_name: string;
  category: string;
  price: number;
  cost: number | null;
  margin: number | null;
  platform: string;
};

export type DimCost = {
  sku: string;
  cogs: number;
  shipping_cost: number;
  platform_fee: number;
  payment_fee: number;
  fulfillment_cost: number;
  source: string;
  platform: string;
};

export type DimTime = {
  date: string;
  week: string;
  month: string;
  quarter: string;
  year: number;
  cohort: string;
};

export type DimPlatform = {
  platform_id: string;
  platform_name: string;
  channel_type: string;
};

export type StarSchemaRelationship = {
  from_table: keyof EcommerceStarSchemaModel["facts"];
  from_field: string;
  to_table: keyof EcommerceStarSchemaModel["dimensions"] | keyof EcommerceStarSchemaModel["facts"];
  to_field: string;
  valid: boolean;
  missing_keys: string[];
};

export type EcommerceStarSchemaModel = {
  schema_version: typeof ECOMMERCE_STAR_SCHEMA_VERSION;
  source_schema_version: typeof SOURCE_SCHEMA_VERSION;
  facts: {
    fact_orders: FactOrder[];
    fact_ads: FactAd[];
    fact_behavior: FactBehavior[];
    fact_inventory_snapshot: FactInventorySnapshot[];
    fact_attribution: FactAttribution[];
    fact_costs: FactCost[];
  };
  dimensions: {
    dim_customers: DimCustomer[];
    dim_products: DimProduct[];
    dim_costs: DimCost[];
    dim_time: DimTime[];
    dim_platform: DimPlatform[];
  };
  relationships: StarSchemaRelationship[];
  metadata: {
    generated_at: string;
    source_platforms: string[];
    row_counts: {
      facts: Record<keyof EcommerceStarSchemaModel["facts"], number>;
      dimensions: Record<keyof EcommerceStarSchemaModel["dimensions"], number>;
    };
    audit: {
      source: "ecommerce_canonical_v1";
      canonical_input_only: true;
      platform_agnostic: true;
      metrics_defined: false;
      raw_api_input: false;
    };
  };
};

type CanonicalRow = Record<string, unknown>;
type CanonicalTables = CanonicalDataset["tables"] & Record<string, CanonicalRow[] | undefined>;

export function buildEcommerceStarSchemaModel(dataset: CanonicalDataset): EcommerceStarSchemaModel {
  assertCanonicalDataset(dataset);

  const tables = dataset.tables as CanonicalTables;
  const normalizedProducts = normalizeProductSkuRows(tables.ecommerce_products ?? []);
  const enrichedItems = enrichOrderItemsWithCanonicalSku(tables.ecommerce_order_items ?? [], normalizedProducts);
  const refundsByOrder = sumBy(tables.ecommerce_refunds ?? [], (row) => stringValue(row.order_id), (row) => firstNumber(row.amount, row.refund_amount));

  const factOrders = buildFactOrders(tables.ecommerce_orders ?? [], enrichedItems, refundsByOrder);
  const factAds = buildFactAds(tables.ecommerce_ads ?? []);
  const factBehavior = buildFactBehavior(tables.ecommerce_behavior ?? []);
  const factInventory = buildFactInventory(tables.ecommerce_inventory ?? tables.inventory ?? []);
  const factCosts = buildFactCosts(tables.ecommerce_costs ?? tables.costs ?? [], normalizedProducts, enrichedItems);
  const factAttribution = buildFactAttribution(factOrders, factAds, factBehavior);

  const dimProducts = buildDimProducts(normalizedProducts, enrichedItems, factInventory);
  const dimCosts = buildDimCosts(factCosts, dimProducts);
  const dimCustomers = buildDimCustomers(tables.ecommerce_customers ?? [], tables.ecommerce_orders ?? [], factOrders);
  const dimTime = buildDimTime([...factOrders.map((row) => row.order_date), ...factAds.map((row) => row.date), ...factBehavior.map((row) => row.date), ...factInventory.map((row) => row.date), ...factCosts.map((row) => row.date)]);
  const dimPlatform = buildDimPlatform(dataset, [...factOrders, ...factAds, ...factBehavior, ...factInventory, ...factCosts, ...factAttribution]);

  const modelWithoutRelationships = {
    schema_version: ECOMMERCE_STAR_SCHEMA_VERSION,
    source_schema_version: SOURCE_SCHEMA_VERSION,
    facts: {
      fact_orders: factOrders,
      fact_ads: factAds,
      fact_behavior: factBehavior,
      fact_inventory_snapshot: factInventory,
      fact_attribution: factAttribution,
      fact_costs: factCosts
    },
    dimensions: {
      dim_customers: dimCustomers,
      dim_products: dimProducts,
      dim_costs: dimCosts,
      dim_time: dimTime,
      dim_platform: dimPlatform
    }
  };
  const relationships = buildRelationships(modelWithoutRelationships);

  return {
    ...modelWithoutRelationships,
    relationships,
    metadata: {
      generated_at: dataset.metadata?.normalized_at || "1970-01-01T00:00:00.000Z",
      source_platforms: Array.from(new Set((dataset.metadata?.source_platforms ?? []).map(normalizePlatform).filter(Boolean))),
      row_counts: {
        facts: {
          fact_orders: factOrders.length,
          fact_ads: factAds.length,
          fact_behavior: factBehavior.length,
          fact_inventory_snapshot: factInventory.length,
          fact_attribution: factAttribution.length,
          fact_costs: factCosts.length
        },
        dimensions: {
          dim_customers: dimCustomers.length,
          dim_products: dimProducts.length,
          dim_costs: dimCosts.length,
          dim_time: dimTime.length,
          dim_platform: dimPlatform.length
        }
      },
      audit: {
        source: SOURCE_SCHEMA_VERSION,
        canonical_input_only: true,
        platform_agnostic: true,
        metrics_defined: false,
        raw_api_input: false
      }
    }
  };
}

function buildFactOrders(orders: CanonicalRow[], items: CanonicalRow[], refundsByOrder: Map<string, number>) {
  const itemsByOrder = groupBy(items, (row) => stringValue(row.order_id));
  const facts: FactOrder[] = [];

  for (const order of dedupeBy(orders, (row) => stringValue(row.order_id) || stringValue(row.canonical_key))) {
    const orderId = stringValue(order.order_id);
    if (!orderId) continue;

    const orderItems = itemsByOrder.get(orderId) ?? [];
    if (!orderItems.length) {
      facts.push(orderFactFromRow(order, null, refundsByOrder));
      continue;
    }

    for (const item of orderItems) {
      facts.push(orderFactFromRow(order, item, refundsByOrder));
    }
  }

  return dedupeBy(facts, (row) => row.canonical_key) as FactOrder[];
}

function orderFactFromRow(order: CanonicalRow, item: CanonicalRow | null, refundsByOrder: Map<string, number>): FactOrder {
  const orderId = stringValue(order.order_id);
  const quantity = item ? firstNumber(item.quantity, 1) : 1;
  const itemRevenue = item ? firstNumber(item.revenue, item.net_sales, multiply(firstNumber(item.price, item.unit_price), quantity)) : 0;
  const revenue = roundCurrency(item ? itemRevenue : firstNumber(order.revenue, order.net_sales, order.total_paid));
  const platform = normalizePlatform(firstString(item?.platform, item?.source_provider, order.platform, order.source_provider));
  const sku = firstString(item?.sku, order.sku, "unknown");

  return {
    order_id: orderId,
    customer_id: customerIdFromOrder(order),
    sku,
    revenue,
    quantity,
    discount: roundCurrency(firstNumber(item?.discount, item?.discount_amount, order.discount, order.discount_amount)),
    refund_amount: roundCurrency(refundsByOrder.get(orderId) ?? firstNumber(order.refund_amount)),
    order_date: dateOnly(firstString(order.order_date, order.created_at, order.created_at_source)),
    platform,
    product_id: firstString(item?.product_id, order.product_id) || undefined,
    currency: firstString(item?.currency, order.currency) || undefined,
    status: firstString(order.status, order.order_status) || undefined,
    campaign_id: firstString(item?.campaign_id, item?.utm_campaign, order.campaign_id, order.utm_campaign, order.marketing_campaign_id) || undefined,
    ad_id: firstString(item?.ad_id, item?.utm_ad_id, order.ad_id, order.utm_ad_id) || undefined,
    utm_source: firstString(item?.utm_source, order.utm_source) || undefined,
    session_id: firstString(item?.session_id, order.session_id) || undefined,
    canonical_key: stableKey(["fact_orders", platform, orderId, sku, firstString(item?.canonical_key, item?.source_id)])
  };
}

function customerIdFromOrder(order: CanonicalRow) {
  const explicitCustomerId = firstString(order.customer_id, order.source_customer_id);
  if (explicitCustomerId) return explicitCustomerId;
  const orderId = firstString(order.order_id, order.source_order_id);
  return orderId ? `guest:${orderId}` : "guest:unknown";
}

function buildFactAds(rows: CanonicalRow[]) {
  return dedupeBy(rows, (row) => stringValue(row.canonical_key) || [row.campaign_id, row.ad_id, row.date].map(stringValue).join(":"))
    .map((row) => {
      const platform = normalizePlatform(firstString(row.platform, row.source_provider));
      const adId = firstString(row.ad_id, row.campaign_id, row.canonical_key);

      return {
        ad_id: adId,
        campaign_id: firstString(row.campaign_id, "unknown"),
        platform,
        spend: roundCurrency(firstNumber(row.spend, row.ad_spend)),
        impressions: firstNumber(row.impressions),
        clicks: firstNumber(row.clicks),
        conversions: firstNumber(row.conversions),
        date: dateOnly(firstString(row.date, row.event_date)),
        attribution_revenue: firstNumber(row.attribution_revenue) || undefined,
        canonical_key: stableKey(["fact_ads", platform, adId, firstString(row.date, row.event_date)])
      };
    });
}

function buildFactBehavior(rows: CanonicalRow[]) {
  return dedupeBy(rows, (row) => stringValue(row.session_id) || stringValue(row.canonical_key))
    .map((row) => {
      const platform = normalizePlatform(firstString(row.platform, row.source_provider));
      const sessionId = firstString(row.session_id, row.canonical_key);

      return {
        session_id: sessionId,
        customer_id: firstString(row.customer_id, "unknown"),
        page_views: firstNumber(row.page_views),
        add_to_cart: firstNumber(row.add_to_cart),
        checkout: firstNumber(row.checkout),
        purchase: firstNumber(row.purchase),
        date: dateOnly(firstString(row.date, row.event_date)),
        platform,
        canonical_key: stableKey(["fact_behavior", platform, sessionId])
      };
    });
}

function buildFactInventory(rows: CanonicalRow[]) {
  return dedupeBy(rows, (row) => [row.sku, row.warehouse_id, row.date].map(stringValue).join(":") || stringValue(row.canonical_key))
    .map((row) => {
      const platform = normalizePlatform(firstString(row.platform, row.source_provider));
      const sku = normalizeSku(firstString(row.sku));
      const warehouseId = firstString(row.warehouse_id, "unknown");
      const date = dateOnly(firstString(row.date, row.snapshot_date, row.updated_at));

      return {
        sku,
        warehouse_id: warehouseId,
        stock_level: firstNumber(row.stock_level, row.inventory_quantity, row.quantity),
        reserved_stock: firstNumber(row.reserved_stock),
        fulfillment_time: firstNumber(row.fulfillment_time, row.fulfillment_days),
        date,
        platform,
        canonical_key: stableKey(["fact_inventory_snapshot", platform, sku, warehouseId, date])
      };
    });
}

function buildFactAttribution(factOrders: FactOrder[], factAds: FactAd[], behaviorRows: FactBehavior[]) {
  if (!factOrders.length) return [];

  const adsByCampaign = new Map(factAds.map((row) => [row.campaign_id, row]));
  const behaviorByCustomer = new Map(behaviorRows.map((row) => [row.customer_id, row]));

  const facts: FactAttribution[] = [];
  for (const order of factOrders) {
    const campaignId = campaignIdFromOrder(order);
    const matchedAd = campaignId ? adsByCampaign.get(campaignId) : undefined;
    const session = order.customer_id ? behaviorByCustomer.get(order.customer_id) : undefined;
    if (!matchedAd && !session && !campaignId && !order.ad_id) continue;

    const model: FactAttribution["attribution_model"] = matchedAd ? "last_click" : (session ? "multi_touch" : "fallback");
    const adSpendAllocated = matchedAd
      ? roundCurrency(matchedAd.spend)
      : 0;

    facts.push({
      order_id: order.order_id,
      ad_id: matchedAd?.ad_id || order.ad_id || "",
      campaign_id: matchedAd?.campaign_id || campaignId || order.ad_id || "",
      session_id: session?.session_id || order.session_id || "",
      utm_source: order.utm_source || matchedAd?.platform || order.platform || "unknown",
      attribution_model: model,
      revenue: order.revenue,
      ad_spend_allocated: adSpendAllocated,
      platform: matchedAd?.platform || order.platform,
      canonical_key: stableKey(["fact_attribution", order.order_id, matchedAd?.ad_id || order.ad_id || campaignId, model])
    });
  }

  return dedupeBy(facts, (row) => row.canonical_key);
}

function campaignIdFromOrder(order: CanonicalRow) {
  return firstString(order.utm_campaign, order.campaign_id, order.marketing_campaign_id);
}

function buildFactCosts(rows: CanonicalRow[], products: CanonicalRow[], items: CanonicalRow[]) {
  const directCosts = rows.map((row) => costFactFromRow(row, "canonical_cost"));
  const productCosts = products
    .filter((row) => firstFiniteNumber(row.cogs, row.cost, row.unit_cost) !== null)
    .map((row) => costFactFromRow(row, "product_cost"));
  const itemCosts = items
    .filter((row) => firstFiniteNumber(row.cogs, row.cost, row.unit_cost) !== null)
    .map((row) => costFactFromRow(row, "item_cost"));

  return dedupeBy([...directCosts, ...productCosts, ...itemCosts], (row) => row.canonical_key) as FactCost[];
}

function costFactFromRow(row: CanonicalRow, source: string): FactCost {
  const platform = normalizePlatform(firstString(row.platform, row.source_provider));
  const sku = normalizeSku(firstString(row.sku, row.product_sku));
  const productId = firstString(row.product_id, row.variant_id, sku);
  const date = dateOnly(firstString(row.date, row.cost_date, row.updated_at, row.normalized_at));

  return {
    sku,
    cogs: roundCurrency(firstNumber(row.cogs, row.cost, row.unit_cost)),
    shipping_cost: roundCurrency(firstNumber(row.shipping_cost, row.shipping_expense)),
    platform_fee: roundCurrency(firstNumber(row.platform_fee, row.marketplace_fee, row.selling_fee)),
    payment_fee: roundCurrency(firstNumber(row.payment_fee, row.processing_fee, row.transaction_fee)),
    fulfillment_cost: roundCurrency(firstNumber(row.fulfillment_cost, row.pick_pack_cost, row.handling_cost)),
    date,
    platform,
    canonical_key: stableKey(["fact_costs", platform, sku || productId, date, source])
  };
}

function buildDimProducts(products: CanonicalRow[], items: CanonicalRow[], inventory: FactInventorySnapshot[]) {
  const bySku = new Map<string, DimProduct>();

  for (const row of [...products, ...items]) {
    const sku = normalizeSku(firstString(row.sku));
    if (!sku) continue;

    const price = firstNumber(row.price, row.unit_price);
    const cost = nullableNumber(row.cost);
    const next: DimProduct = {
      sku,
      product_id: firstString(row.product_id, row.variant_id, sku),
      product_name: firstString(row.product_name, row.name, sku),
      category: firstString(row.category, row.product_type, "unknown"),
      price,
      cost,
      margin: cost === null ? null : roundCurrency(price - cost),
      platform: normalizePlatform(firstString(row.platform, row.source_provider))
    };
    bySku.set(sku, mergeProductDimension(bySku.get(sku), next));
  }

  for (const row of inventory) {
    if (!row.sku || bySku.has(row.sku)) continue;
    bySku.set(row.sku, {
      sku: row.sku,
      product_id: row.sku,
      product_name: row.sku,
      category: "unknown",
      price: 0,
      cost: null,
      margin: null,
      platform: row.platform
    });
  }

  return Array.from(bySku.values()).sort((left, right) => left.sku.localeCompare(right.sku));
}

function buildDimCosts(costs: FactCost[], products: DimProduct[]) {
  const productCostBySku = new Map(products.map((row) => [row.sku, row.cost]));
  const bySku = new Map<string, DimCost>();

  for (const row of costs) {
    if (!row.sku) continue;
    const current = bySku.get(row.sku);
    bySku.set(row.sku, {
      sku: row.sku,
      cogs: row.cogs || current?.cogs || productCostBySku.get(row.sku) || 0,
      shipping_cost: row.shipping_cost || current?.shipping_cost || 0,
      platform_fee: row.platform_fee || current?.platform_fee || 0,
      payment_fee: row.payment_fee || current?.payment_fee || 0,
      fulfillment_cost: row.fulfillment_cost || current?.fulfillment_cost || 0,
      source: current?.source ? `${current.source},${row.canonical_key}` : row.canonical_key,
      platform: row.platform || current?.platform || "unknown"
    });
  }

  for (const product of products) {
    if (bySku.has(product.sku) || product.cost === null) continue;
    bySku.set(product.sku, {
      sku: product.sku,
      cogs: product.cost,
      shipping_cost: 0,
      platform_fee: 0,
      payment_fee: 0,
      fulfillment_cost: 0,
      source: "dim_products.cost",
      platform: product.platform
    });
  }

  return Array.from(bySku.values()).sort((left, right) => left.sku.localeCompare(right.sku));
}

function mergeProductDimension(current: DimProduct | undefined, next: DimProduct) {
  if (!current) return next;

  const nextHasName = next.product_name && next.product_name !== next.sku;
  const currentHasName = current.product_name && current.product_name !== current.sku;

  return {
    sku: current.sku,
    product_id: current.product_id || next.product_id,
    product_name: currentHasName ? current.product_name : (nextHasName ? next.product_name : current.product_name),
    category: current.category !== "unknown" ? current.category : next.category,
    price: current.price || next.price,
    cost: current.cost ?? next.cost,
    margin: current.margin ?? next.margin,
    platform: current.platform !== "unknown" ? current.platform : next.platform
  };
}

function buildDimCustomers(customers: CanonicalRow[], orders: CanonicalRow[], facts: FactOrder[]) {
  const byCustomer = new Map<string, DimCustomer>();
  const orderCountByCustomer = new Map<string, Set<string>>();
  const revenueByCustomer = sumBy(facts, (row) => row.customer_id, (row) => row.revenue);
  const rawOrderDatesByCustomer = groupBy(orders, (row) => firstString(row.customer_id, "unknown"));
  const factOrderDatesByCustomer = groupBy(facts, (row) => row.customer_id);

  for (const fact of facts) {
    const customerId = firstString(fact.customer_id, "unknown");
    if (!orderCountByCustomer.has(customerId)) orderCountByCustomer.set(customerId, new Set());
    orderCountByCustomer.get(customerId)?.add(fact.order_id);
  }

  for (const row of customers) {
    const customerId = firstString(row.customer_id, "unknown");
    byCustomer.set(customerId, customerDimension(customerId, row, rawOrderDatesByCustomer, factOrderDatesByCustomer, orderCountByCustomer, revenueByCustomer));
  }

  for (const customerId of orderCountByCustomer.keys()) {
    if (!byCustomer.has(customerId)) {
      byCustomer.set(customerId, customerDimension(customerId, {}, rawOrderDatesByCustomer, factOrderDatesByCustomer, orderCountByCustomer, revenueByCustomer));
    }
  }

  return Array.from(byCustomer.values()).sort((left, right) => left.customer_id.localeCompare(right.customer_id));
}

function customerDimension(
  customerId: string,
  row: CanonicalRow,
  rawOrderDatesByCustomer: Map<string, CanonicalRow[]>,
  factOrderDatesByCustomer: Map<string, FactOrder[]>,
  orderCountByCustomer: Map<string, Set<string>>,
  revenueByCustomer: Map<string, number>
): DimCustomer {
  const rawDates = (rawOrderDatesByCustomer.get(customerId) ?? []).map((order) => dateOnly(firstString(order.order_date, order.created_at)));
  const factDates = (factOrderDatesByCustomer.get(customerId) ?? []).map((order) => dateOnly(order.order_date));
  const orderDates = [...rawDates, ...factDates].filter(Boolean).sort();
  const orderCount = orderCountByCustomer.get(customerId)?.size ?? firstNumber(row.total_orders);

  return {
    customer_id: customerId,
    first_order_date: firstString(row.first_order_date, orderDates[0], row.customer_created_at),
    last_order_date: firstString(row.last_order_date, orderDates.at(-1), row.customer_created_at),
    country: firstString(row.country, "unknown"),
    lifetime_value: roundCurrency(firstNumber(row.lifetime_value, row.total_spent, revenueByCustomer.get(customerId))),
    order_count: orderCount,
    is_new_customer: orderCount <= 1,
    is_returning_customer: orderCount > 1
  };
}

function buildDimTime(dates: string[]) {
  return Array.from(new Set(dates.map(dateOnly).filter(Boolean)))
    .sort()
    .map((date) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      const year = parsed.getUTCFullYear();
      const monthIndex = parsed.getUTCMonth();
      const quarter = Math.floor(monthIndex / 3) + 1;

      return {
        date,
        week: `${year}-W${String(isoWeek(parsed)).padStart(2, "0")}`,
        month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
        quarter: `${year}-Q${quarter}`,
        year,
        cohort: `${year}-${String(monthIndex + 1).padStart(2, "0")}`
      };
    });
}

function buildDimPlatform(dataset: CanonicalDataset, factRows: Array<{ platform: string }>) {
  const platforms = new Set([
    ...(dataset.metadata?.source_platforms ?? []),
    ...factRows.map((row) => row.platform)
  ].map(normalizePlatform).filter(Boolean));

  return Array.from(platforms).sort().map((platform) => ({
    platform_id: platform,
    platform_name: platform,
    channel_type: channelType(platform)
  }));
}

function buildRelationships(model: Pick<EcommerceStarSchemaModel, "facts" | "dimensions">): StarSchemaRelationship[] {
  return [
    relationship(model.facts.fact_orders, "customer_id", model.dimensions.dim_customers, "customer_id", "fact_orders", "dim_customers"),
    relationship(model.facts.fact_orders, "sku", model.dimensions.dim_products, "sku", "fact_orders", "dim_products"),
    relationship(model.facts.fact_orders, "order_date", model.dimensions.dim_time, "date", "fact_orders", "dim_time"),
    relationship(model.facts.fact_ads, "platform", model.dimensions.dim_platform, "platform_id", "fact_ads", "dim_platform"),
    relationship(model.facts.fact_behavior, "customer_id", model.dimensions.dim_customers, "customer_id", "fact_behavior", "dim_customers"),
    relationship(model.facts.fact_inventory_snapshot, "sku", model.dimensions.dim_products, "sku", "fact_inventory_snapshot", "dim_products"),
    relationship(model.facts.fact_attribution, "order_id", model.facts.fact_orders, "order_id", "fact_attribution", "fact_orders"),
    relationship(model.facts.fact_costs, "sku", model.dimensions.dim_products, "sku", "fact_costs", "dim_products")
  ];
}

function relationship(
  facts: Array<Record<string, unknown>>,
  factField: string,
  dimensions: Array<Record<string, unknown>>,
  dimensionField: string,
  fromTable: keyof EcommerceStarSchemaModel["facts"],
  toTable: keyof EcommerceStarSchemaModel["dimensions"] | keyof EcommerceStarSchemaModel["facts"]
): StarSchemaRelationship {
  const dimensionKeys = new Set(dimensions.map((row) => stringValue(row[dimensionField])).filter(Boolean));
  const missingKeys = Array.from(new Set(facts.map((row) => stringValue(row[factField])).filter((key) => key && !dimensionKeys.has(key)))).sort();

  return {
    from_table: fromTable,
    from_field: factField,
    to_table: toTable,
    to_field: dimensionField,
    valid: missingKeys.length === 0,
    missing_keys: missingKeys
  };
}

function assertCanonicalDataset(dataset: CanonicalDataset) {
  if (dataset.schema_version !== SOURCE_SCHEMA_VERSION) {
    throw new Error(`Data Model Layer only accepts ${SOURCE_SCHEMA_VERSION}; received ${String(dataset.schema_version)}`);
  }
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

function sumBy<T>(rows: T[], getKey: (row: T) => string, getValue: (row: T) => number) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, roundCurrency((map.get(key) ?? 0) + getValue(row)));
  }
  return map;
}

function dedupeBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T>();
  rows.forEach((row, index) => {
    map.set(getKey(row) || `row:${index}`, row);
  });
  return Array.from(map.values());
}

function normalizePlatform(value: unknown) {
  const text = stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return text || "unknown";
}

function normalizeSku(value: unknown) {
  return stringValue(value)
    .normalize("NFKC")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function channelType(platform: string) {
  const name = normalizePlatform(platform);
  if (/(ad|ads|paid|campaign|social|search)/.test(name)) return "ads";
  if (/(pay|payment|billing)/.test(name)) return "payment";
  if (/(inventory|erp|warehouse)/.test(name)) return "operations";
  return "commerce";
}

function dateOnly(value: unknown) {
  const text = stringValue(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return text.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function isoWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function stableKey(parts: unknown[]) {
  return parts.map(stringValue).join(":");
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function multiply(left: number, right: number) {
  return roundCurrency(left * right);
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
