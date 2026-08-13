import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GOOGLE_ADS_PROVIDER } from "@/lib/connectors/google-ads/google-ads-errors";
import {
  DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES,
  isSupportedShopifySyncInterval,
  nextShopifySyncAt
} from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as {
      dataSourceId?: string;
      autoSyncEnabled?: boolean;
      syncIntervalMinutes?: number;
      historicalSyncDays?: number;
      selectedCustomerId?: string;
    } | null;
    if (!body?.dataSourceId) {
      return NextResponse.json({ ok: false, message: "Missing Google Ads sync settings." }, { status: 400 });
    }

    const account = await prisma.ecommerceConnectorAccount.findFirst({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: body.dataSourceId,
        provider: GOOGLE_ADS_PROVIDER,
        dataSource: {
          workspaceId: session.workspace.id,
          isActive: true
        }
      },
      include: { dataSource: true }
    });
    if (!account) {
      return NextResponse.json({ ok: false, message: "Google Ads connection not found for this workspace." }, { status: 404 });
    }

    const autoSyncEnabled = body.autoSyncEnabled ?? account.autoSyncEnabled;
    const interval = autoSyncEnabled
      ? body.syncIntervalMinutes ?? account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
      : account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES;
    if (autoSyncEnabled && !isSupportedShopifySyncInterval(interval)) {
      return NextResponse.json({ ok: false, message: "Unsupported Google Ads sync interval." }, { status: 400 });
    }

    const historicalSyncDays = clampHistoricalDays(body.historicalSyncDays);
    const nextSyncAt = autoSyncEnabled
      ? nextShopifySyncAt({
          autoSyncEnabled: true,
          syncIntervalMinutes: interval,
          lastSyncedAt: account.lastSyncedAt,
          now: new Date()
        })
      : null;
    const existingConfig = asRecord(account.dataSource?.config);
    const updated = await prisma.ecommerceConnectorAccount.update({
      where: { id: account.id },
      data: {
        autoSyncEnabled,
        syncIntervalMinutes: interval,
        nextSyncAt,
        dataSource: {
          update: {
            config: {
              ...existingConfig,
              historicalSyncDays: historicalSyncDays ?? existingConfig.historicalSyncDays ?? 30,
              selectedCustomerId: body.selectedCustomerId ?? existingConfig.selectedCustomerId ?? null
            }
          }
        }
      },
      select: {
        id: true,
        dataSourceId: true,
        autoSyncEnabled: true,
        syncIntervalMinutes: true,
        lastSyncedAt: true,
        nextSyncAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      settings: {
        ...updated,
        historicalSyncDays: historicalSyncDays ?? existingConfig.historicalSyncDays ?? 30,
        selectedCustomerId: body.selectedCustomerId ?? existingConfig.selectedCustomerId ?? null
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ ok: false, message: "Failed to save Google Ads sync settings." }, { status: 500 });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clampHistoricalDays(value: unknown) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(365, Math.floor(parsed)));
}
