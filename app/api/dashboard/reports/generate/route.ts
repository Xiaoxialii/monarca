import { NextResponse } from "next/server";
import { RecommendationStatus, UsageActionType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAggregationResults } from "@/lib/analytics/aggregation-engine";
import { apiErrorResponse } from "@/lib/api-errors";
import { checkUserEntitlement, consumeCredit, EntitlementError } from "@/lib/entitlements";
import { computeMetricResultsForContexts, type MetricResultValue } from "@/lib/metric-results";
import { buildMockAiBrief } from "@/lib/report-generation/ai-brief-generator";
import { contextualMetricName } from "@/lib/report-generation/metric-name-normalizer";
import { buildReportPrompt } from "@/lib/report-generation/report-prompt-builder";
import { buildStructuredAiReport } from "@/lib/report-generation/report-section-builder";
import type { AggregationResult } from "@/lib/report-generation/report-types";
import { buildSemanticLayer, generateSemanticMetrics } from "@/lib/semantic-layer";
import {
  hasDisplayableMetricResult,
  hasDisplayableMetricValue,
  isBusinessFacingMetricText,
  isBusinessFacingMetricDefinition,
  isGlobalBusinessMetricResult,
  metricBelongsToTables
} from "@/lib/metric-visibility";
import {
  tablesFromSchemaJson,
  validateWorkspaceMetrics,
  validationFromLineage
} from "@/lib/metric-validation";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatValue(value: unknown) {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value == null ? "-" : String(value);
}

