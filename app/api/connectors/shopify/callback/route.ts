import { ConnectionStatus, DataSourceType, Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueShopifyBulkProductSync } from "@/lib/ecommerce-connectors/providers/shopify-bulk-product-sync";
import { runShopifyProductionSync } from "@/lib/ecommerce-connectors/providers/shopify-sync-engine";
import { DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES } from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import {
  SHOPIFY_PROVIDER,
  currentRequiredShopifyScopes,
  encryptConnectorToken,
  exchangeShopifyCodeForToken,
  formatShopifyScopes,
  missingConfiguredShopifyScopes,
  normalizeShopDomain,
  publicShopifyError,
  requiredShopifyEnv,
  shopifyScopeStatus,
  verifyAndConsumeOAuthState,
  verifyShopifyCallbackHmac
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { PRODUCT_ACCESS_REQUIRED_CODE, assertProductAccessForUserId } from "@/lib/product-access";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

function dashboardRedirect(request: Request, status: "connected" | "failed", code?: string, shopDomain?: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("shopify", status);
  if (code) url.searchParams.set("code", code);
  if (shopDomain) url.searchParams.set("shop", shopDomain);

  return NextResponse.redirect(url);
}

function sanitizedConfig(input: {
  shopDomain: string;
  connectorAccountId: string;
  schemaVersion?: string;
}) {
  return {
    shopDomain: input.shopDomain,
    connectorAccountId: input.connectorAccountId,
    schemaVersion: input.schemaVersion ?? "ecommerce_canonical_v1",
    provider: SHOPIFY_PROVIDER,
    businessType: "ecommerce"
  };
}

async function runInitialShopifySync(input: {
  workspaceId: string;
  dataSourceId: string;
  shopDomain: string;
}) {
  const job = await prisma.backgroundJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "SYNC_DATA_SOURCE",
      status: "RUNNING",
      startedAt: new Date(),
      metadataJson: {
        provider: SHOPIFY_PROVIDER,
        dataSourceId: input.dataSourceId,
        shopDomain: input.shopDomain,
        trigger: "shopify_oauth_callback"
      } as Prisma.InputJsonValue
    }
  });

  try {
    const result = await runShopifyProductionSync(prisma, {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId
    });
    const connectorAccount = await prisma.ecommerceConnectorAccount.findFirst({
      where: {
        workspaceId: input.workspaceId,
        dataSourceId: input.dataSourceId,
        provider: SHOPIFY_PROVIDER,
        status: "connected"
      },
      select: { id: true, shopDomain: true }
    });
    const fullProductJob = connectorAccount
      ? await enqueueShopifyBulkProductSync(prisma, {
          workspaceId: input.workspaceId,
          dataSourceId: input.dataSourceId,
          connectorAccountId: connectorAccount.id,
          shopDomain: connectorAccount.shopDomain,
          trigger: "initial"
        }).catch(() => null)
      : null;

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        metadataJson: {
          provider: SHOPIFY_PROVIDER,
          dataSourceId: input.dataSourceId,
          shopDomain: input.shopDomain,
          trigger: "shopify_oauth_callback",
          syncRunId: result.syncRunId,
          dataMode: result.dataMode,
          confidenceScore: result.confidenceScore,
          fullProductJobId: fullProductJob?.id ?? null
        } as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify initial sync failed.";
    console.error("Failed to run initial Shopify sync", error);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: message
      }
    }).catch(() => undefined);
  }
}

