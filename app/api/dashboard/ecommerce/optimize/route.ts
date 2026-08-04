import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { currentDecisionSnapshotVersions } from "@/lib/dashboard/decision-snapshot-lifecycle";
import { enqueueSkuOptimizationJob, processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { logWorkspaceContext } from "@/lib/current-workspace-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER], request);
    logWorkspaceContext("[workspace-context] dashboard.ecommerce.optimize.POST", session);
    const versions = await currentDecisionSnapshotVersions(prisma, {
      workspaceId: session.workspace.id
    });
    const job = await enqueueSkuOptimizationJob(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh",
      decisionMode: "full",
      inputHash: versions.inputHash
    });

    const result = await processJob(job.id);

    return NextResponse.json({
      ok: result.ok || result.skipped,
      jobId: job.id,
      status: result.ok ? "COMPLETED" : job.status === "QUEUED" ? "QUEUED" : job.status,
      currentStep: result.ok ? "Completed" : job.currentStep,
      error: result.ok || result.skipped ? null : result.error ?? "Failed to process optimization job.",
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
