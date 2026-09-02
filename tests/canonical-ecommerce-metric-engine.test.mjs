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
const { computeCanonicalEcommerceMetrics } = jiti("./lib/metrics/canonical-ecommerce-metric-engine.ts");

function canonicalDataset({ platform = "shopify", orders = [], items = [], products = [], customers = [], refunds = [], ads = [], inventory = [] }) {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: orders,
      ecommerce_order_items: items,
      ecommerce_products: products,
      ecommerce_customers: customers,
      ecommerce_refunds: refunds,
      ecommerce_ads: ads,
      ecommerce_inventory: inventory
    },
    metadata: {
      source_platforms: [platform],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: orders.length + items.length + products.length + customers.length + refunds.length + ads.length + inventory.length,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0.93
    }
  };
}

test("metric engine computes Shopify canonical ecommerce metrics", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "shopify",
    orders: [
      { order_id: "S-1", revenue: 120, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
      { order_id: "S-2", revenue: 80, order_date: "2026-06-02", currency: "USD", platform: "shopify" }
    ],
    items: [
      { order_id: "S-1", product_id: "P-1", sku: "SKU-1", quantity: 2, price: 50, platform: "shopify" },
      { order_id: "S-1", product_id: "P-2", sku: "SKU-2", quantity: 1, price: 20, platform: "shopify" },
      { order_id: "S-2", product_id: "P-1", sku: "SKU-1", quantity: 1, price: 80, platform: "shopify" }
    ],
    products: [
      { product_id: "P-1", product_name: "Core Product", sku: "SKU-1", price: 50, platform: "shopify" },
      { product_id: "P-2", product_name: "Addon", sku: "SKU-2", price: 20, platform: "shopify" }
    ],
    customers: [
      { customer_id: "C-1", email_hash: "hash", country: "US", platform: "shopify" }
    ],
    refunds: [
      { refund_id: "R-1", order_id: "S-1", amount: 20, reason: "customer_return", platform: "shopify" }
    ]
  }));

  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.aov, 100);
  assert.equal(result.metrics.refund_rate, 0.1);
  assert.equal(result.metrics.core.revenue, 200);
  assert.equal(result.metrics.core.orders, 2);
  assert.equal(result.metrics.core.paid_orders, 2);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue]), [["SKU-1", 180], ["SKU-2", 20]]);
  assert.equal(result.metrics.product_performance[0].product_id, "P-1");
  assert.equal(result.metadata.audit.canonical_input_only, true);
});

test("metric engine uses order line revenue and validates order/SKU reconciliation", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 999, order_date: "2026-06-01" },
      { order_id: "O-2", revenue: 999, order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-A", quantity: 2, price: 50, unit_cost: 10 },
      { order_id: "O-2", sku: "SKU-B", quantity: 1, price: 75, unit_cost: 20 }
    ],
    products: [
      { product_id: "P-1", sku: "SKU-A" },
      { product_id: "P-2", sku: "SKU-B" }
    ]
  }));

  assert.equal(result.metrics.revenue, 175);
  assert.equal(result.metrics.core.revenue, 175);
  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.aov, 87.5);
  assert.equal(result.metrics.core.aov_confidence, "HIGH");
  assert.equal(result.metadata.validation.status, "VALID");
  assert.equal(result.metadata.validation.revenue_reconciliation.revenue_from_orders, 1998);
  assert.equal(result.metadata.validation.revenue_reconciliation.revenue_from_order_items, 175);
  assert.equal(result.metadata.validation.revenue_reconciliation.revenue_from_sku_rollup, 175);
});

test("metric engine deduplicates converted duplicate order item rows across sources", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "mixed",
    orders: [
      { canonical_key: "amazon-order-row", workspace_id: "W1", data_source_id: "amazon-upload", order_id: "AMZ-100", net_sales: 100, order_date: "2026-08-01", platform: "amazon" },
      { canonical_key: "shopify-converted-order-row", workspace_id: "W1", data_source_id: "shopify-wrapper", order_id: "AMZ-100", net_sales: 100, order_date: "2026-08-01", platform: "shopify" }
    ],
    items: [
      {
        canonical_key: "amazon-item-row",
        workspace_id: "W1",
        data_source_id: "amazon-upload",
        order_id: "AMZ-100",
        sku: "SKU_0082",
        asin: "B00TEST",
        quantity: 2,
        price: 50,
        item_cost: 10,
        platform: "amazon"
      },
      {
        canonical_key: "shopify-converted-item-row",
        workspace_id: "W1",
        data_source_id: "shopify-wrapper",
        order_id: "AMZ-100",
        sku: "SKU_0082",
        asin: "B00TEST",
        quantity: 2,
        price: 50,
        item_cost: 10,
        platform: "shopify"
      }
    ]
  }));

  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.core.revenue, 100);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue, row.quantity]), [["SKU_0082", 100, 2]]);
  assert.equal(result.metrics.business.cogs, 20);
});

test("metric engine deduplicates native order ids carried in source_id", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "mixed",
    orders: [
      { canonical_key: "amazon-order-row", workspace_id: "W1", data_source_id: "amazon-upload", source_id: "AMZ-200", order_id: "row-1", net_sales: 120, order_date: "2026-08-01" },
      { canonical_key: "shopify-converted-order-row", workspace_id: "W1", data_source_id: "shopify-wrapper", source_id: "AMZ-200", order_id: "row-2", net_sales: 120, order_date: "2026-08-01" }
    ],
    items: [
      { canonical_key: "amazon-item-row", workspace_id: "W1", data_source_id: "amazon-upload", source_id: "AMZ-200", order_id: "row-1", sku: "SKU_0200", quantity: 3, price: 40, item_cost: 9 },
      { canonical_key: "shopify-converted-item-row", workspace_id: "W1", data_source_id: "shopify-wrapper", source_id: "AMZ-200", order_id: "row-2", sku: "SKU_0200", quantity: 3, price: 40, item_cost: 9 }
    ]
  }));

  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.core.revenue, 120);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue, row.quantity]), [["SKU_0200", 120, 3]]);
  assert.equal(result.metrics.business.cogs, 27);
});

