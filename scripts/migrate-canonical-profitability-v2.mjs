import dotenv from "dotenv";
import { register } from "node:module";
import { PrismaClient, WorkspaceMemberStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

register("./ts-path-loader.mjs", import.meta.url);

dotenv.config({ path: ".env.local" });
dotenv.config();

const CANONICAL_PROFITABILITY_ENGINE_VERSION = "v2";

const DEFAULT_SAMPLE_SKUS = ["SKU_00479", "SKU_01299", "SKU_01588"];

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

async function workspaceIdFromEmail(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: {
      memberships: {
        include: { workspace: true },
        orderBy: [
          { status: "asc" },
          { joinedAt: "asc" },
          { createdAt: "asc" }
        ]
      }
    }
  });

  const membership = user?.memberships.find((row) => row.status === WorkspaceMemberStatus.ACTIVE)
    ?? user?.memberships[0]
    ?? null;

  return membership?.workspaceId ?? null;
}

async function latestOptimizationCache(workspaceId, mode) {
  return prisma.optimizationReportCache.findUnique({
    where: {
      workspaceId_mode: {
        workspaceId,
        mode
      }
    },
    select: {
      id: true,
      mode: true,
      inputHash: true,
      generatedAt: true,
      portfolioSummaryJson: true
    }
  }).catch(() => null);
}

function extractSampleProfitRow(row) {
  const record = asRecord(row);
  const evidence = asRecord(record.evidence);
  const impact = asRecord(record.impact);
  const validation = asRecord(record.validation);
  const decisionContract = asRecord(record.decision_contract);
  const contractEvidence = asRecord(decisionContract.evidence);
  const policyTrace = asRecord(record.policy_trace);
  const policyMetrics = asRecord(policyTrace.metrics);

  return {
    sku: record.sku ?? record.sku_id ?? evidence.sku ?? null,
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
    ads: firstNumber(record.ads_spend, record.ad_cost_allocated, evidence.ads_spend, evidence.ad_cost_allocated, contractEvidence.adBudgetChange, policyMetrics.adSpend),
    totalCost: firstNumber(record.total_cost, record.totalCost, evidence.total_cost, evidence.totalCost, contractEvidence.total_cost),
    netProfit: firstNumber(record.net_profit, record.netProfit, evidence.net_profit, evidence.netProfit, contractEvidence.netProfit, policyMetrics.netProfit),
    margin: firstNumber(record.margin, evidence.margin, contractEvidence.margin, policyMetrics.margin),
    optimizationAllowed: typeof record.optimization_allowed === "boolean"
      ? record.optimization_allowed
      : typeof evidence.optimization_allowed === "boolean"
        ? evidence.optimization_allowed
        : typeof contractEvidence.optimization_allowed === "boolean"
          ? contractEvidence.optimization_allowed
        : typeof validation.optimization_allowed === "boolean"
          ? validation.optimization_allowed
          : null,
    confidence: firstNumber(record.confidence, record.profitability_confidence, evidence.confidence, evidence.profitability_confidence, decisionContract.confidence, policyMetrics.confidence),
    expectedProfitImpact: firstNumber(record.expectedProfitImpact, record.expected_profit_impact, impact.expected_profit_change),
    validationStatus: record.validation_status ?? validation.status ?? validation.validation_status ?? null,
    profitabilityEngineVersion: record.profitabilityEngineVersion ?? evidence.profitabilityEngineVersion ?? null
  };
}

async function persistedProfitabilityOutputCounts(workspaceId) {
  const [
    reportMetricCaches,
    optimizationReportCaches,
    decisionSnapshots,
    reportSnapshots
  ] = await Promise.all([
    prisma.reportMetricCache.count({ where: { workspaceId } }).catch(() => 0),
    prisma.optimizationReportCache.count({ where: { workspaceId } }).catch(() => 0),
    prisma.decisionSnapshot.count({ where: { workspaceId } }).catch(() => 0),
    prisma.reportSnapshot.count({ where: { workspaceId } }).catch(() => 0)
  ]);
  const decisionSnapshotsWithRecommendations = decisionSnapshots;

  return {
    ReportMetricCache: reportMetricCaches,
    OptimizationReportCache: optimizationReportCaches,
    DecisionSnapshot: decisionSnapshots,
    ReportSnapshot: reportSnapshots,
    recommendationsJson: decisionSnapshotsWithRecommendations
  };
}

