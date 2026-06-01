import type { BusinessModuleReport, StructuredAiReport } from "@/lib/report-generation/report-types";
import { skillForBusinessType } from "@/lib/report-generation/skill-registry";

export function generateRecommendations(modules: BusinessModuleReport[]): StructuredAiReport["recommendations"] {
  const recommendations: StructuredAiReport["recommendations"] = modules.flatMap((module) => {
    const skill = skillForBusinessType(module.businessType);
    const primaryMetric = module.coreMetrics[0];

    if (!primaryMetric) {
      return [];
    }

    const action = primaryMetric.warning
      ? `修正 ${primaryMetric.displayName} 的口径标注，明确是否为估算、未去重或比例口径`
      : module.businessType === "reviews"
        ? `按${skill.breakdownDimensions.slice(0, 3).join("、")}拆解负向和正向反馈`
        : module.businessType === "app_market"
          ? `按${skill.breakdownDimensions.slice(0, 3).join("、")}识别高安装低评分和头部集中对象`
          : module.businessType === "finance_timeseries"
            ? "补充累计收益率、最大回撤和高波动日期，判断波动是否集中在少数时间段"
            : `按${skill.breakdownDimensions.slice(0, 3).join("、")}拆解 ${primaryMetric.displayName}`;

    return [{
      title: primaryMetric.warning ? `修正 ${primaryMetric.displayName} 口径` : `拆解 ${primaryMetric.displayName}`,
      basedOn: `${primaryMetric.displayName} 当前值为 ${primaryMetric.displayValue}`,
      action,
      reason: primaryMetric.warning
        ? "口径不清会让后续报告把估算值或重复记录当成真实业务结果"
        : `${module.title}模块已有可计算结果，先锁定贡献最大的对象或风险来源`,
      priorityDimension: skill.breakdownDimensions[0] ?? "关键维度",
      priority: "High" as const
    }];
  });

  const hasBaselineRecommendation = modules.some((module) =>
    module.coreMetrics.some((metric) => /rate|ratio|volatility|volume|rating|sentiment/i.test(metric.name))
  );

  if (hasBaselineRecommendation) {
    recommendations.push({
      title: "补充对比基线",
      basedOn: "当前报告主要基于单次聚合结果，缺少同比、环比或目标阈值",
      action: "为核心指标增加时间窗口、目标值或业务阈值",
      reason: "有了基线后，报告才能区分普通波动、潜在风险和真正异常",
      priorityDimension: "时间段",
      priority: "Medium"
    });
  }

  return recommendations.slice(0, 3);
}
