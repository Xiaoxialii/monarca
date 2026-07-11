import { NextResponse } from "next/server";
import { runMetaAdsProductionSync } from "@/lib/ads/meta/meta-sync-engine";
import { publicMetaError } from "@/lib/ads/meta/meta-oauth";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null } | null;
    const result = await runMetaAdsProductionSync(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: body?.dataSourceId ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    const publicError = publicMetaError(error);
    if (publicError.code !== "META_CONNECTOR_ERROR") {
      return NextResponse.json(
        {
          ok: false,
          code: publicError.code,
          message: publicError.message
        },
        { status: publicError.status }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "META_SYNC_FAILED",
        message: error instanceof Error ? error.message : "Meta Ads sync failed."
      },
      { status: 500 }
    );
  }
}
