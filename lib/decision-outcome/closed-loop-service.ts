/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrismaClient } from "@prisma/client";
import { readR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";
import { ECOMMERCE_CANONICAL_SCHEMA_VERSION } from "@/lib/snapshot/canonical-snapshot-generator";

export type ClosedLoopRecommendationType = "AD_OPTIMIZATION" | "SKU_OPTIMIZATION" | "INVENTORY_OPTIMIZATION";
export type ClosedLoopMetricType = "AD" | "SKU" | "INVENTORY";

export type DecisionMetricSet = {
  revenue: number;
  orders: number;
  units: number;
  adSpend: number;
  clicks: number;
  conversions: number;
  cogs: number;
  refund: number;
  profit: number;
  roas: number | null;
  margin: number | null;
  inventoryLevel: number;
  inventoryValue: number;
  salesVelocity: number;
  forecastDemand: number;
  holdingCost: number;
  rowCounts: Record<string, number>;
  dataCoverage: {
    hasOrders: boolean;
    hasAds: boolean;
    hasInventory: boolean;
    hasProfitInputs: boolean;
  };
};

export type DecisionImpactResult = {
  status: "CALCULATED" | "INSUFFICIENT_DATA";
  baseline: DecisionMetricSet;
  actual: DecisionMetricSet;
  expectedWithoutAction: DecisionMetricSet;
  impact: {
    revenueChange: number;
    adSpendReduction: number;
    incrementalProfit: number;
    roi: number | null;
    profitLiftRate: number | null;
  };
  expectedProfit: number;
  actualProfit: number;
  predictionError: number;
  accuracyScore: number;
  insufficientDataReasons: string[];
};

const CANONICAL_TABLES = [
  "ecommerce_orders",
  "ecommerce_order_items",
  "ecommerce_products",
  "ecommerce_customers",
  "ecommerce_refunds",
  "ecommerce_ads",
  "ecommerce_inventory",
  "ecommerce_costs",
  "inventory"
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(asRecord(row))) : [];
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value !== null) return value;
  }
  return 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rowDate(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
    if (typeof raw === "string" || typeof raw === "number") {
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function inPeriod(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date >= start && date <= end;
}

function dateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function periodDays(start: Date, end: Date) {
  return Math.max(1, Math.ceil((dateOnly(end).getTime() - dateOnly(start).getTime()) / 86_400_000) + 1);
}

function metricTypeForRecommendation(type: ClosedLoopRecommendationType): ClosedLoopMetricType {
  if (type === "AD_OPTIMIZATION") return "AD";
  if (type === "INVENTORY_OPTIMIZATION") return "INVENTORY";
  return "SKU";
}

function recommendationTypeFromPayload(actionType: string, payload: Record<string, unknown>): ClosedLoopRecommendationType {
  const text = `${actionType} ${payload.action ?? ""} ${payload.sourceAction ?? ""} ${payload.optimization_goal ?? ""} ${payload.optimizationGoal ?? ""}`.toLowerCase();
  if (/ad|ads|spend|campaign|roas|channel/.test(text)) return "AD_OPTIMIZATION";
  if (/inventory|restock|stock|reorder|excess/.test(text)) return "INVENTORY_OPTIMIZATION";
  return "SKU_OPTIMIZATION";
}

function targetEntityTypeForRecommendation(type: ClosedLoopRecommendationType) {
  if (type === "AD_OPTIMIZATION") return "campaign_or_sku";
  if (type === "INVENTORY_OPTIMIZATION") return "sku_inventory";
  return "sku";
}

function expectedMetricsFromInput(input: {
  baselineMetrics?: Record<string, unknown>;
  predictedMetrics?: Record<string, unknown>;
  actionPayload?: Record<string, unknown>;
}) {
  const baseline = input.baselineMetrics ?? {};
  const predicted = input.predictedMetrics ?? {};
  const expectedProfit = numberValue(predicted, ["profit", "expected_profit", "expectedProfit"]) -
    numberValue(baseline, ["profit", "current_profit", "currentProfit"]);
  return {
    profitIncrease: Math.max(0, expectedProfit),
    revenueChange: numberValue(predicted, ["revenue"]) - numberValue(baseline, ["revenue"]),
    costReduction: Math.max(0, numberValue(baseline, ["cost", "cogs", "ad_spend", "adSpend"]) - numberValue(predicted, ["cost", "cogs", "ad_spend", "adSpend"])),
    predicted,
    baseline,
    simulation: asRecord(input.actionPayload?.simulation_estimate ?? input.actionPayload?.simulationEstimate)
  };
}

function evidenceFromInput(payload: Record<string, unknown>) {
  return {
    roas: payload.roas ?? payload.current_roas ?? payload.currentRoas ?? null,
    margin: payload.margin ?? payload.current_margin ?? payload.currentMargin ?? null,
    inventoryDays: payload.inventory_days ?? payload.days_of_inventory ?? payload.daysOfInventory ?? null,
    drivers: payload.decision_drivers ?? payload.decisionDrivers ?? [],
    scenarios: payload.scenarios ?? []
  };
}

export async function ensureOptimizationDecisionForAction(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    actionId?: string | null;
    sku: string;
    actionType: string;
    actionPayload?: Record<string, unknown>;
    baselineMetrics?: Record<string, unknown>;
    predictedMetrics?: Record<string, unknown>;
    sourceDecisionSnapshotId?: string | null;
  }
) {
  const payload = input.actionPayload ?? {};
  const existing = input.actionId
    ? await (prisma as any).optimizationDecision.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { actions: { some: { id: input.actionId } } },
          { trackingActionId: input.actionId }
        ]
      }
    })
    : null;
  if (existing) return existing;

  const type = recommendationTypeFromPayload(input.actionType, payload);
  const recommendationJson = {
    action: payload.action ?? payload.sourceAction ?? input.actionType,
    actionType: input.actionType,
    targetSku: input.sku,
    expectedImpact: expectedMetricsFromInput({
      baselineMetrics: input.baselineMetrics,
      predictedMetrics: input.predictedMetrics,
      actionPayload: payload
    }),
    evidence: evidenceFromInput(payload),
    originalPayload: payload
  };

  return (prisma as any).optimizationDecision.create({
    data: {
      workspaceId: input.workspaceId,
      skuId: input.sku,
      recommendedAction: String(payload.action ?? payload.sourceAction ?? input.actionType),
      optimizationGoal: String(payload.optimization_goal ?? payload.optimizationGoal ?? input.actionType),
      lifecycleStage: typeof payload.lifecycle_stage === "string" ? payload.lifecycle_stage : null,
      expectedProfitImpact: numberValue(expectedMetricsFromInput({
        baselineMetrics: input.baselineMetrics,
        predictedMetrics: input.predictedMetrics,
        actionPayload: payload
      }), ["profitIncrease"]),
      expectedRevenueImpact: numberValue(expectedMetricsFromInput({
        baselineMetrics: input.baselineMetrics,
        predictedMetrics: input.predictedMetrics,
        actionPayload: payload
      }), ["revenueChange"]),
      expectedCostChange: -numberValue(expectedMetricsFromInput({
        baselineMetrics: input.baselineMetrics,
        predictedMetrics: input.predictedMetrics,
        actionPayload: payload
      }), ["costReduction"]),
      expectedAdSpend: numberValue(input.predictedMetrics ?? {}, ["ad_spend", "adSpend"]),
      confidence: numberValue(payload, ["confidence", "confidence_score", "confidenceScore"]),
      riskScore: numberValue(payload, ["risk_score", "riskScore"]),
      alternativeActions: Array.isArray(payload.scenarios) ? payload.scenarios : [],
      decisionStatus: "ACCEPTED",
      executionStatus: "NOT_STARTED",
      learningStatus: "ACCEPTED",
      trackingActionId: input.actionId ?? null,
      recommendationType: type,
      targetEntityType: targetEntityTypeForRecommendation(type),
      targetEntityId: input.sku,
      recommendationJson,
      expectedMetricsJson: expectedMetricsFromInput({
        baselineMetrics: input.baselineMetrics,
        predictedMetrics: input.predictedMetrics,
        actionPayload: payload
      }),
      evidenceJson: evidenceFromInput(payload),
      sourceDecisionSnapshotId: input.sourceDecisionSnapshotId ?? null
    }
  });
}

