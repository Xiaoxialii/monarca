import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";
import {
  detectShopifyDataMode,
  runShopifyAnalytics,
  type ShopifyAnalyticsOutput,
  type ShopifyDataMode
} from "@/lib/analytics/shopify-dual-mode-engine";
import { writeR2ObjectText } from "@/lib/r2-storage";
import {
  SHOPIFY_PROVIDER,
  ShopifyConnectorError,
  currentRequiredShopifyScopes,
  decryptConnectorToken,
  isShopifyProtectedDataAccessError,
  missingConfiguredShopifyScopes,
  shopifyScopeStatus,
  shopifyApiVersion
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { ShopifyGraphQLClient } from "@/lib/ecommerce-connectors/providers/shopify-graphql";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import { SelfLearningSemanticRuntime } from "@/lib/semantic/runtime";
import {
  runShopifyGuardrails,
  type ShopifyGuardrailOrder,
  type ShopifyGuardrailReport
} from "@/lib/sync/guards/shopifySyncGuardrail";
import {
  buildCanonicalSnapshotJson,
  storeCanonicalSchemaSnapshot
} from "@/lib/snapshot/canonical-snapshot-generator";
import { buildCanonicalSku } from "@/lib/sku/sku-intelligence-engine";
import type { CanonicalDataset } from "@/lib/semantic/types";

const SCHEMA_VERSION = "ecommerce_canonical_v1";
const SAFETY_OVERLAP_MS = 5 * 60 * 1000;
const FIRST_SYNC_DAYS = 90;
const MAX_RESOURCE_NODES = 250;

type JsonRecord = Record<string, unknown>;

type ShopifyProduct = {
  id?: string | null;
  title?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  variants?: {
    edges?: Array<{
      node?: {
        id?: string | null;
        sku?: string | null;
        title?: string | null;
        price?: string | number | null;
      } | null;
    } | null>;
  } | null;
};

type ShopifyCustomer = {
  id?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  numberOfOrders?: number | string | null;
  amountSpent?: {
    amount?: string | number | null;
    currencyCode?: string | null;
  } | null;
  defaultAddress?: {
    country?: string | null;
    province?: string | null;
    city?: string | null;
  } | null;
};

type CanonicalArtifact = {
  ecommerce_orders: JsonRecord[];
  ecommerce_order_items: JsonRecord[];
  ecommerce_products: JsonRecord[];
  ecommerce_customers: JsonRecord[];
  ecommerce_refunds: JsonRecord[];
};

type ArtifactWriteResult = {
  artifactKey: string;
  checksum: string;
  rowCount: number;
};

type ShopifySyncManifest = {
  workspace_id: string;
  data_source_id: string;
  connector_account_id: string;
  provider: string;
  shop_domain: string;
  sync_run_id: string;
  schema_version: string;
  manifest_key: string;
  raw_artifact_keys: Record<string, string>;
  normalized_artifact_keys: Record<string, string>;
  row_counts: Record<string, number>;
  accepted_row_counts: Record<string, number>;
  rejected_row_counts: Record<string, number>;
  duplicate_count: Record<string, number>;
  checksum: Record<string, string>;
  latest_business_date: string | null;
  detected_currency_list: string[];
  multi_currency_detected: boolean;
  aggregation_blocked: boolean;
  data_mode: ShopifyDataMode;
  confidence_score: number;
  missing_fields: string[];
  estimation_used: boolean;
  analytics: ShopifyAnalyticsOutput;
  semantic_learning: {
    records_updated: number;
    memory_size: number;
    average_memory_confidence: number;
    model_update: {
      strategy: string;
      embedding_similarity_weight: number;
      runtime_updated: boolean;
    };
    unknown_fields: string[];
    anomaly_fields: string[];
  };
  sync_started_at: string;
  sync_finished_at: string;
  sync_window_start: string;
  sync_window_end: string;
  guardrailReport: ShopifyGuardrailReport;
};

const ORDERS_QUERY = `
  query ShopifySyncOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          processedAt
          cancelledAt
          test
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          customer { id }
          shippingAddress { country province city }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 50) {
            edges {
              node {
                id
                name
                sku
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                discountedTotalSet { shopMoney { amount currencyCode } }
                product { id }
                variant { id sku }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
          refunds(first: 50) {
            id
            createdAt
            note
            totalRefundedSet { shopMoney { amount currencyCode } }
            refundLineItems(first: 50) {
              edges {
                node {
                  lineItem { id sku product { id } variant { id sku } }
                  subtotalSet { shopMoney { amount currencyCode } }
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCTS_QUERY = `
  query ShopifySyncProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT) {
      edges {
        node {
          id
          title
          vendor
          productType
          status
          createdAt
          updatedAt
          variants(first: 50) {
            edges {
              node { id sku title price }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query ShopifySyncCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        node {
          id
          createdAt
          updatedAt
          numberOfOrders
          amountSpent { amount currencyCode }
          defaultAddress { country province city }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function runShopifyProductionSync(prisma: PrismaClient, input: {
  workspaceId: string;
  dataSourceId?: string | null;
  force?: boolean;
  trigger?: "initial" | "manual" | "scheduled";
}) {
  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: SHOPIFY_PROVIDER,
      status: "connected",
      ...(input.dataSourceId ? { dataSourceId: input.dataSourceId } : {})
    },
    include: { dataSource: true },
    orderBy: { updatedAt: "desc" }
  });

  if (!account || !account.dataSourceId || !account.dataSource) {
    throw new Error("No connected Shopify account with data source was found for this workspace.");
  }

  if (account.dataSource.workspaceId !== input.workspaceId || account.dataSource.provider !== SHOPIFY_PROVIDER) {
    throw new Error("Shopify connector account does not belong to the current workspace data source.");
  }

  const requiredScopes = account.requiredScopes ?? currentRequiredShopifyScopes();
  const grantedScopes = account.grantedScopes ?? account.scopes;
  const missingScopes = missingConfiguredShopifyScopes(requiredScopes, grantedScopes);
  const scopeStatus = shopifyScopeStatus(requiredScopes, grantedScopes);

  if (missingScopes.length > 0) {
    await prisma.$transaction([
      prisma.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: {
          grantedScopes,
          requiredScopes,
          scopeStatus
        }
      }),
      prisma.dataSourceConnection.updateMany({
        where: {
          id: account.dataSourceId,
          isActive: true
        },
        data: {
          status: ConnectionStatus.PENDING,
          lastErrorMessage: `Shopify permissions need update. Missing scopes: ${missingScopes.join(", ")}.`,
          config: {
            ...(account.dataSource.config && typeof account.dataSource.config === "object" && !Array.isArray(account.dataSource.config) ? account.dataSource.config : {}),
            grantedScopes,
            requiredScopes,
            scopeStatus,
            missingScopes
          }
        }
      })
    ]);

    throw new ShopifyConnectorError(
      `Shopify permissions need update. Missing scopes: ${missingScopes.join(", ")}.`,
      "SHOPIFY_NEEDS_REAUTHORIZATION",
      409
    );
  }

  const dataSource = account.dataSource;

  const now = new Date();
  const syncWindowStart = new Date((account.lastSyncedAt?.getTime() ?? now.getTime() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000) - SAFETY_OVERLAP_MS);
  const syncWindowEnd = now;
  const idempotencyKey = sha256([
    input.workspaceId,
    account.dataSourceId,
    SHOPIFY_PROVIDER,
    account.shopDomain,
    syncWindowStart.toISOString(),
    syncWindowEnd.toISOString().slice(0, 16)
  ].join("|"));
  const existingRun = await prisma.ecommerceSyncRun.findUnique({
    where: {
      workspaceId_dataSourceId_provider_shopDomain_idempotencyKey: {
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId,
        provider: SHOPIFY_PROVIDER,
        shopDomain: account.shopDomain,
        idempotencyKey
      }
    }
  });

  if (!input.force && existingRun && (existingRun.status === "running" || existingRun.status === "success")) {
    return {
      ok: true,
      reused: true,
      syncRunId: existingRun.syncRunId,
      status: existingRun.status,
      manifestKey: existingRun.manifestKey
    };
  }

  const syncRunId = crypto.randomUUID();
  const syncRun = await prisma.ecommerceSyncRun.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      provider: SHOPIFY_PROVIDER,
      shopDomain: account.shopDomain,
      syncRunId,
      idempotencyKey,
      status: "running",
      syncWindowStart,
      syncWindowEnd
    }
  });

  try {
    const accessToken = decryptConnectorToken(account.encryptedAccessToken);
    const client = new ShopifyGraphQLClient({
      shopDomain: account.shopDomain,
      accessToken,
      apiVersion: shopifyApiVersion()
    });
    const dataMode = await detectShopifyDataMode(client);
    const customerWarnings: string[] = [];
    const missingFields: string[] = [];
    const orderQuery = `updated_at:>=${syncWindowStart.toISOString()}`;
    const productsPage = await client.fetchConnectionWithPageInfo<ShopifyProduct>(PRODUCTS_QUERY, "products", {}, MAX_RESOURCE_NODES);
    const ordersPage = dataMode === "FULL"
      ? await client.fetchConnectionWithPageInfo<ShopifyGuardrailOrder>(ORDERS_QUERY, "orders", { query: orderQuery }, MAX_RESOURCE_NODES)
      : {
          nodes: [] as ShopifyGuardrailOrder[],
          pageCount: 0,
          completed: true,
          lastCursor: null
        };
    if (dataMode === "FALLBACK") {
      missingFields.push("orders", "lineItems", "refunds");
    }
    const customersPage = dataMode === "FULL"
      ? await client
          .fetchConnectionWithPageInfo<ShopifyCustomer>(CUSTOMERS_QUERY, "customers", {}, MAX_RESOURCE_NODES)
          .catch((error) => {
            if (isShopifyProtectedDataAccessError(error)) {
              customerWarnings.push("This Shopify store does not allow Customer API access due to plan restrictions. Customer metrics are omitted.");
              missingFields.push("customers");

              return {
                nodes: [] as ShopifyCustomer[],
                pageCount: 0,
                completed: true,
                lastCursor: null
              };
            }

            throw error;
          })
      : {
          nodes: [] as ShopifyCustomer[],
          pageCount: 0,
          completed: true,
          lastCursor: null
        };
    if (dataMode === "FALLBACK") {
      customerWarnings.push("Data Quality: Partial. Shopify API limitations prevent order, line item, refund, and customer metrics.");
      missingFields.push("customers");
    }
    const guardrails = runShopifyGuardrails({
      workspaceId: input.workspaceId,
      orders: ordersPage.nodes,
      pagination: {
        ordersCompleted: ordersPage.completed,
        productsCompleted: productsPage.completed,
        customersCompleted: customersPage.completed,
        ordersPageCount: ordersPage.pageCount,
        productsPageCount: productsPage.pageCount,
        customersPageCount: customersPage.pageCount
      },
      rateLimitRetries: client.stats.rateLimitRetries
    });
    guardrails.guardrailReport.warnings.push(...customerWarnings);
    const canonical = normalizeShopifyRecords({
      workspaceId: input.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      shopDomain: account.shopDomain,
      syncRunId,
      orders: guardrails.ordersForNormalization,
      products: productsPage.nodes,
      customers: customersPage.nodes
    });
    const analytics = runShopifyAnalytics({
      mode: dataMode,
      orders: ordersPage.nodes,
      products: productsPage.nodes,
      customers: customersPage.nodes,
      missingFields
    });
    const semanticLearning = await runSemanticLearning({
      prisma,
      workspaceId: input.workspaceId,
      rawData: [
        ...ordersPage.nodes,
        ...productsPage.nodes,
        ...customersPage.nodes
      ]
    }).catch((error) => {
      guardrails.guardrailReport.warnings.push(`Semantic learning update skipped: ${error instanceof Error ? error.message : "unknown error"}`);

      return {
        records_updated: 0,
        memory_size: 0,
        average_memory_confidence: 0,
        model_update: {
          strategy: "zero-retraining-weight-adjustment",
          embedding_similarity_weight: 0,
          runtime_updated: false
        },
        unknown_fields: [],
        anomaly_fields: []
      };
    });
    const deduped = dedupeCanonicalArtifact(canonical);
    const baseKey = `workspaces/${input.workspaceId}/connectors/shopify/${account.dataSourceId}/${syncRunId}`;
    const rawArtifacts = {
      orders: await writeArtifact(`${baseKey}/raw/orders.jsonl`, ordersPage.nodes),
      products: await writeArtifact(`${baseKey}/raw/products.jsonl`, productsPage.nodes),
      customers: await writeArtifact(`${baseKey}/raw/customers.jsonl`, customersPage.nodes)
    };
    const normalizedArtifacts: Record<string, ArtifactWriteResult> = {};
    for (const [tableName, rows] of Object.entries(deduped.artifact)) {
      normalizedArtifacts[tableName] = await writeArtifact(`${baseKey}/normalized/${tableName}.jsonl`, rows);
    }
    const latestBusinessDate = latestDate(deduped.artifact.ecommerce_orders.map((row) => row.order_date));
    const manifest: ShopifySyncManifest = {
      workspace_id: input.workspaceId,
      data_source_id: account.dataSourceId,
      connector_account_id: account.id,
      provider: SHOPIFY_PROVIDER,
      shop_domain: account.shopDomain,
      sync_run_id: syncRunId,
      schema_version: SCHEMA_VERSION,
      manifest_key: `${baseKey}/manifest/manifest.json`,
      raw_artifact_keys: objectMap(rawArtifacts, (artifact) => artifact.artifactKey),
      normalized_artifact_keys: objectMap(normalizedArtifacts, (artifact) => artifact.artifactKey),
      row_counts: objectMap(rawArtifacts, (artifact) => artifact.rowCount),
      accepted_row_counts: objectMap(normalizedArtifacts, (artifact) => artifact.rowCount),
      rejected_row_counts: {},
      duplicate_count: deduped.duplicateCounts,
      checksum: objectMap(normalizedArtifacts, (artifact) => artifact.checksum),
      latest_business_date: latestBusinessDate,
      detected_currency_list: guardrails.guardrailReport.currencyList,
      multi_currency_detected: guardrails.guardrailReport.currencyMismatch,
      aggregation_blocked: guardrails.guardrailReport.aggregationBlocked,
      data_mode: analytics.mode,
      confidence_score: analytics.confidence,
      missing_fields: analytics.missingFields,
      estimation_used: analytics.estimation_used,
      analytics,
      semantic_learning: semanticLearning,
      sync_started_at: syncRun.startedAt.toISOString(),
      sync_finished_at: new Date().toISOString(),
      sync_window_start: syncWindowStart.toISOString(),
      sync_window_end: syncWindowEnd.toISOString(),
      guardrailReport: guardrails.guardrailReport
    };
    const manifestArtifact = await writeArtifact(manifest.manifest_key, [manifest], "application/json");
    const allArtifacts = [
      ...Object.entries(rawArtifacts).map(([name, artifact]) => ({ name, type: "raw", artifact })),
      ...Object.entries(normalizedArtifacts).map(([name, artifact]) => ({ name, type: "normalized", artifact })),
      { name: "manifest", type: "manifest", artifact: manifestArtifact }
    ];
    const canonicalDataset = buildCanonicalDatasetFromArtifact(deduped.artifact, {
      sourceProvider: SHOPIFY_PROVIDER,
      normalizedAt: manifest.sync_finished_at,
      validationWarnings: manifest.missing_fields,
      duplicateCount: Object.values(deduped.duplicateCounts).reduce((sum, count) => sum + count, 0),
      confidence: manifest.confidence_score
    });
    const snapshotJson = buildCanonicalSnapshotJson({
      manifest: {
        businessType: "ecommerce",
        sourceProvider: SHOPIFY_PROVIDER,
        manifestKey: manifest.manifest_key,
        syncRunId: manifest.sync_run_id,
        checksum: manifest.checksum,
        latestBusinessDate: manifest.latest_business_date,
        dataMode: manifest.data_mode,
        confidenceScore: manifest.confidence_score,
        missingFields: manifest.missing_fields,
        estimationUsed: manifest.estimation_used,
        syncStartedAt: manifest.sync_started_at,
        syncFinishedAt: manifest.sync_finished_at,
        analytics: manifest.analytics,
        semanticLearning: manifest.semantic_learning,
        guardrailReport: manifest.guardrailReport
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

    const syncCommit = await prisma.$transaction(async (tx) => {
      await tx.ecommerceSyncArtifact.createMany({
        data: allArtifacts.map((item) => ({
          workspaceId: input.workspaceId,
          dataSourceId: account.dataSourceId!,
          connectorAccountId: account.id,
          syncRunId,
          provider: SHOPIFY_PROVIDER,
          shopDomain: account.shopDomain,
          artifactType: item.type,
          tableName: item.type === "normalized" ? item.name : null,
          artifactKey: item.artifact.artifactKey,
          checksum: item.artifact.checksum,
          rowCount: item.artifact.rowCount
        })),
        skipDuplicates: true
      });
      await tx.ecommerceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "success",
          cursorJson: {
            orders: ordersPage.lastCursor,
            products: productsPage.lastCursor,
            customers: customersPage.lastCursor
          },
          rowsPulled: ordersPage.nodes.length + productsPage.nodes.length + customersPage.nodes.length,
          rowsNormalized: Object.values(normalizedArtifacts).reduce((sum, artifact) => sum + artifact.rowCount, 0),
          rowsRejected: 0,
          manifestKey: manifest.manifest_key,
          finishedAt: new Date()
        }
      });
      const successfulSyncTime = syncWindowEnd;
      await tx.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: {
          lastSyncedAt: successfulSyncTime,
          ...(account.autoSyncEnabled
            ? { nextSyncAt: new Date(successfulSyncTime.getTime() + account.syncIntervalMinutes * 60 * 1000) }
            : { nextSyncAt: null }),
          ...(input.trigger === "scheduled" ? { lastAutoSyncSuccessAt: successfulSyncTime, autoSyncFailureCount: 0 } : {})
        }
      });
      const snapshot = await storeCanonicalSchemaSnapshot({
        prisma: tx,
        workspaceId: input.workspaceId,
        dataSourceId: account.dataSourceId!,
        status: ConnectionStatus.CONNECTED,
        schemaJson: snapshotJson,
        qualityReport: {
          guardrailReport: guardrails.guardrailReport,
          duplicateCount: deduped.duplicateCounts,
          manifestKey: manifest.manifest_key,
          syncRunId,
          dataMode: analytics.mode,
          confidenceScore: analytics.confidence,
          missingFields: analytics.missingFields,
          estimationUsed: analytics.estimation_used,
          analytics
        } as Prisma.InputJsonValue
      });

      await Promise.all(Object.entries(normalizedArtifacts).map(([tableName, artifact]) =>
        tx.dataSourceStats.upsert({
          where: {
            dataSourceConnectionId_tableName: {
              dataSourceConnectionId: account.dataSourceId!,
              tableName
            }
          },
          create: {
            dataSourceConnectionId: account.dataSourceId!,
            tableName,
            rowCount: artifact.rowCount,
            maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
            dateField: tableName === "ecommerce_refunds" ? "refund_date" : tableName === "ecommerce_customers" ? "customer_created_at" : "order_date",
            schemaHash: artifact.checksum
          },
          update: {
            rowCount: artifact.rowCount,
            maxDate: latestBusinessDate ? new Date(latestBusinessDate) : null,
            schemaHash: artifact.checksum,
            calculatedAt: new Date()
          }
        })
      ));

      await tx.dataSourceConnection.updateMany({
        where: {
          id: account.dataSourceId!,
          isActive: true
        },
        data: {
          status: ConnectionStatus.CONNECTED,
          lastErrorMessage: null,
          lastSyncAt: syncWindowEnd,
          schemas: snapshotJson as Prisma.InputJsonValue,
          config: {
            ...(typeof dataSource.config === "object" && dataSource.config ? dataSource.config as JsonRecord : {}),
            manifestKey: manifest.manifest_key,
            latestSyncRunId: syncRunId,
            schemaVersion: SCHEMA_VERSION,
            latestBusinessDate,
            checksum: manifest.checksum,
            schemaSnapshotId: snapshot.id,
            guardrailReport: guardrails.guardrailReport,
            dataMode: analytics.mode,
            confidenceScore: analytics.confidence,
            missingFields: analytics.missingFields,
            estimationUsed: analytics.estimation_used,
            analytics
          } as Prisma.InputJsonValue
        }
      });

      return {
        schemaSnapshotId: snapshot.id
      };
    }, {
      timeout: 60_000
    });

    const downstreamJob = await prisma.asyncJob.create({
      data: {
        workspaceId: input.workspaceId,
        type: "CALCULATE_METRICS",
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued after Shopify sync",
        payload: {
          dataSourceId: account.dataSourceId,
          schemaSnapshotId: syncCommit.schemaSnapshotId,
          syncRunId
        } as Prisma.InputJsonValue
      }
    }).catch((error) => {
      console.warn("Failed to create Shopify downstream metric job", error);
      return null;
    });
    if (downstreamJob?.id) {
      void import("@/lib/jobs/async-job-runner").then(({ processJob }) => processJob(downstreamJob.id)).catch((error) => {
        console.warn("Failed to process Shopify downstream metric job", error);
      });
    }

    return {
      ok: true,
      reused: false,
      syncRunId,
      status: "success",
      manifest,
      guardrailReport: guardrails.guardrailReport,
      dataMode: analytics.mode,
      confidenceScore: analytics.confidence,
      missingFields: analytics.missingFields,
      estimationUsed: analytics.estimation_used,
      analytics,
      downstreamJobId: downstreamJob?.id ?? null
    };
  } catch (error) {
    await prisma.ecommerceSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Shopify sync failed.",
        finishedAt: new Date()
      }
    }).catch(() => undefined);
    throw error;
  }
}

