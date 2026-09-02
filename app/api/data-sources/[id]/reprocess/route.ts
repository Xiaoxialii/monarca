import fs from "node:fs";
import { ConnectionStatus, Prisma, WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { fileExtension } from "@/lib/file-upload-schema";
import { createAsyncJob, processJob } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_REPROCESS_STATUSES = ["QUEUED", "PROCESSING", "PAUSED"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function booleanValue(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function rawUploadLocator(config: Record<string, unknown>) {
  const storage = asRecord(config.storage);
  const inlineFileBase64 = stringValue(config.inlineFileBase64);
  const storedFilePath = stringValue(config.storedFilePath) || stringValue(storage.path);
  const objectKey = stringValue(config.objectKey) || stringValue(config.storagePath) || stringValue(storage.key);
  const storageProvider = stringValue(config.storageProvider) || stringValue(storage.provider);

  if (inlineFileBase64) return { available: true, provider: "inline-database", inlineFileBase64 };
  if (storedFilePath && fs.existsSync(storedFilePath)) return { available: true, provider: "local-file", path: storedFilePath };
  if (objectKey && !objectKey.startsWith("/tmp/")) return { available: true, provider: storageProvider || "cloudflare-r2", key: objectKey };

  return { available: false, provider: storageProvider || null };
}

async function rawUploadLocatorFromIngestionHistory(dataSourceId: string) {
  const job = await prisma.unifiedIngestionJob.findFirst({
    where: { dataSourceId },
    orderBy: { createdAt: "desc" },
    select: { metadataJson: true }
  });
  return rawUploadLocator(asRecord(job?.metadataJson));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const { id: dataSourceId } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const reason = stringValue(body.reason) || "manual_reprocess";
    const invalidateDependentReports = booleanValue(body.invalidateDependentReports, true);
    const idempotencyKey = stringValue(request.headers.get("Idempotency-Key")) ||
      stringValue(body.idempotencyKey) ||
      `reprocess:${session.workspace.id}:${dataSourceId}`;

    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id: dataSourceId,
        workspaceId: session.workspace.id,
        isActive: true
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        provider: true,
        type: true,
        config: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "Data source was not found." }, { status: 404 });
    }

    const config = asRecord(dataSource.config);
    const fileName = stringValue(config.fileName) || dataSource.name.replace(/^(CSV|Excel)\s+-\s+/i, "");
    const extension = fileExtension(fileName);
    const source = extension === "csv" ? "csv" : ["xls", "xlsx"].includes(extension) ? "excel" : null;
    if (!source) {
      return NextResponse.json({
        ok: false,
        code: "UNSUPPORTED_SOURCE",
        message: "Only uploaded CSV, XLS, and XLSX data sources can be reprocessed by this endpoint."
      }, { status: 400 });
    }

    const locator = rawUploadLocator(config);
    const historyLocator = locator.available ? locator : await rawUploadLocatorFromIngestionHistory(dataSource.id);
    const effectiveLocator = historyLocator.available ? historyLocator : locator;
    if (!effectiveLocator.available) {
      return NextResponse.json({
        ok: false,
        code: "RAW_ARTIFACT_UNAVAILABLE",
        message: "The immutable uploaded file is no longer available for reprocessing.",
        canReprocess: false,
        recommendedAction: "Reconnect or upload the source file again so Monarca can rebuild semantic mapping."
      }, { status: 409 });
    }

    const existing = await prisma.asyncJob.findFirst({
      where: {
        workspaceId: session.workspace.id,
        type: "INGESTION",
        identity: idempotencyKey,
        status: { in: [...ACTIVE_REPROCESS_STATUSES] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        status: existing.status,
        jobId: existing.id,
        currentStep: existing.currentStep,
        statusUrl: `/api/jobs/${existing.id}`,
        deduped: true
      });
    }

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: { workspaceId: session.workspace.id },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const schemaSnapshot = await prisma.schemaSnapshot.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id,
        version: (latestSnapshot?.version ?? 0) + 1,
        status: ConnectionStatus.PENDING,
        schemaStatus: "PENDING",
        canonicalStatus: "NOT_STARTED",
        schemaJson: {
          sourceId: dataSource.id,
          reprocess: {
            reason,
            queuedAt: new Date().toISOString(),
            forceSourceInference: booleanValue(body.forceSourceInference, true),
            rebuildSemanticMapping: booleanValue(body.rebuildSemanticMapping, true),
            rebuildCanonical: booleanValue(body.rebuildCanonical, true),
            invalidateDependentReports
          }
        } as Prisma.InputJsonValue,
        qualityReport: {
          reprocessQueued: true,
          canonicalArtifactBacked: false
        } as Prisma.InputJsonValue
      }
    });

    const ingestionJob = await prisma.unifiedIngestionJob.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id,
        fileId: stringValue(effectiveLocator.key) || stringValue(effectiveLocator.path) || `inline:${dataSource.id}`,
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued for reprocess",
        metadataJson: {
          userId: session.user.id,
          source,
          provider: dataSource.provider,
          fileName,
          extension,
          schemaSnapshotId: schemaSnapshot.id,
          storage: {
            provider: effectiveLocator.provider,
            key: stringValue(effectiveLocator.key) || null,
            path: stringValue(effectiveLocator.path) || null
          },
          inlineFileBase64: stringValue(effectiveLocator.inlineFileBase64) || undefined,
          reason,
          reprocess: true
        } as Prisma.InputJsonValue
      }
    });

    const asyncJob = await createAsyncJob(prisma, {
      workspaceId: session.workspace.id,
      type: "INGESTION",
      identity: idempotencyKey,
      currentStep: "Queued for data reprocess",
      payload: {
        unifiedIngestionJobId: ingestionJob.id,
        dataSourceId: dataSource.id,
        schemaSnapshotId: schemaSnapshot.id,
        reason
      } as Prisma.InputJsonValue
    });

    if (invalidateDependentReports) {
      await clearWorkspaceReportCaches(prisma, session.workspace.id).catch((error) => {
        console.warn("Failed to mark report caches stale for reprocess", error);
      });
    }

    after(() => {
      void processJob(asyncJob.id).catch((error) => {
        console.error("Failed to process queued reprocess ingestion job", { jobId: asyncJob.id, error });
      });
    });

    return NextResponse.json({
      ok: true,
      status: asyncJob.status,
      jobId: asyncJob.id,
      ingestionJobId: ingestionJob.id,
      schemaSnapshotId: schemaSnapshot.id,
      statusUrl: `/api/jobs/${asyncJob.id}`,
      deduped: false
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({
      ok: false,
      code: "REPROCESS_FAILED",
      message: error instanceof Error ? error.message : "Failed to queue data reprocess."
    }, { status: 500 });
  }
}
