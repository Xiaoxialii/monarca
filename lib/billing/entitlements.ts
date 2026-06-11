import {
  BillingCycle,
  BillingProvider,
  PaymentOrderStatus,
  PlanType,
  Prisma,
  SubscriptionStatus
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getReportEntitlementState } from "@/lib/report-entitlements";

export type BillingAccessPlanType = "FREE" | "ONE_TIME" | "MONTHLY";
export type BillingAccessStatus = "free" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "expired";

export type BillingAccessState = {
  planType: BillingAccessPlanType;
  status: BillingAccessStatus;
  canConnectDataSource: boolean;
  canGenerateReport: boolean;
  remainingReportGenerations: number | null;
  isUnlimitedReports: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  upgradeRequiredReason: string | null;
};

export type BillingEntitlementErrorCode =
  | "PLAN_REQUIRED"
  | "REPORT_LIMIT_REACHED"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT_REQUIRED";

export class BillingEntitlementError extends Error {
  code: BillingEntitlementErrorCode;
  status = 402;

  constructor(code: BillingEntitlementErrorCode, message: string) {
    super(message);
    this.name = "BillingEntitlementError";
    this.code = code;
  }
}

export function billingEntitlementMessage(
  error: BillingEntitlementError,
  locale: "zh" | "en" = "en"
) {
  const messages: Record<BillingEntitlementErrorCode, Record<"zh" | "en", string>> = {
    PLAN_REQUIRED: {
      zh: "请先升级套餐后再连接数据源。",
      en: "Please choose a plan to connect data sources."
    },
    REPORT_LIMIT_REACHED: {
      zh: "当前套餐不可继续生成报告，请升级套餐。",
      en: "Your current plan cannot generate more reports. Please upgrade your plan."
    },
    SUBSCRIPTION_EXPIRED: {
      zh: "你的套餐当前不可用，请先更新或升级套餐。",
      en: "Your subscription is not active."
    },
    PAYMENT_REQUIRED: {
      zh: "请先升级套餐后再生成报告。",
      en: "Please choose a plan to generate reports."
    }
  };

  return messages[error.code]?.[locale] ?? error.message;
}

export function billingLocaleFromRequest(request: Request): "zh" | "en" {
  return request.headers.get("accept-language")?.toLowerCase().includes("zh") ? "zh" : "en";
}

function statusToApi(status: SubscriptionStatus): BillingAccessStatus {
  const map: Record<SubscriptionStatus, BillingAccessStatus> = {
    FREE: "free",
    ACTIVE: "active",
    TRIALING: "trialing",
    PAST_DUE: "past_due",
    CANCELED: "canceled",
    UNPAID: "unpaid",
    EXPIRED: "expired"
  };

  return map[status];
}

function isPeriodUsable(subscription: { status: SubscriptionStatus; currentPeriodEnd: Date | null }) {
  const now = new Date();

  if (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.TRIALING) {
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now;
  }

  return subscription.status === SubscriptionStatus.CANCELED &&
    Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd > now);
}

async function expireEndedWorkspaceSubscriptions(tx: Prisma.TransactionClient | typeof prisma, workspaceId: string) {
  await tx.workspaceSubscription.updateMany({
    where: {
      workspaceId,
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELED]
      },
      currentPeriodEnd: {
        lt: new Date()
      }
    },
    data: {
      status: SubscriptionStatus.EXPIRED,
      cancelAtPeriodEnd: false
    }
  });
}

async function getLatestWorkspaceSubscription(
  tx: Prisma.TransactionClient | typeof prisma,
  workspaceId: string
) {
  await expireEndedWorkspaceSubscriptions(tx, workspaceId);

  const monthly = await tx.workspaceSubscription.findFirst({
    where: {
      workspaceId,
      planType: PlanType.MONTHLY
    },
    orderBy: [
      { currentPeriodEnd: "desc" },
      { createdAt: "desc" }
    ]
  });

  if (monthly && isPeriodUsable(monthly)) {
    return monthly;
  }

  const oneTime = await tx.workspaceSubscription.findFirst({
    where: {
      workspaceId,
      planType: PlanType.ONE_TIME,
      status: SubscriptionStatus.ACTIVE
    },
    orderBy: { createdAt: "desc" }
  });

  return oneTime ?? monthly;
}

