import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const { calculateCostIntelligence } = jiti("./lib/cost/cost-intelligence-engine.ts");
const { allocateAdSpendToSkus } = jiti("./lib/sku/sku-ad-allocation-engine.ts");
const { resolveCogsSemantic } = jiti("./lib/semantic/cost/cogs-semantic-resolver.ts");

test("COGS semantic resolver normalizes unit cost", () => {
  const result = resolveCogsSemantic({ cogs: 20, quantity: 2, revenue: 100, price: 50 });
  assert.equal(result.cogs_type, "unit");
  assert.equal(result.normalized_cogs, 40);
  assert.equal(result.unit_cogs, 20);
  assert.ok(result.confidence >= 0.8);
});

test("COGS semantic resolver preserves total cost", () => {
  const result = resolveCogsSemantic({ cogs: 60, quantity: 2, revenue: 100, price: 50 });
  assert.equal(result.cogs_type, "total");
  assert.equal(result.normalized_cogs, 60);
  assert.equal(result.unit_cogs, 30);
  assert.ok(result.confidence >= 0.8);
});

test("cost intelligence aggregates real SKU fulfillment platform payment and refund costs", () => {
  const result = calculateCostIntelligence({
    revenue: 300,
    refundAmount: 20,
    refunds: [{ refund_id: "R-1", amount: 20, reverse_logistics_cost: 5 }],
    orderItems: [
      { order_id: "O-1", sku: "SKU-A", quantity: 2, price: 50, unit_cost: 20 },
      { order_id: "O-2", sku: "SKU-B", quantity: 1, price: 200, unit_cost: 80 }
    ],
    products: [],
    orders: [
      { order_id: "O-1", revenue: 100, shipping_cost: 8, handling_cost: 2, warehouse_cost: 1, platform_fee: 3, payment_fee: 2.9 },
      { order_id: "O-2", revenue: 200, shipping_cost: 12, handling_cost: 3, warehouse_cost: 1, platform_fee: 6, payment_fee: 5.8 }
    ],
    ads: [{ ad_id: "A-1", spend: 30 }],
    inventory: [
      { sku: "SKU-A", stock_level: 20 },
      { sku: "SKU-B", stock_level: 15 }
    ]
  });

  assert.equal(result.totals.cogs, 120);
  assert.equal(result.totals.shipping_cost, 20);
  assert.equal(result.totals.fulfillment_cost, 7);
  assert.equal(result.totals.platform_fee, 9);
  assert.equal(result.totals.payment_fee, 8.7);
  assert.equal(result.totals.refund_cost, 25);
  assert.equal(result.totals.total_cost, 219.7);
  assert.equal(result.totals.net_profit, 80.3);
  assert.equal(result.totals.margin, 0.2677);
  assert.equal(result.data_quality.cost_confidence, 1);
  assert.equal(result.data_quality.estimated_cost_ratio, 0);
  assert.deepEqual(result.data_quality.missing_cost_fields, []);
  assert.equal(result.sku_unit_economics.length, 2);
  assert.equal(result.sku_unit_economics[0].sku, "SKU-B");
  assert.equal(result.sku_unit_economics[0].sku_roas, 10);
  assert.ok(result.sku_unit_economics[0].contribution > 0);
  assert.ok(result.sku_unit_economics[0].profit_confidence < 0.5);
  assert.ok(result.sku_unit_economics[0].profit_confidence > 0.25);
  assert.equal(result.sku_unit_economics[0].ad_allocation_method, "revenue_share");
  assert.equal(result.sku_unit_economics[0].attribution_method, "revenue_share_fallback");
  assert.equal(result.sku_unit_economics[0].roas_status, "estimated");
  assert.equal(result.sku_unit_economics[0].roas_display, "Estimated 10.00");
  assert.ok(result.sku_unit_economics[0].attribution_confidence <= 0.5);
  assert.deepEqual(result.sku_unit_economics[0].estimated_components, ["ad_allocation"]);
  assert.equal(result.sku_unit_economics[0].cost_breakdown.ads, 20);
  assert.equal(result.data_quality.portfolio_reconciliation.validation_status, "PASSED");
  assert.equal(result.data_quality.portfolio_reconciliation.portfolio_net_profit, result.data_quality.portfolio_reconciliation.sku_net_profit);
});