test("metric engine deduplicates converted Shopify line items through parent native order id", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "mixed",
    orders: [
      { canonical_key: "amazon-order-row", workspace_id: "W1", data_source_id: "amazon-upload", order_id: "AMZ-300", gross_sales: 200, order_date: "2026-08-01", financial_status: "paid" },
      { canonical_key: "shopify-converted-order-row", workspace_id: "W1", data_source_id: "shopify-wrapper", order_id: "gid://shopify/Order/300", source_order_id: "AMZ-300", gross_sales: 200, order_date: "2026-08-01", financial_status: "paid" }
    ],
    items: [
      { canonical_key: "amazon-item-row", workspace_id: "W1", data_source_id: "amazon-upload", order_id: "AMZ-300", sku: "SKU_0300", quantity: 2, gross_sales: 200, item_cost: 25 },
      {
        canonical_key: "shopify-converted-item-row",
        workspace_id: "W1",
        data_source_id: "shopify-wrapper",
        order_id: "gid://shopify/Order/300",
        order_item_id: "gid://shopify/LineItem/300",
        product_id: "gid://shopify/Product/300",
        variant_id: "gid://shopify/ProductVariant/300",
        sku: "SKU_0300",
        quantity: 2,
        gross_sales: 200,
        item_cost: 25
      }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.sku_revenue[0]?.quantity, 2);
  assert.equal(result.metrics.business.cogs, 50);
  assert.equal(result.metrics.business.sku_unit_economics[0]?.channel_breakdown.amazon, 200);
  assert.equal(result.metrics.business.sku_unit_economics[0]?.channel_breakdown.shopify, undefined);
});

test("metric engine keeps uploaded order items when order rows lost native source order ids", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "shopify",
    orders: [
      {
        canonical_key: "shopify-order-row",
        workspace_id: "W1",
        data_source_id: "shopify-wrapper",
        source_id: "gid://shopify/Order/300",
        order_id: "gid://shopify/Order/300",
        gross_sales: 200,
        discount_amount: 20,
        refund_amount: 30,
        order_date: "2026-08-01",
        financial_status: "paid"
      }
    ],
    items: [
      {
        canonical_key: "shopify-item-row",
        workspace_id: "W1",
        data_source_id: "shopify-wrapper",
        source_order_id: "AMZ-300",
        order_id: "SKU_0300",
        sku: "SKU_0300",
        quantity: 2,
        refunded_quantity: 1,
        gross_sales: 200,
        discount_amount: 20,
        refund_amount: 30,
        item_cost: 25
      }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.revenue, 150);
  assert.equal(result.metrics.sku_revenue[0]?.quantity, 1);
  assert.equal(result.metrics.business.cogs, 25);
  assert.ok(result.metadata.estimated_metrics.includes("order_item_order_linkage"));
});

test("metric engine does not cross-source dedupe generic order ids", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "mixed",
    orders: [
      { canonical_key: "shopify-order-row", workspace_id: "W1", data_source_id: "shopify", order_id: "100", net_sales: 100, order_date: "2026-08-01", platform: "shopify" },
      { canonical_key: "amazon-order-row", workspace_id: "W1", data_source_id: "amazon", order_id: "100", net_sales: 80, order_date: "2026-08-01", platform: "amazon" }
    ],
    items: [
      { canonical_key: "shopify-item-row", workspace_id: "W1", data_source_id: "shopify", order_id: "100", sku: "SKU-S", quantity: 1, price: 100, item_cost: 20, platform: "shopify" },
      { canonical_key: "amazon-item-row", workspace_id: "W1", data_source_id: "amazon", order_id: "100", sku: "SKU-A", quantity: 1, price: 80, item_cost: 10, platform: "amazon" }
    ]
  }));

  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.core.revenue, 180);
  assert.equal(result.metrics.business.cogs, 30);
});

test("metric engine reports low AOV confidence when order ids are incomplete", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { canonical_key: "row-1", revenue: 50, order_date: "2026-06-01" },
      { canonical_key: "row-2", revenue: 75, order_date: "2026-06-02" }
    ],
    items: [
      { canonical_key: "item-1", sku: "SKU-A", quantity: 1, price: 50, unit_cost: 10 },
      { canonical_key: "item-2", sku: "SKU-B", quantity: 1, price: 75, unit_cost: 20 }
    ]
  }));

  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.core.aov_confidence, "LOW");
});

test("metric engine uses valid paid orders and gross minus discount minus refund net revenue", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "VALID-1", gross_sales: 100, discount: 10, refund: 5, financial_status: "paid", is_test: false, is_cancelled: false, order_date: "2026-06-01" },
      { order_id: "VALID-2", gross_sales: 80, discount_amount: 0, refund_amount: 0, financial_status: "partially_refunded", is_test: false, is_cancelled: false, order_date: "2026-06-02" },
      { order_id: "TEST-1", gross_sales: 999, financial_status: "paid", is_test: true, order_date: "2026-06-03" },
      { order_id: "CANCEL-1", gross_sales: 999, financial_status: "paid", is_cancelled: true, order_date: "2026-06-03" },
      { order_id: "PENDING-1", gross_sales: 999, financial_status: "pending", order_date: "2026-06-03" }
    ],
    items: [
      { order_id: "VALID-1", sku: "SKU-A", quantity: 3, refunded_quantity: 1, price: 50, item_cost: 30 },
      { order_id: "VALID-2", sku: "SKU-B", quantity: 1, price: 80, item_cost: 20 },
      { order_id: "TEST-1", sku: "SKU-X", quantity: 99, price: 10, item_cost: 10 },
      { order_id: "CANCEL-1", sku: "SKU-X", quantity: 99, price: 10, item_cost: 10 },
      { order_id: "PENDING-1", sku: "SKU-X", quantity: 99, price: 10, item_cost: 10 }
    ],
    ads: [
      { ad_id: "META-1", spend: 120 }
    ]
  }));

  assert.equal(result.metrics.core.orders, 2);
  assert.equal(result.metrics.core.paid_orders, 2);
  assert.equal(result.metrics.core.revenue, 165);
  assert.equal(result.metrics.core.aov, 82.5);
  assert.deepEqual(result.metrics.core.sku_revenue.map((row) => [row.sku, row.quantity]), [["SKU-A", 2], ["SKU-B", 1]]);
  assert.equal(result.metrics.business.cogs, 80);
  assert.equal(result.metrics.business.gross_profit, 85);
  assert.equal(result.metrics.business.ad_spend, 120);
  assert.equal(result.metrics.ads.mer, 1.375);
});

