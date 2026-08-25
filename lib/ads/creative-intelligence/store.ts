import type { PrismaClient } from "@prisma/client";
import {
  AdvertisingMappingMethod,
  AdvertisingMappingStatus,
  Prisma
} from "@prisma/client";
import type {
  CanonicalProductCandidate,
  CreativeIntelligenceAsset,
  CreativeIntelligenceAssetLink,
  MappingDecision
} from "@/lib/ads/creative-intelligence/types";
import type { MetaCreativeNormalizationResult } from "@/lib/ads/creative-intelligence/meta-creative-normalizer";
import { resolveAdvertisingProductMapping } from "@/lib/ads/creative-intelligence/mapping-engine";
import { calculateCreativeProfitSnapshot } from "@/lib/ads/creative-intelligence/profitability";

export async function persistCreativeIntelligenceDataset(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    dataset: MetaCreativeNormalizationResult;
    lastSyncedAt: Date;
  }
) {
  const dataset = input.dataset;
  const account = dataset.account;
  const lastSyncedAt = input.lastSyncedAt;
  await prisma.advertisingAccount.upsert({
    where: {
      workspaceId_provider_sourceAccountId_adAccountId: {
        workspaceId: account.workspaceId,
        provider: account.provider,
        sourceAccountId: account.sourceAccountId,
        adAccountId: account.adAccountId
      }
    },
    create: { ...account, metadataJson: jsonOrNull(account.metadataJson), lastSyncedAt },
    update: {
      accountName: account.accountName,
      currency: account.currency,
      timezone: account.timezone,
      status: account.status,
      metadataJson: jsonOrNull(account.metadataJson),
      lastSyncedAt
    }
  });

  for (const campaign of dataset.campaigns) {
    await prisma.advertisingCampaign.upsert({
      where: {
        workspaceId_provider_sourceAccountId_sourceCampaignId: {
          workspaceId: campaign.workspaceId,
          provider: campaign.provider,
          sourceAccountId: campaign.sourceAccountId,
          sourceCampaignId: campaign.sourceCampaignId
        }
      },
      create: { ...campaign, metadataJson: jsonOrNull(campaign.metadataJson), lastSyncedAt },
      update: {
        campaignName: campaign.campaignName,
        objective: campaign.objective,
        buyingType: campaign.buyingType,
        status: campaign.status,
        effectiveStatus: campaign.effectiveStatus,
        startTime: campaign.startTime,
        stopTime: campaign.stopTime,
        metadataJson: jsonOrNull(campaign.metadataJson),
        lastSyncedAt
      }
    });
  }

  for (const adset of dataset.adsets) {
    await prisma.advertisingAdSet.upsert({
      where: {
        workspaceId_provider_sourceAccountId_sourceAdSetId: {
          workspaceId: adset.workspaceId,
          provider: adset.provider,
          sourceAccountId: adset.sourceAccountId,
          sourceAdSetId: adset.sourceAdSetId
        }
      },
      create: {
        ...adset,
        targetingSummary: jsonOrNull(adset.targetingSummary),
        promotedObject: jsonOrNull(adset.promotedObject),
        metadataJson: jsonOrNull(adset.metadataJson),
        lastSyncedAt
      },
      update: {
        sourceCampaignId: adset.sourceCampaignId,
        adSetName: adset.adSetName,
        optimizationGoal: adset.optimizationGoal,
        billingEvent: adset.billingEvent,
        bidStrategy: adset.bidStrategy,
        dailyBudget: adset.dailyBudget,
        lifetimeBudget: adset.lifetimeBudget,
        targetingSummary: jsonOrNull(adset.targetingSummary),
        promotedObject: jsonOrNull(adset.promotedObject),
        status: adset.status,
        effectiveStatus: adset.effectiveStatus,
        metadataJson: jsonOrNull(adset.metadataJson),
        lastSyncedAt
      }
    });
  }

  for (const ad of dataset.ads) {
    await prisma.advertisingAd.upsert({
      where: {
        workspaceId_provider_sourceAccountId_sourceAdId: {
          workspaceId: ad.workspaceId,
          provider: ad.provider,
          sourceAccountId: ad.sourceAccountId,
          sourceAdId: ad.sourceAdId
        }
      },
      create: {
        ...ad,
        trackingParameters: jsonOrNull(ad.trackingParameters),
        metadataJson: jsonOrNull(ad.metadataJson),
        lastSyncedAt
      },
      update: {
        sourceCampaignId: ad.sourceCampaignId,
        sourceAdSetId: ad.sourceAdSetId,
        sourceCreativeId: ad.sourceCreativeId,
        adName: ad.adName,
        status: ad.status,
        effectiveStatus: ad.effectiveStatus,
        createdTime: ad.createdTime,
        updatedTime: ad.updatedTime,
        previewUrl: ad.previewUrl,
        finalUrl: ad.finalUrl,
        trackingParameters: jsonOrNull(ad.trackingParameters),
        urlTags: ad.urlTags,
        sourcePayloadHash: ad.sourcePayloadHash,
        metadataJson: jsonOrNull(ad.metadataJson),
        lastSyncedAt
      }
    });
  }

  for (const creative of dataset.creatives) {
    await prisma.advertisingCreative.upsert({
      where: {
        workspaceId_provider_sourceAccountId_sourceCreativeId: {
          workspaceId: creative.workspaceId,
          provider: creative.provider,
          sourceAccountId: creative.sourceAccountId,
          sourceCreativeId: creative.sourceCreativeId
        }
      },
      create: {
        ...creative,
        objectStorySpec: jsonOrNull(creative.objectStorySpec),
        assetFeedSpec: jsonOrNull(creative.assetFeedSpec),
        catalogReference: jsonOrNull(creative.catalogReference),
        metadataJson: jsonOrNull(creative.metadataJson),
        lastSyncedAt
      },
      update: {
        creativeName: creative.creativeName,
        creativeFormat: creative.creativeFormat,
        objectStorySpec: jsonOrNull(creative.objectStorySpec),
        assetFeedSpec: jsonOrNull(creative.assetFeedSpec),
        imageHash: creative.imageHash,
        imageUrl: creative.imageUrl,
        thumbnailUrl: creative.thumbnailUrl,
        videoId: creative.videoId,
        videoThumbnailUrl: creative.videoThumbnailUrl,
        primaryText: creative.primaryText,
        headline: creative.headline,
        description: creative.description,
        callToAction: creative.callToAction,
        destinationUrl: creative.destinationUrl,
        pageId: creative.pageId,
        instagramActorId: creative.instagramActorId,
        catalogReference: jsonOrNull(creative.catalogReference),
        sourcePayloadHash: creative.sourcePayloadHash,
        metadataJson: jsonOrNull(creative.metadataJson),
        lastSyncedAt
      }
    });
  }

  const assetIds = new Map<string, string>();
  for (const asset of dataset.assets) {
    const stored = await upsertCreativeAsset(prisma, asset, lastSyncedAt);
    assetIds.set(assetIdentity(asset), stored.id);
  }
  for (const link of dataset.links) {
    const creativeAssetId = assetIds.get(linkIdentityToAssetIdentity(link));
    if (!creativeAssetId) continue;
    const existingLink = await prisma.advertisingCreativeAssetLink.findFirst({
      where: {
        workspaceId: link.workspaceId,
        provider: link.provider,
        sourceAccountId: link.sourceAccountId,
        sourceAdId: link.sourceAdId ?? null,
        sourceCreativeId: link.sourceCreativeId,
        creativeAssetId,
        assetRole: link.assetRole ?? null,
        position: link.position ?? null
      }
    });
    if (existingLink) {
      await prisma.advertisingCreativeAssetLink.update({
        where: { id: existingLink.id },
        data: {
          isActive: link.isActive,
          validTo: null
        }
      });
    } else {
      await prisma.advertisingCreativeAssetLink.create({
        data: {
          workspaceId: link.workspaceId,
          provider: link.provider,
          sourceAccountId: link.sourceAccountId,
          sourceAdId: link.sourceAdId,
          sourceCreativeId: link.sourceCreativeId,
          creativeAssetId,
          assetRole: link.assetRole,
          position: link.position,
          isActive: link.isActive
        }
      });
    }
  }

  for (const row of dataset.performanceDaily) {
    const existingPerformance = await prisma.advertisingPerformanceDaily.findFirst({
      where: {
        workspaceId: row.workspaceId,
        provider: row.provider,
        sourceAccountId: row.sourceAccountId,
        sourceMetricScope: row.sourceMetricScope,
        attributionLevel: row.attributionLevel,
        date: row.date,
        sourceCampaignId: row.sourceCampaignId ?? null,
        sourceAdSetId: row.sourceAdSetId ?? null,
        sourceAdId: row.sourceAdId ?? null,
        sourceCreativeId: row.sourceCreativeId ?? null,
        creativeAssetId: row.creativeAssetId ?? null
      }
    });
    const createData = {
      ...row,
      rawMetricsJson: jsonOrNull(row.rawMetricsJson),
      derivedMetricsJson: jsonOrNull(row.derivedMetricsJson)
    };
    const updateData = {
      attributionConfidence: row.attributionConfidence,
      attributionMethod: row.attributionMethod,
      impressions: row.impressions,
      reach: row.reach,
      frequency: row.frequency,
      clicks: row.clicks,
      inlineLinkClicks: row.inlineLinkClicks,
      outboundClicks: row.outboundClicks,
      spend: row.spend,
      cpm: row.cpm,
      cpc: row.cpc,
      ctr: row.ctr,
      conversions: row.conversions,
      purchases: row.purchases,
      purchaseConversionValue: row.purchaseConversionValue,
      addToCart: row.addToCart,
      initiateCheckout: row.initiateCheckout,
      landingPageViews: row.landingPageViews,
      attributedRevenue: row.attributedRevenue,
      attributionWindow: row.attributionWindow,
      currency: row.currency,
      rawMetricsJson: jsonOrNull(row.rawMetricsJson),
      derivedMetricsJson: jsonOrNull(row.derivedMetricsJson),
      sourcePayloadHash: row.sourcePayloadHash
    };
    if (existingPerformance) {
      await prisma.advertisingPerformanceDaily.update({
        where: { id: existingPerformance.id },
        data: updateData
      });
    } else {
      await prisma.advertisingPerformanceDaily.create({
        data: createData
      });
    }
  }

  return {
    accounts: 1,
    campaigns: dataset.campaigns.length,
    adsets: dataset.adsets.length,
    ads: dataset.ads.length,
    creatives: dataset.creatives.length,
    assets: dataset.assets.length,
    links: dataset.links.length,
    performanceDaily: dataset.performanceDaily.length,
    rejectedCreatives: dataset.rejectedCreatives.length
  };
}

