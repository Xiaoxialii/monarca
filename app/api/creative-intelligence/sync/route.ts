import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { META_ADS_PROVIDER } from "@/lib/ads/meta/meta-oauth";
import { runMetaAdsProductionSync } from "@/lib/ads/meta/meta-sync-engine";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null } | null;
    const source = await prisma.dataSourceConnection.findFirst({
      where: {
        workspaceId: session.workspace.id,
        id: body?.dataSourceId ?? undefined,
        provider: META_ADS_PROVIDER,
        type: "ADS_PLATFORM",
        isActive: true
      },
      select: { id: true }
    });
    if (!source) {
      return NextResponse.json({ ok: false, code: "META_DATA_SOURCE_NOT_FOUND", message: "Meta Ads data source not found for this workspace." }, { status: 404 });
    }
    const result = await runMetaAdsProductionSync(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: source.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Creative sync failed." }, { status: 500 });
  }
}
