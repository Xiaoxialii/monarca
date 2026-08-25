import type { Prisma, PrismaClient } from "@prisma/client";
import { QUEUED_ASYNC_JOB_MS, STALE_ASYNC_JOB_MS } from "@/lib/jobs/async-job-runner";

const ACTIVE_CONNECTOR_JOB_STATUSES = ["QUEUED", "PROCESSING", "PAUSED"] as const;

export type EnqueueConnectorSyncInput = {
  workspaceId: string;
  provider: string;
  connectorAccountId: string;
  dataSourceId: string;
  shopDomain: string;
  trigger: string;
  currentStep?: string;
};

export async function enqueueConnectorSyncJob(
  client: PrismaClient | Prisma.TransactionClient,
  input: EnqueueConnectorSyncInput
) {
  const now = new Date();
  const staleHeartbeatBefore = new Date(now.getTime() - STALE_ASYNC_JOB_MS);
  const staleQueuedBefore = new Date(now.getTime() - QUEUED_ASYNC_JOB_MS);

  await client.asyncJob.updateMany({
    where: {
      workspaceId: input.workspaceId,
      type: "SYNC_CONNECTOR",
      status: {
        in: [...ACTIVE_CONNECTOR_JOB_STATUSES]
      },
      payload: {
        path: ["dataSourceId"],
        equals: input.dataSourceId
      },
      OR: [
        {
          status: "QUEUED",
          updatedAt: {
            lt: staleQueuedBefore
          }
        },
        {
          status: {
            in: ["PROCESSING", "PAUSED"]
          },
          OR: [
            {
              leaseExpiresAt: {
                lt: now
              }
            },
            {
              leaseExpiresAt: null,
              heartbeatAt: {
                lt: staleHeartbeatBefore
              }
            },
            {
              leaseExpiresAt: null,
              heartbeatAt: null,
              updatedAt: {
                lt: staleHeartbeatBefore
              }
            }
          ]
        }
      ]
    },
    data: {
      status: "FAILED",
      progress: 100,
      currentStep: "Failed - stale connector sync job",
      errorCode: "CONNECTOR_SYNC_STALE_JOB",
      errorMessage: "Superseded because this connector sync job stopped heartbeating before it completed.",
      heartbeatAt: now,
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      completedAt: now,
      failedAt: now
    }
  });

  const activeJob = await client.asyncJob.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: "SYNC_CONNECTOR",
      status: {
        in: [...ACTIVE_CONNECTOR_JOB_STATUSES]
      },
      payload: {
        path: ["dataSourceId"],
        equals: input.dataSourceId
      }
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      currentStep: true,
      createdAt: true
    }
  });

  if (activeJob) {
    return {
      job: activeJob,
      created: false,
      reused: true
    };
  }

  const job = await client.asyncJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: "SYNC_CONNECTOR",
      status: "QUEUED",
      progress: 0,
      currentStep: input.currentStep ?? `Queued ${input.provider} sync`,
      maxRetries: 3,
      payload: {
        provider: input.provider,
        trigger: input.trigger,
        connectorAccountId: input.connectorAccountId,
        dataSourceId: input.dataSourceId,
        shopDomain: input.shopDomain
      }
    },
    select: {
      id: true,
      status: true,
      currentStep: true,
      createdAt: true
    }
  });

  return {
    job,
    created: true,
    reused: false
  };
}
