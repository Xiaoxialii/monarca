import { MetricExpressionType, MetricStatus, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  tablesFromSchemaJson,
  validateWorkspaceMetrics,
  validationFromLineage
} from "@/lib/metric-validation";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

function expressionTypeForFormula(formula: string) {
  if (formula.includes("/") || formula.includes(" BY ")) {
    return MetricExpressionType.CALCULATION;
  }

  if (formula.startsWith("COUNT_IF")) {
    return MetricExpressionType.RATE;
  }

  return MetricExpressionType.AGGREGATE;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const payload = (await request.json().catch(() => null)) as {
      formula?: unknown;
      applySuggestion?: unknown;
    } | null;
    const metric = await prisma.metricDefinition.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: true
      }
    });

    if (!metric) {
      return NextResponse.json({ ok: false, message: "Metric not found" }, { status: 404 });
    }

    const validation = validationFromLineage(metric.lineageJson);
    const nextFormula = payload?.applySuggestion
      ? validation?.suggested_formula
      : typeof payload?.formula === "string"
        ? payload.formula.trim()
        : "";

    if (!nextFormula) {
      return NextResponse.json({ ok: false, message: "Formula is required" }, { status: 400 });
    }

    await prisma.metricDefinition.update({
      where: {
        id: metric.id
      },
      data: {
        formula: nextFormula,
        expressionType: expressionTypeForFormula(nextFormula),
        status: MetricStatus.NEEDS_VALIDATION
      }
    });

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        version: "desc"
      }
    });

    if (latestSnapshot) {
      await validateWorkspaceMetrics(prisma, {
        workspaceId: session.workspace.id,
        tables: tablesFromSchemaJson(latestSnapshot.schemaJson),
        metricIds: [metric.id]
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to update metric");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const metric = await prisma.metricDefinition.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: true
      },
      select: {
        id: true
      }
    });

    if (!metric) {
      return NextResponse.json({ ok: false, message: "Metric not found" }, { status: 404 });
    }

    await prisma.metricDefinition.update({
      where: {
        id
      },
      data: {
        isActive: false
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to delete metric");
  }
}