export async function startDecisionExecution(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    actionId?: string;
    recommendationId?: string;
    evaluationWindowDays?: number;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const action = input.actionId
    ? await (prisma as any).decisionAction.findFirst({
      where: { id: input.actionId, workspaceId: input.workspaceId },
      include: { recommendation: true }
    })
    : null;
  const recommendation = input.recommendationId
    ? await (prisma as any).optimizationDecision.findFirst({
      where: { id: input.recommendationId, workspaceId: input.workspaceId }
    })
    : action?.recommendation;
  if (!recommendation) return null;

  const baselineEnd = dateOnly(addDays(now, -1));
  const baselineStart = dateOnly(addDays(baselineEnd, -Math.max(1, input.evaluationWindowDays ?? 30) + 1));
  const baselineMetrics = await collectDecisionMetrics(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id,
    periodStart: baselineStart,
    periodEnd: baselineEnd,
    metricType: metricTypeForRecommendation(recommendation.recommendationType),
    targetEntityType: recommendation.targetEntityType,
    targetEntityId: recommendation.targetEntityId
  });

  const baseline = await (prisma as any).decisionBaselineSnapshot.upsert({
    where: {
      recommendationId_periodStart_periodEnd: {
        recommendationId: recommendation.id,
        periodStart: baselineStart,
        periodEnd: baselineEnd
      }
    },
    create: {
      recommendationId: recommendation.id,
      workspaceId: input.workspaceId,
      periodStart: baselineStart,
      periodEnd: baselineEnd,
      metricsJson: baselineMetrics
    },
    update: {
      metricsJson: baselineMetrics
    }
  });

  await (prisma as any).optimizationDecision.updateMany({
    where: { id: recommendation.id, workspaceId: input.workspaceId },
    data: { executionStatus: "EXECUTING", learningStatus: "TRACKING" }
  });

  if (action) {
    await (prisma as any).decisionAction.updateMany({
      where: { id: action.id, workspaceId: input.workspaceId },
      data: {
        recommendationId: recommendation.id,
        status: "EXECUTING",
        executionStartedAt: action.executionStartedAt ?? now,
        executedAt: action.executedAt ?? now,
        actionPayload: mergeTrackingPayload(action.actionPayload, {
          closed_loop: {
            recommendation_id: recommendation.id,
            baseline_snapshot_id: baseline.id,
            baseline_period_start: baselineStart.toISOString(),
            baseline_period_end: baselineEnd.toISOString()
          }
        })
      }
    });
  }

  return { recommendation, baseline, baselineMetrics };
}

