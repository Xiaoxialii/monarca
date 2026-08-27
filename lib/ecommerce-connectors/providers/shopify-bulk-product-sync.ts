import crypto from "node:crypto";
import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { readR2ObjectText } from "@/lib/r2-storage";
import {
  SHOPIFY_PROVIDER,
  ShopifyConnectorError,
  decryptConnectorToken,
  shopifyApiVersion
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { shopifyInventoryScopeGranted, shopifyProductMetafieldKeys } from "@/lib/ecommerce-connectors/shopify-product-enrichment";
import { ShopifyGraphQLClient } from "@/lib/ecommerce-connectors/providers/shopify-graphql";
import {
  buildCanonicalDatasetFromArtifact,
  canonicalColumns,
  dedupeCanonicalArtifact,
  normalizeShopifyRecords,
  writeArtifact,
  type CanonicalArtifact,
  type ShopifyProduct
} from "@/lib/ecommerce-connectors/providers/shopify-sync-engine";
import {
  buildCanonicalSnapshotJson,
  ECOMMERCE_CANONICAL_SCHEMA_VERSION,
  storeCanonicalSchemaSnapshot
} from "@/lib/snapshot/canonical-snapshot-generator";

type JsonRecord = Record<string, unknown>;

type BulkOperation = {
  id?: string | null;
  status?: string | null;
  errorCode?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  objectCount?: string | number | null;
  fileSize?: string | number | null;
  url?: string | null;
  partialDataUrl?: string | null;
};

type BulkRunCursor = {
  mode?: "shopify_product_bulk_v1";
  bulkOperationId?: string | null;
  bulkStatus?: string | null;
  bulkUrl?: string | null;
  partialDataUrl?: string | null;
  objectCount?: number | null;
  fileSize?: number | null;
  pollCount?: number;
  includeInventoryFields?: boolean;
  metafieldKeys?: string[];
};

type ShopifyBulkProductSyncRunningResult = {
  ok: true;
  status: "bulk_running";
  syncRunId: string;
  bulkOperationId: string | null;
  bulkStatus: string | null;
  objectCount: number | null;
  completed: false;
};

type ShopifyBulkProductSyncCompletedResult = {
  ok: true;
  status: "success";
  syncRunId: string;
  completed: true;
  rowCount: number;
  schemaSnapshotId: string;
  downstreamJobId: string | null;
};

export type ShopifyBulkProductSyncResult = ShopifyBulkProductSyncRunningResult | ShopifyBulkProductSyncCompletedResult;

const BULK_STATUS_RUNNING = "bulk_running";
const BULK_STATUS_SUCCESS = "success";
const BULK_STATUS_FAILED = "failed";
const BULK_QUERY_VERSION = "shopify_product_bulk_v1";
const DEFAULT_BULK_POLL_LIMIT = 1;

const BULK_OPERATION_RUN_QUERY = `
  mutation ShopifyBulkProductSync($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CURRENT_BULK_OPERATION_QUERY = `
  query ShopifyCurrentProductBulkOperation {
    currentBulkOperation(type: QUERY) {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

export async function enqueueShopifyBulkProductSync(client: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
  trigger?: "initial" | "manual" | "scheduled" | "quick_sync";
}) {
  const identity = shopifyBulkJobIdentity(input);
  const existing = await client.asyncJob.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: "SHOPIFY_BULK_PRODUCT_SYNC",
      identity,
      status: { in: ["QUEUED", "PROCESSING", "PAUSED"] }
    },
    select: { id: true, status: true }
  });

  if (existing) return existing;

  return client.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "SHOPIFY_BULK_PRODUCT_SYNC",
      identity,
      status: "QUEUED",
      progress: 0,
      currentStep: "Queued Shopify full product analysis",
      maxRetries: 8,
      payload: {
        provider: SHOPIFY_PROVIDER,
        dataSourceId: input.dataSourceId,
        connectorAccountId: input.connectorAccountId,
        shopDomain: input.shopDomain,
        trigger: input.trigger ?? "quick_sync"
      } as Prisma.InputJsonValue
    }
  });
}

