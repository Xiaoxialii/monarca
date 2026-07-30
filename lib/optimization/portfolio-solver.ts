import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { PortfolioOptimizationInput, ProfitSimulationResult } from "@/lib/optimization/profit-simulation-engine";
import { assessSelectedInventoryMix } from "@/lib/optimization/inventory-health-score";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import { governanceActionForPortfolioAction } from "@/lib/optimization/policy/optimization-policy";
import type { OptimizationPolicy, PortfolioGovernanceAction } from "@/lib/optimization/policy/optimization-policy-types";

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
  input: PortfolioOptimizationInput,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY
): PortfolioSolverState {
  const skuCount = bySku.size;
  const selected = skuCount > 250 ? solveWithBeamSearch(bySku, input, 64) : solveWithBeamSearch(bySku, input, 128);
  return enforcePortfolioGovernanceCaps(selected, bySku, policy);
}

export function portfolioObjective(state: PortfolioSolverState) {
  const riskPenalty = state.rows.reduce((sum, row) => sum + row.risk * Math.max(1, Math.abs(row.predicted_profit)), 0);
  const channelOverlapCost = channelOverlapPenalty(state.rows);
  const inventoryConstraintCost = state.rows.reduce((sum, row) => sum + Math.max(0, row.required_inventory - row.current_inventory) * Math.max(1, row.current_price * 0.04), 0);
  const uncertaintyCost = state.rows.reduce((sum, row) => sum + (1 - row.confidence) * Math.max(1, Math.abs(row.profit_delta)) * 0.18, 0);
  const confidencePenalty = (1 - state.confidence) * Math.max(0, state.delta) * 0.04;
  const lifecycleValue = lifecyclePortfolioValue(state.rows);
  const lifecycleConcentrationPenalty = lifecycleBudgetConcentrationPenalty(state.rows);
  const actionConcentrationPenalty = portfolioActionConcentrationPenalty(state.rows);
  const scaleAdsPenalty = scaleAdsConcentrationPenalty(state.rows);
  const priceActionPenalty = priceActionConcentrationPenalty(state.rows);
  const clearExcessInventoryPenalty = clearExcessInventoryConcentrationPenalty(state.rows);

  const actionScore = state.rows.reduce((sum, row) => sum + row.action_score, 0);
  return roundCurrency(actionScore + lifecycleValue - lifecycleConcentrationPenalty - actionConcentrationPenalty - scaleAdsPenalty - priceActionPenalty - clearExcessInventoryPenalty - channelOverlapCost - inventoryConstraintCost - riskPenalty * 0.35 - uncertaintyCost * 0.35 - confidencePenalty);
}

export function simulationScore(row: ProfitSimulationResult) {
  return row.action_score + row.opportunity_score * 0.35 + row.confidence * 80 - row.risk * 90 + lifecycleRowScore(row);
}

function lifecyclePortfolioValue(rows: ProfitSimulationResult[]) {
  return rows.reduce((sum, row) => sum + lifecycleRowScore(row), 0);
}

function lifecycleRowScore(row: ProfitSimulationResult) {
  if (!row.lifecycle_stage) return 0;
  const budgetDelta = Math.max(0, row.recommended_ads_spend - row.current_ads_spend);
  if (row.lifecycle_stage === "LAUNCH") {
    return row.action === "TEST_AD_SPEND" ? Math.min(180, 60 + budgetDelta * 0.25) : 20;
  }
  if (row.lifecycle_stage === "GROWTH") {
    return Math.max(0, row.profit_delta) * 0.04;
  }
  if (row.lifecycle_stage === "MATURE") {
    return (row.action.includes("PRICE") || row.action === "SHIFT_CHANNEL" || row.action === "REDUCE_INVENTORY") ? 80 : 20;
  }
  if (row.lifecycle_stage === "DECLINING") {
    return (row.action === "REDUCE_ADS" || row.action === "REDUCE_INVENTORY" || row.action === "STOP") ? 120 : -120;
  }
  return 0;
}

function lifecycleBudgetConcentrationPenalty(rows: ProfitSimulationResult[]) {
  const addedBudget = rows.reduce((sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend), 0);
  if (addedBudget <= 0) return 0;
  const growthBudget = rows
    .filter((row) => row.lifecycle_stage === "GROWTH")
    .reduce((sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend), 0);
  const launchBudget = rows
    .filter((row) => row.lifecycle_stage === "LAUNCH")
    .reduce((sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend), 0);
  const growthShare = growthBudget / addedBudget;
  const missingLaunchTestingPenalty = rows.some((row) => row.lifecycle_stage === "LAUNCH") && launchBudget <= 0 ? 75 : 0;
  return roundCurrency(Math.max(0, growthShare - 0.82) * addedBudget * 0.18 + missingLaunchTestingPenalty);
}

function portfolioActionConcentrationPenalty(rows: ProfitSimulationResult[]) {
  if (rows.length < 3) return 0;
  const totalPositiveScore = rows.reduce((sum, row) => sum + Math.max(0, row.action_score), 0);
  if (totalPositiveScore <= 0) return 0;
  const counts = rows.reduce<Record<string, number>>((map, row) => {
    map[row.unified_action] = (map[row.unified_action] ?? 0) + 1;
    return map;
  }, {});
  const maxShare = Math.max(...Object.values(counts).map((count) => count / rows.length));
  return roundCurrency(Math.max(0, maxShare - 0.55) * totalPositiveScore * 0.18);
}

