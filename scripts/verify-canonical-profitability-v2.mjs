import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const CURRENT_PROFITABILITY_ENGINE_VERSION = "v2";
const DEFAULT_SAMPLE_SKUS = ["SKU_00479", "SKU_01299", "SKU_01588"];

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
}

const workspaceId = args.get("workspaceId");
if (!workspaceId) {
  throw new Error("Usage: node scripts/verify-canonical-profitability-v2.mjs --workspaceId=...");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ["error"]
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function versionOf(payload) {
  const record = asRecord(payload);
  return record.profitabilityEngineVersion
    ?? asRecord(record.decisionSnapshotVersions).profitabilityEngineVersion
    ?? asRecord(record.versions).profitabilityEngineVersion
    ?? null;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function extractProfitability(row) {
  const record = asRecord(row);
  const evidence = asRecord(record.evidence);
  const decisionContract = asRecord(record.decision_contract);
  const contractEvidence = asRecord(decisionContract.evidence);
  const policyMetrics = asRecord(asRecord(record.policy_trace).metrics);
  const validation = asRecord(record.validation);
  const impact = asRecord(record.impact);

  return {
    sku: record.sku ?? record.sku_id ?? evidence.sku ?? null,
    recommendationId: record.recommendation_id ?? record.recommendationId ?? null,
    action: record.action ?? record.action_type ?? record.canonical_action ?? null,
    revenue: firstNumber(record.revenue, evidence.revenue, contractEvidence.revenue, policyMetrics.revenue),
    cogs: firstNumber(record.cogs, evidence.cogs, contractEvidence.cogs, policyMetrics.cogs),
    operatingCost: firstNumber(
      record.operating_cost,
      record.operatingCost,
      evidence.operating_cost,
      evidence.operatingCost,
      contractEvidence.operating_cost,
      contractEvidence.operatingCost,
      policyMetrics.operatingCost
    ),
    ads: firstNumber(
      record.ads_spend,
      record.ad_cost_allocated,
      evidence.ads_spend,
      evidence.ad_cost_allocated,
      contractEvidence.ads_spend,
      policyMetrics.adSpend
    ),
    totalCost: firstNumber(record.total_cost, record.totalCost, evidence.total_cost, evidence.totalCost, contractEvidence.total_cost),
    netProfit: firstNumber(record.net_profit, record.netProfit, evidence.net_profit, evidence.netProfit, contractEvidence.netProfit, policyMetrics.netProfit),
    margin: firstNumber(record.margin, evidence.margin, contractEvidence.margin, policyMetrics.margin),
    profitabilityConfidence: firstNumber(record.profitability_confidence, evidence.profitability_confidence, policyMetrics.profitabilityConfidence),
    optimizationAllowed: typeof record.optimization_allowed === "boolean"
      ? record.optimization_allowed
      : typeof evidence.optimization_allowed === "boolean"
        ? evidence.optimization_allowed
        : typeof validation.optimization_allowed === "boolean"
          ? validation.optimization_allowed
          : null,
    expectedProfitImpact: firstNumber(record.expectedProfitImpact, record.expected_profit_impact, impact.expected_profit_change),
    validationStatus: record.validation_status ?? validation.status ?? null,
    profitabilityEngineVersion: record.profitabilityEngineVersion ?? evidence.profitabilityEngineVersion ?? null
  };
}

async function main() {
  const sampleSkus = String(args.get("sampleSkus") || DEFAULT_SAMPLE_SKUS.join(","))
    .split(",")
    .map((sku) => sku.trim())
    .filter(Boolean);

  const sampleSkuListSql = sampleSkus.map(sqlString).join(", ");
  const latestSnapshotWhere = `
    "workspaceId" = ${sqlString(workspaceId)}
    AND "snapshotType" = 'optimization_report'
    AND ("inputHash" IS NULL OR "inputHash" NOT LIKE 'stale-before-${CURRENT_PROFITABILITY_ENGINE_VERSION}%')
  `;

  const [counts, cacheMetadata, latestSnapshots, latestSnapshotMeta, sampleRowsRaw, reportSnapshots, reportMetricCaches] = await Promise.all([
    Promise.all([
      prisma.reportMetricCache.count({ where: { workspaceId } }),
      prisma.optimizationReportCache.count({ where: { workspaceId } }),
      prisma.decisionSnapshot.count({ where: { workspaceId } }),
      prisma.reportSnapshot.count({ where: { workspaceId } }),
      prisma.decisionAction.count({ where: { workspaceId } })
    ]),
    prisma.$queryRawUnsafe(`
      SELECT
        id,
        mode,
        state,
        "inputHash",
        "generatedAt",
        "updatedAt",
        "portfolioSummaryJson"->>'profitabilityEngineVersion' AS "portfolioSummaryVersion",
        "portfolioOptimizationJson"->>'profitabilityEngineVersion' AS "portfolioOptimizationVersion",
        "portfolioSummaryJson"->>'totalProfitImpact' AS "totalProfitImpact",
        "portfolioSummaryJson"->>'acceptedProfitImpact' AS "acceptedProfitImpact",
        jsonb_array_length("queueRowsJson") AS "queueRows",
        jsonb_array_length("portfolioRowsJson") AS "portfolioRows"
      FROM "OptimizationReportCache"
      WHERE "workspaceId" = ${sqlString(workspaceId)}
      ORDER BY "updatedAt" DESC
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        id,
        "skuId",
        "optimizationType",
        "inputHash",
        "generatedAt",
        "createdAt",
        "recommendationsJson"->'decisionSnapshotVersions' AS versions
      FROM "DecisionSnapshot"
      WHERE "workspaceId" = ${sqlString(workspaceId)}
        AND "snapshotType" = 'optimization_report'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        id,
        "recommendationsJson"->'decisionSnapshotVersions' AS versions,
        jsonb_array_length("recommendationsJson"->'skuDecisions') AS "skuDecisionCount"
      FROM "DecisionSnapshot"
      WHERE ${latestSnapshotWhere}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `),
    prisma.$queryRawUnsafe(`
      WITH latest AS (
        SELECT "queueRowsJson", "portfolioRowsJson"
        FROM "OptimizationReportCache"
        WHERE "workspaceId" = ${sqlString(workspaceId)}
          AND mode = 'full'
          AND ("inputHash" IS NULL OR "inputHash" NOT LIKE 'stale-before-${CURRENT_PROFITABILITY_ENGINE_VERSION}%')
        ORDER BY "updatedAt" DESC
        LIMIT 1
      ),
      items AS (
        SELECT item
        FROM latest, jsonb_array_elements(latest."queueRowsJson") AS item
        UNION ALL
        SELECT item
        FROM latest, jsonb_array_elements(latest."portfolioRowsJson") AS item
      )
      SELECT item AS row
      FROM items
      WHERE item->>'sku' IN (${sampleSkuListSql})
        OR item->>'sku_id' IN (${sampleSkuListSql})
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        id,
        "reportType",
        "cacheKey",
        warning,
        "updatedAt",
        "contentJson"->>'profitabilityEngineVersion' AS version
      FROM "ReportSnapshot"
      WHERE "workspaceId" = ${sqlString(workspaceId)}
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        id,
        "cacheKey",
        "refreshStatus",
        "staleAt",
        "updatedAt",
        "payloadJson"->>'profitabilityEngineVersion' AS version
      FROM "ReportMetricCache"
      WHERE "workspaceId" = ${sqlString(workspaceId)}
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `)
  ]);

  const sampleRowsBySku = new Map(sampleRowsRaw.map((item) => {
    const row = extractProfitability(item.row);
    return [row.sku, row];
  }));
  const sampleRows = sampleSkus.map((sku) => sampleRowsBySku.get(sku) ?? { sku, missing: true });

  console.log(JSON.stringify({
    ok: true,
    workspaceId,
    currentProfitabilityEngineVersion: CURRENT_PROFITABILITY_ENGINE_VERSION,
    counts: {
      ReportMetricCache: counts[0],
      OptimizationReportCache: counts[1],
      DecisionSnapshot: counts[2],
      ReportSnapshot: counts[3],
      DecisionAction: counts[4]
    },
    optimizationCaches: cacheMetadata,
    latestDecisionSnapshots: latestSnapshots.map((snapshot) => ({
      id: snapshot.id,
      skuId: snapshot.skuId,
      optimizationType: snapshot.optimizationType,
      inputHash: snapshot.inputHash,
      generatedAt: snapshot.generatedAt,
      createdAt: snapshot.createdAt,
      version: versionOf({ decisionSnapshotVersions: snapshot.versions })
    })),
    latestReportSnapshots: reportSnapshots,
    latestReportMetricCaches: reportMetricCaches,
    latestSnapshotPayload: {
      id: latestSnapshotMeta[0]?.id ?? null,
      version: versionOf({ decisionSnapshotVersions: latestSnapshotMeta[0]?.versions }),
      skuDecisionCount: latestSnapshotMeta[0]?.skuDecisionCount ?? 0
    },
    sampleRows
  }, (_key, value) => typeof value === "bigint" ? Number(value) : value, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