test("cost intelligence carries product name category and variant attributes to SKU rows", () => {
  const result = calculateCostIntelligence({
    revenue: 120,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-STYLE", product_id: "P-DRESS", variant_id: "V-M", sku: "SKU-DRESS-M", quantity: 2, price: 60, unit_cost: 20 }
    ],
    products: [
      {
        product_id: "P-DRESS",
        variant_id: "V-M",
        sku: "SKU-DRESS-M",
        product_name: "女装短袖连衣裙",
        category: "裙子",
        variant_name: "夏季基础款",
        size: "M",
        color: "白色"
      }
    ],
    orders: [{ order_id: "O-STYLE", revenue: 120, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }],
    ads: [],
    inventory: []
  });

  const row = result.sku_unit_economics[0];
  assert.equal(row.product_name, "女装短袖连衣裙");
  assert.equal(row.category, "裙子");
  assert.equal(row.variant_name, "夏季基础款");
  assert.equal(row.size, "M");
  assert.equal(row.color, "白色");
});

test("portfolio profitability reconciles to SKU unit economics when order and item revenue differ", () => {
  const result = calculateCostIntelligence({
    revenue: 100,
    refundAmount: 4,
    refunds: [{ refund_id: "R-1", amount: 4 }],
    orderItems: [
      { order_id: "O-1", sku: "SKU-A", quantity: 1, revenue: 100, price: 100, unit_cost: 40 },
      { order_id: "O-1", sku: "SKU-B", quantity: 1, revenue: 50, price: 50, unit_cost: 10 }
    ],
    products: [],
    orders: [
      { order_id: "O-1", revenue: 100, shipping_cost: 8, handling_cost: 0, warehouse_cost: 0, platform_fee: 3, payment_fee: 2.9 }
    ],
    ads: [],
    inventory: []
  });

  const skuRevenue = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.revenue) * 100) / 100, 0);
  const skuNetProfit = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.net_profit) * 100) / 100, 0);
  const skuShipping = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.shipping_cost) * 100) / 100, 0);
  const skuPlatformFee = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.platform_fee) * 100) / 100, 0);
  const skuPaymentFee = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.payment_fee) * 100) / 100, 0);
  const skuRefundCost = result.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.refund_cost) * 100) / 100, 0);

  assert.equal(result.totals.revenue, 150);
  assert.equal(result.totals.net_profit, skuNetProfit);
  assert.equal(result.totals.shipping_cost, skuShipping);
  assert.equal(result.totals.platform_fee, skuPlatformFee);
  assert.equal(result.totals.payment_fee, skuPaymentFee);
  assert.equal(result.totals.refund_cost, skuRefundCost);
  assert.equal(skuRevenue, 150);
  assert.equal(skuShipping, 8);
  assert.equal(skuPlatformFee, 3);
  assert.equal(skuPaymentFee, 2.9);
  assert.equal(skuRefundCost, 4);
  assert.equal(result.data_quality.portfolio_reconciliation.source, "sku_unit_economics");
  assert.equal(result.data_quality.portfolio_reconciliation.validation_status, "FAILED");
  assert.equal(result.data_quality.portfolio_reconciliation.order_revenue, 100);
  assert.equal(result.data_quality.portfolio_reconciliation.sku_revenue, 150);
  assert.equal(result.data_quality.portfolio_reconciliation.revenue_difference, -50);
  assert.equal(result.data_quality.portfolio_reconciliation.duplicated_costs, 0);
});

