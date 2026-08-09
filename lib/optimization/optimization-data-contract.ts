import type { EcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-data";

export type OptimizationValidationStatus = "READY" | "BLOCKED" | "WARNING";
export type OptimizationModuleId =
  | "profit"
  | "sku_attribution"
  | "inventory"
  | "advertising"
  | "pricing";

export type OptimizationFieldRequirement = {
  field: string;
  domain: "orders" | "product" | "cost" | "refund" | "advertising" | "inventory" | "channel" | "system";
  level: "required" | "recommended" | "optional" | "system";
  purpose: string;
};

export type OptimizationFieldHelpEntry = {
  title: string;
  description: string;
  fix: string;
};

export type SKUOptimizationFeature = {
  sku: string;
  revenue_30d: number;
  units_sold_30d: number;
  avg_daily_sales: number | null;
  gross_profit: number;
  net_profit: number;
  profit_margin: number;
  ad_spend: number;
  roas: number | null;
  conversion_rate: number | null;
  inventory_on_hand: number | null;
  inventory_days: number | null;
  stockout_risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  customer_value: number | null;
  channel_mix: Record<string, number>;
  lifecycle_stage: string;
  price_elasticity: number | null;
  data_confidence_score: number;
};

export type OptimizationReadinessResult = {
  status: OptimizationValidationStatus;
  score: number;
  canOptimize: string[];
  limitations: string[];
  missingFields: string[];
  missingRequiredFields: string[];
  missingRecommendedFields: string[];
  affectedModules: string[];
  confidenceByModule: Record<string, number>;
  userMessage: string;
  recommendedAction: string;
  moduleReadiness: Array<{
    id: OptimizationModuleId;
    label: string;
    status: OptimizationValidationStatus;
    confidence: number;
    missingRequiredFields: string[];
    missingRecommendedFields: string[];
    limitations: string[];
  }>;
  fieldHelp: Record<string, OptimizationFieldHelpEntry>;
  featureTable: SKUOptimizationFeature[];
};

export const OptimizationInputSchema: Record<string, OptimizationFieldRequirement[]> = {
  orders: [
    requirement("orders", "order_id", "required", "订单关联和去重"),
    requirement("orders", "order_date", "required", "交易时间、趋势、预测和模拟窗口"),
    requirement("orders", "sku", "required", "SKU 级利润与组合决策主键"),
    requirement("orders", "quantity", "required", "销量、需求预测和库存消耗"),
    requirement("orders", "revenue", "required", "SKU 收入和利润计算"),
    requirement("orders", "customer_id", "optional", "客户价值和复购分析"),
    requirement("orders", "product_id", "optional", "商品映射"),
    requirement("system", "snapshot_date", "system", "数据快照日期，不替代交易日期"),
    requirement("system", "analysis_period_start", "system", "分析窗口开始"),
    requirement("system", "analysis_period_end", "system", "分析窗口结束")
  ],
  product: [
    requirement("product", "sku", "required", "商品映射和 SKU 解释"),
    requirement("product", "product_id", "optional", "跨渠道商品关联"),
    requirement("product", "product_name", "optional", "推荐解释"),
    requirement("product", "category", "optional", "生命周期和组合分析"),
    requirement("product", "unit_price", "recommended", "价格模拟"),
    requirement("product", "list_price", "recommended", "折扣和价格弹性"),
    requirement("product", "discount", "recommended", "促销影响判断")
  ],
  cost: [
    requirement("cost", "cogs", "required", "毛利和利润影响计算"),
    requirement("cost", "shipping_cost", "recommended", "履约后贡献利润"),
    requirement("cost", "fulfillment_cost", "recommended", "履约后贡献利润"),
    requirement("cost", "platform_fee", "recommended", "平台成本"),
    requirement("cost", "payment_fee", "recommended", "支付成本"),
    requirement("cost", "warehouse_cost", "optional", "仓储成本精度"),
    requirement("cost", "handling_cost", "optional", "拣货包装成本精度")
  ],
  refund: [
    requirement("refund", "refund_id", "optional", "退款去重"),
    requirement("refund", "order_id", "optional", "退款关联"),
    requirement("refund", "sku", "optional", "SKU 退款归因"),
    requirement("refund", "refund_amount", "optional", "净收入和利润扣减")
  ],
  advertising: [
    requirement("advertising", "ad_spend", "required", "广告成本和预算分配"),
    requirement("advertising", "sku/product_id", "required", "广告到 SKU 或商品的归因"),
    requirement("advertising", "ad_date", "recommended", "广告表现时间窗口"),
    requirement("advertising", "attributed_revenue", "recommended", "ROAS 和广告扩量置信度"),
    requirement("advertising", "attribution_window", "recommended", "归因口径"),
    requirement("advertising", "campaign_id", "optional", "Campaign attribution"),
    requirement("advertising", "ad_id", "optional", "Creative attribution"),
    requirement("advertising", "impressions", "optional", "Demand signal"),
    requirement("advertising", "clicks", "optional", "Traffic quality"),
    requirement("advertising", "conversions", "optional", "Conversion efficiency"),
    requirement("advertising", "ctr", "optional", "Funnel quality"),
    requirement("advertising", "cpc", "optional", "Cost efficiency"),
    requirement("advertising", "roas", "optional", "Ad efficiency")
  ],
  inventory: [
    requirement("inventory", "sku", "required", "库存到 SKU 的关联"),
    requirement("inventory", "inventory_on_hand", "required", "库存约束和断货风险"),
    requirement("inventory", "inventory_date", "recommended", "库存快照日期"),
    requirement("inventory", "inventory_value", "optional", "Capital efficiency"),
    requirement("inventory", "inbound_inventory", "optional", "Incoming supply"),
    requirement("inventory", "supplier_lead_time", "optional", "Reorder timing"),
    requirement("inventory", "safety_stock", "optional", "Risk control"),
    requirement("inventory", "reorder_point", "optional", "补货阈值"),
    requirement("inventory", "minimum_order_quantity", "optional", "补货批量")
  ],
  channel: [
    requirement("channel", "platform/channel", "optional", "渠道优化"),
    requirement("channel", "order_channel", "optional", "订单渠道"),
    requirement("channel", "fulfillment_channel", "optional", "履约渠道"),
    requirement("channel", "region", "optional", "区域表现"),
    requirement("channel", "utm_campaign", "optional", "营销归因"),
    requirement("channel", "ad_id", "optional", "广告创意归因")
  ]
};

export const OptimizationFieldHelp: Record<string, OptimizationFieldHelpEntry> = {
  order_id: help("Order ID", "Links orders, refunds, and line items so Monarca can calculate product-level impact.", "Upload order history with an order identifier."),
  order_date: help("Order Date", "Required to analyze sales trends, demand patterns, and optimization windows. This must be the transaction date, not the upload snapshot date.", "Map the transaction date column to order_date."),
  sku: help("SKU Identifier", "SKU allows Monarca to understand profitability and make product-level decisions.", "Upload SKU-level order history or map product_code to sku."),
  quantity: help("Quantity Sold", "Used to calculate demand, inventory consumption, and profit contribution.", "Map units, qty, or quantity sold to quantity."),
  revenue: help("Revenue", "Required to calculate SKU profitability.", "Map sales, net_sales, amount, or revenue to revenue."),
  cogs: help("Product Cost", "Product cost information is required to calculate profitability.", "Upload COGS by order item or product cost by SKU. Accepted fields include cogs, product_cost, unit_cost, and cost_of_goods_sold."),
  inventory_on_hand: help("Current Inventory", "Required to evaluate stock risk and inventory decisions.", "Upload current inventory by SKU."),
  ad_spend: help("Advertising Spend", "Required to understand advertising efficiency and budget allocation.", "Upload ad spend or spend by SKU/product/campaign."),
  "sku/product_id": help("Ad SKU Mapping", "Required to connect spend to the product that can be optimized.", "Map ad product_id, sku, or promoted item to SKU/product ID.")
};

export function buildSkuOptimizationFeatures(data: EcommerceSalesDashboardData): SKUOptimizationFeature[] {
  const topRevenue = data.metrics.core.sku_revenue ?? [];
  const unitRows = data.metrics.business.sku_unit_economics ?? [];
  const unitBySku = new Map(unitRows.map((row) => [stringValue(row.sku), row]));
  const days = analysisDays(data);

  return topRevenue.map((row) => {
    const sku = stringValue(row.sku) || "Untracked SKU";
    const unit = unitBySku.get(sku);
    const revenue = numberValue(row.revenue);
    const units = numberValue(row.quantity);
    const cogs = numberValue(unit?.cogs);
    const shipping = numberValue((unit as Record<string, unknown> | undefined)?.shipping_cost);
    const fulfillment = numberValue((unit as Record<string, unknown> | undefined)?.fulfillment_cost);
    const platformFee = numberValue((unit as Record<string, unknown> | undefined)?.platform_fee);
    const paymentFee = numberValue((unit as Record<string, unknown> | undefined)?.payment_fee);
    const refund = numberValue((unit as Record<string, unknown> | undefined)?.refund_amount);
    const adSpend = numberValue(unit?.ad_cost_allocated);
    const attributedRevenue = numberValue((unit as Record<string, unknown> | undefined)?.attributed_revenue);
    const inventoryOnHand = firstFiniteNumber(unit?.stock_level, unit?.available_stock);
    const avgDailySales = days > 0 && units > 0 ? roundRatio(units / days) : null;
    const inventoryDays = inventoryOnHand !== null && avgDailySales && avgDailySales > 0
      ? roundRatio(inventoryOnHand / avgDailySales)
      : null;
    const grossProfit = roundCurrency(revenue - refund - cogs - shipping - fulfillment - platformFee - paymentFee);
    const netProfit = roundCurrency(grossProfit - adSpend);
    const margin = revenue > 0 ? roundRatio(netProfit / revenue) : 0;

    return {
      sku,
      revenue_30d: roundCurrency(revenue),
      units_sold_30d: Math.round(units),
      avg_daily_sales: avgDailySales,
      gross_profit: grossProfit,
      net_profit: netProfit,
      profit_margin: margin,
      ad_spend: roundCurrency(adSpend),
      roas: adSpend > 0 && attributedRevenue > 0 ? roundRatio(attributedRevenue / adSpend) : null,
      conversion_rate: rateValue((unit as Record<string, unknown> | undefined)?.conversion_rate),
      inventory_on_hand: inventoryOnHand,
      inventory_days: inventoryDays,
      stockout_risk: stockoutRisk(inventoryDays),
      customer_value: firstFiniteNumber((unit as Record<string, unknown> | undefined)?.customer_value, (unit as Record<string, unknown> | undefined)?.customer_ltv),
      channel_mix: objectValue((unit as Record<string, unknown> | undefined)?.channel_breakdown),
      lifecycle_stage: stringValue((unit as Record<string, unknown> | undefined)?.lifecycle_stage) || "UNKNOWN",
      price_elasticity: firstFiniteNumber((unit as Record<string, unknown> | undefined)?.price_elasticity),
      data_confidence_score: roundRatio(numberValue(unit?.profitability_confidence, data.quality.confidence_score))
    };
  });
}

export function validateOptimizationData(data: EcommerceSalesDashboardData): OptimizationReadinessResult {
  const featureTable = buildSkuOptimizationFeatures(data);
  const missing = new Set<string>();
  const recommended = new Set<string>();
  const limitations: string[] = [];

  if (!hasOrders(data)) missing.add("order_id");
  if (!hasOrderDate(data)) missing.add("order_date");
  if (!hasSku(data)) missing.add("sku");
  if (!hasQuantity(data)) missing.add("quantity");
  if (!hasRevenue(data)) missing.add("revenue");
  if (!hasCogs(data)) missing.add("cogs");
  if (!hasInventoryOnHand(data)) missing.add("inventory_on_hand");
  if (!hasAdSpend(data)) missing.add("ad_spend");
  if (!hasAdSkuMapping(data)) missing.add("sku/product_id");

  if (!hasShippingCost(data)) recommended.add("shipping_cost");
  if (!hasPlatformFee(data)) recommended.add("platform_fee");
  if (!hasPaymentFee(data)) recommended.add("payment_fee");
  if (!hasAdAttributedRevenue(data)) {
    recommended.add("attributed_revenue");
    limitations.push("Advertising optimization limited because revenue attribution is unavailable.");
  }
  if (!hasAdDate(data)) {
    recommended.add("ad_date");
    limitations.push("Advertising confidence is lower because campaign dates are unavailable.");
  }
  if (!hasAdCampaign(data)) recommended.add("campaign_id");
  if (!hasInventoryDate(data)) recommended.add("inventory_date");
  if (!hasSupplierLeadTime(data)) {
    recommended.add("supplier_lead_time");
    limitations.push("Exact restock quantity is limited without supplier lead time.");
  }
  if (hasSingleDayOrderPattern(data)) {
    recommended.add("transaction_date_quality");
    limitations.push("Only one order date is visible. Verify order_date is the transaction date, not a snapshot_date.");
  }

  const moduleReadiness = buildModuleReadiness(missing, recommended, limitations, data);
  const blocked = missing.size > 0;
  const warning = !blocked && (recommended.size > 0 || limitations.length > 0);
  const score = readinessScore(missing.size, recommended.size, moduleReadiness);

  return {
    status: blocked ? "BLOCKED" : warning ? "WARNING" : "READY",
    score,
    canOptimize: moduleReadiness.filter((module) => module.status !== "BLOCKED").map((module) => module.label),
    limitations,
    missingFields: [...missing, ...recommended],
    missingRequiredFields: Array.from(missing),
    missingRecommendedFields: Array.from(recommended),
    affectedModules: moduleReadiness.filter((module) => module.status !== "READY").map((module) => module.label),
    confidenceByModule: Object.fromEntries(moduleReadiness.map((module) => [module.label, module.confidence])),
    userMessage: blocked
      ? `We cannot run optimization yet because required fields are missing: ${Array.from(missing).join(", ")}.`
      : warning
        ? "Optimization can run, but some modules will use lower confidence because recommended data is missing."
        : "Optimization is ready.",
    recommendedAction: blocked
      ? "Upload or map SKU-level order history, product cost, inventory, and ad spend before running optimization."
      : warning
        ? "Run optimization, then improve confidence by adding attribution, inventory timing, and fee fields."
        : "Run optimization.",
    moduleReadiness,
    fieldHelp: Object.fromEntries([...missing, ...recommended].map((field) => [field, OptimizationFieldHelp[field] ?? help(field, fieldHelpDescription(field), "Review column mapping or upload enriched data.")])),
    featureTable
  };
}

function buildModuleReadiness(missing: Set<string>, recommended: Set<string>, limitations: string[], data: EcommerceSalesDashboardData): OptimizationReadinessResult["moduleReadiness"] {
  return [
    module("profit", "Profit Calculation", ["sku", "quantity", "revenue", "cogs"], ["shipping_cost", "platform_fee", "payment_fee"], missing, recommended, []),
    module("sku_attribution", "SKU Portfolio Optimization", ["sku", "quantity", "revenue"], [], missing, recommended, []),
    module("inventory", "Inventory Recommendation", ["sku", "inventory_on_hand"], ["inventory_date", "supplier_lead_time"], missing, recommended, limitations.filter((item) => /inventory|restock|lead time|order date/i.test(item))),
    module("advertising", "Advertising Optimization", ["ad_spend", "sku/product_id"], ["ad_date", "attributed_revenue", "campaign_id"], missing, recommended, limitations.filter((item) => /advertising|attribution|roas|campaign date/i.test(item)), { warnOnRecommended: false }),
    module("pricing", "Pricing Optimization", ["sku", "quantity", "revenue"], ["unit_price", "list_price"], missing, recommended, hasPricingInputs(data) ? [] : ["PRICE_UP and PRICE_DOWN are disabled until unit price or list price history is available."])
  ];
}

function module(
  id: OptimizationModuleId,
  label: string,
  requiredFields: string[],
  recommendedFields: string[],
  missing: Set<string>,
  recommended: Set<string>,
  limitations: string[],
  options: { warnOnRecommended?: boolean } = {}
) {
  const missingRequiredFields = requiredFields.filter((field) => missing.has(field));
  const missingRecommendedFields = recommendedFields.filter((field) => recommended.has(field));
  const warnOnRecommended = options.warnOnRecommended ?? true;
  const status: OptimizationValidationStatus = missingRequiredFields.length
    ? "BLOCKED"
    : warnOnRecommended && (missingRecommendedFields.length || limitations.length)
      ? "WARNING"
      : "READY";
  const confidence = status === "BLOCKED"
    ? 0
    : Math.max(0.35, roundRatio(1 - (missingRecommendedFields.length * 0.12) - (limitations.length * 0.1)));

  return {
    id,
    label,
    status,
    confidence,
    missingRequiredFields,
    missingRecommendedFields,
    limitations
  };
}

function requirement(domain: OptimizationFieldRequirement["domain"], field: string, level: OptimizationFieldRequirement["level"], purpose: string): OptimizationFieldRequirement {
  return { domain, field, level, purpose };
}

function help(title: string, description: string, fix: string): OptimizationFieldHelpEntry {
  return { title, description, fix };
}

function hasOrders(data: EcommerceSalesDashboardData) {
  return numberValue(data.metrics.core.orders) > 0;
}

function hasOrderDate(data: EcommerceSalesDashboardData) {
  return data.trends.daily_revenue.length > 0 && !isMissing(data, /order_date/i);
}

function hasSku(data: EcommerceSalesDashboardData) {
  return (data.metrics.core.sku_revenue ?? []).some((row) => stringValue(row.sku)) && !isMissing(data, /ecommerce_order_items\.sku|line_?items?.*sku/i);
}

function hasQuantity(data: EcommerceSalesDashboardData) {
  return (data.metrics.core.sku_revenue ?? []).some((row) => numberValue(row.quantity) > 0) && !isMissing(data, /quantity/i);
}

function hasRevenue(data: EcommerceSalesDashboardData) {
  return (data.metrics.core.sku_revenue ?? []).some((row) => numberValue(row.revenue) > 0) &&
    !isMissing(data, /ecommerce_order_items\.(revenue|net_sales|gross_sales)|^revenue$|^net_sales$|^gross_sales$/i);
}

function hasCogs(data: EcommerceSalesDashboardData) {
  return (data.metrics.business.sku_unit_economics ?? []).some((row) => numberValue(row.cogs) > 0 && stringValue(row.cogs_status) !== "MISSING");
}

function hasInventoryOnHand(data: EcommerceSalesDashboardData) {
  const rows = data.metrics.business.sku_unit_economics ?? [];
  return rows.some((row) => firstFiniteNumber(row.stock_level, row.available_stock) !== null) && !isMissing(data, /inventory|stock/i);
}

function hasAdSpend(data: EcommerceSalesDashboardData) {
  return numberValue(data.metrics.ads.ad_spend) > 0 ||
    numberValue(data.metrics.business.ad_spend) > 0 ||
    hasCanonicalAdSpendMapping(data);
}

function hasAdSkuMapping(data: EcommerceSalesDashboardData) {
  return numberValue(data.metrics.attribution.sku_attribution_coverage) > 0 ||
    (data.metrics.business.sku_unit_economics ?? []).some((row) => numberValue(row.ad_cost_allocated) > 0) ||
    !isMissing(data, /ecommerce_ads\.(sku|product_id|variant_id)|ads?.*(sku|product_id)/i);
}

function hasShippingCost(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /shipping_cost/i);
}