export async function runShopifyBulkProductSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
  trigger?: string | null;
  syncRunId?: string | null;
  pollLimit?: number;
}): Promise<ShopifyBulkProductSyncResult> {
  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      id: input.connectorAccountId,
      workspaceId: input.workspaceId,
      provider: SHOPIFY_PROVIDER,
      shopDomain: input.shopDomain,
      dataSourceId: input.dataSourceId,
      status: "connected",
      dataSource: {
        id: input.dataSourceId,
        workspaceId: input.workspaceId,
        isActive: true
      }
    },
    include: { dataSource: true }
  });

  if (!account || !account.dataSourceId || !account.dataSource) {
    throw new Error("Connected Shopify account was not found for full product sync.");
  }

  const grantedScopes = account.grantedScopes ?? account.scopes;
  const includeInventoryFields = shopifyInventoryScopeGranted(grantedScopes);
  const metafieldKeys = shopifyProductMetafieldKeys();
  const accessToken = decryptConnectorToken(account.encryptedAccessToken);
  const client = new ShopifyGraphQLClient({
    shopDomain: account.shopDomain,
    accessToken,
    apiVersion: shopifyApiVersion()
  });

  const syncRun = await findOrCreateBulkRun(prisma, {
    workspaceId: input.workspaceId,
    dataSourceId: account.dataSourceId,
    connectorAccountId: account.id,
    shopDomain: account.shopDomain,
    syncRunId: input.syncRunId ?? null,
    includeInventoryFields,
    metafieldKeys
  });
  const cursor = cursorJson(syncRun.cursorJson);

  let operation: BulkOperation | null = null;
  if (!cursor.bulkOperationId) {
    operation = await startBulkOperation(client, buildBulkProductsQuery({ includeInventoryFields, metafieldKeys }));
    await updateBulkRunCursor(prisma, syncRun.id, {
      ...cursor,
      bulkOperationId: operation.id ?? null,
      bulkStatus: operation.status ?? "CREATED",
      includeInventoryFields,
      metafieldKeys
    });
  }

  const pollLimit = Math.max(1, Math.min(input.pollLimit ?? DEFAULT_BULK_POLL_LIMIT, 5));
  for (let index = 0; index < pollLimit; index += 1) {
    operation = await currentBulkOperation(client);
    const currentId = operation?.id ?? null;
    const expectedId = cursor.bulkOperationId ?? operation?.id ?? null;
    if (expectedId && currentId && currentId !== expectedId && operation?.status !== "RUNNING") {
      break;
    }

    const nextCursor = {
      ...cursor,
      bulkOperationId: expectedId,
      bulkStatus: operation?.status ?? cursor.bulkStatus ?? null,
      bulkUrl: operation?.url ?? cursor.bulkUrl ?? null,
      partialDataUrl: operation?.partialDataUrl ?? cursor.partialDataUrl ?? null,
      objectCount: nullableNumber(operation?.objectCount),
      fileSize: nullableNumber(operation?.fileSize),
      pollCount: (cursor.pollCount ?? 0) + index + 1,
      includeInventoryFields,
      metafieldKeys
    };
    await updateBulkRunCursor(prisma, syncRun.id, nextCursor);

    if (operation?.status === "COMPLETED" && operation.url) {
      return finishBulkProductSync(prisma, {
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId,
        connectorAccountId: account.id,
        shopDomain: account.shopDomain,
        syncRunId: syncRun.syncRunId,
        syncRunDbId: syncRun.id,
        resultUrl: operation.url,
        objectCount: nullableNumber(operation.objectCount),
        fileSize: nullableNumber(operation.fileSize),
        includeInventoryFields,
        metafieldKeys,
        dataSourceConfig: account.dataSource.config
      });
    }

    if (operation?.status === "FAILED" || operation?.status === "CANCELED" || operation?.status === "EXPIRED") {
      await prisma.ecommerceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: BULK_STATUS_FAILED,
          errorMessage: `Shopify bulk product sync ${operation.status}${operation.errorCode ? `: ${operation.errorCode}` : ""}`,
          finishedAt: new Date()
        }
      });
      throw new ShopifyConnectorError("Shopify full product sync failed.", "SHOPIFY_BULK_PRODUCT_SYNC_FAILED", 502);
    }
  }

  return {
    ok: true,
    status: BULK_STATUS_RUNNING,
    syncRunId: syncRun.syncRunId,
    bulkOperationId: cursor.bulkOperationId ?? operation?.id ?? null,
    bulkStatus: operation?.status ?? cursor.bulkStatus ?? null,
    objectCount: nullableNumber(operation?.objectCount) ?? cursor.objectCount ?? null,
    completed: false
  } as ShopifyBulkProductSyncRunningResult;
}

