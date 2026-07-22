import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { processJob, retryableAsyncJobWhere } from "@/lib/jobs/async-job-runner";
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
    const job = await prisma.asyncJob.findFirst({
      where: {
        id: jobId,
        workspaceId: session.workspace.id,
        status: {
          notIn: ["COMPLETED", "CANCELLED"]
        },
        ...retryableAsyncJobWhere()
      },
      select: {
        id: true,
        type: true,
        status: true,
        retryCount: true,
        maxRetries: true
      }
    });

    if (!job || (job.status === "FAILED" && job.retryCount >= job.maxRetries)) {
      return NextResponse.json({ ok: false, message: "Job is not retryable yet." }, { status: 409 });
    }

    after(() => {
      void processJob(jobId).catch((error) => {
        console.error("Failed to retry async job", error);
      });
    });

    return NextResponse.json({
      ok: true,
      status: "RETRY_QUEUED",
      jobId
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to retry async job", error);
    return NextResponse.json({ ok: false, message: "Failed to retry job." }, { status: 500 });
  }
}
