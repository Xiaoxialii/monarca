import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const SHOPIFY_PROVIDER = "shopify";
const SKU_PREFIX = "MONARCA-SKU-";
const DEFAULT_TARGET = 2000;
const DEFAULT_WAIT_MS = 30 * 60 * 1000;
const DEFAULT_CONCURRENCY = 5;

const args = new Set(process.argv.slice(2));
const target = numberArg("--target", DEFAULT_TARGET);
const concurrency = numberArg("--concurrency", DEFAULT_CONCURRENCY);
const waitForAuth = args.has("--wait-auth");
const waitMs = numberArg("--wait-ms", DEFAULT_WAIT_MS);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
if (!process.env.CONNECTOR_TOKEN_ENCRYPTION_KEY) throw new Error("CONNECTOR_TOKEN_ENCRYPTION_KEY is not configured.");
if (!process.env.SHOPIFY_API_VERSION) throw new Error("SHOPIFY_API_VERSION is not configured.");

let prisma = createPrismaClient();

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: ["error"]
  });
}

async function main() {
  try {
    const account = await waitForWritableAccount();
    const token = decryptConnectorToken(account.encryptedAccessToken);
    const client = new ShopifyClient(account.shopDomain, token, process.env.SHOPIFY_API_VERSION);
    const existingSkus = await fetchExistingMonarcaSkus(client);
    const missing = expectedSkus(target).filter((sku) => !existingSkus.has(sku));

    console.log(JSON.stringify({
      shopDomain: account.shopDomain,
      target,
      concurrency,
      existingMonarcaSkus: existingSkus.size,
      toCreate: missing.length
    }, null, 2));

    const created = await createMissingSkus(client, missing, concurrency);

    const finalSkus = await fetchExistingMonarcaSkus(client);
    console.log(JSON.stringify({
      ok: true,
      target,
      created,
      finalMonarcaSkus: finalSkus.size
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function numberArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 1));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

async function waitForWritableAccount() {
  const startedAt = Date.now();

  while (true) {
    const account = await findConnectedAccount();

    if (!account) throw new Error("No connected Shopify account found.");

    const token = decryptConnectorToken(account.encryptedAccessToken);
    const scopes = await fetchAccessScopes(account.shopDomain, token);
    if (scopes.includes("write_products")) return account;

    if (!waitForAuth || Date.now() - startedAt > waitMs) {
      throw new Error(`Connected Shopify token is missing write_products. Current scopes: ${scopes.join(",")}`);
    }

    console.log(`waiting for write_products authorization; current scopes: ${scopes.join(",")}`);
    await sleep(15_000);
  }
}

async function findConnectedAccount() {
  try {
    return await prisma.ecommerceConnectorAccount.findFirst({
      where: { provider: SHOPIFY_PROVIDER, status: "connected" },
      orderBy: { updatedAt: "desc" }
    });
  } catch (error) {
    if (!isConnectionReset(error)) throw error;
    await prisma.$disconnect().catch(() => {});
    prisma = createPrismaClient();
    return await prisma.ecommerceConnectorAccount.findFirst({
      where: { provider: SHOPIFY_PROVIDER, status: "connected" },
      orderBy: { updatedAt: "desc" }
    });
  }
}

function isConnectionReset(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection reset|terminating connection|closed the connection/i.test(message);
}

async function fetchAccessScopes(shopDomain, token) {
  const client = new ShopifyClient(shopDomain, token, process.env.SHOPIFY_API_VERSION);
  const data = await client.graphQL(`
    query CurrentScopes {
      app {
        installation {
          accessScopes {
            handle
          }
        }
      }
    }
  `);

  return data.app.installation.accessScopes.map((scope) => scope.handle).sort();
}

async function fetchExistingMonarcaSkus(client) {
  const skus = new Set();
  let after = null;

  do {
    const data = await client.graphQL(`
      query ProductVariants($first: Int!, $after: String) {
        productVariants(first: $first, after: $after) {
          nodes {
            sku
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { first: 250, after });

    for (const node of data.productVariants.nodes) {
      if (typeof node.sku === "string" && node.sku.startsWith(SKU_PREFIX)) skus.add(node.sku);
    }

    after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (after);

  return skus;
}

function expectedSkus(count) {
  return Array.from({ length: count }, (_, index) => `${SKU_PREFIX}${String(index + 1).padStart(4, "0")}`);
}

async function createSkuProduct(client, sku) {
  const number = Number(sku.slice(SKU_PREFIX.length));
  const title = `Monarca Sample SKU ${String(number).padStart(4, "0")}`;
  const productType = productTypeFor(number);
  const price = priceFor(number);

  const data = await client.graphQL(`
    mutation CreateSkuProduct($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product {
          id
          title
          variants(first: 1) {
            nodes {
              id
              sku
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `, {
    input: {
      title,
      handle: sku.toLowerCase(),
      vendor: "Monarca Sample",
      productType,
      status: "ACTIVE",
      tags: ["MONARCA_SAMPLE_SKU", "MONARCA_TEST_DATA"],
      productOptions: [
        { name: "Title", values: [{ name: "Default Title" }] }
      ],
      variants: [
        {
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price,
          sku,
          inventoryItem: {
            tracked: true,
            requiresShipping: true
          }
        }
      ]
    }
  });

  const errors = data.productSet.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Failed to create ${sku}: ${JSON.stringify(errors)}`);
  }
}

async function createMissingSkus(client, missing, concurrency) {
  let nextIndex = 0;
  let created = 0;

  async function worker() {
    while (nextIndex < missing.length) {
      const sku = missing[nextIndex];
      nextIndex += 1;

      await createSkuProduct(client, sku);
      created += 1;
      if (created % 25 === 0 || created === missing.length) {
        console.log(`created ${created}/${missing.length}`);
      }
    }
  }

  const workerCount = Math.min(concurrency, missing.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return created;
}

function productTypeFor(number) {
  const types = [
    "Beauty & Personal Care",
    "Home & Kitchen",
    "Fitness",
    "Electronics Accessories",
    "Food & Beverage",
    "Pet Supplies",
    "Outdoor",
    "Apparel"
  ];
  return types[(number - 1) % types.length];
}

function priceFor(number) {
  const cents = 900 + ((number * 137) % 8_000);
  return (cents / 100).toFixed(2);
}

function decryptConnectorToken(encryptedToken) {
  const [version, ivValue, tagValue, encryptedValue] = encryptedToken.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted connector token.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.CONNECTOR_TOKEN_ENCRYPTION_KEY, "base64"),
    Buffer.from(ivValue, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

class ShopifyClient {
  constructor(shopDomain, accessToken, apiVersion) {
    this.endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
    this.accessToken = accessToken;
  }

  async graphQL(query, variables = {}) {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken
        },
        body: JSON.stringify({ query, variables })
      }).catch((error) => {
        if (attempt < 6) return { networkError: error };
        throw error;
      });

      if ("networkError" in response) {
        await sleep(1_000 * attempt);
        continue;
      }

      const payload = await response.json().catch(() => null);

      if ((response.status === 429 || response.status === 503) && attempt < 6) {
        await sleep(retryAfterMs(response) ?? 1_000 * attempt);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Shopify GraphQL HTTP ${response.status}: ${JSON.stringify(payload)}`);
      }

      const throttled = payload?.errors?.some((error) => error.extensions?.code === "THROTTLED");
      if (throttled && attempt < 6) {
        await sleep(1_000 * attempt);
        continue;
      }

      if (payload?.errors?.length) {
        throw new Error(`Shopify GraphQL errors: ${JSON.stringify(payload.errors)}`);
      }

      const throttle = payload?.extensions?.cost?.throttleStatus;
      if (throttle?.currentlyAvailable != null && throttle.currentlyAvailable < 100) {
        const restoreRate = throttle.restoreRate || 100;
        await sleep(Math.ceil((100 - throttle.currentlyAvailable) / restoreRate) * 1_000);
      }

      return payload.data;
    }

    throw new Error("Shopify GraphQL request failed after retries.");
  }
}

function retryAfterMs(response) {
  const raw = response.headers.get("retry-after");
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
