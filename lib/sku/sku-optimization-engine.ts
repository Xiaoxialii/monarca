import { calculateSkuProfitability } from "../profit/canonical-profitability-engine";

export type SkuOptimizationInputRow = {
  sku: string;
  revenue: number;
  quantity: number;
  price: number;
  cogs: number;
  operating_cost?: number;
  net_profit?: number;
  ads_spend: number;
  inventory: number;
  sales_velocity: number;
  margin: number;
};

export type SkuOptimizationAction =
  | "scale_ads"
  | "reduce_ads"
  | "stop_ads"
  | "raise_price"
  | "replenish_inventory"
  | "hold";

export type SkuOptimizationRow = SkuOptimizationInputRow & {
  unit_profit: number;
  gross_profit: number;
  contribution_profit: number;
  ad_efficiency: number | null;
  inventory_coverage_days: number | null;
  demand_score: number;
  profit_score: number;
  optimization_score: number;
  actions: SkuOptimizationAction[];
  budget_candidate: boolean;
  max_scalable_budget: number;
};

export type SkuBudgetAllocation = {
  sku: string;
  allocated_budget: number;
  expected_incremental_profit: number;
  expected_total_profit: number;
  allocation_rank: number;
  reason_codes: string[];
};

export type SkuOptimizationAlgorithmOutput = {
  version: "sku_profit_maximization_v1";
  objective: "maximize_total_profit";
  budget_constraint: number;
  input_rows: SkuOptimizationInputRow[];
  ranked_skus: SkuOptimizationRow[];
  scale_ads_skus: SkuOptimizationRow[];
  reduce_or_stop_ads_skus: SkuOptimizationRow[];
  raise_price_skus: SkuOptimizationRow[];
  replenish_inventory_skus: SkuOptimizationRow[];
  budget_allocation: SkuBudgetAllocation[];
  expected_portfolio_profit: number;
  constraints: {
    budget_limited: boolean;
    inventory_constrained_skus: string[];
    negative_profit_skus: string[];
  };
};

export function buildSkuOptimizationAlgorithm(input: {
  rows: SkuOptimizationInputRow[];
  total_ad_budget: number;
}): SkuOptimizationAlgorithmOutput {
  const budget = Math.max(0, input.total_ad_budget);
  const rankedSkus = input.rows
    .filter((row) => row.sku)
    .map(scoreSku)
    .sort((left, right) => right.optimization_score - left.optimization_score || right.contribution_profit - left.contribution_profit);
  const budgetAllocation = allocateBudget({ rows: rankedSkus, budget });
  const allocatedProfitBySku = new Map(budgetAllocation.map((row) => [row.sku, row.expected_incremental_profit]));

  return {
    version: "sku_profit_maximization_v1",
    objective: "maximize_total_profit",
    budget_constraint: roundCurrency(budget),
    input_rows: input.rows,
    ranked_skus: rankedSkus,
    scale_ads_skus: rankedSkus.filter((row) => row.actions.includes("scale_ads")),
    reduce_or_stop_ads_skus: rankedSkus.filter((row) => row.actions.includes("reduce_ads") || row.actions.includes("stop_ads")),
    raise_price_skus: rankedSkus.filter((row) => row.actions.includes("raise_price")),
    replenish_inventory_skus: rankedSkus.filter((row) => row.actions.includes("replenish_inventory")),
    budget_allocation: budgetAllocation,
    expected_portfolio_profit: roundCurrency(
      rankedSkus.reduce((sum, row) => sum + row.contribution_profit, 0) +
        Array.from(allocatedProfitBySku.values()).reduce((sum, value) => sum + value, 0)
    ),
    constraints: {
      budget_limited: budgetAllocation.reduce((sum, row) => sum + row.allocated_budget, 0) >= budget && budget > 0,
      inventory_constrained_skus: rankedSkus.filter((row) => row.inventory_coverage_days != null && row.inventory_coverage_days < 14).map((row) => row.sku),
      negative_profit_skus: rankedSkus.filter((row) => row.contribution_profit < 0).map((row) => row.sku)
    }
  };
}

function scoreSku(row: SkuOptimizationInputRow): SkuOptimizationRow {
  const unitRevenue = row.quantity > 0 ? row.revenue / row.quantity : row.price;
  const unitCogs = row.quantity > 0 ? row.cogs / row.quantity : row.cogs;
  const profitability = calculateSkuProfitability({
    revenue: row.revenue,
    cogs: row.cogs,
    fulfillmentCost: row.operating_cost ?? 0,
    adSpend: row.ads_spend
  });
  const unitProfit = roundCurrency(unitRevenue - unitCogs);
  const grossProfit = profitability.gross_profit;
  const contributionProfit = row.net_profit ?? profitability.net_profit;
  const adEfficiency = row.ads_spend > 0 ? roundRatio(profitability.contribution_profit / row.ads_spend) : null;
  const inventoryCoverageDays = row.sales_velocity > 0 ? roundRatio(row.inventory / row.sales_velocity) : null;
  const demandScore = demandSignal(row.quantity, row.sales_velocity, row.inventory);
  const profitScore = profitSignal(row.margin, contributionProfit, adEfficiency);
  const inventoryFactor = inventoryCoverageDays == null ? 0.75 : inventoryCoverageDays < 7 ? 0.35 : inventoryCoverageDays < 14 ? 0.6 : 1;
  const optimizationScore = roundRatio((profitScore * 0.6 + demandScore * 0.4) * inventoryFactor);
  const actions = buildActions({
    row,
    contributionProfit,
    adEfficiency,
    inventoryCoverageDays,
    optimizationScore
  });

  return {
    ...row,
    price: row.price || unitRevenue,
    unit_profit: unitProfit,
    gross_profit: grossProfit,
    contribution_profit: contributionProfit,
    ad_efficiency: adEfficiency,
    inventory_coverage_days: inventoryCoverageDays,
    demand_score: demandScore,
    profit_score: profitScore,
    optimization_score: optimizationScore,
    actions,
    budget_candidate: actions.includes("scale_ads"),
    max_scalable_budget: maxScalableBudget({
      currentAdSpend: row.ads_spend,
      inventory: row.inventory,
      salesVelocity: row.sales_velocity,
      coverage: inventoryCoverageDays,
      adEfficiency
    })
  };
}

