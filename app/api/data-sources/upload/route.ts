import { ConnectionStatus, DataSourceType, Prisma, WorkspaceRole } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { fileExtension } from "@/lib/file-upload-schema";
import { storeUploadLocally } from "@/lib/local-upload-storage";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";
import { createAsyncJob, processJob } from "@/lib/jobs/async-job-runner";
import { logWorkspaceContext } from "@/lib/current-workspace-context";
import {
  findDuplicateUploadedDataSource,
  uploadContentHash
} from "@/lib/uploads/upload-dedupe";

export const runtime = "nodejs";

const MAX_FILE_NAME_LENGTH = 180;
const INLINE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 1_000;

function pendingUnifiedIngestionSummary(input: {
  source: "csv" | "excel";
  totalParsedRows: number;
}) {
  return {
    status: "pending",
    source: input.source,
    sampledRows: Math.min(input.totalParsedRows, MAX_UNIFIED_INGESTION_SAMPLE_ROWS),
    totalParsedRows: input.totalParsedRows,
    message: "Unified ingestion is running in the background."
  };
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeMessage = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]");

  if (message.includes("DATABASE_URL must be a PostgreSQL connection string")) {
    return "数据库连接地址不是 PostgreSQL。请把 DATABASE_URL 改为 Neon/PostgreSQL 连接串后重试。";
  }

  if (
    message.includes("pool timeout") ||
    message.includes("failed to retrieve a connection") ||
    message.includes("Can't reach database server") ||
    message.includes("Timed out fetching a new connection")
  ) {
    return "数据库暂时无法连接，请检查 PostgreSQL / Neon 连接地址后再上传文件";
  }

  if (
    message.includes("does not exist") ||
    message.includes("Unknown argument") ||
    message.includes("Invalid `") ||
    message.includes("migration")
  ) {
    return `生产数据库结构可能未更新，请先执行 Prisma migration。原始错误：${safeMessage || "database schema error"}`;
  }

  if (
    message.includes("too large") ||
    message.includes("too many") ||
    message.includes("Unsupported")
  ) {
    return message;
  }

  return safeMessage ? `文件上传失败：${safeMessage}` : "File upload failed";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    logWorkspaceContext("[workspace-context] data-sources.upload.POST", session);
    await requireCanConnectDataSource(session.workspace.id, session.user);
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedBusinessSource = stringValue(formData.get("businessSource") ?? formData.get("provider"));

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "File is required" }, { status: 400 });
    }

    const extension = fileExtension(file.name);
    const isCsv = extension === "csv";
    const isExcel = ["xls", "xlsx"].includes(extension);

    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { ok: false, message: "Only CSV, XLS, and XLSX files are supported" },
        { status: 400 }
      );
    }

    if (file.name.length > MAX_FILE_NAME_LENGTH) {
      return NextResponse.json(
        { ok: false, message: `File name is too long. Maximum supported length: ${MAX_FILE_NAME_LENGTH}.` },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ ok: false, message: "File is empty" }, { status: 400 });
    }

    if (file.size > FILE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${FILE_UPLOAD_MAX_MB}MB.` },
        { status: 413 }
      );
    }

    const scannedAt = new Date().toISOString();
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const uploadSource = isCsv ? "csv" : "excel";
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const contentHash = uploadContentHash(fileBuffer);
    const duplicateLookup = await findDuplicateUploadedDataSource(prisma, {
      workspaceId: session.workspace.id,
      fileName: file.name,
      fileSize: file.size,
      contentHash,
      sourceType
    });

    if (duplicateLookup.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        status: duplicateLookup.duplicate.status,
        message: "This file has already been uploaded. Reusing the existing data source.",
        dataSource: {
          id: duplicateLookup.duplicate.id,
          name: duplicateLookup.duplicate.name,
          provider: duplicateLookup.duplicate.provider,
          type: duplicateLookup.duplicate.type,
          status: duplicateLookup.duplicate.status,
          connectionMode: duplicateLookup.duplicate.connectionMode,
          authMethod: duplicateLookup.duplicate.authMethod,
          config: {
            fileName: file.name,
            fileSize: file.size,
            extension,
            contentHash,
            duplicateOfDataSourceId: duplicateLookup.duplicate.id
          },
          schema: duplicateLookup.duplicate.schemas,
          connectedAt: duplicateLookup.duplicate.connectedAt?.toISOString() ?? null,
          lastSyncAt: duplicateLookup.duplicate.lastSyncAt?.toISOString() ?? null
        }
      });
    }

    const unifiedIngestion = pendingUnifiedIngestionSummary({
      source: uploadSource,
      totalParsedRows: 0
    });
    const snapshotSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables: [],
      unifiedIngestion
    };
    const publicSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables: [],
      unifiedIngestion
    };

    const dataSource = await prisma.dataSourceConnection.create({
      data: {
        workspaceId: session.workspace.id,
        type: sourceType,
        name: `${provider} - ${file.name}`,
        provider,
        isActive: true,
        status: ConnectionStatus.PENDING,
        connectionMode: "Upload",
        authMethod: "File",
        contentHash,
        sourceFingerprint: duplicateLookup.sourceFingerprint,
        config: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          extension,
          contentHash,
          sourceFingerprint: duplicateLookup.sourceFingerprint
        },
        schemas: publicSchemaPayload as Prisma.InputJsonValue,
        connectedAt: new Date(),
        lastSyncAt: new Date()
      }
    });

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        version: "desc"
      },
      select: {
        version: true
      }
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
          ...snapshotSchemaPayload
        } as Prisma.InputJsonValue,
        qualityReport: {
          tableCount: 0,
          columnCount: 0,
          semanticFieldCount: 0,
          businessEntityCount: 0,
          generatedMetricCount: 0,
          canonicalArtifactBacked: false
        }
      }
    });
    const result = { dataSource, schemaSnapshot };
    void clearWorkspaceReportCaches(prisma, session.workspace.id).catch((cacheError) => {
      console.warn("Failed to clear report caches after upload", cacheError);
    });

    let localStoredFile: Awaited<ReturnType<typeof storeUploadLocally>> | null = null;
    let storageWarning: string | null = null;
    const inlineStoredFile = file.size <= INLINE_UPLOAD_MAX_BYTES
      ? {
        inlineFileBase64: fileBuffer.toString("base64"),
        inlineFileName: file.name,
        inlineMimeType: file.type || null,
        inlineFileSize: file.size
      }
      : null;

    try {
      localStoredFile = await storeUploadLocally({
        workspaceId: session.workspace.id,
        dataSourceId: result.dataSource.id,
        file
      });
    } catch (localStorageError) {
      storageWarning = "Original file storage failed; schema import was saved.";
      console.warn("Skipping local upload storage after schema import", localStorageError);
    }

    if (localStoredFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: result.dataSource.id
        },
        data: {
          isActive: true,
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension,
            contentHash,
            sourceFingerprint: duplicateLookup.sourceFingerprint,
            ...(inlineStoredFile ?? {}),
            storedFilePath: localStoredFile?.path,
            storage: {
              provider: localStoredFile.provider,
              path: localStoredFile.path
            }
          }
        }
      });
    } else if (inlineStoredFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: result.dataSource.id
        },
        data: {
          isActive: true,
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension,
            contentHash,
            sourceFingerprint: duplicateLookup.sourceFingerprint,
            ...inlineStoredFile,
            storage: {
              provider: "inline-database"
            }
          }
        }
      });
    }

    const ingestionJob = await prisma.unifiedIngestionJob.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: result.dataSource.id,
        fileId: file.name,
        status: "QUEUED",
        progress: 0,
        currentStep: "Queued for analysis",
        metadataJson: {
          userId: session.user.id,
          source: uploadSource,
          provider,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          extension,
          businessSource: requestedBusinessSource || undefined,
          schemaSnapshotId: result.schemaSnapshot.id,
          storage: localStoredFile
            ? {
                provider: localStoredFile.provider,
                path: localStoredFile.path
              }
            : inlineStoredFile
              ? { provider: "inline-database" }
              : null,
          inlineFileBase64: inlineStoredFile?.inlineFileBase64
        } as Prisma.InputJsonValue
      }
    });
    const asyncJob = await createAsyncJob(prisma, {
      workspaceId: session.workspace.id,
      type: "INGESTION",
      currentStep: "Queued for ingestion",
      payload: {
        unifiedIngestionJobId: ingestionJob.id,
        dataSourceId: result.dataSource.id,
        dataSourceIds: [result.dataSource.id],
        schemaSnapshotId: result.schemaSnapshot.id
      } as Prisma.InputJsonValue
    });

    after(() => {
      void processJob(asyncJob.id).catch((error) => {
        console.error("Failed to process upload async ingestion job", error);
      });
    });

    return NextResponse.json({
      ok: true,
      status: "QUEUED",
      jobId: ingestionJob.id,
      asyncJobId: asyncJob.id,
      dataSource: {
        id: result.dataSource.id,
        name: result.dataSource.name,
        provider: result.dataSource.provider,
        type: result.dataSource.type,
        status: "QUEUED",
        connectionMode: result.dataSource.connectionMode,
        authMethod: result.dataSource.authMethod,
        config: {
          fileName: file.name,
          fileSize: file.size,
          extension,
          contentHash,
          storage: localStoredFile
            ? {
                provider: localStoredFile.provider,
                path: localStoredFile.path
              }
            : null,
          hasStoredFile: Boolean(localStoredFile)
        },
        schema: {
          tableCount: 0,
          columnCount: 0,
          scannedAt,
          tables: [],
          unifiedIngestion,
          ingestionJobId: ingestionJob.id
        },
        connectedAt: result.dataSource.connectedAt?.toISOString() ?? null,
        lastSyncAt: result.dataSource.lastSyncAt?.toISOString() ?? null
      },
      schema: {
        id: result.schemaSnapshot.id,
        version: result.schemaSnapshot.version,
        schemaStatus: "PENDING",
        canonicalStatus: "NOT_STARTED",
        tableCount: 0,
        columnCount: 0,
        semanticFieldCount: 0,
        businessEntityCount: 0,
        generatedMetricCount: 0
      },
      storageWarning
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof BillingEntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: billingEntitlementMessage(error, billingLocaleFromRequest(request)),
          upgradeUrl: "/settings/billing",
          oneTimeUrl: "/settings/billing"
        },
        { status: error.status }
      );
    }

    return apiErrorResponse(error, uploadErrorMessage(error));
  }
}
