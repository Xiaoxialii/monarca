import type { ReportGenerationAccess } from "@/lib/report-entitlements";

export function evaluateReportGenerationAccess(
  entitlement: {
    firstFreeReportUsed: boolean;
    oneTimeReportAvailable: boolean;
    subscriptionStatus: string;
    monthlyUnlimited: boolean;
    currentPeriodEnd: Date | string | null;
  },
  now?: Date
): ReportGenerationAccess;
