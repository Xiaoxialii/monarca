export type AmazonRegionCode = "na" | "eu" | "fe";

export type AmazonMarketplace = {
  id: string;
  country: string;
  currency: string;
  name: string;
  region: AmazonRegionCode;
};

export const AMAZON_MARKETPLACES: AmazonMarketplace[] = [
  { id: "ATVPDKIKX0DER", country: "US", currency: "USD", name: "United States", region: "na" },
  { id: "A2EUQ1WTGCTBG2", country: "CA", currency: "CAD", name: "Canada", region: "na" },
  { id: "A1AM78C64UM0Y8", country: "MX", currency: "MXN", name: "Mexico", region: "na" },
  { id: "A1F83G8C2ARO7P", country: "UK", currency: "GBP", name: "United Kingdom", region: "eu" },
  { id: "A1PA6795UKMFR9", country: "DE", currency: "EUR", name: "Germany", region: "eu" },
  { id: "A13V1IB3VIYZZH", country: "FR", currency: "EUR", name: "France", region: "eu" },
  { id: "APJ6JRA9NG5V4", country: "IT", currency: "EUR", name: "Italy", region: "eu" },
  { id: "A1RKKUPIHCS9HS", country: "ES", currency: "EUR", name: "Spain", region: "eu" },
  { id: "A1805IZSGTT6HS", country: "NL", currency: "EUR", name: "Netherlands", region: "eu" },
  { id: "A1VC38T7YXB528", country: "JP", currency: "JPY", name: "Japan", region: "fe" },
  { id: "A39IBJ37TRP1C6", country: "AU", currency: "AUD", name: "Australia", region: "fe" },
  { id: "A19VAU5U5O7RUS", country: "SG", currency: "SGD", name: "Singapore", region: "fe" }
];

export function marketplacesForRegion(region: AmazonRegionCode) {
  return AMAZON_MARKETPLACES.filter((marketplace) => marketplace.region === region);
}

export function normalizeMarketplaceIds(input: unknown, region: AmazonRegionCode) {
  const allowed = new Set(marketplacesForRegion(region).map((marketplace) => marketplace.id));
  const raw = Array.isArray(input)
    ? input
    : String(input ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const normalized = Array.from(new Set(raw.map(String).filter((value) => allowed.has(value))));

  return normalized.length > 0 ? normalized : [marketplacesForRegion(region)[0]?.id].filter(Boolean);
}

export function marketplaceSummary(ids: string[]) {
  const byId = new Map(AMAZON_MARKETPLACES.map((marketplace) => [marketplace.id, marketplace]));
  return ids.map((id) => byId.get(id)).filter((marketplace): marketplace is AmazonMarketplace => Boolean(marketplace));
}
