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

    return NextResponse.json(result, { status: result.ok ? 200 : result.status === "UNSUPPORTED" ? 409 : 404 });
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
