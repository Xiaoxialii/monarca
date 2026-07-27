export type CanonicalOptimizationAction =
  | "RESTOCK_INVENTORY"
  | "SCALE_ADS"
  | "REDUCE_ADS"
  | "CLEAR_EXCESS_INVENTORY"
  | "HOLD";

export type CanonicalOptimizationGroup = "GROWTH" | "INVENTORY" | "PORTFOLIO_HEALTH";

export function canonicalOptimizationAction(input: {
  sourceAction?: string | null;
  action?: string | null;
  unifiedAction?: string | null;
  canonicalAction?: string | null;
  inventoryRisk?: boolean | null;
  requiredInventory?: number | null;
  currentInventory?: number | null;
  recommendedText?: string | null;
}): CanonicalOptimizationAction | null {
  if (isCanonicalOptimizationAction(input.canonicalAction)) return input.canonicalAction;

  const sourceAction = normalizeAction(input.sourceAction);
  const action = normalizeAction(input.action);
  const unifiedAction = normalizeAction(input.unifiedAction);
  const recommendedText = `${input.recommendedText ?? ""}`.toLowerCase();
  const hasInventoryGap = Boolean(input.inventoryRisk) || (
    typeof input.requiredInventory === "number" &&
    typeof input.currentInventory === "number" &&
    input.requiredInventory > input.currentInventory
  );

  if (sourceAction === "HOLD" || action === "HOLD" || action === "MONITOR" || unifiedAction === "HOLD") return "HOLD";
  if (sourceAction === "REDUCE_INVENTORY" || unifiedAction === "REDUCE_INVENTORY" || recommendedText.includes("clear excess inventory")) return "CLEAR_EXCESS_INVENTORY";
  if (sourceAction === "REDUCE_ADS" || action === "REDUCE_ADS" || unifiedAction === "REDUCE_WASTE" || unifiedAction === "REALLOCATE_BUDGET") return "REDUCE_ADS";

  if (sourceAction === "RESTOCK_AND_SCALE" || sourceAction.includes("RESTOCK") || unifiedAction === "RESTOCK") {
    return hasInventoryGap ? "RESTOCK_INVENTORY" : "SCALE_ADS";
  }

  if (sourceAction.includes("SCALE") || action === "SCALE" || unifiedAction === "SCALE_ADS") return "SCALE_ADS";

  return null;
}

export function isCanonicalOptimizationAction(value: unknown): value is CanonicalOptimizationAction {
  return value === "RESTOCK_INVENTORY" ||
    value === "SCALE_ADS" ||
    value === "REDUCE_ADS" ||
    value === "CLEAR_EXCESS_INVENTORY" ||
    value === "HOLD";
}

export function canonicalOptimizationGroup(action: CanonicalOptimizationAction): {
  goal: CanonicalOptimizationGroup;
  actionLabel: string;
} {
  if (action === "SCALE_ADS") return { goal: "GROWTH", actionLabel: "Scale Ads" };
  if (action === "RESTOCK_INVENTORY") return { goal: "INVENTORY", actionLabel: "Restock Inventory" };
  if (action === "CLEAR_EXCESS_INVENTORY") return { goal: "INVENTORY", actionLabel: "Clear Excess Inventory" };
  if (action === "REDUCE_ADS") return { goal: "PORTFOLIO_HEALTH", actionLabel: "Reduce Ad Waste" };
  return { goal: "PORTFOLIO_HEALTH", actionLabel: "No Action Required" };
}

function normalizeAction(value: string | null | undefined) {
  return `${value ?? ""}`.trim().toUpperCase();
}