export async function runAutomaticCreativeMappings(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    provider: string;
    dataSourceId: string;
    sourceAccountId: string;
    products?: CanonicalProductCandidate[];
  }
) {
  const products = input.products ?? await loadProductCandidates(prisma, input.workspaceId);
  const ads = await prisma.advertisingAd.findMany({
    where: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: input.provider,
      sourceAccountId: input.sourceAccountId
    }
  });
  const creatives = await prisma.advertisingCreative.findMany({
    where: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: input.provider,
      sourceAccountId: input.sourceAccountId
    },
    select: {
      sourceCreativeId: true,
      creativeName: true,
      destinationUrl: true,
      catalogReference: true
    }
  });
  const creativeById = new Map(creatives.map((creative) => [creative.sourceCreativeId, creative]));
  let changed = 0;

  for (const ad of ads) {
    const manual = await prisma.advertisingProductMapping.findFirst({
      where: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        sourceAccountId: input.sourceAccountId,
        sourceAdId: ad.sourceAdId,
        validTo: null,
        status: AdvertisingMappingStatus.MANUALLY_CONFIRMED
      },
      orderBy: { updatedAt: "desc" }
    });
    const creative = ad.sourceCreativeId ? creativeById.get(ad.sourceCreativeId) : null;
    const sourceProductIds = productIdsFromCatalogReference(creative?.catalogReference);
    const decision = resolveAdvertisingProductMapping({
      candidate: {
        provider: input.provider,
        dataSourceId: input.dataSourceId,
        sourceAccountId: input.sourceAccountId,
        sourceCampaignId: ad.sourceCampaignId,
        sourceAdSetId: ad.sourceAdSetId,
        sourceAdId: ad.sourceAdId,
        sourceCreativeId: ad.sourceCreativeId,
        adName: ad.adName,
        creativeName: creative?.creativeName ?? null,
        destinationUrl: ad.finalUrl ?? creative?.destinationUrl ?? null,
        sourceProductIds
      },
      products,
      existingManualMapping: manual ? mappingDecisionFromRecord(manual) : null
    });
    await upsertMapping(prisma, {
      workspaceId: input.workspaceId,
      provider: input.provider,
      dataSourceId: input.dataSourceId,
      sourceAccountId: input.sourceAccountId,
      sourceCampaignId: ad.sourceCampaignId,
      sourceAdSetId: ad.sourceAdSetId,
      sourceAdId: ad.sourceAdId,
      sourceCreativeId: ad.sourceCreativeId,
      decision
    });
    changed += 1;
  }

  return { evaluated: ads.length, changed };
}

