export type SkuAdAllocationInput = {
  skuRows: Array<{ sku: string; revenue: number; quantity: number }>;
  orderItems: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
};

export type SkuAdAllocationRow = {
  sku: string;
  allocated_ad_spend: number | null;
  allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "unknown" | "none";
  allocation_confidence: number;
  attribution_source: "meta_ads" | "amazon_ads" | "shopify_ads" | "campaign_attribution" | "sku_allocation" | "revenue_share_fallback" | "unknown" | "none";
  campaign_ids: string[];
  attributed_campaigns: Array<{
    campaign_id: string;
    raw_spend: number;
    attributed_revenue: number;
    allocated_spend: number;
    allocation_method: "direct" | "campaign_revenue_share";
  }>;
  ads_validation_status: "PASSED" | "FAILED" | "UNKNOWN";
  warnings: string[];
  lineage: {
    raw_platform_spend: number;
    sku_direct_attribution: number;
    campaign_allocation: number;
    revenue_share_fallback: number;
    final_allocated_ads: number | null;
  };
  attribution_window_start: string | null;
  attribution_window_end: string | null;
};

export function allocateAdSpendToSkus(input: SkuAdAllocationInput): SkuAdAllocationRow[] {
  const skuRows = input.skuRows.filter((row) => row.sku);
  if (!skuRows.length) return [];

  const skuSet = new Set(skuRows.map((row) => row.sku));
  const directSpendBySku = new Map<string, number>();
  const directCampaignsBySku = new Map<string, Set<string>>();
  const directCampaignDetailsBySku = new Map<string, SkuAdAllocationRow["attributed_campaigns"]>();
  const adsForFallback: Array<Record<string, unknown>> = [];
  const totalRawAdSpend = roundCurrency(sum(input.ads.map(adSpendValue)));
  for (const ad of input.ads) {
    const spend = adSpendValue(ad);
    const sku = firstString(ad.sku, ad.product_sku, ad.item_sku, ad.variant_sku, ad.source_id);
    if (sku && skuSet.has(sku)) {
      directSpendBySku.set(sku, roundCurrency((directSpendBySku.get(sku) ?? 0) + spend));
      const campaignId = firstString(ad.campaign_id, ad.utm_campaign, ad.ad_id);
      if (campaignId) {
        const campaigns = directCampaignsBySku.get(sku) ?? new Set<string>();
        campaigns.add(campaignId);
        directCampaignsBySku.set(sku, campaigns);
        const details = directCampaignDetailsBySku.get(sku) ?? [];
        details.push({
          campaign_id: campaignId,
          raw_spend: spend,
          attributed_revenue: 0,
          allocated_spend: spend,
          allocation_method: "direct"
        });
        directCampaignDetailsBySku.set(sku, details);
      }
    } else {
      adsForFallback.push(ad);
    }
  }

  const directAdSpend = roundCurrency(sum(Array.from(directSpendBySku.values())));
  const fallbackAdSpend = roundCurrency(sum(adsForFallback.map(adSpendValue)));
  const totalAdSpend = roundCurrency(directAdSpend + fallbackAdSpend);
  if (!totalAdSpend) {
    return skuRows.map((row) => ({
      sku: row.sku,
      allocated_ad_spend: 0,
      allocation_method: "none",
      allocation_confidence: 1,
      attribution_source: "none",
      campaign_ids: [],
      attributed_campaigns: [],
      ads_validation_status: "PASSED",
      warnings: [],
      lineage: emptyLineage(0, 0),
      attribution_window_start: null,
      attribution_window_end: null
    }));
  }

  if (!fallbackAdSpend) {
    const allocations = skuRows.map((row) => {
      const allocated = roundCurrency(directSpendBySku.get(row.sku) ?? 0);
      return buildAllocationRow({
        sku: row.sku,
        allocated,
        method: directSpendBySku.has(row.sku) ? "direct" : "none",
        confidence: 1,
        source: directSpendBySku.has(row.sku) ? platformAttributionSource() : "none",
        campaignIds: Array.from(directCampaignsBySku.get(row.sku) ?? []),
        attributedCampaigns: directCampaignDetailsBySku.get(row.sku) ?? [],
        totalRawAdSpend,
        directSpend: allocated,
        campaignSpend: 0,
        revenueShareSpend: 0,
        validationStatus: "PASSED",
        warnings: [],
        windowStart: null,
        windowEnd: null
      });
    });
    return reconcilePlatformAllocations(allocations, totalRawAdSpend);
  }

  const campaignSpend = new Map<string, { spend: number; windowStart: string | null; windowEnd: string | null; adIds: Set<string> }>();
  for (const ad of adsForFallback) {
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

  const allocation = new Map<string, number>(Array.from(directSpendBySku.entries()));
  const methodBySku = new Map<string, SkuAdAllocationRow["allocation_method"]>();
  const campaignAllocationBySku = new Map<string, number>();
  const campaignDetailsBySku = new Map<string, SkuAdAllocationRow["attributed_campaigns"]>(directCampaignDetailsBySku);
  const campaignAllocatedByCampaign = new Map<string, number>();
  for (const sku of directSpendBySku.keys()) methodBySku.set(sku, "direct");
  let campaignAllocatedSpend = 0;
  for (const [campaignId, campaign] of campaignSpend.entries()) {
    const directRevenue = campaignSkuDirectRevenue.get(campaignId);
    const skuRevenue = directRevenue?.size ? directRevenue : campaignSkuRevenue.get(campaignId);
    if (!skuRevenue?.size) continue;
    const campaignRevenue = sum(Array.from(skuRevenue.values()));
    campaignAllocatedSpend = roundCurrency(campaignAllocatedSpend + campaign.spend);
    const method: SkuAdAllocationRow["allocation_method"] = directRevenue?.size ? "direct" : "campaign_revenue_share";
    if (!campaignRevenue) {
      const skus = Array.from(skuRevenue.keys());
      let allocatedSoFar = 0;
      for (const [index, sku] of skus.entries()) {
        const equalSpend = index === skus.length - 1
          ? roundCurrency(campaign.spend - allocatedSoFar)
          : roundCurrency(campaign.spend / skuRevenue.size);
        allocatedSoFar = roundCurrency(allocatedSoFar + equalSpend);
        allocation.set(sku, roundCurrency((allocation.get(sku) ?? 0) + equalSpend));
        campaignAllocationBySku.set(sku, roundCurrency((campaignAllocationBySku.get(sku) ?? 0) + equalSpend));
        campaignAllocatedByCampaign.set(campaignId, roundCurrency((campaignAllocatedByCampaign.get(campaignId) ?? 0) + equalSpend));
        addCampaignDetail(campaignDetailsBySku, sku, {
          campaign_id: campaignId,
          raw_spend: campaign.spend,
          attributed_revenue: 0,
          allocated_spend: equalSpend,
          allocation_method: method === "direct" ? "direct" : "campaign_revenue_share"
        });
        methodBySku.set(sku, method);
      }
      continue;
    }
    const revenueEntries = Array.from(skuRevenue.entries());
    let allocatedSoFar = 0;
    for (const [index, [sku, revenue]] of revenueEntries.entries()) {
      const allocatedSpend = index === revenueEntries.length - 1
        ? roundCurrency(campaign.spend - allocatedSoFar)
        : roundCurrency(campaign.spend * (revenue / campaignRevenue));
      allocatedSoFar = roundCurrency(allocatedSoFar + allocatedSpend);
      allocation.set(sku, roundCurrency((allocation.get(sku) ?? 0) + allocatedSpend));
      campaignAllocationBySku.set(sku, roundCurrency((campaignAllocationBySku.get(sku) ?? 0) + allocatedSpend));
      campaignAllocatedByCampaign.set(campaignId, roundCurrency((campaignAllocatedByCampaign.get(campaignId) ?? 0) + allocatedSpend));
      addCampaignDetail(campaignDetailsBySku, sku, {
        campaign_id: campaignId,
        raw_spend: campaign.spend,
        attributed_revenue: revenue,
        allocated_spend: allocatedSpend,
        allocation_method: method === "direct" ? "direct" : "campaign_revenue_share"
      });
      methodBySku.set(sku, method);
    }
  }

  if (campaignAllocatedSpend > 0) {
    const campaignWarnings = campaignReconciliationWarnings(campaignSpend, campaignAllocatedByCampaign);
    const allocations = skuRows.map((row) => {
      const method = methodBySku.get(row.sku) ?? "unavailable";
      const directSpend = roundCurrency(directSpendBySku.get(row.sku) ?? 0);
      const campaignSpendForSku = roundCurrency(campaignAllocationBySku.get(row.sku) ?? 0);
      return buildAllocationRow({
        sku: row.sku,
        allocated: roundCurrency(allocation.get(row.sku) ?? 0),
        method,
        confidence: method === "direct" ? 0.9 : method === "campaign_revenue_share" ? 0.78 : 0.2,
        source: method === "direct" ? "sku_allocation" : method === "campaign_revenue_share" ? "campaign_attribution" : "unknown",
        campaignIds: Array.from(new Set([
          ...Array.from(directCampaignsBySku.get(row.sku) ?? []),
          ...Array.from(skuCampaigns.get(row.sku) ?? [])
        ])),
        attributedCampaigns: campaignDetailsBySku.get(row.sku) ?? [],
        totalRawAdSpend,
        directSpend,
        campaignSpend: campaignSpendForSku,
        revenueShareSpend: 0,
        validationStatus: campaignWarnings.length ? "FAILED" : "PASSED",
        warnings: campaignWarnings,
        windowStart: skuWindows.get(row.sku)?.start ?? null,
        windowEnd: skuWindows.get(row.sku)?.end ?? null
      });
    });
    return reconcilePlatformAllocations(allocations, totalRawAdSpend);
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
    const conversionAllocationBySku = new Map<string, number>();
    for (const row of skuRows) {
      const allocatedSpend = roundCurrency(fallbackAdSpend * ((conversionsBySku.get(row.sku) ?? 0) / totalConversions));
      allocation.set(row.sku, roundCurrency((allocation.get(row.sku) ?? 0) + allocatedSpend));
      conversionAllocationBySku.set(row.sku, allocatedSpend);
    }
    return reconcilePlatformAllocations(skuRows.map((row) => buildAllocationRow({
      sku: row.sku,
      allocated: roundCurrency(allocation.get(row.sku) ?? 0),
      method: methodBySku.get(row.sku) ?? "conversion_share",
      confidence: methodBySku.get(row.sku) === "direct" ? 1 : 0.7,
      source: methodBySku.get(row.sku) === "direct" ? "sku_allocation" : "campaign_attribution",
      campaignIds: Array.from(directCampaignsBySku.get(row.sku) ?? []),
      attributedCampaigns: campaignDetailsBySku.get(row.sku) ?? [],
      totalRawAdSpend,
      directSpend: roundCurrency(directSpendBySku.get(row.sku) ?? 0),
      campaignSpend: 0,
      revenueShareSpend: conversionAllocationBySku.get(row.sku) ?? 0,
      validationStatus: "PASSED",
      warnings: [],
      windowStart: null,
      windowEnd: null
    })), totalRawAdSpend);
  }

  return skuRows.map((row) => ({
    sku: row.sku,
    allocated_ad_spend: directSpendBySku.has(row.sku) ? roundCurrency(directSpendBySku.get(row.sku) ?? 0) : null,
    allocation_method: directSpendBySku.has(row.sku) ? "direct" : "unavailable",
    allocation_confidence: directSpendBySku.has(row.sku) ? 1 : 0.15,
    attribution_source: directSpendBySku.has(row.sku) ? "sku_allocation" : "unknown",
    campaign_ids: [],
    attributed_campaigns: [],
    ads_validation_status: "UNKNOWN",
    warnings: directSpendBySku.has(row.sku)
      ? ["Some raw ad spend could not be attributed and was not allocated to SKU profit."]
      : ["Raw ad spend exists but could not be attributed to SKU revenue, orders, conversions, or campaigns."],
    lineage: {
      raw_platform_spend: totalRawAdSpend,
      sku_direct_attribution: roundCurrency(directSpendBySku.get(row.sku) ?? 0),
      campaign_allocation: 0,
      revenue_share_fallback: 0,
      final_allocated_ads: directSpendBySku.has(row.sku) ? roundCurrency(directSpendBySku.get(row.sku) ?? 0) : null
    },
    attribution_window_start: null,
    attribution_window_end: null
  }));
}

function buildAllocationRow(input: {
  sku: string;
  allocated: number | null;
  method: SkuAdAllocationRow["allocation_method"];
  confidence: number;
  source: SkuAdAllocationRow["attribution_source"];
  campaignIds: string[];
  attributedCampaigns: SkuAdAllocationRow["attributed_campaigns"];
  totalRawAdSpend: number;
  directSpend: number;
  campaignSpend: number;
  revenueShareSpend: number;
  validationStatus: SkuAdAllocationRow["ads_validation_status"];
  warnings: string[];
  windowStart: string | null;
  windowEnd: string | null;
}): SkuAdAllocationRow {
  return {
    sku: input.sku,
    allocated_ad_spend: input.allocated === null ? null : roundCurrency(input.allocated),
    allocation_method: input.method,
    allocation_confidence: roundRatio(input.confidence),
    attribution_source: input.source,
    campaign_ids: input.campaignIds,
    attributed_campaigns: input.attributedCampaigns,
    ads_validation_status: input.validationStatus,
    warnings: input.warnings,
    lineage: {
      raw_platform_spend: input.totalRawAdSpend,
      sku_direct_attribution: roundCurrency(input.directSpend),
      campaign_allocation: roundCurrency(input.campaignSpend),
      revenue_share_fallback: roundCurrency(input.revenueShareSpend),
      final_allocated_ads: input.allocated === null ? null : roundCurrency(input.allocated)
    },
    attribution_window_start: input.windowStart,
    attribution_window_end: input.windowEnd
  };
}

function emptyLineage(rawSpend: number, finalSpend: number) {
  return {
    raw_platform_spend: rawSpend,
    sku_direct_attribution: finalSpend,
    campaign_allocation: 0,
    revenue_share_fallback: 0,
    final_allocated_ads: finalSpend
  };
}

function addCampaignDetail(
  detailsBySku: Map<string, SkuAdAllocationRow["attributed_campaigns"]>,
  sku: string,
  detail: SkuAdAllocationRow["attributed_campaigns"][number]
) {
  const details = detailsBySku.get(sku) ?? [];
  details.push(detail);
  detailsBySku.set(sku, details);
}

function campaignReconciliationWarnings(
  campaignSpend: Map<string, { spend: number }>,
  campaignAllocatedByCampaign: Map<string, number>
) {
  const warnings: string[] = [];
  for (const [campaignId, campaign] of campaignSpend.entries()) {
    const allocated = roundCurrency(campaignAllocatedByCampaign.get(campaignId) ?? 0);
    if (Math.abs(roundCurrency(campaign.spend - allocated)) > 0.01) {
      warnings.push(`Campaign ${campaignId} allocation mismatch: spend ${roundCurrency(campaign.spend)} vs allocated ${allocated}.`);
    }
  }
  return warnings;
}

function reconcilePlatformAllocations(rows: SkuAdAllocationRow[], rawSpend: number) {
  const allocatedSpend = roundCurrency(sum(rows.map((row) => row.allocated_ad_spend ?? 0)));
  if (Math.abs(roundCurrency(rawSpend - allocatedSpend)) <= 0.01) return rows;

  const warning = `Platform ad allocation mismatch: raw spend ${rawSpend} vs allocated ${allocatedSpend}.`;
  return rows.map((row) => ({
    ...row,
    ads_validation_status: "FAILED" as const,
    warnings: Array.from(new Set([...row.warnings, warning]))
  }));
}

function platformAttributionSource(): SkuAdAllocationRow["attribution_source"] {
  return "sku_allocation";
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

function adSpendValue(row: Record<string, unknown>) {
  return firstNumber(
    row.spend,
    row.ad_spend,
    row.ads_spend,
    row.amount_spent,
    row.amountSpent,
    row["amount spent"],
    row["Amount spent"],
    row.total_spend,
    row.total_ad_spend,
    row.ad_cost,
    row.cost
  );
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