function normalizeShopifyRecords(input: {
  workspaceId: string;
  dataSourceId: string;
  connectorAccountId: string;
  shopDomain: string;
  syncRunId: string;
  orders: ShopifyGuardrailOrder[];
  products: ShopifyProduct[];
  customers: ShopifyCustomer[];
}): CanonicalArtifact {
  const normalizedAt = new Date().toISOString();
  const base = {
    workspace_id: input.workspaceId,
    data_source_id: input.dataSourceId,
    source_provider: SHOPIFY_PROVIDER,
    source_account_id: input.shopDomain,
    schema_version: SCHEMA_VERSION,
    sync_run_id: input.syncRunId,
    normalized_at: normalizedAt
  };
  const artifact: CanonicalArtifact = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: []
  };

  for (const order of input.orders) {
    const sourceOrderId = stringValue(order.id);
    if (!sourceOrderId) continue;
    const orderId = `shopify:${input.shopDomain}:${sourceOrderId}`;
    const grossSales = moneyAmount(order.subtotalPriceSet);
    const discountAmount = moneyAmount(order.totalDiscountsSet);
    const refundAmount = moneyAmount(order.totalRefundedSet);
    artifact.ecommerce_orders.push({
      ...base,
      source_order_id: sourceOrderId,
      order_id: orderId,
      customer_id: order.customer?.id ? `shopify:${input.shopDomain}:${order.customer.id}` : null,
      order_date: order.processedAt ?? order.createdAt,
      order_status: order.cancelledAt ? "cancelled" : "active",
      financial_status: order.displayFinancialStatus ?? null,
      fulfillment_status: order.displayFulfillmentStatus ?? null,
      country: order.shippingAddress?.country ?? null,
      province: order.shippingAddress?.province ?? null,
      city: order.shippingAddress?.city ?? null,
      currency: order.currencyCode ?? moneyCurrency(order.totalPriceSet),
      gross_sales: grossSales,
      discount_amount: discountAmount,
      refund_amount: refundAmount,
      net_sales: grossSales - discountAmount - refundAmount,
      tax_amount: moneyAmount(order.totalTaxSet),
      shipping_amount: moneyAmount(order.totalShippingPriceSet),
      total_paid: moneyAmount(order.totalPriceSet),
      is_cancelled: Boolean(order.cancelledAt),
      is_test: Boolean(order.test),
      is_paid: /paid/i.test(String(order.displayFinancialStatus ?? "")),
      created_at_source: order.createdAt,
      updated_at_source: order.updatedAt,
      processed_at_source: order.processedAt ?? null,
      cancelled_at_source: order.cancelledAt ?? null,
      source_record_id: sourceOrderId,
      raw_payload_hash: sha256(JSON.stringify(order))
    });
    for (const edge of order.lineItems?.edges ?? []) {
      const item = edge?.node;
      if (!item?.id) continue;
      const quantity = numberValue(item.quantity);
      const unitPrice = moneyAmount(item.originalUnitPriceSet);
      const itemGrossSales = unitPrice * quantity;
      const itemNetSales = moneyAmount(item.discountedTotalSet) || itemGrossSales;
      const canonicalSku = buildCanonicalSku({
        sku: item.sku ?? item.variant?.sku ?? null,
        product_id: item.product?.id ?? null,
        variant_id: item.variant?.id ?? null,
        platform: SHOPIFY_PROVIDER
      });
      artifact.ecommerce_order_items.push({
        ...base,
        source_order_id: sourceOrderId,
        source_line_item_id: item.id,
        order_id: orderId,
        order_item_id: `shopify:${input.shopDomain}:${item.id}`,
        product_id: item.product?.id ? `shopify:${input.shopDomain}:${item.product.id}` : null,
        variant_id: item.variant?.id ? `shopify:${input.shopDomain}:${item.variant.id}` : null,
        sku: canonicalSku.sku,
        sku_unmapped: canonicalSku.unmapped,
        sku_source: canonicalSku.unmapped ? "fallback" : "shopify",
        product_name: item.name ?? null,
        quantity,
        unit_price: unitPrice,
        gross_sales: itemGrossSales,
        discount_amount: Math.max(0, itemGrossSales - itemNetSales),
        refund_amount: 0,
        net_sales: itemNetSales,
        currency: moneyCurrency(item.originalUnitPriceSet) ?? order.currencyCode ?? null,
        fulfillment_status: order.displayFulfillmentStatus ?? null,
        source_record_id: item.id,
        raw_payload_hash: sha256(JSON.stringify(item))
      });
    }
    for (const refund of order.refunds ?? []) {
      if (!refund.id) continue;
      artifact.ecommerce_refunds.push({
        ...base,
        source_refund_id: refund.id,
        source_order_id: sourceOrderId,
        source_line_item_id: firstRefundLineItemId(refund),
        refund_id: `shopify:${input.shopDomain}:${refund.id}`,
        order_id: orderId,
        order_item_id: firstRefundLineItemId(refund) ? `shopify:${input.shopDomain}:${firstRefundLineItemId(refund)}` : null,
        refund_date: refund.createdAt,
        refund_amount: moneyAmount(refund.totalRefundedSet),
        currency: moneyCurrency(refund.totalRefundedSet) ?? order.currencyCode ?? null,
        refund_reason: refund.note ?? null,
        source_record_id: refund.id,
        raw_payload_hash: sha256(JSON.stringify(refund))
      });
    }
  }

  for (const product of input.products) {
    if (!product.id) continue;
    const variants = product.variants?.edges?.map((edge) => edge?.node).filter(Boolean) ?? [null];
    for (const variant of variants.length ? variants : [null]) {
      const canonicalSku = buildCanonicalSku({
        sku: variant?.sku ?? null,
        product_id: product.id,
        variant_id: variant?.id ?? null,
        platform: SHOPIFY_PROVIDER
      });
      artifact.ecommerce_products.push({
        ...base,
        source_product_id: product.id,
        source_variant_id: variant?.id ?? null,
        product_id: `shopify:${input.shopDomain}:${product.id}`,
        variant_id: variant?.id ? `shopify:${input.shopDomain}:${variant.id}` : null,
        sku: canonicalSku.sku,
        sku_unmapped: canonicalSku.unmapped,
        sku_source: canonicalSku.unmapped ? "fallback" : "shopify",
        product_name: product.title ?? null,
        product_type: product.productType ?? null,
        category: product.productType ?? null,
        vendor: product.vendor ?? null,
        brand: product.vendor ?? null,
        status: product.status ?? null,
        created_at_source: product.createdAt ?? null,
        updated_at_source: product.updatedAt ?? null,
        source_record_id: variant?.id ?? product.id,
        raw_payload_hash: sha256(JSON.stringify({ product, variant }))
      });
    }
  }

  for (const customer of input.customers) {
    if (!customer.id) continue;
    artifact.ecommerce_customers.push({
      ...base,
      source_customer_id: customer.id,
      customer_id: `shopify:${input.shopDomain}:${customer.id}`,
      email_hash: null,
      country: customer.defaultAddress?.country ?? null,
      province: customer.defaultAddress?.province ?? null,
      city: customer.defaultAddress?.city ?? null,
      customer_created_at: customer.createdAt ?? null,
      total_orders: numberValue(customer.numberOfOrders),
      total_spent: moneyAmount({ shopMoney: customer.amountSpent }),
      currency: customer.amountSpent?.currencyCode ?? null,
      source_record_id: customer.id,
      raw_payload_hash: sha256(JSON.stringify(customer))
    });
  }

  return artifact;
}

