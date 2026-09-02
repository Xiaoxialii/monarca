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
process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/monarca_test";
const { buildEcommerceSalesDashboardData, emptyEcommerceCanonicalDataset } = jiti("./lib/dashboard/ecommerce-sales-dashboard-data.ts");
const { __ecommerceSalesDashboardLoaderTestHooks } = jiti("./lib/dashboard/ecommerce-sales-dashboard-loader.ts");

function dataset() {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
        { order_id: "2", revenue: 200, order_date: "2026-06-02", currency: "USD", platform: "amazon" },
        { order_id: "3", revenue: 50, order_date: "2026-06-10", currency: "USD", platform: "tiktok" }
      ],
      ecommerce_order_items: [
        { order_id: "1", product_id: "p1", sku: "A", price: 50, quantity: 2 },
        { order_id: "2", product_id: "p2", sku: "B", price: 100, quantity: 2 },
        { order_id: "3", product_id: "p1", sku: "A", price: 50, quantity: 1 }
      ],
      ecommerce_products: [
        { product_id: "p1", product_name: "Item A", sku: "A", price: 50 },
        { product_id: "p2", product_name: "Item B", sku: "B", price: 100 }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: [
        { refund_id: "r1", order_id: "1", amount: 10, refund_date: "2026-06-03" }
      ],
      ecommerce_inventory: [
        { sku: "A", warehouse_id: "WH1", stock_level: 12, available_stock: 10, reorder_point: 5, fulfillment_days: 3 },
        { sku: "B", warehouse_id: "WH1", stock_level: 20, available_stock: 18, reorder_point: 8, fulfillment_days: 2 }
      ]
    },
    metadata: {
      source_platforms: ["shopify", "amazon", "tiktok"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 9, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  };
}

test("ecommerce sales dashboard builds KPI, trend, SKU, refund, and catalog sections", () => {
  const result = buildEcommerceSalesDashboardData(dataset());

  assert.equal(result.metrics.revenue, 350);
  assert.equal(result.metrics.orders, 3);
  assert.equal(result.metrics.aov, 116.67);
  assert.equal(result.metrics.refund_rate, 0.0286);
  assert.equal(result.metrics.total_sku_count, 2);
  assert.deepEqual(result.trends.daily_revenue.map((row) => [row.period, row.revenue]), [
    ["2026-06-01", 100],
    ["2026-06-02", 200],
    ["2026-06-10", 50]
  ]);
  assert.equal(result.trends.weekly_revenue.length, 2);
  assert.equal(result.sku_analysis.top_skus[0].sku, "B");
  assert.equal(result.sku_analysis.top_skus[0].revenue, 200);
  assert.equal(result.refund_insights.refund_amount, 10);
  assert.equal(result.refund_insights.top_refunded_products[0].product_id, "p1");
  assert.equal(result.catalog_health.product_count, 2);
  assert.equal(result.catalog_health.variant_count, 2);
  assert.equal(result.catalog_health.tracked_sku_count, 2);
  assert.equal(result.catalog_health.untracked_sku_count, 0);
  assert.equal(result.catalog_health.catalog_row_count, 2);
  assert.equal(result.catalog_health.sku_density, 1);
});

test("ecommerce sales dashboard parses uploaded currency strings before metric calculation", () => {
  const result = buildEcommerceSalesDashboardData({
    ...dataset(),
    tables: {
      ...dataset().tables,
      ecommerce_orders: [
        { order_id: "1", customer_id: "C-1", net_sales: "$100.00", order_date: "2026-06-01", currency: "USD", platform: "shopify" },
        { order_id: "2", customer_id: "C-1", gross_sales: "$200.50", order_date: "2026-06-02", currency: "USD", platform: "shopify" }
      ],
      ecommerce_order_items: [
        { order_id: "1", product_id: "p1", sku: "A", unit_price: "$100.00", quantity: "1" },
        { order_id: "2", product_id: "p1", sku: "A", unit_price: "$200.50", quantity: "1" }
      ],
      ecommerce_customers: [
        { customer_id: "C-1", total_orders: "2", total_spent: "$300.50" }
      ]
    }
  });

  assert.equal(result.decision_report.performance_overview.revenue, 300.5);
  assert.equal(result.decision_report.growth_overview.daily.length, 2);
  assert.equal(result.decision_report.customer_breakdown.ltv, 300.5);
});

