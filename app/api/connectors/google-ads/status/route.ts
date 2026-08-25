import { NextResponse } from "next/server";
import { GOOGLE_ADS_PROVIDER } from "@/lib/connectors/google-ads/google-ads-errors";
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
      provider: GOOGLE_ADS_PROVIDER,
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
      customerId: null,
      lastSyncedAt: null,
      status: "not_connected"
    });
  }

  const config = asRecord(account.dataSource?.config);

  return NextResponse.json({
    connected: true,
    customerId: typeof config.customerId === "string" ? config.customerId : account.shopDomain,
    customerName: typeof config.customerName === "string" ? config.customerName : null,
    loginCustomerId: typeof config.loginCustomerId === "string" ? config.loginCustomerId : null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? account.dataSource?.lastSyncAt?.toISOString() ?? null,
    status: account.status,
    dataSourceId: account.dataSourceId,
    connectorAccountId: account.id,
    advertisingDataAvailable: config.advertisingDataAvailable === true,
    skuAttributionAvailable: config.skuAttributionAvailable === true
  });
}
