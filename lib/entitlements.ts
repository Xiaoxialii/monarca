import {
  PaymentOrderStatus,
  PaymentOrderType,
  PlanType,
  Prisma,
  UserCreditSourceType,
  UserCreditStatus,
  UserSubscriptionStatus,
  UsageActionType,
  type Plan
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EntitlementErrorCode =
  | "NO_ACTIVE_PLAN"
  | "CREDIT_USED_UP"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT_REQUIRED";

export class EntitlementError extends Error {
  code: EntitlementErrorCode;
  status = 402;

  constructor(code: EntitlementErrorCode, message: string) {
    super(message);
    this.name = "EntitlementError";
    this.code = code;
  }
}

export type EntitlementMessageLocale = "en" | "zh";

export function entitlementErrorMessage(code: EntitlementErrorCode, locale: EntitlementMessageLocale = "en") {
  const messages: Record<EntitlementErrorCode, Record<EntitlementMessageLocale, string>> = {
    NO_ACTIVE_PLAN: {
      en: "The selected plan is not available.",
      zh: "所选套餐不可用。"
    },
    CREDIT_USED_UP: {
      en: "Your service credits have been used up. Please buy another one-time service or upgrade your plan.",
      zh: "当前服务额度已用完，请再次购买或升级套餐。"
    },
    SUBSCRIPTION_EXPIRED: {
      en: "Your subscription has expired or the payment failed. Please reactivate your plan.",
      zh: "订阅已过期或支付失败，请重新开通。"
    },
    PAYMENT_REQUIRED: {
      en: "No service credits are available. Please buy a one-time service or start a monthly plan.",
      zh: "当前无可用服务额度，请购买一次服务或开通月服务。"
    }
  };

  return messages[code][locale];
}

export const defaultPlans = [
  {
    code: "starter-one-time",
    name: "Starter One-Time",
    type: PlanType.ONE_TIME,
    price: "29",
    currency: "USD",
    description: "One report generation credit for a focused analysis run",
    reportQuota: 1,
    aiTokenQuota: 100_000,
    databaseConnectionQuota: 1,
    includesHumanService: false,
    validDays: 30
  },
  {
    code: "growth-one-time",
    name: "Growth One-Time",
    type: PlanType.ONE_TIME,
    price: "99",
    currency: "USD",
    description: "Five report generation credits for a growth analysis sprint",
    reportQuota: 5,
    aiTokenQuota: 500_000,
    databaseConnectionQuota: 3,
    includesHumanService: false,
    validDays: 90
  },
  {
    code: "pro-monthly",
    name: "Pro Monthly",
    type: PlanType.MONTHLY,
    price: "49",
    currency: "USD",
    description: "Monthly report automation for small teams",
    reportQuota: 10,
    aiTokenQuota: 1_000_000,
    databaseConnectionQuota: 3,
    includesHumanService: false,
    validDays: null
  },
  {
    code: "business-monthly",
    name: "Business Monthly",
    type: PlanType.MONTHLY,
    price: "199",
    currency: "USD",
    description: "Monthly report automation with higher quota and human service",
    reportQuota: 50,
    aiTokenQuota: 5_000_000,
    databaseConnectionQuota: 10,
    includesHumanService: true,
    validDays: null
  }
] as const;

export const checkoutPlanToPlanCode: Record<string, string> = {
  trial: "starter-one-time",
  professional: "business-monthly",
  "database-setup": "growth-one-time"
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isCreditValidNow(credit: { validFrom: Date; validUntil: Date | null }) {
  const now = new Date();

  return credit.validFrom <= now && (!credit.validUntil || credit.validUntil >= now);
}

function quotaFieldForAction(actionType: UsageActionType) {
  if (actionType === UsageActionType.GENERATE_REPORT) {
    return {
      total: "reportCreditsTotal" as const,
      used: "reportCreditsUsed" as const
    };
  }

  if (actionType === UsageActionType.AI_FOLLOW_UP) {
    return {
      total: "aiTokenTotal" as const,
      used: "aiTokenUsed" as const
    };
  }

  return null;
}

function remainingForFieldAction(
  credit: {
    reportCreditsTotal: number;
    reportCreditsUsed: number;
    aiTokenTotal: number;
    aiTokenUsed: number;
  },
  actionType: UsageActionType
) {
  const field = quotaFieldForAction(actionType);

  if (!field) return 0;

  const total = credit[field.total];
  const used = credit[field.used];

  if (total < 0) return Number.POSITIVE_INFINITY;

  return Math.max(0, total - used);
}

async function remainingForAction(
  tx: Prisma.TransactionClient | typeof prisma,
  credit: {
    id: string;
    reportCreditsTotal: number;
    reportCreditsUsed: number;
    aiTokenTotal: number;
    aiTokenUsed: number;
    plan: {
      databaseConnectionQuota: number;
      includesHumanService: boolean;
    };
  },
  actionType: UsageActionType
) {
  const fieldRemaining = remainingForFieldAction(credit, actionType);

  if (quotaFieldForAction(actionType)) {
    return fieldRemaining;
  }

  if (actionType === UsageActionType.DATABASE_CONNECTION) {
    const total = credit.plan.databaseConnectionQuota;

    if (total < 0) return Number.POSITIVE_INFINITY;
    if (total <= 0) return 0;

    const aggregate = await tx.usageLog.aggregate({
      where: {
        creditId: credit.id,
        actionType
      },
      _sum: {
        usageAmount: true
      }
    });

    return Math.max(0, total - (aggregate._sum.usageAmount ?? 0));
  }

  if (actionType === UsageActionType.HUMAN_SERVICE) {
    return credit.plan.includesHumanService ? 1 : 0;
  }

  return 0;
}

export async function ensureDefaultPlans() {
  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        type: plan.type,
        price: new Prisma.Decimal(plan.price),
        currency: plan.currency,
        description: plan.description,
        reportQuota: plan.reportQuota,
        aiTokenQuota: plan.aiTokenQuota,
        databaseConnectionQuota: plan.databaseConnectionQuota,
        includesHumanService: plan.includesHumanService,
        validDays: plan.validDays,
        isActive: true
      },
      create: {
        code: plan.code,
        name: plan.name,
        type: plan.type,
        price: new Prisma.Decimal(plan.price),
        currency: plan.currency,
        description: plan.description,
        reportQuota: plan.reportQuota,
        aiTokenQuota: plan.aiTokenQuota,
        databaseConnectionQuota: plan.databaseConnectionQuota,
        includesHumanService: plan.includesHumanService,
        validDays: plan.validDays,
        isActive: true
      }
    });
  }
}

