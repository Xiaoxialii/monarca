import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });

const workspaceId = process.argv.find((arg) => arg.startsWith("--workspaceId="))?.split("=")[1] ?? "";
const skuId = process.argv.find((arg) => arg.startsWith("--sku="))?.split("=")[1] ?? "";

if (!workspaceId || !skuId) {
  console.error("Usage: node scripts/debug-recommendation-identity.mjs --workspaceId=<id> --sku=<sku>");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: ["error"]
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactRecommendation(row) {
  const record = asRecord(row);
  const simulation = asRecord(record.simulation);
  return {
    sku: record.sku ?? record.sku_id,
    action: record.action ?? record.canonical_action ?? record.action_type,
    source_action: record.sourceAction ?? record.source_action,
    category: record.category ?? record.optimization_goal,
    expected_profit_impact: record.expectedProfitImpact ?? record.estimatedProfitImpact ?? record.expected_profit_impact ?? record.profit_delta,
    recommendation_id: record.recommendation_id,
    decision_id: record.decision_id,
    optimization_run_id: record.optimization_run_id,
    previous_decision_context: record.previous_decision_context,
    simulation: {
      current_ads_spend: simulation.current_ads_spend,
      recommended_ads_spend: simulation.recommended_ads_spend,
      profit_delta: simulation.profit_delta,
      current_profit: simulation.current_profit,
      predicted_profit: simulation.predicted_profit
    }
  };
}

try {
  const cache = await prisma.optimizationReportCache.findUnique({
    where: { workspaceId_mode: { workspaceId, mode: "full" } },
    select: {
      id: true,
      state: true,
      generatedAt: true,
      updatedAt: true,
      sourceDecisionSnapshotId: true,
      queueRowsJson: true,
      portfolioRowsJson: true,
      portfolioOptimizationJson: true
    }
  });

  const queueRows = asArray(cache?.queueRowsJson).filter((row) => {
    const record = asRecord(row);
    return record.sku === skuId || record.sku_id === skuId;
  });
  const portfolioRows = asArray(cache?.portfolioRowsJson).filter((row) => {
    const record = asRecord(row);
    return record.sku === skuId || record.sku_id === skuId;
  });
  const optimization = asRecord(cache?.portfolioOptimizationJson);
  const optimizationRows = [
    ...asArray(optimization.skuDecisions),
    ...asArray(optimization.recommended_portfolio)
  ].filter((row) => {
    const record = asRecord(row);
    return record.sku === skuId || record.sku_id === skuId;
  });

  const actions = await prisma.decisionAction.findMany({
    where: { workspaceId, skuId },
    orderBy: [{ acceptedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      id: true,
      skuId: true,
      actionType: true,
      status: true,
      expectedImpact: true,
      acceptedAt: true,
      updatedAt: true,
      actionPayload: true
    }
  });

  console.log(JSON.stringify({
    cache: cache ? {
      id: cache.id,
      state: cache.state,
      generatedAt: cache.generatedAt,
      updatedAt: cache.updatedAt,
      sourceDecisionSnapshotId: cache.sourceDecisionSnapshotId
    } : null,
    queueRows: queueRows.map(compactRecommendation),
    portfolioRows: portfolioRows.map(compactRecommendation),
    optimizationRows: optimizationRows.map(compactRecommendation),
    actions: actions.map((action) => ({
      id: action.id,
      sku: action.skuId,
      actionType: action.actionType,
      status: action.status,
      expectedImpact: action.expectedImpact,
      acceptedAt: action.acceptedAt,
      updatedAt: action.updatedAt,
      payload: {
        recommendation_id: asRecord(action.actionPayload).recommendation_id,
        decision_instance_key: asRecord(action.actionPayload).decision_instance_key,
        optimization_run_id: asRecord(action.actionPayload).optimization_run_id,
        decision_id: asRecord(action.actionPayload).decision_id,
        expected_profit_impact: asRecord(action.actionPayload).expected_profit_impact,
        predicted_metrics: asRecord(action.actionPayload).predicted_metrics
      }
    }))
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