export async function recomputeCreativeProfitSnapshots(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    provider: string;
    dataSourceId: string;
    sourceAccountId: string;
    dateWindowStart: Date;
    dateWindowEnd: Date;
  }
) {
  const mappings = await prisma.advertisingProductMapping.findMany({
    where: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      dataSourceId: input.dataSourceId,
      sourceAccountId: input.sourceAccountId,
      validTo: null
    }
  });
  let generated = 0;
  for (const mapping of mappings) {
    if (!mapping.sourceAdId) continue;
    const performanceRows = await prisma.advertisingPerformanceDaily.findMany({
      where: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        dataSourceId: input.dataSourceId,
        sourceAccountId: input.sourceAccountId,
        sourceAdId: mapping.sourceAdId,
        sourceMetricScope: "AD",
        date: {
          gte: input.dateWindowStart,
          lte: input.dateWindowEnd
        }
      },
      orderBy: { date: "asc" }
    });
    if (!performanceRows.length) continue;
    const assetCount = mapping.sourceCreativeId
      ? await prisma.advertisingCreativeAssetLink.count({
          where: {
            workspaceId: input.workspaceId,
            provider: input.provider,
            sourceAccountId: input.sourceAccountId,
            sourceCreativeId: mapping.sourceCreativeId,
            isActive: true
          }
        })
      : 0;
    const snapshot = calculateCreativeProfitSnapshot({
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: input.provider,
      sourceAccountId: input.sourceAccountId,
      sourceAdId: mapping.sourceAdId,
      sourceCreativeId: mapping.sourceCreativeId,
      metricScope: "AD",
      attributionMethod: assetCount > 1 ? "META_AD_LEVEL_MULTI_ASSET" : "META_AD_LEVEL",
      attributionConfidence: assetCount > 1 ? 0.82 : 0.95,
      mapping: {
        id: mapping.id,
        sku: mapping.sku,
        status: mapping.status,
        mappingConfidence: mapping.mappingConfidence,
        mappingVersion: mapping.mappingVersion,
        mappingMethod: mapping.mappingMethod
      },
      performanceRows: performanceRows as unknown as Parameters<typeof calculateCreativeProfitSnapshot>[0]["performanceRows"],
      skuEconomics: null,
      dateWindowStart: input.dateWindowStart,
      dateWindowEnd: input.dateWindowEnd,
      multiAssetNotAttributable: assetCount > 1,
      multiSkuUnallocated: mapping.mappingMethod === AdvertisingMappingMethod.MULTI_PRODUCT_AD
    });
    const existing = await prisma.advertisingProfitSnapshot.findFirst({
      where: {
        workspaceId: snapshot.workspaceId,
        provider: snapshot.provider,
        sourceAccountId: snapshot.sourceAccountId,
        metricScope: snapshot.metricScope,
        sourceAdId: snapshot.sourceAdId,
        sourceCreativeId: snapshot.sourceCreativeId,
        creativeAssetId: snapshot.creativeAssetId,
        sku: snapshot.sku,
        dateWindowStart: snapshot.dateWindowStart,
        dateWindowEnd: snapshot.dateWindowEnd,
        mappingVersion: snapshot.mappingVersion,
        profitabilityEngineVersion: snapshot.profitabilityEngineVersion,
        attributionVersion: snapshot.attributionVersion
      }
    });
    const data = {
      ...snapshot,
      warningsJson: jsonOrNull(snapshot.warningsJson),
      generatedAt: new Date(),
      staleAt: null
    };
    if (existing) {
      await prisma.advertisingProfitSnapshot.update({ where: { id: existing.id }, data });
    } else {
      await prisma.advertisingProfitSnapshot.create({ data });
    }
    generated += 1;
  }
  return { generated };
}