function hasPlatformFee(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /platform_fee/i);
}

function hasPaymentFee(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /payment_fee/i);
}

function hasAdAttributedRevenue(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /attribution_revenue|attributed_revenue|purchase_value/i);
}

function hasAdDate(data: EcommerceSalesDashboardData) {
  const fieldMappings = data.metadata.field_mappings ?? [];
  if (fieldMappings.length) {
    return fieldMappings.some((mapping) => mapping.canonical_field === "event_date" && mapping.status !== "NEEDS_CONFIRMATION");
  }

  return !isMissing(data, /ad_date|event_date|campaign_date|ecommerce_ads\.date/i);
}

function hasAdCampaign(data: EcommerceSalesDashboardData) {
  return (data.metadata.field_mappings ?? []).some((mapping) => mapping.canonical_field === "campaign_id" && mapping.status !== "NEEDS_CONFIRMATION") ||
    !isMissing(data, /campaign_id/i);
}

function hasInventoryDate(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /inventory_date|snapshot_date|ecommerce_inventory\.date/i);
}

function hasSupplierLeadTime(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /supplier_lead_time|lead_time/i);
}

function hasPricingInputs(data: EcommerceSalesDashboardData) {
  return !isMissing(data, /unit_price|list_price|price/i);
}

function hasSingleDayOrderPattern(data: EcommerceSalesDashboardData) {
  return numberValue(data.metrics.core.orders) > 1 && data.trends.daily_revenue.length === 1;
}

