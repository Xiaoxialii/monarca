import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { recoverStaleIngestionJobs } from "@/lib/ingestion/unified-ingestion-worker";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const body = await request.json().catch(() => ({}));
    const limit = Number.isFinite(Number(body?.limit)) ? Math.max(1, Math.min(25, Number(body.limit))) : 10;

    after(() => {
      void recoverStaleIngestionJobs({
        workspaceId: session.workspace.id,
        limit
      }).catch((error) => {
        console.error("Failed to recover stale ingestion jobs", error);
      });
    });

    return NextResponse.json({
      ok: true,
      status: "RECOVERY_QUEUED",
      limit
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    console.error("Failed to queue stale ingestion recovery", error);
    return NextResponse.json({ ok: false, message: "Failed to queue stale ingestion recovery." }, { status: 500 });
  }
}