function shopifyBulkJobIdentity(input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
}) {
  return `shopify-bulk-products:${input.dataSourceId}:${input.connectorAccountId}:${input.shopDomain}`;
}

async function findOrCreateBulkRun(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
  syncRunId: string | null;
  includeInventoryFields: boolean;
  metafieldKeys: string[];
}) {
  if (input.syncRunId) {
    const existing = await prisma.ecommerceSyncRun.findFirst({
      where: {
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        provider: SHOPIFY_PROVIDER,
        shopDomain: input.shopDomain,
        syncRunId: input.syncRunId
      }
    });
    if (existing) return existing;
  }

  const running = await prisma.ecommerceSyncRun.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: SHOPIFY_PROVIDER,
      shopDomain: input.shopDomain,
      status: BULK_STATUS_RUNNING,
      cursorJson: {
        path: ["mode"],
        equals: BULK_QUERY_VERSION
      }
    },
    orderBy: { startedAt: "desc" }
  });
  if (running) return running;

  const syncRunId = crypto.randomUUID();
  return prisma.ecommerceSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      connectorAccountId: input.connectorAccountId,
      provider: SHOPIFY_PROVIDER,
      shopDomain: input.shopDomain,
      syncRunId,
      idempotencyKey: `bulk-products:${syncRunId}`,
      status: BULK_STATUS_RUNNING,
      syncWindowStart: null,
      syncWindowEnd: new Date(),
      cursorJson: {
        mode: BULK_QUERY_VERSION,
        bulkOperationId: null,
        bulkStatus: "CREATED",
        pollCount: 0,
        includeInventoryFields: input.includeInventoryFields,
        metafieldKeys: input.metafieldKeys
      } as Prisma.InputJsonValue
    }
  });
}

async function startBulkOperation(client: ShopifyGraphQLClient, query: string) {
  const result = await client.fetchGraphQL<{
    bulkOperationRunQuery?: {
      bulkOperation?: BulkOperation | null;
      userErrors?: Array<{ field?: string[] | null; message?: string | null }> | null;
    } | null;
  }>(BULK_OPERATION_RUN_QUERY, { query });
  const payload = result.bulkOperationRunQuery;
  const errors = payload?.userErrors?.filter((error) => error?.message) ?? [];

  if (errors.length) {
    throw new ShopifyConnectorError(
      errors.map((error) => error.message).join("; "),
      "SHOPIFY_BULK_PRODUCT_SYNC_START_FAILED",
      502
    );
  }

  if (!payload?.bulkOperation?.id) {
    throw new ShopifyConnectorError("Shopify did not return a bulk operation id.", "SHOPIFY_BULK_PRODUCT_SYNC_START_FAILED", 502);
  }

  return payload.bulkOperation;
}

async function currentBulkOperation(client: ShopifyGraphQLClient) {
  const result = await client.fetchGraphQL<{ currentBulkOperation?: BulkOperation | null }>(CURRENT_BULK_OPERATION_QUERY);
  return result.currentBulkOperation ?? null;
}