export async function collectDecisionExecutionMetric(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    recommendationId: string;
    date?: Date;
  }
) {
  const recommendation = await (prisma as any).optimizationDecision.findFirst({
    where: { id: input.recommendationId, workspaceId: input.workspaceId }
  });
  if (!recommendation) return null;
  const date = dateOnly(input.date ?? new Date());
  const metrics = await collectDecisionMetrics(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id,
    periodStart: date,
    periodEnd: date,
    metricType: metricTypeForRecommendation(recommendation.recommendationType),
    targetEntityType: recommendation.targetEntityType,
    targetEntityId: recommendation.targetEntityId
  });

  return (prisma as any).decisionExecutionMetric.upsert({
    where: {
      recommendationId_date_metricType: {
        recommendationId: recommendation.id,
        date,
        metricType: metricTypeForRecommendation(recommendation.recommendationType)
      }
    },
    create: {
      recommendationId: recommendation.id,
      workspaceId: input.workspaceId,
      date,
      metricType: metricTypeForRecommendation(recommendation.recommendationType),
      metricsJson: metrics
    },
    update: {
      metricsJson: metrics
    }
  });
}

export async function collectDecisionMetricsForRecommendation(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    recommendationId: string;
    date?: Date;
  }
) {
  const recommendation = await (prisma as any).optimizationDecision.findFirst({
    where: { id: input.recommendationId, workspaceId: input.workspaceId }
  });
  if (!recommendation) return null;
  const date = dateOnly(input.date ?? new Date());
  return collectDecisionMetrics(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id,
    periodStart: date,
    periodEnd: date,
    metricType: metricTypeForRecommendation(recommendation.recommendationType),
    targetEntityType: recommendation.targetEntityType,
    targetEntityId: recommendation.targetEntityId
  });
}

