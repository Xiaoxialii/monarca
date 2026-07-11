import { roundCurrency } from "@/lib/optimization/objective";
import type { SimulationResult } from "@/lib/optimization/simulation-search";

export type JointOptimizationResult = {
  sku: string;
  scenario: string;
  profit: number;
  current_profit: number;
  delta_profit: number;
  beats_single_variable: boolean;
};

export function buildJointOptimizationResults(simulations: SimulationResult[]): JointOptimizationResult[] {
  const bySku = new Map<string, SimulationResult[]>();
  for (const simulation of simulations) {
    bySku.set(simulation.sku, [...(bySku.get(simulation.sku) ?? []), simulation]);
  }

  return Array.from(bySku.entries())
    .map(([sku, rows]) => {
      const joint = rows
        .filter((row) => row.actions.length > 1)
        .sort((left, right) => right.profit - left.profit)[0];
      const single = rows
        .filter((row) => row.actions.length === 1)
        .sort((left, right) => right.profit - left.profit)[0];
      const selected = joint && (!single || joint.profit >= single.profit) ? joint : single;

      return {
        sku,
        scenario: selected?.scenario ?? "HOLD",
        profit: roundCurrency(selected?.profit ?? 0),
        current_profit: roundCurrency(selected?.currentProfit ?? 0),
        delta_profit: roundCurrency(selected?.profitDelta ?? 0),
        beats_single_variable: Boolean(joint && single && joint.profit >= single.profit)
      };
    })
    .sort((left, right) => right.delta_profit - left.delta_profit);
}
