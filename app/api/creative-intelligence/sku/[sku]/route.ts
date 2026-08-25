import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET(request: Request, context: { params: Promise<{ sku: string }> }) {
  try {
    const session = await requireWorkspace(request);
    const { sku } = await context.params;
    const mappings = await prisma.advertisingProductMapping.findMany({
      where: {
        workspaceId: session.workspace.id,
        sku,
        validTo: null,
        status: { in: ["AUTO_CONFIRMED", "MANUALLY_CONFIRMED"] as never }
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    if (!mappings.length) {
      return NextResponse.json({
        ok: true,
        sku,
        creatives: [],
        state: "No advertising creative has been reliably mapped to this SKU."
      });
    }
    const sourceAdIds = mappings.map((mapping) => mapping.sourceAdId).filter(Boolean) as string[];
    const ads = await prisma.advertisingAd.findMany({
      where: { workspaceId: session.workspace.id, sourceAdId: { in: sourceAdIds } },
      select: {
        sourceAdId: true,
        sourceCreativeId: true,
        sourceCampaignId: true,
        adName: true,
        finalUrl: true,
        previewUrl: true
      }
    });
    const snapshots = await prisma.advertisingProfitSnapshot.findMany({
      where: {
        workspaceId: session.workspace.id,
        sku,
        sourceAdId: { in: sourceAdIds },
        staleAt: null
      },
      orderBy: { generatedAt: "desc" },
      take: 50
    });
    const mappingByAd = new Map(mappings.map((mapping) => [mapping.sourceAdId ?? "", mapping]));
    const snapshotByAd = new Map(snapshots.map((snapshot) => [snapshot.sourceAdId ?? "", snapshot]));
    return NextResponse.json({
      ok: true,
      sku,
      creatives: ads.map((ad) => {
        const mapping = mappingByAd.get(ad.sourceAdId);
        const snapshot = snapshotByAd.get(ad.sourceAdId);
        return {
          sourceAdId: ad.sourceAdId,
          sourceCreativeId: ad.sourceCreativeId,
          campaignId: ad.sourceCampaignId,
          adName: ad.adName,
          previewUrl: ad.previewUrl,
          landingPage: ad.finalUrl,
          spend: snapshot?.adSpend ?? null,
          impressions: null,
          ctr: null,
          cpc: null,
          purchases: snapshot?.attributedOrders ?? null,
          attributedRevenue: snapshot?.attributedRevenue ?? null,
          mappingConfidence: mapping?.mappingConfidence ?? null,
          attributionScope: snapshot?.metricScope ?? "AD",
          dataQualityWarning: snapshot?.comparisonBlockReason ?? null
        };
      })
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load SKU advertising creatives." }, { status: 500 });
  }
}
