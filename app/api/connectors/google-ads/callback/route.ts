import { ConnectionStatus, DataSourceType, Prisma, type PrismaClient } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES } from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import { GoogleAdsClient } from "@/lib/connectors/google-ads/google-ads-client";
import { GOOGLE_ADS_PROVIDER, publicGoogleAdsError } from "@/lib/connectors/google-ads/google-ads-errors";
import {
  exchangeGoogleAdsAuthorizationCode,
  googleAdsPublicAccountConfig,
  googleAdsUseMock,
  normalizeCustomerId,
  requiredGoogleAdsEnv,
  verifyAndConsumeGoogleAdsOAuthState
} from "@/lib/connectors/google-ads/google-ads-oauth";
import { runInitialGoogleAdsSync } from "@/lib/connectors/google-ads/google-ads-sync";
import { encryptConnectorToken } from "@/lib/ecommerce-connectors/shopify-oauth";
import { PRODUCT_ACCESS_REQUIRED_CODE, assertProductAccessForUser, assertProductAccessForUserId } from "@/lib/product-access";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

function dashboardRedirect(request: Request, status: "connected" | "failed", code?: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("google_ads", status);
  if (code) url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

async function runInitialGoogleAdsSyncJob(input: {
  workspaceId: string;
  dataSourceId: string;
  customerId: string;
}) {
  const job = await prisma.backgroundJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "SYNC_DATA_SOURCE",
      status: "RUNNING",
      startedAt: new Date(),
      metadataJson: {
        provider: GOOGLE_ADS_PROVIDER,
        dataSourceId: input.dataSourceId,
        customerId: input.customerId,
        trigger: "google_ads_oauth_callback"
      } as Prisma.InputJsonValue
    }
  });

  try {
    const result = await runInitialGoogleAdsSync(prisma, {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId
    });
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        metadataJson: {
          provider: GOOGLE_ADS_PROVIDER,
          dataSourceId: input.dataSourceId,
          customerId: input.customerId,
          trigger: "google_ads_oauth_callback",
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
        error: error instanceof Error ? error.message : "Google Ads initial sync failed."
      }
    }).catch(() => undefined);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const denied = url.searchParams.get("error") || url.searchParams.get("error_description");
    if (denied) return dashboardRedirect(request, "failed", "GOOGLE_ADS_AUTHORIZATION_DENIED");

    const connected = googleAdsUseMock() && url.searchParams.get("mock") === "true"
      ? await connectMockGoogleAds()
      : await connectRealGoogleAds(request, url);

    after(() => {
      void runInitialGoogleAdsSyncJob(connected).catch((error) => {
        console.error("Failed to schedule initial Google Ads sync", error);
      });
    });

    return dashboardRedirect(request, "connected");
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return dashboardRedirect(request, "failed", PRODUCT_ACCESS_REQUIRED_CODE);
    }
    const publicError = publicGoogleAdsError(error);
    if (publicError.status >= 500) {
      return dashboardRedirect(request, "failed", publicError.code);
    }

    return dashboardRedirect(request, "failed", publicError.code);
  }
}

async function connectRealGoogleAds(request: Request, url: URL) {
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code) {
    throw new Error("Missing Google Ads authorization code.");
  }

  const env = requiredGoogleAdsEnv();
  const state = await verifyAndConsumeGoogleAdsOAuthState(stateToken);
  await assertProductAccessForUserId(state.userId);
  const token = await exchangeGoogleAdsAuthorizationCode({
    code,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: env.redirectUri
  });
  const client = new GoogleAdsClient({
    accessToken: token.accessToken,
    developerToken: env.developerToken,
    loginCustomerId: env.loginCustomerId,
    apiVersion: env.apiVersion
  });
  const customers = await client.listAccessibleCustomers();
  const selectedCustomerId = normalizeCustomerId(state.metadata.selectedCustomerId) || customers[0]?.id;
  if (!selectedCustomerId) {
    throw new Error("Google Ads customer account is not accessible.");
  }
  const customer = await client.fetchCustomer(selectedCustomerId);

  return persistGoogleAdsConnection(prisma, {
    workspaceId: state.workspaceId,
    customerId: selectedCustomerId,
    loginCustomerId: env.loginCustomerId,
    encryptedRefreshToken: token.encryptedRefreshToken,
    customerName: customer?.descriptiveName ?? null,
    currencyCode: customer?.currencyCode ?? null,
    timeZone: customer?.timeZone ?? null
  });
}

