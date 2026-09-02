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
const { buildCanonicalDatasetFromMappedRecords } = jiti("./lib/semantic/mapper/canonical-schema-engine.ts");
const { validateSemanticMapping } = jiti("./lib/semantic/mapper/mapping-validation.ts");
const { SemanticIntelligenceEngine } = jiti("./lib/semantic/engine/semantic-intelligence-engine.ts");

test("canonical engine normalizes Shopify-like adapter output into ecommerce tables", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "gid-order-1",
      fields: {
        order_id: "shopify-order-1",
        revenue: 120.5,
        order_date: "2026-06-01T00:00:00Z",
        currency: "USD",
        status: "paid",
        customer_id: "customer-1",
        product_id: "product-1",
        product_name: "Snowboard",
        sku: "SKU-1",
        quantity: 2,
        price: 60.25
      },
      unknown_fields: [{ path: "raw.admin_graphql_api_id", value: "gid-order-1" }]
    }
  ]);

  assert.equal(result.schema_version, "ecommerce_canonical_v1");
  assert.equal(result.tables.ecommerce_orders[0].order_id, "shopify-order-1");
  assert.equal(result.tables.ecommerce_order_items[0].sku, "SKU-1");
  assert.equal(result.tables.ecommerce_products[0].product_name, "Snowboard");
  assert.equal(result.tables.ecommerce_customers[0].customer_id, "customer-1");
  assert.equal(result.metadata.unknown_fields[0].path, "raw.admin_graphql_api_id");
});

test("canonical engine preserves order status and payment fields needed by metric formulas", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "amazon",
      source_id: "AMZ-ORDER-1",
      fields: {
        source_order_id: "AMZ-ORDER-1",
        order_id: "AMZ-ORDER-1",
        gross_sales: 100,
        discount_amount: 5,
        refund_amount: 10,
        total_paid: 85,
        paid_amount: 85,
        order_date: "2026-08-01",
        financial_status: "paid",
        payment_status: "captured",
        order_status: "shipped",
        fulfillment_status: "fulfilled",
        is_cancelled: false,
        is_test: false,
        is_paid: true,
        cancelled_at_source: "2026-08-02"
      }
    }
  ]);

  const order = result.tables.ecommerce_orders[0];
  assert.equal(order.source_order_id, "AMZ-ORDER-1");
  assert.equal(order.financial_status, "paid");
  assert.equal(order.payment_status, "captured");
  assert.equal(order.order_status, "shipped");
  assert.equal(order.fulfillment_status, "fulfilled");
  assert.equal(order.total_paid, 85);
  assert.equal(order.paid_amount, 85);
  assert.equal(order.is_cancelled, false);
  assert.equal(order.is_test, false);
  assert.equal(order.is_paid, true);
  assert.equal(Number.isFinite(new Date(String(order.cancelled_at_source)).getTime()), true);
});

test("canonical engine preserves refund line references for exact refund matching", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "amazon",
      source_id: "REF-1",
      fields: {
        source_refund_id: "REF-1",
        refund_id: "REF-1",
        source_order_id: "AMZ-ORDER-1",
        order_id: "AMZ-ORDER-1",
        source_line_item_id: "LINE-1",
        order_item_id: "LINE-1",
        refund_date: "2026-08-03",
        refund_amount: 12.34,
        currency: "USD",
        refund_reason: "customer_return"
      }
    }
  ]);

  const refund = result.tables.ecommerce_refunds[0];
  assert.equal(refund.source_refund_id, "REF-1");
  assert.equal(refund.order_id, "AMZ-ORDER-1");
  assert.equal(refund.source_order_id, "AMZ-ORDER-1");
  assert.equal(refund.source_line_item_id, "LINE-1");
  assert.equal(refund.order_item_id, "LINE-1");
  assert.equal(refund.refund_amount, 12.34);
  assert.equal(refund.amount, 12.34);
  assert.equal(refund.reason, "customer_return");
  assert.equal(Number.isFinite(new Date(String(refund.refund_date)).getTime()), true);
});