function isMissing(data: EcommerceSalesDashboardData, pattern: RegExp) {
  return (data.quality.missing_fields ?? []).some((field) => pattern.test(field));
}

function hasCanonicalAdSpendMapping(data: EcommerceSalesDashboardData) {
  return (data.metadata.field_mappings ?? []).some((mapping) => {
    const sourceColumn = stringValue(mapping.source_column).toLowerCase();
    return mapping.canonical_field === "ad_spend" &&
      mapping.status !== "NEEDS_CONFIRMATION" &&
      mapping.requires_confirmation !== true &&
      /^(ad_spend|spend|advertising_spend|advertising_cost|cost|amount_spent)$/i.test(sourceColumn);
  });
}

function analysisDays(data: EcommerceSalesDashboardData) {
  const periods = data.trends.daily_revenue.map((point) => String(point.period)).filter(Boolean).sort();
  if (periods.length < 2) return Math.max(1, periods.length || 30);
  const start = new Date(periods[0]);
  const end = new Date(periods[periods.length - 1]);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? Math.min(30, days) : 30;
}

function readinessScore(missingRequiredCount: number, missingRecommendedCount: number, modules: OptimizationReadinessResult["moduleReadiness"]) {
  if (missingRequiredCount) return Math.max(0, Math.round(72 - missingRequiredCount * 12 - missingRecommendedCount * 3));
  const moduleAverage = modules.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, modules.length);
  return Math.max(0, Math.min(100, Math.round(moduleAverage * 100 - missingRecommendedCount * 2)));
}

function fieldHelpDescription(field: string) {
  if (/attributed_revenue/.test(field)) return "Improves ROAS accuracy. Missing attribution lowers advertising confidence and disables aggressive ad scaling.";
  if (/supplier_lead_time/.test(field)) return "Improves reorder timing. Missing lead time prevents false precision in exact restock quantities.";
  if (/campaign_id/.test(field)) return "Improves campaign-level attribution and budget recommendations.";
  if (/inventory_date/.test(field)) return "Separates inventory snapshot time from transaction date.";
  if (/transaction_date_quality/.test(field)) return "Order date should represent transaction time, not ingestion snapshot time.";
  return "Improves optimization confidence.";
}

function stockoutRisk(inventoryDays: number | null): SKUOptimizationFeature["stockout_risk"] {
  if (inventoryDays === null) return "UNKNOWN";
  if (inventoryDays < 14) return "HIGH";
  if (inventoryDays < 30) return "MEDIUM";
  return "LOW";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,%]/g, "")) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,%]/g, "")) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function rateValue(value: unknown) {
  const parsed = firstFiniteNumber(value);
  if (parsed === null) return null;
  return parsed > 1 ? roundRatio(parsed / 100) : roundRatio(parsed);
}

function objectValue(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, numberValue(entry)]));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
