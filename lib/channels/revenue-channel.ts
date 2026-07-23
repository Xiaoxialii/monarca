const NON_REVENUE_CHANNELS = new Set([
  "canonical",
  "csv",
  "excel",
  "file",
  "fulfillment",
  "inventory",
  "stock",
  "upload",
  "warehouse"
]);

export function normalizeRevenueChannel(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function isRevenueChannel(value: unknown) {
  const channel = normalizeRevenueChannel(value);
  return Boolean(channel) && !NON_REVENUE_CHANNELS.has(channel);
}

export function revenueChannelOrNull(value: unknown) {
  const channel = normalizeRevenueChannel(value);
  return isRevenueChannel(channel) ? channel : null;
}