test("canonical engine preserves inventory value and snapshot date", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "INV-SKU-1",
      fields: {
        sku: "SKU-0050",
        stock_level: 954,
        available_stock: 900,
        inventory_quantity: 954,
        inventory_value: 35204.85,
        inventory_unit_cost: 36.9,
        warehouse_id: "MAIN",
        snapshot_date: "2026-08-09",
        currency: "USD"
      }
    }
  ]);

  const inventory = result.tables.ecommerce_inventory[0];
  assert.equal(inventory.sku, "SKU-0050");
  assert.equal(inventory.stock_level, 954);
  assert.equal(inventory.inventory_value, 35204.85);
  assert.equal(inventory.inventory_unit_cost, 36.9);
  assert.equal(inventory.date, "2026-08-09");
  assert.equal(inventory.snapshot_date, "2026-08-09");
});

test("canonical engine maps human-readable inventory value raw columns", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "INV-SKU-RAW",
      source_table: "ecommerce_inventory",
      fields: {},
      raw_record: {
        __source_table: "ecommerce_inventory",
        sku: "SKU-0050",
        available: 954,
        "Inventory value": 48129.06,
        "Snapshot Date": "2026-08-09"
      }
    }
  ]);

  const inventory = result.tables.ecommerce_inventory[0];
  assert.equal(inventory.sku, "SKU-0050");
  assert.equal(inventory.stock_level, 954);
  assert.equal(inventory.inventory_value, 48129.06);
  assert.equal(inventory.inventory_cost, 48129.06);
  assert.equal(inventory.snapshot_date, "2026-08-09");
});

test("canonical engine maps normalized inventory value aliases from raw fallback", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "INV-SKU-ALIAS",
      source_table: "ecommerce_inventory",
      fields: {},
      raw_record: {
        __source_table: "ecommerce_inventory",
        sku: "SKU-0051",
        available_quantity: 100,
        total_inventory_value: 2500,
        as_of_date: "2026-08-09"
      }
    }
  ]);

  const inventory = result.tables.ecommerce_inventory[0];
  assert.equal(inventory.sku, "SKU-0051");
  assert.equal(inventory.stock_level, 100);
  assert.equal(inventory.inventory_value, 2500);
  assert.equal(inventory.inventory_cost, 2500);
  assert.equal(inventory.snapshot_date, "2026-08-09");
});

test("canonical engine rejects sparse fact rows that polluted uploaded workbook artifacts", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "SKU_0007",
      source_table: "ecommerce_order_items",
      fields: {
        source_order_id: "AMZ-00000577",
        order_id: "SKU_0007",
        asin: "B08590191",
        sku: "SKU_0007",
        quantity: 1,
        price: 94.56,
        cogs: 37.82
      },
      raw_record: {
        source_order_id: "AMZ-00000577",
        order_id: "SKU_0007",
        asin: "B08590191",
        sku: "SKU_0007",
        quantity: 1,
        price: 94.56,
        cogs: 37.82,
        __source_table: "ecommerce_order_items"
      }
    },
    {
      platform: "shopify",
      source_id: "ORDER-1",
      source_table: "ecommerce_refunds",
      fields: {
        order_id: "ORDER-1",
        refund_amount: 0
      },
      raw_record: {
        order_id: "ORDER-1",
        refund_amount: 0,
        __source_table: "ecommerce_refunds"
      }
    },
    {
      platform: "shopify",
      source_id: "SKU_0007",
      source_table: "ecommerce_inventory",
      fields: {
        sku: "SKU_0007"
      },
      raw_record: {
        sku: "SKU_0007",
        __source_table: "ecommerce_inventory"
      }
    },
    {
      platform: "shopify",
      source_id: "LINE-1",
      source_table: "ecommerce_order_items",
      fields: {
        order_id: "ORDER-1",
        order_item_id: "LINE-1",
        sku: "SKU_0007",
        quantity: 2,
        gross_sales: 268.7
      }
    },
    {
      platform: "shopify",
      source_id: "REF-1",
      source_table: "ecommerce_refunds",
      fields: {
        order_id: "ORDER-1",
        refund_amount: 12.34
      }
    },
    {
      platform: "shopify",
      source_id: "INV-1",
      source_table: "ecommerce_inventory",
      fields: {
        sku: "SKU_0007",
        available_stock: 10,
        inventory_value: 123
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 1);
  assert.equal(result.tables.ecommerce_order_items[0].order_item_id, "LINE-1");
  assert.equal(result.tables.ecommerce_refunds.length, 1);
  assert.equal(result.tables.ecommerce_refunds[0].refund_amount, 12.34);
  assert.equal(result.tables.ecommerce_inventory.length, 1);
  assert.equal(result.tables.ecommerce_inventory[0].inventory_value, 123);
  assert.ok(result.metadata.validation.rejected.some((item) => item.reason === "missing_order_item_fact"));
  assert.ok(result.metadata.validation.rejected.some((item) => item.reason === "zero_refund_fact"));
  assert.ok(result.metadata.validation.rejected.some((item) => item.reason === "missing_inventory_fact"));
});

