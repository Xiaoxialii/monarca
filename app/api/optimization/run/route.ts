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
