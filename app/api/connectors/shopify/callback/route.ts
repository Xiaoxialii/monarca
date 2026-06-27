import { ConnectionStatus, DataSourceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SHOPIFY_PROVIDER,
  encryptConnectorToken,
  exchangeShopifyCodeForToken,
  normalizeShopDomain,
  publicShopifyError,
  requiredShopifyEnv,
  verifyAndConsumeOAuthState,
  verifyShopifyCallbackHmac
} from "@/lib/ecommerce-connectors/shopify-oauth";

function dashboardRedirect(request: Request, status: "connected" | "failed", code?: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("shopify", status);
  if (code) url.searchParams.set("code", code);

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
    const code = url.searchParams.get("code");
    const stateToken = url.searchParams.get("state");
    const { clientId, clientSecret } = requiredShopifyEnv();

    if (!code) {
      return NextResponse.json({ ok: false, code: "MISSING_CODE", message: "Missing Shopify authorization code." }, { status: 400 });
    }

    verifyShopifyCallbackHmac(url, clientSecret);
    const state = await verifyAndConsumeOAuthState({
      stateToken,
      provider: SHOPIFY_PROVIDER,
      shopDomain
    });
    const token = await exchangeShopifyCodeForToken({
      shopDomain,
      code,
      clientId,
      clientSecret
    });
    const encryptedAccessToken = encryptConnectorToken(token.accessToken);
    const scopes = token.scope || state.scopes;

    await prisma.$transaction(async (tx) => {
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
          scopes,
          status: "connected"
        },
        update: {
          encryptedAccessToken,
          scopes,
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
      const dataSource = existingSource
        ? await tx.dataSourceConnection.update({
            where: { id: existingSource.id },
            data: {
              name: `Shopify - ${state.shopDomain}`,
              provider: SHOPIFY_PROVIDER,
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
              name: `Shopify - ${state.shopDomain}`,
              provider: SHOPIFY_PROVIDER,
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
        data: { dataSourceId: dataSource.id }
      });
      await tx.dataSourceConnection.update({
        where: { id: dataSource.id },
        data: {
          config: sanitizedConfig({
            shopDomain: state.shopDomain,
            connectorAccountId: account.id
          })
        }
      });
    });

    return dashboardRedirect(request, "connected");
  } catch (error) {
    const publicError = publicShopifyError(error);
    if (publicError.status >= 500) {
      return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
    }

    return dashboardRedirect(request, "failed", publicError.code);
  }
}
