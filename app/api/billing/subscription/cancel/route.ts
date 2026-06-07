import { NextResponse } from "next/server";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/server";
import { requireAuth, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireAuth();
    const subscription = await prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId: session.workspace.id,
        planType: "MONTHLY",
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]
        },
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

    if (subscription.provider === "STRIPE" && subscription.providerSubscriptionId) {
      await getStripe().subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_period_end: true
      });
    }

    const updatedSubscription = await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: true
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
