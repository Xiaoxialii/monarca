import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AMAZON_PROVIDER } from "@/lib/connectors/amazon/amazon-errors";
import {
  DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES,
  isSupportedShopifySyncInterval,
  nextShopifySyncAt
} from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function PATCH(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as {
      dataSourceId?: string | null;
      autoSyncEnabled?: boolean;
      syncIntervalMinutes?: number | null;
    } | null;
    if (!body?.dataSourceId || typeof body.autoSyncEnabled !== "boolean") {
      return NextResponse.json({ ok: false, message: "Missing Amazon sync settings." }, { status: 400 });
    }

    const account = await prisma.ecommerceConnectorAccount.findFirst({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: body.dataSourceId,
        provider: AMAZON_PROVIDER,
        dataSource: {
          workspaceId: session.workspace.id,
          isActive: true
        }
      },
      select: {
        id: true,
        workspaceId: true,
        dataSourceId: true,
        shopDomain: true,
        lastSyncedAt: true,
        syncIntervalMinutes: true
      }
    });

    if (!account) {
      return NextResponse.json({ ok: false, message: "Amazon connection not found for this workspace." }, { status: 404 });
    }

    const interval = body.autoSyncEnabled
      ? body.syncIntervalMinutes ?? account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
      : account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES;
    if (body.autoSyncEnabled && !isSupportedShopifySyncInterval(interval)) {
      return NextResponse.json({ ok: false, message: "Unsupported Amazon sync interval." }, { status: 400 });
    }

    const now = new Date();
    const nextSyncAt = body.autoSyncEnabled
      ? account.lastSyncedAt
        ? nextShopifySyncAt({
            autoSyncEnabled: true,
            syncIntervalMinutes: interval,
            lastSyncedAt: account.lastSyncedAt
          })
        : now
      : null;
    const updated = await prisma.ecommerceConnectorAccount.update({
      where: { id: account.id },
      data: {
        autoSyncEnabled: body.autoSyncEnabled,
        syncIntervalMinutes: interval,
        nextSyncAt
      },
      select: {
        id: true,
        workspaceId: true,
        dataSourceId: true,
        shopDomain: true,
        autoSyncEnabled: true,
        syncIntervalMinutes: true,
        lastSyncedAt: true,
        nextSyncAt: true,
        lastAutoSyncAttemptAt: true,
        lastAutoSyncSuccessAt: true,
        autoSyncFailureCount: true
      }
    });

    return NextResponse.json({
      ok: true,
      syncSettings: {
        connectorAccountId: updated.id,
        shopDomain: updated.shopDomain,
        autoSyncEnabled: updated.autoSyncEnabled,
        syncIntervalMinutes: updated.syncIntervalMinutes,
        lastSyncedAt: updated.lastSyncedAt?.toISOString() ?? null,
        nextSyncAt: updated.nextSyncAt?.toISOString() ?? null,
        lastAutoSyncAttemptAt: updated.lastAutoSyncAttemptAt?.toISOString() ?? null,
        lastAutoSyncSuccessAt: updated.lastAutoSyncSuccessAt?.toISOString() ?? null,
        autoSyncFailureCount: updated.autoSyncFailureCount
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to save Amazon sync settings." }, { status: 500 });
  }
}
