import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generatePortfolioOptimizationReport } from "@/lib/optimization/optimization-report-generator";
import { runOptimizationLayerV2 } from "@/lib/optimization/optimization-layer-v2";
import { optimizeSkuPortfolio } from "@/lib/optimization/portfolio-optimizer";
import { runOptimization } from "@/lib/optimization/solver";
import { prisma } from "@/lib/prisma";
import { applyDecisionLearningToDecisionReport } from "@/lib/decision-outcome/optimizer-learning-integration";
import type { CommerceState } from "@/lib/optimization/objective";
import type { PortfolioOptimizationInput } from "@/lib/optimization/profit-simulation-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] optimization.run.POST", session);

  const body = await request.json().catch(() => null) as (CommerceState & { portfolio_input?: PortfolioOptimizationInput }) | PortfolioOptimizationInput | null;
  const state = isCommerceState(body) ? body : null;
  const portfolioInput = isPortfolioInput(body) ? body : body?.portfolio_input;

  if (!state?.skus?.length && !portfolioInput?.skus?.length) {
    return NextResponse.json({ ok: false, message: "Commerce state with skus is required." }, { status: 400 });
  }

  const validation = portfolioInput ? validateDirectOptimizationInput(portfolioInput) : null;
  if (validation?.status === "BLOCKED") {
    return NextResponse.json({
      ok: false,
      status: "BLOCKED",
      message: validation.userMessage,
      recommendedAction: validation.recommendedAction,
      validation
    }, { status: 400 });
  }

  const portfolioOptimization = portfolioInput ? optimizeSkuPortfolio(portfolioInput) : null;
  const portfolioReport = portfolioOptimization ? generatePortfolioOptimizationReport(portfolioOptimization) : null;
  const learnedPortfolioReport = portfolioReport
    ? await applyDecisionLearningToDecisionReport(prisma, {
      workspaceId: session.workspace.id,
      content: {
        decision_report: {
          sku_portfolio_optimization: portfolioOptimization
        }
      }
    })
    : null;
  const learnedOptimization = learnedPortfolioReport
    ? ((learnedPortfolioReport.decision_report as Record<string, unknown>).sku_portfolio_optimization ?? portfolioOptimization)
    : portfolioOptimization;

  return NextResponse.json({
    ok: true,
    optimization: state ? runOptimization(state) : null,
    optimization_report: state ? runOptimizationLayerV2(state) : null,
    sku_portfolio_optimization: learnedOptimization,
    sku_portfolio_report: portfolioReport
  });
}

function validateDirectOptimizationInput(input: PortfolioOptimizationInput | undefined | null) {
  const missing = new Set<string>();
  const rows = input?.skus ?? [];

  if (!rows.length) {
    missing.add("sku");
    missing.add("quantity");
    missing.add("revenue");
    missing.add("cogs");
    missing.add("inventory_on_hand");
    missing.add("ad_spend");
  }

  if (!rows.some((row) => typeof row.sku === "string" && row.sku.trim())) missing.add("sku");
  if (!rows.some((row) => finitePositive(row.quantity))) missing.add("quantity");
  if (!rows.some((row) => finitePositive(row.revenue))) missing.add("revenue");
  if (!rows.some((row) => finitePositive(row.cogs))) missing.add("cogs");
  if (!rows.some((row) => finiteNumber(row.inventory))) missing.add("inventory_on_hand");
  if (!rows.some((row) => finiteNumber(row.ads_spend))) missing.add("ad_spend");

  return {
    status: missing.size ? "BLOCKED" : "READY",
    missingRequiredFields: Array.from(missing),
    missingRecommendedFields: [],
    affectedModules: missing.size ? ["SKU Profit Optimization", "Inventory Optimization", "Advertising Optimization"] : [],
    userMessage: missing.size
      ? `We cannot run optimization yet because required fields are missing: ${Array.from(missing).join(", ")}.`
      : "Optimization is ready.",
    recommendedAction: missing.size
      ? "Provide SKU-level revenue, quantity, product cost, inventory, and ad spend before running optimization."
      : "Run optimization."
  };
}

function finitePositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isCommerceState(value: unknown): value is CommerceState {
  const candidate = value as CommerceState | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      Array.isArray(candidate.skus) &&
      candidate.skus.some((sku) => typeof sku.skuId === "string") &&
      typeof candidate.constraints?.budgetLimit === "number"
  );
}

function isPortfolioInput(value: unknown): value is PortfolioOptimizationInput {
  return Boolean(value && typeof value === "object" && Array.isArray((value as PortfolioOptimizationInput).skus) && "constraints" in value && "total_ads_budget" in ((value as PortfolioOptimizationInput).constraints ?? {}));
}
