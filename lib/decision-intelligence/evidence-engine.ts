import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";

export type AIEvidenceType =
  | "profit_signal"
  | "demand_signal"
  | "inventory_signal"
  | "ads_signal"
  | "lifecycle_signal";

export type AIEvidenceImpact = "positive" | "negative" | "risk" | "pass" | "neutral";

export type AIEvidenceCard = {
  type: AIEvidenceType;
  metric: string;
  current_value: number | string;
  benchmark?: number | string | null;
  impact: AIEvidenceImpact;
  label: string;
  detail: string;
};

export function buildAIEvidence(input: {
  simulation: ProfitSimulationResult;
  portfolioMarginBenchmark?: number;
  lifecycle?: SkuLifecycleClassification;
}): AIEvidenceCard[] {
  const row = input.simulation;
  const marginBenchmark = input.portfolioMarginBenchmark ?? 0.274;
  const roas = row.current_ads_spend > 0 ? row.before_state.revenue / Math.max(1, row.current_ads_spend) : null;
  const revenueGrowth = row.before_state.revenue > 0 ? row.revenue_delta / row.before_state.revenue : 0;
  const dailyDemand = row.required_inventory > 0 ? row.required_inventory / Math.max(1, row.simulation_horizon.days) : 0;
  const coverage = dailyDemand > 0 ? row.current_inventory / dailyDemand : null;

  return [
    {
      type: "demand_signal",
      metric: "revenue_growth",
      current_value: formatSignedPercent(revenueGrowth),
      benchmark: "0%",
      impact: revenueGrowth >= 0 ? "positive" : "risk",
      label: "Demand Signal",
      detail: `Revenue simulation ${formatSignedPercent(revenueGrowth)} over ${row.simulation_horizon.label}.`
    },
    {
      type: "profit_signal",
      metric: "margin",
      current_value: roundRatio(row.before_state.margin * 100),
      benchmark: roundRatio(marginBenchmark * 100),
      impact: row.before_state.margin >= marginBenchmark ? "positive" : "risk",
      label: "Profit Signal",
      detail: `Margin ${formatPercent(row.before_state.margin)} vs benchmark ${formatPercent(marginBenchmark)}.`
    },
    {
      type: "ads_signal",
      metric: "ROAS",
      current_value: roas === null ? "unavailable" : roundRatio(roas),
      benchmark: 2,
      impact: roas === null ? "neutral" : roas >= 2 ? "positive" : "risk",
      label: "Ads Signal",
      detail: roas === null ? "No direct ads history available." : `Revenue/ad-spend signal is ${roundRatio(roas)}x.`
    },
    {
      type: "inventory_signal",
      metric: "inventory_coverage",
      current_value: coverage === null ? "needs validation" : `${roundRatio(coverage)} days`,
      benchmark: `${row.simulation_horizon.days} days`,
      impact: coverage === null ? "neutral" : coverage >= row.simulation_horizon.days ? "pass" : "risk",
      label: "Inventory Signal",
      detail: coverage === null
        ? "Inventory coverage needs validation before scale."
        : `Coverage ${roundRatio(coverage)} days for simulated demand.`
    },
    {
      type: "lifecycle_signal",
      metric: "lifecycle_stage",
      current_value: input.lifecycle?.lifecycle_stage ?? row.lifecycle_stage ?? "UNKNOWN",
      benchmark: input.lifecycle?.optimization_goal ?? "stage strategy",
      impact: "positive",
      label: "Lifecycle Strategy",
      detail: `${input.lifecycle?.lifecycle_stage ?? row.lifecycle_stage ?? "SKU"} strategy fit score ${roundRatio(row.strategic_fit)}.`
    },
    {
      type: "profit_signal",
      metric: "expected_incremental_profit",
      current_value: roundCurrency(row.profit_delta),
      benchmark: `${row.simulation_horizon.days} days`,
      impact: row.profit_delta > 0 ? "positive" : "risk",
      label: "Profit Impact",
      detail: `Estimated incremental profit ${formatSignedCurrency(row.profit_delta)} / ${row.simulation_horizon.label}.`
    }
  ];
}

function formatSignedPercent(value: number) {
  const rounded = roundRatio(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatPercent(value: number) {
  return `${roundRatio(value * 100)}%`;
}

function formatSignedCurrency(value: number) {
  const rounded = roundCurrency(value);
  return `${rounded >= 0 ? "+" : "-"}$${Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
