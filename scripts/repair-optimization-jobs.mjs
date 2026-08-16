import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
}

const apply = args.get("apply") === "true";
const workspaceId = args.get("workspaceId") || null;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const queuedStaleMs = Number(process.env.OPTIMIZATION_QUEUED_STALE_MS || 15 * 60 * 1000);
const heartbeatStaleMs = Number(process.env.OPTIMIZATION_HEARTBEAT_STALE_MS || 10 * 60 * 1000);
const now = new Date();
const queuedBefore = new Date(now.getTime() - queuedStaleMs);
const heartbeatBefore = new Date(now.getTime() - heartbeatStaleMs);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ["error"]
});

function workspaceWhere() {
  return workspaceId ? { workspaceId } : {};
}

async function main() {
  const [
    staleQueued,
    staleProcessing,
    duplicateGroups,
    incompleteCompleted,
    latestSnapshots
  ] = await Promise.all([
    prisma.asyncJob.findMany({
      where: {
        ...workspaceWhere(),
        type: "SKU_OPTIMIZATION",
        status: "QUEUED",
        updatedAt: { lt: queuedBefore }
      },
      select: { id: true, workspaceId: true, identity: true, createdAt: true, updatedAt: true, currentStep: true },
      orderBy: { updatedAt: "asc" },
      take: 200
    }),
    prisma.asyncJob.findMany({
      where: {
        ...workspaceWhere(),
        type: "SKU_OPTIMIZATION",
        status: { in: ["PROCESSING", "PAUSED"] },
        OR: [
          { leaseExpiresAt: { lt: now } },
          { leaseExpiresAt: null, heartbeatAt: { lt: heartbeatBefore } },
          { leaseExpiresAt: null, heartbeatAt: null, updatedAt: { lt: heartbeatBefore } }
        ]
      },
      select: { id: true, workspaceId: true, identity: true, heartbeatAt: true, leaseExpiresAt: true, updatedAt: true, currentStep: true },
      orderBy: { updatedAt: "asc" },
      take: 200
    }),
    prisma.asyncJob.groupBy({
      by: ["workspaceId", "identity"],
      where: {
        ...workspaceWhere(),
        type: "SKU_OPTIMIZATION",
        identity: { not: null },
        status: { in: ["QUEUED", "PROCESSING", "PAUSED"] }
      },
      _count: { _all: true },
      having: { identity: { _count: { gt: 1 } } },
      orderBy: [
        { workspaceId: "asc" },
        { identity: "asc" }
      ],
      take: 100
    }),
    prisma.asyncJob.findMany({
      where: {
        ...workspaceWhere(),
        type: "SKU_OPTIMIZATION",
        status: "COMPLETED",
        OR: [
          { resultReference: { equals: null } },
          { resultReference: { equals: {} } }
        ]
      },
      select: { id: true, workspaceId: true, identity: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 100
    }),
    prisma.schemaSnapshot.findMany({
      where: {
        ...workspaceWhere(),
        dataSourceId: { not: null },
        dataSource: { isActive: true, status: "CONNECTED" }
      },
      distinct: ["workspaceId"],
      select: {
        id: true,
        workspaceId: true,
        dataSourceId: true,
        version: true,
        schemaStatus: true,
        canonicalStatus: true,
        canonicalVersion: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);

  const summary = {
    dryRun: !apply,
    workspaceId,
    staleQueued: staleQueued.length,
    staleProcessing: staleProcessing.length,
    duplicateActiveIdentities: duplicateGroups.length,
    completedWithoutResultReference: incompleteCompleted.length,
    latestConnectedSnapshotsPending: latestSnapshots.filter((snapshot) =>
      snapshot.schemaStatus !== "READY" || snapshot.canonicalStatus !== "READY" || !snapshot.canonicalVersion
    ).length
  };

  console.log(JSON.stringify({
    ok: true,
    summary,
    staleQueued,
    staleProcessing,
    duplicateGroups,
    incompleteCompleted,
    latestSnapshots
  }, null, 2));

  if (!apply) return;

  const [queuedRepair, processingRepair] = await Promise.all([
    prisma.asyncJob.updateMany({
      where: { id: { in: staleQueued.map((job) => job.id) }, status: "QUEUED" },
      data: {
        status: "FAILED",
        progress: 100,
        currentStep: "Failed - queue timeout",
        errorCode: "JOB_QUEUE_TIMEOUT",
        errorMessage: "Optimization job stayed queued past the configured timeout.",
        failedAt: now,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: now
      }
    }),
    prisma.asyncJob.updateMany({
      where: { id: { in: staleProcessing.map((job) => job.id) }, status: { in: ["PROCESSING", "PAUSED"] } },
      data: {
        status: "FAILED",
        progress: 100,
        currentStep: "Failed - heartbeat timeout",
        errorCode: "JOB_HEARTBEAT_TIMEOUT",
        errorMessage: "Optimization job heartbeat expired before completion.",
        failedAt: now,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: now
      }
    })
  ]);

  console.log(JSON.stringify({
    ok: true,
    applied: true,
    queuedMarkedFailed: queuedRepair.count,
    processingMarkedFailed: processingRepair.count
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
