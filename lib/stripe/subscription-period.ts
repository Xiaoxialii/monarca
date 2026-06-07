import type Stripe from "stripe";

function unixToDate(value: number | null | undefined) {
  return value ? new Date(value * 1000) : undefined;
}

export function stripeSubscriptionPeriod(subscription: Stripe.Subscription) {
  const rawSubscription = subscription as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
    items?: {
      data?: Array<{
        current_period_start?: number | null;
        current_period_end?: number | null;
      }>;
    };
  };
  const firstItem = rawSubscription.items?.data?.[0];

  return {
    currentPeriodStart: unixToDate(rawSubscription.current_period_start ?? firstItem?.current_period_start),
    currentPeriodEnd: unixToDate(rawSubscription.current_period_end ?? firstItem?.current_period_end)
  };
}
