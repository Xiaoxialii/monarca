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
const { normalizeProfitInputs, profitDataCoverage } = jiti("./lib/profit/profit-input-normalizer.ts");

function dashboardData({ missingFields = [], overrides = {} } = {}) {
  const base = {
    decision_report: {
      performance_overview: {
        revenue: 1200,
        ad_spend: 120,
        gross_profit: 480,
        margin: 0.4
      },
      sku_breakdown: {
        top_revenue_skus: [{
          sku: "SKU-1",
          revenue: 1200,
          quantity: 12
        }],
        top_profit_skus: [{
          sku: "SKU-1",
          revenue: 1200,
          quantity: 12,
          ad_cost_allocated: 120,
          cogs_status: "ACTUAL",
          cogs_confidence: 1,
          attribution_confidence: 1,
          profit_confidence: 1,
          cost_breakdown: {
            cogs: 420,
            shipping: 60,
            fulfillment: 0,
            warehouse: 0,
            platform_fee: 36,
            payment_fee: 24,
            refund: 20
          }
        }]
      }
    },
    metrics: {
      core: {
        orders: 10,
        sku_revenue: [{
          sku: "SKU-1",
          revenue: 1200,
          quantity: 12
        }]
      },
      ads: {
        ad_spend: 120
      },
      business: {
        ad_spend: 120,
        sku_unit_economics: [{
          sku: "SKU-1",
          cogs: 420,
          cogs_status: "ACTUAL",
          ad_cost_allocated: 120,
          stock_level: 30,
          channel_breakdown: {
            shopify: 1200
          }
        }]
      },
      attribution: {
        sku_attribution_coverage: 1
      }
    },
    trends: {
      daily_revenue: [{
        date: "2026-08-01",
        revenue: 1200
      }]
    },
    catalog_health: {
      sku_count: 1,
      catalog_row_count: 1
    },
    refund_insights: {
      refund_amount: 20
    },
    metadata: {
      source_platforms: ["shopify"]
    },
    quality: {
      missing_fields: missingFields,
      confidence_score: 1
    }
  };

  return {
    ...base,
    ...overrides
  };
}

test("optimization core data coverage ignores non-required customer and handling fields", () => {
  const data = dashboardData({
    missingFields: [
      "ecommerce_customers.customer_id",
      "ecommerce_products.product_name",
      "ecommerce_orders.handling_cost",
      "ecommerce_orders.warehouse_cost"
    ]
  });

  assert.equal(profitDataCoverage(data), 100);
  assert.deepEqual(normalizeProfitInputs(data).missingFields, []);
});

test("optimization missing fields use the required order, SKU, cost, ads, inventory, and channel checklist", () => {
  const data = dashboardData({
    missingFields: [
      "ecommerce_order_items.cogs",
      "ecommerce_orders.shipping_cost",
      "ecommerce_orders.platform_fee",
      "ecommerce_orders.payment_fee",
      "ecommerce_ads.*",
      "ecommerce_inventory.*",
      "source_platform"
    ],
    overrides: {
      metrics: {
        core: {
          orders: 10,
          sku_revenue: [{
            sku: "SKU-1",
            revenue: 1200,
            quantity: 12
          }]
        },
        ads: {
          ad_spend: 0
        },
        business: {
          ad_spend: 0,
          sku_unit_economics: []
        },
        attribution: {
          sku_attribution_coverage: 0
        }
      },
      catalog_health: {
        sku_count: 1,
        catalog_row_count: 1
      },
      metadata: {
        source_platforms: []
      }
    }
  });

  const missing = normalizeProfitInputs(data).missingFields;

  assert.deepEqual(missing, [
    "cost.unit_cost_or_cogs",
    "cost.shipping_cost",
    "cost.platform_fee",
    "cost.payment_fee",
    "ads.ad_spend",
    "ads.sku_or_product_id",
    "inventory.inventory_on_hand",
    "channel.channel_or_platform"
  ]);
  assert.ok(!missing.some((field) => /customer|product_name|handling|warehouse/i.test(field)));
});