test("ecommerce sales dashboard scopes metrics to selected date range before calculation", () => {
  const result = buildEcommerceSalesDashboardData(dataset(), {
    dateRange: {
      preset: "CUSTOM",
      startDate: "2026-06-02",
      endDate: "2026-06-02"
    }
  });

  assert.equal(result.metrics.revenue, 200);
  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.aov, 200);
  assert.equal(result.metrics.sku_revenue.length, 1);
  assert.equal(result.metrics.sku_revenue[0].sku, "B");
  assert.equal(result.analytics_validation.status, "VALID");
  assert.equal(result.analytics_validation.reconciliation.unique_order_ids, 1);
  assert.deepEqual(result.metadata.date_range, {
    preset: "CUSTOM",
    startDate: "2026-06-02",
    endDate: "2026-06-02"
  });
});

test("ecommerce sales dashboard rejects order artifacts with no valid paid revenue orders", () => {
  const result = buildEcommerceSalesDashboardData({
    ...dataset(),
    tables: {
      ...dataset().tables,
      ecommerce_orders: [
        { order_id: "AMAZON_ORD_0", source_id: "AMAZON_ORD_0", status: "unknown", revenue: 1156 },
        { order_id: "AMAZON_ORD_1", source_id: "AMAZON_ORD_1", status: "unknown", revenue: 500 }
      ],
      ecommerce_order_items: [
        { order_id: "AMAZON_ORD_0", source_id: "AMAZON_ORD_0", sku: "SKU_00000", quantity: 34, price: 34, revenue: 1156 },
        { order_id: "AMAZON_ORD_1", source_id: "AMAZON_ORD_1", sku: "SKU_00001", quantity: 10, price: 50, revenue: 500 }
      ],
      ecommerce_refunds: []
    }
  });

  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.core.orders_created, 2);
  assert.equal(result.analytics_validation.status, "INVALID");
  assert.ok(result.analytics_validation.errors.some((message) => message.includes("No valid paid revenue orders")));
});

test("period-scoped customer metrics do not reuse all-time customer profile aggregates", () => {
  const scoped = buildEcommerceSalesDashboardData({
    ...dataset(),
    tables: {
      ...dataset().tables,
      ecommerce_orders: [
        { order_id: "1", customer_id: "C-1", revenue: 100, order_date: "2026-06-01" },
        { order_id: "2", customer_id: "C-1", revenue: 200, order_date: "2026-06-02" },
        { order_id: "3", customer_id: "C-2", revenue: 50, order_date: "2026-07-10" }
      ],
      ecommerce_customers: [
        { customer_id: "C-1", total_orders: 99, total_spent: 99999 },
        { customer_id: "C-2", total_orders: 42, total_spent: 4242 }
      ]
    }
  }, {
    dateRange: {
      preset: "CUSTOM",
      startDate: "2026-07-10",
      endDate: "2026-07-10"
    }
  });

  assert.equal(scoped.metrics.customer.customer_count, 1);
  assert.equal(scoped.metrics.customer.avg_orders_per_customer, 1);
  assert.equal(scoped.metrics.customer.repeat_purchase_rate, 0);
});

test("ecommerce sales dashboard preserves inventory into SKU operating P&L", () => {
  const result = buildEcommerceSalesDashboardData(dataset());
  const skuA = result.decision_report.sku_breakdown.top_profit_skus.find((row) => row.sku === "A");

  assert.ok(skuA);
  assert.equal(skuA.stock_level, 12);
  assert.equal(skuA.available_stock, 10);
  assert.equal(skuA.inventory_confidence, 1);
});