async function finishBulkProductSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
  syncRunId: string;
  syncRunDbId: string;
  resultUrl: string;
  objectCount: number | null;
  fileSize: number | null;
  includeInventoryFields: boolean;
  metafieldKeys: string[];
  dataSourceConfig: unknown;
}) {
  const resultText = await downloadBulkResult(input.resultUrl);
  const products = reconstructBulkProducts(resultText);
  const existingArtifact = await loadLatestCanonicalArtifact(prisma, input.workspaceId, input.dataSourceId);
  const normalized = normalizeShopifyRecords({
    workspaceId: input.workspaceId,
    dataSourceId: input.dataSourceId,
    connectorAccountId: input.connectorAccountId,
    shopDomain: input.shopDomain,
    syncRunId: input.syncRunId,
    orders: [],
    products,
    customers: []
  });
  const merged: CanonicalArtifact = {
    ecommerce_orders: existingArtifact.ecommerce_orders,
    ecommerce_order_items: existingArtifact.ecommerce_order_items,
    ecommerce_products: normalized.ecommerce_products,
    ecommerce_customers: existingArtifact.ecommerce_customers,
    ecommerce_refunds: existingArtifact.ecommerce_refunds
  };
  const deduped = dedupeCanonicalArtifact(merged);
  const baseKey = `workspaces/${input.workspaceId}/connectors/shopify/${input.dataSourceId}/${input.syncRunId}`;
  const rawProducts = await writeArtifact(`${baseKey}/raw/products-bulk.jsonl`, products);
  const normalizedArtifacts: Record<string, Awaited<ReturnType<typeof writeArtifact>>> = {};
  for (const [tableName, rows] of Object.entries(deduped.artifact)) {
    normalizedArtifacts[tableName] = await writeArtifact(`${baseKey}/normalized/${tableName}.jsonl`, rows);
  }

  const finishedAt = new Date().toISOString();
  const latestBusinessDate = latestDate(deduped.artifact.ecommerce_orders.map((row) => row.order_date));
  const checksum = objectMap(normalizedArtifacts, (artifact) => artifact.checksum);
  const manifest = {
    workspace_id: input.workspaceId,
    data_source_id: input.dataSourceId,
    connector_account_id: input.connectorAccountId,
    provider: SHOPIFY_PROVIDER,
    shop_domain: input.shopDomain,
    sync_run_id: input.syncRunId,
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    manifest_key: `${baseKey}/manifest/manifest.json`,
    raw_artifact_keys: { products: rawProducts.artifactKey },
    normalized_artifact_keys: objectMap(normalizedArtifacts, (artifact) => artifact.artifactKey),
    row_counts: { products: rawProducts.rowCount },
    accepted_row_counts: objectMap(normalizedArtifacts, (artifact) => artifact.rowCount),
    duplicate_count: deduped.duplicateCounts,
    checksum,
    latest_business_date: latestBusinessDate,
    bulk: {
      operation_result_url_present: true,
      object_count: input.objectCount,
      file_size: input.fileSize,
      include_inventory_fields: input.includeInventoryFields,
      metafield_keys: input.metafieldKeys
    },
    sync_finished_at: finishedAt
  };
  const manifestArtifact = await writeArtifact(manifest.manifest_key, [manifest], "application/json");
  const canonicalDataset = buildCanonicalDatasetFromArtifact(deduped.artifact, {
    sourceProvider: SHOPIFY_PROVIDER,
    normalizedAt: finishedAt,
    validationWarnings: input.includeInventoryFields ? [] : ["inventory"],
    duplicateCount: Object.values(deduped.duplicateCounts).reduce((sum, count) => sum + count, 0),
    confidence: 0.98
  });
  const snapshotJson = buildCanonicalSnapshotJson({
    manifest: {
      businessType: "ecommerce",
      sourceProvider: SHOPIFY_PROVIDER,
      manifestKey: manifest.manifest_key,
      syncRunId: input.syncRunId,
      checksum,
      latestBusinessDate,
      dataMode: "FULL",
      confidenceScore: 0.98,
      missingFields: input.includeInventoryFields ? [] : ["inventory"],
      estimationUsed: false,
      syncStartedAt: new Date().toISOString(),
      syncFinishedAt: finishedAt,
      analytics: {
        mode: "FULL",
        confidence: 0.98,
        missingFields: input.includeInventoryFields ? [] : ["inventory"],
        estimation_used: false
      },
      semanticLearning: {
        records_updated: 0,
        memory_size: 0,
        average_memory_confidence: 0,
        model_update: {
          strategy: "bulk-product-sync-no-semantic-retraining",
          embedding_similarity_weight: 0,
          runtime_updated: false
        },
        unknown_fields: [],
        anomaly_fields: []
      },
      guardrailReport: {
        workspaceId: input.workspaceId,
        currencyList: [],
        currencyMismatch: false,
        aggregationBlocked: false,
        warnings: input.includeInventoryFields ? [] : ["Inventory fields omitted because Shopify inventory scope is not granted."],
        rejectedRows: []
      }
    },
    artifacts: Object.fromEntries(Object.entries(normalizedArtifacts).map(([name, artifact]) => [
      name,
      {
        ...artifact,
        columns: canonicalColumns(name)
      }
    ])),
    canonicalDataset
  });

  const allArtifacts = [
    { name: "products", type: "raw", artifact: rawProducts },
    ...Object.entries(normalizedArtifacts).map(([name, artifact]) => ({ name, type: "normalized", artifact })),
    { name: "manifest", type: "manifest", artifact: manifestArtifact }
  ];

  const commit = await prisma.$transaction(async (tx) => {
    await tx.ecommerceSyncArtifact.createMany({
      data: allArtifacts.map((item) => ({
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        connectorAccountId: input.connectorAccountId,
        syncRunId: input.syncRunId,
        provider: SHOPIFY_PROVIDER,
        shopDomain: input.shopDomain,
        artifactType: item.type,
        tableName: item.type === "normalized" ? item.name : null,
        artifactKey: item.artifact.artifactKey,
        checksum: item.artifact.checksum,
        rowCount: item.artifact.rowCount
      })),
      skipDuplicates: true
    });

    await tx.ecommerceSyncRun.update({
      where: { id: input.syncRunDbId },
      data: {
        status: BULK_STATUS_SUCCESS,
        rowsPulled: products.length,
        rowsNormalized: Object.values(normalizedArtifacts).reduce((sum, artifact) => sum + artifact.rowCount, 0),
        rowsRejected: 0,
        manifestKey: manifest.manifest_key,
        cursorJson: {
          mode: BULK_QUERY_VERSION,
          bulkStatus: "COMPLETED",
          bulkUrl: input.resultUrl,
          objectCount: input.objectCount,
          fileSize: input.fileSize,
          includeInventoryFields: input.includeInventoryFields,
          metafieldKeys: input.metafieldKeys
        } as Prisma.InputJsonValue,
        finishedAt: new Date()
      }
    });

    const snapshot = await storeCanonicalSchemaSnapshot({
      prisma: tx,
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      status: ConnectionStatus.CONNECTED,
      schemaJson: snapshotJson,
      qualityReport: {
        manifestKey: manifest.manifest_key,
        syncRunId: input.syncRunId,
        dataMode: "FULL",
        confidenceScore: 0.98,
        missingFields: input.includeInventoryFields ? [] : ["inventory"],
        bulkProductSync: manifest.bulk
      } as Prisma.InputJsonValue
    });

    await tx.dataSourceStats.upsert({
      where: {
        dataSourceConnectionId_tableName: {
          dataSourceConnectionId: input.dataSourceId,
          tableName: "ecommerce_products"
        }
      },
      create: {
        dataSourceConnectionId: input.dataSourceId,
        tableName: "ecommerce_products",
        rowCount: normalizedArtifacts.ecommerce_products?.rowCount ?? 0,
        schemaHash: normalizedArtifacts.ecommerce_products?.checksum ?? null
      },
      update: {
        rowCount: normalizedArtifacts.ecommerce_products?.rowCount ?? 0,
        schemaHash: normalizedArtifacts.ecommerce_products?.checksum ?? null,
        calculatedAt: new Date()
      }
    });

    await tx.dataSourceConnection.updateMany({
      where: { id: input.dataSourceId, workspaceId: input.workspaceId, isActive: true },
      data: {
        status: ConnectionStatus.CONNECTED,
        lastErrorMessage: null,
        lastSyncAt: new Date(),
        schemas: snapshotJson as Prisma.InputJsonValue,
        config: {
          ...(typeof input.dataSourceConfig === "object" && input.dataSourceConfig && !Array.isArray(input.dataSourceConfig)
            ? input.dataSourceConfig as JsonRecord
            : {}),
          latestFullProductSyncRunId: input.syncRunId,
          fullProductSyncCompletedAt: finishedAt,
          fullProductRows: normalizedArtifacts.ecommerce_products?.rowCount ?? 0,
          bulkProductObjectCount: input.objectCount,
          schemaSnapshotId: snapshot.id
        } as Prisma.InputJsonValue
      }
    });

    return { schemaSnapshotId: snapshot.id };
  }, { timeout: 60_000 });

  const downstreamMetricJob = await prisma.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "CALCULATE_METRICS",
      status: "QUEUED",
      progress: 0,
      currentStep: "Queued after Shopify full product sync",
      payload: {
        dataSourceId: input.dataSourceId,
        schemaSnapshotId: commit.schemaSnapshotId,
        syncRunId: input.syncRunId,
        reason: "shopify_full_product_sync"
      } as Prisma.InputJsonValue
    }
  }).catch(() => null);

  return {
    ok: true,
    status: BULK_STATUS_SUCCESS,
    syncRunId: input.syncRunId,
    completed: true,
    rowCount: normalizedArtifacts.ecommerce_products?.rowCount ?? 0,
    schemaSnapshotId: commit.schemaSnapshotId,
    downstreamJobId: downstreamMetricJob?.id ?? null
  } as ShopifyBulkProductSyncCompletedResult;
}

