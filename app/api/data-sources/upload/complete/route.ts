import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { fileExtension, inferTablesFromCsvText, tableNameFromFile } from "@/lib/file-upload-schema";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { isWorkspaceUploadKey, readR2ObjectText } from "@/lib/r2-storage";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";

export const runtime = "nodejs";

const MAX_FILE_NAME_LENGTH = 180;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeMessage = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]");

  if (
    message.includes("DATABASE_URL must be a PostgreSQL connection string") ||
    message.includes("Can't reach database server") ||
    message.includes("pool timeout") ||
    message.includes("failed to retrieve a connection") ||
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

  if (message.includes("too large") || message.includes("too many") || message.includes("Unsupported")) {
    return message;
  }

  if (message.includes("R2 storage is not configured")) {
    return "R2 storage is not configured.";
  }

  if (
    message.includes("NoSuchKey") ||
    message.includes("NoSuchBucket") ||
    message.includes("AccessDenied") ||
    message.includes("SignatureDoesNotMatch") ||
    message.includes("InvalidAccessKeyId")
  ) {
    return message;
  }

  if (message.includes("Uploaded file was not found")) {
    return "Uploaded file was not found in R2 Storage. Please retry the upload.";
  }

  if (message.includes("Uploaded file is empty or unavailable")) {
    return "Uploaded file is empty or unavailable in R2 Storage. Please retry the upload.";
  }

  return safeMessage ? `文件上传失败：${safeMessage}` : "File upload failed";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const key = stringValue(payload?.key) || stringValue(payload?.path);
    const fileName = stringValue(payload?.fileName);
    const mimeType = stringValue(payload?.mimeType) || "application/octet-stream";
    const fileSize = toNumber(payload?.fileSize);
    const extension = fileExtension(fileName);
    const isCsv = extension === "csv";
    const isExcel = ["xls", "xlsx"].includes(extension);

    if (!key || !isWorkspaceUploadKey(session.workspace.id, key)) {
      return NextResponse.json({ ok: false, message: "Uploaded file key is invalid." }, { status: 400 });
    }

    if (!fileName) {
      return NextResponse.json({ ok: false, message: "File name is required." }, { status: 400 });
    }

    if (fileName.length > MAX_FILE_NAME_LENGTH) {
      return NextResponse.json(
        { ok: false, message: `File name is too long. Maximum supported length: ${MAX_FILE_NAME_LENGTH}.` },
        { status: 400 }
      );
    }

    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { ok: false, message: "Only CSV, XLS, and XLSX files are supported" },
        { status: 400 }
      );
    }

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json({ ok: false, message: "File size is required." }, { status: 400 });
    }

    if (fileSize > FILE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${FILE_UPLOAD_MAX_MB}MB.` },
        { status: 413 }
      );
    }

    const tables = isCsv
      ? inferTablesFromCsvText(fileName, await readR2ObjectText(key))
      : [{ name: tableNameFromFile(fileName), columns: [] }];
    const scannedAt = new Date().toISOString();
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(tables);
    const storage = {
      provider: "cloudflare-r2",
      bucket: stringValue(payload?.bucket),
      key
    };
    const schemaPayload = {
      scannedAt,
      fileName,
      fileSize,
      tables,
      semanticLayer,
      analysisReport
    };

    const result = await prisma.$transaction(async (tx) => {
      await clearWorkspaceReportCaches(tx, session.workspace.id);

      const dataSource = await tx.dataSourceConnection.create({
        data: {
          workspaceId: session.workspace.id,
          type: sourceType,
          name: `${provider} - ${fileName}`,
          provider,
          isActive: true,
          status: ConnectionStatus.CONNECTED,
          connectionMode: "Upload",
          authMethod: "File",
          config: {
            fileName,
            fileSize,
            mimeType,
            extension,
            storageProvider: "r2",
            storageBucket: storage.bucket,
            storagePath: key,
            objectKey: key,
            storage
          },
          schemas: schemaPayload,
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
            ...schemaPayload
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

    void generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId: session.workspace.id,
      userId: session.user.id
    }).catch((metricGenerationError) => {
      console.error("Failed to generate metrics after direct upload", metricGenerationError);
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
          fileName,
          fileSize,
          extension,
          storage
        },
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables,
          semanticLayer,
          analysisReport
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
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    if (error instanceof BillingEntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: billingEntitlementMessage(error, billingLocaleFromRequest(request)),
          upgradeUrl: "/settings/billing"
        },
        { status: error.status }
      );
    }

    console.error("Direct upload completion failed", error);

    return apiErrorResponse(error, uploadErrorMessage(error));
  }
}
