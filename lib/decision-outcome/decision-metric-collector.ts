import type { PrismaClient } from "@prisma/client";
import {
  collectDecisionExecutionMetric,
  collectDecisionMetricsForRecommendation
} from "@/lib/decision-outcome/closed-loop-service";

export async function collectDecisionMetrics(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    recommendationId: string;
    date?: Date;
    persist?: boolean;
  }
) {
  if (input.persist ?? true) {
    return collectDecisionExecutionMetric(prisma, {
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      date: input.date
    });
  }

  return collectDecisionMetricsForRecommendation(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: input.recommendationId,
    date: input.date
  });
}
