import { NextResponse } from "next/server";
import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import {
  normalizeDatabaseType,
  publicDatabaseConfig,
  resolveDatabaseConfig
} from "@/lib/database-connection-config";
import { introspectDatabase, testDatabaseConnection } from "@/lib/database-introspection";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { generateUniversalDataAnalysisReport } from "@/lib/report-generation/universal-report-generator";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { encryptSecret } from "@/lib/secret-crypto";
import { apiErrorResponse } from "@/lib/api-errors";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const type = normalizeDatabaseType(payload?.type);

    if (!type) {
      return jsonError("Database type must be postgresql");
    }

    const config = resolveDatabaseConfig(type, payload);

    if (!config.host || !config.database || !config.username) {
      return jsonError(
        "Database preset is incomplete. Configure host, database, and username on the server or provide them as overrides."
      );
    }

    await testDatabaseConnection(config);
    const tables = await introspectDatabase(config);
    const provider = "PostgreSQL";
    const publicConfig = publicDatabaseConfig(config);
    const semanticLayer = buildSemanticLayer(tables);
    const analysisReport = generateUniversalDataAnalysisReport(tables);

    const result = await prisma.$transaction(async (tx) => {
      await clearWorkspaceReportCaches(tx, session.workspace.id);

      const dataSource = await tx.dataSourceConnection.create({
        data: {
          workspaceId: session.workspace.id,
          type: DataSourceType.POSTGRESQL,
          name: `${provider} - ${config.database}`,
          provider,
          isActive: true,
          status: ConnectionStatus.CONNECTED,
          connectionMode: typeof payload?.mode === "string" ? payload.mode : "Import",
          authMethod: "Database",
          config: {
            ...publicConfig,
            username: config.username,
            passwordEncrypted: encryptSecret(config.password),
            passwordStored: Boolean(config.password)
          },
          schemas: {
            scannedAt: new Date().toISOString(),
            tables,
            semanticLayer,
            analysisReport
          },
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
            scannedAt: new Date().toISOString(),
            tables,
            semanticLayer,
            analysisReport
          },
          qualityReport: {
            tableCount: tables.length,
            columnCount: tables.reduce((sum, table) => sum + table.columns.length, 0),
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
        config: publicConfig,
        schema: {
          tableCount: tables.length,
          columnCount: tables.reduce((sum, table) => sum + table.columns.length, 0),
          scannedAt: new Date().toISOString(),
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
        columnCount: tables.reduce((sum, table) => sum + table.columns.length, 0),
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

    return apiErrorResponse(error, "Connection import failed");
  }
}
