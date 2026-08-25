import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { GOOGLE_CREATIVE_UNSUPPORTED_REASON } from "@/lib/ads/creative-intelligence/types";

export async function GET(request: Request) {
  try {
    const session = await requireWorkspace(request);
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") || undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const campaignId = url.searchParams.get("campaignId") || undefined;
    const sku = url.searchParams.get("sku") || undefined;
    const mappingStatus = url.searchParams.get("mappingStatus") || undefined;
    const readiness = url.searchParams.get("readiness") || undefined;
    const take = clampInt(url.searchParams.get("limit"), 25, 100);
    const skip = clampInt(url.searchParams.get("offset"), 0, 100000);
    const start = dateParam(url.searchParams.get("start"));
    const end = dateParam(url.searchParams.get("end"));

    const snapshots = await prisma.advertisingProfitSnapshot.findMany({
      where: {
        workspaceId: session.workspace.id,
        ...(provider ? { provider } : {}),
        ...(accountId ? { sourceAccountId: accountId } : {}),
        ...(sku ? { sku } : {}),
        ...(readiness ? { readiness: readiness as never } : {}),
        ...(start || end ? {
          dateWindowStart: start ? { gte: start } : undefined,
          dateWindowEnd: end ? { lte: end } : undefined
        } : {}),
        staleAt: null
      },
      orderBy: sortFrom(url.searchParams.get("sort")),
      take,
      skip
    });
    const adIds = snapshots.map((row) => row.sourceAdId).filter(Boolean) as string[];
    const ads = await prisma.advertisingAd.findMany({
      where: {
        workspaceId: session.workspace.id,
        sourceAdId: { in: adIds },
        ...(campaignId ? { sourceCampaignId: campaignId } : {})
      },
      select: {
        sourceAdId: true,
        sourceCampaignId: true,
        sourceCreativeId: true,
        adName: true,
        finalUrl: true,
        previewUrl: true
      }
    });
    const adById = new Map(ads.map((ad) => [ad.sourceAdId, ad]));
    const filtered = campaignId ? snapshots.filter((row) => row.sourceAdId && adById.has(row.sourceAdId)) : snapshots;
    const mappings = await prisma.advertisingProductMapping.findMany({
      where: {
        workspaceId: session.workspace.id,
        validTo: null,
        sourceAdId: { in: filtered.map((row) => row.sourceAdId).filter(Boolean) as string[] },
        ...(mappingStatus ? { status: mappingStatus as never } : {})
      },
      select: {
        sourceAdId: true,
        sku: true,
        status: true,
        mappingMethod: true,
        mappingConfidence: true,
        evidenceJson: true
      }
    });
    const mappingByAd = new Map(mappings.map((mapping) => [mapping.sourceAdId ?? "", mapping]));
    const rows = filtered
      .filter((row) => !mappingStatus || mappingByAd.get(row.sourceAdId ?? "")?.status === mappingStatus)
      .map((row) => {
        const ad = row.sourceAdId ? adById.get(row.sourceAdId) : null;
        const mapping = row.sourceAdId ? mappingByAd.get(row.sourceAdId) : null;
        return {
          id: row.id,
          provider: row.provider,
          accountId: row.sourceAccountId,
          previewUrl: ad?.previewUrl ?? null,
          adName: ad?.adName ?? row.sourceAdId,
          sourceAdId: row.sourceAdId,
          sourceCreativeId: row.sourceCreativeId,
          sku: row.sku ?? mapping?.sku ?? null,
          campaignId: ad?.sourceCampaignId ?? null,
          landingPage: ad?.finalUrl ?? null,
          spend: row.adSpend,
          impressions: null,
          ctr: null,
          cpc: null,
          purchases: row.attributedOrders,
          cvr: null,
          revenue: row.attributedRevenue,
          roas: row.roas,
          netProfit: row.netProfitAfterAds,
          netMargin: row.netMargin,
          mappingConfidence: mapping?.mappingConfidence ?? row.attributionConfidence,
          mappingStatus: mapping?.status ?? "UNMAPPED",
          mappingMethod: mapping?.mappingMethod ?? "UNKNOWN",
          attributionScope: row.metricScope,
          attributionLevel: row.attributionLevel,
          attributionMethod: row.attributionMethod,
          attributionConfidence: row.attributionConfidence,
          canCompareAssets: row.canCompareAssets,
          comparisonBlockReason: row.comparisonBlockReason,
          analysisReadiness: row.readiness,
          dataWindow: {
            start: row.dateWindowStart,
            end: row.dateWindowEnd
          },
          warnings: row.warningsJson
        };
      });

    const summary = summarize(rows);
    const googleUnsupported = provider === "google_ads" ? GOOGLE_CREATIVE_UNSUPPORTED_REASON : null;
    return NextResponse.json({
      ok: true,
      summary,
      rows,
      pagination: { limit: take, offset: skip, count: rows.length },
      unsupported: googleUnsupported
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load creative performance." }, { status: 500 });
  }
}

function summarize(rows: Array<Record<string, unknown>>) {
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    creativesAnalyzed: rows.length,
    creativesReadyForAnalysis: rows.filter((row) => row.analysisReadiness === "READY_FOR_CREATIVE_ANALYSIS").length,
    unmappedAds: rows.filter((row) => row.mappingStatus === "UNMAPPED" || row.mappingStatus === "NEEDS_REVIEW").length,
    spendRepresented: round(rows.reduce((total, row) => total + number(row.spend), 0)),
    revenueRepresented: round(rows.reduce((total, row) => total + number(row.revenue), 0)),
    netProfitRepresented: round(rows.reduce((total, row) => total + number(row.netProfit), 0)),
    lowConfidenceSpend: round(rows.filter((row) => number(row.mappingConfidence) < 0.8 || number(row.attributionConfidence) < 0.7).reduce((total, row) => total + number(row.spend), 0)),
    lastSuccessfulSync: null
  };
}

function sortFrom(sort: string | null) {
  if (sort === "ctr") return { generatedAt: "desc" as const };
  if (sort === "cac") return { cac: "asc" as const };
  if (sort === "roas") return { roas: "desc" as const };
  if (sort === "net_profit") return { netProfitAfterAds: "desc" as const };
  return { adSpend: "desc" as const };
}

function dateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
