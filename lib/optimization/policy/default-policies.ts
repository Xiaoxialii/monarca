import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";

export const DEFAULT_OPTIMIZATION_POLICY: OptimizationPolicy = {
  version: "optimization_policy_v1",
  source: "system_default",
  objective: "BALANCED",
  industry: "general ecommerce",
  userBenchmark: {
    roas: 2.5,
    margin: 0.3,
    conversionRate: 0.02,
    inventoryTurnover: 0.18,
    cac: 35
  },
  thresholds: {
    advertising: {
      scaleAds: {
        minimumMarginalRoas: 3.0,
        minimumMargin: 0.35,
        minimumConfidence: 0.7,
        minimumInventoryCoverageDays: 30,
        maximumBudgetIncreasePct: 0.3,
        minimumCustomerQuality: 0.45
      },
      reduceAds: {
        roasThreshold: 1.5,
        minimumConfidence: 0.48
      },
      stopAds: {
        lossThreshold: 0,
        roasThreshold: 1.0
      }
    },
    pricing: {
      maximumIncreasePct: 0.05,
      maximumDecreasePct: 0.1,
      minimumElasticityConfidence: 0.7,
      minimumConversionStability: 0.012,
      minimumMarginHeadroom: 0.22,
      marketGap: 0.1,
      elasticityFloor: -0.5
    },
    inventory: {
      stockoutRiskDays: 14,
      excessInventoryDays: 90,
      minimumInventoryTurnover: 0.12,
      maximumInventoryInvestment: Number.POSITIVE_INFINITY
    },
    channel: {
      minimumFitScore: 0.52,
      minimumConfidence: 0.58,
      minimumMargin: 0.24
    },
    portfolioHealth: {
      minimumProfit: 0,
      minimumConfidence: 0.48,
      recoveryProbability: 0.32
    }
  },
  lifecycle: {
    newProductDays: 30,
    stableProductDays: 45,
    insufficientOrders: 30,
    lowConfidence: 0.55,
    highConfidence: 0.65,
    growthRevenueThreshold: 0.15,
    strongGrowthRevenueThreshold: 0.25,
    declineRevenueThreshold: -0.1,
    strongDeclineRevenueThreshold: -0.15,
    lowRoas: 1.5,
    acceptableRoas: 2,
    highRoas: 3,
    matureMargin: 0.18,
    matureRepeatRate: 0.12,
    inventoryAvailableDays: 14,
    matureCoverageMinDays: 21,
    matureCoverageMaxDays: 90
  },
  lifecycleStrategies: {
    LAUNCH: {
      allowedActions: ["HOLD", "TEST_AD_SPEND", "SHIFT_CHANNEL", "PRICE_DOWN_10", "PROMOTION_TEST"],
      blockedActions: ["SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE"],
      objectiveWeights: { profitGrowth: 0.18, cashEfficiency: 0.22, learningValue: 0.6 }
    },
    GROWTH: {
      allowedActions: ["HOLD", "SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE", "SHIFT_CHANNEL", "CREATE_BUNDLE"],
      blockedActions: ["STOP"],
      objectiveWeights: { profitGrowth: 0.68, cashEfficiency: 0.17, learningValue: 0.15 }
    },
    MATURE: {
      allowedActions: ["HOLD", "PRICE_UP_5", "PRICE_UP_10", "SHIFT_CHANNEL", "CREATE_BUNDLE", "REDUCE_INVENTORY", "REDUCE_ADS", "PROMOTION_TEST", "PRICE_DOWN_10", "RESTOCK_AND_SCALE"],
      blockedActions: ["SCALE_ADS_PRICE_UP_5"],
      objectiveWeights: { profitGrowth: 0.36, cashEfficiency: 0.44, learningValue: 0.2 }
    },
    DECLINING: {
      allowedActions: ["HOLD", "REDUCE_ADS", "PRICE_DOWN_10", "PROMOTION_TEST", "REDUCE_INVENTORY", "STOP"],
      blockedActions: ["SCALE_ADS", "SCALE_ADS_PRICE_UP_5", "RESTOCK_AND_SCALE"],
      objectiveWeights: { profitGrowth: 0.16, cashEfficiency: 0.66, learningValue: 0.18 }
    }
  },
  actionGovernance: {
    "advertising.scaleAds": {
      actions: ["SCALE_ADS", "SCALE_ADS_PRICE_UP_5"],
      requiredSignals: ["marginal_roas", "margin", "confidence", "inventory_coverage"]
    },
    "advertising.testAds": {
      actions: ["TEST_AD_SPEND"],
      requiredSignals: ["learning_value"]
    },
    "advertising.reduceAds": {
      actions: ["REDUCE_ADS"],
      requiredSignals: ["low_roas_or_margin_pressure"]
    },
    "pricing.adjustPrice": {
      actions: ["PRICE_UP_5", "PRICE_UP_10", "PRICE_DOWN_10", "PROMOTION_TEST", "SCALE_ADS_PRICE_UP_5"],
      requiredSignals: ["conversion_stability", "elasticity_confidence"]
    },
    "inventory.restock": {
      actions: ["RESTOCK_AND_SCALE"],
      requiredSignals: ["stockout_coverage", "sales_velocity"]
    },
    "inventory.clearance": {
      actions: ["REDUCE_INVENTORY"],
      requiredSignals: ["excess_inventory", "cash_recovery_quality"]
    },
    "portfolio.stop": {
      actions: ["STOP"],
      requiredSignals: ["loss_or_low_roas"]
    },
    "channel.expand": {
      actions: ["SHIFT_CHANNEL", "CREATE_BUNDLE"],
      requiredSignals: ["channel_fit", "margin"]
    },
    "portfolio.hold": {
      actions: ["HOLD"],
      requiredSignals: ["baseline"]
    }
  },
  portfolioConstraints: {
    SCALE_ADS: { maxSkuShare: 0.25 },
    PRICE_CHANGE: { maxSkuShare: 0.15 },
    CLEARANCE: { maxSkuShare: 0.1 },
    RESTOCK: { maxSkuShare: 0.2 },
    STOP: { maxSkuShare: 0.1 },
    CHANNEL: { maxSkuShare: 0.25 }
  }
};
