import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { PortfolioOptimizationInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";

export type PortfolioSolverState = {
  rows: ProfitSimulationResult[];
  profit: number;
  delta: number;
  ads: number;
  inventory: number;
  cash: number;
  confidence: number;
};

export function solveGlobalPortfolio(
  bySku: Map<string, ProfitSimulationResult[]>,
  input: PortfolioOptimizationInput
): PortfolioSolverState {
  const skuCount = bySku.size;
  return skuCount > 250 ? solveWithBeamSearch(bySku, input, 64) : solveWithBeamSearch(bySku, input, 128);
}

export function portfolioObjective(state: PortfolioSolverState) {
  const riskPenalty = state.rows.reduce((sum, row) => sum + row.risk * Math.max(1, Math.abs(row.predicted_profit)), 0);
  const channelOverlapCost = channelOverlapPenalty(state.rows);
  const inventoryConstraintCost = state.rows.reduce((sum, row) => sum + Math.max(0, row.required_inventory - row.current_inventory) * Math.max(1, row.current_price * 0.04), 0);
  const uncertaintyCost = state.rows.reduce((sum, row) => sum + (1 - row.confidence) * Math.max(1, Math.abs(row.profit_delta)) * 0.18, 0);
  const confidencePenalty = (1 - state.confidence) * Math.max(0, state.delta) * 0.04;

  return roundCurrency(state.delta - channelOverlapCost - inventoryConstraintCost - riskPenalty - uncertaintyCost - confidencePenalty);
}

export function simulationScore(row: ProfitSimulationResult) {
  return row.opportunity_score + row.profit_delta * 0.25 + row.confidence * 120 - row.risk * 120;
}

function solveWithBeamSearch(
  bySku: Map<string, ProfitSimulationResult[]>,
  input: PortfolioOptimizationInput,
  beamWidth: number
): PortfolioSolverState {
  let beam: PortfolioSolverState[] = [emptyState()];

  for (const [, rows] of bySku) {
    const next: PortfolioSolverState[] = [];
    const stopRow = rows.find((row) => row.action === "STOP");
    const rankedRows = rows
      .slice()
      .sort((left, right) => simulationScore(right) - simulationScore(left))
      .slice(0, 7);
    const candidateRows = stopRow && !rankedRows.some((row) => row.action === "STOP")
      ? [...rankedRows, stopRow]
      : rankedRows;

    for (const state of beam) {
      for (const row of candidateRows) {
        const candidate = appendRow(state, row);
        if (candidate.ads > input.constraints.total_ads_budget) continue;
        if (candidate.inventory > input.constraints.inventory_capacity) continue;
        if (typeof input.constraints.available_cash === "number" && candidate.cash > input.constraints.available_cash) continue;
        next.push(candidate);
      }
    }

    beam = next
      .sort((left, right) => portfolioObjective(right) - portfolioObjective(left))
      .slice(0, beamWidth);
  }

  return beam.sort((left, right) => portfolioObjective(right) - portfolioObjective(left))[0] ?? emptyState();
}

function appendRow(state: PortfolioSolverState, row: ProfitSimulationResult): PortfolioSolverState {
  const nextCount = state.rows.length + 1;
  return {
    rows: [...state.rows, row],
    profit: roundCurrency(state.profit + row.predicted_profit),
    delta: roundCurrency(state.delta + row.profit_delta),
    ads: roundCurrency(state.ads + Math.max(0, row.recommended_ads_spend - row.current_ads_spend)),
    inventory: state.inventory + row.required_inventory,
    cash: roundCurrency(state.cash + row.required_cash),
    confidence: roundRatio((state.confidence * state.rows.length + row.confidence) / nextCount)
  };
}

function channelOverlapPenalty(rows: ProfitSimulationResult[]) {
  const counts = rows.reduce((map, row) => {
    if (!row.channel) return map;
    map.set(row.channel, (map.get(row.channel) ?? 0) + (row.action.includes("AD") || row.action === "SHIFT_CHANNEL" ? 1 : 0));
    return map;
  }, new Map<string, number>());

  return Array.from(counts.values()).reduce((sum, count) => {
    const overlap = Math.max(0, count - 8);
    return sum + overlap * overlap * 45;
  }, 0);
}

function emptyState(): PortfolioSolverState {
  return {
    rows: [],
    profit: 0,
    delta: 0,
    ads: 0,
    inventory: 0,
    cash: 0,
    confidence: 0
  };
}
