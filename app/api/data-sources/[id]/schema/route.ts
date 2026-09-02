import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { logWorkspaceContext } from "@/lib/current-workspace-context";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { buildSemanticMappingCache, semanticMappingCacheSummary } from "@/lib/semantic/schema-mapping-cache";
import { tablesFromConnectedDataSourceFile } from "@/lib/workspace-metric-generation";

export const dynamic = "force-dynamic";

type SchemaEndpointSnapshot =
  | {
      id: string | null;
      version: number | null;
      status: string;
      schemaJson: Prisma.JsonValue;
      qualityReport: Prisma.JsonValue;
      createdAt: string;
    }
  | null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function schemaTables(value: unknown) {
  const schema = asRecord(value);
  const rawUploadSchema = asRecord(schema.rawUploadSchema);
  if (Array.isArray(schema.tables)) return schema.tables;
  if (Array.isArray(rawUploadSchema.tables)) return rawUploadSchema.tables;
  return [];
}

function schemaTablesNeedFieldCoverage(value: unknown) {
  const tables = schemaTables(value);
  if (!tables.length) return true;

  const columns = tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    return Array.isArray(tableRecord.columns) ? tableRecord.columns : [];
  });
  if (!columns.length) return true;

  return columns.every((column) => {
    const record = asRecord(column);
    const rowCount = Number(record.rowCount);
    const nonNullCount = Number(record.nonNullCount);
    return !Number.isFinite(rowCount) && !Number.isFinite(nonNullCount);
  }) || tables.every((table) => Number(asRecord(table).rowCount) === 0);
}

function schemaHasMapping(value: unknown) {
  const schema = asRecord(value);
  const rawUploadSchema = asRecord(schema.rawUploadSchema);
  return Boolean(schema.semanticMappingCache || rawUploadSchema.semanticMappingCache);
}

function fileNameFromConfig(config: unknown, fallback: string) {
  const record = asRecord(config);
  return typeof record.fileName === "string" && record.fileName.trim() ? record.fileName : fallback;
}

function jsonSafe<T>(value: T): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();

  try {
    const session = await requireWorkspace(request);
    logWorkspaceContext("[workspace-context] data-sources.id.schema.GET", session);
    const { id } = await params;
    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id
      },
      select: {
        id: true,
        name: true,
        provider: true,
        type: true,
        status: true,
        config: true,
        schemas: true,
        updatedAt: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    const snapshots = await prisma.schemaSnapshot.findMany({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      select: {
        id: true,
        version: true,
        status: true,
        schemaJson: true,
        qualityReport: true,
        createdAt: true
      }
    });
    const latestSnapshotWithTables = snapshots.find((snapshot) =>
      schemaTables(snapshot.schemaJson).length > 0
    );
    const latestSnapshotWithMapping = snapshots.find((snapshot) =>
      schemaHasMapping(snapshot.schemaJson)
    );
    const latestSnapshot = latestSnapshotWithTables ?? latestSnapshotWithMapping ?? snapshots[0] ?? null;
    let responseSchema = dataSource.schemas;
    let responseSnapshot: SchemaEndpointSnapshot = latestSnapshot
      ? {
          id: latestSnapshot.id,
          version: latestSnapshot.version,
          status: latestSnapshot.status,
          schemaJson: latestSnapshot.schemaJson,
          qualityReport: latestSnapshot.qualityReport,
          createdAt: latestSnapshot.createdAt.toISOString()
        }
      : null;
    const currentSchemaJson = latestSnapshot?.schemaJson ?? dataSource.schemas;
    const needsBackfill = schemaTablesNeedFieldCoverage(currentSchemaJson);

    if (needsBackfill) {
      const inferredTables = await tablesFromConnectedDataSourceFile({
        name: dataSource.name,
        config: dataSource.config
      }).catch((error) => {
        console.warn("[data-sources.schema] failed to backfill schema from connected file", {
          dataSourceId: dataSource.id,
          message: error instanceof Error ? error.message : "Unknown schema backfill error"
        });
        return null;
      });

      if (inferredTables?.length) {
        const semanticLayer = buildSemanticLayer(inferredTables);
        const semanticMappingCache = buildSemanticMappingCache({
          tables: inferredTables,
          semanticLayer,
          source: "schema_endpoint_backfill"
        });
        const backfilledSchema = {
          ...asRecord(latestSnapshot?.schemaJson),
          sourceId: dataSource.id,
          scannedAt: new Date().toISOString(),
          fileName: fileNameFromConfig(dataSource.config, dataSource.name),
          tables: inferredTables,
          semanticLayer,
          semanticMappingCache
        };
        const backfilledQualityReport = {
          ...asRecord(latestSnapshot?.qualityReport),
          tableCount: inferredTables.length,
          columnCount: inferredTables.reduce((sum, table) => sum + table.columns.length, 0),
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount: semanticLayer.metrics.length,
          semanticMappingCache: semanticMappingCacheSummary(semanticMappingCache),
          schemaBackfilledAt: backfilledSchema.scannedAt
        };
        const backfilledSchemaJson = jsonSafe(backfilledSchema);
        const backfilledQualityReportJson = jsonSafe(backfilledQualityReport);

        responseSchema = {
          ...asRecord(dataSource.schemas),
          scannedAt: backfilledSchema.scannedAt,
          fileName: backfilledSchema.fileName,
          tableCount: backfilledQualityReport.tableCount,
          columnCount: backfilledQualityReport.columnCount,
          tables: inferredTables,
          semanticMappingCache
        } as Prisma.JsonValue;
        responseSnapshot = latestSnapshot
          ? {
              id: latestSnapshot.id,
              version: latestSnapshot.version,
              status: latestSnapshot.status,
              schemaJson: backfilledSchemaJson,
              qualityReport: backfilledQualityReportJson,
              createdAt: latestSnapshot.createdAt.toISOString()
            }
          : {
              id: null,
              version: null,
              status: dataSource.status,
              schemaJson: backfilledSchemaJson,
              qualityReport: backfilledQualityReportJson,
              createdAt: new Date().toISOString()
            };

        if (latestSnapshot) {
          await prisma.schemaSnapshot.update({
            where: { id: latestSnapshot.id },
            data: {
              schemaJson: backfilledSchemaJson as Prisma.InputJsonValue,
              qualityReport: backfilledQualityReportJson as Prisma.InputJsonValue
            }
          }).catch((error) => {
            console.warn("[data-sources.schema] failed to persist schema backfill", {
              dataSourceId: dataSource.id,
              schemaSnapshotId: latestSnapshot.id,
              message: error instanceof Error ? error.message : "Unknown schema backfill persistence error"
            });
          });
        }

        await prisma.dataSourceConnection.update({
          where: { id: dataSource.id },
          data: {
            schemas: responseSchema as Prisma.InputJsonValue
          }
        }).catch((error) => {
          console.warn("[data-sources.schema] failed to persist data source schema backfill", {
            dataSourceId: dataSource.id,
            message: error instanceof Error ? error.message : "Unknown data source schema persistence error"
          });
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: dataSource.id,
        name: dataSource.name,
        provider: dataSource.provider,
        type: dataSource.type,
        status: dataSource.status,
        updatedAt: dataSource.updatedAt.toISOString()
      },
      schema: responseSchema,
      snapshot: responseSnapshot,
      performance: {
        durationMs: Date.now() - startedAt,
        source: "schema_endpoint"
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to load data source schema");
  }
}
