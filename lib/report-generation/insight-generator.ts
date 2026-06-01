import type { BusinessModuleReport, SelectedReportMetric } from "@/lib/report-generation/report-types";

export function metricBusinessInsight(metric: SelectedReportMetric) {
  const lowerName = metric.displayName.toLowerCase();
  const breakdown = metric.businessType === "reviews"
    ? "已识别的反馈对象或分组"
    : metric.businessType === "app_market"
      ? "App、类别和价格区间"
      : metric.businessType === "finance_timeseries"
        ? "日期、成交量区间和价格区间"
        : "关键业务维度";

  if (metric.warning) {
    return `${metric.displayName} 为 ${metric.displayValue}，但属于「${metric.warning}」口径；建议先修正或标注口径，再用于经营判断`;
  }

  if (lowerName.includes("positive sentiment")) {
    return `正向反馈占比为 ${metric.displayValue}，说明整体评价偏正面；建议识别正向反馈集中的对象，沉淀可复制经验`;
  }

  if (lowerName.includes("negative sentiment")) {
    return `负向反馈占比为 ${metric.displayValue}，这是需要关注的体验风险；建议按${breakdown}定位负面来源`;
  }

  if (lowerName.includes("review volume")) {
    return `${metric.displayValue} 条有效评论样本可以支撑反馈分析；建议把评论量与情绪指标结合，排查高评论量低满意度对象`;
  }

  if (lowerName.includes("rating")) {
    return `${metric.displayName} 为 ${metric.displayValue}，反映产品或内容质量水平；建议识别高安装低评分对象，判断增长是否牺牲体验`;
  }

  if (lowerName.includes("installs")) {
    return `${metric.displayName} 为 ${metric.displayValue}，反映市场覆盖规模；建议按 App 和类别比较，避免头部对象掩盖长尾问题`;
  }

  if (lowerName.includes("volume") || lowerName.includes("volatility") || lowerName.includes("close")) {
    return `${metric.displayName} 为 ${metric.displayValue}，用于判断时间序列规模或波动；建议补充收益率、最大回撤和高波动日期分析`;
  }

  if (/rate|ratio/i.test(metric.name)) {
    return `${metric.displayName} 为 ${metric.displayValue}，应重点核对分子和分母口径，并按${breakdown}拆解`;
  }

  return `${metric.displayName} 为 ${metric.displayValue}，可作为当前模块的核心观察点；建议按${breakdown}验证主要贡献来源`;
}

export function buildModuleSummary(title: string, metrics: SelectedReportMetric[]) {
  if (metrics.length === 0) {
    return `${title}当前没有足够的已验证指标支撑分析`;
  }

  const primary = metrics[0];
  const secondary = metrics[1];

  return secondary
    ? `${title}模块重点关注 ${primary.displayName}（${primary.displayValue}）和 ${secondary.displayName}（${secondary.displayValue}），用于判断规模、质量和风险`
    : `${title}模块重点关注 ${primary.displayName}（${primary.displayValue}），先以该指标作为本轮分析入口`;
}

export function buildCoreSummary(modules: BusinessModuleReport[]) {
  const populatedModules = modules.filter((module) => module.coreMetrics.length > 0);

  if (populatedModules.length === 0) {
    return "当前数据不足以支持经营分析。请先连接数据源、生成并校验指标，再生成报告";
  }

  const highlights = populatedModules
    .slice(0, 3)
    .map((module) => {
      const metric = module.coreMetrics[0];
      return `${metric.displayName} 为 ${metric.displayValue}`;
    });

  return `本次报告优先关注 ${populatedModules.map((module) => module.title).join("、")}。${highlights.join("；")}，下方只展示最需要关注的指标、发现和行动`;
}