async function getOneTimeAllowanceSummary(tx: Prisma.TransactionClient | typeof prisma, workspaceId: string) {
  const aggregate = await tx.workspaceUsageAllowance.aggregate({
    where: { workspaceId },
    _sum: {
      reportGenerationsAllowed: true,
      reportGenerationsUsed: true
    }
  });
  const allowed = aggregate._sum.reportGenerationsAllowed ?? 0;
  const used = aggregate._sum.reportGenerationsUsed ?? 0;

  return {
    allowed,
    used,
    remaining: Math.max(0, allowed - used)
  };
}

export async function getBillingAccessState(workspaceId: string): Promise<BillingAccessState> {
  const subscription = await getLatestWorkspaceSubscription(prisma, workspaceId);
  const allowance = await getOneTimeAllowanceSummary(prisma, workspaceId);
  const reportEntitlement = await getReportEntitlementState(workspaceId);
  const hasMonthlyAccess = Boolean(
    subscription &&
    subscription.planType === PlanType.MONTHLY &&
    isPeriodUsable(subscription)
  );
  const hasOneTimePurchase = allowance.allowed > 0 || Boolean(
    subscription &&
    subscription.planType === PlanType.ONE_TIME &&
    subscription.status === SubscriptionStatus.ACTIVE
  );
  const canConnectDataSource = hasMonthlyAccess || hasOneTimePurchase;
  const canGenerateReport = reportEntitlement.canGenerateReport;
  const planType: BillingAccessPlanType = hasMonthlyAccess
    ? "MONTHLY"
    : hasOneTimePurchase || reportEntitlement.oneTimeReportAvailable
      ? "ONE_TIME"
      : "FREE";
  const status = subscription ? statusToApi(subscription.status) : "free";
  const upgradeRequiredReason = canGenerateReport
    ? null
    : planType === "ONE_TIME"
      ? "ONE_TIME_REPORT_USED"
      : reportEntitlement.reason === "SUBSCRIPTION_EXPIRED" || status === "past_due" || status === "unpaid" || status === "expired"
        ? "SUBSCRIPTION_INACTIVE"
        : "PLAN_REQUIRED";
  const remainingReportGenerations = reportEntitlement.monthlyUnlimited && reportEntitlement.subscriptionStatus === "active"
    ? null
    : reportEntitlement.oneTimeReportAvailable
      ? 1
      : 0;

  return {
    planType,
    status,
    canConnectDataSource,
    canGenerateReport,
    remainingReportGenerations,
    isUnlimitedReports: reportEntitlement.monthlyUnlimited && reportEntitlement.subscriptionStatus === "active",
    currentPeriodEnd: reportEntitlement.currentPeriodEnd ?? subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    upgradeRequiredReason
  };
}

export async function canConnectDataSource(workspaceId: string) {
  const state = await getBillingAccessState(workspaceId);

  return state.canConnectDataSource;
}

export async function canGenerateReport(workspaceId: string) {
  const state = await getBillingAccessState(workspaceId);

  return state.canGenerateReport;
}

export async function requireCanConnectDataSource(workspaceId: string) {
  const state = await getBillingAccessState(workspaceId);

  if (!state.canConnectDataSource) {
    throw new BillingEntitlementError("PLAN_REQUIRED", "Please choose a plan to connect data sources.");
  }

  return state;
}

export async function requireCanGenerateReport(workspaceId: string) {
  const state = await getBillingAccessState(workspaceId);

  if (!state.canGenerateReport) {
    if (state.planType === "ONE_TIME") {
      throw new BillingEntitlementError(
        "REPORT_LIMIT_REACHED",
        "Your current plan cannot generate more reports. Please upgrade your plan."
      );
    }

    if (state.status === "past_due" || state.status === "unpaid" || state.status === "expired") {
      throw new BillingEntitlementError("SUBSCRIPTION_EXPIRED", "Your subscription is not active.");
    }

    throw new BillingEntitlementError("PAYMENT_REQUIRED", "Please choose a plan to generate reports.");
  }

  return state;
}

