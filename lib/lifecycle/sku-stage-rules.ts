import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";
import type { PortfolioAction } from "@/lib/optimization/profit-simulation-engine";

export type LifecycleOptimizationGoal = "VALIDATE_DEMAND" | "SCALE_PROFIT_GROWTH" | "MAXIMIZE_PROFIT_EFFICIENCY" | "REDUCE_LOSSES_RELEASE_CASH";

export type LifecycleStrategy = {
  stage: SkuLifecycleStage;
  goal: LifecycleOptimizationGoal;
  allowed_actions: PortfolioAction[];
  blocked_actions: PortfolioAction[];
  objective_weights: {
    profit_growth: number;
    cash_efficiency: number;
    learning_value: number;
  };
};

export const LIFECYCLE_STAGE_STRATEGIES: Record<SkuLifecycleStage, LifecycleStrategy> = {
  LAUNCH: {
    stage: "LAUNCH",
    goal: "VALIDATE_DEMAND",
    allowed_actions: ["HOLD", "TEST_AD_SPEND", "PRICE_DOWN_10", "PROMOTION_TEST"],
    blocked_actions: ["SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE"],
    objective_weights: {
      profit_growth: 0.18,
      cash_efficiency: 0.22,
      learning_value: 0.6
    }
  },
  GROWTH: {
    stage: "GROWTH",
    goal: "SCALE_PROFIT_GROWTH",
    allowed_actions: ["HOLD", "SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE", "SHIFT_CHANNEL", "CREATE_BUNDLE"],
    blocked_actions: ["STOP"],
    objective_weights: {
      profit_growth: 0.68,
      cash_efficiency: 0.17,
      learning_value: 0.15
    }
  },
  MATURE: {
    stage: "MATURE",
    goal: "MAXIMIZE_PROFIT_EFFICIENCY",
    allowed_actions: ["HOLD", "PRICE_UP_5", "PRICE_UP_10", "SHIFT_CHANNEL", "CREATE_BUNDLE", "REDUCE_INVENTORY"],
    blocked_actions: ["SCALE_ADS_PRICE_UP_5"],
    objective_weights: {
      profit_growth: 0.36,
      cash_efficiency: 0.44,
      learning_value: 0.2
    }
  },
  DECLINING: {
    stage: "DECLINING",
    goal: "REDUCE_LOSSES_RELEASE_CASH",
    allowed_actions: ["HOLD", "REDUCE_ADS", "PRICE_DOWN_10", "PROMOTION_TEST", "REDUCE_INVENTORY", "STOP"],
    blocked_actions: ["SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE"],
    objective_weights: {
      profit_growth: 0.16,
      cash_efficiency: 0.66,
      learning_value: 0.18
    }
  }
};

export function lifecycleStageLabel(stage: SkuLifecycleStage) {
  if (stage === "LAUNCH") return "Launch";
  if (stage === "GROWTH") return "Growth";
  if (stage === "MATURE") return "Mature";
  return "Declining";
}
