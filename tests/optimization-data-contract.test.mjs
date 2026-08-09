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
const {
  OptimizationInputSchema,
  buildSkuOptimizationFeatures,
  validateOptimizationData
} = jiti("./lib/optimization/optimization-data-contract.ts");

function dashboardData({ missingFields = [], unitOverrides = {}, overrides = {} } = {}) {
  const base = {
    decision_report: {
      performance_overview: {
        revenue: 3800,
        ad_spend: 400,
        gross_profit: 1444,
        margin: 0.38
      },
      sku_breakdown: {
        top_revenue_skus: [{ sku: "SKU-1", revenue: 3800, quantity: 60 }],
        top_profit_skus: []
      }
    },
    metrics: {
      core: {
        orders: 24,
        sku_revenue: [{ sku: "SKU-1", revenue: 3800, quantity: 60 }]
      },
      ads: {
        ad_spend: 400
      },
      business: {
        ad_spend: 400,
        sku_unit_economics: [{
          sku: "SKU-1",
          cogs: 1444,
          cogs_status: "ACTUAL",
          ad_cost_allocated: 400,
          stock_level: 120,
          attributed_revenue: 1680,
          conversion_rate: 0.06,
          channel_breakdown: { meta: 1680, shopify: 2120 },
          ...unitOverrides
        }]
      },
      attribution: {
        sku_attribution_coverage: 1
      }
    },
    trends: {
      daily_revenue: [
        { period: "2026-07-11", revenue: 120 },
        { period: "2026-08-09", revenue: 220 }
      ],
      weekly_revenue: [],
      monthly_revenue: [],
      growth_rate: 0.2
    },
    catalog_health: {
      product_count: 1,
      variant_count: 1,
      sku_count: 1,
      tracked_sku_count: 1,
      untracked_sku_count: 0,
      catalog_row_count: 1,
      sku_density: 1,
      price_distribution: [],
      product_concentration: 1
    },
    sku_analysis: {
      top_skus: [],
      product_performance: [],
      catalog_preview: [],
      concentration: {
        top_sku_share: 1,
        top_product_share: 1,
        risk_level: "high"
      }
    },
    refund_insights: {
      refund_rate: 0,
      refund_amount: 0,
      refund_trend: [],
      top_refunded_products: []
    },
    metadata: {
      schema_version: "ecommerce_canonical_v1",
      source_platforms: ["shopify", "meta"],
      computed_at: "2026-08-09T00:00:00.000Z"
    },
    quality: {
      missing_fields: missingFields,
      confidence_score: 0.9,
      data_coverage: 90,
      estimated_metrics: []
    },
    analytics_validation: {}
  };

  return {
    ...base,
    ...overrides
  };
}

test("optimization contract separates transaction, inventory, ad, and ingestion dates", () => {
  const orderFields = OptimizationInputSchema.orders.map((field) => field.field);
  const advertisingFields = OptimizationInputSchema.advertising.map((field) => field.field);
  const inventoryFields = OptimizationInputSchema.inventory.map((field) => field.field);

  assert.ok(orderFields.includes("order_date"));
  assert.ok(orderFields.includes("snapshot_date"));
  assert.ok(advertisingFields.includes("ad_date"));
  assert.ok(inventoryFields.includes("inventory_date"));
});

test("readiness blocks when minimum optimization fields are missing", () => {
  const result = validateOptimizationData(dashboardData({
    missingFields: [
      "ecommerce_orders.order_date",
      "ecommerce_order_items.sku",
      "ecommerce_order_items.cogs",
      "ecommerce_inventory.*",
      "ecommerce_ads.spend"
    ],
    overrides: {
      trends: {
        daily_revenue: [],
        weekly_revenue: [],
        monthly_revenue: [],
        growth_rate: null
      },
      metrics: {
        core: {
          orders: 24,
          sku_revenue: []
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
      }
    }
  }));

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.missingRequiredFields, [
    "order_date",
    "sku",
    "quantity",
    "revenue",
    "cogs",
    "inventory_on_hand",
    "ad_spend"
  ]);
  assert.ok(result.userMessage.includes("order_date"));
});

test("readiness does not mark order_id missing when merged source warnings include ecommerce_orders wildcard", () => {
  const result = validateOptimizationData(dashboardData({
    missingFields: [
      "ecommerce_orders.*",
      "ecommerce_orders.order_date"
    ],
    overrides: {
      trends: {
        daily_revenue: [],
        weekly_revenue: [],
        monthly_revenue: [],
        growth_rate: null
      }
    }
  }));

  assert.equal(result.missingRequiredFields.includes("order_id"), false);
  assert.equal(result.missingRequiredFields.includes("order_date"), true);
});

test("feature table supports imperfect data without false advertising precision", () => {
  const data = dashboardData({
    missingFields: ["attributed_revenue", "campaign_id", "supplier_lead_time"],
    unitOverrides: {
      attributed_revenue: undefined
    }
  });
  const result = validateOptimizationData(data);
  const features = buildSkuOptimizationFeatures(data);

  assert.equal(result.status, "WARNING");
  assert.ok(result.missingRecommendedFields.includes("attributed_revenue"));
  assert.ok(result.limitations.some((item) => /Advertising optimization limited/i.test(item)));
  assert.equal(features[0].sku, "SKU-1");
  assert.equal(features[0].roas, null);
  assert.equal(features[0].inventory_days, 60);
});