test("ecommerce sales dashboard applies current formulas to legacy canonical revenue, ad, and inventory fields", () => {
  const result = buildEcommerceSalesDashboardData({
    ...emptyEcommerceCanonicalDataset(["shopify"]),
    tables: {
      ecommerce_orders: [
        { order_id: "O-1", revenue: 2811.9, refund_amount: 413.28, order_date: "2026-08-01", financial_status: "paid" },
        { order_id: "O-2", net_sales: 2824.77, refund_amount: 217.72, order_date: "2026-08-02", financial_status: "paid" }
      ],
      ecommerce_order_items: [
        { order_id: "O-1", sku: "SKU_0082", revenue: 2811.9, refund_amount: 413.28, quantity: 22, item_cost: 19.0204545455 },
        { order_id: "O-2", sku: "SKU_0015", net_sales: 2824.77, refund_amount: 217.72, quantity: 1, item_cost: 40 }
      ],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [
        { campaign_id: "META-STORE", amount_spent: 307987.15, date: "2026-08-01" }
      ],
      ecommerce_inventory: [
        { sku: "SKU_0082", available: 470, "Total Inventory Value": 35204.85, "Snapshot Date": "2026-08-09" }
      ]
    }
  });

  assert.equal(result.metrics.revenue, 5005.67);
  assert.equal(result.metrics.ads.ad_spend, 307987.15);
  assert.equal(result.metrics.ads.mer, 0.0163);
  assert.equal(result.decision_report.performance_overview.ad_spend, 307987.15);
  const sku82 = result.decision_report.sku_breakdown.top_profit_skus.find((row) => row.sku === "SKU_0082");
  assert.equal(sku82?.revenue, 2398.62);
  assert.equal(sku82?.stock_level, 470);
  assert.equal(sku82?.available_stock, 470);
  assert.equal(sku82?.inventory_value, 35204.85);
});

test("ecommerce sales dashboard dedupes Shopify wrapper rows that point to the same native Amazon order", () => {
  const result = buildEcommerceSalesDashboardData({
    ...emptyEcommerceCanonicalDataset(["amazon", "shopify"]),
    tables: {
      ecommerce_orders: [
        {
          workspace_id: "W1",
          data_source_id: "amazon-raw",
          order_id: "AMZ-0001",
          amazon_order_id: "AMZ-0001",
          gross_sales: 100,
          discount: 0,
          refund: 0,
          order_date: "2026-08-01",
          financial_status: "paid"
        },
        {
          workspace_id: "W1",
          data_source_id: "shopify-wrapper",
          order_id: "gid://shopify/Order/1",
          source_order_id: "AMZ-0001",
          gross_sales: 100,
          discount: 0,
          refund: 0,
          order_date: "2026-08-01",
          financial_status: "paid"
        }
      ],
      ecommerce_order_items: [
        {
          workspace_id: "W1",
          data_source_id: "amazon-raw",
          order_id: "AMZ-0001",
          amazon_order_id: "AMZ-0001",
          sku: "SKU_001",
          asin: "B000001",
          quantity: 2,
          gross_sales: 100,
          item_cost: 10
        },
        {
          workspace_id: "W1",
          data_source_id: "shopify-wrapper",
          order_id: "gid://shopify/Order/1",
          sku: "SKU_001",
          asin: "B000001",
          quantity: 2,
          gross_sales: 100,
          item_cost: 10
        }
      ],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  });

  assert.equal(result.metrics.core.orders_created, 1);
  assert.equal(result.metrics.core.paid_orders, 1);
  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.revenue, 100);
  assert.equal(result.metrics.core.sku_revenue[0]?.quantity, 2);
  assert.equal(result.metrics.business.cogs, 20);
});