test("metric engine clamps abnormal negative net revenue to zero", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "OVER-REFUND", gross_sales: 100, discount: 10, refund: 150, financial_status: "paid", order_date: "2026-06-01" },
      { order_id: "NORMAL", gross_sales: 80, discount: 5, refund: 10, financial_status: "paid", order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "OVER-REFUND", sku: "SKU-NEG", quantity: 1, gross_sales: 100, discount: 10, refund: 150, item_cost: 30 },
      { order_id: "NORMAL", sku: "SKU-OK", quantity: 1, gross_sales: 80, discount: 5, refund: 10, item_cost: 20 }
    ]
  }));

  assert.equal(result.metrics.core.orders_created, 2);
  assert.equal(result.metrics.core.paid_orders, 2);
  assert.equal(result.metrics.core.net_revenue_orders, 1);
  assert.equal(result.metrics.core.revenue, 65);
  assert.deepEqual(result.metrics.core.sku_revenue.map((row) => [row.sku, row.revenue]), [["SKU-OK", 65], ["SKU-NEG", 0]]);
});

test("authorized orders are excluded and partially paid orders use paid amount only", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "PAID", financial_status: "paid", gross_sales: 100, discount: 10, refund: 5, order_date: "2026-06-01" },
      { order_id: "AUTH", financial_status: "authorized", gross_sales: 999, order_date: "2026-06-02" },
      { order_id: "PARTIAL", financial_status: "partially_paid", gross_sales: 200, paid_amount: 70, order_date: "2026-06-03" },
      { order_id: "PARTIAL-MISSING", financial_status: "partially_paid", gross_sales: 500, order_date: "2026-06-04" },
      { order_id: "REFUNDED", financial_status: "refunded", gross_sales: 50, refund: 50, order_date: "2026-06-05" }
    ],
    items: [
      { order_id: "PAID", sku: "SKU-PAID", quantity: 1, price: 100, item_cost: 30 },
      { order_id: "AUTH", sku: "SKU-AUTH", quantity: 1, price: 999, item_cost: 1 },
      { order_id: "PARTIAL", sku: "SKU-PARTIAL", quantity: 1, price: 200, item_cost: 20 },
      { order_id: "PARTIAL-MISSING", sku: "SKU-PARTIAL-MISSING", quantity: 1, price: 500, item_cost: 20 },
      { order_id: "REFUNDED", sku: "SKU-REFUNDED", quantity: 1, refunded_quantity: 1, price: 50, item_cost: 20 }
    ]
  }));

  assert.equal(result.metrics.core.orders_created, 5);
  assert.equal(result.metrics.core.paid_orders, 3);
  assert.equal(result.metrics.core.fully_refunded_orders, 1);
  assert.equal(result.metrics.core.revenue, 155);
  assert.equal(result.metrics.core.orders, 3);
  assert.equal(result.metrics.core.aov, 51.67);
  assert.deepEqual(result.metrics.core.sku_revenue.map((row) => row.sku), ["SKU-PAID", "SKU-PARTIAL", "SKU-REFUNDED"]);
});

test("metric engine does not fall back to created orders when no paid revenue orders exist", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "amazon",
    orders: [
      { order_id: "AMAZON_ORD_0", source_id: "AMAZON_ORD_0", status: "unknown", revenue: 1156 },
      { order_id: "AMAZON_ORD_1", source_id: "AMAZON_ORD_1", status: "unknown", revenue: 500 }
    ],
    items: [
      { order_id: "AMAZON_ORD_0", source_id: "AMAZON_ORD_0", sku: "SKU_00000", quantity: 34, price: 34, revenue: 1156 },
      { order_id: "AMAZON_ORD_1", source_id: "AMAZON_ORD_1", sku: "SKU_00001", quantity: 10, price: 50, revenue: 500 }
    ]
  }));

  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.core.orders, 0);
  assert.equal(result.metrics.core.orders_created, 2);
  assert.equal(result.metrics.core.paid_orders, 0);
  assert.equal(result.metrics.revenue, 0);
  assert.equal(result.metrics.aov, 0);
});

test("order counts use canonical source order identity instead of raw rows or bare order id", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { workspace_id: "W1", data_source_id: "DS1", source_account_id: "A1", source_order_id: "ORDER-1", order_id: "DISPLAY-1", gross_sales: 100, financial_status: "paid", order_date: "2026-06-01" },
      { workspace_id: "W1", data_source_id: "DS1", source_account_id: "A1", source_order_id: "ORDER-1", order_id: "DISPLAY-1", gross_sales: 100, financial_status: "paid", order_date: "2026-06-01" },
      { workspace_id: "W1", data_source_id: "DS2", source_account_id: "A1", source_order_id: "ORDER-1", order_id: "DISPLAY-1", gross_sales: 70, financial_status: "paid", order_date: "2026-06-02" },
      { workspace_id: "W1", data_source_id: "DS1", source_account_id: "A1", source_order_id: "ORDER-2", order_id: "DISPLAY-2", gross_sales: 30, financial_status: "authorized", order_date: "2026-06-03" }
    ],
    items: [
      { order_id: "DISPLAY-1", sku: "SKU-1", quantity: 1, price: 100, item_cost: 40 }
    ]
  }));

  assert.equal(result.metrics.core.orders_created, 3);
  assert.equal(result.metrics.core.paid_orders, 2);
  assert.equal(result.metrics.core.orders, 2);
  assert.equal(result.metrics.core.revenue, 170);
  assert.equal(result.metrics.core.aov, 85);
});