function dedupeCanonicalArtifact(artifact: CanonicalArtifact) {
  const duplicateCounts: Record<string, number> = {};
  const deduped = Object.fromEntries(Object.entries(artifact).map(([tableName, rows]) => {
    const map = new Map<string, JsonRecord>();
    let duplicates = 0;
    for (const row of rows) {
      const key = canonicalKey(tableName, row);
      if (map.has(key)) duplicates += 1;
      map.set(key, row);
    }
    duplicateCounts[tableName] = duplicates;
    return [tableName, Array.from(map.values())];
  })) as CanonicalArtifact;

  return { artifact: deduped, duplicateCounts };
}

function canonicalKey(tableName: string, row: JsonRecord) {
  const base = `${row.workspace_id}|${row.data_source_id}|${row.source_provider}`;
  if (tableName === "ecommerce_orders") return `${base}|${row.source_order_id}`;
  if (tableName === "ecommerce_order_items") return `${base}|${row.source_order_id}|${row.source_line_item_id}`;
  if (tableName === "ecommerce_products") return `${base}|${row.source_product_id}|${row.source_variant_id ?? ""}`;
  if (tableName === "ecommerce_customers") return `${base}|${row.source_customer_id}`;
  if (tableName === "ecommerce_refunds") return `${base}|${row.source_refund_id}`;
  return `${base}|${row.source_record_id}`;
}

