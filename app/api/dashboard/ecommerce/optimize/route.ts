import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { currentDecisionSnapshotVersions } from "@/lib/dashboard/decision-snapshot-lifecycle";
import { canonicalArtifactAvailability } from "@/lib/dashboard/canonical-artifact-availability";
import { markDashboardCachesStale } from "@/lib/dashboard/cache-lifecycle";
import { enqueueSkuOptimizationJob, processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { logWorkspaceContext } from "@/lib/current-workspace-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function optimizationQueueErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/database|prisma|p1001|can't reach database|connection/i.test(message)) {
    return "Optimization could not start because the database connection is unavailable.";
  }
  return message || "Failed to queue optimization refresh.";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER], request);
    logWorkspaceContext("[workspace-context] dashboard.ecommerce.optimize.POST", session);
    const versions = await currentDecisionSnapshotVersions(prisma, {
      workspaceId: session.workspace.id
    });
    const artifact = await canonicalArtifactAvailability(prisma, {
      workspaceId: session.workspace.id
    });

    if (!artifact.available) {
      return NextResponse.json({
        ok: false,
        status: "UNAVAILABLE",
        message: artifact.message,
        refreshSkippedReason: "canonical_artifact_unavailable",
        artifactAvailability: artifact,
        jobId: null,
        versions
      }, { status: 409 });
    }

    const staleSummary = await markDashboardCachesStale(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh"
    });

    const job = await enqueueSkuOptimizationJob(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh",
      decisionMode: "full",
      inputHash: versions.inputHash
    });

    void processJob(job.id).catch((error) => {
      console.error("Failed to start optimization job immediately", { jobId: job.id, error });
    });

    after(() => {
      void processJob(job.id).catch((error) => {
        console.error("Failed to process queued optimization job", { jobId: job.id, error });
      });
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      error: null,
      versions,
      cacheLifecycle: {
        state: "STALE",
        staleSummary
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Failed to queue optimization refresh", error);
    const message = optimizationQueueErrorMessage(error);
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}