export async function evaluateDecisionOutcome(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    recommendationId: string;
    evaluationPeriodStart?: Date;
    evaluationPeriodEnd?: Date;
  }
) {
  const recommendation = await (prisma as any).optimizationDecision.findFirst({
    where: { id: input.recommendationId, workspaceId: input.workspaceId },
    include: { baselineSnapshots: { orderBy: { createdAt: "desc" }, take: 1 }, actions: { orderBy: { updatedAt: "desc" }, take: 1 } }
  });
  if (!recommendation) return null;

  const action = recommendation.actions[0] ?? null;
  const baseline = recommendation.baselineSnapshots[0] ?? await startDecisionExecution(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id
  }).then((result) => result?.baseline ?? null);
  if (!baseline) return null;

  const evaluationStart = input.evaluationPeriodStart ?? dateOnly(action?.executionStartedAt ?? addDays(new Date(), -30));
  const evaluationEnd = input.evaluationPeriodEnd ?? dateOnly(new Date());
  const actual = await collectDecisionMetrics(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id,
    periodStart: evaluationStart,
    periodEnd: evaluationEnd,
    metricType: metricTypeForRecommendation(recommendation.recommendationType),
    targetEntityType: recommendation.targetEntityType,
    targetEntityId: recommendation.targetEntityId
  });
  const result = calculateDecisionImpact({
    baseline: metricsFromUnknown(baseline.metricsJson),
    actual,
    baselinePeriodStart: baseline.periodStart,
    baselinePeriodEnd: baseline.periodEnd,
    evaluationPeriodStart: evaluationStart,
    evaluationPeriodEnd: evaluationEnd,
    expectedMetrics: asRecord(recommendation.expectedMetricsJson)
  });
  await collectDecisionExecutionMetric(prisma, {
    workspaceId: input.workspaceId,
    recommendationId: recommendation.id,
    date: evaluationEnd
  });

  if (!action) {
    return { recommendation, baseline, result, outcome: null, learning: null };
  }

  const outcome = await (prisma as any).decisionOutcome.upsert({
    where: { decisionId: action.id },
    create: {
      decisionId: action.id,
      recommendationId: recommendation.id,
      baselineSnapshotId: baseline.id,
      evaluationPeriodStart: evaluationStart,
      evaluationPeriodEnd: evaluationEnd,
      expectedMetricsJson: result.expectedWithoutAction,
      actualMetricsJson: result.actual,
      impactJson: result.impact,
      status: result.status,
      baselineProfit: result.baseline.profit,
      expectedProfitChange: result.expectedProfit,
      actualProfitChange: result.actualProfit,
      attributedProfitChange: result.impact.incrementalProfit,
      organicProfitChange: result.actual.profit - result.impact.incrementalProfit,
      profitVariance: result.predictionError,
      outcomeStatus: result.impact.incrementalProfit > 0 ? "POSITIVE" : result.impact.incrementalProfit < 0 ? "NEGATIVE" : "NEUTRAL",
      predictedProfit: result.expectedProfit,
      realizedProfit: result.actualProfit,
      profitDelta: result.predictionError,
      accuracy: result.accuracyScore,
      attributionJson: {
        ...result.impact,
        expected_without_action: result.expectedWithoutAction,
        insufficient_data_reasons: result.insufficientDataReasons
      },
      learningSignals: learningSignalsForResult(recommendation, result)
    },
    update: {
      recommendationId: recommendation.id,
      baselineSnapshotId: baseline.id,
      evaluationPeriodStart: evaluationStart,
      evaluationPeriodEnd: evaluationEnd,
      expectedMetricsJson: result.expectedWithoutAction,
      actualMetricsJson: result.actual,
      impactJson: result.impact,
      status: result.status,
      baselineProfit: result.baseline.profit,
      expectedProfitChange: result.expectedProfit,
      actualProfitChange: result.actualProfit,
      attributedProfitChange: result.impact.incrementalProfit,
      organicProfitChange: result.actual.profit - result.impact.incrementalProfit,
      profitVariance: result.predictionError,
      outcomeStatus: result.impact.incrementalProfit > 0 ? "POSITIVE" : result.impact.incrementalProfit < 0 ? "NEGATIVE" : "NEUTRAL",
      predictedProfit: result.expectedProfit,
      realizedProfit: result.actualProfit,
      profitDelta: result.predictionError,
      accuracy: result.accuracyScore,
      attributionJson: {
        ...result.impact,
        expected_without_action: result.expectedWithoutAction,
        insufficient_data_reasons: result.insufficientDataReasons
      },
      learningSignals: learningSignalsForResult(recommendation, result)
    }
  });
  const learning = result.status === "CALCULATED"
    ? await (prisma as any).decisionLearning.create({
      data: {
        recommendationId: recommendation.id,
        workspaceId: input.workspaceId,
        expectedProfit: result.expectedProfit,
        actualProfit: result.impact.incrementalProfit,
        predictionError: result.predictionError,
        accuracyScore: result.accuracyScore,
        actionType: String(recommendation.recommendedAction ?? recommendation.recommendationJson?.action ?? "UNKNOWN"),
        featureSnapshot: featureSnapshotForLearning(recommendation, result),
        success: result.impact.incrementalProfit > 0 && result.accuracyScore >= 0.45,
        incrementalProfit: result.impact.incrementalProfit,
        learningPattern: learningPatternForResult(recommendation, result),
        learningJson: learningSignalsForResult(recommendation, result)
      }
    })
    : null;

  await (prisma as any).optimizationDecision.updateMany({
    where: { id: recommendation.id, workspaceId: input.workspaceId },
    data: {
      executionStatus: result.status === "CALCULATED" ? "COMPLETED" : "EXECUTING",
      learningStatus: result.status === "CALCULATED" ? "READY_TO_LEARN" : "TRACKING"
    }
  });
  await (prisma as any).decisionAction.updateMany({
    where: { id: action.id, workspaceId: input.workspaceId },
    data: {
      status: result.status === "CALCULATED" ? "EVALUATED" : "EXECUTING",
      actualImpact: result.status === "CALCULATED" ? result.impact.incrementalProfit : null,
      evaluatedAt: result.status === "CALCULATED" ? new Date() : null,
      actionPayload: mergeTrackingPayload(action.actionPayload, {
        actual_metrics: result.status === "CALCULATED" ? actualMetricsForLegacyTracker(result) : {},
        attribution: {
          attributed_profit_change: result.impact.incrementalProfit,
          attributed_revenue_change: result.impact.revenueChange,
          attributed_ad_spend_change: -result.impact.adSpendReduction,
          organic_profit_change: result.actual.profit - result.impact.incrementalProfit,
          organic_revenue_change: 0,
          confidence: result.accuracyScore,
          method: "baseline_trend_canonical_v1",
          insufficient_data_reasons: result.insufficientDataReasons
        },
        evaluation_result: result.status === "CALCULATED" ? {
          predicted_vs_actual_gap: result.predictionError,
          error_rate: 1 - result.accuracyScore,
          result_label: result.accuracyScore >= 0.8 ? "win" : result.accuracyScore >= 0.45 ? "neutral" : "miss",
          outcome_status: result.impact.incrementalProfit > 0 ? "POSITIVE" : result.impact.incrementalProfit < 0 ? "NEGATIVE" : "NEUTRAL",
          evaluated_at: new Date().toISOString(),
          learning_feedback: learningFeedback(recommendation, result)
        } : null,
        learning_feedback: result.status === "CALCULATED" ? learningFeedback(recommendation, result) : "Waiting for enough real canonical data to evaluate outcome."
      })
    }
  });

  return { recommendation, baseline, result, outcome, learning };
}

