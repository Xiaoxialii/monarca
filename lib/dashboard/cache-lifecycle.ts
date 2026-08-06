import type { PrismaClient } from "@prisma/client";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "../profit/canonical-profitability-engine";

export async function markDashboardCachesStale(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    reason: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const staleTag = `stale:${input.reason}:${CANONICAL_PROFITABILITY_ENGINE_VERSION}:${now.toISOString()}`;

  const [reportMetricCaches, optimizationReportCaches, decisionSnapshots, reportSnapshots] = await Promise.all([
    prisma.reportMetricCache.updateMany({
      where: { workspaceId: input.workspaceId },
      data: {
        refreshStatus: "stale",
        staleAt: now
      }
    }).catch(() => ({ count: 0 })),
    prisma.optimizationReportCache.updateMany({
      where: {
        workspaceId: input.workspaceId,
        state: { notIn: ["rebuilding", "REBUILDING"] }
      },
      data: {
        state: "stale",
        warning: staleTag
      }
    }).catch(() => ({ count: 0 })),
    prisma.decisionSnapshot.updateMany({
      where: {
        workspaceId: input.workspaceId,
        snapshotType: "optimization_report"
      },
      data: {
        inputHash: staleTag
      }
    }).catch(() => ({ count: 0 })),
    prisma.reportSnapshot.updateMany({
      where: { workspaceId: input.workspaceId },
      data: {
        warning: staleTag
      }
    }).catch(() => ({ count: 0 }))
  ]);

  return {
    staleTag,
    reportMetricCaches: reportMetricCaches.count,
    optimizationReportCaches: optimizationReportCaches.count,
    decisionSnapshots: decisionSnapshots.count,
    reportSnapshots: reportSnapshots.count
  };
}
