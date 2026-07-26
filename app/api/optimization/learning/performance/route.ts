import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { prisma } from "@/lib/prisma";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

type OptimizationDecisionRow = {
  decisionStatus?: string;
  actualProfitChange?: number | null;
  attributedProfitChange?: number | null;
};

type OptimizationLearningRow = {
  action?: string;
  prediction?: number | null;
  actual?: number | null;
  error?: number | null;
};

type PrismaWithOptimizationLearning = typeof prisma & {
  optimizationDecision: {
    findMany(args: unknown): Promise<OptimizationDecisionRow[]>;
  };
  optimizationLearningRecord: {
    findMany(args: unknown): Promise<OptimizationLearningRow[]>;
  };
};

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const [decisions, learningRecords] = await Promise.all([
      (prisma as PrismaWithOptimizationLearning).optimizationDecision.findMany({ where: { workspaceId } }),
      (prisma as PrismaWithOptimizationLearning).optimizationLearningRecord.findMany({ where: { workspaceId } })
    ]);
    const accepted = decisions.filter((row) => row.decisionStatus === "ACCEPTED").length;
    const realizedProfit = decisions.reduce((sum, row) => sum + Math.max(0, row.attributedProfitChange ?? row.actualProfitChange ?? 0), 0);
    const learned = learningRecords.filter((row) => Number.isFinite(row.error));
    const averageAccuracy = learned.length
      ? learned.reduce((sum, row) => sum + Math.max(0, 1 - Math.abs(row.error ?? 0) / Math.max(1, Math.abs(row.prediction ?? 0))), 0) / learned.length
      : null;
    const byAction = actionPerformance(learningRecords);

    return NextResponse.json({
      ok: true,
      performance: {
        total_decisions: decisions.length,
        accepted,
        acceptance_rate: decisions.length ? accepted / decisions.length : 0,
        average_prediction_accuracy: averageAccuracy,
        total_realized_profit: realizedProfit,
        action_performance: byAction
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    const { workspaceId } = await resolveActionSession(request);
    const actions = await listActionTrackingRecords({ workspaceId });
    const accepted = actions.filter((row) => row.status !== "rejected").length;
    return NextResponse.json({
      ok: true,
      performance: {
        total_decisions: actions.length,
        accepted,
        acceptance_rate: actions.length ? accepted / actions.length : 0,
        average_prediction_accuracy: null,
        total_realized_profit: actions.reduce((sum, row) => sum + Math.max(0, (row.actual_metrics.profit ?? 0) - (row.baseline_metrics.profit ?? 0)), 0),
        action_performance: {}
      }
    });
  }
}

function actionPerformance(records: OptimizationLearningRow[]) {
  return records.reduce<Record<string, { count: number; average_accuracy: number }>>((summary, row) => {
    const action = String(row.action ?? "UNKNOWN");
    const accuracy = Math.max(0, 1 - Math.abs(row.error ?? 0) / Math.max(1, Math.abs(row.prediction ?? 0)));
    const current = summary[action] ?? { count: 0, average_accuracy: 0 };
    const nextCount = current.count + 1;
    summary[action] = {
      count: nextCount,
      average_accuracy: (current.average_accuracy * current.count + accuracy) / nextCount
    };
    return summary;
  }, {});
}
