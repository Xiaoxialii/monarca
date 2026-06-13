import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";
import {
  databasePresetIncompleteMessage,
  missingRequiredDatabaseConfigFields,
  normalizeDatabaseType,
  resolveDatabaseConfig
} from "@/lib/database-connection-config";
import { introspectDatabase } from "@/lib/database-introspection";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, details: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...details }, { status });
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const type = normalizeDatabaseType(payload?.type);

    if (!type) {
      return jsonError("UNSUPPORTED_DATABASE_TYPE: 当前暂不支持该数据库类型。");
    }

    const config = resolveDatabaseConfig(type, payload);
    const missingFields = missingRequiredDatabaseConfigFields(config);

    if (missingFields.length > 0) {
      return jsonError(
        databasePresetIncompleteMessage(type, missingFields),
        400,
        {
          code: "DATABASE_PRESET_INCOMPLETE",
          missingFields
        }
      );
    }

    const tables = await introspectDatabase(config);
    const semanticLayer = buildSemanticLayer(tables);
    const provider = type === "mysql" ? "MySQL" : "PostgreSQL";
    const dataSourceType = type === "mysql" ? DataSourceType.MYSQL : DataSourceType.POSTGRESQL;
    const schemaPayload = {
      type,
      database: config.database,
      host: config.host,
      port: config.port,
      tableCount: tables.length,
      tables,
      semanticLayer
    };

    const dataSource = await prisma.dataSourceConnection.create({
      data: {
        workspaceId: session.workspace.id,
        type: dataSourceType,
        name: `${provider} · ${config.database}`,
        provider,
        status: ConnectionStatus.CONNECTED,
        connectionMode: "server-preset",
        authMethod: "database",
        config: {
          host: config.host,
          port: config.port,
          database: config.database,
          ssl: config.ssl
        },
        schemas: schemaPayload,
        connectedAt: new Date(),
        lastSyncAt: new Date()
      }
    });

    const lastSnapshot = await prisma.schemaSnapshot.findFirst({
      where: { workspaceId: session.workspace.id },
      orderBy: { version: "desc" },
      select: { version: true }
    });

    await prisma.schemaSnapshot.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id,
        version: (lastSnapshot?.version ?? 0) + 1,
        status: ConnectionStatus.CONNECTED,
        schemaJson: schemaPayload,
        qualityReport: {
          tableCount: tables.length,
          columnCount: tables.reduce((total, table) => total + table.columns.length, 0),
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount: semanticLayer.metrics.length,
          generatedAt: new Date().toISOString()
        }
      }
    });

    await generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId: session.workspace.id,
      userId: session.user.id
    });

    return NextResponse.json({
      ok: true,
      message: "Schema scanned",
      dataSourceId: dataSource.id,
      schema: schemaPayload,
      semanticLayer
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return apiErrorResponse(error, "Schema scan failed");
  }
}