test("cost intelligence safely degrades when cost fields are missing", () => {
  const result = calculateCostIntelligence({
    revenue: 100,
    refundAmount: 4,
    refunds: [],
    orderItems: [{ order_id: "O-1", sku: "SKU-MISSING", quantity: 1, price: 100 }],
    products: [],
    orders: [{ order_id: "O-1", revenue: 100 }],
    ads: []
  });

  assert.equal(result.totals.cogs, 45);
  assert.equal(result.totals.shipping_cost, 8);
  assert.equal(result.totals.platform_fee, 3);
  assert.equal(result.totals.payment_fee, 2.9);
  assert.equal(result.totals.refund_cost, 4);
  assert.equal(result.totals.net_profit, 37.1);
  assert.ok(result.data_quality.cost_confidence < 0.1);
  assert.ok(result.data_quality.missing_cost_fields.includes("ecommerce_order_items.cogs"));
  assert.ok(result.data_quality.estimated_components.includes("cogs"));
  assert.equal(result.sku_unit_economics[0].estimated, true);
  assert.ok(result.sku_unit_economics[0].estimated_components.includes("cogs"));
  assert.ok(result.sku_unit_economics[0].estimated_components.includes("shipping"));
  assert.ok(result.sku_unit_economics[0].risk_score > 0);
  assert.ok(result.sku_unit_economics[0].profit_confidence < 1);
  assert.equal(result.sku_unit_economics[0].roas_value, null);
  assert.equal(result.sku_unit_economics[0].roas_display, "No Ads");
  assert.equal(result.sku_unit_economics[0].roas_status, "not_advertised");
  assert.notEqual(result.sku_unit_economics[0].recommended_action, "REDUCE_AD_SPEND");
});

test("ad attribution revenue rows do not receive benchmark COGS", () => {
  const result = calculateCostIntelligence({
    revenue: 300,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { platform: "shopify", order_id: "SHOP-1", sku: "SKU-A", quantity: 1, revenue: 100, price: 100, cogs: 40 },
      { platform: "amazon", order_id: "AMZ-1", sku: "SKU-A", quantity: 1, revenue: 80, price: 80, cogs: 30 },
      { platform: "meta_ads", order_id: "META-1", sku: "SKU-A", quantity: 1, revenue: 120, price: 120 }
    ],
    products: [],
    orders: [],
    ads: [{ platform: "meta_ads", sku: "SKU-A", campaign_id: "C-1", spend: 10 }],
    inventory: []
  });

  const row = result.sku_unit_economics[0];
  assert.equal(result.totals.cogs, 70);
  assert.equal(row.cost_breakdown.cogs, 70);
  assert.equal(row.revenue, 300);
  assert.ok(!result.data_quality.estimated_components.includes("cogs"));
  assert.ok(!row.estimated_components.includes("cogs"));
});

test("No Ads SKU is not interpreted as poor ad performance", () => {
  const result = calculateCostIntelligence({
    revenue: 100,
    refundAmount: 0,
    refunds: [],
    orderItems: [{ order_id: "O-no-ads", sku: "SKU-NO-ADS", quantity: 1, price: 100, unit_cost: 40 }],
    products: [],
    orders: [{ order_id: "O-no-ads", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }],
    ads: []
  });

  const row = result.sku_unit_economics[0];
  assert.equal(row.roas_status, "not_advertised");
  assert.equal(row.roas_display, "No Ads");
  assert.notEqual(row.recommended_action, "REDUCE_AD_SPEND");
  assert.doesNotMatch(row.decision_reason, /ad efficiency|advertising ineffective|poor ad|reduce ad spend/i);
  assert.match(row.decision_reason, /no advertising records|acceptable/i);
});

test("SKU ROAS status distinguishes ad spend with no attributed revenue from no ads", () => {
  const result = calculateCostIntelligence({
    revenue: 0,
    refundAmount: 0,
    refunds: [],
    orderItems: [{ order_id: "O-zero", sku: "SKU-ZERO", quantity: 1, price: 0, unit_cost: 0, campaign_id: "CAMP-ZERO" }],
    products: [],
    orders: [{ order_id: "O-zero", revenue: 0 }],
    ads: [{ ad_id: "AD-zero", campaign_id: "CAMP-ZERO", spend: 25 }]
  });

  const row = result.sku_unit_economics[0];
  assert.equal(row.ad_cost_allocated, 25);
  assert.equal(row.roas_value, 0);
  assert.equal(row.roas_display, "0.00");
  assert.equal(row.roas_status, "spent_no_revenue");
  assert.match(row.decision_reason, /no attributed revenue/i);
});

