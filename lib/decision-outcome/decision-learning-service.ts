import type { PrismaClient } from "@prisma/client";

export type DecisionLearningContext = {
  workspaceId: string;
  actionType: string;
  sku?: string | null;
  category?: string | null;
  margin?: number | null;
  roas?: number | null;
  inventoryDays?: number | null;
  salesVelocity?: number | null;
  expectedProfit?: number | null;
  confidence?: number | null;
};

export type HistoricalDecisionInsights = {
  historicalSuccessRate: number | null;
  averageProfitImpact: number;
  confidenceAdjustment: number;
  recommendedActionScore: number;
  similarDecisionCount: number;
  historicalEvidence: Array<{
    actionType: string;
    incrementalProfit: number;
    accuracyScore: number;
    success: boolean;
    createdAt: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAction(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

function bounded(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function closeness(a: number | null | undefined, b: number | null | undefined, tolerance: number) {
  if (typeof a !== "number" || typeof b !== "number") return 0.35;
  return bounded(1 - Math.abs(a - b) / Math.max(tolerance, Math.abs(a), Math.abs(b), 1), 0, 1);
}

function rowSimilarity(context: DecisionLearningContext, row: { featureSnapshot: unknown; actionType: string }) {
  const feature = asRecord(row.featureSnapshot);
  const skuMatch = context.sku && typeof feature.sku === "string" && feature.sku === context.sku ? 0.18 : 0;
  const categoryMatch = context.category && typeof feature.category === "string" && feature.category === context.category ? 0.12 : 0;
  const marginScore = closeness(context.margin, toNumber(feature.margin), 0.2) * 0.22;
  const roasScore = closeness(context.roas, toNumber(feature.roas), 2) * 0.22;
  const inventoryScore = closeness(context.inventoryDays, toNumber(feature.inventoryDays), 60) * 0.14;
  const velocityScore = closeness(context.salesVelocity, toNumber(feature.salesVelocity), 30) * 0.12;
  return skuMatch + categoryMatch + marginScore + roasScore + inventoryScore + velocityScore;
}

export async function getHistoricalDecisionInsights(
  prisma: PrismaClient,
  context: DecisionLearningContext
): Promise<HistoricalDecisionInsights> {
  const actionType = normalizeAction(context.actionType);
  const rows = await prisma.decisionLearning.findMany({
    where: {
      workspaceId: context.workspaceId,
      actionType: {
        in: Array.from(new Set([context.actionType, actionType]))
      }
    },
    orderBy: { createdAt: "desc" },
    take: 250
  });

  const scored = rows
    .map((row) => ({ row, similarity: rowSimilarity(context, row) }))
    .filter((item) => item.similarity >= 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 120);

  const sourceRows = scored.length ? scored : rows.map((row) => ({ row, similarity: 0.25 }));
  const similarDecisionCount = sourceRows.length;
  const weightedTotal = sourceRows.reduce((sum, item) => sum + item.similarity, 0) || 1;
  const successWeight = sourceRows.reduce((sum, item) => sum + (item.row.success ? item.similarity : 0), 0);
  const historicalSuccessRate = similarDecisionCount ? successWeight / weightedTotal : null;
  const averageProfitImpact = similarDecisionCount
    ? sourceRows.reduce((sum, item) => sum + item.row.incrementalProfit * item.similarity, 0) / weightedTotal
    : 0;
  const averageAccuracy = similarDecisionCount
    ? sourceRows.reduce((sum, item) => sum + item.row.accuracyScore * item.similarity, 0) / weightedTotal
    : 0;
  const confidenceAdjustment = historicalSuccessRate == null
    ? 0
    : bounded((historicalSuccessRate - 0.5) * 0.32 + (averageAccuracy - 0.6) * 0.16, -0.18, 0.22);
  const expectedProfit = context.expectedProfit ?? 0;
  const baseScore = expectedProfit * Math.max(0.25, context.confidence ?? 0.55);
  const profitSignal = averageProfitImpact > 0 ? Math.min(averageProfitImpact, Math.max(1000, Math.abs(expectedProfit))) : averageProfitImpact * 0.5;
  const recommendedActionScore = Math.round((baseScore + profitSignal * Math.max(0, historicalSuccessRate ?? 0.5)) * 100) / 100;

  return {
    historicalSuccessRate: historicalSuccessRate == null ? null : Math.round(historicalSuccessRate * 10000) / 10000,
    averageProfitImpact: Math.round(averageProfitImpact * 100) / 100,
    confidenceAdjustment: Math.round(confidenceAdjustment * 10000) / 10000,
    recommendedActionScore,
    similarDecisionCount,
    historicalEvidence: sourceRows.slice(0, 12).map((item) => ({
      actionType: item.row.actionType,
      incrementalProfit: item.row.incrementalProfit,
      accuracyScore: item.row.accuracyScore,
      success: item.row.success,
      createdAt: item.row.createdAt.toISOString()
    }))
  };
}
