import crypto from "node:crypto";
import { CreativeAssetStatus, CreativeAssetType, CreativeAttributionLevel } from "@prisma/client";
import type { MetaAdsInsight } from "@/lib/ads/meta/meta-ads-connector";
import type {
  CreativeIntelligenceAccount,
  CreativeIntelligenceAd,
  CreativeIntelligenceAdSet,
  CreativeIntelligenceAsset,
  CreativeIntelligenceAssetLink,
  CreativeIntelligenceCampaign,
  CreativeIntelligenceCreative,
  CreativeIntelligencePerformanceDaily
} from "@/lib/ads/creative-intelligence/types";

type MetaRow = Record<string, unknown>;
const META_ADS_PROVIDER = "meta_ads";

export type MetaCreativeNormalizationInput = {
  workspaceId: string;
  dataSourceId: string;
  sourceAccountId: string;
  adAccountId: string;
  account?: MetaRow | null;
  campaigns: MetaRow[];
  adsets: MetaRow[];
  ads: MetaRow[];
  insights: MetaAdsInsight[];
  currency?: string | null;
};

export type MetaCreativeNormalizationResult = {
  account: CreativeIntelligenceAccount;
  campaigns: CreativeIntelligenceCampaign[];
  adsets: CreativeIntelligenceAdSet[];
  ads: CreativeIntelligenceAd[];
  creatives: CreativeIntelligenceCreative[];
  assets: CreativeIntelligenceAsset[];
  links: CreativeIntelligenceAssetLink[];
  performanceDaily: CreativeIntelligencePerformanceDaily[];
  rejectedCreatives: Array<{ sourceCreativeId: string | null; reason: string }>;
};

