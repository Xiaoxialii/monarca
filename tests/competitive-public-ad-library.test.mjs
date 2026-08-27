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
  extractMetaAdLibraryRecords,
  fetchMetaAdLibraryBrandAds,
  normalizeCompetitorBrandName,
  normalizeMetaAdLibraryAd
} = jiti("./lib/competitive-intelligence/meta-ad-library.ts");
const { buildCompetitiveContextFromPublicAds } = jiti("./lib/competitive-intelligence/context.ts");

test("Meta Ad Library records normalize as public competitor ads without performance metrics", () => {
  const [record] = extractMetaAdLibraryRecords({
    data: [{
      ad_archive_id: "123456789",
      page_id: "page_1",
      page_name: "Competitor Brand",
      ad_snapshot_url: "https://www.facebook.com/ads/library/?id=123456789",
      ad_delivery_start_time: "2026-08-01",
      ad_creative_bodies: ["Win summer with a lighter carry-on."],
      ad_creative_link_titles: ["New travel drop"],
      publisher_platforms: ["facebook", "instagram"]
    }]
  });

  const normalized = normalizeMetaAdLibraryAd({
    workspaceId: "ws_1",
    sku: "SKU_001",
    brandId: "brand_1",
    brandName: " Competitor  Brand ",
    country: "US",
    record
  });

  assert.equal(normalizeCompetitorBrandName(" Competitor  Brand "), "competitor brand");
  assert.equal(normalized.provider, "META_AD_LIBRARY");
  assert.equal(normalized.sourceAdArchiveId, "123456789");
  assert.equal(normalized.normalizedBrandName, "competitor brand");
  assert.equal(normalized.displayFormat, "SOCIAL_AD");
  assert.deepEqual(normalized.creativeBodies, ["Win summer with a lighter carry-on."]);
  assert.equal(normalized.metadataJson.performance_available, false);
  assert.match(normalized.metadataJson.performance_note, /does not expose spend/);
});

test("Meta Ad Library fetch follows pagination and deduplicates ads", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return jsonResponse({
        data: [
          { ad_archive_id: "ad_1", page_name: "Brand A" },
          { ad_archive_id: "ad_2", page_name: "Brand A" }
        ],
        paging: { next: "https://graph.facebook.com/v20.0/ads_archive?after=page_2" }
      });
    }
    return jsonResponse({
      data: [
        { ad_archive_id: "ad_2", page_name: "Brand A" },
        { ad_archive_id: "ad_3", page_name: "Brand A" }
      ]
    });
  };

  const records = await fetchMetaAdLibraryBrandAds({
    accessToken: "token",
    brandName: "Brand A",
    country: "US",
    limit: 3,
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(records.map((record) => record.ad_archive_id), ["ad_1", "ad_2", "ad_3"]);
});

test("competitive context aggregates confirmed brands and public ad library rows", async () => {
  const now = new Date("2026-08-27T00:00:00.000Z");
  const originalNow = Date.now;
  Date.now = () => now.getTime();
  try {
    const prisma = {
      competitiveSkuBrand: {
        findMany: async () => [
          { brandName: "Brand A", category: "bags", confidence: 1 },
          { brandName: "Brand B", category: "bags", confidence: 0.9 }
        ]
      },
      competitivePublicAd: {
        findMany: async () => [
          {
            normalizedBrandName: "brand a",
            displayFormat: "SOCIAL_AD",
            creativeBodies: ["Hook one. Longer body."],
            startDate: new Date("2026-06-01T00:00:00.000Z")
          },
          {
            normalizedBrandName: "brand b",
            displayFormat: "SOCIAL_AD",
            creativeBodies: ["Hook one. Longer body."],
            startDate: new Date("2026-08-01T00:00:00.000Z")
          }
        ]
      }
    };

    const context = await buildCompetitiveContextFromPublicAds(prisma, {
      workspaceId: "ws_1",
      sku: "SKU_001",
      category: "bags",
      ownPrice: 49,
      country: "US"
    });

    assert.equal(context.status, "READY");
    assert.equal(context.source, "PUBLIC_AD_LIBRARY");
    assert.equal(context.competitor_count, 2);
    assert.equal(context.active_public_ads, 2);
    assert.equal(context.longest_running_ad_days, 87);
    assert.deepEqual(context.top_formats, ["SOCIAL_AD"]);
    assert.deepEqual(context.repeated_hooks, ["Hook one. Longer body."]);
    assert.equal(context.data_quality.can_use_for_decision, false);
  } finally {
    Date.now = originalNow;
  }
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
