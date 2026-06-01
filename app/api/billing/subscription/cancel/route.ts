import { NextResponse } from "next/server";
import { UserSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { requireAuth, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireAuth();
    const subscription = await prisma.userSubscription.findFirst({
      where: {
        userId: session.user.id,
        status: UserSubscriptionStatus.ACTIVE,
        currentPeriodEnd: {
          gte: new Date()
        }
      },
      orderBy: {
        currentPeriodEnd: "desc"
      }
    });

    if (!subscription) {
      return NextResponse.json(
        { ok: false, message: "No active subscription found." },
        { status: 404 }
      );
    }

    if (subscription.paymentProvider === "stripe" && subscription.providerSubscriptionId) {
      await getStripe().subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_period_end: true
      });
    }

    const updatedSubscription = await prisma.userSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true
      },
      include: {
        plan: true
      }
    });

    return NextResponse.json({ ok: true, subscription: updatedSubscription });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to cancel subscription." },
      { status: 500 }
    );
  }
}
