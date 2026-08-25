import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";
import { ShopifyConnectorError, SHOPIFY_PROVIDER } from "@/lib/ecommerce-connectors/shopify-oauth";
import { AMAZON_PROVIDER, AmazonConnectorError, isAmazonAuthRevokedError } from "@/lib/connectors/amazon/amazon-errors";
import { GOOGLE_ADS_PROVIDER, GoogleAdsConnectorError, isGoogleAdsAuthRevokedError } from "@/lib/connectors/google-ads/google-ads-errors";
import { META_ADS_PROVIDER } from "@/lib/ads/meta/meta-oauth";

export const SHOPIFY_SYNC_INTERVAL_OPTIONS = [60, 180, 360, 720, 1440] as const;
export const DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES = 360;
export const SHOPIFY_SYNC_BATCH_SIZE = 50;
const ACTIVE_JOB_STATUSES = ["QUEUED", "PROCESSING", "PAUSED"] as const;
const CLAIM_WINDOW_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MINUTES = [30, 60, 180] as const;

export type ShopifySyncIntervalMinutes = typeof SHOPIFY_SYNC_INTERVAL_OPTIONS[number];

type ShopifySyncAccount = {
  id: string;
  workspaceId: string;
  dataSourceId: string | null;
  provider: string;
  shopDomain: string;
  syncIntervalMinutes: number;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
};

export function isSupportedShopifySyncInterval(value: unknown): value is ShopifySyncIntervalMinutes {
  return SHOPIFY_SYNC_INTERVAL_OPTIONS.includes(Number(value) as ShopifySyncIntervalMinutes);
}

export function nextShopifySyncAt(input: {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncedAt?: Date | null;
  now?: Date;
}) {
  if (!input.autoSyncEnabled) return null;
  const anchor = input.lastSyncedAt ?? input.now ?? new Date();
  return new Date(anchor.getTime() + input.syncIntervalMinutes * 60 * 1000);
}

