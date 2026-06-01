import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { apiErrorResponse } from "@/lib/api-errors";
import { isBusinessFacingMetricDefinition, isBusinessFacingMetricText } from "@/lib/metric-visibility";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function analysisReportFromSnapshot(snapshot: { schemaJson: unknown; qualityReport: unknown } | null) {
  if (!snapshot) {
    return null;
  }

  return asRecord(snapshot.qualityReport).analysisReport ?? asRecord(snapshot.schemaJson).analysisReport ?? null;
}

function filterBriefingMetricResults(
  briefing: Awaited<ReturnType<typeof prisma.dailyBriefing.findFirst>>,
  visibleMetricIds: Set<string>,
  visibleMetricsById: Map<string, {
    id: string;
    name: string;
    formula: string;
    status: string;
    maintainerRole: string;
    mappingJson: unknown;
  }>
) {
  if (!briefing) {
    return null;
  }

  const payloadJson = asRecord(briefing.payloadJson);
  const metricResults = Array.isArray(payloadJson.metricResults) ? payloadJson.metricResults : null;

  if (!metricResults) {
    return briefing;
  }

  return {
    ...briefing,
    payloadJson: {
      ...payloadJson,
      metricResults: metricResults.filter((result) => {
        const record = asRecord(result);
        const metricId = typeof record.metricId === "string" ? record.metricId : "";
        const metric = visibleMetricsById.get(metricId);

        return Boolean(
          metricId &&
          visibleMetricIds.has(metricId) &&
          isBusinessFacingMetricText([
            typeof record.metricName === "string" ? record.metricName : undefined,
            typeof record.displayName === "string" ? record.displayName : undefined,
            typeof record.formula === "string" ? record.formula : undefined,
            typeof record.metricCategory === "string" ? record.metricCategory : undefined,
            typeof record.sourceDataset === "string" ? record.sourceDataset : undefined
          ]) &&
          (!metric || isBusinessFacingMetricDefinition(metric))
        );
      })
    }
  };
}

export async function GET() {
  try {
    const session = await syncCurrentClerkUser();

    if (!session) {
      return NextResponse.json({ hasData: false, briefing: null, insights: [], recommendations: [] }, { status: 401 });
    }

    const briefing = await prisma.dailyBriefing.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        briefingDate: "desc"
      },
      include: {
        insights: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            recommendations: {
              orderBy: {
                createdAt: "desc"
              }
            }
          }
        }
      }
    });

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        schemaJson: true,
        qualityReport: true
      }
    });
    const metrics = await prisma.metricDefinition.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        formula: true,
        status: true,
        maintainerRole: true,
        mappingJson: true
      }
    });
    const businessMetrics = metrics.filter((metric) => isBusinessFacingMetricDefinition(metric));
    const visibleMetricIds = new Set(businessMetrics.map((metric) => metric.id));
    const visibleMetricsById = new Map(businessMetrics.map((metric) => [metric.id, metric]));
    const visibleBriefing = filterBriefingMetricResults(briefing, visibleMetricIds, visibleMetricsById);
    const insights = briefing?.insights ?? [];
    const recommendations = insights.flatMap((insight) => insight.recommendations);

    return NextResponse.json({
      workspaceId: session.workspace.id,
      hasData: Boolean(briefing || insights.length || recommendations.length),
      briefing: visibleBriefing,
      insights,
      recommendations,
      analysisReport: analysisReportFromSnapshot(latestSnapshot)
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load report data");
  }
}