test("canonical engine preserves uploaded Shopify product enrichment fields", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "product-row-1",
      fields: {
        product_id: "PROD-1",
        product_name: "Performance Running Vest",
        product_type: "Activewear",
        sku: "SKU-ENRICHED",
        handle: "performance-running-vest",
        description_html: "<p>Lightweight vest for training.</p>",
        tags: "running, reflective, hydration",
        category: "Apparel & Accessories",
        collections: "Running Gear",
        featured_image_url: "https://cdn.example.com/vest.jpg",
        online_store_url: "https://example.com/products/performance-running-vest",
        seo_title: "Performance Running Vest",
        seo_description: "Reflective running vest for long-distance training.",
        compare_at_price: 129,
        barcode: "123456789012",
        inventory_quantity: 42,
        inventory_unit_cost: 31.5,
        weight: 0.4,
        weight_unit: "kg",
        metafield_keys: "custom.brand,custom.competitor_seed",
        vendor: "Monarca",
        brand: "Monarca"
      }
    }
  ]);

  const product = result.tables.ecommerce_products[0];
  assert.equal(product.sku, "SKU-ENRICHED");
  assert.equal(product.product_name, "Performance Running Vest");
  assert.equal(product.handle, "performance-running-vest");
  assert.equal(product.description_html, "<p>Lightweight vest for training.</p>");
  assert.equal(product.tags, "running, reflective, hydration");
  assert.equal(product.category, "Apparel & Accessories");
  assert.equal(product.featured_image_url, "https://cdn.example.com/vest.jpg");
  assert.equal(product.online_store_url, "https://example.com/products/performance-running-vest");
  assert.equal(product.compare_at_price, 129);
  assert.equal(product.inventory_quantity, 42);
  assert.equal(product.inventory_unit_cost, 31.5);
  assert.equal(product.weight, 0.4);
  assert.equal(product.metafield_keys, "custom.brand,custom.competitor_seed");
});

test("semantic engine preserves explicit unit cost fields", () => {
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields([
    {
      field: "item_cost",
      path: "item_cost",
      valueType: "number",
      samples: [12.5, 14],
      context: []
    }
  ]);

  assert.equal(result.candidates[0]?.maps_to, "item_cost");
});

