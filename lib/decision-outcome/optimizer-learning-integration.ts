import type { PrismaClient } from "@prisma/client";
import { getHistoricalDecisionInsights } from "@/lib/decision-outcome/decision-learning-service";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function setRecordNumber(record: Record<string, unknown>, key: string, value: number) {
  record[key] = Math.round(value * 10000) / 10000;
}

function actionType(row: Record<string, unknown>) {
  return String(row.canonical_action ?? row.unified_action ?? row.sourceAction ?? row.action ?? row.recommended_action ?? "UNKNOWN");
}

async function enrichRow(prisma: PrismaClient, workspaceId: string, row: Record<string, unknown>) {
  const evidence = asRecord(row.evidence);
  const simulation = asRecord(row.simulation);
  const beforeState = asRecord(row.before_state);
  const expectedProfit = toNumber(row.expectedProfitImpact) ?? toNumber(row.estimatedProfitImpact) ?? toNumber(row.profit_delta) ?? 0;
  const confidence = toNumber(row.confidence) ?? toNumber(row.confidenceScore) ?? 0.55;
  const insights = await getHistoricalDecisionInsights(prisma, {
    workspaceId,
    actionType: actionType(row),
    sku: typeof row.sku === "string" ? row.sku : typeof row.skuId === "string" ? row.skuId : null,
    category: typeof row.category === "string" ? row.category : null,
    margin: toNumber(evidence.margin) ?? toNumber(beforeState.margin),
    roas: toNumber(evidence.roas),
    inventoryDays: toNumber(evidence.inventoryRunwayDays),
    salesVelocity: toNumber(simulation.sales_velocity),
    expectedProfit,
    confidence
  });

  if (!insights.similarDecisionCount) {
    row.historicalEvidence = [];
    row.similarDecisionCount = 0;
    row.successRate = null;
    return row;
  }

  const adjustedProfit = expectedProfit + Math.max(0, insights.averageProfitImpact) * Math.max(0, insights.historicalSuccessRate ?? 0.5);
  const adjustedConfidence = Math.max(0.25, Math.min(0.95, confidence + insights.confidenceAdjustment));
  const adjustedScore = Math.max(
    toNumber(row.action_score) ?? 0,
    insights.recommendedActionScore
  );

  setRecordNumber(row, "expectedProfitImpact", adjustedProfit);
  setRecordNumber(row, "estimatedProfitImpact", adjustedProfit);
  setRecordNumber(row, "profit_delta", adjustedProfit);
  setRecordNumber(row, "confidence", adjustedConfidence);
  setRecordNumber(row, "confidenceScore", adjustedConfidence);
  setRecordNumber(row, "action_score", adjustedScore);
  row.historicalEvidence = insights.historicalEvidence;
  row.similarDecisionCount = insights.similarDecisionCount;
  row.successRate = insights.historicalSuccessRate;
  row.confidenceAdjustment = insights.confidenceAdjustment;

  const skuDecisionObject = asRecord(row.sku_decision_object);
  if (Object.keys(skuDecisionObject).length) {
    skuDecisionObject.expected_profit_impact = adjustedProfit;
    skuDecisionObject.confidence = adjustedConfidence;
    skuDecisionObject.historicalEvidence = insights.historicalEvidence;
    skuDecisionObject.similarDecisionCount = insights.similarDecisionCount;
    skuDecisionObject.successRate = insights.historicalSuccessRate;
    row.sku_decision_object = skuDecisionObject;
  }

  return row;
}

export async function applyDecisionLearningToDecisionReport(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    content: Record<string, unknown>;
  }
) {
  const report = asRecord(input.content.decision_report);
  const optimization = asRecord(report.sku_portfolio_optimization);
  const rows = Array.isArray(optimization.skuDecisions) ? optimization.skuDecisions : [];
  const enrichedRows = await Promise.all(rows.map((row) => enrichRow(prisma, input.workspaceId, asRecord(row))));
  enrichedRows.sort((left, right) =>
    (toNumber(right.action_score) ?? 0) - (toNumber(left.action_score) ?? 0) ||
    (toNumber(right.expectedProfitImpact) ?? 0) - (toNumber(left.expectedProfitImpact) ?? 0)
  );

  optimization.skuDecisions = enrichedRows;
  optimization.recommended_portfolio = Array.isArray(optimization.recommended_portfolio)
    ? await Promise.all(optimization.recommended_portfolio.map((row) => enrichRow(prisma, input.workspaceId, asRecord(row))))
    : [];

  const totalExpected = enrichedRows.reduce((sum, row) => sum + (toNumber(row.expectedProfitImpact) ?? 0), 0);
  const summary = asRecord(optimization.optimization_summary);
  summary.expected_profit_gain = Math.round(totalExpected * 100) / 100;
  summary.total_expected_profit_gain = Math.round(totalExpected * 100) / 100;
  summary.learning_adjusted = true;
  optimization.optimization_summary = summary;

  const portfolioSummary = asRecord(optimization.portfolioSummary);
  if (Object.keys(portfolioSummary).length) {
    portfolioSummary.totalProfitImpact = Math.round(totalExpected * 100) / 100;
    optimization.portfolioSummary = portfolioSummary;
  }

  report.sku_portfolio_optimization = optimization;
  input.content.decision_report = report;
  return input.content;
}
