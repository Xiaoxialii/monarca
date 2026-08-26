import { after, NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";
import { missingConfiguredShopifyScopes } from "@/lib/ecommerce-connectors/shopify-oauth";
import { isCanonicalSystemField } from "@/lib/semantic/system-fields";
import { logWorkspaceContext } from "@/lib/current-workspace-context";
import { recoverStaleIngestionJobs } from "@/lib/ingestion/unified-ingestion-worker";
import { QUEUED_ASYNC_JOB_MS, STALE_ASYNC_JOB_MS } from "@/lib/jobs/async-job-runner";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function schemaTables(value: unknown) {
  const schema = asRecord(value);
  const rawUploadSchema = asRecord(schema?.rawUploadSchema);
  if (Array.isArray(schema?.tables)) return schema.tables;
  if (Array.isArray(rawUploadSchema?.tables)) return rawUploadSchema.tables;
  return [];
}

function schemaHasMapping(value: unknown) {
  const schema = asRecord(value);
  const rawUploadSchema = asRecord(schema?.rawUploadSchema);
  return Boolean(schema?.semanticMappingCache || rawUploadSchema?.semanticMappingCache);
}

function schemaHasUsableDetails(value: unknown) {
  return schemaTables(value).length > 0 || schemaHasMapping(value);
}

function publicConfig(configValue: unknown) {
  const config = asRecord(configValue);

  if (!config) {
    return null;
  }

  const storage = asRecord(config.storage);
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage?.key === "string" && storage.key
        ? storage.key
        : null;
  const hasStoredFile = (typeof config.storedFilePath === "string" && Boolean(config.storedFilePath)) ||
    ((config.storageProvider === "r2" || storage?.provider === "cloudflare-r2") && Boolean(objectKey)) ||
    (typeof config.inlineFileBase64 === "string" && Boolean(config.inlineFileBase64));

  return {
    type: typeof config.type === "string" ? config.type : null,
    host: typeof config.host === "string" ? config.host : null,
    port: toNumber(config.port),
    database: typeof config.database === "string" ? config.database : null,
    ssl: typeof config.ssl === "boolean" ? config.ssl : null,
    fileName: typeof config.fileName === "string" ? config.fileName : null,
    fileSize: toNumber(config.fileSize),
    extension: typeof config.extension === "string" ? config.extension : null,
    shopDomain: typeof config.shopDomain === "string" ? config.shopDomain : null,
    hasStoredFile
  };
}

type DataSourceSyncStatus =
  | "CONNECTED"
  | "COMPLETED"
  | "QUEUED"
  | "RUNNING"
  | "TIMEOUT"
  | "FAILED"
  | "SYNCING"
  | "PENDING_PERMISSION"
  | "PENDING_FIRST_SYNC"
  | "FAILED_AUTH"
  | "FAILED_SYNC"
  | "DISCONNECTED";

function missingScopeReason(missingScopes: string[]) {
  if (!missingScopes.length) return null;
  return `Missing ${missingScopes.join(", ")}`;
}

function currentMissingScopesFromConfig(config: Record<string, unknown> | null) {
  const requiredScopes = typeof config?.requiredScopes === "string" ? config.requiredScopes : null;
  const grantedScopes = typeof config?.grantedScopes === "string" ? config.grantedScopes : null;

  if (!requiredScopes || !grantedScopes) return null;

  try {
    return missingConfiguredShopifyScopes(requiredScopes, grantedScopes);
  } catch {
    return null;
  }
}

function statusActionForSyncStatus(syncStatus: DataSourceSyncStatus) {
  if (syncStatus === "PENDING_PERMISSION" || syncStatus === "FAILED_AUTH") return "UPDATE_PERMISSION";
  if (syncStatus === "QUEUED" || syncStatus === "PENDING_FIRST_SYNC" || syncStatus === "FAILED_SYNC" || syncStatus === "TIMEOUT" || syncStatus === "FAILED") return "SYNC_NOW";
  if (syncStatus === "DISCONNECTED") return "RECONNECT";

  return null;
}

function isActiveIngestionStatus(status: string | null | undefined) {
  return ["RUNNING", "PROCESSING", "SCHEMA_READY", "CANONICALIZING"].includes((status ?? "").toUpperCase());
}

function isStaleConnectorJob(job: {
  status: string | null;
  heartbeatAt?: Date | null;
  leaseExpiresAt?: Date | null;
  updatedAt: Date;
}) {
  const status = (job.status ?? "").toUpperCase();
  const now = Date.now();
  if (status !== "PROCESSING" && status !== "PAUSED" && status !== "RUNNING") return false;
  if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() < now) return true;
  const heartbeatAt = job.heartbeatAt ?? job.updatedAt;
  return heartbeatAt.getTime() < now - STALE_ASYNC_JOB_MS;
}

