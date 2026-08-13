import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import {
  isSupportedShopifySyncInterval,
  updateShopifySyncSettings
} from "@/lib/ecommerce-connectors/shopify-sync-scheduler";

export async function PATCH(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as {
      dataSourceId?: string | null;
      autoSyncEnabled?: boolean;
      syncIntervalMinutes?: number | null;
    } | null;

    if (!body?.dataSourceId || typeof body.autoSyncEnabled !== "boolean") {
      return NextResponse.json({ ok: false, message: "Invalid Shopify sync settings payload." }, { status: 400 });
    }

    if (body.autoSyncEnabled && !isSupportedShopifySyncInterval(body.syncIntervalMinutes)) {
      return NextResponse.json({ ok: false, message: "Unsupported Shopify sync interval." }, { status: 400 });
    }

    const account = await updateShopifySyncSettings(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: body.dataSourceId,
      autoSyncEnabled: body.autoSyncEnabled,
      syncIntervalMinutes: body.syncIntervalMinutes ?? null
    });

    return NextResponse.json({
      ok: true,
      syncSettings: {
        dataSourceId: account.dataSourceId,
        shopDomain: account.shopDomain,
        autoSyncEnabled: account.autoSyncEnabled,
        syncIntervalMinutes: account.syncIntervalMinutes,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        nextSyncAt: account.nextSyncAt?.toISOString() ?? null,
        lastAutoSyncAttemptAt: account.lastAutoSyncAttemptAt?.toISOString() ?? null,
        lastAutoSyncSuccessAt: account.lastAutoSyncSuccessAt?.toISOString() ?? null,
        autoSyncFailureCount: account.autoSyncFailureCount
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to update Shopify sync settings." },
      { status: 400 }
    );
  }
}
