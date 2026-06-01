import type { StructuredAiReport } from "@/lib/report-generation/report-types";

export function buildReportPrompt(report: StructuredAiReport) {
  return [
    "你是一个资深商业数据分析师，请基于以下结构化指标报告生成正式经营简报",
    "",
    "要求：",
    "1. 只使用已提供的指标、风险、建议和证据",
    "2. 不编造未计算的数据",
    "3. 不读取原始明细",
    "4. 不把估算值当真实收入",
    "5. 如果某部分数据不足，请明确说明数据不足",
    "6. 输出结构必须精简为：核心摘要、关键指标、关键发现、业务风险、增长机会、下一步行动、查看口径与限制（折叠）",
    "7. 业务风险只能来自 threshold、trend、Top Share、distribution、ranking、group comparison 或交叉判断",
    "8. 增长机会只能来自 ranking、groupBy、distribution 或明确 opportunityCandidates",
    "9. warningMetrics 默认只能转成 action caveat、requiredData 或折叠口径详情，除非它直接影响核心业务判断",
    "10. 不要把 estimated、dedup、missing benchmark 作为主报告大区块展示；主页面要优先回答下一步经营动作",
    "11. 下一步行动必须只分为：业务行动、数据补强",
    "12. 不要单独展示“系统已自动分析”；系统已完成的分析只能作为行动卡片里的 evidence",
    "13. 下一步行动消费 nextActionPlan.actionInsights，不重新计算指标、ranking、groupBy、trend 或 distribution",
    "14. 已有 ranking/groupBy/trend 时不要写建议查看或建议生成，而要直接引用系统已完成的结果给行动",
    "15. 只有缺少真实字段时，才提示用户补充数据；warningMetrics 默认只能转成 caveat、tooltip 或折叠口径详情",
    "16. 不要重复模板化句子，不要展开没有真实聚合数据支撑的趋势、结构或头部对象分析",
    "",
    "结构化报告 JSON：",
    JSON.stringify(report, null, 2)
  ].join("\n");
}