test("store-level ad spend is filtered once to the non-cancelled order observation window", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", financial_status: "paid", gross_sales: 100, order_date: "2026-06-10" },
      { order_id: "O-2", financial_status: "paid", gross_sales: 200, order_date: "2026-06-20" },
      { order_id: "CANCELLED-END", financial_status: "cancelled", gross_sales: 999, order_date: "2026-06-30", is_cancelled: true }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-1", quantity: 1, price: 100, item_cost: 30 },
      { order_id: "O-2", sku: "SKU-2", quantity: 1, price: 200, item_cost: 60 },
      { order_id: "CANCELLED-END", sku: "SKU-CANCELLED", quantity: 1, price: 999, item_cost: 1 }
    ],
    ads: [
      { ad_id: "BEFORE", spend: 1000, date: "2026-06-09" },
      { ad_id: "IN-WINDOW", spend: 75, date: "2026-06-15" },
      { ad_id: "CANCELLED-ONLY-WINDOW", spend: 1500, date: "2026-06-25" },
      { ad_id: "AFTER", spend: 2000, date: "2026-06-21" }
    ]
  }));

  assert.equal(result.metrics.business.ad_spend, 75);
  assert.equal(result.metrics.ads.mer, 4);
});

test("SKU revenue subtracts item-level refund when order net revenue is unavailable", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "ORDER-0082", revenue: 2849.93, financial_status: "paid", order_date: "2026-08-01" }
    ],
    items: [
      { order_id: "ORDER-0082", sku: "SKU_0082", quantity: 22, gross_sales: 2849.93, discount_amount: 38.03, refund_amount: 413.28, item_cost: 19.0204545455 }
    ]
  }));

  const sku = result.metrics.core.sku_revenue.find((row) => row.sku === "SKU_0082");
  assert.equal(sku?.revenue, 2398.62);
  assert.equal(result.metrics.business.cogs, 418.45);
});

test("growth os metric layers compute profit customer growth and ads metrics", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "canonical-growth",
    orders: [
      { order_id: "O-1", customer_id: "C-1", revenue: 100, order_date: "2026-06-01", shipping_cost: 5 },
      { order_id: "O-2", customer_id: "C-1", revenue: 200, order_date: "2026-06-02", shipping_cost: 5 },
      { order_id: "O-3", customer_id: "C-2", revenue: 300, order_date: "2026-06-02", shipping_cost: 10 }
    ],
    items: [
      { order_id: "O-1", product_id: "P-1", sku: "SKU-A", quantity: 2, price: 50, unit_cost: 20 },
      { order_id: "O-2", product_id: "P-2", sku: "SKU-B", quantity: 2, price: 100, unit_cost: 40 },
      { order_id: "O-3", product_id: "P-3", sku: "SKU-C", quantity: 1, price: 300, unit_cost: 120 }
    ],
    products: [
      { product_id: "P-1", product_name: "One", sku: "SKU-A" },
      { product_id: "P-2", product_name: "Two", sku: "SKU-B" },
      { product_id: "P-3", product_name: "Three", sku: "SKU-C" }
    ],
    customers: [
      { customer_id: "C-1", total_orders: 2, total_spent: 300 },
      { customer_id: "C-2", total_orders: 1, total_spent: 300 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 150, impressions: 1000, clicks: 100, conversions: 3 }
    ],
    refunds: [
      { refund_id: "RF-1", order_id: "O-2", amount: 30 }
    ]
  }));

  assert.equal(result.metrics.core.revenue, 600);
  assert.equal(result.metrics.business.cogs, 240);
  assert.equal(result.metrics.business.gross_profit, 360);
  assert.equal(result.metrics.business.net_profit, 154.6);
  assert.equal(result.metrics.business.margin, 0.2577);
  assert.equal(result.metrics.business.refund_amount, 30);
  assert.equal(result.metrics.business.platform_fee, 18);
  assert.equal(result.metrics.business.payment_fee, 17.4);
  assert.equal(result.metrics.business.sku_unit_economics.length, 3);
  assert.equal(result.metrics.business.sku_unit_economics.reduce((sum, row) => Math.round((sum + (row.ad_cost_allocated ?? 0)) * 100) / 100, 0), 0);
  assert.equal(result.metrics.business.sku_unit_economics.reduce((sum, row) => Math.round((sum + row.net_profit) * 100) / 100, 0), 304.6);
  assert.ok(result.metrics.business.sku_unit_economics.every((row) => row.ad_allocation_method === "unavailable"));
  assert.ok(result.metrics.business.profit_confidence < 1);
  assert.equal(result.metrics.growth.growth_window_days, 2);
  assert.equal(result.metrics.growth.revenue_growth_rate, 0);
  assert.equal(result.metrics.growth.order_growth_rate, 0);
  assert.equal(result.metrics.growth.sku_growth_rate, 0);
  assert.deepEqual(result.metrics.growth.daily.map((row) => [row.period, row.revenue, row.orders]), [
    ["2026-06-01", 100, 1],
    ["2026-06-02", 500, 2]
  ]);
  assert.equal(result.metrics.customer.ltv, 300);
  assert.equal(result.metrics.customer.customer_revenue_ltv, 300);
  assert.ok(result.metrics.customer.customer_profit_ltv > 0);
  assert.ok(Number.isFinite(result.metrics.customer.customer_contribution_ltv));
  assert.equal(result.metrics.customer.avg_order_value_per_customer, 300);
  assert.equal(result.metrics.customer.repeat_purchase_rate, 0.5);
  assert.equal(result.metrics.customer.customer_count, 2);
  assert.equal(result.metrics.customer.new_vs_returning_ratio, 1);
  assert.equal(result.metrics.customer.acquisition_cost, null);
  assert.equal(result.metrics.customer.cac_status, "INSUFFICIENT_CUSTOMER_HISTORY");
  assert.equal(result.metrics.customer.cac_confidence, "LOW");
  assert.equal(result.metrics.customer.median_ltv, 300);
  assert.equal(result.metrics.customer.p90_ltv, 300);
  assert.equal(result.metrics.customer.top_10_percent_revenue_share, 0.5);
  assert.equal(result.metrics.customer.top_1_percent_revenue_share, 0.5);
  assert.equal(result.metrics.customer.active_customers, 2);
  assert.equal(result.metrics.customer.inactive_customers, 0);
  assert.equal(result.metrics.customer.avg_orders_per_customer, 1.5);
  assert.equal(result.metrics.customer.purchase_frequency, 1.5);
  assert.equal(result.metrics.customer.new_customers, 2);
  assert.equal(result.metrics.customer.dormant_customers, 0);
  assert.equal(result.metrics.customer.churned_customers, 0);
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 0.5);
  assert.equal(result.metrics.customer.customer_lifecycles.find((row) => row.customer_id === "C-1").lifetime_days, 1);
  assert.equal(result.metrics.customer.cohort_by_first_purchase_month.length, 0);
  assert.equal(result.metrics.customer.cohort_retention_30d, null);
  assert.equal(result.metrics.customer.revenue_per_customer_segment[0].segment, "Top 1%");
  assert.equal(result.metrics.customer.revenue_per_customer_segment[1].segment, "Next 9%");
  assert.equal(result.metrics.customer.ltv_cac_ratio, null);
  assert.equal(result.metrics.customer.payback_period_days, null);
  assert.equal(result.metrics.ads.roas, 4);
  assert.equal(result.metrics.ads.cac, null);
  assert.equal(result.metrics.ads.cac_status, "INSUFFICIENT_CUSTOMER_HISTORY");
  assert.equal(result.metrics.ads.cpa, 50);
  assert.equal(result.metrics.ads.mer, 4);
  assert.equal(result.metadata.audit.canonical_input_only, true);
});

