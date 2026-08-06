// @ts-nocheck
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const EXPECTED = {
  profitabilityEngineVersion: "v2.1-profitability-reconciliation",
  algorithmVersion: "decision-intelligence-v2.1",
  optimizationVersion: "sku-portfolio-optimizer-v2.5-cache-freshness-policy-v1",
  simulationVersion: "sku-portfolio-simulation-v2"
};

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

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function identityOf(payload, row = {}) {
  const record = asRecord(payload);
  const versions = asRecord(record.decisionSnapshotVersions);
  const identity = asRecord(record.calculationIdentity);
  const snapshotIdentity = asRecord(record.snapshotIdentity);
  return {
    profitabilityEngineVersion: firstString(
      row.profitabilityEngineVersion,
      record.profitabilityEngineVersion,
      versions.profitabilityEngineVersion,
      identity.profitabilityEngineVersion,
      snapshotIdentity.profitabilityEngineVersion
    ),
    algorithmVersion: firstString(row.algorithmVersion, versions.algorithmVersion, identity.algorithmVersion),
    optimizationVersion: firstString(row.optimizationVersion, versions.optimizationVersion, identity.optimizationVersion),
    simulationVersion: firstString(row.simulationVersion, versions.simulationVersion, identity.simulationVersion),
    canonicalSnapshotVersion: firstString(
      row.canonicalSnapshotVersion,
      versions.canonicalSnapshotVersion,
      identity.canonicalSnapshotVersion,
      identity.canonicalDataVersion
    ),
    metricSnapshotVersion: firstString(
      row.metricSnapshotVersion,
      versions.metricSnapshotVersion,
      identity.metricSnapshotVersion,
      identity.metricEngineVersion
    ),
    inputHash: firstString(row.inputHash, versions.inputHash, identity.inputHash, identity.dataFingerprint)
  };
}

function freshnessReasons(identity, checks = ["profitabilityEngineVersion"]) {
  const reasons = [];
  for (const key of checks) {
    const expected = EXPECTED[key];
    if (expected && identity[key] !== expected) {
      reasons.push({
        field: key,
        expected,
        found: identity[key] ?? null
      });
    }
  }
  if (!identity.canonicalSnapshotVersion) reasons.push({ field: "canonicalSnapshotVersion", expected: "present", found: null });
  if (!identity.inputHash) reasons.push({ field: "inputHash/dataFingerprint", expected: "present", found: null });
  return reasons;
}

async function main() {
  const workspaceId = args.get("workspaceId") || null;
  const where = workspaceId ? { workspaceId } : {};

  const [optimizationCaches, decisionSnapshots, reportMetricCaches, reportSnapshots] = await Promise.all([
    prisma.optimizationReportCache.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.decisionSnapshot.findMany({
      where: { ...where, snapshotType: "optimization_report" },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.reportMetricCache.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.reportSnapshot.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 20
    })
  ]);

  const optimization = optimizationCaches.map((row) => {
    const identity = identityOf(row.portfolioOptimizationJson, row);
    const queueRows = asArray(row.queueRowsJson).length;
    const portfolioRows = asArray(row.portfolioRowsJson).length;
    const reasons = freshnessReasons(identity, [
      "profitabilityEngineVersion",
      "algorithmVersion",
      "optimizationVersion",
      "simulationVersion"
    ]);
    if ((row.state === "ready" || row.state === "READY") && queueRows === 0 && portfolioRows === 0) {
      reasons.push({ field: "rowCounts", expected: "portfolioRows or queueRows > 0", found: "0/0" });
    }
    return {
      workspaceId: row.workspaceId,
      id: row.id,
      mode: row.mode,
      state: row.state,
      queueRows,
      portfolioRows,
      status: reasons.length ? "STALE" : "FRESH",
      reasons,
      identity
    };
  });

  const decisions = decisionSnapshots.map((row) => {
    const identity = identityOf(row.recommendationsJson, row);
    const reasons = freshnessReasons(identity, [
      "profitabilityEngineVersion",
      "algorithmVersion",
      "optimizationVersion",
      "simulationVersion"
    ]);
    return {
      workspaceId: row.workspaceId,
      id: row.id,
      optimizationType: row.optimizationType,
      status: reasons.length ? "STALE" : "FRESH",
      reasons,
      identity
    };
  });

  const metricCaches = reportMetricCaches.map((row) => {
    const identity = identityOf(row.payloadJson, row);
    const reasons = freshnessReasons(identity, ["profitabilityEngineVersion"]);
    return {
      workspaceId: row.workspaceId,
      id: row.id,
      dateRangePreset: row.dateRangePreset,
      refreshStatus: row.refreshStatus,
      status: reasons.length ? "STALE" : "FRESH",
      reasons,
      identity
    };
  });

  const reports = reportSnapshots.map((row) => {
    const identity = identityOf(row.contentJson, row);
    const reasons = freshnessReasons(identity, ["profitabilityEngineVersion"]);
    return {
      workspaceId: row.workspaceId,
      id: row.id,
      reportType: row.reportType,
      cacheKey: row.cacheKey,
      status: reasons.length ? "STALE" : "FRESH",
      reasons,
      identity
    };
  });

  console.log(JSON.stringify({
    expected: EXPECTED,
    checkedAt: new Date().toISOString(),
    workspaceId,
    OptimizationReportCache: optimization,
    DecisionSnapshot: decisions,
    ReportMetricCache: metricCaches,
    ReportSnapshot: reports
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
