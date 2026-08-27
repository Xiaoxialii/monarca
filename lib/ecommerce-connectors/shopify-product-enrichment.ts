const DEFAULT_PRODUCT_METAFIELD_KEYS = [
  "custom.brand",
  "custom.material",
  "custom.color",
  "custom.size",
  "custom.gender",
  "custom.season",
  "custom.fit",
  "custom.category",
  "custom.target_audience"
] as const;

export function shopifyProductMetafieldKeys() {
  const configured = process.env.SHOPIFY_PRODUCT_METAFIELD_KEYS
    ?.split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return configured?.length ? configured : [...DEFAULT_PRODUCT_METAFIELD_KEYS];
}
