import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER]);
    const { jobId } = await context.params;
    const job = await prisma.asyncJob.findFirst({
      where: {
        id: jobId,
        workspaceId: session.workspace.id
      },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        currentStep: true,
        errorMessage: true,
        retryCount: true,
        maxRetries: true,
        heartbeatAt: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        resultReference: true
      }
    });

    if (!job) {
      return NextResponse.json({ ok: false, message: "Job not found." }, { status: 404 });
    }

    if (job.type === "SKU_OPTIMIZATION" && job.status === "QUEUED") {
      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process queued optimization job during status polling", error);
        });
      });
    }

    return NextResponse.json({
      ok: true,
      job
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to load async job", error);
    return NextResponse.json({ ok: false, message: "Failed to load job." }, { status: 500 });
  }
}