test("inventory sales velocity uses observation window and marks single-day data low confidence", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 1000, order_date: "2026-06-01", customer_id: "C-1" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-SINGLE-DAY", quantity: 100, price: 10, unit_cost: 3 }
    ],
    inventory: [
      { sku: "SKU-SINGLE-DAY", stock_level: 500, available_stock: 500 }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU-SINGLE-DAY");
  assert.equal(sku.sales_velocity, 100);
  assert.equal(sku.normalized_daily_sales_velocity, 100);
  assert.equal(sku.velocity_window_days, 1);
  assert.equal(sku.calculation_window_days, 1);
  assert.equal(sku.velocity_calculation_basis, "observed order window");
  assert.equal(sku.data_period_days, 1);
  assert.equal(sku.velocity_confidence, "LOW");
  assert.equal(sku.inventory_risk_status, "LOW_CONFIDENCE_STOCK_RISK");
  assert.equal(sku.overstock_risk, "low");
  assert.equal(sku.stockout_risk, "unknown");
  assert.notEqual(sku.recommended_action, "RESTOCK_FIRST");
});

test("inventory risk status flags low runway even when velocity confidence is low", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 1000, order_date: "2026-06-01", customer_id: "C-1" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-LOW-RUNWAY", quantity: 100, price: 10, unit_cost: 3 }
    ],
    inventory: [
      { sku: "SKU-LOW-RUNWAY", stock_level: 1, available_stock: 1 }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU-LOW-RUNWAY");
  assert.equal(sku.velocity_confidence, "LOW");
  assert.equal(sku.days_of_inventory, 0.01);
  assert.equal(sku.inventory_risk_status, "LOW_CONFIDENCE_STOCK_RISK");
  assert.equal(sku.stockout_risk, "unknown");
});

test("inventory rows without numeric stock or value are treated as missing inventory", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 1000, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 2000, order_date: "2026-01-31", customer_id: "C-2" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-MISSING-INVENTORY", quantity: 50, price: 10, unit_cost: 3 },
      { order_id: "O-2", sku: "SKU-MISSING-INVENTORY", quantity: 50, price: 10, unit_cost: 3 }
    ],
    inventory: [
      { sku: "SKU-MISSING-INVENTORY" }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU-MISSING-INVENTORY");
  assert.equal(sku.velocity_confidence, "HIGH");
  assert.equal(sku.days_of_inventory, null);
  assert.equal(sku.inventory_confidence, 0);
  assert.equal(sku.inventory_risk_status, "OK");
  assert.equal(sku.stockout_risk, "unknown");
});

test("inventory risk status flags stockout risk for reliable low runway", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 1000, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 2000, order_date: "2026-01-31", customer_id: "C-2" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-STOCKOUT", quantity: 50, price: 10, unit_cost: 3 },
      { order_id: "O-2", sku: "SKU-STOCKOUT", quantity: 50, price: 10, unit_cost: 3 }
    ],
    inventory: [
      { sku: "SKU-STOCKOUT", stock_level: 20, available_stock: 20 }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU-STOCKOUT");
  assert.equal(sku.velocity_confidence, "HIGH");
  assert.ok(Math.abs(sku.days_of_inventory - 6.2) < 0.001);
  assert.equal(sku.inventory_risk_status, "STOCKOUT_RISK");
  assert.equal(sku.stockout_risk, "high");
});

test("inventory sales velocity uses inclusive observation history", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 1000, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 2000, order_date: "2026-01-31", customer_id: "C-2" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-30D", quantity: 100, price: 10, unit_cost: 3 },
      { order_id: "O-2", sku: "SKU-30D", quantity: 200, price: 10, unit_cost: 3 }
    ],
    inventory: [
      { sku: "SKU-30D", stock_level: 500, available_stock: 500 }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU-30D");
  assert.equal(sku.sales_velocity, 9.6774);
  assert.equal(sku.velocity_window_days, 31);
  assert.equal(sku.data_period_days, 31);
  assert.equal(sku.velocity_confidence, "HIGH");
  assert.equal(sku.days_of_inventory, 51.6668);
});

test("customer lifecycle derives first and last order dates", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 200, order_date: "2026-01-31", customer_id: "C-1" }
    ],
    customers: [{ customer_id: "C-1", total_orders: 2, total_spent: 300 }]
  }));

  assert.deepEqual(result.metrics.customer.customer_lifecycles[0], {
    customer_id: "C-1",
    first_order_date: "2026-01-01",
    last_order_date: "2026-01-31",
    lifetime_days: 30
  });
  assert.ok(result.metrics.customer.avg_orders_per_customer > 1);
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 30);
  assert.equal(result.metrics.customer.median_customer_lifetime_days, 30);
});

test("customer CAC uses period-acquired customers instead of lifecycle new segment", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", customer_id: "C-1", revenue: 100, order_date: "2026-01-01", is_paid: true },
      { order_id: "O-2", customer_id: "C-1", revenue: 120, order_date: "2026-01-20", is_paid: true },
      { order_id: "O-3", customer_id: "C-2", revenue: 180, order_date: "2026-01-21", is_paid: true },
      { order_id: "O-4", customer_id: "C-3", revenue: 200, order_date: "2026-02-01", is_paid: true }
    ],
    customers: [
      { customer_id: "C-1", first_order_date: "2026-01-01", total_orders: 99 },
      { customer_id: "C-2", first_order_date: "2026-01-21", total_orders: 99 },
      { customer_id: "C-3", first_order_date: "2026-02-01", total_orders: 99 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 300, date: "2026-01-15" }
    ]
  }));

  assert.equal(result.metrics.customer.new_customers, 3);
  assert.equal(result.metrics.customer.acquisition_cost, 100);
  assert.equal(result.metrics.ads.cac, 100);
  assert.equal(result.metrics.customer.ltv_cac_ratio, 2);
  assert.equal(result.metrics.customer.avg_orders_per_customer, 1.3333);
});

