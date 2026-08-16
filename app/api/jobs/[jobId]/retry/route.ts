import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { optimizationReadiness } from "@/lib/dashboard/optimization-readiness";
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
        workspaceId: true,
        type: true,
        status: true,
        errorCode: true,
        retryCount: true,
        maxRetries: true
      }
    });

    if (!job || (job.status === "FAILED" && job.retryCount >= job.maxRetries)) {
      return NextResponse.json({ ok: false, message: "Job is not retryable yet." }, { status: 409 });
    }

    if (job.type === "SKU_OPTIMIZATION") {
      const readiness = await optimizationReadiness(prisma, {
        workspaceId: job.workspaceId
      });
      if (!readiness.ready) {
        return NextResponse.json({
          ok: false,
          status: "CANONICAL_NOT_READY",
          jobId,
          errorCode: readiness.code ?? "CANONICAL_NOT_READY",
          message: readiness.message ?? "Connected data is not ready for optimization.",
          readiness,
          retryable: readiness.retryable
        }, { status: 409 });
      }
    }

    await prisma.asyncJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued for retry",
        errorCode: null,
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        completedAt: null,
        failedAt: null
      }
    });

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