export function calculateDecisionImpact(input: {
  baseline: DecisionMetricSet;
  actual: DecisionMetricSet;
  baselinePeriodStart: Date;
  baselinePeriodEnd: Date;
  evaluationPeriodStart: Date;
  evaluationPeriodEnd: Date;
  expectedMetrics: Record<string, unknown>;
}): DecisionImpactResult {
  const baselineDays = periodDays(input.baselinePeriodStart, input.baselinePeriodEnd);
  const evaluationDays = periodDays(input.evaluationPeriodStart, input.evaluationPeriodEnd);
  const scale = evaluationDays / baselineDays;
  const expectedWithoutAction = scaleMetrics(input.baseline, scale);
  const expectedProfit = Math.max(0,
    numberValue(input.expectedMetrics, ["profitIncrease", "expectedProfitImpact", "expected_profit_impact", "profit"]) ||
    numberValue(asRecord(input.expectedMetrics.predicted), ["profit"]) - numberValue(asRecord(input.expectedMetrics.baseline), ["profit"])
  );
  const incrementalProfit = roundMoney(input.actual.profit - expectedWithoutAction.profit);
  const predictionError = roundMoney(incrementalProfit - expectedProfit);
  const accuracyScore = expectedProfit > 0
    ? roundRatio(Math.max(0, 1 - Math.abs(predictionError) / Math.max(1, Math.abs(expectedProfit))))
    : (incrementalProfit === 0 ? 1 : 0);
  const insufficientDataReasons = insufficientDataReasonsForMetrics(input.baseline, input.actual);
  const roiDenominator = Math.abs(input.actual.adSpend - expectedWithoutAction.adSpend);

  return {
    status: insufficientDataReasons.length ? "INSUFFICIENT_DATA" : "CALCULATED",
    baseline: input.baseline,
    actual: input.actual,
    expectedWithoutAction,
    impact: {
      revenueChange: roundMoney(input.actual.revenue - expectedWithoutAction.revenue),
      adSpendReduction: roundMoney(expectedWithoutAction.adSpend - input.actual.adSpend),
      incrementalProfit,
      roi: roiDenominator > 0 ? roundRatio(incrementalProfit / roiDenominator) : null,
      profitLiftRate: expectedWithoutAction.profit > 0 ? roundRatio(incrementalProfit / expectedWithoutAction.profit) : null
    },
    expectedProfit,
    actualProfit: input.actual.profit,
    predictionError,
    accuracyScore,
    insufficientDataReasons
  };
}

export async function collectDecisionMetrics(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    recommendationId?: string;
    periodStart: Date;
    periodEnd: Date;
    metricType: ClosedLoopMetricType;
    targetEntityType?: string;
    targetEntityId?: string;
  }
): Promise<DecisionMetricSet> {
  const dataset = await loadWorkspaceCanonicalDataset(prisma, input.workspaceId);
  return aggregateDecisionMetrics(dataset, input);
}

async function loadWorkspaceCanonicalDataset(prisma: PrismaClient, workspaceId: string): Promise<CanonicalDataset> {
  const snapshots = await (prisma as any).schemaSnapshot.findMany({
    where: {
      workspaceId,
      canonicalStatus: "READY"
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      dataSourceId: true,
      schemaJson: true
    }
  });
  const latestBySource = new Map<string, Record<string, unknown>>();
  for (const snapshot of snapshots) {
    const key = snapshot.dataSourceId ?? "workspace";
    if (!latestBySource.has(key)) latestBySource.set(key, asRecord(snapshot.schemaJson));
  }
  const datasets = await Promise.all(Array.from(latestBySource.values()).map(readCanonicalDatasetFromSchemaJson));
  return mergeCanonicalDatasets(datasets);
}