test("customer value segment rows are mutually exclusive", () => {
  const orders = Array.from({ length: 100 }, (_, index) => ({
    order_id: `O-${index + 1}`,
    customer_id: `C-${index + 1}`,
    revenue: index === 0 ? 1000 : 10,
    order_date: "2026-01-01",
    is_paid: true
  }));
  const customers = orders.map((order) => ({ customer_id: order.customer_id }));
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({ orders, customers }));
  const rows = result.metrics.customer.revenue_per_customer_segment;

  assert.deepEqual(rows.map((row) => row.segment), ["Top 1%", "Next 9%", "Middle 40%", "Bottom 50%"]);
  assert.equal(rows.reduce((sum, row) => sum + row.customers, 0), 100);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.share, 0) * 10000) / 10000, 1);
});

test("customer lifecycle derives repeat lifetime from canonical created_at fields", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-01-31", created_at_source: "2026-01-01T10:00:00.000Z", customer_id: "C-1" },
      { order_id: "O-2", revenue: 200, order_date: "2026-01-31", created_at_source: "2026-01-31T10:00:00.000Z", customer_id: "C-1" }
    ],
    customers: [{ customer_id: "C-1", total_orders: 2, total_spent: 300 }]
  }));

  assert.equal(result.metrics.customer.avg_orders_per_customer, 2);
  assert.equal(result.metrics.customer.repeat_purchase_rate, 1);
  assert.deepEqual(result.metrics.customer.customer_lifecycles[0], {
    customer_id: "C-1",
    first_order_date: "2026-01-01",
    last_order_date: "2026-01-31",
    lifetime_days: 30
  });
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 30);
});

test("customer lifecycle uses customer profile first and last order dates when order events are incomplete", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    customers: [
      {
        customer_id: "C-PROFILE",
        total_orders: 4,
        total_spent: 400,
        first_order_date: "2026-01-01",
        last_order_date: "2026-02-15"
      }
    ]
  }));

  assert.equal(result.metrics.customer.avg_orders_per_customer, 4);
  assert.equal(result.metrics.customer.repeat_purchase_rate, 1);
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 45);
  assert.deepEqual(result.metrics.customer.customer_lifecycles[0], {
    customer_id: "C-PROFILE",
    first_order_date: "2026-01-01",
    last_order_date: "2026-02-15",
    lifetime_days: 45
  });
});

test("repeat customers with same-day order dates expose lifecycle date warning", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 200, order_date: "2026-01-01", customer_id: "C-1" }
    ],
    customers: [{ customer_id: "C-1", total_orders: 2, total_spent: 300 }]
  }));

  assert.equal(result.metrics.customer.avg_orders_per_customer, 2);
  assert.equal(result.metrics.customer.repeat_purchase_rate, 1);
  assert.equal(result.metrics.customer.avg_customer_lifetime_days, 0);
  assert.ok(result.metrics.customer.warnings.some((warning) => /Repeat customers require distinct canonical order dates/i.test(warning)));
});

test("customer profile total spent does not double count order revenue", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", revenue: 200, order_date: "2026-01-31", customer_id: "C-1" }
    ],
    customers: [{ customer_id: "C-1", total_orders: 2, total_spent: 300, first_order_date: "2026-01-01", last_order_date: "2026-01-31" }]
  }));

  assert.equal(result.metrics.customer.ltv, 300);
});

test("metric engine parses currency strings in customer and order fields", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: "$100.00", order_date: "2026-01-01", customer_id: "C-1" },
      { order_id: "O-2", net_sales: "$200.50", order_date: "2026-01-31", customer_id: "C-1" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-1", quantity: "1", unit_price: "$100.00" },
      { order_id: "O-2", sku: "SKU-1", quantity: "1", unit_price: "$200.50" }
    ],
    customers: [{ customer_id: "C-1", total_orders: "2", total_spent: "$300.50" }]
  }));

  assert.equal(result.metrics.core.revenue, 300.5);
  assert.equal(result.metrics.customer.ltv, 300.5);
  assert.equal(result.metrics.customer.median_ltv, 300.5);
});

test("single-period customer data returns low CAC and LTV confidence", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-01-01", customer_id: "C-1" }
    ],
    customers: [{ customer_id: "C-1", is_new_customer: true, total_orders: 1 }],
    ads: [{ ad_id: "A-1", campaign_id: "CMP-1", spend: 100 }]
  }));

  assert.equal(result.metrics.ads.cac, null);
  assert.equal(result.metrics.ads.cac_confidence, "LOW");
  assert.equal(result.metrics.customer.cac_status, "INSUFFICIENT_CUSTOMER_HISTORY");
  assert.equal(result.metrics.customer.ltv_confidence, "LOW");
  assert.ok(result.metrics.customer.warnings.some((warning) => /Limited customer history/i.test(warning)));
  assert.ok(result.metrics.customer.warnings.some((warning) => /Limited historical window/i.test(warning)));
  assert.ok(result.metrics.customer.warnings.some((warning) => /Insufficient cohort history/i.test(warning)));
});