test("semantic engine maps uploaded Shopify enrichment columns", () => {
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields([
    { field: "handle", path: "Sheet1.handle", valueType: "string", samples: ["performance-running-vest"], context: ["shopify", "product"] },
    { field: "description_html", path: "Sheet1.description_html", valueType: "string", samples: ["<p>Lightweight vest</p>"], context: ["shopify", "product"] },
    { field: "tags", path: "Sheet1.tags", valueType: "string", samples: ["running, reflective"], context: ["shopify", "product"] },
    { field: "featured_image_url", path: "Sheet1.featured_image_url", valueType: "string", samples: ["https://cdn.example.com/vest.jpg"], context: ["shopify", "product"] },
    { field: "online_store_url", path: "Sheet1.online_store_url", valueType: "string", samples: ["https://example.com/products/performance-running-vest"], context: ["shopify", "product"] },
    { field: "compare_at_price", path: "Sheet1.compare_at_price", valueType: "number", samples: [129], context: ["shopify", "product"] },
    { field: "metafield_keys", path: "Sheet1.metafield_keys", valueType: "string", samples: ["custom.brand"], context: ["shopify", "product"] }
  ]);

  const byField = new Map();
  for (const candidate of result.candidates) {
    if (!byField.has(candidate.field)) byField.set(candidate.field, candidate.maps_to);
  }
  assert.equal(byField.get("handle"), "handle");
  assert.equal(byField.get("description_html"), "description_html");
  assert.equal(byField.get("tags"), "tags");
  assert.equal(byField.get("featured_image_url"), "featured_image_url");
  assert.equal(byField.get("online_store_url"), "online_store_url");
  assert.equal(byField.get("compare_at_price"), "compare_at_price");
  assert.equal(byField.get("metafield_keys"), "metafield_keys");
});

test("semantic engine maps product context aliases across human and machine field names", () => {
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields([
    { field: "item_name", path: "Sheet.item_name", valueType: "string", samples: ["Running Vest"], context: ["product"] },
    { field: "product title", path: "Sheet.product title", valueType: "string", samples: ["Training Tee"], context: ["product"] },
    { field: "manufacturer", path: "Sheet.manufacturer", valueType: "string", samples: ["Monarca"], context: ["product"] },
    { field: "product_type", path: "Sheet.product_type", valueType: "string", samples: ["Apparel"], context: ["product"] },
    { field: "\uFEFFProduct-Title", path: "Sheet.Product-Title", valueType: "string", samples: ["Hydration Pack"], context: ["product"] },
    { field: "line-item-name", path: "Sheet.line-item-name", valueType: "string", samples: ["Trail Socks"], context: ["product"] }
  ]);

  const byField = new Map();
  for (const candidate of result.candidates) {
    if (!byField.has(candidate.field)) byField.set(candidate.field, candidate.maps_to);
  }
  assert.equal(byField.get("item_name"), "product_name");
  assert.equal(byField.get("product title"), "product_name");
  assert.ok(["brand", "vendor"].includes(byField.get("manufacturer")));
  assert.equal(byField.get("product_type"), "product_type");
  assert.equal(byField.get("\uFEFFProduct-Title"), "product_name");
  assert.equal(byField.get("line-item-name"), "product_name");
});

test("semantic engine maps ecommerce customer history fields in customer context", () => {
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields([
    { field: "created_at", path: "ecommerce_customers.created_at", valueType: "datetime", samples: ["2026-03-18 00:00"], context: ["ecommerce_customers"] },
    { field: "total_spent", path: "ecommerce_customers.total_spent", valueType: "number", samples: ["$482.27"], context: ["ecommerce_customers"] },
    { field: "orders_count", path: "ecommerce_customers.orders_count", valueType: "number", samples: [3], context: ["ecommerce_customers"] },
    { field: "province", path: "ecommerce_customers.province", valueType: "string", samples: ["CA"], context: ["ecommerce_customers"] }
  ]);

  const byField = new Map();
  for (const candidate of result.candidates) {
    if (!byField.has(candidate.field)) byField.set(candidate.field, candidate.maps_to);
  }

  assert.equal(byField.get("created_at"), "customer_created_at");
  assert.equal(byField.get("total_spent"), "total_spent");
  assert.equal(byField.get("orders_count"), "total_orders");
  assert.equal(byField.get("province"), "province");
});