async function writeArtifact(key: string, rows: unknown[], contentType = "application/x-ndjson"): Promise<ArtifactWriteResult> {
  const body = contentType === "application/json"
    ? JSON.stringify(rows[0] ?? {}, null, 2)
    : rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  const checksum = sha256(body);
  await writeR2ObjectText({ key, body, contentType });
  return { artifactKey: key, checksum, rowCount: rows.length };
}

function buildCanonicalDatasetFromArtifact(artifact: CanonicalArtifact, input: {
  sourceProvider: string;
  normalizedAt: string;
  validationWarnings: string[];
  duplicateCount: number;
  confidence: number;
}): CanonicalDataset {
  return {
    schema_version: SCHEMA_VERSION,
    tables: artifact,
    metadata: {
      source_platforms: [input.sourceProvider],
      normalized_at: input.normalizedAt,
      unknown_fields: [],
      validation: {
        accepted_rows: Object.values(artifact).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: 0,
        warnings: input.validationWarnings.map((field) => ({
          table: "ecommerce",
          field,
          reason: "shopify_data_mode_missing_field"
        })),
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: input.duplicateCount
      },
      mapping_confidence: input.confidence
    }
  };
}

async function runSemanticLearning(input: {
  prisma: PrismaClient;
  workspaceId: string;
  rawData: unknown[];
}) {
  try {
    const memory = new PrismaSemanticMemoryStore(input.prisma, { workspaceId: input.workspaceId });
    const runtime = new SelfLearningSemanticRuntime({ memory });
    const result = await runtime.run({
      rawData: input.rawData,
      platform: SHOPIFY_PROVIDER
    });

    return {
      records_updated: result.learning.records_updated,
      memory_size: result.learning.memory_size,
      average_memory_confidence: result.learning.average_memory_confidence,
      model_update: result.learning.model_update,
      unknown_fields: result.learning.unknown_fields,
      anomaly_fields: result.learning.anomaly_fields
    };
  } catch {
    return skippedSemanticLearning();
  }
}