function cacheProfitabilitySummary(cache, sampleSkus = DEFAULT_SAMPLE_SKUS) {
  if (!cache) return null;
  const summary = asRecord(cache.portfolioSummaryJson);

  return {
    cacheId: cache.id,
    mode: cache.mode,
    generatedAt: cache.generatedAt?.toISOString?.() ?? null,
    inputHash: cache.inputHash,
    totalProfitImpact: numberOrNull(summary.totalProfitImpact ?? summary.expectedProfitImpact),
    acceptedProfitImpact: numberOrNull(summary.acceptedProfitImpact),
    sampleRows: sampleSkus.map((sku) => ({ sku, deferredToVerificationScript: true }))
  };
}

async function markOldCachesStale(workspaceId, now) {
  const staleTag = `stale-before-${CANONICAL_PROFITABILITY_ENGINE_VERSION}:${now.toISOString()}`;

  const reportMetricCaches = await prisma.reportMetricCache.updateMany({
    where: { workspaceId },
    data: {
      refreshStatus: "stale",
      staleAt: now
    }
  }).catch(() => ({ count: 0 }));

  const optimizationCaches = await prisma.optimizationReportCache.updateMany({
    where: { workspaceId },
    data: {
      inputHash: staleTag
    }
  }).catch(() => ({ count: 0 }));

  const decisionSnapshots = await prisma.decisionSnapshot.updateMany({
    where: {
      workspaceId,
      snapshotType: "optimization_report"
    },
    data: {
      inputHash: staleTag
    }
  }).catch(() => ({ count: 0 }));

  const reportSnapshots = await prisma.reportSnapshot.updateMany({
    where: {
      workspaceId,
      OR: [
        { warning: null },
        { NOT: { warning: { contains: `stale-before-${CANONICAL_PROFITABILITY_ENGINE_VERSION}` } } }
      ]
    },
    data: {
      warning: staleTag
    }
  }).catch(() => ({ count: 0 }));

  return {
    reportMetricCaches: reportMetricCaches.count,
    optimizationReportCaches: optimizationCaches.count,
    decisionSnapshots: decisionSnapshots.count,
    reportSnapshots: reportSnapshots.count
  };
}

async function main() {
  const email = args.get("email");
  const explicitWorkspaceId = args.get("workspaceId");
  const workspaceId = explicitWorkspaceId || (email ? await workspaceIdFromEmail(email) : null);

  if (!workspaceId) {
    throw new Error("Usage: node scripts/migrate-canonical-profitability-v2.mjs --workspaceId=... or --email=user@example.com [--mode=full|sku|all] [--dryRun=true]");
  }

  const mode = args.get("mode") || "all";
  const sampleSkus = String(args.get("sampleSkus") || DEFAULT_SAMPLE_SKUS.join(","))
    .split(",")
    .map((sku) => sku.trim())
    .filter(Boolean);
  const modes = mode === "full"
    ? ["full"]
    : mode === "sku"
      ? ["sku"]
      : ["full", "sku"];
  const dryRun = args.get("dryRun") === "true";
  const now = new Date();
  const currentInputHash = `pending-regeneration-${CANONICAL_PROFITABILITY_ENGINE_VERSION}`;
  const persistedOutputsBefore = await persistedProfitabilityOutputCounts(workspaceId);
  const before = {};

  for (const item of modes) {
    before[item] = cacheProfitabilitySummary(await latestOptimizationCache(workspaceId, item), sampleSkus);
  }

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      workspaceId,
      profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
      sampleSkus,
      currentInputHash,
      persistedOutputsBefore,
      before
    }, null, 2));
    return;
  }

  const staleCounts = await markOldCachesStale(workspaceId, now);
  const { generateEcommerceDecisionSnapshots } = await import("../lib/dashboard/decision-snapshot-generator.ts");
  const regeneration = await generateEcommerceDecisionSnapshots(prisma, {
    workspaceId,
    dataSourceId: null,
    sourceJobId: null,
    modes
  });
  const after = {};
  const persistedOutputsAfter = await persistedProfitabilityOutputCounts(workspaceId);

  for (const item of modes) {
    after[item] = cacheProfitabilitySummary(await latestOptimizationCache(workspaceId, item), sampleSkus);
  }

  console.log(JSON.stringify({
    ok: true,
    workspaceId,
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    sampleSkus,
    currentInputHash,
    persistedOutputsBefore,
    persistedOutputsAfter,
    staleCounts,
    regeneration,
    verification: {
      before,
      after
    }
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
