import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { buildCompetitiveContextFromPublicAds } from "@/lib/competitive-intelligence/context";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const session = await getCurrentWorkspaceContext(request);
    logWorkspaceContext("[workspace-context] competitive-intelligence.sku.GET", session);
    const { sku: encodedSku } = await params;
    const sku = decodeURIComponent(encodedSku || "").trim();
    const url = new URL(request.url);
    const country = (url.searchParams.get("country") || "US").toUpperCase();
    if (!sku) {
      return NextResponse.json({ ok: false, code: "SKU_REQUIRED", message: "SKU is required." }, { status: 400 });
    }

    const [context, brands, ads, latestSyncRun] = await Promise.all([
      buildCompetitiveContextFromPublicAds(prisma, {
        workspaceId: session.workspace.id,
        sku,
        country
      }),
      prisma.competitiveSkuBrand.findMany({
        where: {
          workspaceId: session.workspace.id,
          sku,
          validTo: null
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          brandName: true,
          normalizedBrandName: true,
          category: true,
          status: true,
          confidence: true,
          confirmedAt: true,
          updatedAt: true
        }
      }),
      prisma.competitivePublicAd.findMany({
        where: {
          workspaceId: session.workspace.id,
          sku,
          provider: "META_AD_LIBRARY",
          country
        },
        orderBy: [
          { startDate: "asc" },
          { updatedAt: "desc" }
        ],
        take: 50,
        select: {
          id: true,
          provider: true,
          brandName: true,
          country: true,
          sourceAdArchiveId: true,
          pageName: true,
          adSnapshotUrl: true,
          startDate: true,
          endDate: true,
          isActive: true,
          publisherPlatforms: true,
          displayFormat: true,
          creativeBodies: true,
          creativeTitles: true,
          creativeDescriptions: true,
          lastSeenAt: true
        }
      }),
      prisma.competitivePublicAdSyncRun.findFirst({
        where: {
          workspaceId: session.workspace.id,
          sku,
          provider: "META_AD_LIBRARY",
          country
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          rowCount: true,
          errorCode: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true
        }
      })
    ]);

    return NextResponse.json({
      ok: true,
      sku,
      country,
      context,
      brands,
      ads,
      latestSyncRun,
      dataQuality: {
        publicDataOnly: true,
        performanceMetricsAvailable: false,
        note: "Public competitor ads are informational and are not used for automated budget decisions."
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({
      ok: false,
      code: "COMPETITIVE_CONTEXT_FAILED",
      message: error instanceof Error ? error.message : "Failed to load competitive context."
    }, { status: 500 });
  }
}
