import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET() {
  try {
    const session = await requireWorkspace();
    const source = await prisma.dataSourceConnection.findFirst({
      where: {
        workspaceId: session.workspace.id,
        provider: AMAZON_PROVIDER,
        isActive: true
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        lastSyncAt: true,
        lastErrorMessage: true,
        config: true,
        ecommerceConnectorAccounts: {
          where: { provider: AMAZON_PROVIDER },
          select: {
            id: true,
            shopDomain: true,
            status: true,
            autoSyncEnabled: true,
            syncIntervalMinutes: true,
            lastSyncedAt: true,
            nextSyncAt: true
          },
          take: 1
        }
      }
    });

    return NextResponse.json({ ok: true, connected: Boolean(source), source });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to load Amazon status." }, { status: 500 });
  }
}
