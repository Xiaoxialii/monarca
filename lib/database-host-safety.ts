import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();

  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function shouldAllowPrivateDatabaseHosts() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_PRIVATE_DATABASE_HOSTS === "true";
}

export async function assertSafeDatabaseHost(host: string) {
  const normalizedHost = host.trim().toLowerCase();

  if (!normalizedHost) {
    throw new Error("Database host is required.");
  }

  if (shouldAllowPrivateDatabaseHosts()) {
    return;
  }

  if (["localhost", "local", "metadata.google.internal"].includes(normalizedHost)) {
    throw new Error("Database host is not allowed in production.");
  }

  const literalFamily = net.isIP(normalizedHost);
  const addresses = literalFamily
    ? [{ address: normalizedHost, family: literalFamily }]
    : await dns.lookup(normalizedHost, { all: true, verbatim: false });

  for (const item of addresses) {
    if (
      (item.family === 4 && isPrivateIpv4(item.address)) ||
      (item.family === 6 && isPrivateIpv6(item.address))
    ) {
      throw new Error("Database host resolves to a private or local network address.");
    }
  }
}
