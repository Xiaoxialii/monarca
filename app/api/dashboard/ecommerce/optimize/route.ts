import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { currentDecisionSnapshotVersions } from "@/lib/dashboard/decision-snapshot-lifecycle";
import { enqueueSkuOptimizationJob, processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER]);
    const versions = await currentDecisionSnapshotVersions(prisma, {
      workspaceId: session.workspace.id
    });
    const job = await enqueueSkuOptimizationJob(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh",
      inputHash: versions.inputHash
    });

    after(() => {
      void processJob(job.id).catch((error) => {
        console.error("Failed to process manual optimization refresh job", error);
      });
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status === "QUEUED" ? "QUEUED" : job.status,
      currentStep: job.currentStep,
      versions
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to queue optimization refresh", error);
    return NextResponse.json(
      { ok: false, message: "Failed to queue optimization refresh." },
      { status: 500 }
    );
  }
}
