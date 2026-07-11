import type { CanonicalDataset } from "@/lib/semantic/types";

export type CampaignPerformance = {
  campaign_id: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number | null;
  conversions: number;
  clicks: number;
  impressions: number;
  attributed_orders: number;
  attribution_method: "utm" | "fallback" | "none";
};

export type MetaShopifyAttributionOutput = {
  roas: number;
  cac: number | null;
  cpa: number | null;
  mer: number;
  total_revenue: number;
  total_ad_spend: number;
  attributed_revenue: number;
  campaign_performance: CampaignPerformance[];
  metadata: {
    canonical_input_only: true;
    ads_table: "ecommerce_ads";
    revenue_table: "ecommerce_orders";
    matched_orders: number;
    fallback_attribution_used: boolean;
    computed_at: string;
  };
};

type CanonicalRow = Record<string, unknown>;

export function runMetaShopifyAttribution(input: {
  dataset: CanonicalDataset;
}): MetaShopifyAttributionOutput {
  const ads = dedupeRows(input.dataset.tables.ecommerce_ads ?? [], (row) => stringValue(row.canonical_key) || [row.platform, row.campaign_id, row.ad_id, row.date].map(stringValue).join(":"));
  const orders = dedupeRows(input.dataset.tables.ecommerce_orders ?? [], (row) => stringValue(row.order_id) || stringValue(row.canonical_key));
  const totalRevenue = roundCurrency(sum(orders.map((row) => numberValue(row.revenue))));
  const totalSpend = roundCurrency(sum(ads.map((row) => numberValue(row.spend))));
  const campaignSpend = aggregateAdsByCampaign(ads);
  const utmMatches = matchOrdersByUtm(orders, campaignSpend);
  const matchedRevenue = sum(Array.from(utmMatches.values()).map((row) => row.revenue));
  const fallbackRevenue = Math.max(0, unattributedRevenue(orders) - matchedRevenue);
  const useFallback = fallbackRevenue > 0 && campaignSpend.size > 0;
  const campaignRows: CampaignPerformance[] = [];

  for (const [campaignId, spendRow] of campaignSpend.entries()) {
    const match = utmMatches.get(campaignId);
    const fallbackShare = useFallback && totalSpend > 0 ? fallbackRevenue * (spendRow.spend / totalSpend) : 0;
    const revenue = roundCurrency((match?.revenue ?? 0) + fallbackShare);
    const method = match?.orders ? "utm" : fallbackShare > 0 ? "fallback" : "none";

    campaignRows.push({
      campaign_id: campaignId,
      spend: spendRow.spend,
      revenue,
      roas: spendRow.spend > 0 ? roundRatio(revenue / spendRow.spend) : 0,
      cpa: spendRow.conversions > 0 ? roundCurrency(spendRow.spend / spendRow.conversions) : null,
      conversions: spendRow.conversions,
      clicks: spendRow.clicks,
      impressions: spendRow.impressions,
      attributed_orders: match?.orders ?? 0,
      attribution_method: method
    });
  }

  const attributedRevenue = roundCurrency(sum(campaignRows.map((row) => row.revenue)));
  const attributedCustomers = attributedCustomerCount(orders, utmMatches);
  const conversions = sum(campaignRows.map((row) => row.conversions));

  return {
    roas: totalSpend > 0 ? roundRatio(attributedRevenue / totalSpend) : 0,
    cac: attributedCustomers > 0 ? roundCurrency(totalSpend / attributedCustomers) : null,
    cpa: conversions > 0 ? roundCurrency(totalSpend / conversions) : null,
    mer: totalSpend > 0 ? roundRatio(totalRevenue / totalSpend) : 0,
    total_revenue: totalRevenue,
    total_ad_spend: totalSpend,
    attributed_revenue: attributedRevenue,
    campaign_performance: campaignRows.sort((left, right) => right.revenue - left.revenue || left.campaign_id.localeCompare(right.campaign_id)),
    metadata: {
      canonical_input_only: true,
      ads_table: "ecommerce_ads",
      revenue_table: "ecommerce_orders",
      matched_orders: sum(Array.from(utmMatches.values()).map((row) => row.orders)),
      fallback_attribution_used: useFallback,
      computed_at: computedAt(input.dataset)
    }
  };
}

function aggregateAdsByCampaign(rows: CanonicalRow[]) {
  const map = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();

  for (const row of rows) {
    const campaignId = stringValue(row.campaign_id);
    if (!campaignId) continue;

    const current = map.get(campaignId) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    current.spend = roundCurrency(current.spend + numberValue(row.spend));
    current.impressions += numberValue(row.impressions);
    current.clicks += numberValue(row.clicks);
    current.conversions += numberValue(row.conversions);
    map.set(campaignId, current);
  }

  return map;
}

function matchOrdersByUtm(orders: CanonicalRow[], campaignSpend: Map<string, unknown>) {
  const map = new Map<string, { revenue: number; orders: number; customerIds: Set<string> }>();

  for (const order of orders) {
    if (!isMetaSource(order)) continue;
    const campaignId = stringValue(order.utm_campaign, order.campaign_id, order.source_campaign_id);
    if (!campaignId || !campaignSpend.has(campaignId)) continue;

    const current = map.get(campaignId) ?? { revenue: 0, orders: 0, customerIds: new Set<string>() };
    current.revenue = roundCurrency(current.revenue + numberValue(order.revenue));
    current.orders += 1;
    const customerId = stringValue(order.customer_id);
    if (customerId) current.customerIds.add(customerId);
    map.set(campaignId, current);
  }

  return map;
}

function attributedCustomerCount(orders: CanonicalRow[], matches: Map<string, { customerIds: Set<string>; orders: number }>) {
  const customers = new Set<string>();
  let attributedOrders = 0;

  for (const match of matches.values()) {
    match.customerIds.forEach((id) => customers.add(id));
    attributedOrders += match.orders;
  }

  if (customers.size) return customers.size;

  return attributedOrders || new Set(orders.map((row) => stringValue(row.customer_id)).filter(Boolean)).size;
}

function unattributedRevenue(orders: CanonicalRow[]) {
  return roundCurrency(sum(orders.filter((row) => !hasExplicitNonMetaSource(row)).map((row) => numberValue(row.revenue))));
}

function hasExplicitNonMetaSource(row: CanonicalRow) {
  const source = stringValue(row.utm_source, row.source, row.marketing_source).toLowerCase();

  return Boolean(source) && !isMetaSource(row);
}

function isMetaSource(row: CanonicalRow) {
  const source = stringValue(row.utm_source, row.source, row.marketing_source).toLowerCase();

  return source === "meta" || source === "facebook" || source === "instagram" || source === "fb";
}

function dedupeRows(rows: CanonicalRow[], getKey: (row: CanonicalRow) => string) {
  const map = new Map<string, CanonicalRow>();

  rows.forEach((row, index) => {
    map.set(getKey(row) || `row:${index}`, row);
  });

  return Array.from(map.values());
}

function computedAt(dataset: CanonicalDataset) {
  return typeof dataset.metadata?.normalized_at === "string" ? dataset.metadata.normalized_at : "1970-01-01T00:00:00.000Z";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}