export async function consumeReportGeneration(workspaceId: string, reportId: string) {
  return prisma.$transaction(async (tx) => {
    const subscription = await getLatestWorkspaceSubscription(tx, workspaceId);

    if (subscription?.planType === PlanType.MONTHLY && isPeriodUsable(subscription)) {
      return {
        consumed: false,
        remainingReportGenerations: null,
        allowanceId: null,
        reportId
      };
    }

    const allowances = await tx.workspaceUsageAllowance.findMany({
      where: {
        workspaceId,
        reportGenerationsAllowed: {
          gt: 0
        }
      },
      orderBy: { createdAt: "asc" }
    });

    for (const allowance of allowances) {
      const remaining = allowance.reportGenerationsAllowed - allowance.reportGenerationsUsed;

      if (remaining <= 0) continue;

      const updated = await tx.workspaceUsageAllowance.updateMany({
        where: {
          id: allowance.id,
          reportGenerationsUsed: allowance.reportGenerationsUsed,
          reportGenerationsAllowed: {
            gt: allowance.reportGenerationsUsed
          }
        },
        data: {
          reportGenerationsUsed: {
            increment: 1
          }
        }
      });

      if (updated.count !== 1) continue;

      const summary = await getOneTimeAllowanceSummary(tx, workspaceId);

      return {
        consumed: true,
        remainingReportGenerations: summary.remaining,
        allowanceId: allowance.id,
        reportId
      };
    }

    throw new BillingEntitlementError(
      "REPORT_LIMIT_REACHED",
      "Your current plan cannot generate more reports. Please upgrade your plan."
    );
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function grantOneTimeReportAllowance(input: {
  workspaceId: string;
  providerPaymentIntentId: string;
  providerCustomerId?: string | null;
  provider?: BillingProvider;
  source?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const monthly = await tx.workspaceSubscription.findFirst({
      where: {
        workspaceId: input.workspaceId,
        planType: PlanType.MONTHLY
      },
      orderBy: [{ currentPeriodEnd: "desc" }, { createdAt: "desc" }]
    });
    const hasActiveMonthly = Boolean(monthly && isPeriodUsable(monthly));

    if (!hasActiveMonthly) {
      await tx.workspaceSubscription.upsert({
        where: {
          providerSubscriptionId: `one_time:${input.providerPaymentIntentId}`
        },
        update: {
          status: SubscriptionStatus.ACTIVE,
          providerPaymentIntentId: input.providerPaymentIntentId,
          providerCustomerId: input.providerCustomerId ?? undefined
        },
        create: {
          workspaceId: input.workspaceId,
          planType: PlanType.ONE_TIME,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.ONE_TIME,
          provider: input.provider ?? BillingProvider.STRIPE,
          providerCustomerId: input.providerCustomerId ?? undefined,
          providerSubscriptionId: `one_time:${input.providerPaymentIntentId}`,
          providerPaymentIntentId: input.providerPaymentIntentId
        }
      });
    }

    const allowance = await tx.workspaceUsageAllowance.upsert({
      where: {
        workspaceId_referenceId: {
          workspaceId: input.workspaceId,
          referenceId: input.providerPaymentIntentId
        }
      },
      update: {},
      create: {
        workspaceId: input.workspaceId,
        reportGenerationsAllowed: 1,
        reportGenerationsUsed: 0,
        source: input.source ?? "one_time_purchase",
        referenceId: input.providerPaymentIntentId
      }
    });
    await tx.reportEntitlement.upsert({
      where: { workspaceId: input.workspaceId },
      update: {
        oneTimeReportAvailable: true,
        oneTimeReportPurchasedAt: new Date(),
        subscriptionPlan: "one_time"
      },
      create: {
        workspaceId: input.workspaceId,
        firstFreeReportUsed: false,
        oneTimeReportAvailable: true,
        oneTimeReportPurchasedAt: new Date(),
        subscriptionStatus: "free",
        subscriptionPlan: "one_time",
        monthlyUnlimited: false
      }
    });

    return {
      allowance,
      skippedSubscriptionDowngrade: hasActiveMonthly
    };
  });
}

export async function upsertMonthlyWorkspaceSubscription(input: {
  workspaceId: string;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}) {
  const status = input.status ?? SubscriptionStatus.ACTIVE;
  const isActive = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.workspaceSubscription.upsert({
      where: {
        providerSubscriptionId: input.providerSubscriptionId
      },
      update: {
        planType: PlanType.MONTHLY,
        status,
        billingCycle: BillingCycle.MONTHLY,
        provider: BillingProvider.STRIPE,
        providerCustomerId: input.providerCustomerId ?? undefined,
        currentPeriodStart: input.currentPeriodStart ?? undefined,
        currentPeriodEnd: input.currentPeriodEnd ?? undefined,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        canceledAt: input.canceledAt ?? undefined
      },
      create: {
        workspaceId: input.workspaceId,
        planType: PlanType.MONTHLY,
        status,
        billingCycle: BillingCycle.MONTHLY,
        provider: BillingProvider.STRIPE,
        providerCustomerId: input.providerCustomerId ?? undefined,
        providerSubscriptionId: input.providerSubscriptionId,
        currentPeriodStart: input.currentPeriodStart ?? undefined,
        currentPeriodEnd: input.currentPeriodEnd ?? undefined,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        canceledAt: input.canceledAt ?? undefined
      }
    });

    await tx.reportEntitlement.upsert({
      where: { workspaceId: input.workspaceId },
      update: {
        subscriptionStatus: isActive ? "active" : status === SubscriptionStatus.EXPIRED ? "expired" : "cancelled",
        subscriptionPlan: isActive ? "monthly" : "free",
        monthlyUnlimited: isActive,
        currentPeriodStart: input.currentPeriodStart ?? undefined,
        currentPeriodEnd: input.currentPeriodEnd ?? undefined
      },
      create: {
        workspaceId: input.workspaceId,
        firstFreeReportUsed: false,
        oneTimeReportAvailable: false,
        subscriptionStatus: isActive ? "active" : status === SubscriptionStatus.EXPIRED ? "expired" : "cancelled",
        subscriptionPlan: isActive ? "monthly" : "free",
        monthlyUnlimited: isActive,
        currentPeriodStart: input.currentPeriodStart ?? undefined,
        currentPeriodEnd: input.currentPeriodEnd ?? undefined
      }
    });

    return subscription;
  });
}

