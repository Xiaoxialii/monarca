import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspaceId } = await resolveActionSession();
  const actions = await listActionTrackingRecords({ workspaceId });
  const completed = actions.filter((action) => action.status === "completed" || action.status === "learned");
  const accepted = actions.filter((action) => action.status !== "rejected").length;
  const realized = completed.reduce((sum, action) => sum + (action.attribution?.attributed_profit_change ?? 0), 0);
  const accuracy = completed.length
    ? completed.reduce((sum, action) => {
      const expected = (action.predicted_metrics.profit ?? 0) - (action.baseline_metrics.profit ?? 0);
      const actual = action.attribution?.attributed_profit_change ?? ((action.actual_metrics.profit ?? 0) - (action.baseline_metrics.profit ?? 0));
      return sum + Math.max(0, 1 - Math.abs(actual - expected) / Math.max(1, Math.abs(expected)));
    }, 0) / completed.length
    : null;

  return NextResponse.json({
    ok: true,
    performance: {
      total_decisions: actions.length,
      accepted,
      acceptance_rate: actions.length ? accepted / actions.length : 0,
      average_prediction_accuracy: accuracy,
      total_realized_attributed_profit: realized
    }
  });
}