function connectorJobStatusRank(job: {
  status: string | null;
  heartbeatAt?: Date | null;
  leaseExpiresAt?: Date | null;
  updatedAt: Date;
}) {
  if (isStaleConnectorJob(job)) return 1;

  const normalized = (job.status ?? "").toUpperCase();
  if (normalized === "RUNNING" || normalized === "PROCESSING" || normalized === "QUEUED") return 0;
  if (normalized === "FAILED" || normalized === "TIMEOUT") return 1;
  if (normalized === "COMPLETED" || normalized === "SUCCESS") return 2;

  return 3;
}

async function recoverStaleDataSourceJobs(workspaceId: string) {
  try {
    const now = new Date();
    const staleHeartbeatBefore = new Date(now.getTime() - STALE_ASYNC_JOB_MS);
    const staleQueuedBefore = new Date(now.getTime() - QUEUED_ASYNC_JOB_MS);
    const staleSyncRunBefore = new Date(now.getTime() - Math.max(STALE_ASYNC_JOB_MS, 10 * 60 * 1000));
    const [ingestionRecovery, staleConnectorJobs, staleConnectorRuns] = await Promise.all([
      recoverStaleIngestionJobs({ workspaceId, limit: 5 }),
      prisma.asyncJob.updateMany({
        where: {
          workspaceId,
          type: "SYNC_CONNECTOR",
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
              leaseExpiresAt: {
                lt: now
              }
            },
            {
              status: {
                in: ["PROCESSING", "PAUSED"]
              },
              leaseExpiresAt: null,
              heartbeatAt: {
                lt: staleHeartbeatBefore
              }
            },
            {
              status: {
                in: ["PROCESSING", "PAUSED"]
              },
              leaseExpiresAt: null,
              heartbeatAt: null,
              updatedAt: {
                lt: staleHeartbeatBefore
              }
            }
          ]
        },
        data: {
          status: "FAILED",
          progress: 100,
          currentStep: "Failed - stale connector sync job",
          errorCode: "CONNECTOR_SYNC_STALE_JOB",
          errorMessage: "Connector sync stopped before completion. Retry sync to resume processing.",
          heartbeatAt: now,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
          completedAt: now,
          failedAt: now
        }
      }),
      prisma.ecommerceSyncRun.updateMany({
        where: {
          workspaceId,
          status: "running",
          startedAt: {
            lt: staleSyncRunBefore
          }
        },
        data: {
          status: "failed",
          errorMessage: "Connector sync run stopped before completion. Retry sync to resume processing.",
          finishedAt: now
        }
      })
    ]);
    if (
      ingestionRecovery.attempted ||
      ingestionRecovery.timedOut ||
      ingestionRecovery.exhausted ||
      staleConnectorJobs.count ||
      staleConnectorRuns.count
    ) {
      console.info("[data-sources] recovered stale jobs", {
        workspaceId,
        ingestionAttempted: ingestionRecovery.attempted,
        ingestionRecovered: ingestionRecovery.recovered,
        ingestionTimedOut: ingestionRecovery.timedOut,
        ingestionExhausted: ingestionRecovery.exhausted,
        staleConnectorJobs: staleConnectorJobs.count,
        staleConnectorRuns: staleConnectorRuns.count
      });
    }
  } catch (error) {
    console.warn("[data-sources] stale job recovery failed", {
      workspaceId,
      message: error instanceof Error ? error.message : "Unknown recovery error"
    });
  }
}