async function connectMockGoogleAds() {
  const session = await syncCurrentClerkUser();
  if (!session?.workspace?.id) {
    throw new Error("Missing authenticated workspace.");
  }
  await assertProductAccessForUser(session.user);

  return persistGoogleAdsConnection(prisma, {
    workspaceId: session.workspace.id,
    customerId: "1234567890",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null,
    encryptedRefreshToken: encryptConnectorToken("mock-google-ads-refresh-token"),
    customerName: "Mock Google Ads Account",
    currencyCode: "USD",
    timeZone: "America/Los_Angeles"
  });
}

async function persistGoogleAdsConnection(client: PrismaClient, input: {
  workspaceId: string;
  customerId: string;
  loginCustomerId?: string | null;
  encryptedRefreshToken: string;
  customerName?: string | null;
  currencyCode?: string | null;
  timeZone?: string | null;
}) {
  return client.$transaction(async (tx) => {
    const account = await tx.ecommerceConnectorAccount.upsert({
      where: {
        workspaceId_provider_shopDomain: {
          workspaceId: input.workspaceId,
          provider: GOOGLE_ADS_PROVIDER,
          shopDomain: input.customerId
        }
      },
      create: {
        workspaceId: input.workspaceId,
        provider: GOOGLE_ADS_PROVIDER,
        shopDomain: input.customerId,
        encryptedAccessToken: input.encryptedRefreshToken,
        scopes: "https://www.googleapis.com/auth/adwords",
        grantedScopes: "https://www.googleapis.com/auth/adwords",
        requiredScopes: "https://www.googleapis.com/auth/adwords",
        scopeStatus: "OK",
        status: "connected",
        autoSyncEnabled: true,
        syncIntervalMinutes: DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
      },
      update: {
        encryptedAccessToken: input.encryptedRefreshToken,
        grantedScopes: "https://www.googleapis.com/auth/adwords",
        requiredScopes: "https://www.googleapis.com/auth/adwords",
        scopeStatus: "OK",
        status: "connected"
      }
    });
    const config = googleAdsPublicAccountConfig({
      customerId: input.customerId,
      loginCustomerId: input.loginCustomerId,
      connectorAccountId: account.id,
      customerName: input.customerName,
      currencyCode: input.currencyCode,
      timeZone: input.timeZone
    });
    const existingSource = await tx.dataSourceConnection.findFirst({
      where: {
        workspaceId: input.workspaceId,
        provider: GOOGLE_ADS_PROVIDER,
        type: DataSourceType.ADS_PLATFORM,
        config: {
          path: ["customerId"],
          equals: input.customerId
        }
      },
      select: { id: true }
    });
    const dataSource = existingSource
      ? await tx.dataSourceConnection.update({
          where: { id: existingSource.id },
          data: {
            name: `Google Ads - ${input.customerName || input.customerId}`,
            provider: GOOGLE_ADS_PROVIDER,
            type: DataSourceType.ADS_PLATFORM,
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
            workspaceId: input.workspaceId,
            name: `Google Ads - ${input.customerName || input.customerId}`,
            provider: GOOGLE_ADS_PROVIDER,
            type: DataSourceType.ADS_PLATFORM,
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
        nextSyncAt: new Date()
      }
    });
    await tx.googleAdsConnection.upsert({
      where: {
        workspaceId_customerId: {
          workspaceId: input.workspaceId,
          customerId: input.customerId
        }
      },
      create: {
        workspaceId: input.workspaceId,
        dataSourceId: dataSource.id,
        customerId: input.customerId,
        loginCustomerId: normalizeCustomerId(input.loginCustomerId ?? "") || null,
        encryptedRefreshToken: input.encryptedRefreshToken,
        status: "connected"
      },
      update: {
        dataSourceId: dataSource.id,
        loginCustomerId: normalizeCustomerId(input.loginCustomerId ?? "") || null,
        encryptedRefreshToken: input.encryptedRefreshToken,
        status: "connected"
      }
    });

    return {
      workspaceId: input.workspaceId,
      dataSourceId: dataSource.id,
      customerId: input.customerId
    };
  });
}
