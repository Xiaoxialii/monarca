import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const discovery = readFileSync(new URL("../lib/competitive-intelligence/discovery.ts", import.meta.url), "utf8");
const metaLibrary = readFileSync(new URL("../lib/competitive-intelligence/meta-ad-library.ts", import.meta.url), "utf8");
const discoverRoute = readFileSync(new URL("../app/api/competitive-intelligence/discover/route.ts", import.meta.url), "utf8");
const context = readFileSync(new URL("../lib/competitive-intelligence/context.ts", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/report-renderer-engine.tsx", import.meta.url), "utf8");

test("competitor discovery uses SKU product context and public ad search", () => {
  assert.match(discovery, /loadSkuProductContext/, "Discovery should load canonical Shopify product context for the SKU.");
  assert.match(discovery, /readR2ObjectText/, "Discovery should read canonical product artifacts, including R2-backed snapshots.");
  assert.match(discovery, /searchTermsFromProduct/, "Discovery should derive keyword search terms from product attributes.");
  assert.match(discovery, /fetchMetaAdLibrarySearchAds/, "Discovery should query legal public ad data using product-derived terms.");
});

test("discovered competitors require review and are not auto-confirmed", () => {
  assert.match(metaLibrary, /upsertSuggestedCompetitorBrands/, "Meta library should persist suggested competitors.");
  assert.match(metaLibrary, /status:\s*"NEEDS_REVIEW"/, "Suggested competitors must require review.");
  assert.match(metaLibrary, /source:\s*"META_AD_LIBRARY_KEYWORD_SEARCH"/, "Suggested competitors should preserve their public search source.");
  assert.match(discovery, /auto_confirmed:\s*false/, "Discovery evidence should explicitly avoid auto-confirming competitors.");
  assert.doesNotMatch(discovery, /status:\s*"USER_CONFIRMED"/, "Discovery should not directly confirm competitor brands.");
});

test("competitor discovery API is workspace-authenticated", () => {
  assert.match(discoverRoute, /getCurrentWorkspaceContext\(request\)/, "Discover API should require workspace context.");
  assert.match(discoverRoute, /discoverCompetitorBrandsForSku/, "Discover API should call the discovery service.");
  assert.doesNotMatch(discoverRoute, /workspaceId.*body|body.*workspaceId/, "Discover API must not trust client-supplied workspaceId.");
});

test("optimization context and UI expose suggested competitor confirmation path", () => {
  assert.match(context, /status:\s*\{\s*in:\s*\["USER_CONFIRMED",\s*"NEEDS_REVIEW"\]\s*\}/, "Competitive context should include suggested brands.");
  assert.match(context, /SKU_PRODUCT_CONTEXT_CANDIDATES/, "Competitive context should identify SKU-derived candidates.");
  assert.match(renderer, /根据 SKU 查找竞品/, "Decision summary should expose SKU-based competitor discovery.");
  assert.match(renderer, /\/api\/competitive-intelligence\/discover/, "UI should call the discovery API.");
  assert.match(renderer, /确认后才会同步广告并进入分析/, "UI should communicate that suggested competitors require confirmation.");
});