export function normalizeMetaCreativeIntelligence(input: MetaCreativeNormalizationInput): MetaCreativeNormalizationResult {
  const provider = META_ADS_PROVIDER;
  const accountPayload = objectValue(input.account);
  const account: CreativeIntelligenceAccount = {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    provider,
    sourceAccountId: input.sourceAccountId,
    adAccountId: input.adAccountId,
    accountName: stringValue(accountPayload.name, accountPayload.account_name) || null,
    currency: stringValue(accountPayload.currency, input.currency) || null,
    timezone: stringValue(accountPayload.timezone_name, accountPayload.timezone) || null,
    status: stringValue(accountPayload.account_status, accountPayload.status) || null,
    metadataJson: accountPayload
  };

  const campaigns = input.campaigns.map((row) => ({
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    provider,
    sourceAccountId: input.sourceAccountId,
    adAccountId: input.adAccountId,
    sourceCampaignId: stringValue(row.id),
    campaignName: stringValue(row.name) || null,
    objective: stringValue(row.objective) || null,
    buyingType: stringValue(row.buying_type, row.buyingType) || null,
    status: stringValue(row.status) || null,
    effectiveStatus: stringValue(row.effective_status, row.effectiveStatus) || null,
    startTime: dateValue(row.start_time, row.startTime),
    stopTime: dateValue(row.stop_time, row.stopTime),
    metadataJson: objectValue(row)
  })).filter((row) => row.sourceCampaignId);

  const adsets = input.adsets.map((row) => ({
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    provider,
    sourceAccountId: input.sourceAccountId,
    sourceCampaignId: stringValue(row.campaign_id, row.campaignId),
    sourceAdSetId: stringValue(row.id),
    adSetName: stringValue(row.name) || null,
    optimizationGoal: stringValue(row.optimization_goal, row.optimizationGoal) || null,
    billingEvent: stringValue(row.billing_event, row.billingEvent) || null,
    bidStrategy: stringValue(row.bid_strategy, row.bidStrategy) || null,
    dailyBudget: nullableNumber(row.daily_budget, row.dailyBudget),
    lifetimeBudget: nullableNumber(row.lifetime_budget, row.lifetimeBudget),
    targetingSummary: objectValue(row.targeting),
    promotedObject: objectValue(row.promoted_object, row.promotedObject),
    status: stringValue(row.status) || null,
    effectiveStatus: stringValue(row.effective_status, row.effectiveStatus) || null,
    metadataJson: objectValue(row)
  })).filter((row) => row.sourceAdSetId && row.sourceCampaignId);

  const creatives = new Map<string, CreativeIntelligenceCreative>();
  const assets = new Map<string, CreativeIntelligenceAsset>();
  const links = new Map<string, CreativeIntelligenceAssetLink>();
  const rejectedCreatives: MetaCreativeNormalizationResult["rejectedCreatives"] = [];

  const ads = input.ads.map((row) => {
    const creative = objectValue(row.creative);
    const sourceCreativeId = stringValue(creative.id, row.creative_id, row.creativeId) || null;
    if (sourceCreativeId) {
      try {
        const normalized = normalizeCreative({
          workspaceId: input.workspaceId,
          dataSourceId: input.dataSourceId,
          provider,
          sourceAccountId: input.sourceAccountId,
          sourceCreativeId,
          creative
        });
        creatives.set(sourceCreativeId, normalized.creative);
        for (const asset of normalized.assets) assets.set(assetKey(asset), asset);
        const sourceAdId = stringValue(row.id);
        for (const link of normalized.links) {
          const key = [link.sourceAdId ?? sourceAdId, link.sourceCreativeId, link.sourceAssetId, link.contentHash, link.assetRole, link.position].join(":");
          links.set(key, { ...link, sourceAdId });
        }
      } catch (error) {
        rejectedCreatives.push({
          sourceCreativeId,
          reason: error instanceof Error ? error.message : "Creative normalization failed."
        });
      }
    }

    const finalUrl = destinationUrlFromAd(row, creative);
    return {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider,
      sourceAccountId: input.sourceAccountId,
      sourceCampaignId: stringValue(row.campaign_id, row.campaignId) || null,
      sourceAdSetId: stringValue(row.adset_id, row.adsetId) || null,
      sourceAdId: stringValue(row.id),
      sourceCreativeId,
      adName: stringValue(row.name) || null,
      status: stringValue(row.status) || null,
      effectiveStatus: stringValue(row.effective_status, row.effectiveStatus) || null,
      createdTime: dateValue(row.created_time, row.createdTime),
      updatedTime: dateValue(row.updated_time, row.updatedTime),
      previewUrl: stringValue(row.preview_shareable_link, row.previewShareableLink) || null,
      finalUrl,
      trackingParameters: objectOrArrayJson(row.tracking_specs, row.trackingSpecs),
      urlTags: stringValue(row.url_tags, row.urlTags) || null,
      sourcePayloadHash: hashJson(row),
      metadataJson: objectValue(row)
    };
  }).filter((row) => row.sourceAdId);

  const creativeAssetCounts = new Map<string, number>();
  for (const link of links.values()) {
    creativeAssetCounts.set(link.sourceCreativeId, (creativeAssetCounts.get(link.sourceCreativeId) ?? 0) + 1);
  }

  const adCreativeById = new Map(ads.map((ad) => [ad.sourceAdId, ad.sourceCreativeId ?? null]));
  const performanceDaily = input.insights.map((insight, index) => {
    const sourceAdId = stringValue(insight.ad_id) || null;
    const sourceCreativeId = sourceAdId ? adCreativeById.get(sourceAdId) ?? null : null;
    const assetCount = sourceCreativeId ? creativeAssetCounts.get(sourceCreativeId) ?? 0 : 0;
    const dynamicOrMultiAsset = Boolean(sourceCreativeId && assetCount > 1);
    const actions = Array.isArray(insight.actions) ? insight.actions : [];
    const actionValues = Array.isArray(insight.action_values) ? insight.action_values : [];
    const date = dateValue(insight.date_start, insight.date) ?? new Date("1970-01-01T00:00:00.000Z");

    return {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider,
      sourceAccountId: input.sourceAccountId,
      sourceCampaignId: stringValue(insight.campaign_id) || null,
      sourceAdSetId: stringValue(insight.adset_id) || null,
      sourceAdId,
      sourceCreativeId,
      creativeAssetId: null,
      date,
      attributionLevel: dynamicOrMultiAsset ? CreativeAttributionLevel.AD : CreativeAttributionLevel.AD,
      attributionConfidence: dynamicOrMultiAsset ? 0.82 : 0.95,
      attributionMethod: dynamicOrMultiAsset ? "META_AD_LEVEL_MULTI_ASSET" : "META_AD_LEVEL",
      sourceMetricScope: "AD",
      impressions: nullableInt(insight.impressions),
      reach: nullableInt(insight.reach),
      frequency: nullableNumber(insight.frequency),
      clicks: nullableInt(insight.clicks),
      inlineLinkClicks: nullableAction(actions, ["inline_link_click"]),
      outboundClicks: nullableAction(actions, ["outbound_click", "outbound_clicks"]),
      spend: nullableNumber(insight.spend),
      cpm: nullableNumber(insight.cpm),
      cpc: nullableNumber(insight.cpc),
      ctr: nullableNumber(insight.ctr),
      conversions: nullableNumber(insight.conversions, actionValue(actions, ["purchase", "offsite_conversion.fb_pixel_purchase"])),
      purchases: nullableAction(actions, ["purchase", "offsite_conversion.fb_pixel_purchase"]),
      purchaseConversionValue: nullableNumber(insight.purchase_value, actionValue(actionValues, ["purchase", "offsite_conversion.fb_pixel_purchase"])),
      addToCart: nullableAction(actions, ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"]),
      initiateCheckout: nullableAction(actions, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]),
      landingPageViews: nullableAction(actions, ["landing_page_view"]),
      attributedRevenue: nullableNumber(insight.purchase_value, actionValue(actionValues, ["purchase", "offsite_conversion.fb_pixel_purchase"])),
      attributionWindow: attributionWindow(insight),
      currency: account.currency ?? input.currency ?? null,
      rawMetricsJson: objectValue(insight),
      derivedMetricsJson: {
        sourceIndex: index,
        assetPerformanceStatus: dynamicOrMultiAsset ? "NOT_SEPARATELY_ATTRIBUTABLE" : "AD_LEVEL_ONLY"
      },
      sourcePayloadHash: hashJson(insight)
    };
  });

  return {
    account,
    campaigns,
    adsets,
    ads,
    creatives: Array.from(creatives.values()),
    assets: Array.from(assets.values()),
    links: Array.from(links.values()),
    performanceDaily,
    rejectedCreatives
  };
}

