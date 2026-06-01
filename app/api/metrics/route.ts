import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationFromLineage } from "@/lib/metric-validation";
import { requireWorkspace, requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { WorkspaceRole } from "@prisma/client";
import { apiErrorResponse } from "@/lib/api-errors";
import { metricBelongsToTables } from "@/lib/metric-visibility";
import {
  generateWorkspaceMetricsFromConnectedSources,
  getConnectedWorkspaceSchemaContext
} from "@/lib/workspace-metric-generation";

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
    const name = typeof fieldRecord?.displayField === "string"
      ? fieldRecord.displayField
      : typeof fieldRecord?.field === "string"
        ? fieldRecord.field
        : "";

    return table && name ? [`${table}.${name}`] : [];
  });

  return labels.length > 0 ? labels.join(" + ") : "Waiting for source mapping";
}

function tableLabel(table: { name: string; schema?: string | null }) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

export async function GET() {
  try {
    const session = await requireWorkspace();
    const { primarySnapshot, tables: latestTables } = await getConnectedWorkspaceSchemaContext(prisma, session.workspace.id);
    const activeTableLabels = new Set(latestTables.map(tableLabel));
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
    let visibleMetrics = metrics.filter((metric) => metricBelongsToTables(metric, activeTableLabels));

    if (
      visibleMetrics.length === 0 &&
      (session.membership.role === WorkspaceRole.OWNER || session.membership.role === WorkspaceRole.ADMIN)
    ) {
      if (primarySnapshot) {
        const result = await generateWorkspaceMetricsFromConnectedSources(prisma, {
          workspaceId: session.workspace.id,
          userId: session.user.id
        });
        const refreshedTableLabels = new Set(result.tables.map(tableLabel));

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
        visibleMetrics = metrics.filter((metric) => metricBelongsToTables(metric, refreshedTableLabels));
      }
    }

    return NextResponse.json({
      ok: true,
      metrics: visibleMetrics.map((metric) => ({
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
        tags: asStringArray(metric.tagsJson),
        validation: validationFromLineage(metric.lineageJson)
      }))
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to load metrics");
  }
}

export async function POST() {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const result = await generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId: session.workspace.id,
      userId: session.user.id
    });

    if (!result.primarySnapshot || !result.semanticLayer) {
      return NextResponse.json({ ok: false, message: "No schema snapshot found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      generatedMetricCount: result.generatedMetricCount,
      validationResults: result.validationResults,
      semanticFieldCount: result.semanticLayer.fields.length,
      businessEntityCount: result.semanticLayer.entities.length
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to generate metrics");
  }
}
