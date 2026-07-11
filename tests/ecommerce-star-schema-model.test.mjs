import assert from "node:assert/strict";
import fs from "node:fs";
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
const { buildEcommerceStarSchemaModel } = jiti("./lib/data-model/ecommerce-star-schema.ts");
const { runUnifiedIngestionPipeline } = jiti("./lib/ingestion/unified-ingestion-engine.ts");

function canonicalFixture() {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "S-1", customer_id: "C-1", revenue: 120, discount: 10, order_date: "2026-06-01T10:00:00.000Z", currency: "USD", platform: "shopify", status: "paid" },
        { order_id: "A-1", customer_id: "C-2", revenue: 80, order_date: "2026-06-02", currency: "USD", platform: "amazon", status: "shipped" },
        { order_id: "TT-1", customer_id: "C-3", revenue: 45, order_date: "2026-06-03", currency: "USD", platform: "tiktok", status: "paid" }
      ],
      ecommerce_order_items: [
        { order_id: "S-1", product_id: "P-1", variant_id: "V-1", sku: "sku one", price: 60, quantity: 2, platform: "shopify" },
        { order_id: "A-1", product_id: "P-2", sku: "AMZ-1", price: 40, quantity: 2, platform: "amazon" },
        { order_id: "TT-1", product_id: "P-3", sku: "TT-1", price: 45, quantity: 1, platform: "tiktok" }
      ],
      ecommerce_products: [
        { product_id: "P-1", variant_id: "V-1", product_name: "One", sku: "sku one", category: "Tops", price: 60, cost: 30, platform: "shopify" },
        { product_id: "P-2", product_name: "Two", sku: "AMZ-1", category: "Marketplace", price: 40, platform: "amazon" },
        { product_id: "P-3", product_name: "Three", sku: "TT-1", category: "Social", price: 45, platform: "tiktok" }
      ],
      ecommerce_customers: [
        { customer_id: "C-1", country: "US", platform: "shopify" },
        { customer_id: "C-2", country: "US", platform: "amazon" },
        { customer_id: "C-3", country: "CA", platform: "tiktok" }
      ],
      ecommerce_refunds: [
        { refund_id: "R-1", order_id: "A-1", amount: 10, reason: "return", platform: "amazon" }
      ],
      ecommerce_ads: [
        { campaign_id: "CAMP-1", ad_id: "AD-1", spend: 25, impressions: 1000, clicks: 50, conversions: 3, date: "2026-06-01", platform: "meta_ads" }
      ],
      ecommerce_behavior: [
        { session_id: "SESS-1", customer_id: "C-1", page_views: 4, add_to_cart: 1, checkout: 1, purchase: 1, date: "2026-06-01", platform: "web" }
      ],
      ecommerce_inventory: [
        { sku: "sku one", warehouse_id: "WH-1", stock_level: 20, reserved_stock: 2, fulfillment_days: 3, date: "2026-06-01", platform: "erp" }
      ]
    },
    metadata: {
      source_platforms: ["shopify", "amazon", "tiktok", "meta_ads", "web", "erp"],
      normalized_at: "2026-06-30T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: 12,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0.95
    }
  };
}

test("data model layer builds a platform-agnostic ecommerce star schema", () => {
  const model = buildEcommerceStarSchemaModel(canonicalFixture());

  assert.equal(model.schema_version, "ecommerce_star_schema_v1");
  assert.equal(model.source_schema_version, "ecommerce_canonical_v1");
  assert.equal(model.facts.fact_orders.length, 3);
  assert.equal(model.facts.fact_ads.length, 1);
  assert.equal(model.facts.fact_behavior.length, 1);
  assert.equal(model.facts.fact_inventory_snapshot.length, 1);
  assert.equal(model.facts.fact_attribution.length, 1);
  assert.equal(model.facts.fact_attribution[0].attribution_model, "multi_touch");
  assert.ok(model.dimensions.dim_products.some((row) => row.sku === "SKU_ONE" && row.margin === 30));
  assert.ok(model.dimensions.dim_customers.some((row) => row.customer_id === "C-1" && row.lifetime_value === 120 && row.is_returning_customer === false));
  assert.ok(model.dimensions.dim_time.some((row) => row.date === "2026-06-01" && row.month === "2026-06"));
  assert.ok(model.dimensions.dim_platform.some((row) => row.platform_id === "meta_ads" && row.channel_type === "ads"));
  assert.equal(model.metadata.audit.canonical_input_only, true);
  assert.equal(model.metadata.audit.metrics_defined, false);
  assert.equal(model.metadata.audit.raw_api_input, false);
});