test("SKU ROAS status marks revenue with unavailable attribution as missing", () => {
  const result = calculateCostIntelligence({
    revenue: 300,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-organic", sku: "SKU-ORGANIC", quantity: 1, price: 100, unit_cost: 30 },
      { order_id: "O-paid", sku: "SKU-PAID", quantity: 1, price: 200, unit_cost: 80, campaign_id: "CAMP-PAID" }
    ],
    products: [],
    orders: [
      { order_id: "O-organic", revenue: 100 },
      { order_id: "O-paid", revenue: 200 }
    ],
    ads: [{ ad_id: "AD-paid", campaign_id: "CAMP-PAID", spend: 40 }]
  });

  const bySku = new Map(result.sku_unit_economics.map((row) => [row.sku, row]));
  const organic = bySku.get("SKU-ORGANIC");
  assert.equal(organic?.ad_cost_allocated, 0);
  assert.equal(organic?.ad_allocation_method, "unavailable");
  assert.equal(organic?.roas_value, null);
  assert.equal(organic?.roas_display, "Attribution missing");
  assert.equal(organic?.roas_status, "attribution_missing");
  assert.equal(organic?.recommended_action, "NEED_MORE_DATA");
  assert.match(organic?.decision_reason ?? "", /attribution data is missing/i);
});

test("cost intelligence does not multiply row-level total COGS by quantity", () => {
  const result = calculateCostIntelligence({
    revenue: 100,
    refundAmount: 0,
    refunds: [],
    orderItems: [{ order_id: "O-1", sku: "SKU-TOTAL", quantity: 2, price: 50, cogs: 60 }],
    products: [],
    orders: [{ order_id: "O-1", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }],
    ads: [{ ad_id: "A-1", spend: 0 }]
  });

  assert.equal(result.totals.cogs, 60);
  assert.equal(result.totals.gross_profit, 40);
  assert.equal(result.totals.net_profit, 40);
  assert.equal(result.totals.margin, 0.4);
  assert.equal(result.data_quality.cogs_type_breakdown.total, 1);
  assert.equal(result.sku_unit_economics[0].cogs, 60);
  assert.equal(result.sku_unit_economics[0].net_profit, 40);
  assert.equal(result.sku_unit_economics[0].cogs_type, "total");
});

test("SKU profit allocation computes full P&L with campaign ad allocation and channel breakdown", () => {
  const result = calculateCostIntelligence({
    revenue: 400,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-1", sku: "SKU-A", quantity: 1, price: 100, unit_cost: 40, platform: "shopify", campaign_id: "CAMP-1" },
      { order_id: "O-2", sku: "SKU-B", quantity: 1, price: 300, unit_cost: 120, platform: "amazon", campaign_id: "CAMP-1" }
    ],
    products: [],
    orders: [
      { order_id: "O-1", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "O-2", revenue: 300, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }
    ],
    ads: [{ ad_id: "AD-1", campaign_id: "CAMP-1", spend: 80 }]
  });

  const bySku = new Map(result.sku_unit_economics.map((row) => [row.sku, row]));
  const skuA = bySku.get("SKU-A");
  const skuB = bySku.get("SKU-B");

  assert.equal(skuA?.ad_cost_allocated, 20);
  assert.equal(skuA?.net_profit, 40);
  assert.equal(skuA?.margin, 0.4);
  assert.equal(skuA?.channel_breakdown.shopify, 100);
  assert.equal(skuA?.ad_allocation_method, "campaign_revenue_share");
  assert.equal(skuA?.attribution_method, "campaign_revenue_share");
  assert.equal(skuA?.roas_status, "attributed");
  assert.equal(skuA?.roas_display, "5.00");
  assert.equal(skuA?.cost_breakdown.ads, 20);

  assert.equal(skuB?.ad_cost_allocated, 60);
  assert.equal(skuB?.net_profit, 120);
  assert.equal(skuB?.margin, 0.4);
  assert.equal(skuB?.channel_breakdown.amazon, 300);
  assert.equal(skuB?.ad_allocation_method, "campaign_revenue_share");
  assert.equal(skuB?.cost_breakdown.ads, 60);
});

