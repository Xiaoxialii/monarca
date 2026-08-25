import { NextResponse } from "next/server";
import { META_ADS_PROVIDER } from "@/lib/ads/meta/meta-oauth";
import { GOOGLE_CREATIVE_UNSUPPORTED_REASON } from "@/lib/ads/creative-intelligence/types";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET(request: Request) {
  try {
    const session = await requireWorkspace(request);
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") || META_ADS_PROVIDER;
    const dataSourceId = url.searchParams.get("dataSourceId") || undefined;
    const runs = await prisma.ecommerceSyncRun.findMany({
      where: {
        workspaceId: session.workspace.id,
        provider,
        ...(dataSourceId ? { dataSourceId } : {})
      },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        syncRunId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        rowsPulled: true,
        rowsNormalized: true,
        rowsRejected: true,
        errorMessage: true,
        cursorJson: true
      }
    });
    const source = await prisma.dataSourceConnection.findFirst({
      where: {
        workspaceId: session.workspace.id,
        provider,
        ...(dataSourceId ? { id: dataSourceId } : {})
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        lastSyncAt: true,
        lastErrorMessage: true,
        config: true
      }
    });

    return NextResponse.json({
      ok: true,
      provider,
      dataSource: source,
      runs,
      reconnectRequired: source?.status === "PENDING" && Boolean(source.lastErrorMessage),
      unsupported: provider === "google_ads" ? GOOGLE_CREATIVE_UNSUPPORTED_REASON : null
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load creative sync status." }, { status: 500 });
  }
}