function scaleAdsConcentrationPenalty(rows: ProfitSimulationResult[]) {
  if (rows.length < 4) return 0;
  const scaleRows = rows.filter((row) => row.unified_action === "SCALE_ADS");
  const scaleRatio = scaleRows.length / rows.length;
  const growthLifecycleShare = rows.filter((row) => row.lifecycle_stage === "GROWTH").length / rows.length;
  const maxRatio = Math.min(0.52, 0.38 + growthLifecycleShare * 0.14);
  if (scaleRatio <= maxRatio) return 0;

  const positiveScore = scaleRows.reduce((sum, row) => sum + Math.max(0, row.action_score), 0);
  return roundCurrency((scaleRatio - maxRatio) * Math.max(500, positiveScore) * 0.85);
}

function priceActionConcentrationPenalty(rows: ProfitSimulationResult[]) {
  if (rows.length < 4) return 0;
  const priceUpRows = rows.filter((row) => row.action === "PRICE_UP_5" || row.action === "PRICE_UP_10" || row.action === "SCALE_ADS_PRICE_UP_5");
  const maxRatio = 0.15;
  const ratio = priceUpRows.length / rows.length;
  if (ratio <= maxRatio) return 0;

  const priceUpPositiveScore = priceUpRows.reduce((sum, row) => sum + Math.max(0, row.action_score), 0);
  return roundCurrency((ratio - maxRatio) * Math.max(250, priceUpPositiveScore) * 1.25);
}

function clearExcessInventoryConcentrationPenalty(rows: ProfitSimulationResult[]) {
  if (rows.length < 4) return 0;
  const health = assessSelectedInventoryMix(rows);
  const maxRatio = health.max_clear_inventory_ratio;
  const ratio = Math.max(
    health.clear_inventory_ratio,
    health.clear_inventory_impact_ratio,
    health.clear_inventory_cash_recovery_ratio * 0.75
  );
  if (ratio <= maxRatio) return 0;

  const clearRows = rows.filter((row) => row.action === "REDUCE_INVENTORY" || row.unified_action === "REDUCE_INVENTORY");
  const positiveScore = clearRows.reduce((sum, row) => sum + Math.max(0, row.action_score), 0);
  const riskAdjustment = health.inventory_risk_level === "HIGH" ? 0.45 : health.inventory_risk_level === "MEDIUM" ? 0.85 : 1.35;
  return roundCurrency((ratio - maxRatio) * Math.max(350, positiveScore) * riskAdjustment);
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

function enforcePortfolioGovernanceCaps(
  state: PortfolioSolverState,
  bySku: Map<string, ProfitSimulationResult[]>,
  policy: OptimizationPolicy
): PortfolioSolverState {
  if (state.rows.length < 2) return state;

  const rows = state.rows.slice();
  for (const governanceAction of Object.keys(policy.portfolioConstraints) as PortfolioGovernanceAction[]) {
    const maxShare = policy.portfolioConstraints[governanceAction]?.maxSkuShare;
    if (!Number.isFinite(maxShare) || maxShare <= 0) continue;
    const maxCount = Math.max(1, Math.floor(rows.length * maxShare));
    const matching = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => governanceActionForPortfolioAction(row.action) === governanceAction)
      .sort((left, right) => right.row.action_score - left.row.action_score || right.row.profit_delta - left.row.profit_delta);
    if (matching.length <= maxCount) continue;

    const overflow = matching.slice(maxCount);
    for (const item of overflow) {
      const replacement = replacementForCappedRow(item.row, bySku, governanceAction);
      if (replacement) rows[item.index] = replacement;
    }
  }

  return stateFromRows(rows);
}

function replacementForCappedRow(
  row: ProfitSimulationResult,
  bySku: Map<string, ProfitSimulationResult[]>,
  cappedAction: PortfolioGovernanceAction
) {
  const candidates = (bySku.get(row.sku) ?? [])
    .filter((candidate) => candidate.sku === row.sku && governanceActionForPortfolioAction(candidate.action) !== cappedAction)
    .sort((left, right) => {
      if (left.action === "HOLD" && right.action !== "HOLD") return -1;
      if (right.action === "HOLD" && left.action !== "HOLD") return 1;
      return simulationScore(right) - simulationScore(left);
    });
  return candidates[0] ?? null;
}

function stateFromRows(rows: ProfitSimulationResult[]): PortfolioSolverState {
  if (!rows.length) return emptyState();
  return {
    rows,
    profit: roundCurrency(rows.reduce((sum, row) => sum + row.predicted_profit, 0)),
    delta: roundCurrency(rows.reduce((sum, row) => sum + row.profit_delta, 0)),
    ads: roundCurrency(rows.reduce((sum, row) => sum + Math.max(0, row.recommended_ads_spend - row.current_ads_spend), 0)),
    inventory: rows.reduce((sum, row) => sum + row.required_inventory, 0),
    cash: roundCurrency(rows.reduce((sum, row) => sum + row.required_cash, 0)),
    confidence: roundRatio(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length)
  };
}
