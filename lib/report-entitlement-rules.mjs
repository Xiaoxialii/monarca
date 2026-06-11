export function evaluateReportGenerationAccess(entitlement, now = new Date()) {
  const currentPeriodEnd = entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null;
  const hasActiveSubscription =
    entitlement.subscriptionStatus === "active" &&
    entitlement.monthlyUnlimited === true &&
    currentPeriodEnd instanceof Date &&
    Number.isFinite(currentPeriodEnd.getTime()) &&
    currentPeriodEnd > now;

  if (hasActiveSubscription) {
    return {
      allowed: true,
      reason: "SUBSCRIPTION_ACTIVE",
      accessType: "subscription"
    };
  }

  if (entitlement.oneTimeReportAvailable === true) {
    return {
      allowed: true,
      reason: "ONE_TIME_REPORT_AVAILABLE",
      accessType: "one_time_purchase"
    };
  }

  if (entitlement.subscriptionStatus === "expired" || entitlement.subscriptionStatus === "cancelled") {
    return {
      allowed: false,
      reason: "SUBSCRIPTION_EXPIRED"
    };
  }

  return {
    allowed: false,
    reason: "NO_ACCESS"
  };
}
