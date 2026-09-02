import { WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import {
  currentDecisionSnapshotVersions,
  decisionSnapshotFreshness
} from "@/lib/dashboard/decision-snapshot-lifecycle";
import { optimizationReadiness } from "@/lib/dashboard/optimization-readiness";
import { markDashboardCachesStale } from "@/lib/dashboard/cache-lifecycle";
import {
  findOptimizationReportCache,
  optimizationReportCachePayload
} from "@/lib/dashboard/optimization-report-cache";
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasOptimizationRecommendationRows(payload: Record<string, unknown>) {
  const report = asRecord(payload.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const decisionRows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const portfolioRows = Array.isArray(optimization.recommended_portfolio) ? optimization.recommended_portfolio : [];

  return decisionRows.length > 0 || portfolioRows.length > 0;
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER], request);
    logWorkspaceContext("[workspace-context] dashboard.ecommerce.optimize.POST", session);
    const versions = await currentDecisionSnapshotVersions(prisma, {
      workspaceId: session.workspace.id
    });
    const readiness = await optimizationReadiness(prisma, {
      workspaceId: session.workspace.id
    });

    if (!readiness.ready) {
      return NextResponse.json({
        ok: false,
        status: "UNAVAILABLE",
        message: readiness.message ?? "Connected data is not ready for optimization.",
        refreshSkippedReason: readiness.code ?? "optimization_not_ready",
        readiness,
        canonical: {
          snapshotId: readiness.canonicalSnapshotId,
          dataVersion: readiness.dataVersion,
          status: readiness.latestObservedStatus?.canonicalStatus ?? null,
          artifactStatus: readiness.artifactStatus
        },
        jobId: null,
        versions
      }, { status: 409 });
    }

    const existingCache = await findOptimizationReportCache(prisma, {
      workspaceId: session.workspace.id,
      mode: "full"
    });
    if (existingCache) {
      const existingPayload = optimizationReportCachePayload(existingCache);
      const freshness = await decisionSnapshotFreshness(prisma, {
        workspaceId: session.workspace.id,
        snapshot: {
          algorithmVersion: existingCache.algorithmVersion,
          optimizationVersion: existingCache.optimizationVersion,
          profitabilityEngineVersion: existingCache.profitabilityEngineVersion,
          canonicalSnapshotVersion: existingCache.canonicalSnapshotVersion,
          metricSnapshotVersion: existingCache.metricSnapshotVersion,
          simulationVersion: existingCache.simulationVersion,
          inputHash: existingCache.inputHash
        }
      });

      if (freshness.isFresh && hasOptimizationRecommendationRows(existingPayload)) {
        if (existingCache.state !== "ready") {
          await prisma.optimizationReportCache.updateMany({
            where: {
              id: existingCache.id,
              workspaceId: session.workspace.id,
              state: { not: "ready" }
            },
            data: {
              state: "ready",
              warning: null
            }
          });
        }

        return NextResponse.json({
          ok: true,
          jobId: null,
          status: "COMPLETED",
          currentStep: "Optimization already ready for the current data version.",
          error: null,
          reusedCache: true,
          versions,
          readiness,
          canonical: {
            snapshotId: readiness.canonicalSnapshotId,
            dataVersion: readiness.dataVersion,
            status: "READY",
            artifactStatus: readiness.artifactStatus
          },
          cacheLifecycle: {
            state: "READY",
            staleSummary: null
          }
        });
      }
    }

    const staleSummary = await markDashboardCachesStale(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh"
    });

    const job = await enqueueSkuOptimizationJob(prisma, {
      workspaceId: session.workspace.id,
      reason: "manual_optimization_refresh",
      decisionMode: "full",
      schemaSnapshotId: readiness.canonicalSnapshotId,
      inputHash: versions.inputHash
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
      readiness,
      canonical: {
        snapshotId: readiness.canonicalSnapshotId,
        dataVersion: readiness.dataVersion,
        status: "READY",
        artifactStatus: readiness.artifactStatus
      },
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
