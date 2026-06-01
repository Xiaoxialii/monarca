import type { BusinessModuleReport, SelectedReportMetric } from "@/lib/report-generation/report-types";

function metricNumber(metric: SelectedReportMetric) {
  if (typeof metric.value === "number") return metric.value;
  if (typeof metric.value === "string") {
    const parsed = Number(metric.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function detectMetricRisks(metrics: SelectedReportMetric[]) {
  const risks: string[] = [];

  for (const metric of metrics) {
    const value = metricNumber(metric);
    const name = metric.displayName;
    const lowerName = name.toLowerCase();

    if (value != null && (lowerName.includes("negative") || lowerName.includes("refund")) && value >= 0.2 && value <= 1) {
      risks.push(`${name} 达到 ${metric.displayValue}，属于需要关注的负向反馈或退款比例，建议优先拆解来源对象`);
      continue;
    }

    if (value != null && lowerName.includes("volatility") && value > 20) {
      risks.push(`${name} 为 ${metric.displayValue}，波动水平偏高，需要结合时间窗口判断是否为短期风险`);
      continue;
    }

    if (value != null && lowerName.includes("rating") && value < 4) {
      risks.push(`${name} 为 ${metric.displayValue}，评分未达到较优水平，可能影响用户选择和产品信任`);
    }
  }

  return risks;
}

export function detectReportRisks(modules: BusinessModuleReport[]) {
  const risks = modules.flatMap((module) => module.risks);

  if (risks.length > 0) {
    return Array.from(new Set(risks)).slice(0, 5);
  }

  return [];
}
