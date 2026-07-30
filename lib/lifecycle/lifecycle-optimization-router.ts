import { LIFECYCLE_STAGE_STRATEGIES, type LifecycleStrategy } from "@/lib/lifecycle/sku-stage-rules";
import type { SkuLifecycleClassification } from "@/lib/lifecycle/sku-lifecycle-classifier";
import type { PortfolioAction } from "@/lib/optimization/profit-simulation-engine";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import type { OptimizationPolicy } from "@/lib/optimization/policy/optimization-policy-types";

export function routeLifecycleOptimization(lifecycle: SkuLifecycleClassification): LifecycleStrategy {
  return LIFECYCLE_STAGE_STRATEGIES[lifecycle.lifecycle_stage];
}

export function isActionAllowedForLifecycle(action: PortfolioAction, lifecycle: SkuLifecycleClassification, policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY) {
  const policyStrategy = policy.lifecycleStrategies[lifecycle.lifecycle_stage];
  if (policyStrategy) {
    return policyStrategy.allowedActions.includes(action) && !policyStrategy.blockedActions.includes(action);
  }
  const strategy = routeLifecycleOptimization(lifecycle);
  return strategy.allowed_actions.includes(action) && !strategy.blocked_actions.includes(action);
}

export function lifecycleActionReason(action: PortfolioAction, lifecycle: SkuLifecycleClassification, policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY) {
  const strategy = routeLifecycleOptimization(lifecycle);
  if (isActionAllowedForLifecycle(action, lifecycle, policy)) {
    return `${lifecycle.lifecycle_stage.toLowerCase()} strategy:${strategy.goal.toLowerCase()}`;
  }
  return `${action} blocked for ${lifecycle.lifecycle_stage.toLowerCase()} lifecycle`;
}