test("canonical engine preserves customer value and lifecycle fields", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "customer-row-1",
      fields: {
        customer_id: "gid://shopify/Customer/1",
        total_spent: "$482.27",
        total_orders: 4,
        customer_created_at: "2026-03-18 00:00",
        first_order_date: "2026-03-20",
        last_order_date: "2026-06-12",
        country: "US",
        province: "CA",
        city: "Los Angeles",
        currency: "USD"
      }
    }
  ]);

  const customer = result.tables.ecommerce_customers[0];
  assert.equal(customer.customer_id, "gid://shopify/Customer/1");
  assert.equal(customer.total_spent, 482.27);
  assert.equal(customer.total_orders, 4);
  assert.equal(Number.isFinite(new Date(String(customer.customer_created_at)).getTime()), true);
  assert.equal(customer.country, "US");
  assert.equal(customer.province, "CA");
  assert.equal(customer.city, "Los Angeles");
});

test("canonical engine normalizes Amazon-like and TikTok-like records without provider branches", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "amazon",
      source_id: "amazon-source-1",
      fields: {
        order_id: "amazon-order-1",
        revenue: 88,
        order_date: "2026-06-02",
        currency: "USD",
        status: "shipped",
        product_id: "ASIN-1",
        sku: "AMZ-SKU-1",
        quantity: 1,
        price: 88
      }
    },
    {
      platform: "tiktok",
      source_id: "tt-conversion-1",
      fields: {
        order_id: "tt-order-1",
        revenue: 45,
        order_date: "2026-06-03",
        currency: "USD",
        status: "converted",
        product_id: "TT-P-1",
        product_name: "Creator Bundle",
        sku: "TT-SKU-1",
        quantity: 1,
        price: 45
      }
    }
  ]);

  assert.deepEqual(result.metadata.source_platforms.sort(), ["amazon", "tiktok"]);
  assert.equal(result.tables.ecommerce_orders.length, 2);
  assert.equal(result.tables.ecommerce_order_items.length, 2);
  assert.equal(result.tables.ecommerce_orders.find((row) => row.platform === "amazon")?.revenue, 88);
  assert.equal(result.tables.ecommerce_orders.find((row) => row.platform === "tiktok")?.revenue, 45);
});

test("canonical engine validates required fields and preserves unknown schema", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "custom",
      source_id: "bad-1",
      fields: {
        order_id: "bad-order",
        revenue: "not-a-number",
        currency: "USD"
      },
      unknown_fields: [
        { path: "mystery_field", value: { nested: true } }
      ]
    }
  ]);

  assert.equal(result.tables.ecommerce_orders.length, 0);
  assert.ok(result.metadata.validation.rejected_rows >= 1);
  assert.ok(result.metadata.validation.rejected.some((row) => row.reason === "invalid_number" || row.reason === "missing_required_field"));
  assert.equal(result.metadata.unknown_fields[0].path, "mystery_field");
});

test("canonical engine dedupes repeated multi-platform rows using canonical keys", () => {
  const duplicate = {
    platform: "stripe",
    source_id: "payment-1",
    fields: {
      order_id: "payment-1",
      revenue: 33,
      order_date: "2026-06-04",
      currency: "USD",
      status: "paid"
    }
  };
  const result = buildCanonicalDatasetFromMappedRecords([duplicate, duplicate]);

  assert.equal(result.tables.ecommerce_orders.length, 1);
  assert.equal(result.metadata.dedupe.duplicate_count, 1);
  assert.equal(result.metadata.dedupe.canonical_key_strategy, "hash(platform + source_id + order_id)");
});

