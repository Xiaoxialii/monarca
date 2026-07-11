import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const jiti = jitiFactory(process.cwd() + "/");
const { calculateCostIntelligence } = jiti("./lib/cost/cost-intelligence-engine.ts");
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
  assert.equal(result.totals.fulfillment_cost, 27);
  assert.equal(result.totals.platform_fee, 9);
  assert.equal(result.totals.payment_fee, 8.7);
  assert.equal(result.totals.refund_cost, 25);
  assert.equal(result.totals.total_cost, 189.7);
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
  assert.equal(skuA?.ad_allocation_method, "campaign_window");
  assert.equal(skuA?.attribution_method, "campaign_window_fallback");
  assert.equal(skuA?.roas_status, "estimated");
  assert.equal(skuA?.roas_display, "Estimated 5.00");
  assert.equal(skuA?.cost_breakdown.ads, 20);

  assert.equal(skuB?.ad_cost_allocated, 60);
  assert.equal(skuB?.net_profit, 120);
  assert.equal(skuB?.margin, 0.4);
  assert.equal(skuB?.channel_breakdown.amazon, 300);
  assert.equal(skuB?.ad_allocation_method, "campaign_window");
  assert.equal(skuB?.cost_breakdown.ads, 60);
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
    orderItems: [{ order_id: "O-1", sku: "SKU-FAST", quantity: 10, price: 100, unit_cost: 25, campaign_id: "CAMP-1", order_date: "2024-02-01" }],
    products: [],
    orders: [
      {
        order_id: "O-1",
        revenue: 1000,
        order_date: "2024-02-01",
        shipping_cost: 20,
        handling_cost: 10,
        warehouse_cost: 5,
        platform_fee: 30,
        payment_fee: 29
      }
    ],
    ads: [{ ad_id: "AD-1", campaign_id: "CAMP-1", spend: 100, campaign_start_date: "2024-01-01" }],
    inventory: [{ sku: "SKU-FAST", stock_level: 3 }]
  });

  assert.equal(result.sku_unit_economics[0].stockout_risk, "high");
  assert.equal(result.sku_unit_economics[0].recommended_action, "RESTOCK_FIRST");
});
