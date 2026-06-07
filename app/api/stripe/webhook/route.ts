import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { syncClerkUserById } from "@/lib/clerk-user-sync";
import {
  createPaymentOrderForUser,
  findPlanForCheckout,
  grantEntitlementForPaidOrder
} from "@/lib/billing/checkout-orders";
import { upsertMonthlyWorkspaceSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { stripeSubscriptionPeriod } from "@/lib/stripe/subscription-period";
import { PaymentOrderStatus, SubscriptionStatus } from "@prisma/client";

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

function checkoutProviderPaymentId(session: Stripe.Checkout.Session) {
  if (typeof session.invoice === "string") return session.invoice;
  if (session.invoice?.id) return session.invoice.id;
  if (typeof session.payment_intent === "string") return session.payment_intent;
  if (session.payment_intent?.id) return session.payment_intent.id;

  return session.id;
}

function checkoutEmail(session: Stripe.Checkout.Session) {
  return session.customer_details?.email ?? session.customer_email ?? undefined;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  let orderId = session.metadata?.paymentOrderId;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
  let periodStart = unixToDate(session.created);
  let periodEnd: Date | undefined;

  if (!orderId) {
    const existingOrder = await prisma.paymentOrder.findUnique({
      where: { providerSessionId: session.id }
    });

    orderId = existingOrder?.id;
  }

  if (!orderId) {
    const plan = session.metadata?.plan;
    const clerkUserId = session.metadata?.clerkUserId;

    if (!plan || !clerkUserId) return;

    const userSession = await syncClerkUserById(clerkUserId, {
      fallbackEmail: checkoutEmail(session)
    });
    const entitlementPlan = await findPlanForCheckout(plan);
    const paymentOrder = await createPaymentOrderForUser({
      userId: userSession.user.id,
      workspaceId: userSession.workspace.id,
      plan: entitlementPlan,
      providerSessionId: session.id
    });

    orderId = paymentOrder.id;
  }

  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const period = stripeSubscriptionPeriod(subscription);
    periodStart = period.currentPeriodStart ?? periodStart;
    periodEnd = period.currentPeriodEnd ?? periodEnd;
  } else {
    periodEnd = session.expires_at ? unixToDate(session.expires_at) : undefined;
  }

  await grantEntitlementForPaidOrder({
    orderId,
    providerPaymentId: checkoutProviderPaymentId(session),
    subscriptionId,
    customerId: stripeObjectId(session.customer) ?? null,
    periodStart,
    periodEnd
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { providerSubscriptionId: subscriptionId }
  });

  if (!subscription) return;

  const periodStart = unixToDate(invoice.period_start) ?? new Date();
  const periodEnd = unixToDate(invoice.period_end) ?? new Date(Date.now() + 30 * 86_400_000);

  await prisma.workspaceSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd
    }
  });
  await prisma.reportEntitlement.upsert({
    where: { workspaceId: subscription.workspaceId },
    update: {
      subscriptionStatus: "active",
      subscriptionPlan: "monthly",
      monthlyUnlimited: true,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd
    },
    create: {
      workspaceId: subscription.workspaceId,
      firstFreeReportUsed: false,
      oneTimeReportAvailable: false,
      subscriptionStatus: "active",
      subscriptionPlan: "monthly",
      monthlyUnlimited: true,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd
    }
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  const subscriptions = await prisma.workspaceSubscription.findMany({
    where: { providerSubscriptionId: subscriptionId }
  });

  await prisma.workspaceSubscription.updateMany({
    where: { providerSubscriptionId: subscriptionId },
    data: { status: SubscriptionStatus.PAST_DUE }
  });

  for (const subscription of subscriptions) {
    await prisma.reportEntitlement.upsert({
      where: { workspaceId: subscription.workspaceId },
      update: {
        subscriptionStatus: "expired",
        subscriptionPlan: "free",
        monthlyUnlimited: false
      },
      create: {
        workspaceId: subscription.workspaceId,
        firstFreeReportUsed: false,
        oneTimeReportAvailable: false,
        subscriptionStatus: "expired",
        subscriptionPlan: "free",
        monthlyUnlimited: false
      }
    });
  }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.paymentOrderId;

  if (!orderId) return;

  await prisma.paymentOrder.updateMany({
    where: {
      id: orderId,
      status: PaymentOrderStatus.PENDING
    },
    data: {
      status: PaymentOrderStatus.FAILED
    }
  });
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  const { currentPeriodStart, currentPeriodEnd } = stripeSubscriptionPeriod(subscription);
  const workspaceId = subscription.metadata?.workspaceId;
  const status =
    subscription.status === "active"
      ? SubscriptionStatus.ACTIVE
      : subscription.status === "trialing"
        ? SubscriptionStatus.TRIALING
      : subscription.status === "canceled"
        ? currentPeriodEnd && currentPeriodEnd > new Date()
          ? SubscriptionStatus.CANCELED
          : SubscriptionStatus.EXPIRED
        : subscription.status === "past_due"
          ? SubscriptionStatus.PAST_DUE
          : subscription.status === "unpaid"
            ? SubscriptionStatus.UNPAID
            : SubscriptionStatus.EXPIRED;

  if (workspaceId) {
    await upsertMonthlyWorkspaceSubscription({
      workspaceId,
      providerSubscriptionId: subscription.id,
      providerCustomerId: stripeObjectId(subscription.customer) ?? null,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || status === SubscriptionStatus.CANCELED,
      canceledAt: unixToDate(subscription.canceled_at) ?? null
    });
    return;
  }

  const updated = await prisma.workspaceSubscription.findMany({
    where: { providerSubscriptionId: subscription.id }
  });

  await prisma.workspaceSubscription.updateMany({
    where: { providerSubscriptionId: subscription.id },
    data: {
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || status === SubscriptionStatus.CANCELED,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      canceledAt: unixToDate(subscription.canceled_at) ?? undefined
    }
  });

  for (const item of updated) {
    await prisma.reportEntitlement.upsert({
      where: { workspaceId: item.workspaceId },
      update: {
        subscriptionStatus: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING ? "active" : status === SubscriptionStatus.EXPIRED ? "expired" : "cancelled",
        subscriptionPlan: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING ? "monthly" : "free",
        monthlyUnlimited: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING,
        currentPeriodStart: currentPeriodStart ?? undefined,
        currentPeriodEnd: currentPeriodEnd ?? undefined
      },
      create: {
        workspaceId: item.workspaceId,
        firstFreeReportUsed: false,
        oneTimeReportAvailable: false,
        subscriptionStatus: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING ? "active" : status === SubscriptionStatus.EXPIRED ? "expired" : "cancelled",
        subscriptionPlan: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING ? "monthly" : "free",
        monthlyUnlimited: status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING,
        currentPeriodStart: currentPeriodStart ?? undefined,
        currentPeriodEnd: currentPeriodEnd ?? undefined
      }
    });
  }
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
    case "checkout.session.expired":
      await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
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
