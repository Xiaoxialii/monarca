import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { discoverCompetitorBrandsForSku } from "@/lib/competitive-intelligence/discovery";
import { publicAdLibraryErrorCode, publicAdLibraryUserMessage } from "@/lib/competitive-intelligence/meta-ad-library";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscoverBody = {
  sku?: string;
  dataSourceId?: string | null;
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
      dataSourceId: typeof body.dataSourceId === "string" && body.dataSourceId.trim() ? body.dataSourceId.trim() : undefined,
      country: body.country ?? "US",
      limitPerTerm: body.limitPerTerm
    });

    const message = result.ok
      ? undefined
      : result.code === "SNAPSHOT_NOT_READY"
        ? "Canonical data is not ready for competitive discovery."
        : result.code === "PRODUCT_NOT_FOUND"
          ? "This SKU was not found in the active product context index."
          : result.code === "PRODUCT_CONTEXT_INCOMPLETE"
            ? "This SKU is imported, but it is missing product name, category, brand, tags, handle, or description for reliable competitor search."
          : result.code === "PUBLIC_AD_LIBRARY_TOKEN_MISSING"
            ? "Configure META_AD_LIBRARY_ACCESS_TOKEN before discovering competitors from public ads."
            : result.code === "PUBLIC_AD_LIBRARY_AUTH_EXPIRED" || result.code === "PUBLIC_AD_LIBRARY_AUTH_FAILED" || result.code === "PUBLIC_AD_LIBRARY_RATE_LIMIT"
              ? publicAdLibraryUserMessage(result.code)
            : "No competitor candidates were found from the current SKU product context and public ad search terms.";

    return NextResponse.json({ ...result, message }, { status: result.ok ? 200 : result.status === "UNSUPPORTED" ? 409 : 404 });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const publicAdCode = publicAdLibraryErrorCode(error);
    if (publicAdCode === "PUBLIC_AD_LIBRARY_AUTH_EXPIRED" || publicAdCode === "PUBLIC_AD_LIBRARY_AUTH_FAILED" || publicAdCode === "PUBLIC_AD_LIBRARY_RATE_LIMIT") {
      return NextResponse.json({
        ok: false,
        code: publicAdCode,
        message: publicAdLibraryUserMessage(publicAdCode)
      }, { status: 409 });
    }
    return NextResponse.json({
      ok: false,
      code: "COMPETITOR_DISCOVERY_FAILED",
      message: "Failed to discover competitor brands."
    }, { status: 500 });
  }
}
