import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { recoverAsyncJobs } from "@/lib/jobs/async-job-runner";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const body = await request.json().catch(() => ({}));
    const limit = Number.isFinite(Number(body?.limit)) ? Math.max(1, Math.min(25, Number(body.limit))) : 10;

    after(() => {
      void recoverAsyncJobs({
        workspaceId: session.workspace.id,
        limit
      }).catch((error) => {
        console.error("Failed to recover async jobs", error);
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

    console.error("Failed to queue async job recovery", error);
    return NextResponse.json({ ok: false, message: "Failed to queue job recovery." }, { status: 500 });
  }
}
