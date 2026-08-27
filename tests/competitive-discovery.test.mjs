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
  assert.match(discovery, /productContextScore/, "Discovery should prefer the richest SKU product context across snapshots.");
  assert.doesNotMatch(discovery, /if \(match\) return match/, "Weak uploaded SKU rows must not shadow richer Shopify product rows.");
  assert.match(discovery, /searchTermsFromProduct/, "Discovery should derive keyword search terms from product attributes.");
  assert.match(discovery, /fetchMetaAdLibrarySearchAds/, "Discovery should query legal public ad data using product-derived terms.");
});

test("discovered competitors auto-confirm only high-confidence public ad candidates", () => {
  assert.match(metaLibrary, /upsertSuggestedCompetitorBrands/, "Meta library should persist suggested competitors.");
  assert.match(metaLibrary, /brand\.autoConfirm\s*\?\s*"USER_CONFIRMED"\s*:\s*"NEEDS_REVIEW"/, "Low-confidence suggested competitors must remain in review.");
  assert.match(metaLibrary, /status\s*=\s*brand\.autoConfirm\s*\?\s*"USER_CONFIRMED"\s*:\s*"NEEDS_REVIEW"/, "High-confidence candidates should be eligible for auto-confirmation.");
  assert.match(metaLibrary, /source\s*=\s*brand\.autoConfirm\s*\?\s*"AUTO_CONFIRMED_FROM_SKU_PUBLIC_ADS"/, "Auto-confirmed competitors should keep an auditable source.");
  assert.match(metaLibrary, /brand\.autoConfirm\s*\?\s*"AUTO_CONFIRMED_FROM_SKU_PUBLIC_ADS"\s*:\s*"META_AD_LIBRARY_KEYWORD_SEARCH"/, "Suggested competitors should preserve their public search source.");
  assert.match(discovery, /AUTO_CONFIRM_MIN_CONFIDENCE/, "Discovery should centralize auto-confirm thresholds.");
  assert.match(discovery, /longest_running_days/, "Discovery evidence should include long-running ad signals.");
  assert.match(discovery, /enqueueCompetitivePublicAdSyncJob/, "Auto-confirmed competitors should queue public ad sync.");
  assert.match(discovery, /auto_confirmed:\s*autoConfirmed/, "Discovery evidence should record whether a candidate was auto-confirmed.");
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
  assert.match(renderer, /自动选择高置信竞品/, "UI should explain automatic high-confidence competitor selection.");
  assert.match(renderer, /AUTO_CONFIRMED_FROM_SKU_PUBLIC_ADS/, "UI should treat auto-confirmed SKU competitors as confirmed.");
});
