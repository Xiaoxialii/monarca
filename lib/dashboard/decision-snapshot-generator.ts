import type { PrismaClient } from "@prisma/client";
import {
  loadEcommerceSalesDashboardData,
  type LoadDashboardResult
} from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { upsertDecisionSnapshot } from "@/lib/dashboard/snapshot-store";

type DecisionMode = "full" | "sku";

type GenerateDecisionSnapshotsResult = {
  generated: Array<{
    mode: DecisionMode;
    optimizationType: string;
    snapshotId: string | null;
    state: LoadDashboardResult["state"];
  }>;
};

const OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE =
  "Connected, but operating reports need sales/order history, order line items, refunds, customers, inventory, unit costs, fulfillment costs, and ad spend to generate reliable KPIs and recommendations.";

const OPTIMIZATION_DATA_REQUIREMENTS = [
  "sales_order_history",
  "order_line_items",
  "refunds",
  "customers",
  "inventory",
  "unit_costs",
  "fulfillment_costs",
  "ad_spend"
] as const;

export async function generateEcommerceDecisionSnapshots(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    dataSourceId?: string | null;
  }
): Promise<GenerateDecisionSnapshotsResult> {
  const generated: GenerateDecisionSnapshotsResult["generated"] = [];

  for (const mode of ["full", "sku"] as const) {
    const loaded = await loadEcommerceSalesDashboardData({
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId ?? null,
      decisionMode: mode
    });
    const content = decisionSnapshotContent(loaded);
    const decisionReport = content.decision_report;
    const portfolioSummary = decisionReport?.portfolioSummary;
    const snapshot = await upsertDecisionSnapshot(prisma, {
      workspaceId: input.workspaceId,
      optimizationType: mode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION",
      content,
      assumptions: {
        generatedFrom: "canonical_snapshot",
        dashboardState: loaded.state,
        dataSourceId: input.dataSourceId ?? null,
        lineage: loaded.lineage ?? null
      },
      expectedProfitImpact: typeof portfolioSummary?.totalProfitImpact === "number"
        ? portfolioSummary.totalProfitImpact
        : null
    });

    generated.push({
      mode,
      optimizationType: mode === "sku" ? "SKU_OPTIMIZATION" : "FULL_OPTIMIZATION",
      snapshotId: typeof snapshot?.id === "string" ? snapshot.id : null,
      state: loaded.state
    });
  }

  return { generated };
}

function decisionSnapshotContent(loaded: LoadDashboardResult) {
  const report = loaded.data.decision_report;
  const missingFields = loaded.data.quality.missing_fields ?? [];
  const needsProfitInputs = missingFields.some((field) =>
    /orders|lineItems|refunds|customers|inventory|cost|ads|spend/i.test(field)
  );
  const exposedReport = needsProfitInputs ? null : report;

  return {
    ok: true,
    state: loaded.state,
    hasConnectedDataSource: loaded.state === "ready",
    message: needsProfitInputs
      ? OPTIMIZATION_DATA_REQUIREMENTS_MESSAGE
      : loaded.message ?? null,
    decision_report: exposedReport,
    portfolioSummary: exposedReport?.portfolioSummary ?? null,
    allocationRecommendation: exposedReport?.allocationRecommendation ?? null,
    skuDecisions: exposedReport?.skuDecisions ?? [],
    riskAlerts: exposedReport?.riskAlerts ?? [],
    executionPlan: exposedReport?.executionPlan ?? [],
    generated_at: new Date().toISOString(),
    source_platforms: loaded.data.metadata.source_platforms,
    lineage: loaded.lineage ?? null,
    missingDataRequirements: needsProfitInputs ? [...OPTIMIZATION_DATA_REQUIREMENTS] : [],
    warning: needsProfitInputs
      ? "OPTIMIZATION_INPUTS_INCOMPLETE"
      : loaded.state === "ready" ? null : "DECISION_SNAPSHOT_PARTIAL"
  };
}
