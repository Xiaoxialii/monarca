import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GOOGLE_ADS_PROVIDER } from "@/lib/connectors/google-ads/google-ads-errors";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string; confirm?: boolean } | null;
    if (!body?.confirm) {
      return NextResponse.json({ ok: false, code: "CONFIRMATION_REQUIRED", message: "Confirm Google Ads disconnect before continuing." }, { status: 400 });
    }

    const source = await prisma.dataSourceConnection.findFirst({
      where: {
        id: body.dataSourceId,
        workspaceId: session.workspace.id,
        provider: GOOGLE_ADS_PROVIDER
      },
      select: { id: true }
    });
    if (!source) {
      return NextResponse.json({ ok: false, message: "Google Ads connection not found for this workspace." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.ecommerceConnectorAccount.updateMany({
        where: {
          workspaceId: session.workspace.id,
          provider: GOOGLE_ADS_PROVIDER,
          dataSourceId: source.id
        },
        data: {
          status: "disconnected",
          autoSyncEnabled: false,
          nextSyncAt: null
        }
      }),
      prisma.googleAdsConnection.updateMany({
        where: {
          workspaceId: session.workspace.id,
          dataSourceId: source.id
        },
        data: { status: "disconnected" }
      }),
      prisma.dataSourceConnection.update({
        where: { id: source.id },
        data: {
          status: ConnectionStatus.DISCONNECTED,
          isActive: false,
          lastErrorMessage: "Google Ads disconnected by user."
        }
      })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to disconnect Google Ads." }, { status: 500 });
  }
}
