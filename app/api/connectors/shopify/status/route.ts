import { NextResponse } from "next/server";
import { SHOPIFY_PROVIDER } from "@/lib/ecommerce-connectors/shopify-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request) {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ connected: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 });
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

  return NextResponse.json({
    connected: true,
    shopDomain: account.shopDomain,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? account.dataSource?.lastSyncAt?.toISOString() ?? null,
    status: account.status,
    dataSourceId: account.dataSourceId,
    connectorAccountId: account.id
  });
}