test("canonical engine normalizes ads mapped records into ecommerce_ads", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "meta",
      source_id: "camp-1:ad-1:2026-06-01",
      fields: {
        sku: "SKU-AD",
        campaign_id: "camp-1",
        adset_id: "adset-1",
        ad_id: "ad-1",
        ad_spend: 100,
        impressions: 10000,
        clicks: 500,
        conversions: 20,
        attribution_revenue: 250,
        event_date: "2026-06-01"
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_ads.length, 1);
  assert.equal(result.tables.ecommerce_ads[0].platform, "meta");
  assert.equal(result.tables.ecommerce_ads[0].sku, "SKU-AD");
  assert.equal(result.tables.ecommerce_ads[0].campaign_id, "camp-1");
  assert.equal(result.tables.ecommerce_ads[0].spend, 100);
  assert.equal(result.tables.ecommerce_ads[0].date, "2026-06-01");
  assert.equal(result.tables.ecommerce_ads[0].attribution_revenue, 250);
});

test("canonical engine preserves advertising spend when campaign date is unavailable", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "meta_ads",
      source_id: "uploaded-ads-row-1",
      fields: {
        ad_spend: 120,
        impressions: 1000,
        clicks: 50
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_ads.length, 1);
  assert.equal(result.tables.ecommerce_ads[0].spend, 120);
  assert.equal(result.tables.ecommerce_ads[0].campaign_id, "uploaded-ads-row-1");
  assert.equal(result.metadata.validation.rejected.some((row) => row.table === "ecommerce_ads"), false);
});

test("canonical engine preserves ecommerce profit fields on order items", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "order-1",
      fields: {
        order_id: "order-1",
        sku: "SKU-1",
        quantity: 3,
        revenue: 150,
        cogs: 60,
        shipping_cost: 12,
        fulfillment_cost: 8,
        payment_fee: 4
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 1);
  assert.equal(result.tables.ecommerce_order_items[0].net_sales, 150);
  assert.equal(result.tables.ecommerce_order_items[0].cogs, 60);
  assert.equal(result.tables.ecommerce_orders[0].shipping_cost, 12);
  assert.equal(result.tables.ecommerce_costs.length, 4);
});

test("canonical engine resolves cogs as order item cost in order item context", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "csv",
      source_id: "order-row-1",
      fields: {
        order_id: "O-1",
        order_date: "2026-06-01",
        sku: "SKU-ORDER-COST",
        quantity: 2,
        revenue: 100,
        cogs: 45
      },
      metadata: {
        field_mappings: [
          { canonical_field: "cogs", source_column: "cogs", source_system: "csv", mapping_confidence: 1 }
        ]
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 1);
  assert.equal(result.tables.ecommerce_order_items[0].cogs, 45);
  assert.equal(result.tables.ecommerce_products[0]?.product_cost, undefined);
  assert.ok(result.metadata.field_mappings.some((mapping) =>
    mapping.canonical_field === "cogs" &&
    mapping.source_column === "cogs" &&
    mapping.source_file_type === "order_items" &&
    mapping.target_entity === "ecommerce_order_items"
  ));
});

test("canonical engine resolves cogs as product cost in product catalog context", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "csv",
      source_id: "catalog-row-1",
      fields: {
        sku: "SKU-CATALOG-COST",
        product_name: "Margin Hoodie",
        category: "Apparel",
        cogs: 12.5
      },
      metadata: {
        field_mappings: [
          { canonical_field: "cogs", source_column: "cogs", source_system: "csv", mapping_confidence: 1 }
        ]
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 0);
  assert.equal(result.tables.ecommerce_products.length, 1);
  assert.equal(result.tables.ecommerce_products[0].product_cost, 12.5);
  assert.ok(result.metadata.field_mappings.some((mapping) =>
    mapping.canonical_field === "product_cost" &&
    mapping.source_column === "cogs" &&
    mapping.source_file_type === "product_catalog" &&
    mapping.target_entity === "ecommerce_products"
  ));
});

