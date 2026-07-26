export type StripeCheckoutCurrency = "cny" | "usd";
export type StripeCheckoutPlan = "database-setup" | "professional" | "enterprise";

export const stripeCheckoutPlans: Record<
  StripeCheckoutPlan,
  {
    priceEnv: string | Record<StripeCheckoutCurrency, string>;
    mode: "payment" | "subscription";
  }
> = {
  "database-setup": {
    priceEnv: {
      cny: "STRIPE_PRICE_PERFORMANCE_BASE_CNY",
      usd: "STRIPE_PRICE_PERFORMANCE_BASE_USD"
    },
    mode: "subscription"
  },
  professional: {
    priceEnv: {
      cny: "STRIPE_PRICE_PROFESSIONAL_CNY",
      usd: "STRIPE_PRICE_PROFESSIONAL_USD"
    },
    mode: "subscription"
  },
  enterprise: {
    priceEnv: {
      cny: "STRIPE_PRICE_GROWTH_CNY",
      usd: "STRIPE_PRICE_GROWTH_USD"
    },
    mode: "subscription"
  }
};

export function isStripeCheckoutPlan(plan: string): plan is StripeCheckoutPlan {
  return plan in stripeCheckoutPlans;
}

export function isStripeCheckoutCurrency(currency: string): currency is StripeCheckoutCurrency {
  return currency === "cny" || currency === "usd";
}