async function readCanonicalDatasetFromSchemaJson(schemaJson: Record<string, unknown>): Promise<CanonicalDataset> {
  const embedded = canonicalDatasetValue(schemaJson.canonicalDataset) ?? canonicalDatasetValue(schemaJson.canonical_dataset);
  if (embedded) return embedded;

  const tableArtifacts = Array.isArray(schemaJson.tables) ? schemaJson.tables : [];
  const tables = emptyCanonicalTables();
  for (const tableName of CANONICAL_TABLES) {
    const table = tableArtifacts.find((item) => asRecord(item).name === tableName);
    const artifactKey = stringValue(asRecord(table).artifactKey);
    const sampleRows = arrayRows(asRecord(table).sampleRows);
    const previewRows = arrayRows(asRecord(table).previewRows);
    if (sampleRows.length || previewRows.length) {
      tables[tableName] = [...sampleRows, ...previewRows];
      continue;
    }
    if (!artifactKey) continue;
    tables[tableName] = parseJsonl(await readR2ObjectText(artifactKey).catch(() => ""));
  }

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: [],
      normalized_at: new Date().toISOString(),
      unknown_fields: [],
      validation: {
        accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0
    }
  };
}

function aggregateDecisionMetrics(
  dataset: CanonicalDataset,
  input: {
    periodStart: Date;
    periodEnd: Date;
    metricType: ClosedLoopMetricType;
    targetEntityId?: string;
  }
): DecisionMetricSet {
  const sku = input.targetEntityId ? String(input.targetEntityId).toLowerCase() : null;
  const orderItems = arrayRows(dataset.tables.ecommerce_order_items)
    .filter((row) => !sku || String(row.sku ?? "").toLowerCase() === sku)
    .filter((row) => inPeriod(rowDate(row, ["order_date", "date", "created_at", "created_at_source"]), input.periodStart, input.periodEnd));
  const orders = arrayRows(dataset.tables.ecommerce_orders)
    .filter((row) => inPeriod(rowDate(row, ["order_date", "date", "processed_at_source", "created_at_source", "created_at"]), input.periodStart, input.periodEnd));
  const ads = arrayRows(dataset.tables.ecommerce_ads)
    .filter((row) => !sku || String(row.sku ?? row.campaign_id ?? row.ad_id ?? "").toLowerCase().includes(sku))
    .filter((row) => inPeriod(rowDate(row, ["event_date", "date", "day", "created_at_source", "created_at"]), input.periodStart, input.periodEnd));
  const inventoryRows = [...arrayRows(dataset.tables.ecommerce_inventory), ...arrayRows(dataset.tables.inventory)]
    .filter((row) => !sku || String(row.sku ?? "").toLowerCase() === sku);
  const refunds = arrayRows(dataset.tables.ecommerce_refunds)
    .filter((row) => inPeriod(rowDate(row, ["refund_date", "date", "created_at_source", "created_at"]), input.periodStart, input.periodEnd));
  const revenueFromItems = orderItems.reduce((sum, row) => sum + numberValue(row, ["net_sales", "revenue", "gross_sales", "total_paid"]), 0);
  const revenueFromOrders = orders.reduce((sum, row) => sum + numberValue(row, ["net_sales", "revenue", "gross_sales", "total_paid"]), 0);
  const adRevenue = ads.reduce((sum, row) => sum + numberValue(row, ["attribution_revenue", "revenue", "conversion_value"]), 0);
  const revenue = input.metricType === "AD"
    ? adRevenue
    : (revenueFromItems || (sku ? 0 : revenueFromOrders));
  const units = orderItems.reduce((sum, row) => sum + numberValue(row, ["quantity", "units", "sold_units"]), 0);
  const cogs = orderItems.reduce((sum, row) => {
    const quantity = Math.max(1, numberValue(row, ["quantity", "units", "sold_units"]) || 1);
    return sum + numberValue(row, ["cogs", "product_cost", "unit_cost", "cost"]) * quantity;
  }, 0);
  const adSpend = ads.reduce((sum, row) => sum + numberValue(row, ["ad_spend", "spend", "cost"]), 0);
  const refund = refunds.reduce((sum, row) => sum + numberValue(row, ["refund_amount", "amount"]), 0);
  const shippingCost = orders.reduce((sum, row) => sum + numberValue(row, ["shipping_cost", "fulfillment_cost", "warehouse_cost", "payment_fee"]), 0);
  const profit = roundMoney(revenue - cogs - adSpend - refund - shippingCost);
  const inventoryLevel = inventoryRows.reduce((sum, row) => sum + numberValue(row, ["available_stock", "stock_level", "inventory_quantity", "stock"]), 0);
  const inventoryValue = inventoryRows.reduce((sum, row) => {
    const qty = numberValue(row, ["available_stock", "stock_level", "inventory_quantity", "stock"]);
    const cost = numberValue(row, ["inventory_cost", "unit_cost", "product_cost", "cost"]);
    return sum + (cost ? qty * cost : numberValue(row, ["inventory_value"]));
  }, 0);
  const days = periodDays(input.periodStart, input.periodEnd);
  const salesVelocity = roundRatio(units / days);

  return {
    revenue: roundMoney(revenue),
    orders: new Set(orders.map((row) => String(row.order_id ?? row.source_order_id ?? row.canonical_key ?? ""))).size || orders.length,
    units: roundMoney(units),
    adSpend: roundMoney(adSpend),
    clicks: ads.reduce((sum, row) => sum + numberValue(row, ["clicks"]), 0),
    conversions: ads.reduce((sum, row) => sum + numberValue(row, ["conversions", "conversion"]), 0),
    cogs: roundMoney(cogs),
    refund: roundMoney(refund),
    profit,
    roas: adSpend > 0 ? roundRatio((adRevenue || revenue) / adSpend) : null,
    margin: revenue > 0 ? roundRatio(profit / revenue) : null,
    inventoryLevel: roundMoney(inventoryLevel),
    inventoryValue: roundMoney(inventoryValue),
    salesVelocity,
    forecastDemand: roundMoney(salesVelocity * 30),
    holdingCost: roundMoney(inventoryValue * 0.02),
    rowCounts: {
      orders: orders.length,
      orderItems: orderItems.length,
      ads: ads.length,
      inventory: inventoryRows.length,
      refunds: refunds.length
    },
    dataCoverage: {
      hasOrders: orders.length > 0 || orderItems.length > 0,
      hasAds: ads.length > 0,
      hasInventory: inventoryRows.length > 0,
      hasProfitInputs: revenue > 0 && (cogs > 0 || adSpend > 0 || refund > 0 || shippingCost > 0)
    }
  };
}

