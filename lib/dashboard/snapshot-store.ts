import type { Prisma, PrismaClient } from "@prisma/client";
import { CANONICAL_PROFITABILITY_ENGINE_VERSION } from "../profit/canonical-profitability-engine";

type SnapshotClient = PrismaClient;
type SnapshotPrismaClient = SnapshotClient & {
  reportSnapshot?: {
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  decisionSnapshot?: {
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadProfitabilityEngineVersion(value: unknown) {
  const record = asRecord(value);
  const direct = record.profitabilityEngineVersion ?? record.profitability_engine_version;
  if (typeof direct === "string") return direct;

  const versions = asRecord(record.decisionSnapshotVersions);
  const nested = versions.profitabilityEngineVersion ?? versions.profitability_engine_version;
  return typeof nested === "string" ? nested : null;
}

export function isCurrentProfitabilitySnapshot(value: unknown) {
  return payloadProfitabilityEngineVersion(value) === CANONICAL_PROFITABILITY_ENGINE_VERSION;
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

    if (exact && isCurrentProfitabilitySnapshot(exact.contentJson)) return exact;
  }

  const snapshots = await reportSnapshot.findMany({
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
    },
    take: 10
  });

  return snapshots.find((snapshot) => isCurrentProfitabilitySnapshot(snapshot?.contentJson)) ?? null;
}

export async function findLatestReportSnapshotLegacy(
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
  const content = {
    ...input.content,
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION
  };
  const data = {
    reportType: input.reportType,
    periodStart: dateOrNull(input.periodStart),
    periodEnd: dateOrNull(input.periodEnd),
    contentJson: content as Prisma.InputJsonValue,
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
    update: data,
    select: {
      id: true,
      workspaceId: true,
      reportType: true,
      cacheKey: true,
      updatedAt: true
    }
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
    select: {
      id: true,
      assumptions: true,
      reasoning: true,
      algorithmVersion: true,
      optimizationVersion: true,
      canonicalSnapshotVersion: true,
      metricSnapshotVersion: true,
      simulationVersion: true,
      inputHash: true,
      generatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 10
  });
  const latest = snapshots.find((snapshot) => !isFallbackDecisionSnapshot(snapshot));

  if (!latest?.id) return null;

  return decisionSnapshot.findUnique({
    where: {
      id: latest.id
    },
    select: {
      id: true,
      workspaceId: true,
      optimizationType: true,
      algorithmVersion: true,
      optimizationVersion: true,
      canonicalSnapshotVersion: true,
      metricSnapshotVersion: true,
      simulationVersion: true,
      inputHash: true,
      generatedAt: true,
      createdAt: true,
      recommendationsJson: true
    }
  });
}

export async function upsertDecisionSnapshot(
  prisma: SnapshotClient,
  input: {
    workspaceId: string;
    optimizationType: string;
    content: Record<string, unknown>;
    assumptions?: unknown;
    expectedProfitImpact?: number | null;
    algorithmVersion?: string | null;
    optimizationVersion?: string | null;
    canonicalSnapshotVersion?: string | null;
    metricSnapshotVersion?: string | null;
    simulationVersion?: string | null;
    inputHash?: string | null;
    generatedAt?: Date | null;
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
      algorithmVersion: input.algorithmVersion ?? null,
      optimizationVersion: input.optimizationVersion ?? null,
      canonicalSnapshotVersion: input.canonicalSnapshotVersion ?? null,
      metricSnapshotVersion: input.metricSnapshotVersion ?? null,
      simulationVersion: input.simulationVersion ?? null,
      inputHash: input.inputHash ?? null,
      generatedAt: input.generatedAt ?? new Date(),
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