function syncStatusFromSource(source: {
  status: ConnectionStatus;
  provider: string | null;
  config?: unknown;
  lastErrorMessage: string | null;
  lastSyncAt: Date | null;
  updatedAt: Date;
  latestSnapshot?: {
    status: ConnectionStatus;
    schemaStatus: string | null;
    canonicalStatus: string | null;
    canonicalVersion: string | null;
  } | null;
  latestIngestionJob?: {
    status: string | null;
    errorMessage: string | null;
  } | null;
  latestConnectorJob?: {
    status: string | null;
    errorMessage: string | null;
    currentStep: string | null;
    heartbeatAt?: Date | null;
    leaseExpiresAt?: Date | null;
    updatedAt: Date;
  } | null;
}): {
  syncStatus: DataSourceSyncStatus;
  statusReason: string | null;
  statusAction: string | null;
} {
  const config = asRecord(source.config);
  const configMissingScopes = Array.isArray(config?.missingScopes)
    ? config.missingScopes.filter((scope): scope is string => typeof scope === "string" && Boolean(scope))
    : [];
  const currentMissingScopes = currentMissingScopesFromConfig(config);
  const missingScopes = currentMissingScopes ?? configMissingScopes;
  const scopeStatus = typeof config?.scopeStatus === "string" ? config.scopeStatus : null;
  const lowerError = (source.lastErrorMessage ?? "").toLowerCase();
  const canTrustCurrentScopeComparison = currentMissingScopes !== null;
  const isPermissionProblem =
    missingScopes.length > 0 ||
    (!canTrustCurrentScopeComparison && (
      scopeStatus === "NEEDS_REAUTHORIZATION" ||
      lowerError.includes("permission") ||
      lowerError.includes("scope") ||
      lowerError.includes("auth") ||
      lowerError.includes("token")
    ));

  let syncStatus: DataSourceSyncStatus;
  let statusReason: string | null = source.lastErrorMessage ?? null;
  const snapshot = source.latestSnapshot ?? null;
  const latestIngestionJob = source.latestIngestionJob ?? null;
  const latestConnectorJob = source.latestConnectorJob ?? null;
  const schemaStatus = snapshot?.schemaStatus?.toUpperCase() ?? null;
  const canonicalStatus = snapshot?.canonicalStatus?.toUpperCase() ?? null;
  const ingestionStatus = latestIngestionJob?.status?.toUpperCase() ?? null;
  const connectorStatus = latestConnectorJob?.status?.toUpperCase() ?? null;
  const connectorJobIsStale = latestConnectorJob ? isStaleConnectorJob(latestConnectorJob) : false;
  const hasReadyCanonicalSnapshot =
    snapshot?.status === ConnectionStatus.CONNECTED &&
    schemaStatus === "READY" &&
    canonicalStatus === "READY" &&
    Boolean(snapshot.canonicalVersion);

  if (source.status === ConnectionStatus.DISCONNECTED) {
    syncStatus = "DISCONNECTED";
    statusReason ??= "Data source is disconnected.";
  } else if (hasReadyCanonicalSnapshot) {
    syncStatus = "CONNECTED";
    statusReason = null;
  } else if (connectorJobIsStale) {
    syncStatus = "FAILED_SYNC";
    statusReason =
      latestConnectorJob?.errorMessage ??
      "Connector sync stopped before completion. Retry sync to resume processing.";
  } else if (connectorStatus === "QUEUED") {
    syncStatus = "QUEUED";
    statusReason = latestConnectorJob?.currentStep ?? "Connector sync is waiting to start.";
  } else if (connectorStatus === "RUNNING" || connectorStatus === "PROCESSING") {
    syncStatus = "RUNNING";
    statusReason = latestConnectorJob?.currentStep ?? "Connector sync is running.";
  } else if (connectorStatus === "FAILED") {
    syncStatus = isPermissionProblem ? "FAILED_AUTH" : "FAILED_SYNC";
    statusReason =
      latestConnectorJob?.errorMessage ??
      source.lastErrorMessage ??
      "Connector sync failed. Retry sync to resume processing.";
  } else if (schemaStatus === "PROCESSING" || canonicalStatus === "GENERATING") {
    if (ingestionStatus === "QUEUED") {
      syncStatus = "QUEUED";
      statusReason = "Data source sync is waiting to start.";
    } else if (isActiveIngestionStatus(ingestionStatus)) {
      syncStatus = "RUNNING";
      statusReason = "Data source is syncing.";
    } else if (ingestionStatus === "TIMEOUT") {
      syncStatus = "TIMEOUT";
      statusReason =
        latestIngestionJob?.errorMessage ??
        "Data source sync timed out. Retry sync to resume processing.";
    } else if (ingestionStatus === "FAILED") {
      syncStatus = "FAILED";
      statusReason =
        latestIngestionJob?.errorMessage ??
        "Data source sync failed. Retry sync to resume processing.";
    } else {
      syncStatus = "FAILED_SYNC";
      statusReason =
        latestIngestionJob?.errorMessage ??
        "Data source sync did not finish. Retry sync to resume processing.";
    }
  } else if (schemaStatus === "FAILED" || canonicalStatus === "FAILED") {
    syncStatus = isPermissionProblem ? "FAILED_AUTH" : "FAILED_SYNC";
    statusReason ??= "Data source sync failed.";
  } else if (source.status === ConnectionStatus.FAILED) {
    syncStatus = isPermissionProblem ? "FAILED_AUTH" : "FAILED_SYNC";
  } else if (source.status === ConnectionStatus.PENDING && isPermissionProblem) {
    syncStatus = "PENDING_PERMISSION";
    statusReason = missingScopeReason(missingScopes) ?? statusReason ?? "Permission update required.";
  } else if (source.status === ConnectionStatus.PENDING || !source.lastSyncAt) {
    syncStatus = "PENDING_FIRST_SYNC";
    statusReason = "Waiting for the first data sync.";
  } else {
    syncStatus = "CONNECTED";
  }

  return {
    syncStatus,
    statusReason,
    statusAction: statusActionForSyncStatus(syncStatus)
  };
}