function normalizeCreative(input: {
  workspaceId: string;
  dataSourceId: string;
  provider: string;
  sourceAccountId: string;
  sourceCreativeId: string;
  creative: MetaRow;
}) {
  const objectStorySpec = objectValue(input.creative.object_story_spec, input.creative.objectStorySpec);
  const assetFeedSpec = objectValue(input.creative.asset_feed_spec, input.creative.assetFeedSpec);
  const linkData = objectValue(objectStorySpec.link_data, objectStorySpec.linkData);
  const videoData = objectValue(objectStorySpec.video_data, objectStorySpec.videoData);
  const templateData = objectValue(objectStorySpec.template_data, objectStorySpec.templateData);
  const callToAction = objectValue(linkData.call_to_action, linkData.callToAction, videoData.call_to_action, videoData.callToAction);
  const destinationUrl = stringValue(
    input.creative.destination_url,
    linkData.link,
    linkData.caption,
    videoData.link,
    templateData.link,
    objectValue(callToAction.value).link
  );
  const imageUrl = stringValue(input.creative.image_url, linkData.picture, templateData.picture);
  const thumbnailUrl = stringValue(input.creative.thumbnail_url, input.creative.thumbnailUrl, linkData.thumbnail_url);
  const videoId = stringValue(input.creative.video_id, videoData.video_id);
  const bodyText = stringValue(input.creative.body, linkData.message, videoData.message, templateData.message);
  const headline = stringValue(input.creative.title, linkData.name, videoData.title, templateData.name);
  const description = stringValue(input.creative.description, linkData.description, templateData.description);
  const sourcePayloadHash = hashJson(input.creative);
  const format = inferCreativeFormat({ assetFeedSpec, linkData, videoData, templateData, imageUrl, videoId });
  const creative: CreativeIntelligenceCreative = {
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    provider: input.provider,
    sourceAccountId: input.sourceAccountId,
    sourceCreativeId: input.sourceCreativeId,
    creativeName: stringValue(input.creative.name) || null,
    creativeFormat: format,
    objectStorySpec,
    assetFeedSpec,
    imageHash: stringValue(input.creative.image_hash, linkData.image_hash) || null,
    imageUrl: imageUrl || null,
    thumbnailUrl: thumbnailUrl || null,
    videoId: videoId || null,
    videoThumbnailUrl: stringValue(input.creative.video_thumbnail_url, videoData.image_url) || null,
    primaryText: bodyText || null,
    headline: headline || null,
    description: description || null,
    callToAction: stringValue(input.creative.call_to_action_type, callToAction.type) || null,
    destinationUrl: destinationUrl || null,
    pageId: stringValue(objectStorySpec.page_id, input.creative.page_id) || null,
    instagramActorId: stringValue(objectStorySpec.instagram_actor_id, input.creative.instagram_actor_id) || null,
    catalogReference: catalogReference(input.creative, objectStorySpec, assetFeedSpec),
    sourcePayloadHash,
    metadataJson: input.creative
  };

  const normalizedAssets: CreativeIntelligenceAsset[] = [];
  const addAsset = (asset: Omit<CreativeIntelligenceAsset, "workspaceId" | "dataSourceId" | "provider" | "sourceAccountId" | "sourceCreativeId" | "contentHash" | "sourcePayloadHash" | "status">) => {
    const contentHash = hashJson({
      type: asset.assetType,
      role: asset.role,
      text: asset.textContent,
      image: asset.imageUrl,
      thumbnail: asset.thumbnailUrl,
      video: asset.videoId
    });
    normalizedAssets.push({
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: input.provider,
      sourceAccountId: input.sourceAccountId,
      sourceCreativeId: input.sourceCreativeId,
      ...asset,
      contentHash,
      sourcePayloadHash: hashJson(asset.metadataJson ?? asset),
      status: CreativeAssetStatus.ACTIVE
    });
  };

  if (imageUrl || thumbnailUrl) {
    addAsset({
      sourceAssetId: stringValue(input.creative.image_hash, linkData.image_hash, imageUrl, thumbnailUrl) || `${input.sourceCreativeId}:image`,
      assetType: CreativeAssetType.IMAGE,
      role: "IMAGE",
      imageUrl: imageUrl || null,
      thumbnailUrl: thumbnailUrl || imageUrl || null,
      metadataJson: { source: "object_story_spec" }
    });
  }
  if (videoId) {
    addAsset({
      sourceAssetId: videoId,
      assetType: CreativeAssetType.VIDEO,
      role: "VIDEO",
      videoId,
      thumbnailUrl: creative.videoThumbnailUrl ?? null,
      metadataJson: { source: "object_story_spec" }
    });
  }
  if (bodyText) addTextAsset(addAsset, input.sourceCreativeId, CreativeAssetType.PRIMARY_TEXT, "PRIMARY_TEXT", bodyText);
  if (headline) addTextAsset(addAsset, input.sourceCreativeId, CreativeAssetType.HEADLINE, "HEADLINE", headline);
  if (description) addTextAsset(addAsset, input.sourceCreativeId, CreativeAssetType.DESCRIPTION, "DESCRIPTION", description);
  if (creative.callToAction) addTextAsset(addAsset, input.sourceCreativeId, CreativeAssetType.CTA, "CTA", creative.callToAction);
  addAssetFeedAssets(addAsset, input.sourceCreativeId, assetFeedSpec);

  const hasMultipleAttributionMembers = normalizedAssets.length > 1 || Object.keys(assetFeedSpec).length > 0;
  const finalAssets = normalizedAssets.map((asset) => ({
    ...asset,
    status: hasMultipleAttributionMembers ? CreativeAssetStatus.NOT_SEPARATELY_ATTRIBUTABLE : CreativeAssetStatus.ACTIVE
  }));
  const links = finalAssets.map((asset, index) => ({
    workspaceId: input.workspaceId,
    provider: input.provider,
    sourceAccountId: input.sourceAccountId,
    sourceAdId: null,
    sourceCreativeId: input.sourceCreativeId,
    sourceAssetId: asset.sourceAssetId,
    contentHash: asset.contentHash,
    assetRole: asset.role ?? asset.assetType,
    position: index,
    isActive: true
  }));

  return { creative, assets: finalAssets, links };
}

