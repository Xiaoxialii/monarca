import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const discovery = readFileSync(new URL("../lib/competitive-intelligence/discovery.ts", import.meta.url), "utf8");
const metaLibrary = readFileSync(new URL("../lib/competitive-intelligence/meta-ad-library.ts", import.meta.url), "utf8");
const discoverRoute = readFileSync(new URL("../app/api/competitive-intelligence/discover/route.ts", import.meta.url), "utf8");
const context = readFileSync(new URL("../lib/competitive-intelligence/context.ts", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/report-renderer-engine.tsx", import.meta.url), "utf8");

test("competitor discovery uses SKU product context and public ad search", () => {
  assert.match(discovery, /resolveCanonicalSnapshot/, "Discovery should resolve the active canonical snapshot through the shared resolver.");
  assert.match(discovery, /dataSourceId:\s*input\.dataSourceId/, "Discovery should constrain snapshot resolution when the report supplies a data source.");
  assert.match(discovery, /lookupProductContextIndex/, "Discovery should use the indexed product-context lookup first.");
  assert.match(discovery, /lookupWorkspaceProductContextIndex/, "Discovery should fall back to workspace-scoped exact SKU index lookup before reporting not found.");
  assert.match(discovery, /readCanonicalTableRows/, "Discovery should only fall back to bounded canonical table reads.");
  assert.match(discovery, /contextQuality/, "Discovery should prefer the richest indexed SKU product context.");
  assert.doesNotMatch(discovery, /if \(match\) return match/, "Weak uploaded SKU rows must not shadow richer Shopify product rows.");
  assert.match(discovery, /searchTermsFromProduct/, "Discovery should derive keyword search terms from product attributes.");
  assert.match(discovery, /fetchMetaAdLibrarySearchAds/, "Discovery should query legal public ad data using product-derived terms.");
  assert.match(discovery, /PRODUCT_CONTEXT_INCOMPLETE/, "Incomplete product context should return a structured error.");
  assert.match(discovery, /PRODUCT_NOT_FOUND/, "Missing SKU should return a structured not-found error.");
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
  assert.match(discoverRoute, /body\.dataSourceId/, "Discover API should accept dataSourceId for same-source SKU lookup.");
  assert.doesNotMatch(discoverRoute, /workspaceId.*body|body.*workspaceId/, "Discover API must not trust client-supplied workspaceId.");
});

test("public ad library auth failures return user-safe messages", () => {
  assert.match(metaLibrary, /PUBLIC_AD_LIBRARY_AUTH_EXPIRED/, "Meta code=190/session-expired failures should have a dedicated code.");
  assert.match(metaLibrary, /code=190\|session has expired\|access token\.\*expired\|token\.\*expired/, "Expired token detection should cover Meta API responses.");
  assert.match(discovery, /publicAdLibraryErrorCode\(error\)/, "Discovery should convert Meta API auth errors to structured failures.");
  assert.match(discoverRoute, /publicAdLibraryUserMessage\(publicAdCode\)/, "Discover route should use safe public-ad-library messages.");
  assert.doesNotMatch(discoverRoute, /message:\s*error instanceof Error \? error\.message/, "Discover route must not expose raw Meta API errors.");
  assert.match(renderer, /Meta 广告库凭证已过期/, "UI should show a localized credential-expired message.");
  assert.doesNotMatch(renderer, /META_AD_LIBRARY_API_ERROR/, "UI should not hard-code or expose raw Meta API errors.");
});

test("optimization context and UI expose suggested competitor confirmation path", () => {
  assert.match(context, /status:\s*\{\s*in:\s*\["USER_CONFIRMED",\s*"NEEDS_REVIEW"\]\s*\}/, "Competitive context should include suggested brands.");
  assert.match(context, /SKU_PRODUCT_CONTEXT_CANDIDATES/, "Competitive context should identify SKU-derived candidates.");
  assert.match(renderer, /根据 SKU 查找竞品/, "Decision summary should expose SKU-based competitor discovery.");
  assert.match(renderer, /\/api\/competitive-intelligence\/discover/, "UI should call the discovery API.");
  assert.match(renderer, /dataSourceId:\s*contextDataSourceId/, "UI should pass the report row data source to discovery when available.");
  assert.match(renderer, /自动选择高置信竞品/, "UI should explain automatic high-confidence competitor selection.");
  assert.doesNotMatch(renderer, /Shopify product fields are connected|Shopify 商品字段已接入/, "UI should not hard-code Shopify when the active source may differ.");
  assert.match(renderer, /AUTO_CONFIRMED_FROM_SKU_PUBLIC_ADS/, "UI should treat auto-confirmed SKU competitors as confirmed.");
  assert.match(renderer, /该 SKU 已导入，但缺少商品名称、类目或品牌信息/, "UI should explain incomplete SKU product context.");
  assert.match(renderer, /\/api\/data-sources\/\$\{encodeURIComponent\(discoveryDetails\.dataSourceId\)\}\/reprocess/, "UI should offer reprocess for recoverable old data.");
  assert.match(renderer, /discoveryDetails\.jobStatus/, "UI should show queued or processing reprocess state.");
});
