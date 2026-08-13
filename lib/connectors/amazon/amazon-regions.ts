import { AmazonConnectorError } from "@/lib/connectors/amazon/amazon-errors";
import type { AmazonRegionCode } from "@/lib/connectors/amazon/amazon-marketplaces";

export type AmazonRegionConfig = {
  code: AmazonRegionCode;
  label: string;
  sellerCentralAuthorizeUrl: string;
  spApiEndpoint: string;
  awsSigningRegion: string;
};

export const AMAZON_REGIONS: Record<AmazonRegionCode, AmazonRegionConfig> = {
  na: {
    code: "na",
    label: "North America",
    sellerCentralAuthorizeUrl: "https://sellercentral.amazon.com/apps/authorize/consent",
    spApiEndpoint: "https://sellingpartnerapi-na.amazon.com",
    awsSigningRegion: "us-east-1"
  },
  eu: {
    code: "eu",
    label: "Europe",
    sellerCentralAuthorizeUrl: "https://sellercentral-europe.amazon.com/apps/authorize/consent",
    spApiEndpoint: "https://sellingpartnerapi-eu.amazon.com",
    awsSigningRegion: "eu-west-1"
  },
  fe: {
    code: "fe",
    label: "Far East",
    sellerCentralAuthorizeUrl: "https://sellercentral.amazon.co.jp/apps/authorize/consent",
    spApiEndpoint: "https://sellingpartnerapi-fe.amazon.com",
    awsSigningRegion: "us-west-2"
  }
};

export function normalizeAmazonRegion(input: string | null | undefined): AmazonRegionCode {
  const value = String(input ?? "na").trim().toLowerCase();
  if (value === "na" || value === "eu" || value === "fe") return value;
  throw new AmazonConnectorError("Unsupported Amazon marketplace region.", "MARKETPLACE_UNAVAILABLE", 400);
}

export function amazonRegionConfig(region: AmazonRegionCode) {
  return AMAZON_REGIONS[region];
}
