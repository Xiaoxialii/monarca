import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";

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

function schemaSummary(sourceSchemas: unknown, snapshotSchema: unknown, snapshotReport: unknown) {
  const schemas = asRecord(sourceSchemas);
  const snapshot = asRecord(snapshotSchema);
  const report = asRecord(snapshotReport);
  const unifiedIngestion = asRecord(schemas?.unifiedIngestion) ?? asRecord(snapshot?.unifiedIngestion);
  const semantic = asRecord(unifiedIngestion?.semantic);
  const detectedSchema = asRecord(unifiedIngestion?.detectedSchema);
  const canonical = asRecord(unifiedIngestion?.canonical);
  const learning = asRecord(unifiedIngestion?.learning);
  const mappingDetails = Array.isArray(semantic?.mapping_details)
    ? semantic.mapping_details
    : Array.isArray(semantic?.mappingDetails)
      ? semantic.mappingDetails
      : null;
  const mappings = asRecord(semantic?.mappings);
  const detectedFields = Array.isArray(detectedSchema?.fields) ? detectedSchema.fields : [];
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
    unifiedIngestion: unifiedIngestion
      ? {
          status: typeof unifiedIngestion.status === "string" ? unifiedIngestion.status : null,
          source: typeof unifiedIngestion.source === "string" ? unifiedIngestion.source : null,
          sampledRows: toNumber(unifiedIngestion.sampledRows),
          totalParsedRows: toNumber(unifiedIngestion.totalParsedRows),
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
            confidence: toNumber(semantic?.confidence),
            memory_hits: toNumber(semantic?.memory_hits),
            engine_candidates: toNumber(semantic?.engine_candidates),
            mappings: mappings ?? {},
            mapping_details: mappingDetails
              ? mappingDetails.map((mapping) => {
                  const record = asRecord(mapping);

                  return {
                    field: typeof record?.field === "string" ? record.field : "",
                    canonical: typeof record?.canonical === "string" ? record.canonical : "",
                    confidence: toNumber(record?.confidence),
                    source: typeof record?.source === "string" ? record.source : "engine"
                  };
                }).filter((mapping) => mapping.field)
              : Object.entries(mappings ?? {}).map(([field, canonical]) => ({
                  field,
                  canonical: typeof canonical === "string" ? canonical : String(canonical),
                  confidence: toNumber(semantic?.confidence),
                  source: "engine"
                })),
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

export async function GET() {
  try {
    const session = await requireWorkspace();
    const includeDeleted = true;
    const dataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true,
        status: ConnectionStatus.CONNECTED
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
        config: true,
        schemas: true,
        connectedAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
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
            config: true,
            schemas: true,
            connectedAt: true,
            lastSyncAt: true,
            createdAt: true,
            updatedAt: true
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

      return {
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
          null,
          null
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