async function upsertCreativeAsset(
  prisma: PrismaClient | Prisma.TransactionClient,
  asset: CreativeIntelligenceAsset,
  lastSyncedAt: Date
) {
  return prisma.advertisingCreativeAsset.upsert({
    where: {
      workspaceId_provider_sourceAccountId_sourceAssetId_contentHash: {
        workspaceId: asset.workspaceId,
        provider: asset.provider,
        sourceAccountId: asset.sourceAccountId,
        sourceAssetId: asset.sourceAssetId,
        contentHash: asset.contentHash
      }
    },
    create: {
      ...asset,
      metadataJson: jsonOrNull(asset.metadataJson),
      lastSeenAt: lastSyncedAt
    },
    update: {
      role: asset.role,
      textContent: asset.textContent,
      imageUrl: asset.imageUrl,
      thumbnailUrl: asset.thumbnailUrl,
      videoId: asset.videoId,
      sourcePayloadHash: asset.sourcePayloadHash,
      metadataJson: jsonOrNull(asset.metadataJson),
      status: asset.status,
      lastSeenAt: lastSyncedAt
    },
    select: { id: true }
  });
}

async function upsertMapping(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    provider: string;
    dataSourceId: string;
    sourceAccountId: string;
    sourceCampaignId?: string | null;
    sourceAdSetId?: string | null;
    sourceAdId?: string | null;
    sourceCreativeId?: string | null;
    creativeAssetId?: string | null;
    decision: MappingDecision;
  }
) {
  const existing = await prisma.advertisingProductMapping.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      sourceAccountId: input.sourceAccountId,
      sourceAdId: input.sourceAdId,
      sourceCreativeId: input.sourceCreativeId,
      creativeAssetId: input.creativeAssetId ?? null,
      validTo: null
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existing?.status === AdvertisingMappingStatus.MANUALLY_CONFIRMED) return existing;

  const data = {
    workspaceId: input.workspaceId,
    provider: input.provider,
    dataSourceId: input.dataSourceId,
    sourceAccountId: input.sourceAccountId,
    sourceCampaignId: input.sourceCampaignId ?? null,
    sourceAdSetId: input.sourceAdSetId ?? null,
    sourceAdId: input.sourceAdId ?? null,
    sourceCreativeId: input.sourceCreativeId ?? null,
    creativeAssetId: input.creativeAssetId ?? null,
    canonicalProductId: input.decision.canonicalProductId ?? null,
    canonicalVariantId: input.decision.canonicalVariantId ?? null,
    sku: input.decision.sku ?? null,
    sourceProductId: input.decision.sourceProductId ?? null,
    mappingMethod: input.decision.mappingMethod,
    mappingConfidence: input.decision.mappingConfidence,
    evidenceJson: jsonOrNull(input.decision.evidenceJson),
    status: input.decision.status,
    mappingVersion: existing ? existing.mappingVersion + 1 : 1
  };

  if (existing) {
    const updated = await prisma.advertisingProductMapping.update({
      where: { id: existing.id },
      data
    });
    await prisma.advertisingProductMappingAudit.create({
      data: {
        workspaceId: input.workspaceId,
        mappingId: updated.id,
        action: "AUTO_MAPPING_UPDATED",
        previousStatus: existing.status,
        nextStatus: updated.status,
        previousValue: existing as unknown as Prisma.InputJsonValue,
        nextValue: data as Prisma.InputJsonValue
      }
    });
    await prisma.advertisingProfitSnapshot.updateMany({
      where: { workspaceId: input.workspaceId, mappingId: updated.id, staleAt: null },
      data: { staleAt: new Date() }
    });
    return updated;
  }

  return prisma.advertisingProductMapping.create({ data });
}