function compactText(value: unknown, maxLength = 180) {
  const text = value == null ? "" : String(value).replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function trendDirection(currentValue: number | null, previousValue: number | null) {
  if (currentValue == null || previousValue == null || previousValue === 0) return "unknown";
  const deltaPercent = (currentValue - previousValue) / Math.abs(previousValue);

  if (Math.abs(deltaPercent) < 0.01) return "flat";
  return deltaPercent > 0 ? "up" : "down";
}

function buildReportTimeArtifacts(aggregationResults: AggregationResult[]) {
  const timeTrends = aggregationResults.flatMap((aggregation) =>
    aggregation.timeTrends.map((trend) => ({ aggregation, trend }))
  );

  if (timeTrends.length === 0) {
    return {
      timeConfig: {
        hasTimeField: false,
        availableTimeFields: [],
        selectedRange: "ALL",
        granularity: "month"
      },
      trendMetrics: [],
      trendCharts: []
    };
  }

  const periods = timeTrends.flatMap(({ trend }) => trend.rows.map((row) => new Date(row.period)));
  const validPeriods = periods.filter((date) => Number.isFinite(date.getTime())).sort((left, right) => left.getTime() - right.getTime());
  const spanDays = validPeriods.length > 1 ? (validPeriods.at(-1)!.getTime() - validPeriods[0].getTime()) / 86_400_000 : 0;
  const hasFinanceTrend = timeTrends.some(({ aggregation }) => aggregation.businessType === "finance_timeseries");
  const defaultRange = hasFinanceTrend ? "12M" : spanDays >= 30 ? "30D" : "ALL";
  const firstTrend = timeTrends[0]?.trend;
  const trendMetrics = timeTrends.map(({ aggregation, trend }) => {
    const last = trend.rows.at(-1)?.value ?? null;
    const previous = trend.rows.at(-2)?.value ?? null;
    const absoluteChange = last != null && previous != null ? last - previous : null;
    const percentChange = absoluteChange != null && previous ? absoluteChange / Math.abs(previous) : null;

    return {
      metricName: trend.metric,
      businessModule: aggregation.businessType,
      dateField: trend.dateField,
      granularity: trend.bucket,
      currentValue: last,
      previousValue: previous,
      absoluteChange,
      percentChange,
      trendDirection: trendDirection(last, previous),
      timeSeries: trend.rows.map((row) => ({ date: row.period, value: row.value }))
    };
  });

  return {
    timeConfig: {
      hasTimeField: true,
      defaultTimeField: firstTrend?.dateField,
      availableTimeFields: Array.from(new Set(timeTrends.flatMap(({ trend }) => trend.dateField ? [trend.dateField] : []))),
      selectedRange: defaultRange,
      granularity: firstTrend?.bucket ?? "month"
    },
    trendMetrics,
    trendCharts: trendMetrics.slice(0, 5).map((metric) => ({
      title: `${contextualMetricName(metric.metricName, metric.metricName)} 趋势`,
      chartType: /volume|orders|reviews|installs|tickets|records/i.test(metric.metricName) ? "bar_chart" : "line_chart",
      xAxis: "date",
      yAxis: contextualMetricName(metric.metricName, metric.metricName),
      series: metric.timeSeries,
      description: "按业务时间字段展示核心指标变化。",
      insightHint: "用于识别增长、下滑和波动。"
    }))
  };
}

function tableKey(table: { name: string; schema?: string | null }) {
  return `${table.schema ?? ""}.${table.name}`.toLowerCase();
}

function activeTableLabels(tables: Array<{ name: string; schema?: string | null }>) {
  return new Set(tables.flatMap((table) => {
    const labels = [table.name];

    if (table.schema) {
      labels.push(`${table.schema}.${table.name}`);
    }

    return labels;
  }));
}

function uniqueTables(tables: ReturnType<typeof tablesFromSchemaJson>) {
  const seen = new Set<string>();

  return tables.filter((table) => {
    const key = tableKey(table);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildBriefSummary(results: MetricResultValue[]) {
  const computed = results.filter((result) =>
    result.status === "computed" &&
    !result.isInternalMetric &&
    !result.isDiagnosticMetric &&
    result.isBusinessMetric !== false &&
    isBusinessFacingMetricText([
      result.metricName,
      result.displayName,
      result.formula,
      result.metricCategory,
      result.sourceDataset
    ]) &&
    isGlobalBusinessMetricResult(result) &&
    hasDisplayableMetricValue(result.value)
  );
  const failed = results.filter((result) => result.status === "failed");

  if (computed.length === 0) {
    return "当前没有成功计算的指标。请确认数据库连接、指标校验状态和公式是否可执行。";
  }

  const highlights = computed.slice(0, 4).map((result) =>
    `${contextualMetricName(result.metricName, result.formula)} 为 ${formatValue(result.value)}`
  );

  return [
    `本次报告基于 ${computed.length} 个通过校验的指标生成`,
    ...highlights,
    failed.length > 0 ? `${failed.length} 个指标计算失败，已从报告结论中排除` : ""
  ].filter(Boolean).join("；");
}

function groupMetricResultsByType(results: MetricResultValue[]) {
  const computed = results.filter((result) => result.status === "computed" && hasDisplayableMetricResult(result));

  return {
    coreMetrics: computed.filter((result) => result.metricType === "core_metric"),
    comparisonMetrics: computed.filter((result) => result.metricType === "comparison_metric"),
    distributionMetrics: computed.filter((result) => result.metricType === "distribution_metric"),
    concentrationMetrics: computed.filter((result) => result.metricType === "concentration_metric"),
    trendMetrics: computed.filter((result) => result.metricType === "trend_metric"),
    groupComparisonMetrics: computed.filter((result) => result.metricType === "comparison_metric" && Array.isArray(result.rows) && result.rows.length > 0),
    riskMetrics: computed.filter((result) => result.metricType === "risk_metric"),
    warningMetrics: results.filter((result) =>
      Boolean(result.warning || result.isEstimated || result.requiresDeduplication) ||
      (result.status === "computed" && !hasDisplayableMetricResult(result))
    )
  };
}

export async function POST() {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await checkUserEntitlement(session.user.id, UsageActionType.GENERATE_REPORT);
    const dataSources = await prisma.dataSourceConnection.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true,
        status: "CONNECTED"
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    if (dataSources.length === 0) {
      return NextResponse.json(
        { ok: false, message: "No connected data source found for metric result execution" },
        { status: 400 }
      );
    }

    const snapshots = await prisma.schemaSnapshot.findMany({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: {
          in: dataSources.map((source) => source.id)
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const snapshotBySource = new Map<string, typeof snapshots[number]>();

    for (const snapshot of snapshots) {
      if (snapshot.dataSourceId && !snapshotBySource.has(snapshot.dataSourceId)) {
        snapshotBySource.set(snapshot.dataSourceId, snapshot);
      }
    }

    const contexts = dataSources.flatMap((dataSource) => {
      const snapshot = snapshotBySource.get(dataSource.id);

      if (!snapshot) {
        return [];
      }

      return [{
        dataSource,
        tables: tablesFromSchemaJson(snapshot.schemaJson),
        schemaJson: snapshot.schemaJson
      }];
    });

    if (contexts.length === 0) {
      return NextResponse.json({ ok: false, message: "No schema snapshot found for connected data sources" }, { status: 404 });
    }

    const latestSnapshot = snapshots[0];
    const tables = uniqueTables(contexts.flatMap((context) => context.tables));
    const semanticLayer = buildSemanticLayer(tables.map((table) => ({
      name: table.name,
      schema: table.schema ?? undefined,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type ?? "unknown",
        nullable: column.nullable ?? true
      }))
    })));
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
          ...asRecord(latestSnapshot.schemaJson),
          semanticLayer
        },
        qualityReport: {
          ...asRecord(latestSnapshot.qualityReport),
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount
        }
      }
    });

    await validateWorkspaceMetrics(prisma, {
      workspaceId: session.workspace.id,
      tables
    });

    const metrics = await prisma.metricDefinition.findMany({
      where: {
        workspaceId: session.workspace.id,
        isActive: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const visibleMetrics = metrics.filter((metric) => metricBelongsToTables(metric, activeTableLabels(tables)));
    const executableMetrics = visibleMetrics.filter((metric) =>
      isBusinessFacingMetricDefinition(metric) &&
      validationFromLineage(metric.lineageJson)?.validation_status === "valid"
    );
    const metricResults = await computeMetricResultsForContexts({
      contexts,
      metrics: executableMetrics
    });
    const displayableMetricResults = metricResults.filter((result) => hasDisplayableMetricResult(result));
    const metricResultGroups = groupMetricResultsByType(metricResults);
    const aggregationResults = await buildAggregationResults({
      contexts,
      metricResults
    });
    const reportTimeArtifacts = buildReportTimeArtifacts(aggregationResults);
    const structuredReport = buildStructuredAiReport({
      dataSourceCount: dataSources.length,
      metricResults,
      metrics: executableMetrics.map((metric) => ({
        id: metric.id,
        name: metric.name,
        category: metric.category,
        definition: metric.definition,
        formula: metric.formula,
        unit: metric.unit,
        mappingJson: metric.mappingJson,
        lineageJson: metric.lineageJson
      })),
      aggregationResults
    });
    const prompt = buildReportPrompt(structuredReport);
    const mockReport = buildMockAiBrief(metricResults);
    const fullSummary = structuredReport.coreSummary || mockReport.summary || buildBriefSummary(metricResults);
    const summary = compactText(fullSummary);
    const today = startOfToday();
    const payloadJson = {
      generatedFrom: "mock_ai_brief",
      generatedAt: new Date().toISOString(),
      dataSourceIds: dataSources.map((source) => source.id),
      dataSourceName: dataSources.map((source) => source.name).join("、"),
      fullSummary,
      metricResults,
      metricResultGroups,
      aggregationResults,
      timeConfig: reportTimeArtifacts.timeConfig,
      trendMetrics: reportTimeArtifacts.trendMetrics,
      trendCharts: reportTimeArtifacts.trendCharts,
      structuredReport,
      prompt,
      mockReport,
      analysisReport: asRecord(latestSnapshot.qualityReport).analysisReport ?? asRecord(latestSnapshot.schemaJson).analysisReport ?? null
    };

    const briefing = await prisma.dailyBriefing.upsert({
      where: {
        workspaceId_briefingDate: {
          workspaceId: session.workspace.id,
          briefingDate: today
        }
      },
      create: {
        workspaceId: session.workspace.id,
        briefingDate: today,
        title: "AI 数据分析报告",
        summary,
        confidence: displayableMetricResults.some((result) => result.status === "computed") ? 88 : 50,
        payloadJson
      },
      update: {
        title: "AI 数据分析报告",
        summary,
        confidence: displayableMetricResults.some((result) => result.status === "computed") ? 88 : 50,
        payloadJson
      }
    });

    await prisma.insight.deleteMany({
      where: {
        briefingId: briefing.id
      }
    });

    const structuredInsights = structuredReport.generatedInsights;
    const insightItems = structuredInsights?.keyFindings?.length
      ? structuredInsights.keyFindings.slice(0, 5).map((insight) => ({
        title: insight.title,
        description: compactText(`${insight.finding}。${insight.businessMeaning}`),
        anomalyType: "structured_insight",
        confidence: Math.round(insight.confidence * 100),
        explanationJson: {
          findingType: insight.findingType,
          currentConclusion: insight.currentConclusion,
          supportingEvidence: insight.supportingEvidence,
          deeperAnalysisResult: insight.deeperAnalysisResult,
          businessImplication: insight.businessImplication,
          recommendedDecision: insight.recommendedDecision,
          caveat: insight.caveat,
          comparedGroups: insight.comparedGroups,
          joinedTables: insight.joinedTables,
          joinKey: insight.joinKey,
          technicalDetails: insight.technicalDetails,
          fullDescription: `${insight.finding}。${insight.businessMeaning}`
        },
        evidenceJson: {
          evidenceMetrics: insight.evidenceMetrics,
          evidenceValues: insight.evidenceValues,
          evidenceObjects: insight.evidenceObjects,
          nextBreakdown: insight.nextBreakdown ?? []
        },
        recommendation: structuredInsights.recommendedActions.find((action) =>
          action.basedOn.some((metric) => insight.evidenceMetrics.includes(metric))
        )
      }))
      : metricResults.filter((result) =>
        result.status === "computed" &&
        isGlobalBusinessMetricResult(result) &&
        hasDisplayableMetricValue(result.value)
      ).slice(0, 5).map((result) => ({
        title: contextualMetricName(result.metricName, result.formula),
        description: `${contextualMetricName(result.metricName, result.formula)} 当前计算值为 ${formatValue(result.value)}`,
        anomalyType: "metric_result",
        confidence: 88,
        evidenceJson: {
          formula: result.formula,
          value: result.value ?? null,
          rows: result.rows ?? [],
          computedAt: result.computedAt
        },
        recommendation: undefined
      }));

    for (const item of insightItems) {
      await prisma.insight.create({
        data: {
          briefingId: briefing.id,
          title: item.title,
          description: item.description,
          anomalyType: item.anomalyType,
          anomalyTypeNormalized: item.anomalyType,
          impactScore: 0.65,
          confidence: item.confidence,
          explanationJson: "explanationJson" in item ? item.explanationJson : undefined,
          evidenceJson: item.evidenceJson,
          recommendations: {
            create: [{
              title: compactText(item.recommendation?.title ?? `基于「${item.title}」形成系统判断`, 180),
              executionPriority: item.recommendation?.priority === "high" ? "High" : item.recommendation?.priority === "low" ? "Low" : "Medium",
              estimatedOutcome: compactText(item.recommendation?.expectedOutcome ?? "把结构化洞察转成可展示的经营判断和行动结论"),
              workflowAction: item.recommendation?.action ?? "follow_up_analysis",
              status: RecommendationStatus.PLANNED
            }]
          }
        }
      });
    }

    const creditUsage = await consumeCredit({
      userId: session.user.id,
      actionType: UsageActionType.GENERATE_REPORT,
      amount: 1,
      metadata: {
        briefingId: briefing.id,
        workspaceId: session.workspace.id,
        generatedAt: payloadJson.generatedAt,
        computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length
      }
    });

    return NextResponse.json({
      ok: true,
      briefing,
      prompt,
      mockReport,
      metricResults,
      metricResultGroups,
      generatedAt: payloadJson.generatedAt,
      computedMetricCount: displayableMetricResults.filter((result) => result.status === "computed").length,
      failedMetricCount: metricResults.filter((result) => result.status === "failed").length,
      skippedMetricCount: metricResults.filter((result) => result.status === "skipped").length,
      entitlement: {
        creditId: creditUsage.creditId,
        remainingReports: creditUsage.remaining
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof EntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          upgradeUrl: "/checkout/professional",
          oneTimeUrl: "/checkout/trial"
        },
        { status: error.status }
      );
    }

    return apiErrorResponse(error, "Failed to generate metric result report");
  }
}
