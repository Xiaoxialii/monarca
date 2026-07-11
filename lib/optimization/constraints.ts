import type { CommerceState, OptimizationCandidate } from "@/lib/optimization/objective";

export type ConstraintViolation =
  | "budget_limit"
  | "inventory_limit"
  | "min_roas"
  | "max_cac"
  | "cash_flow_limit";

export type ConstraintCheck = {
  valid: boolean;
  violations: ConstraintViolation[];
};

export function checkCandidateConstraints(candidate: OptimizationCandidate, state: CommerceState): ConstraintCheck {
  const sku = state.skus.find((row) => row.skuId === candidate.skuId);
  const violations: ConstraintViolation[] = [];

  if (candidate.expectedAdSpend > state.constraints.budgetLimit) violations.push("budget_limit");
  if (sku && candidate.expectedInventoryUse > sku.inventory) violations.push("inventory_limit");
  if (sku?.roas != null && state.constraints.minRoas != null && candidate.action === "SCALE" && sku.roas < state.constraints.minRoas) violations.push("min_roas");
  if (sku?.cac != null && state.constraints.maxCac != null && candidate.action === "SCALE" && sku.cac > state.constraints.maxCac) violations.push("max_cac");
  if (state.constraints.cashFlowLimit != null && candidate.expectedAdSpend > state.constraints.cashFlowLimit) violations.push("cash_flow_limit");

  return {
    valid: violations.length === 0,
    violations
  };
}

export function filterValidCandidates(candidates: OptimizationCandidate[], state: CommerceState) {
  return candidates.filter((candidate) => checkCandidateConstraints(candidate, state).valid);
}

export function budgetConstrainedSelection(candidates: OptimizationCandidate[], budgetLimit: number) {
  const selected: OptimizationCandidate[] = [];
  const usedSkus = new Set<string>();
  let remainingBudget = Math.max(0, budgetLimit);

  for (const candidate of candidates) {
    if (usedSkus.has(candidate.skuId)) continue;
    if (candidate.expectedAdSpend > remainingBudget) continue;
    selected.push(candidate);
    usedSkus.add(candidate.skuId);
    remainingBudget -= candidate.expectedAdSpend;
  }

  return selected;
}
