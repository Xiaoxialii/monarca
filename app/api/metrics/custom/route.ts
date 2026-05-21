import {
  MetricExpressionType,
  MetricLayer,
  MetricMaintainerRole,
  MetricStatus,
  WorkspaceRole
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toLayer(value: unknown) {
  if (value === "PRIMARY") return MetricLayer.PRIMARY;
  if (value === "DRIVER") return MetricLayer.DRIVER;
  if (value === "DIAGNOSTIC") return MetricLayer.DIAGNOSTIC;
  return MetricLayer.DRIVER;
}

function expressionTypeForFormula(formula: string) {
  if (formula.includes("/") || formula.includes(" BY ")) {
    return MetricExpressionType.CALCULATION;
  }

  if (formula.startsWith("COUNT_IF")) {
    return MetricExpressionType.RATE;
  }

  return MetricExpressionType.AGGREGATE;
}

function mappingLabel(sourceFields: unknown[]) {
  const labels = sourceFields.flatMap((field) => {
    const record = asRecord(field);
    const table = typeof record?.table === "string" ? record.table : "";
    const name = typeof record?.name === "string" ? record.name : "";
    return table && name ? [`${table}.${name}`] : [];
  });

  return labels.length > 0 ? labels.join(" + ") : "User selected fields";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const proposal = asRecord(payload?.proposal);

    if (!proposal) {
      return NextResponse.json({ ok: false, message: "Proposal is required" }, { status: 400 });
    }

    const title = typeof proposal.title === "string" ? proposal.title.trim() : "";
    const category = typeof proposal.category === "string" ? proposal.category.trim() : "Custom";
    const definition = typeof proposal.definition === "string" ? proposal.definition.trim() : "";
    const formula = typeof proposal.formula === "string" ? proposal.formula.trim() : "";
    const sourceFields = Array.isArray(proposal.sourceFields) ? proposal.sourceFields : [];
    const tags = Array.isArray(proposal.tags)
      ? proposal.tags.filter((tag): tag is string => typeof tag === "string")
      : ["User Added"];

    if (!title || !definition || !formula) {
      return NextResponse.json({ ok: false, message: "Metric title, definition, and formula are required" }, { status: 400 });
    }

    const metric = await prisma.metricDefinition.upsert({
      where: {
        workspaceId_name: {
          workspaceId: session.workspace.id,
          name: title
        }
      },
      create: {
        workspaceId: session.workspace.id,
        layer: toLayer(proposal.layer),
        category,
        name: title,
        definition,
        formula,
        expressionType: expressionTypeForFormula(formula),
        mappingJson: {
          sourceFields
        },
        lineageJson: {
          createdFrom: "user_metric_builder",
          optimization: typeof proposal.optimization === "string" ? proposal.optimization : null
        },
        maintainerRole: MetricMaintainerRole.USER,
        maintainerUserId: session.user.id,
        status: MetricStatus.NEEDS_VALIDATION,
        tagsJson: [...new Set([...tags, "User Added"])]
      },
      update: {
        layer: toLayer(proposal.layer),
        category,
        definition,
        formula,
        expressionType: expressionTypeForFormula(formula),
        mappingJson: {
          sourceFields
        },
        lineageJson: {
          createdFrom: "user_metric_builder",
          optimization: typeof proposal.optimization === "string" ? proposal.optimization : null
        },
        maintainerRole: MetricMaintainerRole.USER,
        maintainerUserId: session.user.id,
        status: MetricStatus.NEEDS_VALIDATION,
        tagsJson: [...new Set([...tags, "User Added"])]
      }
    });

    return NextResponse.json({
      ok: true,
      metric: {
        id: metric.id,
        layer: metric.layer,
        category: metric.category,
        metric: metric.name,
        definition: metric.definition,
        formula: metric.formula,
        mapping: mappingLabel(sourceFields),
        status: session.user.name || session.user.email,
        metricStatus: metric.status,
        tags: Array.isArray(metric.tagsJson) ? metric.tagsJson : []
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to create metric" }, { status: 400 });
  }
}