export async function GET(request: Request) {
  let shopDomainForRedirect: string | undefined;

  try {
    const url = new URL(request.url);
    const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
    shopDomainForRedirect = shopDomain;
    const code = url.searchParams.get("code");
    const stateToken = url.searchParams.get("state");
    const { clientId, clientSecret } = requiredShopifyEnv();
    const requiredScopes = currentRequiredShopifyScopes();

    if (!code) {
      return NextResponse.json({ ok: false, code: "MISSING_CODE", message: "Missing Shopify authorization code." }, { status: 400 });
    }

    verifyShopifyCallbackHmac(url, clientSecret);
    const state = await verifyAndConsumeOAuthState({
      stateToken,
      provider: SHOPIFY_PROVIDER,
      shopDomain
    });
    await assertProductAccessForUserId(state.userId);
    const token = await exchangeShopifyCodeForToken({
      shopDomain,
      code,
      clientId,
      clientSecret
    });
    const encryptedAccessToken = encryptConnectorToken(token.accessToken);
    const grantedScopes = formatShopifyScopes(token.scope);
    const missingScopes = missingConfiguredShopifyScopes(requiredScopes, grantedScopes);
    const scopeStatus = shopifyScopeStatus(requiredScopes, grantedScopes);

    const connectedDataSourceId = await prisma.$transaction(async (tx) => {
      const account = await tx.ecommerceConnectorAccount.upsert({
        where: {
          workspaceId_provider_shopDomain: {
            workspaceId: state.workspaceId,
            provider: SHOPIFY_PROVIDER,
            shopDomain: state.shopDomain
          }
        },
        create: {
          workspaceId: state.workspaceId,
          provider: SHOPIFY_PROVIDER,
          shopDomain: state.shopDomain,
          encryptedAccessToken,
          scopes: grantedScopes,
          grantedScopes,
          requiredScopes,
          scopeStatus,
          status: "connected",
          autoSyncEnabled: true,
          syncIntervalMinutes: DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
        },
        update: {
          encryptedAccessToken,
          scopes: grantedScopes,
          grantedScopes,
          requiredScopes,
          scopeStatus,
          status: "connected"
        }
      });

      const existingSource = await tx.dataSourceConnection.findFirst({
        where: {
          workspaceId: state.workspaceId,
          provider: SHOPIFY_PROVIDER,
          type: DataSourceType.ECOMMERCE_PLATFORM,
          config: {
            path: ["shopDomain"],
            equals: state.shopDomain
          }
        },
        select: { id: true, config: true }
      });
      const config = sanitizedConfig({
        shopDomain: state.shopDomain,
        connectorAccountId: account.id
      });
      const nextConfig = {
        ...config,
        grantedScopes,
        requiredScopes,
        scopeStatus,
        missingScopes
      };
      const dataSource = existingSource
        ? await tx.dataSourceConnection.update({
            where: { id: existingSource.id },
            data: {
              name: `Shopify - ${state.shopDomain}`,
              provider: SHOPIFY_PROVIDER,
              type: DataSourceType.ECOMMERCE_PLATFORM,
              status: missingScopes.length ? ConnectionStatus.PENDING : ConnectionStatus.CONNECTED,
              isActive: true,
              connectionMode: "oauth",
              authMethod: "oauth",
              config: nextConfig,
              connectedAt: new Date(),
              lastErrorMessage: missingScopes.length
                ? `Shopify permissions need update. Missing scopes: ${missingScopes.join(", ")}.`
                : null
            }
          })
        : await tx.dataSourceConnection.create({
            data: {
              workspaceId: state.workspaceId,
              name: `Shopify - ${state.shopDomain}`,
              provider: SHOPIFY_PROVIDER,
              type: DataSourceType.ECOMMERCE_PLATFORM,
              status: missingScopes.length ? ConnectionStatus.PENDING : ConnectionStatus.CONNECTED,
              isActive: true,
              connectionMode: "oauth",
              authMethod: "oauth",
              config: nextConfig,
              connectedAt: new Date(),
              lastErrorMessage: missingScopes.length
                ? `Shopify permissions need update. Missing scopes: ${missingScopes.join(", ")}.`
                : null
            }
          });

      if (dataSource) {
        await tx.ecommerceConnectorAccount.update({
          where: { id: account.id },
          data: { dataSourceId: dataSource.id }
        });
        await tx.dataSourceConnection.update({
          where: { id: dataSource.id },
          data: {
            config: {
              ...nextConfig,
              connectorAccountId: account.id
            }
          }
        });
      }

      return dataSource?.id ?? null;
    });

    if (missingScopes.length > 0) {
      return dashboardRedirect(request, "failed", "SHOPIFY_SCOPES_NOT_GRANTED", shopDomain);
    }

    if (connectedDataSourceId) {
      after(() =>
        runInitialShopifySync({
          workspaceId: state.workspaceId,
          dataSourceId: connectedDataSourceId,
          shopDomain
        })
      );
    }

    return dashboardRedirect(request, "connected");
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return dashboardRedirect(request, "failed", PRODUCT_ACCESS_REQUIRED_CODE, shopDomainForRedirect);
    }

    const publicError = publicShopifyError(error);
    if (publicError.status >= 500) {
      return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
    }

    return dashboardRedirect(request, "failed", publicError.code);
  }
}
