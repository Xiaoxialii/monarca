import { roundCurrency, safeRatio } from "@/lib/optimization/objective";

export type CustomerLtvInput = {
  customerId: string;
  revenue: number;
  orders: number;
  daysSinceFirstOrder: number;
  daysSinceLastOrder: number;
};

export type CustomerLtvPrediction = {
  customerId: string;
  historicalValue: number;
  predictedLtv: number;
  ltvConfidence: number;
  confidence: number;
};

export function predictCustomerLtv(customer: CustomerLtvInput): CustomerLtvPrediction {
  const avgOrderValue = safeRatio(customer.revenue, customer.orders);
  const purchaseFrequency = customer.daysSinceFirstOrder > 0 ? customer.orders / customer.daysSinceFirstOrder : customer.orders;
  const recencyFactor = customer.daysSinceLastOrder <= 30 ? 1.15 : customer.daysSinceLastOrder <= 90 ? 1 : 0.75;
  const grossMargin = 0.45;
  const customerLifetime = Math.max(30, customer.daysSinceFirstOrder || 90);
  const historicalValue = roundCurrency(customer.revenue);
  const predictedLtv = roundCurrency(avgOrderValue * purchaseFrequency * customerLifetime * grossMargin * recencyFactor);
  const confidence = Math.max(0.35, Math.min(0.9, 0.45 + Math.min(customer.orders, 5) * 0.08));

  return {
    customerId: customer.customerId,
    historicalValue,
    predictedLtv,
    ltvConfidence: confidence,
    confidence
  };
}

export function predictCustomerLtvs(customers: CustomerLtvInput[]) {
  return customers.map(predictCustomerLtv);
}
