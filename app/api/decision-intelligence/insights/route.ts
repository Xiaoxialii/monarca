import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const [learningRows, outcomeAggregate, decisionCount] = await Promise.all([
      prisma.decisionLearning.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 500
      }),
      prisma.decisionOutcome.aggregate({
        where: {
          recommendation: { workspaceId },
          status: "CALCULATED"
        },
        _sum: { attributedProfitChange: true },
        _avg: { accuracy: true }
      }),
      prisma.optimizationDecision.count({ where: { workspaceId } })
    ]);

    const byPattern = new Map<string, { pattern: string; count: number; successCount: number; profit: number; accuracy: number }>();
    for (const row of learningRows) {
      const pattern = row.learningPattern ?? String(asRecord(row.learningJson).pattern ?? row.actionType);
      const current = byPattern.get(pattern) ?? { pattern, count: 0, successCount: 0, profit: 0, accuracy: 0 };
      current.count += 1;
      current.successCount += row.success ? 1 : 0;
      current.profit += row.incrementalProfit;
      current.accuracy += row.accuracyScore;
      byPattern.set(pattern, current);
    }

    const topWinningPatterns = Array.from(byPattern.values())
      .filter((row) => row.profit > 0 || row.successCount > 0)
      .sort((left, right) => right.profit - left.profit || right.successCount - left.successCount)
      .slice(0, 10)
      .map((row) => ({
        pattern: row.pattern,
        count: row.count,
        successRate: row.count ? row.successCount / row.count : 0,
        averageAccuracy: row.count ? row.accuracy / row.count : 0,
        totalIncrementalProfit: Math.round(row.profit * 100) / 100
      }));

    return NextResponse.json({
      ok: true,
      totalDecisions: decisionCount,
      totalRealizedProfit: Math.round((outcomeAggregate._sum.attributedProfitChange ?? 0) * 100) / 100,
      averageAccuracy: outcomeAggregate._avg.accuracy ?? null,
      topWinningPatterns
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
