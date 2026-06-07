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

function zhMetricName(metric: SelectedReportMetric) {
  const raw = `${metric.displayName} ${metric.name}`.toLowerCase();

  if (/total\s*customers?|customer\s*count|customers?\s*total|unique\s*customers?/.test(raw)) return "客户总数";
  if (/total\s*orders?|order\s*count|orders?\s*total/.test(raw)) return "订单总数";
  if (/revenue|sales\s*amount|total\s*sales|gmv/.test(raw)) return "销售额";
  if (/\baov\b|average\s*order\s*value|客单价/.test(raw)) return "客单价";
  if (/repeat\s*purchase\s*rate|repurchase|复购/.test(raw)) return "复购率";

  return metric.displayName;
}

function commerceCoreSummary(module: BusinessModuleReport) {
  if (!["ecommerce", "sales", "orders"].includes(module.businessType)) {
    return null;
  }

  const metricByPattern = (patterns: RegExp[]) => module.coreMetrics.find((metric) => {
    const raw = `${metric.displayName} ${metric.name}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(raw));
  });
  const customers = metricByPattern([/total\s*customers?/, /customer\s*count/, /unique\s*customers?/]);
  const orders = metricByPattern([/total\s*orders?/, /order\s*count/]);

  if (customers && orders) {
    return `本次数据覆盖 ${customers.displayValue} 位客户和 ${orders.displayValue} 笔订单，样本规模可以支持基础的电商经营分析`;
  }

  return null;
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
      const commerceSummary = commerceCoreSummary(module);
      if (commerceSummary) return commerceSummary;

      const metric = module.coreMetrics[0];
      return `${zhMetricName(metric)}为 ${metric.displayValue}`;
    });

  return `本次报告优先关注 ${populatedModules.map((module) => module.title).join("、")}。${highlights.join("；")}，下方只展示最需要关注的指标、发现和行动`;
}