test("metric engine validation fixture is mathematically correct and deterministic", () => {
  const input = {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100 },
        { order_id: "2", revenue: 200 }
      ],
      ecommerce_order_items: [
        { order_id: "1", sku: "A", price: 50, quantity: 2 },
        { order_id: "2", sku: "B", price: 100, quantity: 2 }
      ],
      ecommerce_products: [
        { product_id: "p1", product_name: "Item A" }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: [
        { refund_id: "r1", order_id: "1", amount: 10 }
      ],
      ecommerce_ads: []
    },
    metadata: {
      source_platforms: ["canonical-fixture"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: 6,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 1
    }
  };

  const runs = [
    computeCanonicalEcommerceMetrics(input),
    computeCanonicalEcommerceMetrics(input),
    computeCanonicalEcommerceMetrics(input)
  ];
  const skuRevenue = Object.fromEntries(runs[0].metrics.sku_revenue.map((row) => [row.sku, row.revenue]));

  assert.equal(runs[0].metrics.revenue, 300);
  assert.equal(runs[0].metrics.orders, 2);
  assert.equal(runs[0].metrics.aov, 150);
  assert.equal(runs[0].metrics.refund_rate, 0.0333);
  assert.deepEqual(skuRevenue, { B: 200, A: 100 });
  assert.ok(runs[0].metadata.confidence_score < 1);
  assert.ok(runs[0].metadata.missing_fields.includes("ecommerce_order_items.cogs"));
  assert.ok(runs[0].metadata.estimated_metrics.includes("business.net_profit"));
  assert.equal(JSON.stringify(runs[0]), JSON.stringify(runs[1]));
  assert.equal(JSON.stringify(runs[1]), JSON.stringify(runs[2]));
});

test("metric engine computes Amazon canonical input without raw provider data", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "amazon",
    orders: [
      { order_id: "A-1", revenue: 70, order_date: "2026-06-03", currency: "USD", platform: "amazon" }
    ],
    items: [
      { order_id: "A-1", product_id: "ASIN-1", sku: "AMZ-1", quantity: 2, price: 35, platform: "amazon" }
    ],
    products: [
      { product_id: "ASIN-1", product_name: "Amazon Product", sku: "AMZ-1", price: 35, platform: "amazon" }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 70);
  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.sku_revenue[0].sku, "AMZ-1");
  assert.ok(result.metadata.estimated_metrics.includes("refund_rate"));
});

test("metric engine computes TikTok canonical conversion input", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "tiktok",
    orders: [
      { order_id: "TT-1", revenue: 45, order_date: "2026-06-04", currency: "USD", platform: "tiktok" }
    ],
    items: [
      { order_id: "TT-1", product_id: "TT-P-1", sku: "TT-SKU", quantity: 1, price: 45, platform: "tiktok" }
    ],
    products: [
      { product_id: "TT-P-1", product_name: "Creator Bundle", sku: "TT-SKU", price: 45, platform: "tiktok" }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 45);
  assert.equal(result.metrics.aov, 45);
  assert.equal(result.metrics.product_performance[0].revenue, 45);
});

test("metric engine supports mixed multi-platform canonical data", () => {
  const dataset = canonicalDataset({
    platform: "mixed",
    orders: [
      { order_id: "S-1", revenue: 100, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
      { order_id: "A-1", revenue: 60, order_date: "2026-06-02", currency: "USD", platform: "amazon" },
      { order_id: "TT-1", revenue: 40, order_date: "2026-06-03", currency: "USD", platform: "tiktok" }
    ],
    items: [
      { order_id: "S-1", product_id: "P-1", sku: "SKU", quantity: 1, price: 100, platform: "shopify" },
      { order_id: "A-1", product_id: "P-2", sku: "SKU", quantity: 2, price: 30, platform: "amazon" },
      { order_id: "TT-1", product_id: "P-3", sku: "TT", quantity: 1, price: 40, platform: "tiktok" }
    ],
    products: [
      { product_id: "P-1", product_name: "One", platform: "shopify" },
      { product_id: "P-2", product_name: "Two", platform: "amazon" },
      { product_id: "P-3", product_name: "Three", platform: "tiktok" }
    ],
    refunds: [
      { refund_id: "RF-1", order_id: "A-1", amount: 10, platform: "amazon" }
    ]
  });
  dataset.metadata.source_platforms = ["shopify", "amazon", "tiktok"];

  const result = computeCanonicalEcommerceMetrics(dataset);

  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.orders, 3);
  assert.equal(result.metrics.refund_rate, 0.05);
  assert.deepEqual(result.metadata.source_platforms.sort(), ["amazon", "shopify", "tiktok"]);
});

test("metric engine degrades confidence and marks estimates when canonical fields are missing", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "custom",
    orders: [
      { order_id: "C-1", revenue: 20, order_date: "2026-06-05", currency: "USD", platform: "custom" }
    ],
    items: [
      { order_id: "C-1", sku: "UNKNOWN-SKU", platform: "custom" }
    ],
    products: [],
    customers: [],
    refunds: []
  }));

  assert.equal(result.metrics.revenue, 20);
  assert.equal(result.metrics.orders, 1);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_order_items.price"));
  assert.ok(result.metadata.estimated_metrics.includes("sku_revenue"));
  assert.ok(result.metadata.confidence_score < 1);
});

test("customer layer does not use revenue as LTV proxy without real customer identity", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "customer-guardrail",
    orders: [
      { order_id: "NO-CUSTOMER-1", revenue: 125, order_date: "2026-06-01" },
      { order_id: "NO-CUSTOMER-2", revenue: 175, order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "NO-CUSTOMER-1", sku: "SKU-A", price: 125, quantity: 1 },
      { order_id: "NO-CUSTOMER-2", sku: "SKU-B", price: 175, quantity: 1 }
    ],
    customers: [],
    refunds: []
  }));

  assert.equal(result.metrics.customer.customer_count, 0);
  assert.equal(result.metrics.customer.ltv, 0);
  assert.notEqual(result.metrics.customer.ltv, result.metrics.core.revenue);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_orders.customer_id"));
  assert.ok(result.metadata.estimated_metrics.includes("customer.ltv"));
  assert.equal(result.metadata.data_quality_components.customer_availability, 0);
});

test("attribution layer does not report order-level coverage from aggregate ads alone", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "attribution-guardrail",
    orders: [
      { order_id: "O-1", revenue: 100, order_date: "2026-06-01" },
      { order_id: "O-2", revenue: 200, order_date: "2026-06-02" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-A", price: 100, quantity: 1 },
      { order_id: "O-2", sku: "SKU-B", price: 200, quantity: 1 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 50, impressions: 1000, clicks: 100, conversions: 3 }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.attribution.attribution_model, "none");
  assert.equal(result.metrics.attribution.order_attribution_coverage, 0);
  assert.equal(result.metrics.attribution.sku_attribution_coverage, 0);
  assert.equal(result.metrics.attribution.campaign_performance[0].roas, null);
  assert.equal(result.metrics.attribution.campaign_performance[0].attribution_status, "missing");
  assert.equal(result.metrics.ads.roas, 6);
  assert.equal(result.metrics.ads.cac, null);
  assert.equal(result.metrics.ads.mer, 6);
  assert.ok(result.metadata.missing_fields.includes("ecommerce_orders.utm_campaign"));
  assert.ok(result.metadata.estimated_metrics.includes("attribution.order_to_ad"));
});