export async function findPlanForCheckout(plan: string) {
  await ensureDefaultPlans();

  const code = checkoutPlanToPlanCode[plan] ?? plan;
  const found = await prisma.plan.findUnique({
    where: { code }
  });

  if (!found || !found.isActive) {
    throw new EntitlementError("NO_ACTIVE_PLAN", "Selected plan is not available.");
  }

  return found;
}

export async function createPaymentOrderForUser(input: {
  userId: string;
  plan: Plan;
  providerSessionId?: string;
  providerPaymentId?: string;
}) {
  return prisma.paymentOrder.create({
    data: {
      userId: input.userId,
      planId: input.plan.id,
      orderType: input.plan.type === PlanType.MONTHLY ? PaymentOrderType.MONTHLY : PaymentOrderType.ONE_TIME,
      amount: input.plan.price,
      currency: input.plan.currency,
      status: PaymentOrderStatus.PENDING,
      paymentProvider: "stripe",
      providerSessionId: input.providerSessionId,
      providerPaymentId: input.providerPaymentId
    }
  });
}

export async function checkUserEntitlement(
  userId: string,
  actionType: UsageActionType,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const now = new Date();

  await tx.userCredit.updateMany({
    where: {
      userId,
      status: UserCreditStatus.ACTIVE,
      validUntil: {
        lt: now
      }
    },
    data: {
      status: UserCreditStatus.EXPIRED
    }
  });

  const credits = await tx.userCredit.findMany({
    where: {
      userId,
      status: UserCreditStatus.ACTIVE,
      validFrom: {
        lte: now
      },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }]
    },
    include: {
      plan: true,
      subscription: true
    },
    orderBy: [{ validUntil: "asc" }, { createdAt: "asc" }]
  });

  for (const credit of credits) {
    const remaining = await remainingForAction(tx, credit, actionType);

    if (
      credit.sourceType === UserCreditSourceType.ONE_TIME_PURCHASE &&
      isCreditValidNow(credit) &&
      remaining > 0
    ) {
      return {
        allowed: true,
        creditId: credit.id,
        credit,
        remaining
      };
    }
  }

  for (const credit of credits) {
    const remaining = await remainingForAction(tx, credit, actionType);

    if (
      credit.sourceType === UserCreditSourceType.MONTHLY_SUBSCRIPTION &&
      credit.subscription?.status === UserSubscriptionStatus.ACTIVE &&
      credit.subscription.currentPeriodStart <= now &&
      credit.subscription.currentPeriodEnd >= now &&
      remaining > 0
    ) {
      return {
        allowed: true,
        creditId: credit.id,
        credit,
        remaining
      };
    }
  }

  const activeSubscription = await tx.userSubscription.findFirst({
    where: {
      userId,
      status: UserSubscriptionStatus.ACTIVE,
      currentPeriodEnd: {
        gte: now
      }
    }
  });

  if (activeSubscription) {
    throw new EntitlementError("CREDIT_USED_UP", "当前服务额度已用完，请再次购买或升级套餐。");
  }

  const expiredSubscription = await tx.userSubscription.findFirst({
    where: {
      userId,
      OR: [
        { status: UserSubscriptionStatus.EXPIRED },
        { status: UserSubscriptionStatus.PAYMENT_FAILED },
        { currentPeriodEnd: { lt: now } }
      ]
    }
  });

  if (expiredSubscription) {
    throw new EntitlementError("SUBSCRIPTION_EXPIRED", "订阅已过期或支付失败，请重新开通。");
  }

  throw new EntitlementError("PAYMENT_REQUIRED", "当前无可用服务额度，请购买一次服务或开通月服务。");
}

