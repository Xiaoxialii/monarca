import crypto from "node:crypto";
import { AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import type {
  AmazonCatalogItem,
  AmazonFinancialEvent,
  AmazonInventorySummary,
  AmazonOrder,
  AmazonOrderItem
} from "@/lib/connectors/amazon/amazon-types";
import { buildCanonicalSku } from "@/lib/sku/sku-intelligence-engine";

export const AMAZON_CANONICAL_SCHEMA_VERSION = "ecommerce_canonical_v1";

export type AmazonCanonicalArtifact = {
  ecommerce_orders: Record<string, unknown>[];
  ecommerce_order_items: Record<string, unknown>[];
  ecommerce_products: Record<string, unknown>[];
  ecommerce_customers: Record<string, unknown>[];
  ecommerce_refunds: Record<string, unknown>[];
  ecommerce_inventory: Record<string, unknown>[];
  ecommerce_costs: Record<string, unknown>[];
};

export function normalizeAmazonRecords(input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  sellerId: string;
  syncRunId: string;
  orders: AmazonOrder[];
  orderItemsByOrderId: Map<string, AmazonOrderItem[]>;
  products: AmazonCatalogItem[];
  inventory: AmazonInventorySummary[];
  financialEvents: AmazonFinancialEvent[];
}) {
  const normalizedAt = new Date().toISOString();
  const base = {
    workspace_id: input.workspaceId,
    data_source_id: input.dataSourceId,
    source_provider: AMAZON_PROVIDER,
    source_account_id: input.sellerId,
    schema_version: AMAZON_CANONICAL_SCHEMA_VERSION,
    sync_run_id: input.syncRunId,
    normalized_at: normalizedAt
  };
  const artifact: AmazonCanonicalArtifact = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_inventory: [],
    ecommerce_costs: []
  };

  for (const order of input.orders) {
    const sourceOrderId = stringValue(order.AmazonOrderId);
    if (!sourceOrderId) continue;
    const orderId = `amazon:${input.sellerId}:${sourceOrderId}`;
    const currency = stringValue(order.OrderTotal?.CurrencyCode);
    const revenue = numberValue(order.OrderTotal?.Amount);

    artifact.ecommerce_orders.push({
      ...base,
      source_order_id: sourceOrderId,
      order_id: orderId,
      customer_id: order.BuyerInfo?.BuyerEmail ? `amazon:${input.sellerId}:buyer:${hash(order.BuyerInfo.BuyerEmail)}` : null,
      order_date: order.PurchaseDate ?? null,
      order_status: order.OrderStatus ?? null,
      financial_status: order.OrderStatus ?? null,
      fulfillment_status: order.FulfillmentChannel ?? null,
      country: order.ShippingAddress?.CountryCode ?? null,
      province: order.ShippingAddress?.StateOrRegion ?? null,
      city: order.ShippingAddress?.City ?? null,
      currency,
      revenue,
      gross_sales: revenue,
      discount_amount: 0,
      refund_amount: 0,
      net_sales: revenue,
      tax_amount: null,
      shipping_amount: null,
      total_paid: revenue,
      marketplace_id: order.MarketplaceId ?? null,
      sales_channel: order.SalesChannel ?? null,
      is_cancelled: /cancel/i.test(String(order.OrderStatus ?? "")),
      is_test: false,
      is_paid: revenue > 0,
      created_at_source: order.PurchaseDate ?? null,
      updated_at_source: order.LastUpdateDate ?? null,
      processed_at_source: order.PurchaseDate ?? null,
      cancelled_at_source: null,
      source_record_id: sourceOrderId,
      raw_payload_hash: hash(JSON.stringify(order))
    });

    for (const item of input.orderItemsByOrderId.get(sourceOrderId) ?? []) {
      const sourceLineItemId = stringValue(item.OrderItemId) ?? `${sourceOrderId}:${item.SellerSKU ?? item.ASIN ?? "line"}`;
      const quantity = numberValue(item.QuantityOrdered);
      const itemPrice = numberValue(item.ItemPrice?.Amount);
      const itemTax = numberValue(item.ItemTax?.Amount);
      const shippingPrice = numberValue(item.ShippingPrice?.Amount);
      const discount = numberValue(item.PromotionDiscount?.Amount);
      const canonicalSku = buildCanonicalSku({
        sku: item.SellerSKU ?? null,
        product_id: item.ASIN ?? null,
        variant_id: null,
        platform: AMAZON_PROVIDER
      });

      artifact.ecommerce_order_items.push({
        ...base,
        source_order_id: sourceOrderId,
        source_line_item_id: sourceLineItemId,
        order_id: orderId,
        order_item_id: `amazon:${input.sellerId}:${sourceLineItemId}`,
        product_id: item.ASIN ? `amazon:${item.ASIN}` : null,
        variant_id: null,
        sku: canonicalSku.sku,
        sku_unmapped: canonicalSku.unmapped,
        sku_source: canonicalSku.unmapped ? "fallback" : AMAZON_PROVIDER,
        asin: item.ASIN ?? null,
        product_name: item.Title ?? null,
        quantity,
        unit_price: quantity > 0 ? itemPrice / quantity : itemPrice,
        item_price: itemPrice,
        item_tax: itemTax,
        shipping_price: shippingPrice,
        discount,
        gross_sales: itemPrice,
        discount_amount: discount,
        refund_amount: 0,
        net_sales: itemPrice - discount,
        currency: item.ItemPrice?.CurrencyCode ?? order.OrderTotal?.CurrencyCode ?? null,
        fulfillment_status: order.FulfillmentChannel ?? null,
        cogs: null,
        cogs_status: "missing",
        source_record_id: sourceLineItemId,
        raw_payload_hash: hash(JSON.stringify({ orderId: sourceOrderId, item }))
      });
    }
  }

  for (const product of input.products) {
    const asin = stringValue(product.asin);
    if (!asin) continue;
    const summary = product.summaries?.[0];
    const sellerSku = firstString(product.attributes?.seller_sku) ?? asin;
    const canonicalSku = buildCanonicalSku({
      sku: sellerSku,
      product_id: asin,
      variant_id: null,
      platform: AMAZON_PROVIDER
    });

    artifact.ecommerce_products.push({
      ...base,
      source_product_id: asin,
      source_variant_id: sellerSku,
      product_id: `amazon:${asin}`,
      variant_id: sellerSku ? `amazon:${input.sellerId}:${sellerSku}` : null,
      asin,
      seller_sku: sellerSku,
      sku: canonicalSku.sku,
      sku_unmapped: canonicalSku.unmapped,
      sku_source: canonicalSku.unmapped ? "fallback" : AMAZON_PROVIDER,
      product_name: summary?.itemName ?? firstString(product.attributes?.item_name) ?? null,
      product_type: summary?.browseClassification?.displayName ?? null,
      category: summary?.browseClassification?.displayName ?? null,
      vendor: null,
      brand: summary?.brandName ?? firstString(product.attributes?.brand) ?? null,
      status: null,
      marketplace_id: summary?.marketplaceId ?? null,
      cogs: null,
      cogs_status: "missing",
      created_at_source: null,
      updated_at_source: null,
      source_record_id: `${asin}:${sellerSku}`,
      raw_payload_hash: hash(JSON.stringify(product))
    });
  }

  const snapshotAt = normalizedAt;
  for (const item of input.inventory) {
    const sku = stringValue(item.sellerSku);
    const asin = stringValue(item.asin);
    if (!sku && !asin) continue;
    const details = item.inventoryDetails;

    artifact.ecommerce_inventory.push({
      ...base,
      source_inventory_id: `${sku ?? asin}:${snapshotAt}`,
      sku,
      asin,
      available_quantity: numberOrNull(item.totalQuantity),
      reserved_quantity: numberOrNull(details?.reservedQuantity?.totalReservedQuantity),
      inbound_quantity: sumNullable([
        details?.inboundWorkingQuantity,
        details?.inboundShippedQuantity,
        details?.inboundReceivingQuantity
      ]),
      fulfillable_quantity: numberOrNull(details?.fulfillableQuantity),
      snapshot_at: snapshotAt,
      marketplace_id: null,
      source_record_id: `${sku ?? asin}:${snapshotAt}`,
      raw_payload_hash: hash(JSON.stringify(item))
    });
  }

  for (const event of input.financialEvents) {
    const id = financialEventId(event);
    const components = financialComponents(event);

    artifact.ecommerce_costs.push({
      ...base,
      source_cost_id: id,
      cost_id: `amazon:${input.sellerId}:${id}`,
      cost_date: stringValue(event.PostedDate) ?? stringValue(event.postedDate) ?? null,
      order_id: stringValue(event.AmazonOrderId) ? `amazon:${input.sellerId}:${event.AmazonOrderId}` : null,
      source_order_id: stringValue(event.AmazonOrderId),
      currency: components.currency,
      platform_fee: components.platformFee,
      fulfillment_fee: components.fulfillmentFee,
      referral_fee: components.referralFee,
      storage_fee: components.storageFee,
      shipping_cost: components.shippingCost,
      refund_cost: components.refundCost,
      other_amazon_fee: components.otherAmazonFee,
      cogs: null,
      cogs_status: "missing",
      event_type: event.eventType ?? null,
      source_record_id: id,
      raw_payload_hash: hash(JSON.stringify(event))
    });
  }

  return artifact;
}

