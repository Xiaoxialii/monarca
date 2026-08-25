import { AdvertisingMappingMethod, AdvertisingMappingStatus } from "@prisma/client";
import type {
  CanonicalProductCandidate,
  CreativeMappingCandidate,
  MappingDecision
} from "@/lib/ads/creative-intelligence/types";

const SKU_QUERY_KEYS = ["sku", "variant_sku", "product_sku", "item_sku", "utm_sku", "utm_term"] as const;

export function resolveAdvertisingProductMapping(input: {
  candidate: CreativeMappingCandidate;
  products: CanonicalProductCandidate[];
  existingManualMapping?: MappingDecision | null;
}): MappingDecision {
  if (input.existingManualMapping?.status === AdvertisingMappingStatus.MANUALLY_CONFIRMED) {
    return {
      ...input.existingManualMapping,
      evidenceJson: {
        ...input.existingManualMapping.evidenceJson,
        manualOverride: true,
        reason: "Manual mapping is authoritative until the user clears it."
      }
    };
  }

  const products = dedupeProducts(input.products);
  const sourceIds = new Set((input.candidate.sourceProductIds ?? []).map(normalizeIdentity).filter(Boolean));
  const catalogMatch = firstUniqueMatch(products, (product) => sourceIds.has(normalizeIdentity(product.sourceProductId)));
  if (catalogMatch) {
    return confirmed(AdvertisingMappingMethod.CATALOG_PRODUCT_ID, 0.98, catalogMatch, {
      matchedField: "sourceProductId",
      sourceProductIds: Array.from(sourceIds)
    });
  }

  const url = input.candidate.destinationUrl ?? "";
  const urlIds = identifiersFromUrl(url);
  const shopifyProduct = firstUniqueMatch(products, (product) => Boolean(product.shopifyProductId && urlIds.ids.has(normalizeIdentity(product.shopifyProductId))));
  if (shopifyProduct) {
    return confirmed(AdvertisingMappingMethod.SHOPIFY_PRODUCT_ID, 0.97, shopifyProduct, {
      matchedField: "shopifyProductId",
      url
    });
  }
  const shopifyVariant = firstUniqueMatch(products, (product) => Boolean(product.shopifyVariantId && urlIds.ids.has(normalizeIdentity(product.shopifyVariantId))));
  if (shopifyVariant) {
    return confirmed(AdvertisingMappingMethod.SHOPIFY_VARIANT_ID, 0.97, shopifyVariant, {
      matchedField: "shopifyVariantId",
      url
    });
  }
  const merchant = firstUniqueMatch(products, (product) => Boolean(product.googleMerchantItemId && urlIds.ids.has(normalizeIdentity(product.googleMerchantItemId))));
  if (merchant) {
    return confirmed(AdvertisingMappingMethod.GOOGLE_MERCHANT_ITEM_ID, 0.94, merchant, {
      matchedField: "googleMerchantItemId",
      url
    });
  }

  const handleMatch = firstUniqueMatch(products, (product) => Boolean(product.productHandle && urlIds.handles.has(normalizeHandle(product.productHandle))));
  if (handleMatch) {
    return confirmed(AdvertisingMappingMethod.URL_PRODUCT_HANDLE, 0.9, handleMatch, {
      matchedField: "productHandle",
      url,
      handles: Array.from(urlIds.handles)
    });
  }

  const skuFromParam = skuFromUrlParams(url);
  if (skuFromParam) {
    const skuMatch = firstUniqueMatch(products, (product) => normalizeSku(product.sku) === normalizeSku(skuFromParam.value));
    if (skuMatch) {
      return confirmed(
        skuFromParam.key.startsWith("utm") ? AdvertisingMappingMethod.UTM_SKU : AdvertisingMappingMethod.URL_SKU_PARAMETER,
        0.88,
        skuMatch,
        { matchedField: skuFromParam.key, url }
      );
    }
  }

  const adNameSku = strictSkuMatch(input.candidate.adName ?? "", products);
  if (adNameSku.status === "unique" && adNameSku.product) {
    return confirmed(AdvertisingMappingMethod.AD_NAME_SKU, 0.84, adNameSku.product, {
      matchedField: "adName",
      value: input.candidate.adName
    });
  }

  const creativeNameSku = strictSkuMatch(input.candidate.creativeName ?? "", products);
  if (creativeNameSku.status === "unique" && creativeNameSku.product) {
    return confirmed(AdvertisingMappingMethod.CREATIVE_NAME_SKU, 0.82, creativeNameSku.product, {
      matchedField: "creativeName",
      value: input.candidate.creativeName
    });
  }

  const fuzzy = fuzzyNameMatch([input.candidate.adName, input.candidate.creativeName].filter(Boolean).join(" "), products);
  if (fuzzy.length === 1) {
    return {
      status: AdvertisingMappingStatus.NEEDS_REVIEW,
      mappingMethod: AdvertisingMappingMethod.UNKNOWN,
      mappingConfidence: 0.55,
      sku: fuzzy[0].sku,
      canonicalProductId: fuzzy[0].canonicalProductId ?? null,
      canonicalVariantId: fuzzy[0].canonicalVariantId ?? null,
      sourceProductId: fuzzy[0].sourceProductId ?? null,
      evidenceJson: {
        matchedField: "name_similarity",
        candidates: fuzzy.map((product) => product.sku),
        reason: "Name similarity is insufficient for automatic confirmation."
      }
    };
  }

  return {
    status: fuzzy.length > 1 ? AdvertisingMappingStatus.AMBIGUOUS : AdvertisingMappingStatus.UNMAPPED,
    mappingMethod: AdvertisingMappingMethod.UNKNOWN,
    mappingConfidence: 0,
    sku: null,
    canonicalProductId: null,
    canonicalVariantId: null,
    sourceProductId: null,
    evidenceJson: {
      candidates: fuzzy.map((product) => product.sku),
      reason: fuzzy.length > 1 ? "Multiple weak candidates were found." : "No reliable mapping evidence was found."
    }
  };
}

