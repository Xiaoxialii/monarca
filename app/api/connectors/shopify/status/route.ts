import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";
import {
  SHOPIFY_PROVIDER,
  currentRequiredShopifyScopes,
  missingConfiguredShopifyScopes,
  shopifyScopeStatus
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { assertProductAccessForUser } from "@/lib/product-access";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request) {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ connected: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 });
  }
  try {
    await assertProductAccessForUser(session.user);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }

  const url = new URL(request.url);
  const includeMock = url.searchParams.get("mode") === "mock";
  const accounts = await prisma.ecommerceConnectorAccount.findMany({
    where: {
      workspaceId: session.workspace.id,
      provider: SHOPIFY_PROVIDER,
      status: "connected"
    },
    include: {
      dataSource: {
        select: {
          id: true,
          status: true,
          isActive: true,
          config: true,
          lastSyncAt: true
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });
  const account = accounts.find((item) => {
    const config = asRecord(item.dataSource?.config);
    return includeMock || config.mode !== "mock";
  });

  if (!account) {
    return NextResponse.json({
      connected: false,
      shopDomain: null,
      lastSyncedAt: null,
      status: "not_connected"
    });
  }

  const requiredScopes = account.requiredScopes ?? currentRequiredShopifyScopes();
  const grantedScopes = account.grantedScopes ?? account.scopes;
  const missingScopes = missingConfiguredShopifyScopes(requiredScopes, grantedScopes);
  const scopeStatus = shopifyScopeStatus(requiredScopes, grantedScopes);

  if (scopeStatus !== account.scopeStatus || account.requiredScopes !== requiredScopes || account.grantedScopes !== grantedScopes) {
    await prisma.ecommerceConnectorAccount.update({
      where: { id: account.id },
      data: {
        requiredScopes,
        grantedScopes,
        scopeStatus
      }
    });
  }
  const hasConnectedDataSource =
    Boolean(account.dataSource?.id) &&
    account.dataSource?.isActive === true &&
    account.dataSource?.status === ConnectionStatus.CONNECTED;
  const isConnected = scopeStatus === "OK" && hasConnectedDataSource;

  return NextResponse.json({
    connected: isConnected,
    shopDomain: account.shopDomain,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? account.dataSource?.lastSyncAt?.toISOString() ?? null,
    status: isConnected ? account.status : "not_connected",
    scopeStatus,
    missingScopes,
    requiredScopes,
    grantedScopes,
    dataSourceId: account.dataSourceId,
    dataSourceStatus: account.dataSource?.status ?? null,
    connectorAccountId: account.id
  });
}
