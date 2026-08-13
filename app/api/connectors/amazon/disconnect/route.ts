import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import { encryptConnectorToken } from "@/lib/ecommerce-connectors/shopify-oauth";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null; confirm?: boolean } | null;
    if (!body?.confirm || !body.dataSourceId) {
      return NextResponse.json({ ok: false, code: "CONFIRMATION_REQUIRED", message: "Confirm Amazon disconnect before continuing." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.ecommerceConnectorAccount.findFirst({
        where: {
          workspaceId: session.workspace.id,
          dataSourceId: body.dataSourceId,
          provider: AMAZON_PROVIDER
        },
        select: { id: true }
      });
      if (!account) return { disconnected: false };

      await tx.ecommerceConnectorAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: session.workspace.id,
          provider: AMAZON_PROVIDER
        },
        data: {
          encryptedAccessToken: encryptConnectorToken(""),
          status: "disconnected",
          autoSyncEnabled: false,
          nextSyncAt: null
        }
      });
      await tx.dataSourceConnection.updateMany({
        where: {
          id: body.dataSourceId!,
          workspaceId: session.workspace.id,
          provider: AMAZON_PROVIDER
        },
        data: {
          status: ConnectionStatus.DISCONNECTED,
          isActive: false,
          lastErrorMessage: "Amazon disconnected by user."
        }
      });

      return { disconnected: true };
    });

    return NextResponse.json({ ok: result.disconnected });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to disconnect Amazon." }, { status: 500 });
  }
}
