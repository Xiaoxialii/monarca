import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSemanticLayer, generateSemanticMetrics } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function tableNameFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_") || "uploaded_file";
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

async function inferTablesFromFile(file: File) {
  const extension = fileExtension(file.name);
  const tableName = tableNameFromFile(file.name);

  if (extension === "csv") {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/).find((line) => line.trim());
    const headers = firstLine ? splitCsvLine(firstLine).filter(Boolean) : [];

    return [
      {
        name: tableName,
        columns: headers.map((header) => ({
          name: header,
          type: "text",
          nullable: true
        }))
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

    const tables = await inferTablesFromFile(file);
    const scannedAt = new Date().toISOString();
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const provider = isCsv ? "CSV" : "Excel";
    const sourceType = isCsv ? DataSourceType.CSV : DataSourceType.EXCEL;
    const semanticLayer = buildSemanticLayer(tables);
    const schemaPayload = {
      scannedAt,
      fileName: file.name,
      fileSize: file.size,
      tables,
      semanticLayer
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
            generatedMetricCount: semanticLayer.metrics.length
          }
        }
      });

      const generatedMetricCount = await generateSemanticMetrics(tx, {
        workspaceId: session.workspace.id,
        userId: session.user.id,
        semanticLayer
      });

      return { dataSource, schemaSnapshot, generatedMetricCount };
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
          extension
        },
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables,
          semanticLayer
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
        generatedMetricCount: result.generatedMetricCount
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "File upload failed"
      },
      { status: 400 }
    );
  }
}
