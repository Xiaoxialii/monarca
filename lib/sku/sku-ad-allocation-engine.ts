export type SkuAdAllocationInput = {
  skuRows: Array<{ sku: string; revenue: number; quantity: number }>;
  orderItems: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
};

export type SkuAdAllocationRow = {
  sku: string;
  allocated_ad_spend: number;
  allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "none";
  allocation_confidence: number;
  campaign_ids: string[];
  attribution_window_start: string | null;
  attribution_window_end: string | null;
};

export function allocateAdSpendToSkus(input: SkuAdAllocationInput): SkuAdAllocationRow[] {
  const skuRows = input.skuRows.filter((row) => row.sku);
  if (!skuRows.length) return [];

  const totalAdSpend = roundCurrency(sum(input.ads.map((row) => firstNumber(row.spend, row.ad_spend))));
  if (!totalAdSpend) {
    return skuRows.map((row) => ({
      sku: row.sku,
      allocated_ad_spend: 0,
      allocation_method: "none",
      allocation_confidence: 1,
      campaign_ids: [],
      attribution_window_start: null,
      attribution_window_end: null
    }));
  }

  const campaignSpend = new Map<string, { spend: number; windowStart: string | null; windowEnd: string | null; adIds: Set<string> }>();
  for (const ad of input.ads) {
    const campaignId = firstString(ad.campaign_id, ad.utm_campaign, ad.ad_id);
    if (!campaignId) continue;
    const current = campaignSpend.get(campaignId) ?? { spend: 0, windowStart: null, windowEnd: null, adIds: new Set<string>() };
    current.spend = roundCurrency(current.spend + firstNumber(ad.spend, ad.ad_spend));
    const window = attributionWindow(ad);
    current.windowStart = minDateString(current.windowStart, window.start);
    current.windowEnd = maxDateString(current.windowEnd, window.end);
    const adId = firstString(ad.ad_id, ad.id);
    if (adId) current.adIds.add(adId);
    campaignSpend.set(campaignId, current);
  }

  const campaignSkuRevenue = new Map<string, Map<string, number>>();
  const campaignSkuDirectRevenue = new Map<string, Map<string, number>>();
  const skuCampaigns = new Map<string, Set<string>>();
  const skuWindows = new Map<string, { start: string | null; end: string | null }>();
  for (const item of input.orderItems) {
    const sku = stringValue(item.sku);
    const campaignId = firstString(item.campaign_id, item.utm_campaign, item.marketing_campaign_id, item.ad_id, item.utm_ad_id);
    if (!sku || !campaignId) continue;
    const campaign = campaignSpend.get(campaignId);
    if (!campaign || !isItemInsideCampaignWindow(item, campaign.windowStart, campaign.windowEnd)) continue;

    const quantity = numberValue(item.quantity, 1);
    const revenue = firstNumber(item.revenue, item.net_sales, firstNumber(item.price, item.unit_price) * quantity);
    const current = campaignSkuRevenue.get(campaignId) ?? new Map<string, number>();
    current.set(sku, roundCurrency((current.get(sku) ?? 0) + revenue));
    campaignSkuRevenue.set(campaignId, current);

    const itemAdId = firstString(item.ad_id, item.utm_ad_id, item.click_id);
    if (itemAdId && campaign.adIds.has(itemAdId)) {
      const direct = campaignSkuDirectRevenue.get(campaignId) ?? new Map<string, number>();
      direct.set(sku, roundCurrency((direct.get(sku) ?? 0) + revenue));
      campaignSkuDirectRevenue.set(campaignId, direct);
    }

    const campaigns = skuCampaigns.get(sku) ?? new Set<string>();
    campaigns.add(campaignId);
    skuCampaigns.set(sku, campaigns);
    const currentWindow = skuWindows.get(sku) ?? { start: null, end: null };
    currentWindow.start = minDateString(currentWindow.start, campaign.windowStart);
    currentWindow.end = maxDateString(currentWindow.end, campaign.windowEnd);
    skuWindows.set(sku, currentWindow);
  }

  const allocation = new Map<string, number>();
  const methodBySku = new Map<string, SkuAdAllocationRow["allocation_method"]>();
  let campaignAllocatedSpend = 0;
  for (const [campaignId, campaign] of campaignSpend.entries()) {
    const directRevenue = campaignSkuDirectRevenue.get(campaignId);
    const skuRevenue = directRevenue?.size ? directRevenue : campaignSkuRevenue.get(campaignId);
    if (!skuRevenue?.size) continue;
    const campaignRevenue = sum(Array.from(skuRevenue.values()));
    campaignAllocatedSpend = roundCurrency(campaignAllocatedSpend + campaign.spend);
    const method: SkuAdAllocationRow["allocation_method"] = directRevenue?.size ? "direct" : "campaign_window";
    if (!campaignRevenue) {
      const equalSpend = roundCurrency(campaign.spend / skuRevenue.size);
      for (const sku of skuRevenue.keys()) {
        allocation.set(sku, roundCurrency((allocation.get(sku) ?? 0) + equalSpend));
        methodBySku.set(sku, method);
      }
      continue;
    }
    for (const [sku, revenue] of skuRevenue.entries()) {
      allocation.set(sku, roundCurrency((allocation.get(sku) ?? 0) + campaign.spend * (revenue / campaignRevenue)));
      methodBySku.set(sku, method);
    }
  }

  if (campaignAllocatedSpend > 0) {
    return skuRows.map((row) => ({
      sku: row.sku,
      allocated_ad_spend: roundCurrency(allocation.get(row.sku) ?? 0),
      allocation_method: methodBySku.get(row.sku) ?? "unavailable",
      allocation_confidence: methodBySku.get(row.sku) === "direct" ? 0.9 : 0.68,
      campaign_ids: Array.from(skuCampaigns.get(row.sku) ?? []),
      attribution_window_start: skuWindows.get(row.sku)?.start ?? null,
      attribution_window_end: skuWindows.get(row.sku)?.end ?? null
    }));
  }

  const conversionsBySku = new Map<string, number>();
  for (const item of input.orderItems) {
    const sku = stringValue(item.sku);
    if (!sku) continue;
    const conversions = firstNumber(item.conversions, item.conversion_count, item.purchase_conversions);
    if (!conversions) continue;
    conversionsBySku.set(sku, (conversionsBySku.get(sku) ?? 0) + conversions);
  }
  const totalConversions = sum(Array.from(conversionsBySku.values()));
  if (totalConversions > 0) {
    for (const row of skuRows) {
      allocation.set(row.sku, roundCurrency(totalAdSpend * ((conversionsBySku.get(row.sku) ?? 0) / totalConversions)));
    }
    return skuRows.map((row) => ({
      sku: row.sku,
      allocated_ad_spend: roundCurrency(allocation.get(row.sku) ?? 0),
      allocation_method: "conversion_share",
      allocation_confidence: 0.75,
      campaign_ids: [],
      attribution_window_start: null,
      attribution_window_end: null
    }));
  }

  const totalRevenue = sum(skuRows.map((row) => row.revenue));
  if (totalRevenue > 0) {
    allocateByRevenueShare({ skuRows, spend: totalAdSpend, allocation });
    return skuRows.map((row) => ({
      sku: row.sku,
      allocated_ad_spend: roundCurrency(allocation.get(row.sku) ?? 0),
      allocation_method: "revenue_share",
      allocation_confidence: 0.45,
      campaign_ids: [],
      attribution_window_start: null,
      attribution_window_end: null
    }));
  }

  return skuRows.map((row) => ({
    sku: row.sku,
    allocated_ad_spend: 0,
    allocation_method: "unavailable",
    allocation_confidence: 0.15,
    campaign_ids: [],
    attribution_window_start: null,
    attribution_window_end: null
  }));
}