function insufficientDataReasonsForMetrics(baseline: DecisionMetricSet, actual: DecisionMetricSet) {
  const reasons: string[] = [];
  if (!baseline.dataCoverage.hasOrders && !baseline.dataCoverage.hasAds) reasons.push("baseline_business_metrics_missing");
  if (!actual.dataCoverage.hasOrders && !actual.dataCoverage.hasAds) reasons.push("actual_business_metrics_missing");
  if (!baseline.dataCoverage.hasProfitInputs) reasons.push("baseline_profit_inputs_incomplete");
  if (!actual.dataCoverage.hasProfitInputs) reasons.push("actual_profit_inputs_incomplete");
  return reasons;
}

function scaleMetrics(metrics: DecisionMetricSet, scale: number): DecisionMetricSet {
  return {
    ...metrics,
    revenue: roundMoney(metrics.revenue * scale),
    orders: Math.round(metrics.orders * scale),
    units: roundMoney(metrics.units * scale),
    adSpend: roundMoney(metrics.adSpend * scale),
    clicks: Math.round(metrics.clicks * scale),
    conversions: roundMoney(metrics.conversions * scale),
    cogs: roundMoney(metrics.cogs * scale),
    refund: roundMoney(metrics.refund * scale),
    profit: roundMoney(metrics.profit * scale),
    holdingCost: roundMoney(metrics.holdingCost * scale)
  };
}

function actualMetricsForLegacyTracker(result: DecisionImpactResult) {
  return {
    revenue: result.actual.revenue,
    ad_spend: result.actual.adSpend,
    profit: result.expectedWithoutAction.profit + result.impact.incrementalProfit,
    roas: result.actual.roas ?? undefined,
    stock: result.actual.inventoryLevel,
    sold_units: result.actual.units
  };
}

function learningSignalsForResult(recommendation: any, result: DecisionImpactResult) {
  return {
    pattern: `For ${recommendation.recommendationType} on ${recommendation.targetEntityType}, actual incremental profit was ${result.impact.incrementalProfit} against expected ${result.expectedProfit}.`,
    successRate: result.accuracyScore,
    accuracyScore: result.accuracyScore,
    dataCoverage: result.actual.dataCoverage,
    insufficientDataReasons: result.insufficientDataReasons
  };
}

function featureSnapshotForLearning(recommendation: any, result: DecisionImpactResult) {
  const evidence = asRecord(recommendation.evidenceJson);
  return {
    actionType: String(recommendation.recommendedAction ?? recommendation.recommendationJson?.action ?? "UNKNOWN"),
    sku: recommendation.skuId ?? recommendation.targetEntityId ?? null,
    category: evidence.category ?? evidence.skuCategory ?? null,
    margin: result.baseline.margin ?? evidence.margin ?? null,
    roas: result.baseline.roas ?? evidence.roas ?? null,
    inventoryDays: evidence.inventoryDays ?? (result.baseline.salesVelocity > 0 ? roundRatio(result.baseline.inventoryLevel / result.baseline.salesVelocity) : null),
    salesVelocity: result.baseline.salesVelocity,
    recommendationType: recommendation.recommendationType,
    baseline: result.baseline,
    actual: result.actual
  };
}