export function retryShopifySyncAt(input: {
  retryCount?: number | null;
  now?: Date;
}) {
  const retryCount = Math.max(0, input.retryCount ?? 0);
  const minutes = FAILURE_BACKOFF_MINUTES[Math.min(retryCount, FAILURE_BACKOFF_MINUTES.length - 1)];
  const now = input.now ?? new Date();
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function logShopifySync(event: string, payload: Record<string, unknown>) {
  console.info(event, payload);
}

function asyncJobPayloadWhere(account: ShopifySyncAccount) {
  return {
    AND: [
      { payload: { path: ["provider"], equals: account.provider } },
      { payload: { path: ["dataSourceId"], equals: account.dataSourceId } },
      { payload: { path: ["connectorAccountId"], equals: account.id } },
      { payload: { path: ["shopDomain"], equals: account.shopDomain } }
    ]
  } as Prisma.AsyncJobWhereInput;
}

async function activeSyncJobForAccount(client: PrismaClient, account: ShopifySyncAccount) {
  if (!account.dataSourceId) return null;

  return client.asyncJob.findFirst({
    where: {
      workspaceId: account.workspaceId,
      type: "SYNC_CONNECTOR",
      status: { in: [...ACTIVE_JOB_STATUSES] },
      ...asyncJobPayloadWhere(account)
    },
    select: { id: true, status: true }
  });
}

async function activeSyncRunForAccount(client: PrismaClient, account: ShopifySyncAccount) {
  if (!account.dataSourceId) return null;

  return client.ecommerceSyncRun.findFirst({
    where: {
      workspaceId: account.workspaceId,
      dataSourceId: account.dataSourceId,
      provider: account.provider,
      shopDomain: account.shopDomain,
      status: "running"
    },
    select: { id: true, syncRunId: true, status: true }
  });
}

export async function updateShopifySyncSettings(client: PrismaClient, input: {
  workspaceId: string;
  dataSourceId: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes?: number | null;
}) {
  const account = await client.ecommerceConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      provider: { in: [SHOPIFY_PROVIDER, AMAZON_PROVIDER, GOOGLE_ADS_PROVIDER, META_ADS_PROVIDER] },
      dataSource: {
        workspaceId: input.workspaceId,
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
    throw new Error("Shopify connection not found for this workspace.");
  }

  const interval = input.autoSyncEnabled
    ? input.syncIntervalMinutes ?? account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES
    : account.syncIntervalMinutes ?? DEFAULT_SHOPIFY_SYNC_INTERVAL_MINUTES;

  if (input.autoSyncEnabled && !isSupportedShopifySyncInterval(interval)) {
    throw new Error("Unsupported Shopify sync interval.");
  }

  const now = new Date();
  const nextSyncAt = input.autoSyncEnabled
    ? account.lastSyncedAt
      ? nextShopifySyncAt({
          autoSyncEnabled: true,
          syncIntervalMinutes: interval,
          lastSyncedAt: account.lastSyncedAt
        })
      : now
    : null;

  return client.ecommerceConnectorAccount.update({
    where: { id: account.id },
    data: {
      autoSyncEnabled: input.autoSyncEnabled,
      syncIntervalMinutes: interval,
      nextSyncAt
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      provider: true,
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
}

export async function enqueueDueShopifySyncs(client: PrismaClient, input: {
  batchSize?: number;
  now?: Date;
} = {}) {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const batchSize = Math.max(1, Math.min(input.batchSize ?? SHOPIFY_SYNC_BATCH_SIZE, SHOPIFY_SYNC_BATCH_SIZE));

  logShopifySync("SHOPIFY_SYNC_SCHEDULER_STARTED", { scheduledAt: now.toISOString(), batchSize });

  const dueAccounts = await client.ecommerceConnectorAccount.findMany({
    where: {
      provider: { in: [SHOPIFY_PROVIDER, AMAZON_PROVIDER, GOOGLE_ADS_PROVIDER, META_ADS_PROVIDER] },
      status: "connected",
      autoSyncEnabled: true,
      dataSourceId: { not: null },
      dataSource: {
        isActive: true,
        status: ConnectionStatus.CONNECTED
      },
      OR: [
        { nextSyncAt: null },
        { nextSyncAt: { lte: now } }
      ],
      NOT: {
        AND: [
          { lastAutoSyncAttemptAt: { not: null } },
          { lastAutoSyncAttemptAt: { gt: new Date(now.getTime() - CLAIM_WINDOW_MS) } }
        ]
      }
    },
    select: {
      id: true,
      workspaceId: true,
      dataSourceId: true,
      provider: true,
      shopDomain: true,
      syncIntervalMinutes: true,
      lastSyncedAt: true,
      nextSyncAt: true,
      autoSyncFailureCount: true
    },
    orderBy: [
      { nextSyncAt: "asc" },
      { updatedAt: "asc" }
    ],
    take: batchSize
  });

  const enqueued = [];
  const skipped = [];

  for (const account of dueAccounts) {
    logShopifySync("SHOPIFY_SYNC_ACCOUNT_DUE", {
      workspaceId: account.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      shopDomain: account.shopDomain,
      provider: account.provider,
      nextSyncAt: account.nextSyncAt?.toISOString() ?? null,
      syncIntervalMinutes: account.syncIntervalMinutes
    });

    if (!account.dataSourceId) continue;
    const activeJob = await activeSyncJobForAccount(client, account);
    if (activeJob) {
      skipped.push({ accountId: account.id, reason: "active_job", jobId: activeJob.id });
      logShopifySync("SHOPIFY_SYNC_SKIPPED_ACTIVE_JOB", {
        workspaceId: account.workspaceId,
        dataSourceId: account.dataSourceId,
        connectorAccountId: account.id,
        shopDomain: account.shopDomain,
        provider: account.provider,
        jobId: activeJob.id
      });
      continue;
    }
    const activeRun = await activeSyncRunForAccount(client, account);
    if (activeRun) {
      skipped.push({ accountId: account.id, reason: "active_run", runId: activeRun.syncRunId });
      logShopifySync("SHOPIFY_SYNC_SKIPPED_ACTIVE_JOB", {
        workspaceId: account.workspaceId,
        dataSourceId: account.dataSourceId,
        connectorAccountId: account.id,
        shopDomain: account.shopDomain,
        provider: account.provider,
        runId: activeRun.syncRunId
      });
      continue;
    }

    const claimed = await client.ecommerceConnectorAccount.updateMany({
      where: {
        id: account.id,
        autoSyncEnabled: true,
        status: "connected",
        AND: [
          {
            OR: [
              { nextSyncAt: null },
              { nextSyncAt: { lte: now } }
            ]
          },
          {
            OR: [
              { lastAutoSyncAttemptAt: null },
              { lastAutoSyncAttemptAt: { lte: new Date(now.getTime() - CLAIM_WINDOW_MS) } }
            ]
          }
        ]
      },
      data: {
        lastAutoSyncAttemptAt: now
      }
    });

    if (claimed.count !== 1) {
      skipped.push({ accountId: account.id, reason: "claim_lost" });
      continue;
    }

    const job = await client.asyncJob.create({
      data: {
        workspaceId: account.workspaceId,
        type: "SYNC_CONNECTOR",
        status: "QUEUED",
        progress: 0,
        currentStep: `Queued ${account.provider} scheduled sync`,
        maxRetries: 0,
        payload: {
          provider: account.provider,
          trigger: "scheduled",
          connectorAccountId: account.id,
          dataSourceId: account.dataSourceId,
          shopDomain: account.shopDomain,
          scheduledAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    enqueued.push({ accountId: account.id, jobId: job.id });
    logShopifySync("SHOPIFY_SYNC_ENQUEUED", {
      workspaceId: account.workspaceId,
      dataSourceId: account.dataSourceId,
      connectorAccountId: account.id,
      shopDomain: account.shopDomain,
      provider: account.provider,
      scheduledAt: now.toISOString(),
      nextSyncAt: account.nextSyncAt?.toISOString() ?? null,
      syncIntervalMinutes: account.syncIntervalMinutes,
      jobId: job.id
    });
  }

  logShopifySync("SHOPIFY_SYNC_SCHEDULER_COMPLETED", {
    scheduledAt: now.toISOString(),
    dueCount: dueAccounts.length,
    enqueuedCount: enqueued.length,
    skippedCount: skipped.length,
    durationMs: Date.now() - startedAt
  });

  return {
    ok: true,
    dueCount: dueAccounts.length,
    enqueuedCount: enqueued.length,
    skippedCount: skipped.length,
    enqueued,
    skipped
  };
}

export async function markShopifyScheduledSyncFailure(client: PrismaClient, input: {
  workspaceId: string;
  connectorAccountId: string;
  dataSourceId: string;
  shopDomain: string;
  provider?: string;
  error: unknown;
}) {
  const provider = input.provider ?? SHOPIFY_PROVIDER;
  const message = input.error instanceof Error ? input.error.message : `${provider} scheduled sync failed.`;
  const publicError = input.error instanceof ShopifyConnectorError ||
    input.error instanceof AmazonConnectorError ||
    input.error instanceof GoogleAdsConnectorError
    ? input.error
    : null;
  const authRevoked = isAmazonAuthRevokedError(input.error) ||
    isGoogleAdsAuthRevokedError(input.error) ||
    publicError?.code === "SHOPIFY_TOKEN_INVALID" ||
    publicError?.code === "SHOPIFY_NEEDS_REAUTHORIZATION" ||
    publicError?.status === 401;
  const now = new Date();

  if (authRevoked) {
    await client.$transaction([
      client.ecommerceConnectorAccount.updateMany({
        where: {
          id: input.connectorAccountId,
          workspaceId: input.workspaceId,
          provider
        },
        data: {
          autoSyncEnabled: false,
          nextSyncAt: null,
          status: "needs_reconnection",
          lastAutoSyncAttemptAt: now
        }
      }),
      client.dataSourceConnection.updateMany({
        where: {
          id: input.dataSourceId,
          workspaceId: input.workspaceId
        },
        data: {
          status: ConnectionStatus.PENDING,
          lastErrorMessage: message
        }
      })
    ]);

    logShopifySync(provider === AMAZON_PROVIDER ? "AMAZON_SYNC_AUTH_REVOKED" : provider === GOOGLE_ADS_PROVIDER ? "GOOGLE_ADS_SYNC_AUTH_REVOKED" : "SHOPIFY_SYNC_AUTH_REVOKED", {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      connectorAccountId: input.connectorAccountId,
      shopDomain: input.shopDomain
    });
    return;
  }

  await client.ecommerceConnectorAccount.updateMany({
    where: {
      id: input.connectorAccountId,
      workspaceId: input.workspaceId,
      provider
    },
    data: {
      lastAutoSyncAttemptAt: now,
      autoSyncFailureCount: { increment: 1 },
      nextSyncAt: retryShopifySyncAt({ retryCount: await currentFailureCount(client, input.connectorAccountId), now })
    }
  });
}

async function currentFailureCount(client: PrismaClient, connectorAccountId: string) {
  const account = await client.ecommerceConnectorAccount.findUnique({
    where: { id: connectorAccountId },
    select: { autoSyncFailureCount: true }
  });

  return account?.autoSyncFailureCount ?? 0;
}
