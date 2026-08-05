import type { BusinessObjective } from "@/lib/optimization/dynamic-threshold-engine";
import type { PortfolioAction } from "@/lib/optimization/profit-simulation-engine";

export type OptimizationPolicySource =
  | "workspace_policy"
  | "ai_learned_thresholds"
  | "optimization_outcome_history"
  | "user_historical"
  | "industry_benchmark"
  | "business_objective"
  | "system_default";

export type PortfolioGovernanceAction = "SCALE_ADS" | "PRICE_CHANGE" | "CLEARANCE" | "RESTOCK" | "STOP" | "CHANNEL";

export type ActionPolicyRule =
  | "advertising.scaleAds"
  | "advertising.testAds"
  | "advertising.reduceAds"
  | "pricing.adjustPrice"
  | "inventory.restock"
  | "inventory.clearance"
  | "portfolio.stop"
  | "channel.expand"
  | "portfolio.hold";

export type OptimizationPolicy = {
  version: string;
  source: OptimizationPolicySource;
  objective: BusinessObjective;
  industry: string;
  userBenchmark: {
    roas: number;
    margin: number;
    conversionRate: number;
    inventoryTurnover: number;
    cac: number;
  };
  thresholds: {
    advertising: {
      scaleAds: {
        minimumMarginalRoas: number;
        minimumMargin: number;
        minimumConfidence: number;
        minimumInventoryCoverageDays: number;
        maximumBudgetIncreasePct: number;
        minimumCustomerQuality: number;
        roasAnomalyThreshold?: number;
      };
      reduceAds: {
        roasThreshold: number;
        minimumConfidence: number;
      };
      stopAds: {
        lossThreshold: number;
        roasThreshold: number;
      };
    };
    pricing: {
      maximumIncreasePct: number;
      maximumDecreasePct: number;
      minimumElasticityConfidence: number;
      minimumConversionStability: number;
      minimumMarginHeadroom: number;
      marketGap: number;
      elasticityFloor: number;
    };
    inventory: {
      stockoutRiskDays: number;
      excessInventoryDays: number;
      minimumInventoryTurnover: number;
      maximumInventoryInvestment: number;
    };
    channel: {
      minimumFitScore: number;
      minimumConfidence: number;
      minimumMargin: number;
    };
    portfolioHealth: {
      minimumProfit: number;
      minimumConfidence: number;
      recoveryProbability: number;
    };
  };
  lifecycle: {
    newProductDays: number;
    stableProductDays: number;
    insufficientOrders: number;
    lowConfidence: number;
    highConfidence: number;
    growthRevenueThreshold: number;
    strongGrowthRevenueThreshold: number;
    declineRevenueThreshold: number;
    strongDeclineRevenueThreshold: number;
    lowRoas: number;
    acceptableRoas: number;
    highRoas: number;
    matureMargin: number;
    matureRepeatRate: number;
    inventoryAvailableDays: number;
    matureCoverageMinDays: number;
    matureCoverageMaxDays: number;
  };
  lifecycleStrategies: Record<string, {
    allowedActions: PortfolioAction[];
    blockedActions: PortfolioAction[];
    objectiveWeights: {
      profitGrowth: number;
      cashEfficiency: number;
      learningValue: number;
    };
  }>;
  actionGovernance: Record<ActionPolicyRule, {
    actions: PortfolioAction[];
    requiredSignals: string[];
  }>;
  portfolioConstraints: Record<PortfolioGovernanceAction, {
    maxSkuShare: number;
  }>;
};

export type OptimizationPolicyOverride = Partial<OptimizationPolicy> & {
  thresholds?: Partial<OptimizationPolicy["thresholds"]> & {
    advertising?: Partial<OptimizationPolicy["thresholds"]["advertising"]> & {
      scaleAds?: Partial<OptimizationPolicy["thresholds"]["advertising"]["scaleAds"]>;
      reduceAds?: Partial<OptimizationPolicy["thresholds"]["advertising"]["reduceAds"]>;
      stopAds?: Partial<OptimizationPolicy["thresholds"]["advertising"]["stopAds"]>;
    };
    pricing?: Partial<OptimizationPolicy["thresholds"]["pricing"]>;
    inventory?: Partial<OptimizationPolicy["thresholds"]["inventory"]>;
    channel?: Partial<OptimizationPolicy["thresholds"]["channel"]>;
    portfolioHealth?: Partial<OptimizationPolicy["thresholds"]["portfolioHealth"]>;
  };
  lifecycle?: Partial<OptimizationPolicy["lifecycle"]>;
  portfolioConstraints?: Partial<Record<PortfolioGovernanceAction, Partial<{ maxSkuShare: number }>>>;
};

export type ActionEligibilityResult = {
  action: PortfolioAction;
  policyRule: ActionPolicyRule;
  allowed: boolean;
  reasons: string[];
  rejectedReasons: string[];
  thresholds: Record<string, number | string | boolean>;
  metrics: Record<string, number | string | boolean | null>;
};

export type PolicyTrace = {
  policyVersion: string;
  policySource: OptimizationPolicySource;
  policyRule: ActionPolicyRule;
  thresholds: Record<string, number | string | boolean>;
  metrics: Record<string, number | string | boolean | null>;
  passedRules: string[];
  failedRules: string[];
};
