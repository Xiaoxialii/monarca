import {
  PaymentOrderStatus,
  PaymentOrderType,
  PlanType,
  Prisma,
  type Plan
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { grantWorkspaceEntitlementForPaidOrder } from "@/lib/billing/entitlements";

export class CheckoutPlanError extends Error {
  status = 402;

  constructor(message: string) {
    super(message);
    this.name = "CheckoutPlanError";
  }
}

export const defaultPlans = [
  {
    code: "starter-one-time",
    name: "One-time Report",
    type: PlanType.ONE_TIME,
    price: "29",
    currency: "USD",
    description: "Unlimited data source connections plus one complete report generation",
    reportQuota: 1,
    aiTokenQuota: 0,
    databaseConnectionQuota: -1,
    includesHumanService: false,
    validDays: null
  },
  {
    code: "pro-monthly",
    name: "Monthly Unlimited",
    type: PlanType.MONTHLY,
    price: "49",
    currency: "USD",
    description: "Unlimited data source connections and unlimited report generations",
    reportQuota: -1,
    aiTokenQuota: 0,
    databaseConnectionQuota: -1,
    includesHumanService: false,
    validDays: null
  }
] as const;

export const checkoutPlanToPlanCode: Record<string, string> = {
  trial: "starter-one-time",
  "database-setup": "starter-one-time",
  professional: "pro-monthly"
};

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
    throw new CheckoutPlanError("Selected plan is not available.");
  }

  return found;
}

export async function createPaymentOrderForUser(input: {
  userId: string;
  workspaceId?: string;
  plan: Plan;
  providerSessionId?: string;
  providerPaymentId?: string;
}) {
  return prisma.paymentOrder.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
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

export async function grantEntitlementForPaidOrder(input: {
  orderId: string;
  providerPaymentId?: string;
  subscriptionId?: string;
  customerId?: string | null;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return grantWorkspaceEntitlementForPaidOrder(input);
}
