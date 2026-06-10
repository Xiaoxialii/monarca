import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { storeUploadInR2 } from "@/lib/r2-storage";
import { apiErrorResponse } from "@/lib/api-errors";
import { fileExtension, inferTablesFromUploadFile } from "@/lib/file-upload-schema";
import { storeUploadLocally } from "@/lib/local-upload-storage";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";

export const runtime = "nodejs";

const MAX_FILE_NAME_LENGTH = 180;

function publicTables(tables: Array<{
  name: string;
  rowCount?: number;
  columns: Array<{ name: string; type?: string; nullable?: boolean }>;
}>) {
  return tables.map((table) => ({
    name: table.name,
    rowCount: table.rowCount,
    columns: table.columns
  }));
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

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);
    const formData = await request.formData();
    const file = formData.get("file");

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

    const tables = await inferTablesFromUploadFile(file);
    const scannedAt = new Date().toISOString();
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(tables);
    const snapshotSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables,
      semanticLayer,
      analysisReport
    };
    const publicSchemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables: publicTables(tables)
    };

    const result = await prisma.$transaction(async (tx) => {
      await clearWorkspaceReportCaches(tx, session.workspace.id);

      const dataSource = await tx.dataSourceConnection.create({
        data: {
          workspaceId: session.workspace.id,
          type: sourceType,
          name: `${provider} - ${file.name}`,
          provider,
          isActive: true,
          status: ConnectionStatus.CONNECTED,
          connectionMode: "Upload",
          authMethod: "File",
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension
          },
          schemas: publicSchemaPayload,
          connectedAt: new Date(),
          lastSyncAt: new Date()
        }
      });

      const latestSnapshot = await tx.schemaSnapshot.findFirst({
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

      const schemaSnapshot = await tx.schemaSnapshot.create({
        data: {
          workspaceId: session.workspace.id,
          dataSourceId: dataSource.id,
          version: (latestSnapshot?.version ?? 0) + 1,
          status: ConnectionStatus.CONNECTED,
          schemaJson: {
            sourceId: dataSource.id,
            ...snapshotSchemaPayload
          },
          qualityReport: {
            tableCount: tables.length,
            columnCount,
            semanticFieldCount: semanticLayer.fields.length,
            businessEntityCount: semanticLayer.entities.length,
            generatedMetricCount: semanticLayer.metrics.length,
            analysisReport
          }
        }
      });

      return { dataSource, schemaSnapshot };
    }, {
      maxWait: 20_000,
      timeout: 30_000
    });

    const generatedMetricCount = semanticLayer.metrics.length;
    let storedFile: Awaited<ReturnType<typeof storeUploadInR2>> = null;
    let localStoredFile: Awaited<ReturnType<typeof storeUploadLocally>> | null = null;
    let storageWarning: string | null = null;

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
            storedFilePath: localStoredFile.path,
            storage: {
              provider: localStoredFile.provider,
              path: localStoredFile.path
            }
          }
        }
      });
    }

    void (async () => {
      try {
        storedFile = await storeUploadInR2({
          workspaceId: session.workspace.id,
          dataSourceId: result.dataSource.id,
          file
        });
      } catch (storageError) {
        console.warn("Cloud upload storage failed; local upload storage is already saved", storageError);
      }

      if (storedFile) {
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
              storedFilePath: localStoredFile?.path ?? null,
              storageProvider: "r2",
              storageBucket: storedFile.bucket,
              storagePath: storedFile.key,
              objectKey: storedFile.key,
              storage: {
                provider: "cloudflare-r2",
                bucket: storedFile.bucket,
                key: storedFile.key
              }
            }
          }
        });
      }

      await generateWorkspaceMetricsFromConnectedSources(prisma, {
        workspaceId: session.workspace.id,
        userId: session.user.id
      });
    })().catch((backgroundError) => {
      console.error("Failed to finish post-upload storage or metric generation", backgroundError);
    });

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: result.dataSource.id,
        name: result.dataSource.name,
        provider: result.dataSource.provider,
        type: result.dataSource.type,
        status: result.dataSource.status,
        connectionMode: result.dataSource.connectionMode,
        authMethod: result.dataSource.authMethod,
        config: {
          fileName: file.name,
          fileSize: file.size,
          extension,
          storage: localStoredFile
            ? {
                provider: localStoredFile.provider,
                path: localStoredFile.path
              }
            : null,
          hasStoredFile: Boolean(localStoredFile)
        },
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables: publicTables(tables)
        },
        connectedAt: result.dataSource.connectedAt?.toISOString() ?? null,
        lastSyncAt: result.dataSource.lastSyncAt?.toISOString() ?? null
      },
      schema: {
        id: result.schemaSnapshot.id,
        version: result.schemaSnapshot.version,
        tableCount: tables.length,
        columnCount,
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount,
        analysisReport
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
