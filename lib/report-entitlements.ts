import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateReportGenerationAccess } from "@/lib/report-entitlement-rules.mjs";

export type ReportAccessType = "one_time_purchase" | "subscription";
export type ReportAccessReason =
  | "ONE_TIME_REPORT_AVAILABLE"
  | "SUBSCRIPTION_ACTIVE"
  | "SUBSCRIPTION_EXPIRED"
  | "NO_ACCESS";

export type ReportGenerationAccess = {
  allowed: boolean;
  reason?: ReportAccessReason;
  accessType?: ReportAccessType;
};

export type ReportGenerationLogStatus = "started" | "succeeded" | "failed";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export class ReportAccessError extends Error {
  code = "NO_REPORT_ACCESS" as const;
  status = 402;
  upgradeRequired = true;

  constructor(message = "Please choose a plan to generate reports.") {
    super(message);
    this.name = "ReportAccessError";
  }
}

function nowDate() {
  return new Date();
}

export async function ensureReportEntitlement(
  workspaceId: string,
  client: PrismaClientLike = prisma
) {
  return client.reportEntitlement.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      firstFreeReportUsed: false,
      oneTimeReportAvailable: false,
      subscriptionStatus: "free",
      subscriptionPlan: "free",
      monthlyUnlimited: false
    }
  });
}

export async function canGenerateReport(
  workspaceId: string,
  reportType = "full_report",
  client: PrismaClientLike = prisma
): Promise<ReportGenerationAccess> {
  void reportType;
  const entitlement = await ensureReportEntitlement(workspaceId, client);

  return evaluateReportGenerationAccess(entitlement) as ReportGenerationAccess;
}

export async function getReportEntitlementState(workspaceId: string) {
  const access = await canGenerateReport(workspaceId);
  const entitlement = await ensureReportEntitlement(workspaceId);

  return {
    firstFreeReportUsed: entitlement.firstFreeReportUsed,
    firstFreeReportUsedAt: entitlement.firstFreeReportUsedAt,
    oneTimeReportAvailable: entitlement.oneTimeReportAvailable,
    oneTimeReportPurchasedAt: entitlement.oneTimeReportPurchasedAt,
    oneTimeReportUsedAt: entitlement.oneTimeReportUsedAt,
    subscriptionStatus: entitlement.subscriptionStatus,
    subscriptionPlan: entitlement.subscriptionPlan,
    monthlyUnlimited: entitlement.monthlyUnlimited,
    currentPeriodStart: entitlement.currentPeriodStart,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    canGenerateReport: access.allowed,
    reason: access.reason ?? null,
    accessType: access.accessType ?? null,
    upgradeRequired: !access.allowed
  };
}

export async function startReportGeneration(input: {
  workspaceId: string;
  reportType?: string;
  idempotencyKey?: string | null;
}) {
  const reportType = input.reportType ?? "full_report";
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existingLog = await tx.reportGenerationLog.findUnique({
        where: { idempotencyKey }
      });

      if (existingLog) {
        if (existingLog.workspaceId !== input.workspaceId) {
          throw new ReportAccessError();
        }

        if (existingLog.accessType === "blocked") {
          throw new ReportAccessError();
        }

        return {
          log: existingLog,
          access: {
            allowed: true,
            accessType: existingLog.accessType as ReportAccessType
          } satisfies ReportGenerationAccess,
          reused: true
        };
      }
    }

    const access = await canGenerateReport(input.workspaceId, reportType, tx);

    if (!access.allowed || !access.accessType) {
      await tx.reportGenerationLog.create({
        data: {
          workspaceId: input.workspaceId,
          reportType,
          accessType: "blocked",
          status: "failed",
          idempotencyKey,
          errorMessage: access.reason ?? "NO_ACCESS"
        }
      }).catch(() => null);

      throw new ReportAccessError();
    }

    const log = await tx.reportGenerationLog.create({
      data: {
        workspaceId: input.workspaceId,
        reportType,
        accessType: access.accessType,
        status: "started",
        idempotencyKey
      }
    });

    return {
      log,
      access,
      reused: false
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function markReportGenerationSucceeded(input: {
  logId: string;
  workspaceId: string;
  reportId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const log = await tx.reportGenerationLog.findUnique({
      where: { id: input.logId }
    });

    if (!log || log.workspaceId !== input.workspaceId) {
      throw new Error("REPORT_GENERATION_LOG_NOT_FOUND");
    }

    if (log.status === "succeeded") {
      return { log, consumed: false };
    }

    const now = nowDate();
    const updatedLog = await tx.reportGenerationLog.update({
      where: { id: log.id },
      data: {
        reportId: input.reportId,
        status: "succeeded",
        errorMessage: null
      }
    });

    if (log.accessType === "one_time_purchase") {
      await tx.reportEntitlement.update({
        where: { workspaceId: input.workspaceId },
        data: {
          oneTimeReportAvailable: false,
          oneTimeReportUsedAt: now
        }
      });
    }

    return { log: updatedLog, consumed: log.accessType !== "subscription" };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function markReportGenerationFailed(input: {
  logId?: string | null;
  workspaceId: string;
  errorMessage: string;
}) {
  if (!input.logId) return null;
  const logId = input.logId;

  return prisma.$transaction(async (tx) => {
    const log = await tx.reportGenerationLog.findUnique({
      where: { id: logId }
    });

    if (!log || log.workspaceId !== input.workspaceId || log.status === "succeeded") {
      return log;
    }

    return tx.reportGenerationLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        errorMessage: input.errorMessage.slice(0, 1000)
      }
    });
  });
}

export async function grantOneTimeReport(input: {
  workspaceId: string;
  purchasedAt?: Date;
}) {
  return prisma.reportEntitlement.upsert({
    where: { workspaceId: input.workspaceId },
    update: {
      oneTimeReportAvailable: true,
      oneTimeReportPurchasedAt: input.purchasedAt ?? nowDate(),
      subscriptionPlan: "one_time"
    },
    create: {
      workspaceId: input.workspaceId,
      firstFreeReportUsed: false,
      oneTimeReportAvailable: true,
      oneTimeReportPurchasedAt: input.purchasedAt ?? nowDate(),
      subscriptionStatus: "free",
      subscriptionPlan: "one_time",
      monthlyUnlimited: false
    }
  });
}

export async function upsertMonthlyReportEntitlement(input: {
  workspaceId: string;
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}) {
  const active = input.status === "active";

  return prisma.reportEntitlement.upsert({
    where: { workspaceId: input.workspaceId },
    update: {
      subscriptionStatus: input.status,
      subscriptionPlan: active ? "monthly" : "free",
      monthlyUnlimited: active,
      currentPeriodStart: input.currentPeriodStart ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined
    },
    create: {
      workspaceId: input.workspaceId,
      firstFreeReportUsed: false,
      oneTimeReportAvailable: false,
      subscriptionStatus: input.status,
      subscriptionPlan: active ? "monthly" : "free",
      monthlyUnlimited: active,
      currentPeriodStart: input.currentPeriodStart ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined
    }
  });
}