export function dedupeAmazonCanonicalArtifact(artifact: AmazonCanonicalArtifact) {
  const duplicateCounts: Record<string, number> = {};
  const deduped = Object.fromEntries(Object.entries(artifact).map(([tableName, rows]) => {
    const map = new Map<string, Record<string, unknown>>();
    let duplicates = 0;
    for (const row of rows) {
      const key = canonicalKey(tableName, row);
      if (map.has(key)) duplicates += 1;
      map.set(key, row);
    }
    duplicateCounts[tableName] = duplicates;
    return [tableName, Array.from(map.values())];
  })) as AmazonCanonicalArtifact;

  return { artifact: deduped, duplicateCounts };
}

export function amazonCanonicalColumns(tableName: string) {
  const shared = ["workspace_id", "data_source_id", "source_provider", "source_account_id", "schema_version", "sync_run_id", "source_record_id", "raw_payload_hash", "normalized_at"];
  const tableFields: Record<string, string[]> = {
    ecommerce_orders: ["source_order_id", "order_id", "customer_id", "order_date", "order_status", "financial_status", "fulfillment_status", "country", "province", "city", "currency", "revenue", "gross_sales", "discount_amount", "refund_amount", "net_sales", "tax_amount", "shipping_amount", "total_paid", "marketplace_id", "sales_channel", "is_cancelled", "is_test", "is_paid", "created_at_source", "updated_at_source", "processed_at_source", "cancelled_at_source"],
    ecommerce_order_items: ["source_order_id", "source_line_item_id", "order_id", "order_item_id", "product_id", "variant_id", "sku", "asin", "product_name", "quantity", "unit_price", "item_price", "item_tax", "shipping_price", "discount", "gross_sales", "discount_amount", "refund_amount", "net_sales", "currency", "fulfillment_status", "cogs", "cogs_status"],
    ecommerce_products: ["source_product_id", "source_variant_id", "product_id", "variant_id", "asin", "seller_sku", "sku", "product_name", "product_type", "category", "vendor", "brand", "status", "marketplace_id", "cogs", "cogs_status", "created_at_source", "updated_at_source"],
    ecommerce_customers: ["source_customer_id", "customer_id", "email_hash", "country", "province", "city", "customer_created_at", "total_orders", "total_spent", "currency"],
    ecommerce_refunds: ["source_refund_id", "source_order_id", "source_line_item_id", "refund_id", "order_id", "order_item_id", "refund_date", "refund_amount", "currency", "refund_reason"],
    ecommerce_inventory: ["source_inventory_id", "sku", "asin", "available_quantity", "reserved_quantity", "inbound_quantity", "fulfillable_quantity", "snapshot_at", "marketplace_id"],
    ecommerce_costs: ["source_cost_id", "cost_id", "cost_date", "order_id", "source_order_id", "currency", "platform_fee", "fulfillment_fee", "referral_fee", "storage_fee", "shipping_cost", "refund_cost", "other_amazon_fee", "cogs", "cogs_status", "event_type"]
  };

  return [...shared, ...(tableFields[tableName] ?? [])].map((name) => ({ name, type: "canonical" }));
}

