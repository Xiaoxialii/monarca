import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDatabaseConfig, type SupportedDatabaseType } from "@/lib/database-connection-config";
import { introspectDatabase } from "@/lib/database-introspection";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { storedSecret } from "@/lib/secret-crypto";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dataSourceTypeToDatabaseType(type: DataSourceType): SupportedDatabaseType | null {
  if (type === DataSourceType.POSTGRESQL) {
    return "postgresql";
  }

  return null;
}

function publicConfig(config: ReturnType<typeof resolveDatabaseConfig>) {
  return {
    type: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.ssl
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    const type = dataSourceTypeToDatabaseType(dataSource.type);

    if (!type) {
      return NextResponse.json({ ok: false, message: "Only PostgreSQL data sources can be rescanned" }, { status: 400 });
    }

    const savedConfig = asRecord(dataSource.config);
    const config = resolveDatabaseConfig(type, {
      host: savedConfig?.host,
      port: savedConfig?.port,
      database: savedConfig?.database,
      username: savedConfig?.username,
      password: storedSecret(savedConfig?.password, savedConfig?.passwordEncrypted),
      ssl: savedConfig?.ssl
    });

    const tables = await introspectDatabase(config);
    const scannedAt = new Date().toISOString();
    const semanticLayer = buildSemanticLayer(tables);
    const schemaPayload = {
      scannedAt,
      tables,
      semanticLayer
    };
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);

    const result = await prisma.$transaction(async (tx) => {
      await clearWorkspaceReportCaches(tx, session.workspace.id);

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

      const updatedSource = await tx.dataSourceConnection.update({
        where: {
          id: dataSource.id
        },
        data: {
          status: ConnectionStatus.CONNECTED,
          config: {
            ...savedConfig,
            ...publicConfig(config)
          },
          schemas: schemaPayload,
          lastSyncAt: new Date(),
          lastErrorMessage: null
        }
      });

      const schemaSnapshot = await tx.schemaSnapshot.create({
        data: {
          workspaceId: session.workspace.id,
          dataSourceId: updatedSource.id,
          version: (latestSnapshot?.version ?? 0) + 1,
          status: ConnectionStatus.CONNECTED,
          schemaJson: {
            sourceId: updatedSource.id,
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

      const metricGeneration = await generateWorkspaceMetricsFromConnectedSources(tx, {
        workspaceId: session.workspace.id,
        userId: session.user.id
      });

      return { updatedSource, schemaSnapshot, generatedMetricCount: metricGeneration.generatedMetricCount };
    });

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: result.updatedSource.id,
        name: result.updatedSource.name,
        provider: result.updatedSource.provider,
        type: result.updatedSource.type,
        status: result.updatedSource.status,
        connectionMode: result.updatedSource.connectionMode,
        authMethod: result.updatedSource.authMethod,
        config: publicConfig(config),
        schema: {
          tableCount: tables.length,
          columnCount,
          scannedAt,
          tables,
          semanticLayer
        },
        connectedAt: result.updatedSource.connectedAt?.toISOString() ?? null,
        lastSyncAt: result.updatedSource.lastSyncAt?.toISOString() ?? null
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
        message: error instanceof Error ? error.message : "Schema rescan failed"
      },
      { status: 400 }
    );
  }
}