function learningPatternForResult(recommendation: any, result: DecisionImpactResult) {
  const feature = featureSnapshotForLearning(recommendation, result);
  const action = String(feature.actionType);
  const margin = typeof feature.margin === "number" ? `${Math.round(feature.margin * 100)}% margin` : "known margin";
  const roas = typeof feature.roas === "number" ? `ROAS ${feature.roas}` : "known ROAS";
  return `${action} with ${roas} and ${margin} produced ${result.impact.incrementalProfit >= 0 ? "positive" : "negative"} incremental profit.`;
}

function learningFeedback(recommendation: any, result: DecisionImpactResult) {
  if (result.status !== "CALCULATED") return "Outcome is pending until real canonical data covers the evaluation window.";
  return `${recommendation.recommendationType} recommendation accuracy was ${Math.round(result.accuracyScore * 100)}% with incremental profit ${result.impact.incrementalProfit}.`;
}

function metricsFromUnknown(value: unknown): DecisionMetricSet {
  const record = asRecord(value);
  return {
    revenue: numberValue(record, ["revenue"]),
    orders: numberValue(record, ["orders"]),
    units: numberValue(record, ["units"]),
    adSpend: numberValue(record, ["adSpend", "ad_spend"]),
    clicks: numberValue(record, ["clicks"]),
    conversions: numberValue(record, ["conversions"]),
    cogs: numberValue(record, ["cogs"]),
    refund: numberValue(record, ["refund", "refund_amount"]),
    profit: numberValue(record, ["profit"]),
    roas: toNumber(record.roas),
    margin: toNumber(record.margin),
    inventoryLevel: numberValue(record, ["inventoryLevel", "inventory_level"]),
    inventoryValue: numberValue(record, ["inventoryValue", "inventory_value"]),
    salesVelocity: numberValue(record, ["salesVelocity", "sales_velocity"]),
    forecastDemand: numberValue(record, ["forecastDemand", "forecast_demand"]),
    holdingCost: numberValue(record, ["holdingCost", "holding_cost"]),
    rowCounts: numericRecord(record.rowCounts),
    dataCoverage: {
      hasOrders: Boolean(asRecord(record.dataCoverage).hasOrders),
      hasAds: Boolean(asRecord(record.dataCoverage).hasAds),
      hasInventory: Boolean(asRecord(record.dataCoverage).hasInventory),
      hasProfitInputs: Boolean(asRecord(record.dataCoverage).hasProfitInputs)
    }
  };
}

function canonicalDatasetValue(value: unknown): CanonicalDataset | null {
  const dataset = asRecord(value);
  const tables = asRecord(dataset.tables);
  if (dataset.schema_version !== ECOMMERCE_CANONICAL_SCHEMA_VERSION) return null;
  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables: {
      ecommerce_orders: arrayRows(tables.ecommerce_orders),
      ecommerce_order_items: arrayRows(tables.ecommerce_order_items),
      ecommerce_products: arrayRows(tables.ecommerce_products),
      ecommerce_customers: arrayRows(tables.ecommerce_customers),
      ecommerce_refunds: arrayRows(tables.ecommerce_refunds),
      ecommerce_ads: arrayRows(tables.ecommerce_ads),
      ecommerce_inventory: arrayRows(tables.ecommerce_inventory),
      ecommerce_costs: arrayRows(tables.ecommerce_costs),
      inventory: arrayRows(tables.inventory)
    },
    metadata: {
      source_platforms: [],
      normalized_at: new Date().toISOString(),
      unknown_fields: [],
      validation: { accepted_rows: 0, rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: 0
    }
  };
}

function emptyCanonicalTables(): CanonicalDataset["tables"] {
  return {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: [],
    ecommerce_inventory: [],
    ecommerce_costs: [],
    inventory: []
  };
}

function mergeCanonicalDatasets(datasets: CanonicalDataset[]): CanonicalDataset {
  const tables = emptyCanonicalTables();
  for (const dataset of datasets) {
    for (const tableName of CANONICAL_TABLES) {
      const targetRows = tables[tableName];
      if (!targetRows) continue;
      targetRows.push(...arrayRows(dataset.tables[tableName]));
    }
  }
  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: Array.from(new Set(datasets.flatMap((dataset) => dataset.metadata.source_platforms ?? []))),
      normalized_at: new Date().toISOString(),
      unknown_fields: [],
      validation: { accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0), rejected_rows: 0, warnings: [], rejected: [] },
      dedupe: { canonical_key_strategy: "hash(platform + source_id + order_id)", duplicate_count: 0 },
      mapping_confidence: datasets.reduce((max, dataset) => Math.max(max, dataset.metadata.mapping_confidence ?? 0), 0)
    }
  };
}

function parseJsonl(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return asRecord(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

function mergeTrackingPayload(payload: unknown, updates: Record<string, unknown>) {
  const current = asRecord(payload);
  return {
    ...current,
    tracking: {
      ...asRecord(current.tracking),
      ...updates
    }
  };
}

function numericRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, toNumber(entry) ?? 0])
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
