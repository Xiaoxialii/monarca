import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspace(request);
    const { id } = await context.params;
    const snapshot = await prisma.advertisingProfitSnapshot.findFirst({
      where: { id, workspaceId: session.workspace.id, staleAt: null }
    });
    if (!snapshot) {
      return NextResponse.json({ ok: false, message: "Creative performance record not found." }, { status: 404 });
    }
    const ad = snapshot.sourceAdId
      ? await prisma.advertisingAd.findFirst({
          where: {
            workspaceId: session.workspace.id,
            provider: snapshot.provider,
            sourceAccountId: snapshot.sourceAccountId,
            sourceAdId: snapshot.sourceAdId
          },
          select: {
            sourceAdId: true,
            sourceCampaignId: true,
            sourceAdSetId: true,
            sourceCreativeId: true,
            adName: true,
            finalUrl: true,
            previewUrl: true,
            status: true,
            effectiveStatus: true,
            lastSyncedAt: true
          }
        })
      : null;
    const creative = snapshot.sourceCreativeId
      ? await prisma.advertisingCreative.findFirst({
          where: {
            workspaceId: session.workspace.id,
            provider: snapshot.provider,
            sourceAccountId: snapshot.sourceAccountId,
            sourceCreativeId: snapshot.sourceCreativeId
          },
          select: {
            sourceCreativeId: true,
            creativeName: true,
            creativeFormat: true,
            imageUrl: true,
            thumbnailUrl: true,
            videoId: true,
            videoThumbnailUrl: true,
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,
            destinationUrl: true,
            lastSyncedAt: true
          }
        })
      : null;
    const mapping = snapshot.sourceAdId
      ? await prisma.advertisingProductMapping.findFirst({
          where: {
            workspaceId: session.workspace.id,
            provider: snapshot.provider,
            sourceAccountId: snapshot.sourceAccountId,
            sourceAdId: snapshot.sourceAdId,
            validTo: null
          },
          select: {
            id: true,
            sku: true,
            status: true,
            mappingMethod: true,
            mappingConfidence: true,
            evidenceJson: true,
            manuallyConfirmedAt: true
          }
        })
      : null;
    const links = snapshot.sourceCreativeId
      ? await prisma.advertisingCreativeAssetLink.findMany({
          where: {
            workspaceId: session.workspace.id,
            provider: snapshot.provider,
            sourceAccountId: snapshot.sourceAccountId,
            sourceCreativeId: snapshot.sourceCreativeId,
            isActive: true
          },
          orderBy: { position: "asc" },
          include: {
            creativeAsset: {
              select: {
                id: true,
                assetType: true,
                role: true,
                textContent: true,
                imageUrl: true,
                thumbnailUrl: true,
                videoId: true,
                status: true,
                firstSeenAt: true,
                lastSeenAt: true
              }
            }
          }
        })
      : [];
    const performance = await prisma.advertisingPerformanceDaily.findMany({
      where: {
        workspaceId: session.workspace.id,
        provider: snapshot.provider,
        sourceAccountId: snapshot.sourceAccountId,
        sourceAdId: snapshot.sourceAdId,
        date: {
          gte: snapshot.dateWindowStart,
          lte: snapshot.dateWindowEnd
        }
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        impressions: true,
        clicks: true,
        outboundClicks: true,
        spend: true,
        purchases: true,
        attributedRevenue: true,
        attributionLevel: true,
        attributionMethod: true,
        attributionConfidence: true,
        sourceMetricScope: true
      }
    });

    return NextResponse.json({
      ok: true,
      detail: {
        id: snapshot.id,
        ad,
        creative,
        mapping,
        assets: links.map((link) => ({
          linkId: link.id,
          position: link.position,
          ...link.creativeAsset,
          linkRole: link.assetRole,
          attributionNote: link.creativeAsset.status === "NOT_SEPARATELY_ATTRIBUTABLE"
            ? "This creative contains multiple assets. Performance is available at the ad level and cannot be reliably attributed to an individual image or text asset."
            : null
        })),
        performance,
        profitability: {
          spend: snapshot.adSpend,
          orders: snapshot.attributedOrders,
          revenue: snapshot.attributedRevenue,
          cogs: snapshot.attributedCogs,
          operatingCost: snapshot.attributedOperatingCost,
          contributionProfit: snapshot.attributedContributionProfit,
          netProfit: snapshot.netProfitAfterAds,
          netMargin: snapshot.netMargin,
          roas: snapshot.roas,
          contributionRoas: snapshot.contributionRoas,
          profitPerAdDollar: snapshot.profitPerAdDollar,
          cac: snapshot.cac,
          breakEvenRoas: snapshot.breakEvenRoas,
          breakEvenCpa: snapshot.breakEvenCpa,
          costCompleteness: snapshot.costCompleteness,
          profitabilityEngineVersion: snapshot.profitabilityEngineVersion
        },
        attribution: {
          metricScope: snapshot.metricScope,
          level: snapshot.attributionLevel,
          method: snapshot.attributionMethod,
          confidence: snapshot.attributionConfidence,
          canCompareAssets: snapshot.canCompareAssets,
          comparisonBlockReason: snapshot.comparisonBlockReason
        },
        analysis: {
          readiness: snapshot.readiness,
          warnings: snapshot.warningsJson,
          diagnosisMessage: "Creative diagnosis will become available when this ad has sufficient, reliably attributed performance and profitability data."
        }
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load creative performance detail." }, { status: 500 });
  }
}
