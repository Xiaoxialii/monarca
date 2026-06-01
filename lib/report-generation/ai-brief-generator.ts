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

function resultSentence(result: MetricResultValue) {
  return `${contextualMetricName(result.metricName, result.formula)} 为 ${formatValue(result.value)}`;
}

export function buildAiBriefPrompt({
  dataSources,
  tables,
  metricResults
}: {
  dataSources: PromptDataSource[];
  tables: SchemaTable[];
  metricResults: MetricResultValue[];
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

export function buildMockAiBrief(metricResults: MetricResultValue[]): MockAiBrief {
  const computed = metricResults.filter((result) =>
    result.status === "computed" &&
    isGlobalBusinessMetricResult(result) &&
    hasDisplayableMetricValue(result.value)
  );
  const failed = metricResults.filter((result) => result.status === "failed");
  const topResults = computed.slice(0, 5);
  const summary = computed.length > 0
    ? `本次 mock brief 基于 ${computed.length} 个已计算指标生成。${topResults.slice(0, 3).map(resultSentence).join("；")}`
    : "当前没有成功计算的指标，mock brief 仅用于验证报告生成链路";

  return {
    mode: "mock",
    title: "AI 经营简报 Mock",
    summary,
    sections: [
      {
        title: "核心结论",
        bullets: topResults.length > 0
          ? topResults.slice(0, 3).map(resultSentence)
          : ["暂无可用指标结果，请先完成数据源连接、指标校验和结果计算"]
      },
      {
        title: "异常信号",
        bullets: failed.length > 0
          ? [`${failed.length} 个指标计算失败，已从 mock brief 结论中排除`]
          : ["当前 mock 版本未发现执行失败指标，后续接入 GPT 后会生成更细的异常解释"]
      },
      {
        title: "行动建议",
        bullets: [
          "优先确认核心指标口径是否符合业务定义",
          "对通过校验的指标建立周期性计算和趋势记录",
          "上线前再接入 OpenAI Responses API 生成正式自然语言分析"
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

export async function generateWithGPT(prompt: string): Promise<MockAiBrief> {
  void prompt;

  return {
    mode: "mock",
    title: "OpenAI Responses API Placeholder",
    summary: "generateWithGPT() 已保留为上线前接入 OpenAI Responses API 的占位接口，当前不会发起外部请求",
    sections: [],
    evidence: []
  };
}
