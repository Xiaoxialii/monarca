export const AMAZON_PROVIDER = "amazon";

export class AmazonConnectorError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400, public readonly permanent = false) {
    super(message);
  }
}

export function isAmazonAuthRevokedError(error: unknown) {
  if (error instanceof AmazonConnectorError) {
    return error.code === "AUTHORIZATION_EXPIRED" ||
      error.code === "INVALID_CREDENTIALS" ||
      error.code === "TOKEN_REFRESH_FAILED" ||
      error.status === 401 ||
      error.permanent;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("invalid_grant") ||
    message.includes("invalid refresh token") ||
    message.includes("unauthorized") ||
    message.includes("access token is missing");
}

export function publicAmazonError(error: unknown) {
  if (error instanceof AmazonConnectorError) {
    return { message: error.message, code: error.code, status: error.status };
  }

  return { message: "Amazon connector request failed.", code: "AMAZON_CONNECTOR_ERROR", status: 500 };
}
