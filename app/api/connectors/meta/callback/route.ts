import { ConnectionStatus, DataSourceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  META_ADS_PROVIDER,
  exchangeMetaCodeForToken,
  fetchMetaAdAccounts,
  normalizeMetaAdAccountId,
  publicMetaError,
  requiredMetaEnv,
  verifyAndConsumeMetaOAuthState
} from "@/lib/ads/meta/meta-oauth";
import { PRODUCT_ACCESS_REQUIRED_CODE, assertProductAccessForUserId } from "@/lib/product-access";
import { enqueueConnectorSyncJob } from "@/lib/jobs/connector-sync-queue";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

function dashboardRedirect(request: Request, status: "connected" | "failed", code?: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("meta_ads", status);
  if (code) url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

function sanitizedConfig(input: {
  connectorAccountId: string;
  adAccountId: string;
  adAccountName?: string;
  currency?: string;
  timezone?: string;
}) {
  return {
    provider: META_ADS_PROVIDER,
    businessType: "ads",
    adAccountId: input.adAccountId,
    adAccountName: input.adAccountName ?? null,
    currency: input.currency ?? null,
    timezone: input.timezone ?? null,
    connectorAccountId: input.connectorAccountId,
    schemaVersion: "ecommerce_canonical_v1"
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateToken = url.searchParams.get("state");
    const errorReason = url.searchParams.get("error_reason") || url.searchParams.get("error");

    if (errorReason) {
      return dashboardRedirect(request, "failed", "META_OAUTH_DENIED");
    }
    if (!code) {
      return NextResponse.json({ ok: false, code: "MISSING_CODE", message: "Missing Meta authorization code." }, { status: 400 });
    }

    const { clientId, clientSecret, redirectUri, scopes } = requiredMetaEnv();
    const state = await verifyAndConsumeMetaOAuthState(stateToken);
    await assertProductAccessForUserId(state.userId);
    const token = await exchangeMetaCodeForToken({
      code,
      clientId,
      clientSecret,
      redirectUri
    });
    const adAccounts = await fetchMetaAdAccounts({ accessToken: token.accessToken });
    const firstAdAccount = adAccounts[0];
    const adAccountId = normalizeMetaAdAccountId(firstAdAccount?.id ?? firstAdAccount?.account_id);

    if (!adAccountId) {
      return dashboardRedirect(request, "failed", "META_AD_ACCOUNT_NOT_FOUND");
    }

    const adAccountName = typeof firstAdAccount.name === "string" ? firstAdAccount.name : undefined;
    const currency = typeof firstAdAccount.currency === "string" ? firstAdAccount.currency : undefined;
    const timezone = typeof firstAdAccount.timezone_name === "string" ? firstAdAccount.timezone_name : undefined;

    await prisma.$transaction(async (tx) => {
      const account = await tx.ecommerceConnectorAccount.upsert({
        where: {
          workspaceId_provider_shopDomain: {
            workspaceId: state.workspaceId,
            provider: META_ADS_PROVIDER,
            shopDomain: adAccountId
          }
        },
        create: {
          workspaceId: state.workspaceId,
          provider: META_ADS_PROVIDER,
          shopDomain: adAccountId,
          encryptedAccessToken: token.encryptedAccessToken,
          scopes,
          status: "connected"
        },
        update: {
          encryptedAccessToken: token.encryptedAccessToken,
          scopes,
          status: "connected"
        }
      });

      const existingSource = await tx.dataSourceConnection.findFirst({
        where: {
          workspaceId: state.workspaceId,
          provider: META_ADS_PROVIDER,
          type: "ADS_PLATFORM" as DataSourceType,
          config: {
            path: ["adAccountId"],
            equals: adAccountId
          }
        },
        select: { id: true }
      });
      const config = sanitizedConfig({
        connectorAccountId: account.id,
        adAccountId,
        adAccountName,
        currency,
        timezone
      });
      const dataSource = existingSource
        ? await tx.dataSourceConnection.update({
            where: { id: existingSource.id },
            data: {
              name: `Meta Ads - ${adAccountName || adAccountId}`,
              provider: META_ADS_PROVIDER,
              type: "ADS_PLATFORM" as DataSourceType,
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
              name: `Meta Ads - ${adAccountName || adAccountId}`,
              provider: META_ADS_PROVIDER,
              type: "ADS_PLATFORM" as DataSourceType,
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
        data: { dataSourceId: dataSource.id }
      });
      await tx.dataSourceConnection.update({
        where: { id: dataSource.id },
        data: {
          config: sanitizedConfig({
            connectorAccountId: account.id,
            adAccountId,
            adAccountName,
            currency,
            timezone
          })
        }
      });
      return enqueueConnectorSyncJob(tx, {
        workspaceId: state.workspaceId,
        provider: META_ADS_PROVIDER,
        trigger: "meta_oauth_callback",
        connectorAccountId: account.id,
        dataSourceId: dataSource.id,
        shopDomain: adAccountId,
        currentStep: "Queued Meta Ads initial creative sync"
      });
    });

    return dashboardRedirect(request, "connected");
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return dashboardRedirect(request, "failed", PRODUCT_ACCESS_REQUIRED_CODE);
    }

    const publicError = publicMetaError(error);
    if (publicError.status >= 500) {
      return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
    }

    return dashboardRedirect(request, "failed", publicError.code);
  }
}
