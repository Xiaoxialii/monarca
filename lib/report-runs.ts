import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, ReportRun } from "@prisma/client";
import type { ReportMetricCachePayload } from "@/lib/report-metric-cache";

type ReportRunDateRange = {
  preset: string;
  startDate?: string | null;
  endDate?: string | null;
  previousStart?: Date | null;
  previousEnd?: Date | null;
};

export type ReportRunScopeInput = {
  workspaceId: string;
  generatedByUserId?: string | null;
  primaryDataSourceId?: string | null;
  dataSourceIds: string[];
  reportMode: string;
  dateRange: ReportRunDateRange;
  sourceSnapshotVersion?: number | null;
  schemaSnapshotId?: string | null;
  semanticSnapshotVersion?: string | null;
  semanticSchemaHash?: string | null;
  domain?: string | null;
  cacheKey: string;
};

export type CompletedReportRunInput = ReportRunScopeInput & {
  payload: ReportMetricCachePayload | Record<string, unknown>;
  composedReport?: unknown;
  briefingPayload?: unknown;
  reportHistoryId?: string | null;
  dailyBriefingId?: string | null;
  status?: string;
};

function dateOnly(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

export function reportRunScopeMetadata(scope: ReportRunScopeInput) {
  return {
    primaryDataSourceId: scope.primaryDataSourceId ?? scope.dataSourceIds[0] ?? null,
    dataSourceIds: [...scope.dataSourceIds].sort(),
    reportMode: scope.reportMode,
    dateRange: {
      preset: scope.dateRange.preset,
      startDate: scope.dateRange.startDate ?? null,
      endDate: scope.dateRange.endDate ?? null,
      previousStartDate: scope.dateRange.previousStart ? scope.dateRange.previousStart.toISOString().slice(0, 10) : null,
      previousEndDate: scope.dateRange.previousEnd ? scope.dateRange.previousEnd.toISOString().slice(0, 10) : null
    },
    sourceSnapshotVersion: scope.sourceSnapshotVersion ?? null,
    schemaSnapshotId: scope.schemaSnapshotId ?? null,
    semanticSnapshotVersion: scope.semanticSnapshotVersion ?? null,
    semanticSchemaHash: scope.semanticSchemaHash ?? null,
    domain: scope.domain ?? null,
    cacheKey: scope.cacheKey
  };
}

export function reportRunApiMetadata(reportRun: Pick<
  ReportRun,
  | "id"
  | "generatedByUserId"
  | "primaryDataSourceId"
  | "dataSourceIds"
  | "reportMode"
  | "dateRangeStart"
  | "dateRangeEnd"
  | "sourceSnapshotVersion"
  | "schemaSnapshotId"
  | "semanticSnapshotVersion"
  | "semanticSchemaHash"
  | "domain"
  | "cacheKey"
  | "status"
  | "createdAt"
  | "updatedAt"
>) {
  return {
    reportRunId: reportRun.id,
    generatedByUserId: reportRun.generatedByUserId,
    primaryDataSourceId: reportRun.primaryDataSourceId,
    dataSourceIds: Array.isArray(reportRun.dataSourceIds) ? reportRun.dataSourceIds.filter((item): item is string => typeof item === "string") : [],
    reportMode: reportRun.reportMode,
    dateRange: {
      startDate: reportRun.dateRangeStart ? reportRun.dateRangeStart.toISOString().slice(0, 10) : null,
      endDate: reportRun.dateRangeEnd ? reportRun.dateRangeEnd.toISOString().slice(0, 10) : null
    },
    sourceSnapshotVersion: reportRun.sourceSnapshotVersion,
    schemaSnapshotId: reportRun.schemaSnapshotId,
    semanticSnapshotVersion: reportRun.semanticSnapshotVersion,
    semanticSchemaHash: reportRun.semanticSchemaHash,
    domain: reportRun.domain,
    cacheKey: reportRun.cacheKey,
    status: reportRun.status,
    createdAt: reportRun.createdAt.toISOString(),
    updatedAt: reportRun.updatedAt.toISOString()
  };
}

export function attachReportRunMetadata<T extends Record<string, unknown>>(
  payload: T,
  reportRun: Parameters<typeof reportRunApiMetadata>[0]
) {
  return {
    ...payload,
    reportRun: reportRunApiMetadata(reportRun),
    reportRunId: reportRun.id,
    primaryDataSourceId: reportRun.primaryDataSourceId,
    dataSourceIds: Array.isArray(reportRun.dataSourceIds) ? reportRun.dataSourceIds.filter((item): item is string => typeof item === "string") : payload.dataSourceIds,
    sourceSnapshotVersion: reportRun.sourceSnapshotVersion,
    schemaSnapshotId: reportRun.schemaSnapshotId,
    semanticSnapshotVersion: reportRun.semanticSnapshotVersion,
    semanticSchemaHash: reportRun.semanticSchemaHash,
    domain: reportRun.domain,
    cacheKey: reportRun.cacheKey
  };
}

export async function findCompletedReportRun(
  prisma: PrismaClient,
  scope: Pick<ReportRunScopeInput, "workspaceId" | "cacheKey">
) {
  return prisma.reportRun.findUnique({
    where: {
      workspaceId_cacheKey: {
        workspaceId: scope.workspaceId,
        cacheKey: scope.cacheKey
      }
    }
  }).then((reportRun) => reportRun?.status === "completed" ? reportRun : null);
}

export async function upsertCompletedReportRun(
  prisma: PrismaClient,
  input: CompletedReportRunInput
) {
  const dataSourceIds = [...input.dataSourceIds].sort();
  const primaryDataSourceId = input.primaryDataSourceId ?? dataSourceIds[0] ?? null;
  const data = {
    generatedByUserId: input.generatedByUserId ?? null,
    primaryDataSourceId,
    dataSourceIds: dataSourceIds as unknown as Prisma.InputJsonValue,
    reportMode: input.reportMode,
    dateRangeStart: dateOnly(input.dateRange.startDate),
    dateRangeEnd: dateOnly(input.dateRange.endDate),
    sourceSnapshotVersion: input.sourceSnapshotVersion ?? null,
    schemaSnapshotId: input.schemaSnapshotId ?? null,
    semanticSnapshotVersion: input.semanticSnapshotVersion ?? null,
    semanticSchemaHash: input.semanticSchemaHash ?? null,
    domain: input.domain ?? null,
    status: input.status ?? "completed",
    payloadJson: jsonValue(input.payload),
    composedReportJson: jsonValue(input.composedReport),
    briefingPayloadJson: jsonValue(input.briefingPayload ?? input.payload),
    reportHistoryId: input.reportHistoryId ?? null,
    dailyBriefingId: input.dailyBriefingId ?? null
  };

  return prisma.reportRun.upsert({
    where: {
      workspaceId_cacheKey: {
        workspaceId: input.workspaceId,
        cacheKey: input.cacheKey
      }
    },
    create: {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      cacheKey: input.cacheKey,
      ...data
    },
    update: data
  });
}
