import { NextResponse } from "next/server";
import { ConnectionStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { clearWorkspaceReportCaches } from "@/lib/report-cache-invalidation";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function schemaTableLabels(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];
  const labels = new Set<string>();

  for (const table of tables) {
    const record = asRecord(table);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const schemaName = typeof record.schema === "string" ? record.schema.trim() : "";

    if (!name) continue;
    labels.add(name);
    if (schemaName) labels.add(`${schemaName}.${name}`);
  }

  return Array.from(labels);
}

function normalizeMetricReferenceText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`"']/g, "")
    .replace(/\s+/g, " ");
}

function metricReferencesAnyTable(metric: {
  formula: string;
  lineageJson: unknown;
  mappingJson: unknown;
}, tableLabels: string[]) {
  const haystack = normalizeMetricReferenceText([
    metric.formula,
    JSON.stringify(metric.lineageJson ?? {}),
    JSON.stringify(metric.mappingJson ?? {})
  ].join(" "));

  return tableLabels.some((label) => haystack.includes(normalizeMetricReferenceText(label)));
}

async function deactivateMetricsForDataSource(workspaceId: string, dataSourceId: string) {
  const latestSnapshot = await prisma.schemaSnapshot.findFirst({
    where: {
      workspaceId,
      dataSourceId
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      schemaJson: true
    }
  });
  const tableLabels = schemaTableLabels(latestSnapshot?.schemaJson);

  if (!tableLabels.length) {
    return 0;
  }

  const activeMetrics = await prisma.metricDefinition.findMany({
    where: {
      workspaceId,
      isActive: true
    },
    select: {
      id: true,
      formula: true,
      lineageJson: true,
      mappingJson: true
    }
  });
  const metricIds = activeMetrics
    .filter((metric) => metricReferencesAnyTable(metric, tableLabels))
    .map((metric) => metric.id);

  if (!metricIds.length) {
    return 0;
  }

  const result = await prisma.metricDefinition.updateMany({
    where: {
      workspaceId,
      id: {
        in: metricIds
      }
    },
    data: {
      isActive: false
    }
  });

  return result.count;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const payload = asRecord(await request.json().catch(() => null));

    if (payload.action !== "restore") {
      return NextResponse.json({ ok: false, message: "Unsupported data source action" }, { status: 400 });
    }

    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: false
      },
      select: {
        id: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Deleted data source not found" }, { status: 404 });
    }

    const restoredDataSource = await prisma.dataSourceConnection.update({
      where: {
        id: dataSource.id
      },
      data: {
        isActive: true,
        status: ConnectionStatus.CONNECTED
      },
      select: {
        id: true,
        isActive: true,
        status: true
      }
    });
    await clearWorkspaceReportCaches(prisma, session.workspace.id);

    return NextResponse.json({ ok: true, dataSource: restoredDataSource });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to restore data source");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const url = new URL(request.url);
    const permanent = url.searchParams.get("permanent") === "true";

    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        ...(permanent ? { isActive: false } : { isActive: true })
      },
      select: {
        id: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    const deactivatedMetricCount = await deactivateMetricsForDataSource(session.workspace.id, dataSource.id);

    if (permanent) {
      await prisma.dataSourceConnection.delete({
        where: {
          id: dataSource.id
        }
      });
      await clearWorkspaceReportCaches(prisma, session.workspace.id);

      return NextResponse.json({ ok: true, dataSource: { id: dataSource.id, permanentlyDeleted: true }, deactivatedMetricCount });
    }

    const removedDataSource = await prisma.dataSourceConnection.update({
      where: {
        id: dataSource.id
      },
      data: {
        isActive: false,
        status: ConnectionStatus.DISCONNECTED
      },
      select: {
        id: true,
        isActive: true,
        status: true
      }
    });
    await clearWorkspaceReportCaches(prisma, session.workspace.id);

    return NextResponse.json({ ok: true, dataSource: removedDataSource, deactivatedMetricCount });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to remove data source");
  }
}