function skippedSemanticLearning() {
  return {
    records_updated: 0,
    memory_size: 0,
    average_memory_confidence: 0,
    model_update: {
      strategy: "zero-retraining-weight-adjustment",
      embedding_similarity_weight: 0,
      runtime_updated: false
    },
    unknown_fields: [],
    anomaly_fields: []
  };
}

function canonicalColumns(tableName: string) {
  const shared = ["workspace_id", "data_source_id", "source_provider", "source_account_id", "schema_version", "sync_run_id", "source_record_id", "raw_payload_hash", "normalized_at"];
  const tableFields: Record<string, string[]> = {
    ecommerce_orders: ["source_order_id", "order_id", "customer_id", "order_date", "order_status", "financial_status", "fulfillment_status", "country", "province", "city", "currency", "gross_sales", "discount_amount", "refund_amount", "net_sales", "tax_amount", "shipping_amount", "total_paid", "is_cancelled", "is_test", "is_paid", "created_at_source", "updated_at_source", "processed_at_source", "cancelled_at_source"],
    ecommerce_order_items: ["source_order_id", "source_line_item_id", "order_id", "order_item_id", "product_id", "variant_id", "sku", "product_name", "quantity", "unit_price", "gross_sales", "discount_amount", "refund_amount", "net_sales", "currency", "fulfillment_status"],
    ecommerce_products: ["source_product_id", "source_variant_id", "product_id", "variant_id", "sku", "product_name", "product_type", "category", "vendor", "brand", "status", "created_at_source", "updated_at_source"],
    ecommerce_customers: ["source_customer_id", "customer_id", "email_hash", "country", "province", "city", "customer_created_at", "total_orders", "total_spent", "currency"],
    ecommerce_refunds: ["source_refund_id", "source_order_id", "source_line_item_id", "refund_id", "order_id", "order_item_id", "refund_date", "refund_amount", "currency", "refund_reason"]
  };
  return [...shared, ...(tableFields[tableName] ?? [])].map((name) => ({ name, type: "canonical" }));
}

function objectMap<T, R>(value: Record<string, T>, mapper: (input: T) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapper(item)]));
}

function latestDate(values: unknown[]) {
  const timestamps = values
    .map((value) => typeof value === "string" ? Date.parse(value) : NaN)
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function firstRefundLineItemId(refund: { refundLineItems?: { edges?: Array<{ node?: { lineItem?: { id?: string | null } | null } | null } | null> } | null }) {
  return refund.refundLineItems?.edges?.find((edge) => edge?.node?.lineItem?.id)?.node?.lineItem?.id ?? null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? number : 0;
}

function moneyCurrency(value: { shopMoney?: { currencyCode?: string | null } | null } | null | undefined) {
  return stringValue(value?.shopMoney?.currencyCode);
}

function moneyAmount(value: { shopMoney?: { amount?: string | number | null } | null } | null | undefined) {
  const raw = value?.shopMoney?.amount;
  const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  return Number.isFinite(number) ? number : 0;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