function buildBulkProductsQuery(input: {
  includeInventoryFields: boolean;
  metafieldKeys: string[];
}) {
  return `
{
  products {
    edges {
      node {
        id
        title
        handle
        description
        descriptionHtml
        tags
        vendor
        productType
        category { id name fullName }
        status
        createdAt
        updatedAt
        onlineStoreUrl
        seo { title description }
        featuredMedia {
          id
          mediaContentType
          alt
          preview { image { url altText width height } }
          ... on MediaImage { image { url altText width height } }
          ... on Video { sources { url mimeType format height width } }
          ... on ExternalVideo { originUrl embedUrl }
        }
        media {
          edges {
            node {
              id
              mediaContentType
              alt
              preview { image { url altText width height } }
              ... on MediaImage { image { url altText width height } }
              ... on Video { sources { url mimeType format height width } }
              ... on ExternalVideo { originUrl embedUrl }
            }
          }
        }
        collections {
          edges {
            node { id title handle updatedAt }
          }
        }
        options {
          id
          name
          position
          values
        }
        metafields(keys: ${graphqlStringList(input.metafieldKeys)}) {
          edges {
            node { id namespace key type value updatedAt }
          }
        }
        variants {
          edges {
            node {
              id
              sku
              title
              price
              compareAtPrice
              barcode
              selectedOptions { name value }
              ${input.includeInventoryFields ? `
              inventoryQuantity
              inventoryItem {
                id
                sku
                tracked
                requiresShipping
                unitCost { amount currencyCode }
                measurement { weight { value unit } }
              }
              ` : ""}
              media {
                edges {
                  node {
                    id
                    mediaContentType
                    alt
                    preview { image { url altText width height } }
                    ... on MediaImage { image { url altText width height } }
                    ... on Video { sources { url mimeType format height width } }
                    ... on ExternalVideo { originUrl embedUrl }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;
}

function reconstructBulkProducts(jsonl: string): ShopifyProduct[] {
  const products = new Map<string, ShopifyProduct>();
  const pendingByParent = new Map<string, JsonRecord[]>();

  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const node = JSON.parse(line) as JsonRecord;
    const id = typeof node.id === "string" ? node.id : null;
    const parentId = typeof node.__parentId === "string" ? node.__parentId : null;
    delete node.__parentId;
    if (!id) continue;

    if (id.includes("/Product/") && !parentId) {
      const product = node as ShopifyProduct;
      product.media = asConnection([]);
      product.collections = asConnection([]);
      product.metafields = asConnection([]);
      product.variants = asConnection([]);
      products.set(id, product);
      for (const child of pendingByParent.get(id) ?? []) {
        attachBulkChild(product, child);
      }
      pendingByParent.delete(id);
      continue;
    }

    if (!parentId) continue;
    const parentProduct = products.get(parentId);
    if (parentProduct) {
      attachBulkChild(parentProduct, node);
      continue;
    }

    const variantParent = findProductByVariantId(products, parentId);
    if (variantParent) {
      attachVariantChild(variantParent, parentId, node);
      continue;
    }

    pendingByParent.set(parentId, [...(pendingByParent.get(parentId) ?? []), node]);
  }

  for (const [parentId, children] of pendingByParent) {
    const product = findProductByVariantId(products, parentId);
    if (!product) continue;
    for (const child of children) attachVariantChild(product, parentId, child);
  }

  return Array.from(products.values());
}

function attachBulkChild(product: ShopifyProduct, child: JsonRecord) {
  const id = typeof child.id === "string" ? child.id : "";
  if (id.includes("/ProductVariant/")) {
    product.variants = appendNode(product.variants, {
      ...child,
      media: asConnection([])
    });
    return;
  }
  if (id.includes("/Collection/")) {
    product.collections = appendNode(product.collections, child);
    return;
  }
  if (id.includes("/Metafield/")) {
    product.metafields = appendNode(product.metafields, child);
    return;
  }
  if (id.includes("/MediaImage/") || id.includes("/Video/") || id.includes("/ExternalVideo/") || id.includes("/Model3d/")) {
    product.media = appendNode(product.media, child);
  }
}

function attachVariantChild(product: ShopifyProduct, variantId: string, child: JsonRecord) {
  const variant = product.variants?.edges?.find((edge) => edge?.node?.id === variantId)?.node;
  if (!variant) return;
  variant.media = appendNode(variant.media, child);
}

function findProductByVariantId(products: Map<string, ShopifyProduct>, variantId: string) {
  for (const product of products.values()) {
    if (product.variants?.edges?.some((edge) => edge?.node?.id === variantId)) return product;
  }
  return null;
}

function asConnection<T extends JsonRecord>(nodes: T[]) {
  return { edges: nodes.map((node) => ({ node })) };
}

function appendNode<T extends JsonRecord>(connection: { edges?: Array<{ node?: T | null } | null> } | null | undefined, node: T) {
  return {
    edges: [
      ...(connection?.edges ?? []),
      { node }
    ]
  };
}

async function loadLatestCanonicalArtifact(prisma: PrismaClient, workspaceId: string, dataSourceId: string): Promise<CanonicalArtifact> {
  const snapshot = await prisma.schemaSnapshot.findFirst({
    where: {
      workspaceId,
      dataSourceId,
      canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION
    },
    orderBy: { createdAt: "desc" },
    select: { schemaJson: true }
  });
  const empty: CanonicalArtifact = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: []
  };
  const schema = typeof snapshot?.schemaJson === "object" && snapshot.schemaJson && !Array.isArray(snapshot.schemaJson)
    ? snapshot.schemaJson as JsonRecord
    : {};
  const tableArtifacts = Array.isArray(schema.tables) ? schema.tables : [];

  for (const tableName of Object.keys(empty) as Array<keyof CanonicalArtifact>) {
    const table = tableArtifacts.find((item) => {
      const record = typeof item === "object" && item && !Array.isArray(item) ? item as JsonRecord : {};
      return record.name === tableName;
    });
    const artifactKey = typeof (table as JsonRecord | undefined)?.artifactKey === "string"
      ? (table as JsonRecord).artifactKey as string
      : null;
    if (artifactKey) {
      empty[tableName] = parseJsonl(await readR2ObjectText(artifactKey).catch(() => ""));
    }
  }

  return empty;
}

async function downloadBulkResult(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ShopifyConnectorError("Could not download Shopify full product result.", "SHOPIFY_BULK_PRODUCT_RESULT_DOWNLOAD_FAILED", 502);
  }
  return response.text();
}

function parseJsonl(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function cursorJson(value: unknown): BulkRunCursor {
  return typeof value === "object" && value && !Array.isArray(value) ? value as BulkRunCursor : {};
}

async function updateBulkRunCursor(prisma: PrismaClient, id: string, cursor: BulkRunCursor) {
  await prisma.ecommerceSyncRun.update({
    where: { id },
    data: {
      status: BULK_STATUS_RUNNING,
      cursorJson: {
        mode: BULK_QUERY_VERSION,
        ...cursor
      } as Prisma.InputJsonValue
    }
  });
}

function graphqlStringList(values: string[]) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function objectMap<T, R>(input: Record<string, T>, mapper: (value: T, key: string) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, mapper(value, key)]));
}

function latestDate(values: unknown[]) {
  const dates = values
    .map((value) => typeof value === "string" ? new Date(value) : null)
    .filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0]?.toISOString().slice(0, 10) ?? null;
}
