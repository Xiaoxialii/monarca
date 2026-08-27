import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { discoverCompetitorBrandsForSku } from "@/lib/competitive-intelligence/discovery";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscoverBody = {
  sku?: string;
  country?: string | null;
  limitPerTerm?: number;
};

export async function POST(request: Request) {
  try {
    const session = await getCurrentWorkspaceContext(request);
    logWorkspaceContext("[workspace-context] competitive-intelligence.discover.POST", session);
    const body = await request.json().catch(() => ({})) as DiscoverBody;
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    if (!sku) {
      return NextResponse.json({ ok: false, code: "SKU_REQUIRED", message: "SKU is required." }, { status: 400 });
    }

    const result = await discoverCompetitorBrandsForSku(prisma, {
      workspaceId: session.workspace.id,
      sku,
      country: body.country ?? "US",
      limitPerTerm: body.limitPerTerm
    });

    const message = result.ok
      ? undefined
      : result.code === "SKU_PRODUCT_CONTEXT_MISSING"
        ? "No Shopify product context was found for this SKU."
        : result.code === "SKU_PRODUCT_CONTEXT_INSUFFICIENT"
          ? "Shopify product context for this SKU is missing searchable product name, category, tags, or handle."
          : result.code === "PUBLIC_AD_LIBRARY_TOKEN_MISSING"
            ? "Configure META_AD_LIBRARY_ACCESS_TOKEN before discovering competitors from public ads."
            : "No competitor candidates were found from the current SKU product context and public ad search terms.";

    return NextResponse.json({ ...result, message }, { status: result.ok ? 200 : result.status === "UNSUPPORTED" ? 409 : 404 });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({
      ok: false,
      code: "COMPETITOR_DISCOVERY_FAILED",
      message: error instanceof Error ? error.message : "Failed to discover competitor brands."
    }, { status: 500 });
  }
}
