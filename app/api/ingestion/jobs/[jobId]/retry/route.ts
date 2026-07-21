import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { processIngestionJob } from "@/lib/ingestion/unified-ingestion-worker";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { jobId } = await context.params;
    const reset = await prisma.unifiedIngestionJob.updateMany({
      where: {
        id: jobId,
        workspaceId: session.workspace.id,
        status: "FAILED"
      },
      data: {
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued for retry",
        errorMessage: null,
        startedAt: null,
        completedAt: null
      }
    });

    if (reset.count !== 1) {
      return NextResponse.json(
        { ok: false, message: "Only failed ingestion jobs can be retried." },
        { status: 409 }
      );
    }

    after(() => {
      void processIngestionJob(jobId).catch((error) => {
        console.error("Failed to retry ingestion job", error);
      });
    });

    return NextResponse.json({
      ok: true,
      status: "QUEUED",
      jobId
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    console.error("Failed to retry ingestion job", error);
    return NextResponse.json({ ok: false, message: "Failed to retry ingestion job." }, { status: 500 });
  }
}
