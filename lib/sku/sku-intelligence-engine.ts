type CanonicalRow = Record<string, unknown>;

export type CanonicalSku = {
  sku: string;
  product_id: string;
  variant_id: string;
  platform: string;
  unmapped: boolean;
};

export type SkuIntelligenceOutput = {
  order_items: CanonicalRow[];
  sku_metrics: Array<{
    sku: string;
    revenue: number;
    quantity: number;
    product_id: string;
    variant_id?: string;
    share: number;
    unmapped: boolean;
  }>;
  metadata: {
    sku_coverage: number;
    unmapped_skus: number;
    revenue_reconciled: boolean;
  };
};

export function parseShopifyGid(value: unknown) {
  const raw = stringValue(value);
  const match = raw.match(/^gid:\/\/shopify\/([^/]+)\/([^/?#]+)/i);

  if (!match) return null;

  return {
    resource: match[1],
    id: match[2]
  };
}

export function normalizeSkuValue(value: unknown) {
  const raw = stringValue(value).trim();
  if (!raw || isShopifyGid(raw)) return "";

  return raw
    .normalize("NFKC")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function buildCanonicalSku(input: {
  sku?: unknown;
  product_id?: unknown;
  variant_id?: unknown;
  platform?: unknown;
}): CanonicalSku {
  const platform = stringValue(input.platform) || inferPlatform(input.product_id, input.variant_id) || "canonical";
  const productId = canonicalId(input.product_id, platform);
  const variantId = canonicalId(input.variant_id, platform);
  const normalizedSku = normalizeSkuValue(input.sku);
  const fallbackId = shortStableId(variantId || productId || "unknown");

  return {
    sku: normalizedSku || `SKU-UNTRACKED-${fallbackId}`,
    product_id: productId,
    variant_id: variantId,
    platform,
    unmapped: !normalizedSku
  };
}

export function buildSkuLookup(productRows: CanonicalRow[]) {
  const byProductId = new Map<string, CanonicalSku>();
  const byVariantId = new Map<string, CanonicalSku>();
  const productRowsByProductId = new Map<string, CanonicalRow>();
  const productRowsByVariantId = new Map<string, CanonicalRow>();

  for (const product of productRows) {
    const canonicalSku = buildCanonicalSku({
      sku: product.sku,
      product_id: firstString(product.product_id, product.source_product_id),
      variant_id: firstString(product.variant_id, product.source_variant_id),
      platform: firstString(product.platform, product.source_provider)
    });

    if (canonicalSku.product_id && !byProductId.has(canonicalSku.product_id)) {
      byProductId.set(canonicalSku.product_id, canonicalSku);
      productRowsByProductId.set(canonicalSku.product_id, product);
    }
    if (canonicalSku.variant_id) {
      byVariantId.set(canonicalSku.variant_id, canonicalSku);
      productRowsByVariantId.set(canonicalSku.variant_id, product);
    }
  }

  return { byProductId, byVariantId, productRowsByProductId, productRowsByVariantId };
}

export function enrichOrderItemsWithCanonicalSku(orderItems: CanonicalRow[], productRows: CanonicalRow[]): CanonicalRow[] {
  const lookup = buildSkuLookup(productRows);

  return orderItems.map((item) => {
    const platform = firstString(item.platform, item.source_provider);
    const productId = canonicalId(firstString(item.product_id, item.source_product_id), platform);
    const variantId = canonicalId(firstString(item.variant_id, item.source_variant_id), platform);
    const productSku = (variantId && lookup.byVariantId.get(variantId)) || (productId && lookup.byProductId.get(productId)) || null;
    const productRow = (variantId && lookup.productRowsByVariantId.get(variantId)) || (productId && lookup.productRowsByProductId.get(productId)) || null;
    const canonicalSku = buildCanonicalSku({
      sku: firstString(item.sku, productSku?.sku),
      product_id: productId || productSku?.product_id,
      variant_id: variantId || productSku?.variant_id,
      platform
    });

    return {
      ...item,
      product_id: productId || canonicalSku.product_id || productSku?.product_id || "",
      variant_id: variantId || canonicalSku.variant_id || productSku?.variant_id || "",
      product_name: firstString(item.product_name, item.title, item.name, productRow?.product_name, productRow?.title, productRow?.name),
      category: firstString(item.category, item.product_category, item.product_type, productRow?.category, productRow?.product_category, productRow?.product_type),
      variant_name: firstString(item.variant_name, item.variant_title, productRow?.variant_name, productRow?.variant_title, productRow?.option_title),
      size: firstString(item.size, item.option_size, productRow?.size, productRow?.option_size, productRow?.option1),
      color: firstString(item.color, item.colour, productRow?.color, productRow?.colour, productRow?.option_color, productRow?.option2),
      sku: canonicalSku.sku,
      sku_unmapped: canonicalSku.unmapped,
      sku_source: canonicalSku.unmapped ? "fallback" : "canonical"
    };
  });
}

export function normalizeProductSkuRows(productRows: CanonicalRow[]) {
  return productRows.map((product) => {
    const canonicalSku = buildCanonicalSku({
      sku: product.sku,
      product_id: firstString(product.product_id, product.source_product_id),
      variant_id: firstString(product.variant_id, product.source_variant_id),
      platform: firstString(product.platform, product.source_provider)
    });

    return {
      ...product,
      product_id: canonicalSku.product_id || firstString(product.product_id),
      variant_id: canonicalSku.variant_id || firstString(product.variant_id),
      sku: canonicalSku.sku,
      sku_unmapped: canonicalSku.unmapped,
      sku_source: canonicalSku.unmapped ? "fallback" : "canonical"
    };
  });
}

export function runSkuIntelligence(input: {
  orderItems: CanonicalRow[];
  products: CanonicalRow[];
}): SkuIntelligenceOutput {
  const products = normalizeProductSkuRows(input.products);
  const orderItems = enrichOrderItemsWithCanonicalSku(input.orderItems, products);
  const bySku = new Map<string, {
    sku: string;
    revenue: number;
    quantity: number;
    product_id: string;
    variant_id?: string;
    unmapped: boolean;
  }>();

  for (const item of orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;

    const quantity = numberValue(item.quantity, 1);
    const price = firstNumber(item.price, item.unit_price, safeDivide(firstNumber(item.net_sales, item.gross_sales), quantity));
    const current = bySku.get(sku) ?? {
      sku,
      revenue: 0,
      quantity: 0,
      product_id: stringValue(item.product_id),
      variant_id: stringValue(item.variant_id) || undefined,
      unmapped: Boolean(item.sku_unmapped)
    };
    current.revenue = roundCurrency(current.revenue + price * quantity);
    current.quantity += quantity;
    current.unmapped = current.unmapped || Boolean(item.sku_unmapped);
    bySku.set(sku, current);
  }

  const totalRevenue = roundCurrency(Array.from(bySku.values()).reduce((sum, row) => sum + row.revenue, 0));
  const skuMetrics = Array.from(bySku.values())
    .map((row) => ({
      ...row,
      share: totalRevenue > 0 ? roundRatio(row.revenue / totalRevenue) : 0
    }))
    .sort((left, right) => right.revenue - left.revenue || left.sku.localeCompare(right.sku));
  const unmappedSkus = skuMetrics.filter((row) => row.unmapped).length;

  return {
    order_items: orderItems,
    sku_metrics: skuMetrics,
    metadata: {
      sku_coverage: skuMetrics.length ? roundRatio((skuMetrics.length - unmappedSkus) / skuMetrics.length) : 0,
      unmapped_skus: unmappedSkus,
      revenue_reconciled: totalRevenue >= 0
    }
  };
}

function isShopifyGid(value: string) {
  return /^gid:\/\/shopify\//i.test(value);
}

function inferPlatform(...values: unknown[]) {
  return values.map(stringValue).some((value) => value.includes("shopify") || isShopifyGid(value)) ? "shopify" : "";
}

function canonicalId(value: unknown, platform?: unknown) {
  const raw = stringValue(value);
  const parsed = parseShopifyGid(raw);
  const sourceId = parsed?.id ?? raw;
  if (!sourceId) return "";
  const platformName = stringValue(platform);

  return platformName === "shopify" && Boolean(parsed) && !sourceId.startsWith("shopify:")
    ? `shopify:${sourceId}`
    : sourceId;
}

function shortStableId(value: string) {
  const parsed = parseShopifyGid(value);
  const raw = parsed?.id ?? value.split(":").filter(Boolean).at(-1) ?? value;

  return normalizeSkuValue(raw) || "UNKNOWN";
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

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function safeDivide(value: number, divisor: number) {
  return divisor ? value / divisor : 0;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
