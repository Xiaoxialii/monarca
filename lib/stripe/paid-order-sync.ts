import { PaymentOrderStatus } from "@prisma/client";
import type Stripe from "stripe";
import { grantEntitlementForPaidOrder } from "@/lib/billing/checkout-orders";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { stripeSubscriptionPeriod } from "@/lib/stripe/subscription-period";

const MAX_PENDING_ORDERS_TO_SYNC = 10;

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

function checkoutProviderPaymentId(session: Stripe.Checkout.Session) {
  if (typeof session.invoice === "string") return session.invoice;
  if (session.invoice?.id) return session.invoice.id;
  if (typeof session.payment_intent === "string") return session.payment_intent;
  if (session.payment_intent?.id) return session.payment_intent.id;

  return session.id;
}

export async function syncPaidStripeOrdersForUser(userId: string) {
  const candidateOrders = await prisma.paymentOrder.findMany({
    where: {
      userId,
      paymentProvider: "stripe",
      OR: [
        {
          status: PaymentOrderStatus.PENDING,
          providerSessionId: {
            not: null
          }
        },
        {
          status: PaymentOrderStatus.PAID
        }
      ]
    },
    orderBy: {
      createdAt: "desc"
    },
    take: MAX_PENDING_ORDERS_TO_SYNC
  });
  const pendingOrders = candidateOrders.filter((order) =>
    order.status === PaymentOrderStatus.PENDING || order.status === PaymentOrderStatus.PAID
  );

  if (pendingOrders.length === 0) {
    return { checked: candidateOrders.length, granted: 0 };
  }

  let granted = 0;
  const stripe = getStripe();

  for (const order of pendingOrders) {
    if (order.status === PaymentOrderStatus.PAID) {
      const result = await grantEntitlementForPaidOrder({ orderId: order.id });

      if (!result.alreadyProcessed) {
        granted += 1;
      }

      continue;
    }

    if (!order.providerSessionId) continue;

    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(order.providerSessionId);

      if (checkoutSession.status !== "complete" && checkoutSession.payment_status !== "paid") {
        continue;
      }

      const subscriptionId = stripeObjectId(checkoutSession.subscription);
      let periodStart = unixToDate(checkoutSession.created);
      let periodEnd: Date | undefined;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const period = stripeSubscriptionPeriod(subscription);
        periodStart = period.currentPeriodStart ?? periodStart;
        periodEnd = period.currentPeriodEnd ?? periodEnd;
      } else {
        periodEnd = checkoutSession.expires_at ? unixToDate(checkoutSession.expires_at) : undefined;
      }

      const result = await grantEntitlementForPaidOrder({
        orderId: order.id,
        providerPaymentId: checkoutProviderPaymentId(checkoutSession),
        subscriptionId,
        customerId: stripeObjectId(checkoutSession.customer) ?? null,
        periodStart,
        periodEnd
      });

      if (!result.alreadyProcessed) {
        granted += 1;
      }
    } catch (error) {
      console.error("[entitlements] Failed to sync paid Stripe order", {
        orderId: order.id,
        providerSessionId: order.providerSessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { checked: candidateOrders.length, granted };
}