test("ecommerce sales dashboard prefers Amazon source_id over Shopify gid when deduping wrapped orders", () => {
  const result = buildEcommerceSalesDashboardData({
    ...emptyEcommerceCanonicalDataset(["amazon", "shopify"]),
    tables: {
      ecommerce_orders: [
        {
          workspace_id: "W1",
          data_source_id: "amazon-raw",
          order_id: "AMZ-0002",
          gross_sales: 120,
          order_date: "2026-08-01",
          financial_status: "paid"
        },
        {
          workspace_id: "W1",
          data_source_id: "shopify-wrapper",
          order_id: "gid://shopify/Order/2",
          source_id: "AMZ-0002",
          gross_sales: 120,
          order_date: "2026-08-01",
          financial_status: "paid"
        }
      ],
      ecommerce_order_items: [
        {
          workspace_id: "W1",
          data_source_id: "amazon-raw",
          order_id: "AMZ-0002",
          sku: "SKU_002",
          quantity: 3,
          gross_sales: 120,
          item_cost: 8
        },
        {
          workspace_id: "W1",
          data_source_id: "shopify-wrapper",
          order_id: "gid://shopify/Order/2",
          source_id: "AMZ-0002",
          sku: "SKU_002",
          quantity: 3,
          gross_sales: 120,
          item_cost: 8
        }
      ],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  });

  assert.equal(result.metrics.core.orders_created, 1);
  assert.equal(result.metrics.core.paid_orders, 1);
  assert.equal(result.metrics.orders, 1);
  assert.equal(result.metrics.revenue, 120);
  assert.equal(result.metrics.core.sku_revenue[0]?.quantity, 3);
  assert.equal(result.metrics.business.cogs, 24);
});

test("ecommerce sales dashboard handles missing canonical data without crashing", () => {
  const result = buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset());

  assert.equal(result.metrics.revenue, 0);
  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.aov, 0);
  assert.equal(result.metrics.total_sku_count, 0);
  assert.ok(result.quality.missing_fields.includes("ecommerce_orders.*"));
  assert.ok(result.quality.estimated_metrics.includes("refund_rate"));
  assert.deepEqual(result.trends.daily_revenue, []);
});

test("ecommerce sales dashboard shows catalog preview without order items", () => {
  const result = buildEcommerceSalesDashboardData({
    ...emptyEcommerceCanonicalDataset(["shopify"]),
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: [],
      ecommerce_products: [
        {
          product_id: "shopify:123",
          variant_id: "shopify:456",
          product_name: "The Minimal Snowboard",
          sku: "snowboard-minimal",
          platform: "shopify"
        },
        {
          product_id: "shopify:123",
          variant_id: "shopify:789",
          product_name: "The Minimal Snowboard",
          sku: "",
          platform: "shopify"
        }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: []
    }
  });

  assert.equal(result.metrics.total_sku_count, 2);
  assert.equal(result.catalog_health.product_count, 1);
  assert.equal(result.catalog_health.variant_count, 2);
  assert.equal(result.catalog_health.sku_count, 2);
  assert.equal(result.catalog_health.tracked_sku_count, 1);
  assert.equal(result.catalog_health.untracked_sku_count, 1);
  assert.equal(result.catalog_health.catalog_row_count, 2);
  assert.equal(result.sku_analysis.top_skus.length, 0);
  assert.deepEqual(result.sku_analysis.catalog_preview[0], {
    product_name: "The Minimal Snowboard",
    sku: "SNOWBOARD-MINIMAL",
    variant_id: "shopify:456",
    product_id: "shopify:123"
  });
});