function addTextAsset(
  addAsset: (asset: Omit<CreativeIntelligenceAsset, "workspaceId" | "dataSourceId" | "provider" | "sourceAccountId" | "sourceCreativeId" | "contentHash" | "sourcePayloadHash" | "status">) => void,
  sourceCreativeId: string,
  assetType: CreativeAssetType,
  role: string,
  text: string
) {
  addAsset({
    sourceAssetId: `${sourceCreativeId}:${role}:${hashText(text).slice(0, 16)}`,
    assetType,
    role,
    textContent: text,
    metadataJson: { source: "object_story_spec" }
  });
}

function addAssetFeedAssets(
  addAsset: (asset: Omit<CreativeIntelligenceAsset, "workspaceId" | "dataSourceId" | "provider" | "sourceAccountId" | "sourceCreativeId" | "contentHash" | "sourcePayloadHash" | "status">) => void,
  sourceCreativeId: string,
  assetFeedSpec: MetaRow
) {
  arrayValue(assetFeedSpec.images).forEach((item, index) => {
    const row = objectValue(item);
    const url = stringValue(row.url, row.image_url, row.picture);
    addAsset({
      sourceAssetId: stringValue(row.hash, row.image_hash, row.id, url) || `${sourceCreativeId}:feed:image:${index}`,
      assetType: CreativeAssetType.IMAGE,
      role: "IMAGE",
      imageUrl: url || null,
      thumbnailUrl: stringValue(row.thumbnail_url, row.url) || null,
      metadataJson: { source: "asset_feed_spec", position: index, payload: row }
    });
  });
  arrayValue(assetFeedSpec.videos).forEach((item, index) => {
    const row = objectValue(item);
    const videoId = stringValue(row.video_id, row.id);
    addAsset({
      sourceAssetId: videoId || `${sourceCreativeId}:feed:video:${index}`,
      assetType: CreativeAssetType.VIDEO,
      role: "VIDEO",
      videoId: videoId || null,
      thumbnailUrl: stringValue(row.thumbnail_url, row.image_url) || null,
      metadataJson: { source: "asset_feed_spec", position: index, payload: row }
    });
  });
  addFeedTextAssets(addAsset, sourceCreativeId, "bodies", CreativeAssetType.PRIMARY_TEXT, "PRIMARY_TEXT", assetFeedSpec.bodies);
  addFeedTextAssets(addAsset, sourceCreativeId, "titles", CreativeAssetType.HEADLINE, "HEADLINE", assetFeedSpec.titles);
  addFeedTextAssets(addAsset, sourceCreativeId, "descriptions", CreativeAssetType.DESCRIPTION, "DESCRIPTION", assetFeedSpec.descriptions);
  addFeedTextAssets(addAsset, sourceCreativeId, "call_to_action_types", CreativeAssetType.CTA, "CTA", assetFeedSpec.call_to_action_types);
}