test("canonical engine builds product context from order item rows and merges product catalog fields by sku", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "amazon",
      source_id: "order-item-1",
      fields: {
        order_id: "AMZ-ORDER-1",
        order_date: "2026-06-01",
        asin: "B012345678",
        sku: "SKU-CONTEXT",
        product_name: "Trail Running Vest",
        brand: "Monarca",
        category: "Sports",
        quantity: 1,
        price: 59.99
      }
    },
    {
      platform: "amazon",
      source_id: "product-row-1",
      fields: {
        sku: "SKU-CONTEXT",
        product_name: "",
        vendor: "Catalog Vendor",
        tags: "running, trail",
        handle: "trail-running-vest"
      }
    }
  ]);

  const product = result.tables.ecommerce_products.find((row) => row.sku === "SKU-CONTEXT");
  const orderItem = result.tables.ecommerce_order_items.find((row) => row.sku === "SKU-CONTEXT");
  assert.equal(orderItem?.product_name, "Trail Running Vest");
  assert.equal(orderItem?.asin, "B012345678");
  assert.equal(product?.product_name, "Trail Running Vest");
  assert.equal(product?.brand, "Monarca");
  assert.equal(product?.vendor, "Catalog Vendor");
  assert.equal(product?.tags, "running, trail");
  assert.equal(result.tables.ecommerce_products.filter((row) => row.sku === "SKU-CONTEXT").length, 1);
});

test("canonical engine accepts product catalog product_cost without creating order item cogs", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "csv",
      source_id: "catalog-row-2",
      fields: {
        sku: "SKU-PRODUCT-COST",
        product_name: "Unit Cost Tee",
        product_cost: 9.75
      },
      metadata: {
        field_mappings: [
          { canonical_field: "product_cost", source_column: "unit_cost", source_system: "csv", mapping_confidence: 0.95 }
        ]
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_order_items.length, 0);
  assert.equal(result.tables.ecommerce_products[0].product_cost, 9.75);
  assert.ok(result.metadata.field_mappings.some((mapping) =>
    mapping.canonical_field === "product_cost" &&
    mapping.source_column === "unit_cost" &&
    mapping.source_file_type === "product_catalog"
  ));
});

test("canonical engine does not build products from order-only rows", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "gid://shopify/Order/1",
      fields: {
        order_id: "gid://shopify/Order/1",
        product_name: "#1001",
        gross_sales: 125
      }
    },
    {
      platform: "shopify",
      source_id: "gid://shopify/Product/1",
      fields: {
        product_id: "gid://shopify/Product/1",
        variant_id: "gid://shopify/ProductVariant/1",
        sku: "SKU-CATALOG",
        product_name: "Catalog Bag",
        product_type: "Bags",
        tags: "travel",
        handle: "catalog-bag"
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_products.length, 1);
  assert.equal(result.tables.ecommerce_products[0].product_name, "Catalog Bag");
});

test("canonical engine builds inventory rows from stock fields", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "excel",
      source_id: "inventory-1",
      fields: {
        sku: "SKU-1",
        stock_level: 20,
        available_stock: 18,
        inventory_cost: 320,
        warehouse_id: "WH-1",
        reorder_point: 5
      }
    }
  ]);

  assert.equal(result.tables.ecommerce_inventory.length, 1);
  assert.equal(result.tables.ecommerce_inventory[0].stock_level, 20);
  assert.equal(result.tables.ecommerce_inventory[0].warehouse_id, "WH-1");
  assert.equal(result.tables.ecommerce_order_items.length, 0);
});