function allocateByRevenueShare(input: {
  skuRows: Array<{ sku: string; revenue: number }>;
  spend: number;
  allocation: Map<string, number>;
}) {
  const totalRevenue = sum(input.skuRows.map((row) => row.revenue));
  if (!totalRevenue) return;
  for (const row of input.skuRows) {
    input.allocation.set(row.sku, roundCurrency((input.allocation.get(row.sku) ?? 0) + input.spend * (row.revenue / totalRevenue)));
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const stringified = stringValue(value);
    if (stringified) return stringified;
  }
  return "";
}

function attributionWindow(ad: Record<string, unknown>) {
  const start = firstDateString(ad.campaign_start_date, ad.start_date, ad.ad_date, ad.date);
  const endBase = firstDateString(ad.campaign_end_date, ad.end_date, ad.ad_date, ad.date) ?? start;
  const days = firstNumber(ad.attribution_window_days, ad.window_days) || 7;
  const end = addDays(endBase, days);
  return { start, end };
}

function isItemInsideCampaignWindow(item: Record<string, unknown>, start: string | null, end: string | null) {
  const orderDate = firstDateString(item.order_date, item.date, item.created_at, item.createdAt);
  if (!orderDate) return true;
  if (start && orderDate < start) return false;
  if (end && orderDate > end) return false;
  return true;
}

function firstDateString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

function addDays(dateString: string | null, days: number) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minDateString(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function maxDateString(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = parseNumber(value);
    if (numeric !== null) return numeric;
  }
  return 0;
}

function numberValue(value: unknown, fallback = 0) {
  return parseNumber(value) ?? fallback;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