function schemaSummary(sourceSchemas: unknown, snapshotSchema: unknown, snapshotReport: unknown) {
  const schemas = asRecord(sourceSchemas);
  const snapshot = asRecord(snapshotSchema);
  const rawUploadSchema = asRecord(snapshot?.rawUploadSchema);
  const sourceRawUploadSchema = asRecord(schemas?.rawUploadSchema);
  const report = asRecord(snapshotReport);
  const unifiedIngestion =
    asRecord(schemas?.unifiedIngestion) ??
    asRecord(sourceRawUploadSchema?.unifiedIngestion) ??
    asRecord(rawUploadSchema?.unifiedIngestion) ??
    asRecord(snapshot?.unifiedIngestion);
  const semantic = asRecord(unifiedIngestion?.semantic);
  const detectedSchema = asRecord(unifiedIngestion?.detectedSchema);
  const canonical = asRecord(unifiedIngestion?.canonical);
  const learning = asRecord(unifiedIngestion?.learning);
  const semanticMappingCache =
    asRecord(snapshot?.semanticMappingCache) ??
    asRecord(rawUploadSchema?.semanticMappingCache) ??
    asRecord(schemas?.semanticMappingCache) ??
    asRecord(sourceRawUploadSchema?.semanticMappingCache);
  const cachedMappingDetails = Array.isArray(semanticMappingCache?.field_mappings) ? semanticMappingCache.field_mappings : null;
  const mappingDetails = Array.isArray(semantic?.mapping_details)
    ? semantic.mapping_details
    : Array.isArray(semantic?.mappingDetails)
      ? semantic.mappingDetails
      : cachedMappingDetails;
  const cachedMappingConfidence = cachedMappingDetails?.length
    ? cachedMappingDetails.reduce((sum, mapping) => sum + (toNumber(asRecord(mapping)?.confidence) ?? 0), 0) / cachedMappingDetails.length
    : null;
  const mappings = asRecord(semantic?.mappings);
  const detectedFields = Array.isArray(detectedSchema?.fields) ? detectedSchema.fields : [];
  const tables = Array.isArray(schemas?.tables)
    ? schemas.tables
    : Array.isArray(sourceRawUploadSchema?.tables)
      ? sourceRawUploadSchema.tables
      : Array.isArray(rawUploadSchema?.tables)
        ? rawUploadSchema.tables
        : Array.isArray(snapshot?.tables)
          ? snapshot.tables
          : null;
  const tableCount =
    toNumber(report?.tableCount) ??
    (tables ? tables.length : null);
  const columnCount =
    toNumber(report?.columnCount) ??
    (tables
      ? tables.reduce((sum, table) => {
          const tableRecord = asRecord(table);
          const columns = Array.isArray(tableRecord?.columns) ? tableRecord.columns : [];
          return sum + columns.length;
        }, 0)
      : null);

  return {
    tableCount,
    columnCount,
    scannedAt:
      typeof schemas?.scannedAt === "string"
        ? schemas.scannedAt
        : typeof snapshot?.scannedAt === "string"
          ? snapshot.scannedAt
          : null,
    unifiedIngestion: unifiedIngestion || cachedMappingDetails?.length
      ? {
          status: typeof unifiedIngestion?.status === "string" ? unifiedIngestion.status : null,
          source: typeof unifiedIngestion?.source === "string" ? unifiedIngestion.source : typeof semanticMappingCache?.source === "string" ? semanticMappingCache.source : null,
          sampledRows: toNumber(unifiedIngestion?.sampledRows),
          totalParsedRows: toNumber(unifiedIngestion?.totalParsedRows),
          detectedSchema: {
            detected_type: typeof detectedSchema?.detected_type === "string" ? detectedSchema.detected_type : null,
            confidence: toNumber(detectedSchema?.confidence),
            fields: detectedFields.map((field) => {
              const record = asRecord(field);

              return {
                name: typeof record?.name === "string" ? record.name : "",
                path: typeof record?.path === "string" ? record.path : "",
                type: typeof record?.type === "string" ? record.type : null
              };
            }).filter((field) => field.name)
          },
          semantic: {
            confidence: toNumber(semantic?.confidence) ?? cachedMappingConfidence,
            memory_hits: toNumber(semantic?.memory_hits),
            engine_candidates: toNumber(semantic?.engine_candidates),
            mappings: mappings ?? {},
            mapping_details: mappingDetails
              ? mappingDetails.map((mapping) => {
                  const record = asRecord(mapping);

                  return {
                    field: typeof record?.source_column === "string" ? record.source_column : typeof record?.field === "string" ? record.field : "",
                    source_column: typeof record?.source_column === "string" ? record.source_column : typeof record?.field === "string" ? record.field : "",
                    canonical: typeof record?.canonical_field === "string" ? record.canonical_field : typeof record?.canonical === "string" ? record.canonical : "",
                    canonical_field: typeof record?.canonical_field === "string" ? record.canonical_field : typeof record?.canonical === "string" ? record.canonical : "",
                    confidence: toNumber(record?.confidence),
                    source: typeof record?.source === "string" ? record.source : typeof semanticMappingCache?.source === "string" ? semanticMappingCache.source : "engine",
                    mapping_method: typeof record?.mapping_method === "string" ? record.mapping_method : null,
                    requires_confirmation: record?.requires_confirmation === true,
                    suggested_mappings: Array.isArray(record?.suggested_mappings)
                      ? record.suggested_mappings.map((candidate) => {
                          const candidateRecord = asRecord(candidate);
                          return {
                            canonical_field: typeof candidateRecord?.canonical_field === "string" ? candidateRecord.canonical_field : "",
                            confidence: toNumber(candidateRecord?.confidence),
                            reason: typeof candidateRecord?.reason === "string" ? candidateRecord.reason : ""
                          };
                        }).filter((candidate) => candidate.canonical_field)
                      : []
                  };
                }).filter((mapping) => mapping.field && !isCanonicalSystemField(mapping.field))
              : Object.entries(mappings ?? {}).map(([field, canonical]) => ({
                  field,
                  source_column: field,
                  canonical: typeof canonical === "string" ? canonical : String(canonical),
                  canonical_field: typeof canonical === "string" ? canonical : String(canonical),
                  confidence: toNumber(semantic?.confidence),
                  source: "engine",
                  mapping_method: null,
                  requires_confirmation: false,
                  suggested_mappings: []
                })).filter((mapping) => mapping.field && !isCanonicalSystemField(mapping.field)),
            unknown_fields: Array.isArray(semantic?.unknown_fields)
              ? semantic.unknown_fields.filter((field): field is string => typeof field === "string")
              : []
          },
          canonical: {
            schemaVersion: typeof canonical?.schemaVersion === "string" ? canonical.schemaVersion : null,
            rowCounts: asRecord(canonical?.rowCounts) ?? {},
            mappingConfidence: toNumber(canonical?.mappingConfidence),
            unknownFieldCount: toNumber(canonical?.unknownFieldCount)
          },
          learning: {
            records_updated: toNumber(learning?.records_updated),
            memory_size: toNumber(learning?.memory_size),
            average_memory_confidence: toNumber(learning?.average_memory_confidence)
          }
        }
      : null,
    tables: (tables ?? []).map((table) => {
      const tableRecord = asRecord(table);
      const columns = Array.isArray(tableRecord?.columns) ? tableRecord.columns : [];

      return {
        name: typeof tableRecord?.name === "string" ? tableRecord.name : "",
        schema: typeof tableRecord?.schema === "string" ? tableRecord.schema : null,
        columns: columns.map((column) => {
          const columnRecord = asRecord(column);

          return {
            name: typeof columnRecord?.name === "string" ? columnRecord.name : "",
            displayName: typeof columnRecord?.displayName === "string" ? columnRecord.displayName : null,
            semanticName: typeof columnRecord?.semanticName === "string" ? columnRecord.semanticName : null,
            rawHeaderPath: Array.isArray(columnRecord?.rawHeaderPath)
              ? columnRecord.rawHeaderPath.filter((item): item is string => typeof item === "string")
              : null,
            type: typeof columnRecord?.type === "string" ? columnRecord.type : null,
            nullable: typeof columnRecord?.nullable === "boolean" ? columnRecord.nullable : null
          };
        })
      };
    }).filter((table) => table.name)
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireWorkspace(request);
    logWorkspaceContext("[workspace-context] data-sources.GET", session);
    after(() => {
      void recoverStaleDataSourceJobs(session.workspace.id);
    });
    const includeDeleted = true;

    const dataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true,
        status: {
          in: [ConnectionStatus.CONNECTED, ConnectionStatus.PENDING, ConnectionStatus.FAILED]
        }
      },
      select: {
        id: true,
        name: true,
        provider: true,
        type: true,
        isActive: true,
        status: true,
        connectionMode: true,
        authMethod: true,
        lastErrorMessage: true,
        schemas: true,
        config: true,
        connectedAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        ecommerceConnectorAccounts: {
          where: {
            provider: {
              in: ["shopify", "amazon", "meta_ads", "google_ads"]
            }
          },
          select: {
            id: true,
            provider: true,
            shopDomain: true,
            autoSyncEnabled: true,
            syncIntervalMinutes: true,
            lastSyncedAt: true,
            nextSyncAt: true,
            lastAutoSyncAttemptAt: true,
            lastAutoSyncSuccessAt: true,
            autoSyncFailureCount: true
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const latestSnapshots = dataSources.length
      ? await prisma.schemaSnapshot.findMany({
          where: {
            workspaceId: session.workspace.id,
            dataSourceId: {
              in: dataSources.map((source) => source.id)
            }
          },
          select: {
            id: true,
            dataSourceId: true,
            status: true,
            schemaStatus: true,
            canonicalStatus: true,
            canonicalVersion: true,
            schemaJson: true,
            qualityReport: true,
            createdAt: true
          },
          orderBy: {
            createdAt: "desc"
          }
        })
      : [];
    const snapshotsBySourceId = new Map<string, typeof latestSnapshots[number][]>();
    for (const snapshot of latestSnapshots) {
      if (!snapshot.dataSourceId) continue;
      const sourceSnapshots = snapshotsBySourceId.get(snapshot.dataSourceId) ?? [];
      sourceSnapshots.push(snapshot);
      snapshotsBySourceId.set(snapshot.dataSourceId, sourceSnapshots);
    }
    const latestSnapshotBySourceId = new Map<string, typeof latestSnapshots[number]>();
    for (const [sourceId, sourceSnapshots] of snapshotsBySourceId) {
      latestSnapshotBySourceId.set(
        sourceId,
        sourceSnapshots.find((snapshot) => schemaHasUsableDetails(snapshot.schemaJson)) ?? sourceSnapshots[0]
      );
    }
    const latestIngestionJobs = dataSources.length
      ? await prisma.unifiedIngestionJob.findMany({
          where: {
            workspaceId: session.workspace.id,
            dataSourceId: {
              in: dataSources.map((source) => source.id)
            }
          },
          select: {
            id: true,
            dataSourceId: true,
            status: true,
            errorMessage: true,
            progress: true,
            startedAt: true,
            lastHeartbeatAt: true,
            completedAt: true,
            attemptCount: true,
            retryCount: true,
            updatedAt: true
          },
          orderBy: {
            updatedAt: "desc"
          }
        })
      : [];
    const latestIngestionJobBySourceId = new Map<string, typeof latestIngestionJobs[number]>();
    for (const job of latestIngestionJobs) {
      if (job.dataSourceId && !latestIngestionJobBySourceId.has(job.dataSourceId)) {
        latestIngestionJobBySourceId.set(job.dataSourceId, job);
      }
    }
    const latestConnectorJobs = dataSources.length
      ? await prisma.asyncJob.findMany({
          where: {
            workspaceId: session.workspace.id,
            type: "SYNC_CONNECTOR"
          },
          select: {
            id: true,
            status: true,
            currentStep: true,
            errorMessage: true,
            heartbeatAt: true,
            leaseExpiresAt: true,
            payload: true,
            updatedAt: true
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 100
        })
      : [];
    const sourceIds = new Set(dataSources.map((source) => source.id));
    const latestConnectorJobBySourceId = new Map<string, typeof latestConnectorJobs[number]>();
    for (const job of latestConnectorJobs) {
      const payload = asRecord(job.payload);
      const dataSourceId = typeof payload?.dataSourceId === "string" ? payload.dataSourceId : null;
      if (!dataSourceId || !sourceIds.has(dataSourceId)) continue;

      const current = latestConnectorJobBySourceId.get(dataSourceId);
      if (
        !current ||
        connectorJobStatusRank(job) < connectorJobStatusRank(current) ||
        (
          connectorJobStatusRank(job) === connectorJobStatusRank(current) &&
          job.updatedAt > current.updatedAt
        )
      ) {
        latestConnectorJobBySourceId.set(dataSourceId, job);
      }
    }
    const deletedDataSources = includeDeleted
      ? await prisma.dataSourceConnection.findMany({
          where: {
            workspaceId: session.workspace.id,
            isActive: false,
            status: ConnectionStatus.DISCONNECTED
          },
          select: {
            id: true,
            name: true,
            provider: true,
            type: true,
            isActive: true,
            status: true,
            connectionMode: true,
            authMethod: true,
            lastErrorMessage: true,
            schemas: true,
            config: true,
            connectedAt: true,
            lastSyncAt: true,
            createdAt: true,
            updatedAt: true,
        ecommerceConnectorAccounts: {
          where: {
            provider: {
              in: ["shopify", "amazon", "meta_ads", "google_ads"]
            }
          },
              select: {
            id: true,
            provider: true,
            shopDomain: true,
                autoSyncEnabled: true,
                syncIntervalMinutes: true,
                lastSyncedAt: true,
                nextSyncAt: true,
                lastAutoSyncAttemptAt: true,
                lastAutoSyncSuccessAt: true,
                autoSyncFailureCount: true
              },
              take: 1
            }
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 20
        })
      : [];

    const publicDataSource = (source: typeof dataSources[number]) => {
      const deletedAt = source.updatedAt?.toISOString() ?? null;
      const retentionExpiresAt = source.isActive === false && source.updatedAt
        ? new Date(source.updatedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const detailedStatus = syncStatusFromSource({
        ...source,
        latestSnapshot: latestSnapshotBySourceId.get(source.id) ?? null,
        latestIngestionJob: latestIngestionJobBySourceId.get(source.id) ?? null,
        latestConnectorJob: latestConnectorJobBySourceId.get(source.id) ?? null
      });
      const latestIngestionJob = latestIngestionJobBySourceId.get(source.id) ?? null;
      const connectorAccount = source.ecommerceConnectorAccounts?.[0] ?? null;

      return {
        id: source.id,
        name: source.name,
        provider: source.provider,
        type: source.type,
        status: detailedStatus.syncStatus,
        connectionStatus: source.status,
        syncStatus: detailedStatus.syncStatus,
        statusReason: detailedStatus.statusReason,
        statusAction: detailedStatus.statusAction,
        ingestionJob: latestIngestionJob
          ? {
              id: latestIngestionJob.id,
              status: latestIngestionJob.status,
              progress: latestIngestionJob.progress,
              startedAt: latestIngestionJob.startedAt?.toISOString() ?? null,
              lastHeartbeatAt: latestIngestionJob.lastHeartbeatAt?.toISOString() ?? null,
              completedAt: latestIngestionJob.completedAt?.toISOString() ?? null,
              attemptCount: latestIngestionJob.attemptCount,
              retryCount: latestIngestionJob.retryCount,
              updatedAt: latestIngestionJob.updatedAt.toISOString()
            }
          : null,
        connectionMode: source.connectionMode,
        authMethod: source.authMethod,
        config: publicConfig(source.config),
        syncSettings: connectorAccount
          ? {
              connectorAccountId: connectorAccount.id,
              shopDomain: connectorAccount.shopDomain,
              autoSyncEnabled: connectorAccount.autoSyncEnabled,
              syncIntervalMinutes: connectorAccount.syncIntervalMinutes,
              lastSyncedAt: connectorAccount.lastSyncedAt?.toISOString() ?? null,
              nextSyncAt: connectorAccount.nextSyncAt?.toISOString() ?? null,
              lastAutoSyncAttemptAt: connectorAccount.lastAutoSyncAttemptAt?.toISOString() ?? null,
              lastAutoSyncSuccessAt: connectorAccount.lastAutoSyncSuccessAt?.toISOString() ?? null,
              autoSyncFailureCount: connectorAccount.autoSyncFailureCount
            }
          : null,
        schema: schemaSummary(
          source.schemas,
          latestSnapshotBySourceId.get(source.id)?.schemaJson ?? null,
          latestSnapshotBySourceId.get(source.id)?.qualityReport ?? null
        ),
        connectedAt: source.connectedAt?.toISOString() ?? null,
        lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
        deletedAt: source.isActive === false ? deletedAt : null,
        retentionExpiresAt
      };
    };

    return NextResponse.json({
      ok: true,
      workspace: {
        id: session.workspace.id,
        name: session.workspace.name,
        slug: session.workspace.slug
      },
      dataSources: dataSources.map(publicDataSource),
      deletedDataSources: deletedDataSources.map(publicDataSource)
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to load data sources");
  }
}
