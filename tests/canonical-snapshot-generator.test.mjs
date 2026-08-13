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
  buildCanonicalSnapshotJson,
  isEcommerceCanonicalSchemaJson,
  storeCanonicalSchemaSnapshot
} = jiti("./lib/snapshot/canonical-snapshot-generator.ts");

function dataset() {
  return {
    schema_version: "ecommerce_canonical_v1",
    tables: {
      ecommerce_orders: [
        { order_id: "1", revenue: 100, order_date: "2026-06-01", currency: "USD", platform: "shopify" },
        { order_id: "2", revenue: 200, order_date: "2026-06-02", currency: "USD", platform: "shopify" }
      ],
      ecommerce_order_items: [
        { order_id: "1", product_id: "p1", sku: "A", price: 50, quantity: 2 },
        { order_id: "2", product_id: "p2", sku: "B", price: 100, quantity: 2 }
      ],
      ecommerce_products: [
        { product_id: "p1", product_name: "Item A", sku: "A", price: 50 },
        { product_id: "p2", product_name: "Item B", sku: "B", price: 100 }
      ],
      ecommerce_customers: [],
      ecommerce_refunds: [
        { refund_id: "r1", order_id: "1", amount: 10, refund_date: "2026-06-03" }
      ]
    },
    metadata: {
      source_platforms: ["shopify"],
      normalized_at: "2026-06-29T00:00:00.000Z",
      unknown_fields: [],
      validation: { accepted_rows: 7, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 0.98,
      field_mappings: [
        {
          canonical_field: "ad_spend",
          source_column: "spend",
          source_system: "Meta Ads",
          mapping_confidence: 1,
          mapping_method: "exact_alias",
          requires_confirmation: false
        }
      ]
    }
  };
}

test("canonical snapshot generator produces dashboard-ready ecommerce snapshot", () => {
  const snapshot = buildCanonicalSnapshotJson({
    manifest: {
      businessType: "ecommerce",
      sourceProvider: "shopify",
      manifestKey: "workspaces/ws/connectors/shopify/ds/run/manifest/manifest.json",
      syncRunId: "sync_1",
      checksum: {
        ecommerce_orders: "orders-checksum"
      },
      latestBusinessDate: "2026-06-02",
      confidenceScore: 0.98,
      missingFields: []
    },
    artifacts: {
      ecommerce_orders: { artifactKey: "normalized/ecommerce_orders.jsonl", checksum: "orders-checksum", rowCount: 2 },
      ecommerce_order_items: { artifactKey: "normalized/ecommerce_order_items.jsonl", checksum: "items-checksum", rowCount: 2 },
      ecommerce_products: { artifactKey: "normalized/ecommerce_products.jsonl", checksum: "products-checksum", rowCount: 2 },
      ecommerce_customers: { artifactKey: "normalized/ecommerce_customers.jsonl", checksum: "customers-checksum", rowCount: 0 },
      ecommerce_refunds: { artifactKey: "normalized/ecommerce_refunds.jsonl", checksum: "refunds-checksum", rowCount: 1 }
    },
    canonicalDataset: dataset()
  });

  assert.equal(snapshot.schemaVersion, "ecommerce_canonical_v1");
  assert.equal(snapshot.schema_version, "ecommerce_canonical_v1");
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.metrics.revenue, 300);
  assert.equal(snapshot.metrics.orders, 2);
  assert.equal(snapshot.metrics.aov, 150);
  assert.equal(snapshot.tables.length, 5);
  assert.equal(snapshot.tables.find((table) => table.name === "ecommerce_orders").artifactKey, "normalized/ecommerce_orders.jsonl");
  assert.equal(snapshot.dashboardSnapshot.metrics.refund_rate, 0.0333);
  assert.deepEqual(snapshot.field_mappings, dataset().metadata.field_mappings);
});

test("canonical snapshot schema detection accepts both camel and snake schema version fields", () => {
  assert.equal(isEcommerceCanonicalSchemaJson({ schemaVersion: "ecommerce_canonical_v1" }), true);
  assert.equal(isEcommerceCanonicalSchemaJson({ schema_version: "ecommerce_canonical_v1" }), true);
  assert.equal(isEcommerceCanonicalSchemaJson({ schemaVersion: "logistics_v1" }), false);
});

test("canonical snapshot storage marks canonical snapshots ready", async () => {
  const snapshotJson = buildCanonicalSnapshotJson({
    manifest: {
      businessType: "ecommerce",
      sourceProvider: "shopify"
    },
    artifacts: {
      ecommerce_products: { artifactKey: "normalized/ecommerce_products.jsonl", checksum: "products-checksum", rowCount: 2 }
    },
    canonicalDataset: dataset()
  });
  let createPayload = null;
  const prisma = {
    schemaSnapshot: {
      aggregate: async () => ({ _max: { version: 41 } }),
      create: async (payload) => {
        createPayload = payload;
        return { id: "snapshot_42", ...payload.data };
      }
    }
  };

  await storeCanonicalSchemaSnapshot({
    prisma,
    workspaceId: "workspace_1",
    dataSourceId: "source_1",
    schemaJson: snapshotJson
  });

  assert.equal(createPayload.data.version, 42);
  assert.equal(createPayload.data.schemaStatus, "READY");
  assert.equal(createPayload.data.canonicalStatus, "READY");
  assert.equal(createPayload.data.canonicalVersion, "ecommerce_canonical_v1");
});