function addFeedTextAssets(
  addAsset: (asset: Omit<CreativeIntelligenceAsset, "workspaceId" | "dataSourceId" | "provider" | "sourceAccountId" | "sourceCreativeId" | "contentHash" | "sourcePayloadHash" | "status">) => void,
  sourceCreativeId: string,
  source: string,
  assetType: CreativeAssetType,
  role: string,
  values: unknown
) {
  arrayValue(values).forEach((item, index) => {
    const row = objectValue(item);
    const text = stringValue(row.text, row.value, item);
    if (!text) return;
    addAsset({
      sourceAssetId: `${sourceCreativeId}:feed:${source}:${hashText(text).slice(0, 16)}`,
      assetType,
      role,
      textContent: text,
      metadataJson: { source: "asset_feed_spec", feedKey: source, position: index, payload: row }
    });
  });
}

function destinationUrlFromAd(ad: MetaRow, creative: MetaRow) {
  const urlTags = stringValue(ad.url_tags, ad.urlTags);
  const objectStorySpec = objectValue(creative.object_story_spec, creative.objectStorySpec);
  const linkData = objectValue(objectStorySpec.link_data, objectStorySpec.linkData);
  const videoData = objectValue(objectStorySpec.video_data, objectStorySpec.videoData);
  const cta = objectValue(linkData.call_to_action, linkData.callToAction, videoData.call_to_action, videoData.callToAction);
  const value = objectValue(cta.value);
  const base = stringValue(creative.destination_url, linkData.link, videoData.link, value.link);
  if (!base || !urlTags) return base || null;
  return base.includes("?") ? `${base}&${urlTags}` : `${base}?${urlTags}`;
}

