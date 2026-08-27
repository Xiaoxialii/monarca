import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Shopify product sync pulls enriched product, media, SEO, inventory, and metafield data", () => {
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const fetchRoute = read("app/api/connectors/shopify/fetch/route.ts");
  const enrichmentConfig = read("lib/ecommerce-connectors/shopify-product-enrichment.ts");

  for (const source of [syncEngine, fetchRoute]) {
    assert.match(source, /handle/, "Product handle should be requested");
    assert.match(source, /descriptionHtml/, "HTML description should be requested");
    assert.match(source, /tags/, "Product tags should be requested");
    assert.match(source, /category \{ id name fullName \}/, "Shopify taxonomy category should be requested");
    assert.match(source, /collections\(first: 20\)/, "Product collections should be requested");
    assert.match(source, /options\s*\{[\s\S]*values/, "Product options should be requested");
    assert.match(source, /featuredMedia\s*\{[\s\S]*ProductMediaFields/, "Featured media should be requested");
    assert.match(source, /media\(first: 10\)/, "Product media should be requested");
    assert.match(source, /onlineStoreUrl/, "Online store URL should be requested");
    assert.match(source, /seo \{ title description \}/, "SEO title and description should be requested");
    assert.match(source, /compareAtPrice/, "Variant compare-at price should be requested");
    assert.match(source, /barcode/, "Variant barcode should be requested");
    assert.match(source, /inventoryQuantity/, "Variant inventory quantity should be requested");
    assert.match(source, /inventoryItem\s*\{[\s\S]*unitCost/, "Inventory item unit cost should be requested");
    assert.match(source, /measurement \{ weight \{ value unit \} \}/, "Inventory item weight should be requested");
    assert.match(source, /metafields\(first: 20, keys: \$metafieldKeys\)/, "Product metafields should be requested by explicit keys with a bounded page size");
  }

  assert.match(enrichmentConfig, /SHOPIFY_PRODUCT_METAFIELD_KEYS/, "Metafield key whitelist should be configurable");
  assert.match(enrichmentConfig, /custom\.brand/, "Metafield whitelist should include common brand enrichment");
});

test("Shopify product canonical artifact exposes enriched columns without replacing core SKU fields", () => {
  const syncEngine = read("lib/ecommerce-connectors/providers/shopify-sync-engine.ts");
  const snapshotGenerator = read("lib/snapshot/canonical-snapshot-generator.ts");

  for (const source of [syncEngine, snapshotGenerator]) {
    assert.match(source, /"product_handle"/, "Schema columns should include product_handle");
    assert.match(source, /"description_html"/, "Schema columns should include description_html");
    assert.match(source, /"category_full_name"/, "Schema columns should include taxonomy category");
    assert.match(source, /"collection_handles"/, "Schema columns should include collection handles");
    assert.match(source, /"featured_image_url"/, "Schema columns should include featured image URL");
    assert.match(source, /"online_store_url"/, "Schema columns should include online store URL");
    assert.match(source, /"seo_title"/, "Schema columns should include SEO title");
    assert.match(source, /"compare_at_price"/, "Schema columns should include compare-at price");
    assert.match(source, /"barcode"/, "Schema columns should include barcode");
    assert.match(source, /"inventory_quantity"/, "Schema columns should include inventory quantity");
    assert.match(source, /"inventory_unit_cost"/, "Schema columns should include inventory unit cost");
    assert.match(source, /"weight_unit"/, "Schema columns should include weight unit");
    assert.match(source, /"metafield_keys"/, "Schema columns should include metafield keys");
  }

  assert.match(syncEngine, /sku: canonicalSku\.sku/, "Canonical product rows should retain SKU");
  assert.match(syncEngine, /product_id: `shopify:\$\{input\.shopDomain\}:\$\{product\.id\}`/, "Canonical product rows should retain stable product identity");
  assert.match(syncEngine, /variant_id: variant\?\.id \? `shopify:\$\{input\.shopDomain\}:\$\{variant\.id\}` : null/, "Canonical product rows should retain stable variant identity");
  assert.match(syncEngine, /raw_payload_hash: sha256\(JSON\.stringify\(\{ product, variant \}\)\)/, "Raw payload hash should track enriched product versions");
});
