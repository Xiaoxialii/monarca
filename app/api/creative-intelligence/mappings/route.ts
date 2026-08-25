import { AdvertisingMappingMethod, AdvertisingMappingStatus, Prisma, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { runAutomaticCreativeMappings } from "@/lib/ads/creative-intelligence/store";

export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER], request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const campaignId = url.searchParams.get("campaignId") || undefined;
    const take = clampInt(url.searchParams.get("limit"), 50, 100);
    const skip = clampInt(url.searchParams.get("offset"), 0, 100000);
    const mappings = await prisma.advertisingProductMapping.findMany({
      where: {
        workspaceId: session.workspace.id,
        validTo: null,
        ...(status ? { status: status as never } : {}),
        ...(accountId ? { sourceAccountId: accountId } : {}),
        ...(campaignId ? { sourceCampaignId: campaignId } : {})
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take,
      skip
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
      mappings: mappings.map((mapping) => {
        const ad = mapping.sourceAdId ? adById.get(mapping.sourceAdId) : null;
        return {
          id: mapping.id,
          provider: mapping.provider,
          accountId: mapping.sourceAccountId,
          sourceAdId: mapping.sourceAdId,
          sourceCreativeId: mapping.sourceCreativeId,
          adName: ad?.adName ?? mapping.sourceAdId,
          previewUrl: ad?.previewUrl ?? null,
          landingPage: ad?.finalUrl ?? null,
          sku: mapping.sku,
          canonicalProductId: mapping.canonicalProductId,
          canonicalVariantId: mapping.canonicalVariantId,
          mappingMethod: mapping.mappingMethod,
          mappingConfidence: mapping.mappingConfidence,
          evidence: mapping.evidenceJson,
          status: mapping.status,
          lastSyncedAt: ad?.lastSyncedAt ?? null,
          updatedAt: mapping.updatedAt
        };
      }),
      pagination: { limit: take, offset: skip, count: mappings.length }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to load Ad-SKU mappings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const body = await request.json().catch(() => null) as {
      action?: string;
      dataSourceId?: string;
      provider?: string;
      sourceAccountId?: string;
      mappingId?: string;
      sku?: string | null;
      canonicalProductId?: string | null;
      canonicalVariantId?: string | null;
      sourceProductId?: string | null;
      multipleSkus?: string[];
    } | null;
    if (body?.action === "rerun_auto_mapping") {
      if (!body.dataSourceId || !body.provider || !body.sourceAccountId) {
        return NextResponse.json({ ok: false, message: "dataSourceId, provider and sourceAccountId are required." }, { status: 400 });
      }
      const source = await prisma.dataSourceConnection.findFirst({
        where: { id: body.dataSourceId, workspaceId: session.workspace.id, provider: body.provider, isActive: true },
        select: { id: true }
      });
      if (!source) return NextResponse.json({ ok: false, message: "Data source not found." }, { status: 404 });
      const result = await runAutomaticCreativeMappings(prisma, {
        workspaceId: session.workspace.id,
        provider: body.provider,
        dataSourceId: body.dataSourceId,
        sourceAccountId: body.sourceAccountId
      });
      return NextResponse.json({ ok: true, result });
    }

    if (!body?.mappingId) {
      return NextResponse.json({ ok: false, message: "mappingId is required." }, { status: 400 });
    }
    const mapping = await prisma.advertisingProductMapping.findFirst({
      where: { id: body.mappingId, workspaceId: session.workspace.id, validTo: null }
    });
    if (!mapping) return NextResponse.json({ ok: false, message: "Mapping not found." }, { status: 404 });

    const status = body.action === "reject"
      ? AdvertisingMappingStatus.REJECTED
      : body.action === "mark_unrelated"
        ? AdvertisingMappingStatus.REJECTED
        : AdvertisingMappingStatus.MANUALLY_CONFIRMED;
    const nextData = {
      sku: body.action === "mark_unrelated" ? null : body.sku ?? mapping.sku,
      canonicalProductId: body.canonicalProductId ?? mapping.canonicalProductId,
      canonicalVariantId: body.canonicalVariantId ?? mapping.canonicalVariantId,
      sourceProductId: body.sourceProductId ?? mapping.sourceProductId,
      mappingMethod: body.action === "reject" || body.action === "mark_unrelated" ? mapping.mappingMethod : AdvertisingMappingMethod.MANUAL,
      mappingConfidence: body.action === "reject" || body.action === "mark_unrelated" ? 0 : 1,
      evidenceJson: {
        previousEvidence: mapping.evidenceJson,
        manualAction: body.action ?? "confirm",
        multipleSkus: Array.isArray(body.multipleSkus) ? body.multipleSkus : undefined
      } as Prisma.InputJsonValue,
      status,
      manuallyConfirmedBy: session.user.id,
      manuallyConfirmedAt: new Date(),
      mappingVersion: mapping.mappingVersion + 1
    };
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.advertisingProductMapping.update({
        where: { id: mapping.id },
        data: nextData
      });
      await tx.advertisingProductMappingAudit.create({
        data: {
          workspaceId: session.workspace.id,
          mappingId: mapping.id,
          action: body.action ?? "manual_confirm",
          previousStatus: mapping.status,
          nextStatus: row.status,
          previousValue: mapping as unknown as Prisma.InputJsonValue,
          nextValue: nextData as Prisma.InputJsonValue,
          actorUserId: session.user.id
        }
      });
      await tx.advertisingProfitSnapshot.updateMany({
        where: { workspaceId: session.workspace.id, mappingId: mapping.id, staleAt: null },
        data: { staleAt: new Date() }
      });
      return row;
    });

    return NextResponse.json({ ok: true, mapping: updated });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ ok: false, message: "Failed to update Ad-SKU mapping." }, { status: 500 });
  }
}

function clampInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}