function canonicalKey(tableName: string, row: Record<string, unknown>) {
  const base = `${row.workspace_id}|${row.data_source_id}|${row.source_provider}`;
  if (tableName === "ecommerce_orders") return `${base}|${row.source_order_id}`;
  if (tableName === "ecommerce_order_items") return `${base}|${row.source_order_id}|${row.source_line_item_id}`;
  if (tableName === "ecommerce_products") return `${base}|${row.source_product_id}|${row.source_variant_id ?? ""}`;
  if (tableName === "ecommerce_inventory") return `${base}|${row.source_record_id}`;
  if (tableName === "ecommerce_costs") return `${base}|${row.source_cost_id}`;
  return `${base}|${row.source_record_id}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value: unknown) {
  const number = numberValue(value);
  return Number.isFinite(number) ? number : null;
}

function sumNullable(values: unknown[]) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (!present.length) return null;
  return present.reduce<number>((sum, value) => sum + numberValue(value), 0);
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstString(record.value ?? record.Value ?? record.name ?? record.Name);
  }

  return null;
}

function financialEventId(event: AmazonFinancialEvent) {
  return stringValue(event.FinancialEventGroupId) ??
    stringValue(event.AmazonOrderId) ??
    stringValue(event.ShipmentItemId) ??
    stringValue(event.RefundEventId) ??
    hash(JSON.stringify(event));
}

function financialComponents(event: AmazonFinancialEvent) {
  const charges = collectMoney(event, /charge|shipping/i);
  const fees = collectMoney(event, /fee/i);
  const refunds = collectMoney(event, /refund/i);
  const currency = firstCurrency(event);

  return {
    currency,
    platformFee: fees.total,
    fulfillmentFee: fees.byName.get("FBAPerUnitFulfillmentFee") ?? null,
    referralFee: fees.byName.get("Commission") ?? fees.byName.get("ReferralFee") ?? null,
    storageFee: fees.byName.get("StorageFee") ?? null,
    shippingCost: charges.byName.get("ShippingCharge") ?? null,
    refundCost: refunds.total,
    otherAmazonFee: fees.total
  };
}

function collectMoney(value: unknown, keyPattern: RegExp) {
  const byName = new Map<string, number>();
  let total = 0;

  function visit(node: unknown, parentKey = "") {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parentKey);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const amount = record.Amount ?? record.CurrencyAmount;
    const type = stringValue(record.ChargeType) ?? stringValue(record.FeeType) ?? stringValue(record.AdjustmentType) ?? parentKey;
    if (keyPattern.test(parentKey) && (typeof amount === "number" || typeof amount === "string")) {
      const parsed = numberValue(amount);
      total += parsed;
      byName.set(type, (byName.get(type) ?? 0) + parsed);
    }
    for (const [key, child] of Object.entries(record)) visit(child, key);
  }

  visit(value);
  return { total: total || null, byName };
}

function firstCurrency(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const currency = firstCurrency(item);
      if (currency) return currency;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const direct = stringValue(record.CurrencyCode);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    const currency = firstCurrency(child);
    if (currency) return currency;
  }
  return null;
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