test("campaign spend allocation reconciles by SKU campaign revenue share", () => {
  const rows = allocateAdSpendToSkus({
    skuRows: [
      { sku: "SKU-A", revenue: 500, quantity: 5 },
      { sku: "SKU-B", revenue: 300, quantity: 3 },
      { sku: "SKU-C", revenue: 200, quantity: 2 }
    ],
    orderItems: [
      { sku: "SKU-A", revenue: 500, campaign_id: "CMP-1", order_date: "2026-07-02" },
      { sku: "SKU-B", revenue: 300, campaign_id: "CMP-1", order_date: "2026-07-02" },
      { sku: "SKU-C", revenue: 200, campaign_id: "CMP-1", order_date: "2026-07-02" }
    ],
    ads: [{ campaign_id: "CMP-1", spend: 1000, date: "2026-07-01" }]
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  assert.equal(bySku.get("SKU-A")?.allocated_ad_spend, 500);
  assert.equal(bySku.get("SKU-B")?.allocated_ad_spend, 300);
  assert.equal(bySku.get("SKU-C")?.allocated_ad_spend, 200);
  assert.equal(rows.reduce((sum, row) => sum + (row.allocated_ad_spend ?? 0), 0), 1000);
  assert.equal(bySku.get("SKU-A")?.allocation_method, "campaign_revenue_share");
  assert.equal(bySku.get("SKU-A")?.ads_validation_status, "PASSED");
});

test("campaign allocation does not duplicate campaign spend across matched SKUs", () => {
  const rows = allocateAdSpendToSkus({
    skuRows: [
      { sku: "SKU-A", revenue: 1000, quantity: 10 },
      { sku: "SKU-B", revenue: 1000, quantity: 10 },
      { sku: "SKU-C", revenue: 1000, quantity: 10 }
    ],
    orderItems: [
      { sku: "SKU-A", revenue: 1000, campaign_id: "CMP-1" },
      { sku: "SKU-B", revenue: 1000, campaign_id: "CMP-1" },
      { sku: "SKU-C", revenue: 1000, campaign_id: "CMP-1" }
    ],
    ads: [{ campaign_id: "CMP-1", spend: 1000 }]
  });

  assert.equal(rows.reduce((sum, row) => sum + (row.allocated_ad_spend ?? 0), 0), 1000);
  assert.ok(rows.every((row) => row.allocated_ad_spend < 1000));
});

test("direct SKU attribution overrides fallback allocation for tagged ad rows", () => {
  const rows = allocateAdSpendToSkus({
    skuRows: [
      { sku: "SKU-A", revenue: 900, quantity: 9 },
      { sku: "SKU-B", revenue: 100, quantity: 1 }
    ],
    orderItems: [
      { sku: "SKU-A", revenue: 900 },
      { sku: "SKU-B", revenue: 100 }
    ],
    ads: [
      { campaign_id: "CMP-DIRECT", sku: "SKU-B", spend: 300 },
      { campaign_id: "CMP-FALLBACK", spend: 100 }
    ]
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  assert.equal(bySku.get("SKU-B")?.allocation_method, "direct");
  assert.equal(bySku.get("SKU-B")?.lineage.sku_direct_attribution, 300);
  assert.equal(bySku.get("SKU-B")?.allocated_ad_spend, 310);
  assert.equal(bySku.get("SKU-A")?.allocation_method, "revenue_share");
  assert.equal(rows.reduce((sum, row) => sum + (row.allocated_ad_spend ?? 0), 0), 400);
});

test("Meta ad source_id matching known SKU is treated as direct SKU attribution", () => {
  const rows = allocateAdSpendToSkus({
    skuRows: [{ sku: "SKU_00479", revenue: 23218, quantity: 131 }],
    orderItems: [{ sku: "SKU_00479", revenue: 23218 }],
    ads: [{ platform: "meta_ads", source_id: "SKU_00479", campaign_id: "CMP_479", ad_id: "AD_479", spend: 441 }]
  });

  assert.equal(rows[0]?.allocated_ad_spend, 441);
  assert.equal(rows[0]?.allocation_method, "direct");
  assert.equal(rows[0]?.allocation_confidence, 1);
  assert.equal(rows[0]?.lineage.sku_direct_attribution, 441);
  assert.equal(rows[0]?.lineage.revenue_share_fallback, 0);
});

test("SKU channel breakdown excludes inventory and file transport sources", () => {
  const result = calculateCostIntelligence({
    revenue: 300,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-1", sku: "SKU-A", quantity: 1, price: 100, unit_cost: 40, platform: "shopify" },
      { order_id: "O-2", sku: "SKU-A", quantity: 1, price: 100, unit_cost: 40, platform: "inventory" },
      { order_id: "O-3", sku: "SKU-A", quantity: 1, price: 100, unit_cost: 40, platform: "excel" }
    ],
    products: [],
    orders: [
      { order_id: "O-1", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "O-2", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "O-3", revenue: 100, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }
    ],
    ads: []
  });

  const row = result.sku_unit_economics.find((item) => item.sku === "SKU-A");
  assert.equal(row?.channel_breakdown.shopify, 100);
  assert.equal(row?.channel_breakdown.inventory, undefined);
  assert.equal(row?.channel_breakdown.excel, undefined);
  assert.deepEqual(row?.channel_details.map((channel) => channel.platform), ["shopify"]);
});

test("time-aware ad attribution excludes orders before campaign start", () => {
  const result = calculateCostIntelligence({
    revenue: 300,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-before", sku: "SKU-A", quantity: 1, price: 100, unit_cost: 30, campaign_id: "CAMP-1", order_date: "2024-01-01" },
      { order_id: "O-active", sku: "SKU-B", quantity: 1, price: 200, unit_cost: 60, campaign_id: "CAMP-1", order_date: "2024-01-10" }
    ],
    products: [],
    orders: [
      { order_id: "O-before", revenue: 100, order_date: "2024-01-01" },
      { order_id: "O-active", revenue: 200, order_date: "2024-01-10" }
    ],
    ads: [{ ad_id: "AD-1", campaign_id: "CAMP-1", spend: 90, campaign_start_date: "2024-01-05", campaign_end_date: "2024-01-08", attribution_window_days: 7 }]
  });

  const bySku = new Map(result.sku_unit_economics.map((row) => [row.sku, row]));
  assert.equal(bySku.get("SKU-A")?.ad_cost_allocated, 0);
  assert.equal(bySku.get("SKU-B")?.ad_cost_allocated, 90);
});

test("low stock profitable SKU recommends restock before scaling ads", () => {
  const result = calculateCostIntelligence({
    revenue: 1000,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-0", sku: "SKU-FAST", quantity: 1, price: 100, unit_cost: 25, campaign_id: "CAMP-1", order_date: "2024-01-02" },
      { order_id: "O-1", sku: "SKU-FAST", quantity: 9, price: 100, unit_cost: 25, campaign_id: "CAMP-1", order_date: "2024-02-01" }
    ],
    products: [],
    orders: [
      {
        order_id: "O-1",
        revenue: 900,
        order_date: "2024-02-01",
        shipping_cost: 20,
        handling_cost: 10,
        warehouse_cost: 5,
        platform_fee: 30,
        payment_fee: 29
      },
      {
        order_id: "O-0",
        revenue: 100,
        order_date: "2024-01-02",
        shipping_cost: 0,
        handling_cost: 0,
        warehouse_cost: 0,
        platform_fee: 0,
        payment_fee: 0
      }
    ],
    ads: [{ ad_id: "AD-1", campaign_id: "CAMP-1", spend: 100, campaign_start_date: "2024-01-01" }],
    inventory: [{ sku: "SKU-FAST", stock_level: 1 }]
  });

  assert.equal(result.sku_unit_economics[0].stockout_risk, "high");
  assert.equal(result.sku_unit_economics[0].recommended_action, "RESTOCK_FIRST");
});

test("SKU profitability uses direct channel source costs without duplicated allocation", () => {
  const result = calculateCostIntelligence({
    revenue: 23218,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      {
        order_id: "AMZ-00479",
        sku: "SKU_00479",
        platform: "amazon",
        quantity: 40,
        revenue: 7600,
        cogs: 4200,
        shipping_cost: 16.25,
        platform_fee: 300,
        payment_fee: 0
      },
      {
        order_id: "META-00479",
        sku: "SKU_00479",
        platform: "meta",
        quantity: 48,
        revenue: 8290,
        cogs: 4400,
        shipping_cost: 15.95,
        platform_fee: 320,
        payment_fee: 0
      },
      {
        order_id: "SHOP-00479",
        sku: "SKU_00479",
        platform: "shopify",
        quantity: 43,
        revenue: 7328,
        cogs: 4135.67,
        shipping_cost: 17.04,
        platform_fee: 296.86,
        payment_fee: 0
      }
    ],
    products: [],
    orders: [
      { order_id: "AMZ-00479", revenue: 7600, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "META-00479", revenue: 8290, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "SHOP-00479", revenue: 7328, shipping_cost: 0, handling_cost: 0, warehouse_cost: 0, platform_fee: 0, payment_fee: 0 }
    ],
    ads: [
      { ad_id: "AD-AMZ-00479", sku: "SKU_00479", platform: "amazon", spend: 183 },
      { ad_id: "AD-META-00479", sku: "SKU_00479", platform: "meta", spend: 288 },
      { ad_id: "AD-SHOP-00479", sku: "SKU_00479", platform: "shopify", spend: 335 }
    ],
    inventory: [{ sku: "SKU_00479", stock_level: 100 }]
  });

  const row = result.sku_unit_economics.find((item) => item.sku === "SKU_00479");
  assert.equal(row?.quantity, 131);
  assert.equal(row?.revenue, 23218);
  assert.equal(row?.cogs, 12735.67);
  assert.equal(row?.ad_cost_allocated, 806);
  assert.equal(row?.shipping_cost, 49.24);
  assert.equal(row?.platform_fee, 916.86);
  assert.equal(row?.payment_fee, 0);
  assert.equal(row?.cost_breakdown.fulfillment, 0);
  assert.equal(row?.net_profit, 8710.23);
  assert.equal(row?.net_profit, row.revenue - row.cogs - row.ad_cost_allocated - row.shipping_cost - row.platform_fee);
  assert.equal(row?.margin, 0.3751);
  assert.equal(row?.ad_allocation_method, "direct");
  assert.equal(result.totals.net_profit, result.sku_unit_economics.reduce((sum, item) => Math.round((sum + item.net_profit) * 100) / 100, 0));
  assert.equal(result.data_quality.portfolio_reconciliation.validation_status, "PASSED");
});

