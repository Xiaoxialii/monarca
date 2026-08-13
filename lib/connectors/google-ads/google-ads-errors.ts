export const GOOGLE_ADS_PROVIDER = "google_ads";

export class GoogleAdsConnectorError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400, public readonly authRevoked = false) {
    super(message);
  }
}

export function isGoogleAdsAuthRevokedError(error: unknown) {
  return error instanceof GoogleAdsConnectorError && error.authRevoked;
}

export function publicGoogleAdsError(error: unknown) {
  if (error instanceof GoogleAdsConnectorError) {
    return { message: error.message, code: error.code, status: error.status };
  }

  return { message: "Google Ads connector request failed.", code: "GOOGLE_ADS_CONNECTOR_ERROR", status: 500 };
}