export async function grantWorkspaceEntitlementForPaidOrder(input: {
  orderId: string;
  providerPaymentId?: string;
  subscriptionId?: string;
  customerId?: string | null;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({
      where: { id: input.orderId },
      include: { plan: true }
    });

    if (!order) {
      throw new Error("Payment order not found.");
    }

    const workspaceId = order.workspaceId ?? await tx.workspaceMember.findFirst({
      where: {
        userId: order.userId,
        status: "ACTIVE"
      },
      orderBy: [{ joinedAt: "asc" }, { createdAt: "asc" }],
      select: { workspaceId: true }
    }).then((membership) => membership?.workspaceId);

    if (!workspaceId) {
      throw new Error("Workspace not found for paid order.");
    }

    const now = new Date();

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        workspaceId,
        status: PaymentOrderStatus.PAID,
        providerPaymentId: input.providerPaymentId,
        paidAt: now
      }
    });

    if (order.plan.type === PlanType.MONTHLY) {
      const subscription = await tx.workspaceSubscription.upsert({
        where: {
          providerSubscriptionId: input.subscriptionId ?? `manual:${order.id}`
        },
        update: {
          planType: PlanType.MONTHLY,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.MONTHLY,
          provider: BillingProvider.STRIPE,
          providerCustomerId: input.customerId ?? undefined,
          currentPeriodStart: input.periodStart ?? now,
          currentPeriodEnd: input.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000),
          cancelAtPeriodEnd: false,
          canceledAt: null
        },
        create: {
          workspaceId,
          planType: PlanType.MONTHLY,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.MONTHLY,
          provider: BillingProvider.STRIPE,
          providerCustomerId: input.customerId ?? undefined,
          providerSubscriptionId: input.subscriptionId ?? `manual:${order.id}`,
          currentPeriodStart: input.periodStart ?? now,
          currentPeriodEnd: input.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000),
          cancelAtPeriodEnd: false
        }
      });
      await tx.reportEntitlement.upsert({
        where: { workspaceId },
        update: {
          subscriptionStatus: "active",
          subscriptionPlan: "monthly",
          monthlyUnlimited: true,
          currentPeriodStart: input.periodStart ?? now,
          currentPeriodEnd: input.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000)
        },
        create: {
          workspaceId,
          firstFreeReportUsed: false,
          oneTimeReportAvailable: false,
          subscriptionStatus: "active",
          subscriptionPlan: "monthly",
          monthlyUnlimited: true,
          currentPeriodStart: input.periodStart ?? now,
          currentPeriodEnd: input.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000)
        }
      });

      return { order, allowance: null, subscription, alreadyProcessed: false };
    }

    const referenceId = input.providerPaymentId ?? `order:${order.id}`;
    const monthly = await tx.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        planType: PlanType.MONTHLY
      },
      orderBy: [{ currentPeriodEnd: "desc" }, { createdAt: "desc" }]
    });
    const hasActiveMonthly = Boolean(monthly && isPeriodUsable(monthly));

    if (!hasActiveMonthly) {
      await tx.workspaceSubscription.upsert({
        where: {
          providerSubscriptionId: `one_time:${referenceId}`
        },
        update: {
          status: SubscriptionStatus.ACTIVE,
          providerPaymentIntentId: referenceId,
          providerCustomerId: input.customerId ?? undefined
        },
        create: {
          workspaceId,
          planType: PlanType.ONE_TIME,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.ONE_TIME,
          provider: BillingProvider.STRIPE,
          providerCustomerId: input.customerId ?? undefined,
          providerSubscriptionId: `one_time:${referenceId}`,
          providerPaymentIntentId: referenceId
        }
      });
    }

    const existingAllowance = await tx.workspaceUsageAllowance.findUnique({
      where: {
        workspaceId_referenceId: {
          workspaceId,
          referenceId
        }
      }
    });

    if (existingAllowance) {
      await tx.reportEntitlement.upsert({
        where: { workspaceId },
        update: {
          oneTimeReportAvailable: existingAllowance.reportGenerationsAllowed > existingAllowance.reportGenerationsUsed,
          oneTimeReportPurchasedAt: now,
          subscriptionPlan: "one_time"
        },
        create: {
          workspaceId,
          firstFreeReportUsed: false,
          oneTimeReportAvailable: existingAllowance.reportGenerationsAllowed > existingAllowance.reportGenerationsUsed,
          oneTimeReportPurchasedAt: now,
          subscriptionStatus: "free",
          subscriptionPlan: "one_time",
          monthlyUnlimited: false
        }
      });

      return { order, allowance: existingAllowance, subscription: null, alreadyProcessed: true };
    }

    const allowance = await tx.workspaceUsageAllowance.create({
      data: {
        workspaceId,
        reportGenerationsAllowed: 1,
        reportGenerationsUsed: 0,
        source: "one_time_purchase",
        referenceId
      }
    });
    await tx.reportEntitlement.upsert({
      where: { workspaceId },
      update: {
        oneTimeReportAvailable: true,
        oneTimeReportPurchasedAt: now,
        subscriptionPlan: "one_time"
      },
      create: {
        workspaceId,
        firstFreeReportUsed: false,
        oneTimeReportAvailable: true,
        oneTimeReportPurchasedAt: now,
        subscriptionStatus: "free",
        subscriptionPlan: "one_time",
        monthlyUnlimited: false
      }
    });

    return { order, allowance, subscription: null, alreadyProcessed: false };
  });
}