export async function consumeCredit(input: {
  userId: string;
  actionType: UsageActionType;
  amount?: number;
  metadata?: Record<string, unknown>;
}) {
  const amount = input.amount ?? 1;

  if (amount <= 0) {
    throw new Error("Usage amount must be greater than 0.");
  }

  return prisma.$transaction(async (tx) => {
    const entitlement = await checkUserEntitlement(input.userId, input.actionType, tx);
    const credit = entitlement.credit;
    const field = quotaFieldForAction(input.actionType);
    const remaining = await remainingForAction(tx, credit, input.actionType);

    if (remaining < amount) {
      throw new EntitlementError("CREDIT_USED_UP", "当前服务额度不足。");
    }

    if (!field) {
      const usageLog = await tx.usageLog.create({
        data: {
          userId: input.userId,
          actionType: input.actionType,
          creditId: credit.id,
          usageAmount: amount,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
        }
      });

      const nextRemaining = remaining - amount;

      return {
        creditId: credit.id,
        usageLogId: usageLog.id,
        remaining: Number.isFinite(nextRemaining) ? Math.max(0, nextRemaining) : null
      };
    }

    const total = credit[field.total];
    const used = credit[field.used];
    const updateData =
      field.used === "reportCreditsUsed"
        ? { reportCreditsUsed: { increment: amount } }
        : { aiTokenUsed: { increment: amount } };

    const updated = await tx.userCredit.updateMany({
      where: {
        id: credit.id,
        status: UserCreditStatus.ACTIVE,
        [field.used]: used
      },
      data: updateData
    });

    if (updated.count !== 1) {
      throw new EntitlementError("CREDIT_USED_UP", "额度正在被其他请求使用，请重试。");
    }

    const nextUsed = used + amount;
    const nextRemaining = total < 0 ? Number.POSITIVE_INFINITY : total - nextUsed;

    if (total >= 0 && nextRemaining <= 0) {
      await tx.userCredit.update({
        where: { id: credit.id },
        data: { status: UserCreditStatus.USED_UP }
      });
    }

    const usageLog = await tx.usageLog.create({
      data: {
        userId: input.userId,
        actionType: input.actionType,
        creditId: credit.id,
        usageAmount: amount,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
      }
    });

    return {
      creditId: credit.id,
      usageLogId: usageLog.id,
      remaining: Number.isFinite(nextRemaining) ? nextRemaining : null
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function grantCreditForPaidOrder(input: {
  orderId: string;
  providerPaymentId?: string;
  subscriptionId?: string;
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

    if (order.status === PaymentOrderStatus.PAID) {
      const existingCredit = await tx.userCredit.findUnique({
        where: { paymentOrderId: order.id }
      });

      return { order, credit: existingCredit, subscription: null, alreadyProcessed: true };
    }

    const now = new Date();
    const isMonthly = order.plan.type === PlanType.MONTHLY;
    const periodStart = input.periodStart ?? now;
    const periodEnd = input.periodEnd ?? addDays(periodStart, 30);
    const validUntil = isMonthly
      ? periodEnd
      : order.plan.validDays
        ? addDays(now, order.plan.validDays)
        : null;

    const subscription = isMonthly
      ? await tx.userSubscription.upsert({
          where: {
            providerSubscriptionId: input.subscriptionId ?? `manual:${order.id}`
          },
          update: {
            planId: order.planId,
            status: UserSubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            paymentProvider: "stripe",
            cancelAtPeriodEnd: false
          },
          create: {
            userId: order.userId,
            planId: order.planId,
            status: UserSubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            paymentProvider: "stripe",
            providerSubscriptionId: input.subscriptionId ?? `manual:${order.id}`
          }
        })
      : null;

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PAID,
        providerPaymentId: input.providerPaymentId,
        paidAt: now
      }
    });

    const credit = await tx.userCredit.upsert({
      where: {
        paymentOrderId: order.id
      },
      update: {},
      create: {
        userId: order.userId,
        planId: order.planId,
        subscriptionId: subscription?.id,
        paymentOrderId: order.id,
        sourceType: isMonthly
          ? UserCreditSourceType.MONTHLY_SUBSCRIPTION
          : UserCreditSourceType.ONE_TIME_PURCHASE,
        reportCreditsTotal: order.plan.reportQuota,
        reportCreditsUsed: 0,
        aiTokenTotal: order.plan.aiTokenQuota,
        aiTokenUsed: 0,
        validFrom: isMonthly ? periodStart : now,
        validUntil,
        status: UserCreditStatus.ACTIVE
      }
    });

    return { order, credit, subscription, alreadyProcessed: false };
  });
}