test("SKU profitability prioritizes order item cogs over product unit cost", () => {
  const result = calculateCostIntelligence({
    revenue: 23218,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      {
        order_id: "ORDER-00479",
        product_id: "PRODUCT-00479",
        sku: "SKU_00479",
        quantity: 131,
        revenue: 23218,
        cogs: 12735.67,
        shipping_cost: 18.95,
        platform_fee: 600,
        payment_fee: 366.01
      }
    ],
    products: [{ product_id: "PRODUCT-00479", sku: "SKU_00479", unit_cost: 8480.47 / 131 }],
    orders: [{ order_id: "ORDER-00479", revenue: 23218 }],
    ads: [{ ad_id: "AD-00479", sku: "SKU_00479", spend: 806 }],
    inventory: [{ sku: "SKU_00479", stock_level: 558 }]
  });

  const row = result.sku_unit_economics.find((item) => item.sku === "SKU_00479");
  assert.equal(row?.revenue, 23218);
  assert.equal(row?.quantity, 131);
  assert.equal(row?.cogs, 12735.67);
  assert.equal(row?.ad_cost_allocated, 806);
  assert.equal(row?.shipping_cost, 18.95);
  assert.equal(row?.platform_fee, 600);
  assert.equal(row?.payment_fee, 366.01);
  assert.equal(row?.total_cost, 14526.63);
  assert.equal(row?.net_profit, 8691.37);
  assert.equal(row?.margin, 0.3743);
  assert.equal(row?.net_profit, Math.round((row.revenue - row.total_cost) * 100) / 100);
  assert.equal(row?.total_cost, Math.round((row.cogs + (row.ad_cost_allocated ?? 0) + row.shipping_cost + row.platform_fee + row.payment_fee + row.fulfillment_cost + row.refund_cost) * 100) / 100);
});

