import { calculateReward } from "@/lib/feedback/reward-model";
import { defaultPolicyWeights, roundRatio, type PolicyWeights } from "@/lib/optimization/objective";
import type { DecisionOutcome } from "@/lib/feedback/outcome-tracker";

export type PolicyUpdateResult = {
  previousWeights: PolicyWeights;
  nextWeights: PolicyWeights;
  rewards: ReturnType<typeof calculateReward>[];
};

export function updatePolicyWeights(outcomes: DecisionOutcome[], currentWeights: PolicyWeights = defaultPolicyWeights): PolicyUpdateResult {
  const rewards = outcomes.map(calculateReward);
  const avgReward = rewards.length ? rewards.reduce((sum, item) => sum + item.reward, 0) / rewards.length : 0;
  const learningRate = 0.03;
  const multiplier = 1 + Math.max(-0.2, Math.min(0.2, avgReward - 1)) * learningRate;

  return {
    previousWeights: currentWeights,
    nextWeights: {
      profit: roundRatio(currentWeights.profit * multiplier),
      roas: roundRatio(currentWeights.roas * multiplier),
      inventory: currentWeights.inventory,
      cac: currentWeights.cac,
      stability: roundRatio(currentWeights.stability * (avgReward < 0.8 ? 1.02 : 1))
    },
    rewards
  };
}
