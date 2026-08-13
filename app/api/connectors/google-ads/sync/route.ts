import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { publicGoogleAdsError } from "@/lib/connectors/google-ads/google-ads-errors";
import { runGoogleAdsProductionSync } from "@/lib/connectors/google-ads/google-ads-sync";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null; historicalSyncDays?: number | null } | null;
    const result = await runGoogleAdsProductionSync(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: body?.dataSourceId ?? null,
      historicalSyncDays: body?.historicalSyncDays ?? null,
      trigger: "manual",
      force: true
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    const publicError = publicGoogleAdsError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
