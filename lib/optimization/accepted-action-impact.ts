import type { AcceptedActionImpact, ActionMetricsSnapshot } from "@/lib/optimization/action-tracking-types";

export function calculateAcceptedActionImpact(input: {
  baseline_metrics: ActionMetricsSnapshot;
  predicted_metrics: ActionMetricsSnapshot;
  actual_metrics: ActionMetricsSnapshot;
}): AcceptedActionImpact {
  const baseline = input.baseline_metrics;
  const predicted = input.predicted_metrics;
  const actual = input.actual_metrics;
  const baselineInventory = metricNumber(baseline.inventory ?? baseline.stock);
  const actualInventory = metricNumber(actual.inventory ?? actual.stock);
  const expectedProfitDelta = metricNumber(predicted.profit_delta ?? (
    predicted.profit != null && baseline.profit != null ? metricNumber(predicted.profit) - metricNumber(baseline.profit) : 0
  ));
  const actualProfitDelta = actual.profit != null && baseline.profit != null
    ? roundMoney(metricNumber(actual.profit) - metricNumber(baseline.profit))
    : metricNumber(actual.profit_delta);
  const tolerance = Math.max(25, Math.abs(expectedProfitDelta) * 0.1);

  return {
    revenue_change: roundMoney(metricNumber(actual.revenue) - metricNumber(baseline.revenue)),
    profit_change: actualProfitDelta,
    margin_change: roundMoney(metricNumber(actual.margin) - metricNumber(baseline.margin)),
    ads_change: roundMoney(metricNumber(actual.ad_spend) - metricNumber(baseline.ad_spend)),
    inventory_change: roundMoney(actualInventory - baselineInventory),
    expected_profit_delta: roundMoney(expectedProfitDelta),
    actual_profit_delta: roundMoney(actualProfitDelta),
    performance_status: actualProfitDelta >= expectedProfitDelta + tolerance
      ? "OUTPERFORMED"
      : actualProfitDelta < expectedProfitDelta - tolerance
        ? "UNDERPERFORMED"
        : "MATCHED"
  };
}

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
