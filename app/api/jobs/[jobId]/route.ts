import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  OPTIMIZATION_MAX_EXECUTION_MS,
  OPTIMIZATION_QUEUED_ASYNC_JOB_MS,
  SKU_OPTIMIZATION_STALE_JOB_MS
} from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function optimizationRecoveryState(job: {
  type: string;
  status: string;
  updatedAt: Date;
  heartbeatAt: Date | null;
  startedAt: Date | null;
  lockedAt: Date | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
}) {
  if (job.type !== "SKU_OPTIMIZATION") return { needed: false, reason: null };

  const now = Date.now();
  if (job.status === "QUEUED") {
    const stale = now - job.updatedAt.getTime() > OPTIMIZATION_QUEUED_ASYNC_JOB_MS;
    return { needed: stale, reason: stale ? "JOB_QUEUE_TIMEOUT" : null };
  }

  if (job.status !== "PROCESSING" && job.status !== "PAUSED") return { needed: false, reason: null };
  const executionStartedAt = job.startedAt ?? job.lockedAt ?? job.createdAt;
  const exceededMaxExecution = now - executionStartedAt.getTime() > OPTIMIZATION_MAX_EXECUTION_MS;
  if (exceededMaxExecution) return { needed: true, reason: "JOB_MAX_EXECUTION_TIMEOUT" };
  if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now) return { needed: false, reason: null };
  const lastHeartbeat = job.heartbeatAt ?? job.startedAt ?? job.lockedAt ?? job.updatedAt;
  const stale = now - lastHeartbeat.getTime() > SKU_OPTIMIZATION_STALE_JOB_MS;
  return { needed: stale, reason: stale ? "JOB_HEARTBEAT_TIMEOUT" : null };
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
        errorCode: true,
        errorMessage: true,
        retryCount: true,
        maxRetries: true,
        heartbeatAt: true,
        lockedAt: true,
        leaseExpiresAt: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
        updatedAt: true,
        resultReference: true
      }
    });

    if (!job) {
      return NextResponse.json({ ok: false, message: "Job not found." }, { status: 404 });
    }

    const recovery = optimizationRecoveryState(job);

    return NextResponse.json({
      ok: true,
      job,
      recovery
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to load async job", error);
    return NextResponse.json({ ok: false, message: "Failed to load job." }, { status: 500 });
  }
}
