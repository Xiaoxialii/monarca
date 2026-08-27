import type { PrismaClient } from "@prisma/client";
import type { CompetitiveContext, PortfolioOptimizationInput, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";

export async function buildCompetitiveContextFromPublicAds(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    sku: string;
    category?: string | null;
    ownPrice?: number | null;
    country?: string | null;
  }
): Promise<CompetitiveContext | null> {
  const sku = input.sku.trim();
  if (!sku) return null;
  const country = (input.country || "US").toUpperCase();
  const brands = await prisma.competitiveSkuBrand.findMany({
    where: {
      workspaceId: input.workspaceId,
      sku,
      validTo: null,
      status: { in: ["USER_CONFIRMED", "NEEDS_REVIEW"] }
    },
    orderBy: { updatedAt: "desc" }
  });
  const confirmedBrands = brands.filter((brand) => brand.status === "USER_CONFIRMED");
  const suggestedBrands = brands.filter((brand) => brand.status === "NEEDS_REVIEW");

  const ads = await prisma.competitivePublicAd.findMany({
    where: {
      workspaceId: input.workspaceId,
      sku,
      provider: "META_AD_LIBRARY",
      country,
      isActive: true
    },
    orderBy: [
      { startDate: "asc" },
      { updatedAt: "desc" }
    ],
    take: 200
  });

  const hasBrands = confirmedBrands.length > 0;
  const hasSuggestedBrands = suggestedBrands.length > 0;
  const hasAds = ads.length > 0;
  if (!hasBrands && !hasAds && !hasSuggestedBrands) return null;

  const longestRunningAdDays = ads.reduce<number | null>((max, ad) => {
    if (!ad.startDate) return max;
    const days = Math.max(0, Math.floor((Date.now() - ad.startDate.getTime()) / 86_400_000));
    return max === null ? days : Math.max(max, days);
  }, null);

  const topFormats = topValues(ads.map((ad) => ad.displayFormat).filter((value): value is string => Boolean(value)));
  const repeatedHooks = topValues(ads.flatMap((ad) => jsonStringArray(ad.creativeBodies)).map(shortHook));
  const warnings = [
    "Public competitor ad library data is informational only and is not used for automated budget decisions yet.",
    ...(!hasBrands && hasSuggestedBrands ? ["Competitor candidates were inferred from SKU product context and public ads. Confirm the brands before syncing competitor ad data."] : []),
    ...(!hasAds && hasBrands ? ["Public ad library sync has not returned active ads for the confirmed competitors."] : [])
  ];

  return {
    status: hasBrands && hasAds ? "READY" : hasBrands ? "PUBLIC_AD_LIBRARY_NOT_CONNECTED" : "NEEDS_COMPETITOR_REVIEW",
    source: hasAds ? "PUBLIC_AD_LIBRARY" : hasBrands ? "USER_CONFIRMED_COMPETITORS" : "SKU_PRODUCT_CONTEXT_CANDIDATES",
    category: input.category ?? brands[0]?.category ?? null,
    price_position: "UNKNOWN",
    own_price: input.ownPrice && input.ownPrice > 0 ? input.ownPrice : null,
    market_reference_price: null,
    competitor_price: null,
    competitor_count: confirmedBrands.length || suggestedBrands.length || new Set(ads.map((ad) => ad.normalizedBrandName)).size,
    active_public_ads: ads.length,
    longest_running_ad_days: longestRunningAdDays,
    repeated_hooks: repeatedHooks,
    top_formats: topFormats,
    competitor_brands: brands.map((brand) => ({
      name: brand.brandName,
      source: brand.source,
      confidence: brand.confidence
    })),
    data_quality: {
      has_confirmed_competitors: hasBrands,
      has_public_ad_library_data: hasAds,
      can_use_for_decision: false,
      warnings
    },
    next_step: hasAds
      ? "Review public competitor ad patterns; Monarca will keep them informational until validated for decision use."
      : hasBrands
        ? "Run public Meta Ad Library collection for confirmed competitor brands."
        : "Confirm inferred competitor candidates before syncing public ad library signals."
  };
}

export async function enrichPortfolioInputWithCompetitiveContexts(
  prisma: PrismaClient,
  workspaceId: string,
  input: PortfolioOptimizationInput,
  options: { country?: string | null } = {}
): Promise<PortfolioOptimizationInput> {
  const enrichedSkus = await Promise.all(input.skus.map(async (sku) => {
    const context = await buildCompetitiveContextFromPublicAds(prisma, {
      workspaceId,
      sku: sku.sku,
      category: sku.category ?? null,
      ownPrice: sku.price,
      country: options.country
    });
    if (!context) return sku;
    return {
      ...sku,
      competitive_context: context
    } satisfies PortfolioSkuInput;
  }));

  return {
    ...input,
    skus: enrichedSkus
  };
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function shortHook(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function topValues(values: string[], limit = 5) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}