test("loader suppresses older duplicate order facts when newer Shopify rows expose AMZ ids only on items", () => {
  const { suppressSupersededOrderFactDatasets, mergeCanonicalDatasets } = __ecommerceSalesDashboardLoaderTestHooks;
  const workspaceId = "W1";
  const newShopifyWrapper = {
    ...emptyEcommerceCanonicalDataset(["shopify"]),
    tables: {
      ecommerce_orders: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "shopify-wrapper",
        order_id: `gid://shopify/Order/${index + 1}`,
        source_id: `gid://shopify/Order/${index + 1}`,
        gross_sales: 100,
        order_date: "2026-08-01",
        financial_status: "paid"
      })),
      ecommerce_order_items: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "shopify-wrapper",
        source_order_id: `AMZ-${String(index + 1).padStart(5, "0")}`,
        order_id: `SKU_${String(index + 1).padStart(4, "0")}`,
        sku: `SKU_${String(index + 1).padStart(4, "0")}`,
        quantity: 1,
        gross_sales: 100,
        item_cost: 10
      })),
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  };
  const oldAmazonRaw = {
    ...emptyEcommerceCanonicalDataset(["amazon"]),
    tables: {
      ecommerce_orders: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "amazon-raw",
        order_id: `AMZ-${String(index + 1).padStart(5, "0")}`,
        source_order_id: `AMZ-${String(index + 1).padStart(5, "0")}`,
        gross_sales: 100,
        order_date: "2026-08-01",
        financial_status: "paid"
      })),
      ecommerce_order_items: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "amazon-raw",
        order_id: `AMZ-${String(index + 1).padStart(5, "0")}`,
        source_order_id: `AMZ-${String(index + 1).padStart(5, "0")}`,
        sku: `SKU_${String(index + 1).padStart(4, "0")}`,
        quantity: 1,
        gross_sales: 100,
        item_cost: 10
      })),
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  };

  const scoped = suppressSupersededOrderFactDatasets([
    {
      snapshotId: "new-shopify-snapshot",
      dataSourceId: "shopify-wrapper",
      createdAt: new Date("2026-08-31T10:00:00.000Z"),
      dataset: newShopifyWrapper
    },
    {
      snapshotId: "old-amazon-snapshot",
      dataSourceId: "amazon-raw",
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      dataset: oldAmazonRaw
    }
  ]);
  const merged = scoped.map((item) => item.dataset).reduce((left, right) => mergeCanonicalDatasets(left, right));

  assert.equal(scoped.find((item) => item.dataSourceId === "amazon-raw").dataset.tables.ecommerce_orders.length, 0);
  assert.equal(scoped.find((item) => item.dataSourceId === "amazon-raw").dataset.tables.ecommerce_order_items.length, 0);
  assert.equal(merged.tables.ecommerce_orders.length, 600);
  assert.equal(merged.tables.ecommerce_order_items.length, 600);
});

test("loader compares duplicate native order overlap within provider buckets", () => {
  const { suppressSupersededOrderFactDatasets, mergeCanonicalDatasets, sourceNativeOrderIdsByProvider } = __ecommerceSalesDashboardLoaderTestHooks;
  const workspaceId = "W1";
  const shopifyWrapper = {
    ...emptyEcommerceCanonicalDataset(["shopify"]),
    tables: {
      ecommerce_orders: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "shopify-wrapper",
        order_id: `gid://shopify/Order/${index + 1}`,
        gross_sales: 100,
        order_date: "2026-08-01",
        financial_status: "paid"
      })),
      ecommerce_order_items: Array.from({ length: 700 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "shopify-wrapper",
        order_id: index < 600 ? `gid://shopify/Order/${index + 1}` : `SKU_${index}`,
        source_order_id: index < 100 ? `AMZ-${String(index + 1).padStart(8, "0")}` : undefined,
        sku: `SKU_${String(index % 100).padStart(4, "0")}`,
        quantity: 1,
        gross_sales: 100,
        item_cost: 10
      })),
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  };
  const amazonRaw = {
    ...emptyEcommerceCanonicalDataset(["amazon"]),
    tables: {
      ecommerce_orders: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "amazon-raw",
        order_id: `AMZ-${String(index + 1).padStart(8, "0")}`,
        gross_sales: 100,
        order_date: "2026-08-01",
        financial_status: "paid"
      })),
      ecommerce_order_items: Array.from({ length: 600 }, (_, index) => ({
        workspace_id: workspaceId,
        data_source_id: "amazon-raw",
        order_id: `AMZ-${String(index + 1).padStart(8, "0")}`,
        sku: `SKU_${String(index % 100).padStart(4, "0")}`,
        quantity: 1,
        gross_sales: 100,
        item_cost: 10
      })),
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: []
    }
  };

  const providerBuckets = sourceNativeOrderIdsByProvider(shopifyWrapper);
  assert.equal(providerBuckets.get("shopify").size, 600);
  assert.equal(providerBuckets.get("amazon").size, 100);

  const scoped = suppressSupersededOrderFactDatasets([
    {
      snapshotId: "new-shopify-snapshot",
      dataSourceId: "shopify-wrapper",
      createdAt: new Date("2026-08-31T10:00:00.000Z"),
      dataset: shopifyWrapper
    },
    {
      snapshotId: "old-amazon-snapshot",
      dataSourceId: "amazon-raw",
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      dataset: amazonRaw
    }
  ]);
  const merged = scoped.map((item) => item.dataset).reduce((left, right) => mergeCanonicalDatasets(left, right));

  assert.equal(scoped.find((item) => item.dataSourceId === "amazon-raw").dataset.tables.ecommerce_orders.length, 0);
  assert.equal(scoped.find((item) => item.dataSourceId === "amazon-raw").dataset.tables.ecommerce_order_items.length, 0);
  assert.equal(merged.tables.ecommerce_orders.length, 600);
  assert.equal(merged.tables.ecommerce_order_items.length, 700);
});

