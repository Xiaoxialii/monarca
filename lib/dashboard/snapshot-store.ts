import type { Prisma, PrismaClient } from "@prisma/client";

type SnapshotClient = PrismaClient;
type SnapshotPrismaClient = SnapshotClient & {
  reportSnapshot?: {
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  decisionSnapshot?: {
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateOrNull(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function snapshotPerformance(startedAt: number, source: "snapshot" | "fallback") {
  return {
    source,
    durationMs: Date.now() - startedAt
  };
}

function isFallbackDecisionSnapshot(snapshot: Record<string, unknown> | null) {
  const assumptions = asRecord(snapshot?.assumptions);
  const reasoning = asRecord(snapshot?.reasoning);

  return Boolean(assumptions.fallbackGeneratedAt) || reasoning.generatedFrom === "dashboard_snapshot_fallback";
}

export async function findLatestReportSnapshot(
  prisma: SnapshotClient,
  input: {
    workspaceId: string;
    reportType: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    cacheKey?: string | null;
  }
) {
  const reportSnapshot = (prisma as SnapshotPrismaClient).reportSnapshot;

  if (!reportSnapshot) return null;

  const cacheKey = input.cacheKey ?? null;
  const periodStart = dateOrNull(input.periodStart);
  const periodEnd = dateOrNull(input.periodEnd);

  if (cacheKey) {
    const exact = await reportSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        reportType: input.reportType,
        cacheKey
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (exact) return exact;
  }

  return reportSnapshot.findFirst({
    where: {
      workspaceId: input.workspaceId,
      reportType: input.reportType,
      ...(periodStart || periodEnd
        ? {
            periodStart,
            periodEnd
          }
        : {})
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function upsertReportSnapshot(
  prisma: SnapshotClient,
  input: {
    workspaceId: string;
    reportType: string;
    content: Record<string, unknown>;
    periodStart?: string | null;
    periodEnd?: string | null;
    sourceSnapshotId?: string | null;
    sourceSnapshotVersion?: number | null;
    cacheKey?: string | null;
    warning?: string | null;
  }
) {
  const reportSnapshot = (prisma as SnapshotPrismaClient).reportSnapshot;

  if (!reportSnapshot) return null;

  const cacheKey = input.cacheKey ?? `${input.reportType}:${Date.now()}`;
  const data = {
    reportType: input.reportType,
    periodStart: dateOrNull(input.periodStart),
    periodEnd: dateOrNull(input.periodEnd),
    contentJson: input.content as Prisma.InputJsonValue,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    sourceSnapshotVersion: input.sourceSnapshotVersion ?? null,
    cacheKey,
    warning: input.warning ?? null
  };

  return reportSnapshot.upsert({
    where: {
      workspaceId_reportType_cacheKey: {
        workspaceId: input.workspaceId,
        reportType: input.reportType,
        cacheKey
      }
    },
    create: {
      workspaceId: input.workspaceId,
      ...data
    },
    update: data
  });
}

export async function findLatestDecisionSnapshot(
  prisma: SnapshotClient,
  input: {
    workspaceId: string;
    optimizationType: string;
  }
) {
  const decisionSnapshot = (prisma as SnapshotPrismaClient).decisionSnapshot;

  if (!decisionSnapshot) return null;

  const snapshots = await decisionSnapshot.findMany({
    where: {
      workspaceId: input.workspaceId,
      optimizationType: input.optimizationType
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 5
  });

  return snapshots.find((snapshot) => !isFallbackDecisionSnapshot(snapshot)) ?? null;
}

export async function upsertDecisionSnapshot(
  prisma: SnapshotClient,
  input: {
    workspaceId: string;
    optimizationType: string;
    content: Record<string, unknown>;
    assumptions?: unknown;
    expectedProfitImpact?: number | null;
  }
) {
  const decisionSnapshot = (prisma as SnapshotPrismaClient).decisionSnapshot;

  if (!decisionSnapshot) return null;

  const report = asRecord(input.content.decision_report);
  const portfolioSummary = asRecord(report.portfolioSummary);

  return decisionSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      skuId: "workspace",
      snapshotType: "optimization_report",
      acceptedAction: "snapshot",
      optimizationType: input.optimizationType,
      optimizationGoal: typeof report.optimizationGoal === "string" ? report.optimizationGoal : null,
      assumptions: (input.assumptions ?? null) as Prisma.InputJsonValue,
      recommendationsJson: input.content as Prisma.InputJsonValue,
      expectedProfitImpact: input.expectedProfitImpact ??
        (typeof portfolioSummary.expectedProfitImpact === "number" ? portfolioSummary.expectedProfitImpact : null),
      baselineMetrics: {},
      predictedMetrics: {},
      alternatives: [],
      reasoning: {
        generatedFrom: "canonical_snapshot"
      },
      confidence: typeof report.confidence === "number" ? report.confidence : 0
    }
  });
}