test("attribution layer uses event-level order to campaign mapping when present", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "attribution-direct",
    orders: [
      { order_id: "O-1", customer_id: "C-1", revenue: 100, order_date: "2026-06-01", campaign_id: "CAMP-1", ad_id: "AD-1", utm_source: "meta" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU-A", price: 100, quantity: 1 }
    ],
    ads: [
      { ad_id: "AD-1", campaign_id: "CAMP-1", spend: 25, impressions: 1000, clicks: 100, conversions: 1 }
    ],
    refunds: []
  }));

  assert.equal(result.metrics.attribution.attribution_model, "last_click");
  assert.equal(result.metrics.attribution.order_attribution_coverage, 1);
  assert.equal(result.metrics.attribution.sku_attribution_coverage, 1);
  assert.equal(result.metrics.attribution.roas_by_sku, true);
  assert.deepEqual(result.metrics.attribution.campaign_performance.map((row) => [row.campaign_id, row.revenue, row.ad_spend, row.roas]), [
    ["CAMP-1", 100, 25, 4]
  ]);
  assert.deepEqual(result.metrics.attribution.sku_attribution.map((row) => [row.sku, row.campaign_id, row.revenue, row.ad_spend_allocated, row.roas]), [
    ["SKU-A", "CAMP-1", 100, 25, 4]
  ]);
  assert.equal(result.metrics.ads.roas, 4);
});

test("metric engine applies current revenue and ad spend semantics to legacy canonical rows", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "legacy-canonical",
    orders: [
      { order_id: "O-1", revenue: 2811.9, refund_amount: 413.28, order_date: "2026-08-01", financial_status: "paid" },
      { order_id: "O-2", net_sales: 2824.77, refund_amount: 217.72, order_date: "2026-08-02", financial_status: "paid" }
    ],
    items: [
      { order_id: "O-1", sku: "SKU_0082", revenue: 2811.9, refund_amount: 413.28, quantity: 22, item_cost: 19.0204545455 },
      { order_id: "O-2", sku: "SKU_0015", net_sales: 2824.77, refund_amount: 217.72, quantity: 1, item_cost: 40 }
    ],
    ads: [
      { campaign_id: "META-STORE", amount_spent: 307987.15, date: "2026-08-01" }
    ],
    inventory: [
      { sku: "SKU_0082", stock_level: 470, "Total Inventory Value": 35204.85 }
    ]
  }));

  assert.equal(result.metrics.revenue, 5005.67);
  assert.equal(result.metrics.core.revenue, 5005.67);
  assert.equal(result.metrics.ads.ad_spend, 307987.15);
  assert.equal(result.metrics.ads.mer, 0.0163);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue]), [
    ["SKU_0015", 2607.05],
    ["SKU_0082", 2398.62]
  ]);
  assert.equal(result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU_0082")?.inventory_value, 35204.85);
});

test("metric engine falls back to nearest available inventory snapshot when report date is earlier", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "inventory-fallback",
    orders: [
      { order_id: "O-INV", gross_sales: 100, order_date: "2026-08-01", financial_status: "paid" }
    ],
    items: [
      { order_id: "O-INV", sku: "SKU_0050", quantity: 1, gross_sales: 100, item_cost: 25 }
    ],
    inventory: [
      { sku: "SKU_0050", stock_level: 954, "Inventory value": 35204.85, snapshot_date: "2026-08-09" }
    ]
  }));

  const sku = result.metrics.business.sku_unit_economics.find((row) => row.sku === "SKU_0050");
  assert.equal(sku?.stock_level, 954);
  assert.equal(sku?.inventory_value, 35204.85);
  assert.notEqual(sku?.inventory_confidence, 0);
});

test("metric engine subtracts separate refunds from gross order and line artifacts", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "refund-artifact",
    orders: [
      { order_id: "O-1", gross_sales: 100, discount_amount: 10, order_date: "2026-08-01", financial_status: "paid" }
    ],
    items: [
      { order_id: "O-1", source_line_item_id: "L-1", sku: "SKU-A", gross_sales: 60, quantity: 1, item_cost: 10 },
      { order_id: "O-1", source_line_item_id: "L-2", sku: "SKU-B", gross_sales: 30, quantity: 1, item_cost: 5 }
    ],
    refunds: [
      { refund_id: "R-1", order_id: "O-1", source_line_item_id: "L-1", refund_amount: 20 }
    ]
  }));

  assert.equal(result.metrics.revenue, 70);
  assert.equal(result.metrics.core.revenue, 70);
  assert.equal(result.metrics.refund_rate, 0.2857);
  assert.deepEqual(result.metrics.sku_revenue.map((row) => [row.sku, row.revenue]), [
    ["SKU-A", 40],
    ["SKU-B", 30]
  ]);
});

test("metric engine does not subtract separate refunds from rows that only expose net revenue", () => {
  const result = computeCanonicalEcommerceMetrics(canonicalDataset({
    platform: "net-revenue-artifact",
    orders: [
      { order_id: "O-1", revenue: 70, order_date: "2026-08-01", financial_status: "paid" }
    ],
    items: [
      { order_id: "O-1", source_line_item_id: "L-1", sku: "SKU-A", revenue: 70, quantity: 1, item_cost: 10 }
    ],
    refunds: [
      { refund_id: "R-1", order_id: "O-1", source_line_item_id: "L-1", refund_amount: 20 }
    ]
  }));

  assert.equal(result.metrics.revenue, 70);
  assert.equal(result.metrics.sku_revenue[0].revenue, 70);
});

test("metric engine source stays platform agnostic and canonical-only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/metrics/canonical-ecommerce-metric-engine.ts"), "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|stripe)/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
  assert.doesNotMatch(source, /raw[A-Z_]|GraphQL|Admin API|access_token/i);
});
