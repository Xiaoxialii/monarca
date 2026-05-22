import { NextResponse } from "next/server";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { prisma } from "@/lib/prisma";

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

function publicConfig(configValue: unknown) {
  const config = asRecord(configValue);

  if (!config) {
    return null;
  }

  return {
    type: typeof config.type === "string" ? config.type : null,
    host: typeof config.host === "string" ? config.host : null,
    port: toNumber(config.port),
    database: typeof config.database === "string" ? config.database : null,
    ssl: typeof config.ssl === "boolean" ? config.ssl : null,
    fileName: typeof config.fileName === "string" ? config.fileName : null,
    fileSize: toNumber(config.fileSize),
    extension: typeof config.extension === "string" ? config.extension : null,
    hasStoredFile: typeof config.storedFilePath === "string" && Boolean(config.storedFilePath)
  };
}

function schemaSummary(sourceSchemas: unknown, snapshotSchema: unknown, snapshotReport: unknown) {
  const schemas = asRecord(sourceSchemas);
  const snapshot = asRecord(snapshotSchema);
  const report = asRecord(snapshotReport);
  const tables = Array.isArray(schemas?.tables)
    ? schemas.tables
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
            type: typeof columnRecord?.type === "string" ? columnRecord.type : null,
            nullable: typeof columnRecord?.nullable === "boolean" ? columnRecord.nullable : null
          };
        })
      };
    }).filter((table) => table.name)
  };
}

export async function GET() {
  try {
    const session = await requireWorkspace();
    const dataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true
      },
      include: {
        schemaSnapshots: {
          orderBy: {
            version: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      ok: true,
      dataSources: dataSources.map((source) => ({
        id: source.id,
        name: source.name,
        provider: source.provider,
        type: source.type,
        status: source.status,
        connectionMode: source.connectionMode,
        authMethod: source.authMethod,
        config: publicConfig(source.config),
        schema: schemaSummary(
          source.schemas,
          source.schemaSnapshots[0]?.schemaJson,
          source.schemaSnapshots[0]?.qualityReport
        ),
        connectedAt: source.connectedAt?.toISOString() ?? null,
        lastSyncAt: source.lastSyncAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to load data sources" }, { status: 400 });
  }
}