export async function getUserEntitlementSummary(userId: string) {
  await ensureDefaultPlans();

  const now = new Date();
  const credits = await prisma.userCredit.findMany({
    where: {
      userId,
      status: UserCreditStatus.ACTIVE,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }]
    },
    include: {
      plan: true,
      subscription: true
    },
    orderBy: [{ validUntil: "asc" }, { createdAt: "asc" }]
  });
  const subscriptions = await prisma.userSubscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });
  const activeSubscription = subscriptions.find((subscription) =>
    subscription.status === UserSubscriptionStatus.ACTIVE && subscription.currentPeriodEnd >= now
  );
  const reportCreditsTotal = credits.reduce((sum, credit) => sum + Math.max(0, credit.reportCreditsTotal), 0);
  const reportCreditsUsed = credits.reduce((sum, credit) => sum + credit.reportCreditsUsed, 0);
  const remainingReports = credits.reduce((sum, credit) => {
    const remaining = remainingForFieldAction(credit, UsageActionType.GENERATE_REPORT);

    return sum + (Number.isFinite(remaining) ? remaining : 999_999);
  }, 0);

  return {
    hasActivePlan: credits.length > 0 || Boolean(activeSubscription),
    currentPlan: activeSubscription?.plan.name ?? credits[0]?.plan.name ?? null,
    planType: activeSubscription ? "MONTHLY" : credits[0]?.sourceType === UserCreditSourceType.ONE_TIME_PURCHASE ? "ONE_TIME" : null,
    subscriptionStatus: activeSubscription?.status ?? subscriptions[0]?.status ?? null,
    cancelAtPeriodEnd: activeSubscription?.cancelAtPeriodEnd ?? false,
    currentPeriodStart: activeSubscription?.currentPeriodStart ?? credits[0]?.validFrom ?? null,
    currentPeriodEnd: activeSubscription?.currentPeriodEnd ?? credits[0]?.validUntil ?? null,
    nextRenewalDate: activeSubscription?.cancelAtPeriodEnd ? null : activeSubscription?.currentPeriodEnd ?? null,
    reportCreditsTotal,
    reportCreditsUsed,
    remainingReports,
    credits: credits.map((credit) => ({
      id: credit.id,
      planName: credit.plan.name,
      sourceType: credit.sourceType,
      total: credit.reportCreditsTotal,
      used: credit.reportCreditsUsed,
      remaining: remainingForFieldAction(credit, UsageActionType.GENERATE_REPORT),
      validFrom: credit.validFrom,
      validUntil: credit.validUntil,
      status: credit.status
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      planName: subscription.plan.name,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
    }))
  };
}
