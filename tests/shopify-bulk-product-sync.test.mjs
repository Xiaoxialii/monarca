import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bulkSync = readFileSync(new URL("../lib/ecommerce-connectors/providers/shopify-bulk-product-sync.ts", import.meta.url), "utf8");
const asyncRunner = readFileSync(new URL("../lib/jobs/async-job-runner.ts", import.meta.url), "utf8");
const syncRoute = readFileSync(new URL("../app/api/connectors/shopify/sync/route.ts", import.meta.url), "utf8");
const callbackRoute = readFileSync(new URL("../app/api/connectors/shopify/callback/route.ts", import.meta.url), "utf8");

test("Shopify full product sync uses Bulk Operations instead of bounded product pages", () => {
  assert.match(bulkSync, /bulkOperationRunQuery/, "Full product sync should start Shopify Bulk Operations.");
  assert.match(bulkSync, /currentBulkOperation\(type:\s*QUERY\)/, "Full product sync should poll the current query bulk operation.");
  assert.match(bulkSync, /reconstructBulkProducts/, "Bulk JSONL must be reconstructed into product records before canonical normalization.");
  assert.match(bulkSync, /__parentId/, "Bulk JSONL children should be linked back to parent products or variants.");
  assert.doesNotMatch(bulkSync, /variants\(first:\s*25\)/, "Full product sync must not cap variants at the quick-sync limit.");
  assert.doesNotMatch(bulkSync, /media\(first:\s*5\)/, "Full product sync must not cap product media at the quick-sync limit.");
  assert.doesNotMatch(bulkSync, /metafields\(first:\s*10/, "Full product sync must not cap metafields at the quick-sync limit.");
});

test("Shopify full product sync is a resumable async job", () => {
  assert.match(asyncRunner, /"SHOPIFY_BULK_PRODUCT_SYNC"/, "Async runner should register the full product sync job type.");
  assert.match(asyncRunner, /processShopifyBulkProductSyncAsyncJob/, "Async runner should have a Shopify bulk product handler.");
  assert.match(asyncRunner, /Waiting for Shopify full product export[\s\S]*nextJobs/, "Incomplete bulk operations should queue a follow-up polling job.");
  assert.match(asyncRunner, /enqueueShopifyBulkProductSync/, "Quick connector sync should enqueue the full product sync.");
});

test("manual and OAuth Shopify sync paths enqueue full product analysis", () => {
  assert.match(syncRoute, /enqueueShopifyBulkProductSync/, "Manual Shopify sync should enqueue full product analysis.");
  assert.match(callbackRoute, /enqueueShopifyBulkProductSync/, "OAuth Shopify callback should enqueue full product analysis after quick sync.");
});

test("bulk product snapshot preserves non-product canonical tables", () => {
  assert.match(bulkSync, /loadLatestCanonicalArtifact/, "Bulk product sync should load the latest canonical artifact.");
  assert.match(bulkSync, /ecommerce_orders:\s*existingArtifact\.ecommerce_orders/, "Bulk product sync must preserve existing orders.");
  assert.match(bulkSync, /ecommerce_order_items:\s*existingArtifact\.ecommerce_order_items/, "Bulk product sync must preserve existing order items.");
  assert.match(bulkSync, /ecommerce_products:\s*normalized\.ecommerce_products/, "Bulk product sync should replace products with full products.");
});
