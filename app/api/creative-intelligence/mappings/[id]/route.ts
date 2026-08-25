import { AdvertisingMappingMethod, AdvertisingMappingStatus, Prisma, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as {
      action?: "confirm" | "reject" | "mark_unrelated" | "clear";
      sku?: string | null;
      canonicalProductId?: string | null;
      canonicalVariantId?: string | null;
      sourceProductId?: string | null;
    } | null;
    const mapping = await prisma.advertisingProductMapping.findFirst({
      where: { id, workspaceId: session.workspace.id, validTo: null }
    });
    if (!mapping) return NextResponse.json({ ok: false, message: "Mapping not found." }, { status: 404 });

    const action = body?.action ?? "confirm";
    const update = action === "clear"
      ? {
          status: AdvertisingMappingStatus.UNMAPPED,
          mappingMethod: AdvertisingMappingMethod.UNKNOWN,
          mappingConfidence: 0,
          sku: null,
          canonicalProductId: null,
          canonicalVariantId: null,
          sourceProductId: null,
          manuallyConfirmedBy: null,
          manuallyConfirmedAt: null,
          evidenceJson: { clearedManualMapping: true, previousEvidence: mapping.evidenceJson } as Prisma.InputJsonValue
        }
      : {
          status: action === "reject" || action === "mark_unrelated" ? AdvertisingMappingStatus.REJECTED : AdvertisingMappingStatus.MANUALLY_CONFIRMED,
          mappingMethod: action === "reject" || action === "mark_unrelated" ? mapping.mappingMethod : AdvertisingMappingMethod.MANUAL,
          mappingConfidence: action === "reject" || action === "mark_unrelated" ? 0 : 1,
          sku: action === "mark_unrelated" || action === "reject" ? null : body?.sku ?? mapping.sku,
          canonicalProductId: body?.canonicalProductId ?? mapping.canonicalProductId,
          canonicalVariantId: body?.canonicalVariantId ?? mapping.canonicalVariantId,
          sourceProductId: body?.sourceProductId ?? mapping.sourceProductId,
          manuallyConfirmedBy: session.user.id,
          manuallyConfirmedAt: new Date(),
          evidenceJson: { manualAction: action, previousEvidence: mapping.evidenceJson } as Prisma.InputJsonValue
        };

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.advertisingProductMapping.update({
        where: { id: mapping.id },
        data: {
          ...update,
          mappingVersion: mapping.mappingVersion + 1
        }
      });
      await tx.advertisingProductMappingAudit.create({
        data: {
          workspaceId: session.workspace.id,
          mappingId: mapping.id,
          action,
          previousStatus: mapping.status,
          nextStatus: row.status,
          previousValue: mapping as unknown as Prisma.InputJsonValue,
          nextValue: update as Prisma.InputJsonValue,
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
    return NextResponse.json({ ok: false, message: "Failed to update mapping." }, { status: 500 });
  }
}
