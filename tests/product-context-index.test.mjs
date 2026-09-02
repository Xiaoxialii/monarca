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
  buildProductContextIndexRows,
  productContextValidationSummary
} = jiti("./lib/snapshot/product-context-index.ts");

function dataset(tables) {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [],
      ecommerce_order_items: [],
      ecommerce_products: [],
      ecommerce_customers: [],
      ecommerce_refunds: [],
      ecommerce_ads: [],
      ecommerce_inventory: [],
      ecommerce_costs: [],
      ...tables
    },
    metadata: {
      source_platforms: ["amazon"],
      normalized_at: "2026-08-28T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 0, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 1
    }
  };
}

test("product context validation distinguishes sku and price only from searchable context", () => {
  const rows = Array.from({ length: 600 }, (_, index) => ({
    workspaceId: "workspace-a",
    dataSourceId: "source-a",
    schemaSnapshotId: "snapshot-a",
    provider: "amazon",
    normalizedSku: `sku-${index}`,
    sku: `SKU-${index}`,
    productId: null,
    variantId: null,
    asin: null,
    productName: null,
    category: null,
    productType: null,
    brand: null,
    vendor: null,
    tags: [],
    handle: null,
    price: 10,
    currency: "USD",
    contextQuality: 0.35,
    searchable: false,
    sourceProvenance: {}
  }));

  const validation = productContextValidationSummary(rows, { totalCanonicalRows: 600, coreTableRowCount: 600 });
  assert.equal(validation.status, "READY_WITH_WARNINGS");
  assert.equal(validation.rowsWithSku, 600);
  assert.equal(validation.rowsWithProductName, 0);
  assert.equal(validation.searchableProductRows, 0);
  assert.equal(validation.capabilities.reportingAvailable, true);
  assert.equal(validation.capabilities.competitiveDiscoveryAvailable, false);
});

test("product context index consolidates products and order items without overwriting non-empty context", () => {
  const result = buildProductContextIndexRows({
    workspaceId: "workspace-a",
    dataSourceId: "source-a",
    schemaSnapshotId: "snapshot-a",
    provider: "amazon",
    canonicalDataset: dataset({
      ecommerce_products: [
        { platform: "amazon", sku: "SKU-1", product_name: "Catalog Name", brand: "Catalog Brand" },
        { platform: "amazon", sku: "SKU-1", product_name: "", tags: "running,trail" }
      ],
      ecommerce_order_items: [
        { platform: "amazon", sku: "SKU-1", asin: "B012345678", item_name: "Order Item Name", category: "Sports", price: 25 },
        { platform: "amazon", sku: "SKU-2", asin: "B087654321", item_name: "Second Product", manufacturer: "Maker" }
      ]
    })
  });

  assert.equal(result.rows.length, 2);
  const first = result.rows.find((row) => row.sku === "SKU-1");
  assert.equal(first?.productName, "Catalog Name");
  assert.equal(first?.brand, "Catalog Brand");
  assert.equal(first?.category, "Sports");
  assert.equal(first?.asin, "B012345678");
  assert.equal(first?.searchable, true);
  assert.equal(result.validation.capabilities.competitiveDiscoveryAvailable, true);
  assert.ok(result.validation.duplicateProductKeys >= 1);
});

test("product context identity is workspace scoped by construction", () => {
  const sharedTables = dataset({
    ecommerce_order_items: [
      { platform: "amazon", sku: "SAME-SKU", asin: "B012345678", item_name: "Workspace Product" }
    ]
  });

  const first = buildProductContextIndexRows({
    workspaceId: "workspace-a",
    dataSourceId: "source-a",
    schemaSnapshotId: "snapshot-a",
    provider: "amazon",
    canonicalDataset: sharedTables
  }).rows[0];
  const second = buildProductContextIndexRows({
    workspaceId: "workspace-b",
    dataSourceId: "source-b",
    schemaSnapshotId: "snapshot-b",
    provider: "amazon",
    canonicalDataset: sharedTables
  }).rows[0];

  assert.equal(first.normalizedSku, second.normalizedSku);
  assert.notEqual(first.workspaceId, second.workspaceId);
  assert.notEqual(first.schemaSnapshotId, second.schemaSnapshotId);
});
