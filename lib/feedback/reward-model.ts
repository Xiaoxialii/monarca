import { roundRatio } from "@/lib/optimization/objective";
import type { DecisionOutcome } from "@/lib/feedback/outcome-tracker";

export type RewardResult = {
  reward: number;
  predictionError: number;
};

export function calculateReward(outcome: DecisionOutcome): RewardResult {
  const predictionError = outcome.actualProfitImpact - outcome.predictedProfitImpact;
  const reward = outcome.predictedProfitImpact === 0
    ? Math.sign(outcome.actualProfitImpact)
    : outcome.actualProfitImpact / Math.abs(outcome.predictedProfitImpact);

  return {
    reward: roundRatio(reward),
    predictionError: roundRatio(predictionError)
  };
}