test("SKU profitability falls back to product unit cost when order item cogs is missing", () => {
  const result = calculateCostIntelligence({
    revenue: 23218,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      {
        order_id: "ORDER-00479",
        product_id: "PRODUCT-00479",
        sku: "SKU_00479",
        quantity: 131,
        revenue: 23218,
        shipping_cost: 18.95,
        platform_fee: 600,
        payment_fee: 366.01
      }
    ],
    products: [{ product_id: "PRODUCT-00479", sku: "SKU_00479", unit_cost: 8480.47 / 131 }],
    orders: [{ order_id: "ORDER-00479", revenue: 23218 }],
    ads: [{ ad_id: "AD-00479", sku: "SKU_00479", spend: 806 }],
    inventory: [{ sku: "SKU_00479", stock_level: 558 }]
  });

  const row = result.sku_unit_economics.find((item) => item.sku === "SKU_00479");
  assert.equal(row?.cogs, 8480.47);
  assert.equal(row?.cogs_status, "AVAILABLE");
  assert.equal(row?.cogs_confidence, 1);
});

test("SKU direct ads keep multiple same-campaign source rows instead of collapsing spend", () => {
  const result = calculateCostIntelligence({
    revenue: 1000,
    refundAmount: 0,
    refunds: [],
    orderItems: [
      { order_id: "O-1", sku: "SKU-A", quantity: 1, revenue: 600, cogs: 200 },
      { order_id: "O-2", sku: "SKU-B", quantity: 1, revenue: 400, cogs: 120 }
    ],
    products: [],
    orders: [
      { order_id: "O-1", revenue: 600, shipping_cost: 0, platform_fee: 0, payment_fee: 0 },
      { order_id: "O-2", revenue: 400, shipping_cost: 0, platform_fee: 0, payment_fee: 0 }
    ],
    ads: [
      { campaign_id: "CAMP-SHARED", sku: "SKU-A", spend: 183, platform: "amazon", date: "2026-07-01" },
      { campaign_id: "CAMP-SHARED", sku: "SKU-A", spend: 288, platform: "meta", date: "2026-07-01" },
      { campaign_id: "CAMP-SHARED", sku: "SKU-B", spend: 335, platform: "shopify", date: "2026-07-01" }
    ]
  });

  const bySku = new Map(result.sku_unit_economics.map((row) => [row.sku, row]));
  assert.equal(result.totals.ad_spend, 806);
  assert.equal(bySku.get("SKU-A")?.ad_cost_allocated, 471);
  assert.equal(bySku.get("SKU-B")?.ad_cost_allocated, 335);
  assert.equal(bySku.get("SKU-A")?.ad_allocation_method, "direct");
  assert.equal(bySku.get("SKU-B")?.ad_allocation_method, "direct");
});