function buildActions(input: {
  row: SkuOptimizationInputRow;
  contributionProfit: number;
  adEfficiency: number | null;
  inventoryCoverageDays: number | null;
  optimizationScore: number;
}): SkuOptimizationAction[] {
  const actions = new Set<SkuOptimizationAction>();

  if (input.contributionProfit > 0 && input.row.margin >= 0.2 && (input.adEfficiency == null || input.adEfficiency >= 2) && input.optimizationScore >= 0.55) {
    actions.add("scale_ads");
  }
  if (input.row.ads_spend > 0 && input.adEfficiency != null && input.adEfficiency < 1.2) {
    actions.add(input.contributionProfit < 0 ? "stop_ads" : "reduce_ads");
  }
  if (input.row.revenue > 0 && (input.row.margin < 0.15 || input.contributionProfit < 0)) {
    actions.add("raise_price");
  }
  if (input.row.sales_velocity > 0 && input.inventoryCoverageDays != null && input.inventoryCoverageDays < 14) {
    actions.add("replenish_inventory");
  }
  if (!actions.size) actions.add("hold");

  return Array.from(actions);
}

function allocateBudget(input: { rows: SkuOptimizationRow[]; budget: number }): SkuBudgetAllocation[] {
  let remainingBudget = input.budget;
  const allocations: SkuBudgetAllocation[] = [];
  const candidates = input.rows
    .filter((row) => row.budget_candidate && row.max_scalable_budget > 0)
    .sort((left, right) => marginalProfitRate(right) - marginalProfitRate(left) || right.optimization_score - left.optimization_score);

  for (const row of candidates) {
    if (remainingBudget <= 0) break;
    const allocatedBudget = roundCurrency(Math.min(remainingBudget, row.max_scalable_budget));
    const expectedIncrementalProfit = roundCurrency(allocatedBudget * marginalProfitRate(row));
    allocations.push({
      sku: row.sku,
      allocated_budget: allocatedBudget,
      expected_incremental_profit: expectedIncrementalProfit,
      expected_total_profit: roundCurrency(row.contribution_profit + expectedIncrementalProfit),
      allocation_rank: allocations.length + 1,
      reason_codes: budgetReasonCodes(row)
    });
    remainingBudget = roundCurrency(remainingBudget - allocatedBudget);
  }

  return allocations;
}

function demandSignal(quantity: number, salesVelocity: number, inventory: number) {
  const velocityScore = clamp(salesVelocity / 10, 0, 1);
  const quantityScore = clamp(quantity / 100, 0, 1);
  const inventoryScore = inventory > 0 ? 1 : 0;
  return roundRatio(velocityScore * 0.45 + quantityScore * 0.35 + inventoryScore * 0.2);
}

function profitSignal(margin: number, contributionProfit: number, adEfficiency: number | null) {
  const marginScore = clamp(margin / 0.35, 0, 1);
  const profitScore = contributionProfit > 0 ? 1 : 0;
  const adScore = adEfficiency == null ? 0.75 : clamp(adEfficiency / 4, 0, 1);
  return roundRatio(marginScore * 0.45 + profitScore * 0.3 + adScore * 0.25);
}

function maxScalableBudget(input: {
  currentAdSpend: number;
  inventory: number;
  salesVelocity: number;
  coverage: number | null;
  adEfficiency: number | null;
}) {
  if (input.adEfficiency != null && input.adEfficiency < 2) return 0;
  if (input.inventory <= 0) return 0;
  const base = Math.max(50, input.currentAdSpend || input.salesVelocity * 10);
  const inventoryMultiplier = input.coverage == null ? 0.5 : input.coverage < 14 ? 0.25 : input.coverage > 90 ? 0.6 : 1;
  return roundCurrency(base * inventoryMultiplier);
}

function marginalProfitRate(row: SkuOptimizationRow) {
  const efficiency = row.ad_efficiency ?? 2;
  return roundRatio(Math.max(0, (efficiency - 1) * row.margin * row.optimization_score));
}

function budgetReasonCodes(row: SkuOptimizationRow) {
  const codes = ["positive_contribution_profit", "scalable_margin"];
  if ((row.ad_efficiency ?? 0) >= 2) codes.push("efficient_ad_spend");
  if ((row.inventory_coverage_days ?? 0) >= 14) codes.push("inventory_available");
  if (row.sales_velocity > 0) codes.push("active_demand");
  return codes;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
