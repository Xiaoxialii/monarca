import { NextResponse } from "next/server";
import { META_ADS_PROVIDER } from "@/lib/ads/meta/meta-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET() {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ connected: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 });
  }

  const account = await prisma.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: session.workspace.id,
      provider: META_ADS_PROVIDER,
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

  if (!account) {
    return NextResponse.json({
      connected: false,
      ad_account: null,
      adAccountId: null,
      last_sync_at: null,
      lastSyncedAt: null,
      status: "not_connected"
    });
  }

  const config = asRecord(account.dataSource?.config);

  return NextResponse.json({
    connected: true,
    ad_account: typeof config.adAccountId === "string" ? config.adAccountId : account.shopDomain,
    adAccountId: typeof config.adAccountId === "string" ? config.adAccountId : account.shopDomain,
    adAccountName: typeof config.adAccountName === "string" ? config.adAccountName : null,
    last_sync_at: account.lastSyncedAt?.toISOString() ?? account.dataSource?.lastSyncAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? account.dataSource?.lastSyncAt?.toISOString() ?? null,
    status: account.status,
    dataSourceId: account.dataSourceId,
    connectorAccountId: account.id
  });
}