test("data model relationships validate fact-to-dimension joins", () => {
  const model = buildEcommerceStarSchemaModel(canonicalFixture());
  const byRelationship = new Map(model.relationships.map((row) => [`${row.from_table}.${row.from_field}->${row.to_table}.${row.to_field}`, row]));

  assert.equal(byRelationship.get("fact_orders.customer_id->dim_customers.customer_id")?.valid, true);
  assert.equal(byRelationship.get("fact_orders.sku->dim_products.sku")?.valid, true);
  assert.equal(byRelationship.get("fact_orders.order_date->dim_time.date")?.valid, true);
  assert.equal(byRelationship.get("fact_ads.platform->dim_platform.platform_id")?.valid, true);
  assert.equal(byRelationship.get("fact_behavior.customer_id->dim_customers.customer_id")?.valid, true);
  assert.equal(byRelationship.get("fact_inventory_snapshot.sku->dim_products.sku")?.valid, true);
  assert.equal(byRelationship.get("fact_attribution.order_id->fact_orders.order_id")?.valid, true);
  assert.equal(byRelationship.get("fact_costs.sku->dim_products.sku")?.valid, true);
});

test("data model force-generates guest customers from orders when customer dimension is missing", () => {
  const fixture = canonicalFixture();
  fixture.tables.ecommerce_orders = [
    { order_id: "G-1", revenue: 50, order_date: "2026-06-08", platform: "shopify" }
  ];
  fixture.tables.ecommerce_order_items = [
    { order_id: "G-1", product_id: "P-G", sku: "guest sku", price: 50, quantity: 1, platform: "shopify" }
  ];
  fixture.tables.ecommerce_products = [
    { product_id: "P-G", product_name: "Guest Product", sku: "guest sku", price: 50, platform: "shopify" }
  ];
  fixture.tables.ecommerce_customers = [];
  fixture.tables.ecommerce_refunds = [];

  const model = buildEcommerceStarSchemaModel(fixture);
  const guest = model.dimensions.dim_customers.find((row) => row.customer_id === "guest:G-1");

  assert.equal(guest?.first_order_date, "2026-06-08");
  assert.equal(guest?.last_order_date, "2026-06-08");
  assert.equal(guest?.order_count, 1);
  assert.equal(guest?.lifetime_value, 50);
  assert.equal(guest?.is_new_customer, true);
  assert.equal(model.relationships.find((row) => row.from_table === "fact_orders" && row.to_table === "dim_customers")?.valid, true);
});

test("unified ingestion emits the data model layer after canonical schema generation", async () => {
  const result = await runUnifiedIngestionPipeline({
    source: "excel",
    workspace_id: "ws_model",
    payload: [{
      order_id: "E-1",
      order_total: 30,
      created_at: "2026-06-05",
      currency: "USD",
      sku: "excel sku",
      product_id: "P-E",
      product_name: "Excel Product",
      unit_price: 30,
      quantity: 1,
      customer_id: "C-E",
      status: "paid"
    }]
  });

  assert.equal(result.data_model.schema_version, "ecommerce_star_schema_v1");
  assert.equal(result.data_model.source_schema_version, "ecommerce_canonical_v1");
  assert.equal(result.data_model.metadata.audit.canonical_input_only, true);
  assert.ok(result.metadata.pipeline.includes("data_model_layer"));
  assert.ok(result.data_model.facts.fact_orders.length >= 1);
});

test("data model source remains canonical-only and has no provider-specific tables", () => {
  const source = fs.readFileSync("lib/data-model/ecommerce-star-schema.ts", "utf8");

  assert.doesNotMatch(source, /shopify_orders|amazon_orders|tiktok_orders|meta_ads_raw/i);
  assert.doesNotMatch(source, /GraphQL|Admin API|access_token|raw payload/i);
  assert.doesNotMatch(source, /provider\s*===|platform\s*===/i);
});
