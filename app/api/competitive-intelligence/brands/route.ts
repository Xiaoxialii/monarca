import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { normalizeCompetitorBrandName, upsertUserConfirmedCompetitorBrands } from "@/lib/competitive-intelligence/meta-ad-library";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandsBody = {
  sku?: string;
  brands?: string[];
  category?: string | null;
  action?: "confirm" | "reject";
};

export async function GET(request: Request) {
  try {
    const session = await getCurrentWorkspaceContext(request);
    logWorkspaceContext("[workspace-context] competitive-intelligence.brands.GET", session);
    const url = new URL(request.url);
    const sku = (url.searchParams.get("sku") || "").trim();
    if (!sku) {
      return NextResponse.json({ ok: false, code: "SKU_REQUIRED", message: "SKU is required." }, { status: 400 });
    }

    const brands = await prisma.competitiveSkuBrand.findMany({
      where: {
        workspaceId: session.workspace.id,
        sku,
        validTo: null
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        sku: true,
        brandName: true,
        normalizedBrandName: true,
        category: true,
        status: true,
        source: true,
        confidence: true,
        evidenceJson: true,
        confirmedAt: true,
        rejectedAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({ ok: true, sku, brands });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({
      ok: false,
      code: "COMPETITOR_BRANDS_FAILED",
      message: error instanceof Error ? error.message : "Failed to load competitor brands."
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentWorkspaceContext(request);
    logWorkspaceContext("[workspace-context] competitive-intelligence.brands.POST", session);
    const body = await request.json().catch(() => ({})) as BrandsBody;
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    const brands = Array.isArray(body.brands)
      ? body.brands.filter((brand) => typeof brand === "string" && brand.trim().length > 0).map((brand) => brand.trim())
      : [];
    const action = body.action ?? "confirm";
    if (!sku) {
      return NextResponse.json({ ok: false, code: "SKU_REQUIRED", message: "SKU is required." }, { status: 400 });
    }
    if (!brands.length) {
      return NextResponse.json({ ok: false, code: "COMPETITOR_BRANDS_REQUIRED", message: "At least one competitor brand is required." }, { status: 400 });
    }

    if (action === "reject") {
      const normalizedNames = brands.map(normalizeCompetitorBrandName);
      await prisma.competitiveSkuBrand.updateMany({
        where: {
          workspaceId: session.workspace.id,
          sku,
          normalizedBrandName: { in: normalizedNames },
          validTo: null
        },
        data: {
          status: "REJECTED",
          rejectedAt: new Date()
        }
      });
    } else {
      await upsertUserConfirmedCompetitorBrands(prisma, {
        workspaceId: session.workspace.id,
        sku,
        brands,
        category: typeof body.category === "string" ? body.category : null,
        confirmedBy: session.user.id
      });
    }

    const rows = await prisma.competitiveSkuBrand.findMany({
      where: {
        workspaceId: session.workspace.id,
        sku,
        validTo: null
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        sku: true,
        brandName: true,
        normalizedBrandName: true,
        category: true,
        status: true,
        confidence: true,
        confirmedAt: true,
        rejectedAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({ ok: true, sku, brands: rows });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({
      ok: false,
      code: "COMPETITOR_BRANDS_SAVE_FAILED",
      message: error instanceof Error ? error.message : "Failed to save competitor brands."
    }, { status: 500 });
  }
}
