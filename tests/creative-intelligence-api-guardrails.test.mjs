import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("creative intelligence APIs require workspace authorization and workspace scoped queries", () => {
  for (const path of [
    "app/api/creative-intelligence/performance/route.ts",
    "app/api/creative-intelligence/performance/[id]/route.ts",
    "app/api/creative-intelligence/mappings/route.ts",
    "app/api/creative-intelligence/mappings/[id]/route.ts",
    "app/api/creative-intelligence/sync/route.ts",
    "app/api/creative-intelligence/sync/status/route.ts",
    "app/api/creative-intelligence/unmapped/route.ts",
    "app/api/creative-intelligence/sku/[sku]/route.ts"
  ]) {
    const source = read(path);
    assert.match(source, /requireWorkspace|requireWorkspaceRole/, path);
    assert.match(source, /workspaceId:\s*session\.workspace\.id/, path);
  }
});

test("Meta sync persists creative intelligence before marking sync successful", () => {
  const source = read("lib/ads/meta/meta-sync-engine.ts");
  assert.match(source, /persistCreativeIntelligenceDataset/);
  assert.match(source, /runAutomaticCreativeMappings/);
  assert.match(source, /recomputeCreativeProfitSnapshots/);
  assert.match(source, /status:\s*"success"/);
});

test("Google Ads creative assets remain explicitly unsupported until connector fields exist", () => {
  const source = read("lib/ads/creative-intelligence/types.ts");
  assert.match(source, /GOOGLE_CREATIVE_UNSUPPORTED_REASON/);
  assert.match(source, /keyword performance only/i);
});