function inferCreativeFormat(input: { assetFeedSpec: MetaRow; linkData: MetaRow; videoData: MetaRow; templateData: MetaRow; imageUrl: string; videoId: string }) {
  if (Object.keys(input.assetFeedSpec).length > 0) return "DYNAMIC_CREATIVE";
  if (input.videoId || Object.keys(input.videoData).length > 0) return "VIDEO";
  if (Array.isArray(input.linkData.child_attachments) || Array.isArray(input.templateData.child_attachments)) return "CAROUSEL";
  if (input.imageUrl) return "IMAGE";
  return "OTHER";
}

function catalogReference(...values: unknown[]) {
  const reference: Record<string, unknown> = {};
  for (const value of values) {
    const row = objectValue(value);
    for (const key of ["product_set_id", "productSetId", "catalog_id", "catalogId", "product_catalog_id", "template_url_spec"]) {
      if (row[key] !== undefined) reference[key] = row[key];
    }
  }
  return Object.keys(reference).length ? reference : null;
}

function attributionWindow(insight: MetaAdsInsight) {
  const windows = [insight.attribution_setting, insight.action_attribution_windows].filter(Boolean);
  return windows.length ? windows.map(String).join(",") : null;
}

function assetKey(asset: CreativeIntelligenceAsset) {
  return [asset.workspaceId, asset.provider, asset.sourceAccountId, asset.sourceAssetId, asset.contentHash].join(":");
}

function actionValue(actions: unknown, actionTypes: string[]) {
  if (!Array.isArray(actions)) return null;
  const normalized = new Set(actionTypes.map((item) => item.toLowerCase()));
  const match = actions.find((action) => normalized.has(String(objectValue(action).action_type ?? "").toLowerCase()));
  return nullableNumber(objectValue(match).value);
}

function nullableAction(actions: unknown, actionTypes: string[]) {
  return actionValue(actions, actionTypes);
}

function hashJson(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function objectValue(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function objectOrArrayJson(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (Array.isArray(value)) return { items: value };
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function nullableNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function nullableInt(...values: unknown[]) {
  const value = nullableNumber(...values);
  return value === null ? null : Math.round(value);
}

function dateValue(...values: unknown[]) {
  const raw = stringValue(...values);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
