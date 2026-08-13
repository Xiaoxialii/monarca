import { ConnectionStatus, DataSourceType, Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES } from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import {
  amazonPublicAccountConfig,
  exchangeAmazonAuthorizationCode,
  requiredAmazonEnv,
  verifyAndConsumeAmazonOAuthState
} from "@/lib/connectors/amazon/amazon-oauth";
import { AMAZON_PROVIDER, publicAmazonError } from "@/lib/connectors/amazon/amazon-errors";
import { runInitialAmazonSync } from "@/lib/connectors/amazon/amazon-sync";

function dashboardRedirect(request: Request, status: "connected" | "failed", code?: string) {
  const url = new URL("/dashboard/settings", request.url);
  url.searchParams.set("section", "data-sources");
  url.searchParams.set("amazon", status);
  if (code) url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

async function runInitialAmazonSyncJob(input: {
  workspaceId: string;
  dataSourceId: string;
  sellerId: string;
}) {
  const job = await prisma.backgroundJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "SYNC_DATA_SOURCE",
      status: "RUNNING",
      startedAt: new Date(),
      metadataJson: {
        provider: AMAZON_PROVIDER,
        dataSourceId: input.dataSourceId,
        sellerId: input.sellerId,
        trigger: "amazon_oauth_callback"
      } as Prisma.InputJsonValue
    }
  });

  try {
    const result = await runInitialAmazonSync(prisma, {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId
    });
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        metadataJson: {
          provider: AMAZON_PROVIDER,
          dataSourceId: input.dataSourceId,
          sellerId: input.sellerId,
          trigger: "amazon_oauth_callback",
          syncRunId: result.syncRunId,
          status: result.status
        } as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Amazon initial sync failed."
      }
    }).catch(() => undefined);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const denied = url.searchParams.get("error") || url.searchParams.get("error_description");
    if (denied) return dashboardRedirect(request, "failed", "AUTHORIZATION_DENIED");

    const code = url.searchParams.get("spapi_oauth_code") ?? url.searchParams.get("code");
    const stateToken = url.searchParams.get("state");
    const sellingPartnerId = url.searchParams.get("selling_partner_id");
    if (!code) {
      return NextResponse.json({ ok: false, code: "MISSING_CODE", message: "Missing Amazon authorization code." }, { status: 400 });
    }
    if (!sellingPartnerId) {
      return NextResponse.json({ ok: false, code: "SELLER_ACCOUNT_UNAVAILABLE", message: "Missing Amazon selling partner id." }, { status: 400 });
    }

    const env = requiredAmazonEnv();
    const state = await verifyAndConsumeAmazonOAuthState(stateToken);
    const token = await exchangeAmazonAuthorizationCode({
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri: env.redirectUri
    });
    const marketplaceIds = state.metadata.marketplaceIds;
    const region = state.metadata.region;

    const connected = await prisma.$transaction(async (tx) => {
      const account = await tx.ecommerceConnectorAccount.upsert({
        where: {
          workspaceId_provider_shopDomain: {
            workspaceId: state.workspaceId,
            provider: AMAZON_PROVIDER,
            shopDomain: sellingPartnerId
          }
        },
        create: {
          workspaceId: state.workspaceId,
          provider: AMAZON_PROVIDER,
          shopDomain: sellingPartnerId,
          encryptedAccessToken: token.encryptedRefreshToken,
          scopes: "selling_partner_api",
          grantedScopes: "selling_partner_api",
          requiredScopes: "selling_partner_api",
          scopeStatus: "OK",
          status: "connected",
          autoSyncEnabled: true,
          syncIntervalMinutes: DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
        },
        update: {
          encryptedAccessToken: token.encryptedRefreshToken,
          scopes: "selling_partner_api",
          grantedScopes: "selling_partner_api",
          requiredScopes: "selling_partner_api",
          scopeStatus: "OK",
          status: "connected"
        }
      });
      const config = amazonPublicAccountConfig({
        sellerId: sellingPartnerId,
        connectorAccountId: account.id,
        region,
        marketplaceIds
      });
      const existingSource = await tx.dataSourceConnection.findFirst({
        where: {
          workspaceId: state.workspaceId,
          provider: AMAZON_PROVIDER,
          type: DataSourceType.ECOMMERCE_PLATFORM,
          config: {
            path: ["sellerId"],
            equals: sellingPartnerId
          }
        },
        select: { id: true }
      });
      const dataSource = existingSource
        ? await tx.dataSourceConnection.update({
            where: { id: existingSource.id },
            data: {
              name: `Amazon - ${config.sellerDisplay ?? "Seller"}`,
              provider: AMAZON_PROVIDER,
              type: DataSourceType.ECOMMERCE_PLATFORM,
              status: ConnectionStatus.CONNECTED,
              isActive: true,
              connectionMode: "oauth",
              authMethod: "oauth",
              config,
              connectedAt: new Date(),
              lastErrorMessage: null
            }
          })
        : await tx.dataSourceConnection.create({
            data: {
              workspaceId: state.workspaceId,
              name: `Amazon - ${config.sellerDisplay ?? "Seller"}`,
              provider: AMAZON_PROVIDER,
              type: DataSourceType.ECOMMERCE_PLATFORM,
              status: ConnectionStatus.CONNECTED,
              isActive: true,
              connectionMode: "oauth",
              authMethod: "oauth",
              config,
              connectedAt: new Date()
            }
          });

      await tx.ecommerceConnectorAccount.update({
        where: { id: account.id },
        data: {
          dataSourceId: dataSource.id,
          nextSyncAt: account.lastSyncedAt
            ? new Date(account.lastSyncedAt.getTime() + account.syncIntervalMinutes * 60 * 1000)
            : new Date()
        }
      });
      await tx.dataSourceConnection.update({
        where: { id: dataSource.id },
        data: {
          config: amazonPublicAccountConfig({
            sellerId: sellingPartnerId,
            connectorAccountId: account.id,
            region,
            marketplaceIds
          })
        }
      });

      return {
        workspaceId: state.workspaceId,
        dataSourceId: dataSource.id,
        sellerId: sellingPartnerId
      };
    });

    after(() => {
      void runInitialAmazonSyncJob(connected).catch((error) => {
        console.error("Failed to schedule initial Amazon sync", error);
      });
    });

    return dashboardRedirect(request, "connected");
  } catch (error) {
    const publicError = publicAmazonError(error);
    if (publicError.status >= 500) {
      return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
    }

    return dashboardRedirect(request, "failed", publicError.code);
  }
}