export function multiProductMappingDecision(input: {
  sourceProductIds: string[];
  matchedProducts: CanonicalProductCandidate[];
}): MappingDecision {
  return {
    status: AdvertisingMappingStatus.NEEDS_REVIEW,
    mappingMethod: AdvertisingMappingMethod.MULTI_PRODUCT_AD,
    mappingConfidence: input.matchedProducts.length ? 0.7 : 0.2,
    sku: null,
    canonicalProductId: null,
    canonicalVariantId: null,
    sourceProductId: null,
    evidenceJson: {
      sourceProductIds: input.sourceProductIds,
      candidateSkus: input.matchedProducts.map((product) => product.sku),
      allocationStatus: "MULTI_PRODUCT_UNALLOCATED",
      reason: "Multiple products are promoted by one ad; spend and results must not be duplicated to every SKU."
    }
  };
}

function confirmed(
  method: AdvertisingMappingMethod,
  confidence: number,
  product: CanonicalProductCandidate,
  evidence: Record<string, unknown>
): MappingDecision {
  return {
    status: AdvertisingMappingStatus.AUTO_CONFIRMED,
    mappingMethod: method,
    mappingConfidence: confidence,
    sku: product.sku,
    canonicalProductId: product.canonicalProductId ?? null,
    canonicalVariantId: product.canonicalVariantId ?? null,
    sourceProductId: product.sourceProductId ?? null,
    evidenceJson: {
      ...evidence,
      candidateSku: product.sku,
      conflict: false,
      reason: "Direct deterministic evidence met automatic confirmation threshold."
    }
  };
}

function firstUniqueMatch(products: CanonicalProductCandidate[], predicate: (product: CanonicalProductCandidate) => boolean) {
  const matches = products.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function strictSkuMatch(text: string, products: CanonicalProductCandidate[]) {
  if (!text.trim()) return { status: "none" as const, product: null };
  const normalizedText = ` ${text.toUpperCase()} `;
  const matches = products.filter((product) => {
    const sku = normalizeSku(product.sku);
    if (!sku) return false;
    const pattern = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(sku)}([^A-Z0-9]|$)`, "i");
    return pattern.test(normalizedText);
  });
  if (matches.length === 1) return { status: "unique" as const, product: matches[0] };
  if (matches.length > 1) return { status: "ambiguous" as const, product: null };
  return { status: "none" as const, product: null };
}

function fuzzyNameMatch(text: string, products: CanonicalProductCandidate[]) {
  const normalized = normalizeWords(text);
  if (normalized.length < 4) return [];
  return products.filter((product) => {
    const handle = normalizeWords(product.productHandle ?? "");
    const sku = normalizeWords(product.sku);
    return Boolean(handle && normalized.includes(handle)) || Boolean(sku && normalized.includes(sku));
  }).slice(0, 5);
}

function identifiersFromUrl(value: string) {
  const ids = new Set<string>();
  const handles = new Set<string>();
  if (!value) return { ids, handles };
  try {
    const url = new URL(value);
    for (const segment of url.pathname.split("/").filter(Boolean)) {
      if (/^\d+$/.test(segment)) ids.add(normalizeIdentity(segment));
      if (segment && !["products", "collections", "pages"].includes(segment.toLowerCase())) handles.add(normalizeHandle(segment));
    }
    for (const [, paramValue] of url.searchParams.entries()) {
      if (paramValue) ids.add(normalizeIdentity(paramValue));
    }
  } catch {
    for (const part of value.split(/[/?#&=]/).filter(Boolean)) {
      if (/^\d+$/.test(part)) ids.add(normalizeIdentity(part));
      handles.add(normalizeHandle(part));
    }
  }
  return { ids, handles };
}

function skuFromUrlParams(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    for (const key of SKU_QUERY_KEYS) {
      const candidate = url.searchParams.get(key);
      if (candidate) return { key, value: candidate };
    }
  } catch {
    const params = new URLSearchParams(value.split("?")[1] ?? value);
    for (const key of SKU_QUERY_KEYS) {
      const candidate = params.get(key);
      if (candidate) return { key, value: candidate };
    }
  }
  return null;
}

function dedupeProducts(products: CanonicalProductCandidate[]) {
  const bySku = new Map<string, CanonicalProductCandidate>();
  for (const product of products) {
    if (!product.sku) continue;
    bySku.set(normalizeSku(product.sku), product);
  }
  return Array.from(bySku.values());
}

function normalizeSku(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/^gid:\/\/shopify\/[^/]+\//i, "");
}

function normalizeHandle(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
