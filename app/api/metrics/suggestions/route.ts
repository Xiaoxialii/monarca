import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

type SelectedField = {
  key: string;
  table: string;
  schema?: string | null;
  name: string;
  type?: string | null;
};

function asField(value: unknown): SelectedField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.table !== "string" || typeof record.name !== "string") {
    return null;
  }

  return {
    key: typeof record.key === "string" ? record.key : `${record.table}.${record.name}`,
    table: record.table,
    schema: typeof record.schema === "string" ? record.schema : null,
    name: record.name,
    type: typeof record.type === "string" ? record.type : null
  };
}

function safeIdentifier(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "field";
}

function qualifiedField(field: SelectedField) {
  return `${field.schema ? `${field.schema}.` : ""}${field.table}.${safeIdentifier(field.name)}`;
}

function isNumericField(field: SelectedField) {
  const name = field.name.toLowerCase();
  const type = (field.type ?? "").toLowerCase();

  return (
    ["int", "decimal", "double", "float", "number", "numeric"].some((keyword) => type.includes(keyword)) ||
    ["amount", "score", "polarity", "subjectivity", "rating", "price", "cost", "revenue"].some((keyword) =>
      name.includes(keyword)
    )
  );
}

function makeSuggestions(fields: SelectedField[]) {
  const primaryField = fields[0];
  const numericField = fields.find(isNumericField);
  const labelField = fields.find((field) => /sentiment|status|category|type|label/i.test(field.name));
  const textField = fields.find((field) => /review|comment|text|feedback|message/i.test(field.name));
  const dimensionField = fields.find((field) => /app|product|country|channel|source|segment/i.test(field.name));
  const suggestions = [];

  if (numericField) {
    suggestions.push({
      id: "average-value",
      title: `Average ${numericField.name}`,
      category: "Performance",
      layer: "DRIVER",
      definition: `Track the average value of ${numericField.name} as a business signal`,
      formula: `AVG(${qualifiedField(numericField)})`,
      optimization: "适合观察趋势变化、异常波动和不同维度下的表现差异",
      tags: ["AI Suggested", "Average"],
      sourceFields: [numericField]
    });
  }

  if (labelField) {
    suggestions.push({
      id: "label-rate",
      title: `${labelField.name} Rate`,
      category: "Classification",
      layer: "DRIVER",
      definition: `Measure the share of records matching a target ${labelField.name} value`,
      formula: `SAFE_DIVIDE(COUNT_IF(${qualifiedField(labelField)} = target), COUNT_NON_EMPTY(${qualifiedField(labelField)}))`,
      optimization: "适合把分类字段变成可监控比例，例如正向情绪占比、成功状态占比或重点类别占比",
      tags: ["AI Suggested", "Rate"],
      sourceFields: [labelField]
    });
  }

  if (textField ?? primaryField) {
    const field = textField ?? primaryField;
    suggestions.push({
      id: "record-volume",
      title: `${field.name} Volume`,
      category: "Volume",
      layer: "PRIMARY",
      definition: `Count records based on ${field.name}`,
      formula: `COUNT_NON_EMPTY(${qualifiedField(field)})`,
      optimization: "适合作为基础业务量指标，用于判断数据规模、活跃度或反馈量变化",
      tags: ["AI Suggested", "Volume"],
      sourceFields: [field]
    });
  }

  if (dimensionField && numericField) {
    suggestions.push({
      id: "dimension-average",
      title: `${numericField.name} by ${dimensionField.name}`,
      category: "Diagnostic",
      layer: "DIAGNOSTIC",
      definition: `Compare ${numericField.name} across ${dimensionField.name}`,
      formula: `AVG(${qualifiedField(numericField)}) BY ${qualifiedField(dimensionField)}`,
      optimization: "适合做归因分析，帮助发现哪个产品、渠道、地区或用户群体拉动变化",
      tags: ["AI Suggested", "Diagnostic"],
      sourceFields: [numericField, dimensionField]
    });
  }

  return suggestions.slice(0, 3);
}

export async function POST(request: Request) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const fields = Array.isArray(payload?.fields)
      ? payload.fields.flatMap((field) => {
          const parsed = asField(field);
          return parsed ? [parsed] : [];
        })
      : [];

    if (fields.length === 0) {
      return NextResponse.json({ ok: false, message: "Select at least one field" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      suggestions: makeSuggestions(fields)
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to generate metric suggestions");
  }
}
