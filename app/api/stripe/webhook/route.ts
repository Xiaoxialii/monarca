import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  grantCreditForPaidOrder
} from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { PaymentOrderStatus, UserSubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function unixToDate(value: number | null | undefined) {
  return value ? new Date(value * 1000) : undefined;
}

function stripeObjectId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }

  return undefined;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const rawInvoice = invoice as Stripe.Invoice & {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id?: string } | null;
      } | null;
    } | null;
  };

  return stripeObjectId(rawInvoice.subscription) ??
    stripeObjectId(rawInvoice.parent?.subscription_details?.subscription);
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const rawSubscription = subscription as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };

  return {
    currentPeriodStart: unixToDate(rawSubscription.current_period_start),
    currentPeriodEnd: unixToDate(rawSubscription.current_period_end)
  };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.paymentOrderId;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
  let periodStart = unixToDate(session.created);
  let periodEnd = session.expires_at ? unixToDate(session.expires_at) : undefined;

  if (!orderId) return;

  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const period = subscriptionPeriod(subscription);
    periodStart = period.currentPeriodStart ?? periodStart;
    periodEnd = period.currentPeriodEnd ?? periodEnd;
  }

  await grantCreditForPaidOrder({
    orderId,
    providerPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
    subscriptionId,
    periodStart,
    periodEnd
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  const subscription = await prisma.userSubscription.findUnique({
    where: { providerSubscriptionId: subscriptionId },
    include: { plan: true }
  });

  if (!subscription) return;

  const periodStart = unixToDate(invoice.period_start) ?? new Date();
  const periodEnd = unixToDate(invoice.period_end) ?? new Date(Date.now() + 30 * 86_400_000);
  const existingOrder = await prisma.paymentOrder.findUnique({
    where: {
      providerPaymentId: invoice.id
    },
    include: {
      credit: true
    }
  });

  if (existingOrder?.credit) return;

  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: {
        status: UserSubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      }
    });

    const order = await tx.paymentOrder.upsert({
      where: {
        providerPaymentId: invoice.id
      },
      update: {
        status: PaymentOrderStatus.PAID,
        paidAt: new Date()
      },
      create: {
        userId: subscription.userId,
        planId: subscription.planId,
        orderType: "MONTHLY",
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: PaymentOrderStatus.PAID,
        paymentProvider: "stripe",
        providerPaymentId: invoice.id,
        paidAt: new Date()
      }
    });

    await tx.userCredit.upsert({
      where: {
        paymentOrderId: order.id
      },
      update: {},
      create: {
        userId: subscription.userId,
        planId: subscription.planId,
        subscriptionId: subscription.id,
        paymentOrderId: order.id,
        sourceType: "MONTHLY_SUBSCRIPTION",
        reportCreditsTotal: subscription.plan.reportQuota,
        reportCreditsUsed: 0,
        aiTokenTotal: subscription.plan.aiTokenQuota,
        aiTokenUsed: 0,
        validFrom: periodStart,
        validUntil: periodEnd,
        status: "ACTIVE"
      }
    });
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  await prisma.userSubscription.updateMany({
    where: { providerSubscriptionId: subscriptionId },
    data: { status: UserSubscriptionStatus.PAYMENT_FAILED }
  });
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  const { currentPeriodStart, currentPeriodEnd } = subscriptionPeriod(subscription);
  const status =
    subscription.status === "active" || subscription.status === "trialing"
      ? UserSubscriptionStatus.ACTIVE
      : subscription.status === "canceled"
        ? UserSubscriptionStatus.CANCELED
        : subscription.status === "past_due" || subscription.status === "unpaid"
          ? UserSubscriptionStatus.PAYMENT_FAILED
          : UserSubscriptionStatus.EXPIRED;

  await prisma.userSubscription.updateMany({
    where: { providerSubscriptionId: subscription.id },
    data: {
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined
    }
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook signature or secret missing." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.deleted":
    case "customer.subscription.updated":
      await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
