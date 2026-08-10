import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { processJob, SKU_OPTIMIZATION_STALE_JOB_MS } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUEUED_JOB_RECOVERY_MS = 10 * 1000;

function shouldKickOptimizationJob(job: {
  type: string;
  status: string;
  updatedAt: Date;
  heartbeatAt: Date | null;
  startedAt: Date | null;
  lockedAt: Date | null;
}) {
  if (job.type !== "SKU_OPTIMIZATION") return false;

  const now = Date.now();
  if (job.status === "QUEUED") {
    return now - job.updatedAt.getTime() > QUEUED_JOB_RECOVERY_MS;
  }

  if (job.status !== "PROCESSING" && job.status !== "PAUSED") return false;
  const lastHeartbeat = job.heartbeatAt ?? job.startedAt ?? job.lockedAt ?? job.updatedAt;
  return now - lastHeartbeat.getTime() > SKU_OPTIMIZATION_STALE_JOB_MS;
}

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
        lockedAt: true,
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

    if (shouldKickOptimizationJob(job)) {
      void processJob(job.id).catch((error) => {
        console.error("Failed to recover stale optimization job from polling", { jobId: job.id, error });
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
