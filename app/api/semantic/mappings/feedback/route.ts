import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrismaSemanticMemoryStore } from "@/lib/semantic/memory";
import type { CanonicalConcept, SemanticFeedbackEvent } from "@/lib/semantic/types";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const CANONICAL_CONCEPTS = new Set<CanonicalConcept>([
  "revenue",
  "order_id",
  "order_date",
  "sku",
  "product_name",
  "product_id",
  "customer_id",
  "email_hash",
  "country",
  "ad_spend",
  "campaign_id",
  "adset_id",
  "ad_id",
  "impressions",
  "clicks",
  "conversions",
  "attribution_revenue",
  "event_date",
  "conversion_event",
  "refund_amount",
  "refund_id",
  "refund_reason",
  "quantity",
  "price",
  "status",
  "currency",
  "unknown"
]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalConcept(value: unknown): CanonicalConcept | null {
  const candidate = stringValue(value) as CanonicalConcept;

  return CANONICAL_CONCEPTS.has(candidate) ? candidate : null;
}

function feedbackValue(value: unknown): SemanticFeedbackEvent["feedback"] | null {
  if (value === "confirm" || value === "edit" || value === "reject") {
    return value;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const dataSourceId = stringValue(payload?.dataSourceId);
    const fieldName = stringValue(payload?.fieldName);
    const platform = stringValue(payload?.platform) || "*";
    const correctedMapping = canonicalConcept(payload?.correctedMapping);
    const previousMapping = canonicalConcept(payload?.previousMapping);
    const feedback = feedbackValue(payload?.feedback);

    if (!dataSourceId) {
      return NextResponse.json({ ok: false, message: "dataSourceId is required" }, { status: 400 });
    }

    if (!fieldName) {
      return NextResponse.json({ ok: false, message: "fieldName is required" }, { status: 400 });
    }

    if (!correctedMapping) {
      return NextResponse.json({ ok: false, message: "correctedMapping is invalid" }, { status: 400 });
    }

    if (!feedback) {
      return NextResponse.json({ ok: false, message: "feedback is invalid" }, { status: 400 });
    }

    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id: dataSourceId,
        workspaceId: session.workspace.id
      },
      select: {
        id: true,
        provider: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    const memory = new PrismaSemanticMemoryStore(prisma, { workspaceId: session.workspace.id });
    const record = await memory.applyFeedback({
      field_name: fieldName,
      platform: platform || dataSource.provider.toLowerCase(),
      previous_mapping: previousMapping ?? undefined,
      corrected_mapping: correctedMapping,
      feedback,
      metadata: {
        dataSourceId: dataSource.id,
        provider: dataSource.provider,
        confirmedByUserId: session.user.id,
        source: "connected_source_mapping_review"
      }
    });

    return NextResponse.json({
      ok: true,
      mapping: {
        fieldName: record.field_name,
        platform: record.platform,
        mappedConcept: record.mapped_concept,
        confidence: record.confidence_score,
        usageCount: record.usage_count,
        userFeedbackScore: record.user_feedback_score
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to save semantic mapping feedback");
  }
}