test("loader selects one current source per ecommerce fact role instead of merging every active historical snapshot", () => {
  const { selectCanonicalReportingSnapshots, snapshotSourceRole } = __ecommerceSalesDashboardLoaderTestHooks;
  const table = (name, rowCount) => ({ name, rowCount, artifactKey: `canonical/W/source/${name}.jsonl` });
  const snapshot = ({ id, dataSourceId, name, provider = "Excel", type = "EXCEL", tables, createdAt = "2026-08-01T00:00:00.000Z" }) => ({
    id,
    dataSourceId,
    sourceName: name,
    sourceProvider: provider,
    sourceType: type,
    createdAt: new Date(createdAt),
    publishedAt: null,
    version: 1,
    qualityReport: {},
    schemaJson: {
      sourceProvider: provider,
      sourcePlatforms: [provider],
      tables
    }
  });

  const rows = [
    snapshot({
      id: "shopify-products",
      dataSourceId: "shopify-products",
      name: "Shopify - store.myshopify.com",
      provider: "shopify",
      type: "ECOMMERCE_PLATFORM",
      tables: [table("ecommerce_products", 259)]
    }),
    snapshot({
      id: "amazon-orders-current",
      dataSourceId: "amazon-orders-current",
      name: "Excel - amazon_enriched.xlsx",
      tables: [
        table("ecommerce_orders", 600),
        table("ecommerce_order_items", 600),
        table("ecommerce_ads", 600),
        table("ecommerce_inventory", 600),
        table("ecommerce_products", 100)
      ]
    }),
    snapshot({
      id: "shopify-orders-duplicate",
      dataSourceId: "shopify-orders-duplicate",
      name: "Excel - shopify_enriched.xlsx",
      tables: [table("ecommerce_orders", 600), table("ecommerce_order_items", 600), table("ecommerce_products", 100)]
    }),
    snapshot({
      id: "meta-current",
      dataSourceId: "meta-current",
      name: "Excel - meta_ads_enriched.xlsx",
      tables: [
        table("ecommerce_order_items", 2000),
        table("ecommerce_ads", 756),
        table("ecommerce_inventory", 2000),
        table("ecommerce_products", 2000)
      ]
    }),
    snapshot({
      id: "inventory-current",
      dataSourceId: "inventory-current",
      name: "Excel - inventory_enriched.xlsx",
      tables: [table("ecommerce_inventory", 100), table("ecommerce_products", 1000)]
    })
  ];

  const selected = selectCanonicalReportingSnapshots(rows);

  assert.deepEqual(selected.map((row) => row.id), [
    "amazon-orders-current",
    "meta-current",
    "inventory-current"
  ]);
  assert.equal(snapshotSourceRole(rows[1]), "commerce");
  assert.equal(snapshotSourceRole(rows[3]), "ads");
  assert.equal(snapshotSourceRole(rows[4]), "inventory");
});

test("ecommerce dashboard data layer stays canonical-only", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/dashboard/ecommerce-sales-dashboard-data.ts"), "utf8");

  assert.doesNotMatch(source, /GraphQL|Admin API|access_token|fetch\s*\(/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
