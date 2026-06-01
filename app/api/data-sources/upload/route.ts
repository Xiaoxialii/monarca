import { ConnectionStatus, DataSourceType, UsageActionType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkUserEntitlement, consumeCredit, EntitlementError } from "@/lib/entitlements";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { storeUploadInR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_CSV_ROWS = 300_000;
const MAX_CSV_COLUMNS = 60;
const MAX_FILE_NAME_LENGTH = 180;

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function tableNameFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_") || "uploaded_file";
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("pool timeout") || message.includes("failed to retrieve a connection")) {
    return "数据库暂时无法连接，请先启动本地 MySQL 后再上传文件";
  }

  if (
    message.includes("too large") ||
    message.includes("too many") ||
    message.includes("Unsupported")
  ) {
    return message;
  }

  return "File upload failed";
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && nextCharacter === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeCsvNumber(value: string) {
  const cleaned = value.replace(/[$,%+,\s]/g, "");
  return cleaned ? Number(cleaned) : Number.NaN;
}

function inferCsvColumnType(header: string, values: string[]) {
  const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  if (/date|time|created_at|updated_at|timestamp/.test(normalizedHeader)) {
    return "date";
  }

  if (
    /^(open|high|low|close|adj_close|volume|price|rating|reviews|installs|sentiment_polarity|sentiment_subjectivity)$/.test(normalizedHeader) ||
    /amount|revenue|gmv|sales|score|count|total/.test(normalizedHeader)
  ) {
    return "decimal";
  }

  const nonEmptyValues = values.filter((value) => value.trim()).slice(0, 50);

  if (nonEmptyValues.length > 0) {
    const numericCount = nonEmptyValues.filter((value) => Number.isFinite(normalizeCsvNumber(value))).length;

    if (numericCount / nonEmptyValues.length >= 0.8) {
      return "decimal";
    }
  }

  return "text";
}

async function inferTablesFromFile(file: File) {
  const extension = fileExtension(file.name);
  const tableName = tableNameFromFile(file.name);

  if (extension === "csv") {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headers = lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : [];

    if (lines.length - 1 > MAX_CSV_ROWS) {
      throw new Error(`CSV has too many rows. Maximum supported rows: ${MAX_CSV_ROWS}.`);
    }

    if (headers.length > MAX_CSV_COLUMNS) {
      throw new Error(`CSV has too many columns. Maximum supported columns: ${MAX_CSV_COLUMNS}.`);
    }

    const parsedRows = lines.slice(1).map(splitCsvLine);
    const sampleRows = parsedRows.slice(0, 500);
    const sampleRecords = sampleRows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    );

    return [
      {
        name: tableName,
        rowCount: parsedRows.length,
        sampleRows: sampleRecords,
        columns: headers.map((header, index) => {
          const values = sampleRows.map((row) => row[index] ?? "");

          return {
            name: header,
            type: inferCsvColumnType(header, values),
            nullable: true
          };
        })
      }
    ];
  }

  return [
    {
      name: tableName,
      columns: []
    }
  ];
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await checkUserEntitlement(session.user.id, UsageActionType.DATABASE_CONNECTION);
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

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
        { status: 413 }
      );
    }

    const tables = await inferTablesFromFile(file);
    const scannedAt = new Date().toISOString();
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(tables);
    const schemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables,
      semanticLayer,
      analysisReport
    };

    const result = await prisma.$transaction(async (tx) => {
      const dataSource = await tx.dataSourceConnection.create({
        data: {
          workspaceId: session.workspace.id,
          type: sourceType,
          name: `${provider} - ${file.name}`,
          provider,
          status: ConnectionStatus.CONNECTED,
          connectionMode: "Upload",
          authMethod: "File",
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension
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

      const metricGeneration = await generateWorkspaceMetricsFromConnectedSources(tx, {
        workspaceId: session.workspace.id,
        userId: session.user.id
      });

      return { dataSource, schemaSnapshot, generatedMetricCount: metricGeneration.generatedMetricCount };
    });
    const storedFile = await storeUploadInR2({
      workspaceId: session.workspace.id,
      dataSourceId: result.dataSource.id,
      file
    });

    if (storedFile) {
      await prisma.dataSourceConnection.update({
        where: {
          id: result.dataSource.id
        },
        data: {
          config: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            extension,
            storage: {
              provider: "cloudflare-r2",
              bucket: storedFile.bucket,
              key: storedFile.key,
              url: storedFile.url
            }
          }
        }
      });
    }

    await consumeCredit({
      userId: session.user.id,
      actionType: UsageActionType.DATABASE_CONNECTION,
      amount: 1,
      metadata: {
        workspaceId: session.workspace.id,
        dataSourceId: result.dataSource.id,
        sourceType: result.dataSource.type,
        provider: result.dataSource.provider,
        fileName: file.name
      }
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
          storage: storedFile
            ? {
                provider: "cloudflare-r2",
                bucket: storedFile.bucket,
                key: storedFile.key,
                url: storedFile.url
              }
            : null
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
        generatedMetricCount: result.generatedMetricCount,
        analysisReport
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof EntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          upgradeUrl: "/checkout/professional",
          oneTimeUrl: "/checkout/trial"
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: uploadErrorMessage(error)
      },
      { status: 400 }
    );
  }
}
