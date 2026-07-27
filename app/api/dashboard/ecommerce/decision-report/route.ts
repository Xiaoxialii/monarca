import { after, NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { decisionSnapshotFreshness } from "@/lib/dashboard/decision-snapshot-lifecycle";
import {
  findLatestDecisionSnapshot,
  snapshotPerformance
} from "@/lib/dashboard/snapshot-store";
import {
  findOptimizationReportCache,
  optimizationReportCachePayload
} from "@/lib/dashboard/optimization-report-cache";
import { enqueueSkuOptimizationJob, processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but operating reports need sales/order history, order line items, refunds, customers, inventory, unit costs, fulfillment costs, and ad spend to generate reliable KPIs and recommendations.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateToIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const decisionMode = url.searchParams.get("mode") === "sku" ? "sku" : "full";
  const optimizationType = decisionMode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION";

  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] dashboard.ecommerce.decision-report.GET", session);

  const reportCache = await findOptimizationReportCache(prisma, {
    workspaceId: session.workspace.id,
    mode: decisionMode
  });

  if (reportCache) {
    const cachedPayload = optimizationReportCachePayload(reportCache);
    const freshness = await decisionSnapshotFreshness(prisma, {
      workspaceId: session.workspace.id,
      snapshot: {
        algorithmVersion: reportCache.algorithmVersion,
        optimizationVersion: reportCache.optimizationVersion,
        canonicalSnapshotVersion: reportCache.canonicalSnapshotVersion,
        metricSnapshotVersion: reportCache.metricSnapshotVersion,
        simulationVersion: reportCache.simulationVersion,
        inputHash: reportCache.inputHash
      }
    });

    if (!freshness.isFresh) {
      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_report_cache:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process stale decision report cache refresh job", error);
        });
      });

      return NextResponse.json({
        ...cachedPayload,
        ok: true,
        state: "stale",
        status: "STALE",
        latestSnapshot: false,
        message: "Optimization snapshot is stale. A refresh job has been queued.",
        staleReason: freshness.reason,
        jobId: job.id,
        currentVersions: freshness.current,
        snapshot: {
          id: reportCache.id,
          type: "OptimizationReportCache",
          createdAt: dateToIso(reportCache.createdAt),
          updatedAt: dateToIso(reportCache.updatedAt),
          stale: true
        },
        performance: snapshotPerformance(startedAt, "snapshot")
      });
    }

    return NextResponse.json({
      ...cachedPayload,
      snapshot: {
        id: reportCache.id,
        type: "OptimizationReportCache",
        createdAt: dateToIso(reportCache.createdAt),
        updatedAt: dateToIso(reportCache.updatedAt),
        latestSnapshot: true
      },
      performance: snapshotPerformance(startedAt, "snapshot")
    });
  }

  const snapshot = await findLatestDecisionSnapshot(prisma, {
    workspaceId: session.workspace.id,
    optimizationType
  });

  const recommendationsJson = asRecord(snapshot?.recommendationsJson);

  if (snapshot && Object.keys(recommendationsJson).length) {
    const freshness = await decisionSnapshotFreshness(prisma, {
      workspaceId: session.workspace.id,
      snapshot: {
        algorithmVersion: typeof snapshot.algorithmVersion === "string" ? snapshot.algorithmVersion : null,
        optimizationVersion: typeof snapshot.optimizationVersion === "string" ? snapshot.optimizationVersion : null,
        canonicalSnapshotVersion: typeof snapshot.canonicalSnapshotVersion === "string" ? snapshot.canonicalSnapshotVersion : null,
        metricSnapshotVersion: typeof snapshot.metricSnapshotVersion === "string" ? snapshot.metricSnapshotVersion : null,
        simulationVersion: typeof snapshot.simulationVersion === "string" ? snapshot.simulationVersion : null,
        inputHash: typeof snapshot.inputHash === "string" ? snapshot.inputHash : null
      }
    });

    if (!freshness.isFresh) {
      const job = await enqueueSkuOptimizationJob(prisma, {
        workspaceId: session.workspace.id,
        reason: `stale_decision_snapshot:${freshness.reason ?? "unknown"}`,
        decisionMode,
        inputHash: freshness.current.inputHash
      });

      after(() => {
        void processJob(job.id).catch((error) => {
          console.error("Failed to process stale decision snapshot refresh job", error);
        });
      });

      return NextResponse.json({
        ...recommendationsJson,
        ok: true,
        state: "stale",
        status: "STALE",
        latestSnapshot: false,
        message: "Optimization snapshot is stale. A refresh job has been queued.",
        staleReason: freshness.reason,
        jobId: job.id,
        currentVersions: freshness.current,
        snapshot: {
          id: snapshot.id,
          type: "DecisionSnapshot",
          createdAt: dateToIso(snapshot.createdAt),
          stale: true
        },
        performance: snapshotPerformance(startedAt, "snapshot")
      });
    }

    return NextResponse.json({
      ...recommendationsJson,
      snapshot: {
        id: snapshot.id,
        type: "DecisionSnapshot",
        createdAt: dateToIso(snapshot.createdAt),
        latestSnapshot: true,
        algorithmVersion: snapshot.algorithmVersion,
        optimizationVersion: snapshot.optimizationVersion,
        canonicalSnapshotVersion: snapshot.canonicalSnapshotVersion,
        metricSnapshotVersion: snapshot.metricSnapshotVersion,
        simulationVersion: snapshot.simulationVersion,
        inputHash: snapshot.inputHash,
        generatedAt: snapshot.generatedAt instanceof Date ? snapshot.generatedAt.toISOString() : null
      },
      performance: snapshotPerformance(startedAt, "snapshot")
    });
  }

  return NextResponse.json({
    ok: true,
    state: "empty",
    hasConnectedDataSource: false,
    message: OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE,
    decision_report: null,
    portfolioSummary: null,
    allocationRecommendation: null,
    skuDecisions: [],
    riskAlerts: [],
    executionPlan: [],
    generated_at: null,
    source_platforms: [],
    lineage: null,
    missingDataRequirements: [
      "sales_order_history",
      "order_line_items",
      "refunds",
      "customers",
      "inventory",
      "unit_costs",
      "fulfillment_costs",
      "ad_spend"
    ],
    warning: "DECISION_SNAPSHOT_MISS",
    performance: snapshotPerformance(startedAt, "snapshot")
  });
}