test("canonical engine preserves already-canonical ecommerce sheet fields", () => {
  const result = buildCanonicalDatasetFromMappedRecords([
    {
      platform: "shopify",
      source_id: "AMZ-1",
      raw_record: {
        __source_table: "source_orders",
        amazon_order_id: "AMZ-1",
        date: "2026-08-01",
        sku: "SKU-1",
        asin: "B0001",
        quantity: 3,
        item_price: 100,
        item_cost: 7
      },
      fields: {
        source_order_id: "AMZ-1",
        order_date: "2026-08-01",
        sku: "SKU-1",
        asin: "B0001",
        quantity: 3,
        unit_price: 100,
        item_cost: 7
      }
    },
    {
      platform: "shopify",
      source_id: "AMZ-1",
      source_table: "ecommerce_orders",
      raw_record: {
        __source_table: "ecommerce_orders",
        source_order_id: "AMZ-1",
        order_id: "O-1",
        order_date: "2026-08-01",
        financial_status: "paid",
        is_cancelled: false,
        is_test: false,
        is_paid: true,
        gross_sales: 100,
        discount: 5,
        refund: 10
      },
      fields: {}
    },
    {
      platform: "shopify",
      source_id: "AMZ-1",
      source_table: "ecommerce_order_items",
      raw_record: {
        __source_table: "ecommerce_order_items",
        source_order_id: "AMZ-1",
        order_id: "O-1",
        sku: "SKU-1",
        product_name: "Test product",
        quantity: 3,
        refunded_quantity: 1,
        item_cost: 7,
        gross_sales: 100,
        discount: 5,
        refund: 10
      },
      fields: {}
    },
    {
      platform: "shopify",
      source_id: "SKU-1",
      source_table: "ecommerce_inventory",
      raw_record: {
        __source_table: "ecommerce_inventory",
        sku: "SKU-1",
        available: 20,
        inventory_value: 140,
        snapshot_date: "2026-08-01"
      },
      fields: {}
    },
    {
      platform: "meta_ads",
      source_id: "META-1",
      raw_record: {
        __source_table: "uploaded",
        __source_file: "monarca_meta_ads_dec2025_aug2026.xlsx",
        campaign_id: "META-1",
        amount_spent: 50,
        impressions: 1000,
        date_start: "2026-08-01"
      },
      fields: {}
    },
    {
      platform: "meta_ads",
      source_id: "META-1",
      raw_record: {
        __source_table: "uploaded",
        __source_file: "monarca_meta_ads_dec2025_aug2026.xlsx",
        campaign_id: "META-1",
        amount_spent: 55,
        impressions: 1100,
        date_start: "2026-08-02"
      },
      fields: {}
    }
  ]);

  assert.equal(result.tables.ecommerce_orders.length, 1);
  assert.equal(result.tables.ecommerce_order_items.length, 1);
  assert.equal(result.tables.ecommerce_orders[0].refund_amount, 10);
  assert.equal(result.tables.ecommerce_orders[0].is_paid, true);
  assert.equal(result.tables.ecommerce_order_items[0].item_cost, 7);
  assert.equal(result.tables.ecommerce_order_items[0].refunded_quantity, 1);
  assert.equal(result.tables.ecommerce_inventory[0].stock_level, 20);
  assert.equal(result.tables.ecommerce_inventory[0].inventory_value, 140);
  assert.equal(result.tables.ecommerce_ads.length, 2);
  assert.equal(result.tables.ecommerce_ads[0].spend, 50);
  assert.equal(result.tables.ecommerce_ads[0].date, "2026-08-01");
  assert.equal(result.tables.ecommerce_ads[1].spend, 55);
  assert.equal(result.tables.ecommerce_ads[1].date, "2026-08-02");
});

test("semantic mapping validation rejects corrupt memory mappings", () => {
  assert.equal(validateSemanticMapping("shipping_cost", "ad_spend").accepted, false);
  assert.equal(validateSemanticMapping("fulfillment_cost", "ad_spend").accepted, false);
  assert.equal(validateSemanticMapping("payment_fee", "revenue").accepted, false);
  assert.equal(validateSemanticMapping("stock_level", "sku").accepted, false);
  assert.equal(validateSemanticMapping("price", "revenue").accepted, false);
  assert.equal(validateSemanticMapping("month", "event_date").accepted, true);
});

test("canonical engine source stays platform agnostic", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(join(process.cwd(), "lib/semantic/mapper/canonical-schema-engine.ts"), "utf8");

  assert.doesNotMatch(source, /if\s*\([^)]*(shopify|amazon|tiktok|stripe)/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
