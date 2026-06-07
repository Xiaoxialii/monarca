import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  createPaymentOrderForUser,
  findPlanForCheckout,
  grantEntitlementForPaidOrder
} from "@/lib/billing/checkout-orders";
import { getBillingAccessState } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { stripeSubscriptionPeriod } from "@/lib/stripe/subscription-period";
import { requireAuth, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

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

function checkoutProviderPaymentId(session: Stripe.Checkout.Session) {
  if (typeof session.invoice === "string") return session.invoice;
  if (session.invoice?.id) return session.invoice.id;
  if (typeof session.payment_intent === "string") return session.payment_intent;
  if (session.payment_intent?.id) return session.payment_intent.id;

  return session.id;
}

export async function POST(request: Request) {
  try {
    const authSession = await requireAuth();
    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false, message: "A valid Stripe checkout session is required." }, { status: 400 });
    }

    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);

    if (checkoutSession.status !== "complete" && checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { ok: false, message: "Stripe has not marked this checkout session as paid yet." },
        { status: 409 }
      );
    }

    const metadataOrderId = checkoutSession.metadata?.paymentOrderId;
    let order = metadataOrderId
      ? await prisma.paymentOrder.findUnique({ where: { id: metadataOrderId } })
      : null;

    if (!order) {
      order = await prisma.paymentOrder.findUnique({
        where: { providerSessionId: checkoutSession.id }
      });
    }

    const metadataUserId = checkoutSession.metadata?.appUserId;
    const metadataClerkUserId = checkoutSession.metadata?.clerkUserId;

    if (order && order.userId !== authSession.user.id) {
      return NextResponse.json({ ok: false, message: "This checkout session belongs to another user." }, { status: 403 });
    }

    if (!order && metadataUserId && metadataUserId !== authSession.user.id) {
      return NextResponse.json({ ok: false, message: "This checkout session belongs to another user." }, { status: 403 });
    }

    if (!order && metadataClerkUserId && metadataClerkUserId !== authSession.user.clerkUserId) {
      return NextResponse.json({ ok: false, message: "This checkout session belongs to another user." }, { status: 403 });
    }

    if (!order) {
      const plan = checkoutSession.metadata?.plan;

      if (!plan) {
        return NextResponse.json({ ok: false, message: "Checkout session is missing plan metadata." }, { status: 400 });
      }

      const entitlementPlan = await findPlanForCheckout(plan);
      order = await createPaymentOrderForUser({
        userId: authSession.user.id,
        workspaceId: authSession.workspace.id,
        plan: entitlementPlan,
        providerSessionId: checkoutSession.id
      });
    } else if (!order.providerSessionId) {
      order = await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { providerSessionId: checkoutSession.id }
      });
    }

    const subscriptionId = stripeObjectId(checkoutSession.subscription);
    let periodStart = unixToDate(checkoutSession.created);
    let periodEnd: Date | undefined;

    if (subscriptionId) {
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      const period = stripeSubscriptionPeriod(subscription);
      periodStart = period.currentPeriodStart ?? periodStart;
      periodEnd = period.currentPeriodEnd ?? periodEnd;
    } else {
      periodEnd = checkoutSession.expires_at ? unixToDate(checkoutSession.expires_at) : undefined;
    }

    const grantResult = await grantEntitlementForPaidOrder({
      orderId: order.id,
      providerPaymentId: checkoutProviderPaymentId(checkoutSession),
      subscriptionId,
      customerId: stripeObjectId(checkoutSession.customer) ?? null,
      periodStart,
      periodEnd
    });
    const entitlement = await getBillingAccessState(authSession.workspace.id);

    return NextResponse.json({
      ok: true,
      alreadyProcessed: grantResult.alreadyProcessed,
      entitlement
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : "Failed to confirm checkout session.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
