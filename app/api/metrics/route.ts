import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSemanticLayer, generateSemanticMetrics } from "@/lib/semantic-layer";
import { requireWorkspace, requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { WorkspaceRole } from "@prisma/client";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mappingLabel(mappingJson: unknown) {
  const mapping = asRecord(mappingJson);
  const sourceFields = Array.isArray(mapping?.sourceFields) ? mapping.sourceFields : [];
  const labels = sourceFields.flatMap((field) => {
    const fieldRecord = asRecord(field);
    const table = typeof fieldRecord?.table === "string" ? fieldRecord.table : "";
    const name = typeof fieldRecord?.field === "string" ? fieldRecord.field : "";

    return table && name ? [`${table}.${name}`] : [];
  });

  return labels.length > 0 ? labels.join(" + ") : "Waiting for source mapping";
}

function toTables(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema?.tables) ? schema.tables : [];

  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const name = typeof tableRecord?.name === "string" ? tableRecord.name : "";

    if (!name) {
      return [];
    }

    const columns = Array.isArray(tableRecord?.columns) ? tableRecord.columns : [];

    return [{
      name,
      schema: typeof tableRecord?.schema === "string" ? tableRecord.schema : undefined,
      columns: columns.flatMap((column) => {
        const columnRecord = asRecord(column);
        const columnName = typeof columnRecord?.name === "string" ? columnRecord.name : "";

        if (!columnName) {
          return [];
        }

        return [{
          name: columnName,
          type: typeof columnRecord?.type === "string" ? columnRecord.type : "unknown",
          nullable: typeof columnRecord?.nullable === "boolean" ? columnRecord.nullable : true
        }];
      })
    }];
  });
}

export async function GET() {
  try {
    const session = await requireWorkspace();
    let metrics = await prisma.metricDefinition.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true
      },
      include: {
        maintainedByUser: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { layer: "asc" },
        { createdAt: "asc" }
      ]
    });

    if (
      metrics.length === 0 &&
      (session.membership.role === WorkspaceRole.OWNER || session.membership.role === WorkspaceRole.ADMIN)
    ) {
      const latestSnapshot = await prisma.schemaSnapshot.findFirst({
        where: {
          workspaceId: session.workspace.id
        },
        orderBy: {
          version: "desc"
        }
      });

      if (latestSnapshot) {
        const tables = toTables(latestSnapshot.schemaJson);
        const semanticLayer = buildSemanticLayer(tables);
        const generatedMetricCount = await generateSemanticMetrics(prisma, {
          workspaceId: session.workspace.id,
          userId: session.user.id,
          semanticLayer
        });

        await prisma.schemaSnapshot.update({
          where: {
            id: latestSnapshot.id
          },
          data: {
            schemaJson: {
              ...(asRecord(latestSnapshot.schemaJson) ?? {}),
              semanticLayer
            },
            qualityReport: {
              ...(asRecord(latestSnapshot.qualityReport) ?? {}),
              semanticFieldCount: semanticLayer.fields.length,
              businessEntityCount: semanticLayer.entities.length,
              generatedMetricCount
            }
          }
        });

        metrics = await prisma.metricDefinition.findMany({
          where: {
            workspaceId: session.workspace.id,
            isActive: true
          },
          include: {
            maintainedByUser: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: [
            { layer: "asc" },
            { createdAt: "asc" }
          ]
        });
      }
    }

    return NextResponse.json({
      ok: true,
      metrics: metrics.map((metric) => ({
        id: metric.id,
        layer: metric.layer,
        category: metric.category,
        metric: metric.name,
        definition: metric.definition,
        formula: metric.formula,
        mapping: mappingLabel(metric.mappingJson),
        status: metric.maintainerRole === "AI"
          ? "AI"
          : metric.maintainedByUser?.name || metric.maintainedByUser?.email || metric.maintainerRole,
        metricStatus: metric.status,
        tags: asStringArray(metric.tagsJson)
      }))
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to load metrics" }, { status: 400 });
  }
}

export async function POST() {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        version: "desc"
      }
    });

    if (!latestSnapshot) {
      return NextResponse.json({ ok: false, message: "No schema snapshot found" }, { status: 404 });
    }

    const tables = toTables(latestSnapshot.schemaJson);
    const semanticLayer = buildSemanticLayer(tables);
    const generatedMetricCount = await generateSemanticMetrics(prisma, {
      workspaceId: session.workspace.id,
      userId: session.user.id,
      semanticLayer
    });

    await prisma.schemaSnapshot.update({
      where: {
        id: latestSnapshot.id
      },
      data: {
        schemaJson: {
          ...(asRecord(latestSnapshot.schemaJson) ?? {}),
          semanticLayer
        },
        qualityReport: {
          ...(asRecord(latestSnapshot.qualityReport) ?? {}),
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount
        }
      }
    });

    return NextResponse.json({
      ok: true,
      generatedMetricCount,
      semanticFieldCount: semanticLayer.fields.length,
      businessEntityCount: semanticLayer.entities.length
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to generate metrics" }, { status: 400 });
  }
}
