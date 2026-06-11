export type StripeCheckoutCurrency = "cny" | "usd";
export type StripeCheckoutPlan = "database-setup" | "professional";

export const stripeCheckoutPlans: Record<
  StripeCheckoutPlan,
  {
    priceEnv: string | Record<StripeCheckoutCurrency, string>;
    mode: "payment" | "subscription";
  }
> = {
  "database-setup": {
    priceEnv: "STRIPE_PRICE_DATABASE_SETUP",
    mode: "payment"
  },
  professional: {
    priceEnv: {
      cny: "STRIPE_PRICE_PROFESSIONAL_CNY",
      usd: "STRIPE_PRICE_PROFESSIONAL_USD"
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