async function loadProductCandidates(prisma: PrismaClient | Prisma.TransactionClient, workspaceId: string): Promise<CanonicalProductCandidate[]> {
  const snapshot = await prisma.schemaSnapshot.findFirst({
    where: { workspaceId, canonicalStatus: { in: ["READY", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    select: { schemaJson: true }
  });
  const schema = objectValue(snapshot?.schemaJson);
  const tables = objectValue(schema.tables);
  const rows = Array.isArray(tables.ecommerce_products)
    ? tables.ecommerce_products
    : Array.isArray(objectValue(schema.canonicalDataset).tables)
      ? []
      : [];
  return rows.map((row) => productCandidateFromRow(objectValue(row))).filter((row) => row.sku);
}

function productCandidateFromRow(row: Record<string, unknown>): CanonicalProductCandidate {
  return {
    sku: stringValue(row.sku, row.product_sku, row.variant_sku, row.source_id),
    canonicalProductId: stringValue(row.canonical_product_id, row.product_id, row.id) || null,
    canonicalVariantId: stringValue(row.canonical_variant_id, row.variant_id) || null,
    sourceProductId: stringValue(row.source_product_id, row.product_id, row.id) || null,
    shopifyProductId: stringValue(row.shopify_product_id, row.product_id) || null,
    shopifyVariantId: stringValue(row.shopify_variant_id, row.variant_id) || null,
    googleMerchantItemId: stringValue(row.google_merchant_item_id, row.merchant_item_id) || null,
    productHandle: stringValue(row.handle, row.product_handle) || null
  };
}

function productIdsFromCatalogReference(value: unknown) {
  const row = objectValue(value);
  return Object.values(row).flatMap((item) => {
    if (Array.isArray(item)) return item.map(String);
    if (typeof item === "string" || typeof item === "number") return [String(item)];
    return [];
  });
}

function mappingDecisionFromRecord(record: {
  status: AdvertisingMappingStatus;
  mappingMethod: AdvertisingMappingMethod;
  mappingConfidence: number;
  sku: string | null;
  canonicalProductId: string | null;
  canonicalVariantId: string | null;
  sourceProductId: string | null;
  evidenceJson: unknown;
}): MappingDecision {
  return {
    status: record.status,
    mappingMethod: record.mappingMethod,
    mappingConfidence: record.mappingConfidence,
    sku: record.sku,
    canonicalProductId: record.canonicalProductId,
    canonicalVariantId: record.canonicalVariantId,
    sourceProductId: record.sourceProductId,
    evidenceJson: objectValue(record.evidenceJson)
  };
}

function assetIdentity(asset: CreativeIntelligenceAsset) {
  return [asset.workspaceId, asset.provider, asset.sourceAccountId, asset.sourceAssetId, asset.contentHash].join(":");
}

function linkIdentityToAssetIdentity(link: CreativeIntelligenceAssetLink) {
  return [link.workspaceId, link.provider, link.sourceAccountId, link.sourceAssetId, link.contentHash].join(":");
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
