import { roundCurrency, roundRatio } from "@/lib/optimization/objective";
import type { SkuLifecycleStage } from "@/lib/lifecycle/lifecycle-score";

export type OptimizationFeedbackRecord = {
  action: string;
  sku: string;
  lifecycle_stage?: SkuLifecycleStage;
  prediction: {
    predicted_profit: number;
    predicted_revenue?: number;
    confidence: number;
  };
  actual_result: {
    actual_profit: number;
    actual_revenue?: number;
  };
  error: number;
  absolute_error: number;
  confidence_adjustment: number;
};

export function recordOptimizationFeedback(input: {
  action: string;
  sku: string;
  lifecycle_stage?: SkuLifecycleStage;
  predicted_profit: number;
  predicted_revenue?: number;
  confidence: number;
  actual_profit: number;
  actual_revenue?: number;
}): OptimizationFeedbackRecord {
  const error = roundCurrency(input.actual_profit - input.predicted_profit);
  const absoluteError = roundCurrency(Math.abs(error));
  const errorRate = roundRatio(absoluteError / Math.max(1, Math.abs(input.predicted_profit)));
  const confidenceAdjustment = roundRatio(Math.max(-0.25, Math.min(0.12, 0.08 - errorRate * 0.4)));

  return {
    action: input.action,
    sku: input.sku,
    lifecycle_stage: input.lifecycle_stage,
    prediction: {
      predicted_profit: roundCurrency(input.predicted_profit),
      predicted_revenue: input.predicted_revenue == null ? undefined : roundCurrency(input.predicted_revenue),
      confidence: roundRatio(input.confidence)
    },
    actual_result: {
      actual_profit: roundCurrency(input.actual_profit),
      actual_revenue: input.actual_revenue == null ? undefined : roundCurrency(input.actual_revenue)
    },
    error,
    absolute_error: absoluteError,
    confidence_adjustment: confidenceAdjustment
  };
}

export function summarizeFeedbackLearning(records: OptimizationFeedbackRecord[]) {
  const meanAbsoluteError = records.length
    ? records.reduce((sum, row) => sum + row.absolute_error, 0) / records.length
    : 0;
  const averageConfidenceAdjustment = records.length
    ? records.reduce((sum, row) => sum + row.confidence_adjustment, 0) / records.length
    : 0;

  return {
    records: records.length,
    mean_absolute_error: roundCurrency(meanAbsoluteError),
    average_confidence_adjustment: roundRatio(averageConfidenceAdjustment)
  };
}
