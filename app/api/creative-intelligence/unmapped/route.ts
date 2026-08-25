import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET(request: Request) {
  try {
    const session = await requireWorkspace(request);
    const url = new URL(request.url);
    const take = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50), 100));
    const mappings = await prisma.advertisingProductMapping.findMany({
      where: {
        workspaceId: session.workspace.id,
        validTo: null,
        status: { in: ["UNMAPPED", "NEEDS_REVIEW", "AMBIGUOUS"] as never }
      },
      orderBy: { updatedAt: "desc" },
      take
    });
    const ads = await prisma.advertisingAd.findMany({
      where: {
        workspaceId: session.workspace.id,
        sourceAdId: { in: mappings.map((mapping) => mapping.sourceAdId).filter(Boolean) as string[] }
      },
      select: {
        sourceAdId: true,
        adName: true,
        finalUrl: true,
        previewUrl: true,
        lastSyncedAt: true
      }
    });
    const adById = new Map(ads.map((ad) => [ad.sourceAdId, ad]));
    return NextResponse.json({
      ok: true,
      ads: mappings.map((mapping) => ({
        mappingId: mapping.id,
        status: mapping.status,
        evidence: mapping.evidenceJson,
        sourceAdId: mapping.sourceAdId,
        sourceCreativeId: mapping.sourceCreativeId,
        sku: mapping.sku,
        adName: mapping.sourceAdId ? adById.get(mapping.sourceAdId)?.adName ?? mapping.sourceAdId : null,
        landingPage: mapping.sourceAdId ? adById.get(mapping.sourceAdId)?.finalUrl ?? null : null,
        previewUrl: mapping.sourceAdId ? adById.get(mapping.sourceAdId)?.previewUrl ?? null : null,
        lastSyncedAt: mapping.sourceAdId ? adById.get(mapping.sourceAdId)?.lastSyncedAt ?? null : null
      }))
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load unmapped ads." }, { status: 500 });
  }
}
