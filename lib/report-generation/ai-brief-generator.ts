import type { MetricResultValue } from "@/lib/metric-results";
import type { SchemaTable } from "@/lib/metric-validation";
import {
  hasDisplayableMetricValue,
  isGlobalBusinessMetricResult
} from "@/lib/metric-visibility";
import { contextualMetricName } from "@/lib/report-generation/metric-name-normalizer";

type PromptDataSource = {
  id: string;
  name: string;
  type: string;
};

type ReportLocale = "en" | "zh";

export type MockAiBrief = {
  mode: "mock";
  title: string;
  summary: string;
  sections: Array<{
    title: string;
    bullets: string[];
  }>;
  evidence: Array<{
    metric: string;
    formula: string;
    value: number | string | null;
  }>;
};

function formatValue(value: unknown) {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value == null ? "-" : String(value);
}

function resultSentence(result: MetricResultValue, locale: ReportLocale = "zh") {
  const name = contextualMetricName(result.metricName, result.formula);
  return locale === "zh"
    ? `${name} 为 ${formatValue(result.value)}`
    : `${name}: ${formatValue(result.value)}`;
}

export function buildAiBriefPrompt({
  dataSources,
  tables,
  metricResults,
  locale = "zh"
}: {
  dataSources: PromptDataSource[];
  tables: SchemaTable[];
  metricResults: MetricResultValue[];
  locale?: ReportLocale;
}) {
  const computed = metricResults.filter((result) =>
    result.status === "computed" && hasDisplayableMetricValue(result.value)
  );
  const failed = metricResults.filter((result) => result.status === "failed");
  const sourceLines = dataSources.map((source) => `- ${source.name} (${source.type})`).join("\n");
  const tableLines = tables.map((table) =>
    `- ${table.schema ? `${table.schema}.` : ""}${table.name}: ${table.columns.map((column) => column.name).join(", ")}`
  ).join("\n");
  const metricLines = computed.map((result) =>
    `- ${contextualMetricName(result.metricName, result.formula)}: ${formatValue(result.value)} | formula: ${result.formula}`
  ).join("\n");

  if (locale === "en") {
    return [
      "You are an AI business analyst. Generate a concise business briefing from validated and computed metric results.",
      "",
      "Requirements:",
      "1. Do not invent data that was not provided.",
      "2. Do not read or cite raw row-level records.",
      "3. Use only metric_results, data source names, and schema summaries.",
      "4. Include executive conclusions, key changes, risk signals, likely causes, business impact, recommended actions, and evidence.",
      "5. Write for business operators, not as a technical log.",
      "",
      "Data sources:",
      sourceLines || "- None",
      "",
      "Schema summary:",
      tableLines || "- None",
      "",
      "Computed metrics:",
      metricLines || "- No successfully computed metrics",
      "",
      failed.length > 0 ? `Failed metric count: ${failed.length}` : "Failed metric count: 0"
    ].join("\n");
  }

  return [
    "你是一个 AI 经营分析师，请基于已经通过校验并计算完成的指标结果生成经营简报",
    "",
    "要求：",
    "1. 不要编造未提供的数据",
    "2. 不要读取或引用原始明细",
    "3. 只基于 metric_results、数据源名称和 schema 摘要生成分析",
    "4. 输出内容包括：核心结论、关键变化、异常信号、可能原因、业务影响、行动建议、证据链",
    "5. 语气要像给业务负责人看的简报，不要像技术日志",
    "",
    "数据源：",
    sourceLines || "- 无",
    "",
    "Schema 摘要：",
    tableLines || "- 无",
    "",
    "已计算指标：",
    metricLines || "- 无成功计算指标",
    "",
    failed.length > 0 ? `计算失败指标数量：${failed.length}` : "计算失败指标数量：0"
  ].join("\n");
}

export function buildMockAiBrief(metricResults: MetricResultValue[], locale: ReportLocale = "zh"): MockAiBrief {
  const computed = metricResults.filter((result) =>
    result.status === "computed" &&
    isGlobalBusinessMetricResult(result) &&
    hasDisplayableMetricValue(result.value)
  );
  const failed = metricResults.filter((result) => result.status === "failed");
  const topResults = computed.slice(0, 5);
  const summary = computed.length > 0
    ? locale === "zh"
      ? `本次 mock brief 基于 ${computed.length} 个已计算指标生成。${topResults.slice(0, 3).map((result) => resultSentence(result, locale)).join("；")}`
      : `This mock brief is based on ${computed.length} computed metrics. ${topResults.slice(0, 3).map((result) => resultSentence(result, locale)).join("; ")}`
    : locale === "zh"
      ? "当前没有成功计算的指标，mock brief 仅用于验证报告生成链路"
      : "No successfully computed metrics are available yet. This mock brief only verifies the report generation flow.";

  return {
    mode: "mock",
    title: locale === "zh" ? "AI 经营简报 Mock" : "AI Business Brief Mock",
    summary,
    sections: [
      {
        title: locale === "zh" ? "核心结论" : "Executive Summary",
        bullets: topResults.length > 0
          ? topResults.slice(0, 3).map((result) => resultSentence(result, locale))
          : [locale === "zh"
            ? "暂无可用指标结果，请先完成数据源连接、指标校验和结果计算"
            : "No metric results are available yet. Connect data, validate metrics, and run metric computation first."]
      },
      {
        title: locale === "zh" ? "异常信号" : "Risk Signals",
        bullets: failed.length > 0
          ? [locale === "zh"
            ? `${failed.length} 个指标计算失败，已从 mock brief 结论中排除`
            : `${failed.length} metrics failed and were excluded from the mock brief conclusions.`]
          : [locale === "zh"
            ? "当前 mock 版本未发现执行失败指标，后续接入 GPT 后会生成更细的异常解释"
            : "No failed metric executions were found in the mock version. GPT integration can add richer explanations later."]
      },
      {
        title: locale === "zh" ? "行动建议" : "Recommended Actions",
        bullets: locale === "zh"
          ? [
            "优先确认核心指标口径是否符合业务定义",
            "对通过校验的指标建立周期性计算和趋势记录",
            "上线前再接入 OpenAI Responses API 生成正式自然语言分析"
          ]
          : [
            "Confirm that core metric definitions match the business meaning.",
            "Set up recurring computation and trend history for validated metrics.",
            "Connect the OpenAI Responses API before launch for final natural-language analysis."
          ]
      }
    ],
    evidence: computed.slice(0, 10).map((result) => ({
      metric: contextualMetricName(result.metricName, result.formula),
      formula: result.formula,
      value: result.rows?.length ? result.rows[0]?.value ?? null : result.value ?? null
    }))
  };
}

export async function generateWithGPT(prompt: string, locale: ReportLocale = "zh"): Promise<MockAiBrief> {
  void prompt;

  return {
    mode: "mock",
    title: "OpenAI Responses API Placeholder",
    summary: locale === "zh"
      ? "generateWithGPT() 已保留为上线前接入 OpenAI Responses API 的占位接口，当前不会发起外部请求"
      : "generateWithGPT() is reserved as a placeholder for the OpenAI Responses API before launch. It does not make external requests yet.",
    sections: [],
    evidence: []
  };
}
