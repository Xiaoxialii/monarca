type AiReportInputRecord = Record<string, unknown>;

function asRecord(value: unknown): AiReportInputRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AiReportInputRecord : {};
}

type EcommerceDimensionRow = {
  name?: string;
  businessJudgment?: string;
  todayOrders?: number | null;
  yesterdayOrders?: number | null;
  ordersChange?: number | null;
  todayNetSales?: number | null;
  yesterdayNetSales?: number | null;
  netSalesChange?: number | null;
  todayAov?: number | null;
  yesterdayAov?: number | null;
  aovChange?: number | null;
  todayReturnRate?: number | null;
  yesterdayReturnRate?: number | null;
  returnRateChange?: number | null;
  todayRating?: number | null;
  yesterdayRating?: number | null;
  ratingChange?: number | null;
  todayFulfillmentDays?: number | null;
  yesterdayFulfillmentDays?: number | null;
  fulfillmentDaysChange?: number | null;
};

type EcommerceDimensionTable = {
  type?: string;
  label?: string;
  rows?: EcommerceDimensionRow[];
  summaries?: string[];
};

type KpiDriverDefinition = {
  groupName: string;
  aliases: string[];
  drivers: Array<{
    name: string;
    aliases: string[];
    maxScore?: number | null;
  }>;
};

const logisticsDriverMap: KpiDriverDefinition[] = [
  {
    groupName: "散件揽收",
    aliases: ["散件揽收"],
    drivers: [
      { name: "首揽及时率", aliases: ["首揽及时率"], maxScore: 7 },
      { name: "及时揽收率", aliases: ["及时揽收率"], maxScore: 3 },
      { name: "网点取消率", aliases: ["网点取消率"], maxScore: 5 },
      { name: "发件端求助率", aliases: ["发件端求助率", "发件端求助"], maxScore: 5 }
    ]
  },
  {
    groupName: "时效达成",
    aliases: ["时效达成"],
    drivers: [
      { name: "交件及时率", aliases: ["交件及时率"], maxScore: 10 },
      { name: "24点签收率(含乡镇)", aliases: ["24点签收率", "24点签收率含乡镇"], maxScore: 10 }
    ]
  },
  {
    groupName: "投递规范",
    aliases: ["投递规范"],
    drivers: [
      { name: "派签求助-外部平台", aliases: ["派签求助-外部平台", "派签求助外部平台"], maxScore: 15 },
      { name: "派签求助-增值件", aliases: ["派签求助-增值件", "派签求助增值件"], maxScore: 5 },
      { name: "遗失破损率", aliases: ["遗失破损率"], maxScore: 5 },
      { name: "拍照签收率", aliases: ["拍照签收率"], maxScore: 5 }
    ]
  },
  {
    groupName: "问题解决",
    aliases: ["问题解决"],
    drivers: [
      { name: "网点接通率", aliases: ["网点接通率"], maxScore: 5 },
      { name: "工单一次性解决率", aliases: ["工单一次性解决率", "一次性解决率"], maxScore: 25 },
      { name: "客户求助", aliases: ["客户求助"], maxScore: 13 },
      { name: "网点查件", aliases: ["网点查件"], maxScore: 7 },
      { name: "预警工单", aliases: ["预警工单"], maxScore: 5 }
    ]
  },
  {
    groupName: "加减分项",
    aliases: ["加减分项", "加减分"],
    drivers: [
      { name: "申诉率", aliases: ["申诉率"] },
      { name: "不配合处理减分", aliases: ["不配合处理减分"] },
      { name: "逾期减分", aliases: ["逾期减分"] },
      { name: "内部人员申诉", aliases: ["内部人员申诉"] }
    ]
  }
];

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compact(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）/_-]/g, "");
}

function metricText(metric: AiReportInputRecord) {
  return compact([
    metric.kpi_name,
    metric.kpiName,
    metric.displayName,
    metric.metricName,
    metric.kpiId,
    metric.metricId
  ].filter(Boolean).join(" "));
}

function metricIdentityTokens(metric: AiReportInputRecord) {
  return [
    metric.kpi_name,
    metric.kpiName,
    metric.displayName,
    metric.metricName,
    metric.kpiId,
    metric.metricId
  ].map(compact).filter(Boolean);
}

function metricNumericValue(metric?: AiReportInputRecord | null) {
  if (!metric) return null;
  return asNumber(metric.value ?? metric.currentValue ?? metric.score ?? metric.rate ?? metric.rateValue);
}

function formatNumber(value: unknown) {
  const numeric = asNumber(value);
  if (numeric === null) return "-";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPercentChange(value: unknown) {
  const numeric = asNumber(value);
  if (numeric === null) return "-";
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(1)}%`;
}

function metricChange(metric: AiReportInputRecord) {
  const explicit = asNumber(metric.changePercent ?? metric.percentChange);
  if (explicit !== null) return explicit;

  const current = asNumber(metric.currentValue ?? metric.value);
  const previous = asNumber(metric.previousValue);
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function dimensionTablesFromInput(input: {
  composedReport?: AiReportInputRecord | null;
  report?: AiReportInputRecord | null;
}) {
  const composedReport = input.composedReport ?? input.report ?? {};
  const direct = Array.isArray(composedReport.dimensionComparisons)
    ? composedReport.dimensionComparisons
    : [];
  const nestedReports = asRecord(composedReport.composedReports);
  const dailyReport = asRecord(nestedReports.daily_brief);
  const nested = Array.isArray(dailyReport.dimensionComparisons) ? dailyReport.dimensionComparisons : [];

  return (direct.length ? direct : nested).filter((table): table is EcommerceDimensionTable =>
    Boolean(table && typeof table === "object" && !Array.isArray(table))
  );
}

function ecommerceAttentionScore(row: EcommerceDimensionRow) {
  let score = 0;
  const ordersChange = asNumber(row.ordersChange);
  const netSalesChange = asNumber(row.netSalesChange);
  const aovChange = asNumber(row.aovChange);
  const returnRateChange = asNumber(row.returnRateChange);
  const ratingChange = asNumber(row.ratingChange);
  const fulfillmentDaysChange = asNumber(row.fulfillmentDaysChange);

  if (netSalesChange !== null && netSalesChange < -0.03) score += Math.abs(netSalesChange) * 4;
  if (ordersChange !== null && ordersChange < -0.03) score += Math.abs(ordersChange) * 3;
  if (aovChange !== null && aovChange < -0.03) score += Math.abs(aovChange) * 2;
  if (returnRateChange !== null && returnRateChange > 0.1) score += returnRateChange * 2;
  if (ratingChange !== null && ratingChange < -0.02) score += Math.abs(ratingChange) * 4;
  if (fulfillmentDaysChange !== null && fulfillmentDaysChange > 0.05) score += fulfillmentDaysChange * 2;

  return score;
}

function ecommerceEvidence(row: EcommerceDimensionRow) {
  const parts = [
    `订单 ${formatNumber(row.todayOrders)} vs ${formatNumber(row.yesterdayOrders)} (${formatPercentChange(row.ordersChange)})`,
    `净销售额 ${formatNumber(row.todayNetSales)} vs ${formatNumber(row.yesterdayNetSales)} (${formatPercentChange(row.netSalesChange)})`,
    row.todayAov != null || row.yesterdayAov != null ? `客单价 ${formatNumber(row.todayAov)} vs ${formatNumber(row.yesterdayAov)} (${formatPercentChange(row.aovChange)})` : null,
    row.todayReturnRate != null || row.yesterdayReturnRate != null ? `退货率 ${formatNumber(row.todayReturnRate)} vs ${formatNumber(row.yesterdayReturnRate)} (${formatPercentChange(row.returnRateChange)})` : null,
    row.todayRating != null || row.yesterdayRating != null ? `评分 ${formatNumber(row.todayRating)} vs ${formatNumber(row.yesterdayRating)} (${formatPercentChange(row.ratingChange)})` : null,
    row.todayFulfillmentDays != null || row.yesterdayFulfillmentDays != null ? `履约天数 ${formatNumber(row.todayFulfillmentDays)} vs ${formatNumber(row.yesterdayFulfillmentDays)} (${formatPercentChange(row.fulfillmentDaysChange)})` : null
  ].filter(Boolean);

  return parts.join("；");
}

function buildEcommerceAiReport(dimensionTables: EcommerceDimensionTable[]) {
  const focusRows = dimensionTables.flatMap((table) =>
    (Array.isArray(table.rows) ? table.rows : [])
      .filter((row) => row.name)
      .map((row) => ({
        table,
        row,
        attentionScore: ecommerceAttentionScore(row)
      }))
  );
  const riskRows = focusRows
    .filter((item) => item.attentionScore > 0)
    .sort((left, right) => right.attentionScore - left.attentionScore)
    .slice(0, 5);
  const fallbackRows = focusRows.slice(0, 3);
  const attentionRows = riskRows.length ? riskRows : fallbackRows;
  const targetObjects = attentionRows.map((item) => item.row.name).filter((name): name is string => Boolean(name));

  return {
    analysisVersion: "ecommerce_object_attention_v1",
    executive_summary: {
      overall_assessment: targetObjects.length ? "当前经营变化需要按对象拆解关注。" : "当前报告暂无明确关注对象。",
      key_message: targetObjects.length
        ? `需要优先关注 ${targetObjects.slice(0, 3).join("、")}。这些对象相对昨日在订单、净销售额、客单价、退货、评分或履约上出现变化。`
        : "当前没有足够的对象级对比数据用于判断。",
      score_interpretation: "基于今日与昨日的对象级对比，不重新计算指标。"
    },
    score_decomposition: dimensionTables.map((table) => ({
      group_name: table.label ?? table.type ?? "对象维度",
      group_score: null,
      group_rate: null,
      interpretation: Array.isArray(table.summaries) && table.summaries.length
        ? table.summaries.slice(0, 2).join("；")
        : `${table.label ?? table.type ?? "对象维度"} 已生成今日与昨日对比。`
    })),
    key_risks: attentionRows.map((item) => ({
      risk_name: `${item.row.name} 需要关注`,
      related_group: item.table.label ?? item.table.type ?? "对象维度",
      evidence: [
        ecommerceEvidence(item.row),
        item.row.businessJudgment ? `判断：${item.row.businessJudgment}` : null
      ].filter((line): line is string => Boolean(line)),
      business_impact: item.row.businessJudgment || `${item.row.name} 相对昨日出现变化，需要结合明细订单继续定位原因。`
    })),
    root_cause_hypotheses: attentionRows.slice(0, 5).map((item) => ({
      hypothesis: `${item.row.name} 的变化可能来自订单规模、客单价、退货、评分或履约结构变化`,
      evidence: [ecommerceEvidence(item.row)].filter(Boolean),
      confidence: item.attentionScore > 0 ? "medium" : "low"
    })),
    action_plan: {
      p0: riskRows.slice(0, 2).map((item) => `优先查看 ${item.row.name} 的订单明细、渠道来源、退货原因和评分反馈。`),
      p1: attentionRows.slice(0, 3).map((item) => `对 ${item.row.name} 做今日 vs 昨日拆解，确认变化来自流量、转化、客单价还是体验。`),
      p2: ["将对象级异常纳入日报固定巡检，持续跟踪品类、商品、渠道和市场的变化。"]
    },
    data_notes: ["分析基于 composer 已生成的 dimensionComparisons；AI 只解释已有结果，不重新计算指标。"]
  };
}

function formulaStatus(
  components: Array<{ score: number | null }>,
  finalScore: number | null
): "matched" | "mismatched" | "partial" | "missing" {
  if (finalScore === null) return "missing";
  if (components.some((component) => component.score === null)) return "partial";
  const total = components.reduce((sum, component) => sum + (component.score ?? 0), 0);
  return Math.abs(total - finalScore) <= 0.01 ? "matched" : "mismatched";
}

function formulaWarning(
  status: "matched" | "mismatched" | "partial" | "missing"
) {
  if (status === "mismatched") return "父级得分与子级得分合计不一致，请检查 Excel 或 metricResults 口径。";
  if (status === "partial") return "部分子指标缺失，公式只能做部分解释。";
  if (status === "missing") return "父级得分缺失，无法完成公式解释。";
  return "";
}

function classifyLogisticsKpiRole(kpiName: string) {
  const normalized = compact(kpiName);
  const forcedProcessPatterns = [
    "首揽及时率",
    "交件及时率",
    "24点签收率",
    "24点签收率含乡镇",
    "sla响应时间",
    "工单处理时长"
  ].map(compact);
  const resultPatterns = [
    "kpi总分",
    "问题解决率总得分",
    "问题解决总得分",
    "工单一次性解决率总分",
    "散件揽收总得分",
    "时效达成总得分",
    "投递规范总得分",
    "加减分项总得分"
  ].map(compact);
  const processPatterns = [
    ...forcedProcessPatterns,
    "工单流转次数",
    "sla响应时间",
    "处理时长",
    "重复进线",
    "闭环时长",
    "二次工单数",
    "催单数",
    "回访未解决数"
  ].map(compact);
  const driverPatterns = [
    "客户求助",
    "网点查件",
    "预警工单",
    "网点取消率",
    "发件端求助率",
    "发件端求助",
    "派签求助",
    "遗失破损率",
    "拍照签收率",
    "申诉率",
    "不配合处理减分",
    "逾期减分",
    "内部人员申诉"
  ].map(compact);

  if (forcedProcessPatterns.some((pattern) => normalized.includes(pattern))) {
    return {
      role: "process" as const,
      causal_position: "upstream" as const,
      reason: "这是执行过程里的动作指标，先反映现场有没有按流程做好。"
    };
  }

  if (resultPatterns.some((pattern) => normalized.includes(pattern))) {
    return {
      role: "result" as const,
      causal_position: "downstream" as const,
      reason: "这是看最终表现的指标，用来判断一个模块或整体结果好不好。"
    };
  }

  if (processPatterns.some((pattern) => normalized.includes(pattern))) {
    return {
      role: "process" as const,
      causal_position: "upstream" as const,
      reason: "这是过程信号，能提前反映执行环节有没有卡住。"
    };
  }

  if (driverPatterns.some((pattern) => normalized.includes(pattern))) {
    return {
      role: "driver" as const,
      causal_position: "midstream" as const,
      reason: "这是结果变化的直接影响点，用来解释问题为什么会传导到模块得分。"
    };
  }

  return {
    role: "process" as const,
    causal_position: "upstream" as const,
    reason: "没有明确结果汇总关系时，先按过程指标处理，避免把执行动作误放到驱动层。"
  };
}

function buildKpiRoleClassification(
  groups: LogisticsDriverGroup[],
  formulaBreakdowns: Array<{ title: string; components?: Array<{ name: string }> }>
) {
  const resultNames = ["KPI总分", ...formulaBreakdowns.map((item) => item.title)];
  const driverNames = groups.flatMap((group) => group.kpis.map((kpi) => ({
    kpi_name: kpi.kpi_name,
    group_name: group.group_name
  })));
  const allItems = [
    ...resultNames.map((name) => ({ kpi_name: name, group_name: "汇总结果" })),
    ...driverNames
  ];
  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [compact(`${item.group_name}:${item.kpi_name}`), item])).values()
  );
  const formulaParents = new Map(
    formulaBreakdowns.flatMap((formula) =>
      (formula.components ?? []).map((component) => [compact(component.name), formula.title] as const)
    )
  );
  const groupResultByGroup = new Map(
    groups.map((group) => [
      compact(group.group_name),
      formulaBreakdowns.find((formula) => compact(formula.title).includes(compact(group.group_name)))?.title ?? `${group.group_name}总得分`
    ])
  );
  const classified = uniqueItems.map((item) => {
    const classification = classifyLogisticsKpiRole(item.kpi_name);
    const compactName = compact(item.kpi_name);
    const parent = formulaParents.get(compactName) ?? groupResultByGroup.get(compact(item.group_name)) ?? "KPI总分";
    const influences = classification.role === "result"
      ? item.kpi_name === "KPI总分" ? [] : ["KPI总分"]
      : [parent];
    const influencedBy = classification.role === "result"
      ? (formulaBreakdowns.find((formula) => compact(formula.title) === compactName)?.components ?? []).map((component) => component.name)
      : [];

    return {
      kpi_name: item.kpi_name,
      role: classification.role,
      reason: classification.reason,
      causal_position: classification.causal_position,
      influences,
      influenced_by: influencedBy
    };
  });
  const roleDistribution = classified.reduce((acc, item) => {
    acc[item.role] += 1;
    return acc;
  }, { result: 0, driver: 0, process: 0 });
  const resultKpis = classified.filter((item) => item.role === "result").map((item) => item.kpi_name);
  const driverKpis = classified.filter((item) => item.role === "driver").map((item) => item.kpi_name);
  const processKpis = classified.filter((item) => item.role === "process").map((item) => item.kpi_name);

  return {
    classified_kpis: classified,
    process_kpis: processKpis,
    driver_kpis: driverKpis,
    result_kpis: resultKpis,
    role_distribution: roleDistribution,
    system_view: {
      key_result_kpis: resultKpis.slice(0, 8),
      key_driver_kpis: driverKpis.slice(0, 8),
      key_process_kpis: processKpis.slice(0, 8)
    }
  };
}

function isProcessAnalysisKpi(kpiName: string) {
  const normalized = compact(kpiName);
  return [
    "首揽及时率",
    "及时揽收率",
    "交件及时率",
    "24点签收率",
    "24点签收率含乡镇",
    "sla响应时间",
    "工单处理时长",
    "平均闭环时间",
    "闭环时长",
    "流转次数",
    "工单流转次数"
  ].map(compact).some((pattern) => normalized.includes(pattern));
}

function processWorkflowStage(kpiName: string): "upstream" | "midstream" | "downstream" {
  const normalized = compact(kpiName);
  if (["首揽及时率", "及时揽收率"].map(compact).some((pattern) => normalized.includes(pattern))) return "upstream";
  if (["交件及时率", "sla响应时间", "工单处理时长", "平均闭环时间", "闭环时长", "流转次数", "工单流转次数"].map(compact).some((pattern) => normalized.includes(pattern))) return "midstream";
  return "downstream";
}

function processPerformanceLevel(kpi: LogisticsDriverGroup["kpis"][number]): "strong" | "medium" | "weak" {
  const rateValue = kpi.rate !== null ? (Math.abs(kpi.rate) <= 1 ? kpi.rate * 100 : kpi.rate) : null;
  const scoreRate = kpi.score !== null && kpi.maxScore ? (kpi.score / kpi.maxScore) * 100 : null;
  const reference = rateValue ?? scoreRate;

  if (reference === null) return "weak";
  if (reference > 90) return "strong";
  if (reference >= 70) return "medium";
  return "weak";
}

function processStagePriority(stage: "upstream" | "midstream" | "downstream") {
  if (stage === "upstream") return 3;
  if (stage === "midstream") return 2;
  return 1;
}

function processImpactScore(kpi: LogisticsDriverGroup["kpis"][number], stage: "upstream" | "midstream" | "downstream") {
  const scoreRate = kpi.score !== null && kpi.maxScore ? kpi.score / kpi.maxScore : null;
  const rateValue = kpi.rate !== null ? (Math.abs(kpi.rate) <= 1 ? kpi.rate : kpi.rate / 100) : null;
  const weakness = scoreRate !== null ? 1 - scoreRate : rateValue !== null ? 1 - rateValue : 1;
  return Number(Math.max(0, weakness * 100 + processStagePriority(stage) * 5).toFixed(2));
}

function buildProcessKpiAnalysis(groups: LogisticsDriverGroup[]) {
  const processKpis = groups.flatMap((group) => group.kpis
    .filter((kpi) => kpi.hasData && isProcessAnalysisKpi(kpi.kpi_name))
    .map((kpi) => {
      const stage = processWorkflowStage(kpi.kpi_name);
      const performanceLevel = processPerformanceLevel(kpi);
      const impactScore = processImpactScore(kpi, stage);

      return {
        group_name: group.group_name,
        kpi_name: kpi.kpi_name,
        score: kpi.score,
        max_score: kpi.maxScore ?? null,
        rate: kpi.rate,
        value: kpi.value,
        stage,
        performance_level: performanceLevel,
        impact_score: impactScore,
        interpretation: `${kpi.kpi_name} 位于${stage === "upstream" ? "前置" : stage === "midstream" ? "中段" : "末端"}执行环节，当前表现为 ${performanceLevel}。`
      };
    }))
    .sort((left, right) => {
      const levelWeight = { weak: 3, medium: 2, strong: 1 };
      const levelDelta = levelWeight[right.performance_level] - levelWeight[left.performance_level];
      if (levelDelta !== 0) return levelDelta;
      const stageDelta = processStagePriority(right.stage) - processStagePriority(left.stage);
      if (stageDelta !== 0) return stageDelta;
      return right.impact_score - left.impact_score;
    });
  const bottleneck = processKpis[0] ?? null;
  const weakProcessKpis = processKpis.filter((kpi) => kpi.performance_level === "weak");

  return {
    process_health_summary: processKpis.length
      ? `当前识别到 ${processKpis.length} 个过程 KPI，优先看前置和中段执行环节是否卡住。`
      : "当前没有足够的过程层 KPI，暂时无法判断执行链路健康度。",
    process_kpi_analysis: processKpis.map((kpi) => ({
      kpi_name: kpi.kpi_name,
      group_name: kpi.group_name,
      stage: kpi.stage,
      performance_level: kpi.performance_level,
      impact_score: kpi.impact_score,
      score: kpi.score,
      max_score: kpi.max_score,
      rate: kpi.rate,
      value: kpi.value,
      interpretation: kpi.interpretation
    })),
    bottleneck: bottleneck ? {
      kpi_name: bottleneck.kpi_name,
      reason: `${bottleneck.kpi_name} 是当前过程层里优先级最高的执行瓶颈。`,
      system_impact: `${bottleneck.kpi_name} 卡住会影响后续交接、处理或签收链路稳定性。`
    } : {
      kpi_name: "",
      reason: "当前没有可用过程 KPI，无法选择唯一过程瓶颈。",
      system_impact: ""
    },
    process_flow: [
      "订单进入",
      "首揽执行",
      "运输交接",
      "网点处理",
      "投递执行",
      "24h签收确认"
    ],
    causal_propagation: weakProcessKpis.slice(0, 3).map((kpi) => ({
      chain: `${kpi.kpi_name}偏弱 → 执行环节延迟 → 后续处理压力增加 → 下游 KPI 承压`
    }))
  };
}

function buildKpiAnalysisOptimization(groups: LogisticsDriverGroup[], metricResults: AiReportInputRecord[]) {
  const byGroup = (name: string) => groups.find((group) => compact(group.group_name).includes(compact(name))) ?? null;
  const byKpi = (group: LogisticsDriverGroup | null, name: string) =>
    group?.kpis.find((kpi) => compact(kpi.kpi_name).includes(compact(name))) ?? null;
  const summaryMetric = (aliases: string[], displayName: string, maxScore: number) =>
    summaryKpiFromMetric(metricResults, aliases, displayName, maxScore);
  const problemGroup = byGroup("问题解决");
  const firstResolutionTotal = summaryMetric(
    ["工单一次性解决率总分", "工单一次性解决率 总分"],
    "工单一次性解决率总分",
    25
  );
  const problemResolutionTotal = summaryMetric(
    ["问题解决率总得分", "问题解决率 总得分", "问题解决总得分"],
    "问题解决率总得分",
    30
  ) ?? (problemGroup ? {
    kpi_name: "问题解决率总得分",
    value: null,
    score: problemGroup.group_score,
    rate: problemGroup.group_score !== null ? problemGroup.group_score / 30 : problemGroup.group_rate,
    maxScore: 30,
    hasData: problemGroup.group_score !== null || problemGroup.group_rate !== null
  } : null);
  const networkContact = byKpi(problemGroup, "网点接通率");
  const customerHelp = byKpi(problemGroup, "客户求助");
  const networkInquiry = byKpi(problemGroup, "网点查件");
  const warningTicket = byKpi(problemGroup, "预警工单");
  const makeFormula = (
    title: string,
    components: Array<{ name: string; score: number | null; maxScore?: number | null; status?: "valid" | "missing" | "zero" | "invalid" }>,
    finalScore: number | null,
    maxScore: number | null
  ) => {
    const status = formulaStatus(components, finalScore);
    return {
      title,
      formula_text: `${title} = ${components.map((component) => `${component.name}得分`).join(" + ")}`,
      value_text: `= ${components.map((component) => component.score === null ? "缺失" : formatNumber(component.score)).join(" + ")}`,
      result_text: `= ${finalScore === null ? "缺失" : formatNumber(finalScore)}`,
      components: components.map((component) => ({
        name: component.name,
        score: component.score,
        maxScore: component.maxScore ?? null,
        status: component.status ?? (component.score === null ? "missing" : component.score === 0 ? "zero" : "valid")
      })),
      final_score: finalScore,
      max_score: maxScore,
      consistency_status: status,
      warning: formulaWarning(status)
    };
  };
  const moduleFormula = (group: LogisticsDriverGroup) => makeFormula(
    `${group.group_name}总得分`,
    group.kpis.map((kpi) => ({ name: kpi.kpi_name, score: kpi.score, maxScore: kpi.maxScore ?? null })),
    group.group_score,
    group.group_name.includes("投递规范") || group.group_name.includes("问题解决") ? 30 : group.group_name.includes("加减分") ? null : 20
  );
  const formulaBreakdowns = [
    makeFormula(
      "工单一次性解决率总分",
      [
        { name: "客户求助", score: customerHelp?.score ?? null, maxScore: customerHelp?.maxScore ?? 13 },
        { name: "网点查件", score: networkInquiry?.score ?? null, maxScore: networkInquiry?.maxScore ?? 7 },
        { name: "预警工单", score: warningTicket?.score ?? null, maxScore: warningTicket?.maxScore ?? 5 }
      ],
      firstResolutionTotal?.score ?? null,
      25
    ),
    makeFormula(
      "问题解决率总得分",
      [
        { name: "工单一次性解决率总分", score: firstResolutionTotal?.score ?? null, maxScore: 25 },
        { name: "网点接通率", score: networkContact?.score ?? null, maxScore: networkContact?.maxScore ?? 5 }
      ],
      problemResolutionTotal?.score ?? null,
      30
    ),
    ...groups
      .filter((group) => group.group_score !== null || group.kpis.some((kpi) => kpi.hasData))
      .map(moduleFormula)
  ];
  const weakLinks = groups.flatMap((group) => group.kpis
    .filter((kpi) => kpi.hasData)
    .map((kpi) => {
      const maxScore = kpi.maxScore ?? null;
      const scoreRate = kpi.score !== null && maxScore ? kpi.score / maxScore : null;
      return {
        group_name: group.group_name,
        kpi_name: kpi.kpi_name,
        score: kpi.score,
        max_score: maxScore,
        rate_value: kpi.rate,
        score_rate: scoreRate,
        evidence_status: kpi.score !== null && kpi.rate !== null ? "strong" : "partial",
        interpretation: `${kpi.kpi_name} 当前得分 ${formatNumber(kpi.score)}${maxScore ? ` / ${formatNumber(maxScore)}` : ""}，需要结合业务口径复盘。`
      };
    }))
    .sort((left, right) => {
      const leftRate = left.score_rate ?? Number.POSITIVE_INFINITY;
      const rightRate = right.score_rate ?? Number.POSITIVE_INFINITY;
      return leftRate - rightRate;
    });
  const primary = weakLinks.find((item) => item.evidence_status === "strong" || item.evidence_status === "partial") ?? null;
  const topDrivers = weakLinks.slice(0, 3).map((item, index) => {
    const priority = index === 0 ? "high" : index === 1 ? "medium" : "low";
    const groupName = item.group_name || "对应分组";
    const signal = item.score_rate !== null && item.score_rate < 0.6 ? "weak" : item.score_rate !== null && item.score_rate >= 0.8 ? "strong" : "normal";

    return {
      rank: index + 1,
      name: item.kpi_name,
      kpi_name: item.kpi_name,
      priority,
      impact_level: priority,
      evidence: [
	        {
	          kpi_name: item.kpi_name,
	          value: item.score,
	          score: item.score,
	          maxScore: item.max_score,
	          rate: item.rate_value,
	          signal
	        }
      ],
      impact_chain: [
        `${item.kpi_name}承压 → ${groupName}表现受影响 → 系统问题闭环效率下降 → KPI总分承压`
      ]
    };
  });
  const topKpiResults = weakLinks.slice(0, 3).map((item, index) => {
    const impactScore = item.score_rate !== null
      ? Number(Math.max(0, 1 - item.score_rate).toFixed(4))
      : 3 - index;
    const scoreText = `${formatNumber(item.score)}${item.max_score ? ` / ${formatNumber(item.max_score)}` : ""}`;

    return {
      name: item.kpi_name,
      impact_score: impactScore,
      reason: `${item.kpi_name} 得分 ${scoreText}，是 ${item.group_name} 当前需要优先处理的影响点。`
    };
  });
  const resultPrimaryBottleneck = primary ? {
    kpi: primary.kpi_name,
    reason: `${primary.kpi_name} 是当前 Top 3 中最靠前的薄弱项，得分 ${formatNumber(primary.score)}${primary.max_score ? ` / ${formatNumber(primary.max_score)}` : ""}。`,
    impact: `${primary.kpi_name} 持续承压会拖累 ${primary.group_name}，并沿链路影响 KPI 总分。`
  } : {
    kpi: "",
    reason: "当前数据不足，无法选择唯一主瓶颈。",
    impact: ""
  };
	  const compressedChain = primary
	    ? `${primary.kpi_name}承压 → 问题处理链路效率下降 → 分组表现受影响 → KPI总分承压`
	    : "数据不够 → 暂时看不出主要问题 → 先不做判断";
  const resultDecision = {
    p0: primary ? [`${primary.kpi_name}：立即按责任网点、问题类型和处理时长拆分，定位最高频的拖累来源。`] : [],
    p1: weakLinks[1] ? [`${weakLinks[1].kpi_name}：建立日跟踪清单，明确责任人和关闭时限。`] : [],
    p2: weakLinks[2] ? [`${weakLinks[2].kpi_name}：纳入固定巡检看板，形成周度复盘机制。`] : []
  };
	  const analysisProcess = {
	    kpi_decomposition: [
	      "按 KPI → 分组 → 子 KPI 的层级解释得分来源，不改变任何已计算结果。",
	      "汇总型指标只读取 formulaBreakdown：例如 问题解决率总得分 = 工单一次性解决率总分 + 网点接通率得分。",
	      "叶子 KPI 只展示已有的得分、满分、率值和当前值，不强行生成汇总公式。"
	    ],
	    driver_detection_logic: [
	      "只从已有数据的 KPI 中选择驱动项，missing 节点不参与 Top 3。",
	      "优先选择得分率偏低、对所在分组影响明显、并处在业务链路关键位置的 KPI。",
	      "驱动项用于解释为什么分组承压，不用于重新计算分组得分。"
	    ],
	    bottleneck_ranking_logic: [
	      "Top 1 / Top 2 / Top 3 按薄弱程度排序：先看得分率，再看得分贡献和链路位置。",
	      "同等情况下，优先选择更靠近上游、会影响后续问题闭环的 KPI。",
	      "排序只用于决策优先级展示，不修改原始 KPI 排名或分数。"
	    ],
	    causal_chain_logic: [
	      "因果链按 Process → Driver → Result → Total KPI impact 组织。",
	      "问题解决链路固定表达为：首次解决能力 → 客户求助压力 → 网点查件 / 工单流转 → 预警工单压力 → 问题解决表现 → KPI总分承压。",
	      "没有 previousValue / changePercent 时，只使用承压、偏弱、需要关注，不输出上升或下降判断。"
	    ]
	  };
	  const causalChain = [
    {
      node_name: "首次解决能力偏弱",
      mapped_kpi: "工单一次性解决率总分",
      score: firstResolutionTotal?.score ?? null,
      max_score: 25,
      rate_value: firstResolutionTotal?.rate ?? null,
      evidence_status: firstResolutionTotal?.score !== null && firstResolutionTotal?.score !== undefined ? "strong" : "missing",
      interpretation: "首次处理阶段承压，会影响后续客户求助和工单闭环。"
    },
    {
      node_name: "客户求助压力",
      mapped_kpi: "客户求助",
      score: customerHelp?.score ?? null,
      max_score: customerHelp?.maxScore ?? 13,
      rate_value: customerHelp?.rate ?? null,
      evidence_status: customerHelp?.hasData ? "strong" : "missing",
      interpretation: "客户求助得分偏低时，说明客户问题没有充分在前置环节闭环。"
    },
    {
      node_name: "网点查件 / 工单流转",
      mapped_kpi: "网点查件",
      score: networkInquiry?.score ?? null,
      max_score: networkInquiry?.maxScore ?? 7,
      rate_value: networkInquiry?.rate ?? null,
      evidence_status: networkInquiry?.hasData ? "strong" : "missing",
      interpretation: "网点查件是工单继续流转的代理信号，不等同于重复流转本身。"
    },
    {
      node_name: "预警工单压力",
      mapped_kpi: "预警工单",
      score: warningTicket?.score ?? null,
      max_score: warningTicket?.maxScore ?? 5,
      rate_value: warningTicket?.rate ?? null,
      evidence_status: warningTicket?.hasData ? "strong" : "missing",
      interpretation: "预警工单偏弱会放大后续问题闭环压力。"
    },
    {
      node_name: "问题解决表现偏弱",
      mapped_kpi: "问题解决率总得分",
      score: problemResolutionTotal?.score ?? null,
      max_score: 30,
      rate_value: problemResolutionTotal?.rate ?? null,
      evidence_status: problemResolutionTotal?.score !== null && problemResolutionTotal?.score !== undefined ? "strong" : "missing",
      interpretation: "问题解决率总得分由网点接通率和工单一次性解决率共同解释。"
    },
    {
      node_name: "KPI总分承压",
      mapped_kpi: "KPI总分",
      score: systemTotalKpi(metricResults)?.score ?? null,
      max_score: 100,
      rate_value: systemTotalKpi(metricResults)?.rate ?? null,
      evidence_status: systemTotalKpi(metricResults)?.score !== null && systemTotalKpi(metricResults)?.score !== undefined ? "strong" : "missing",
      interpretation: "模块薄弱会传导到整体 KPI 总分。"
    }
  ];
  const kpiRoleClassification = buildKpiRoleClassification(groups, formulaBreakdowns);
  const processKpiAnalysis = buildProcessKpiAnalysis(groups);

  return {
		    formula_breakdowns: formulaBreakdowns,
		    analysis_process: analysisProcess,
		    process_kpi_analysis: processKpiAnalysis,
		    weak_links: weakLinks,
    causal_chain: causalChain,
    primary_bottleneck: primary ? {
      kpi_name: primary.kpi_name,
      reason: `${primary.kpi_name} 是当前得分率较低的有数据节点，需要优先复盘。`,
      evidence: [`得分 ${formatNumber(primary.score)} / ${formatNumber(primary.max_score)}`, primary.rate_value !== null ? `率值 ${formatNumber(primary.rate_value)}` : ""].filter(Boolean),
      business_impact: "该指标持续偏弱会沿业务链路传导，增加后续问题闭环压力。"
    } : {},
	    top_3_drivers: topDrivers,
	    top_3_kpis: topKpiResults,
	    primary_bottleneck_result: resultPrimaryBottleneck,
	    decision_causal_chain: compressedChain,
	    decision_plan: resultDecision,
	    decision: resultDecision,
	    result_generation: {
	      top_3_kpis: topKpiResults,
	      primary_bottleneck: resultPrimaryBottleneck,
	      causal_chain: compressedChain,
	      decision: resultDecision
	    },
	    key_insight: primary
      ? `当前最关键决策不是扩大分析范围，而是先处理 ${primary.kpi_name} 这个主瓶颈。`
      : "当前数据不足，暂不输出关键决策洞察。",
    driver_analysis: groups
      .filter((group) => group.kpis.some((kpi) => kpi.hasData))
      .map((group) => ({
        group_name: group.group_name,
        top_drivers: group.kpis.filter((kpi) => kpi.hasData).slice(0, 3).map((kpi) => kpi.kpi_name),
        weak_drivers: weakLinks.filter((item) => item.group_name === group.group_name).slice(0, 2).map((item) => item.kpi_name)
      })),
    root_causes: weakLinks.slice(0, 5).map((item) => ({
      group_name: item.group_name,
      cause: `${item.kpi_name} 对 ${item.group_name} 形成压力。`,
      evidence_kpis: [item.kpi_name]
    })),
    insights: {
      what_happened: weakLinks.length ? [`当前主要薄弱 KPI 是 ${weakLinks.slice(0, 3).map((item) => item.kpi_name).join("、")}。`] : ["当前没有足够的 KPI 数据形成判断。"],
      why_it_happened: weakLinks.slice(0, 3).map((item) => `${item.kpi_name} 得分相对满分偏低，是对应分组的拖累信号。`),
      so_what: weakLinks.length ? ["如果薄弱 KPI 持续承压，会影响问题闭环效率，并传导到分组得分和 KPI 总分。"] : ["当前数据不足，暂不输出业务影响判断。"]
    },
    action_plan: {
      p0: primary ? [`优先复盘 ${primary.kpi_name}：按问题类型、责任网点、处理时长拆分来源，定位高频原因。`] : [],
      p1: weakLinks.slice(1, 3).map((item) => `围绕 ${item.kpi_name} 建立日常跟踪和责任闭环。`),
      p2: ["将客户求助、网点查件、预警工单串成问题闭环链路看板，避免只看单点指标。"]
    },
    kpi_role_classification: kpiRoleClassification
  };
}

function buildMetricObjectAttentionReport(metricResults: AiReportInputRecord[]) {
  const logisticsGroups: LogisticsDriverGroup[] = logisticsDriverMap.map((group) => ({
    group_name: group.groupName,
    group_score: groupScore(metricResults, group),
    group_rate: groupRate(metricResults, group),
    kpis: group.drivers.map((driver) => driverData(metricResults, driver))
  }));
  const optimization = buildKpiAnalysisOptimization(logisticsGroups, metricResults);
  const changedMetrics = metricResults.filter((metric) => metricChange(metric) !== null);
  const focusNames = optimization.weak_links.slice(0, 3).map((item) => item.kpi_name);
  const hasComparison = changedMetrics.length > 0;
  const causalChainAnalysis = buildProblemResolutionCausalChain(logisticsGroups, metricResults);

	  return {
		    analysisVersion: "kpi_analysis_optimization_v1",
		    formula_breakdowns: optimization.formula_breakdowns,
	    weak_links: optimization.weak_links,
	    primary_bottleneck: optimization.primary_bottleneck,
	    primary_bottleneck_result: optimization.primary_bottleneck_result,
	    top_3_drivers: optimization.top_3_drivers,
	    top_3_kpis: optimization.top_3_kpis,
	    causal_chain: optimization.decision_causal_chain,
	    decision_plan: optimization.decision_plan,
	    decision: optimization.decision,
	    result_generation: optimization.result_generation,
	    process_kpi_analysis: optimization.process_kpi_analysis,
	    key_insight: optimization.key_insight,
	    executive_summary: {
      overall_assessment: focusNames.length ? "当前报告存在可定位的 KPI 薄弱环节。" : "当前报告暂无可解释的 KPI 薄弱环节。",
      key_message: focusNames.length
        ? `优先关注 ${focusNames.join("、")}。${hasComparison ? "存在可用昨日对比字段。" : "当前报告缺少 previousValue / changePercent，因此不输出上升或下降判断。"}`
        : "当前没有足够的已计算指标用于经营解读。",
      score_interpretation: hasComparison
        ? "基于已计算 KPI 与对比字段解释结果，不参与指标计算。"
        : "基于当前已计算 KPI 结果，只解释已有数值，不补算、不改写指标。"
    },
    score_decomposition: optimization.formula_breakdowns.map((item) => ({
      group_name: item.title,
      group_score: item.final_score,
      group_rate: item.max_score ? item.final_score !== null ? item.final_score / item.max_score : null : null,
      interpretation: [
        item.formula_text,
        item.value_text,
        item.result_text,
        item.warning
      ].filter(Boolean).join("；")
    })),
    key_risks: optimization.weak_links.slice(0, 6).map((item) => ({
      risk_name: `${item.kpi_name} 需要关注`,
      related_group: item.group_name,
      evidence: [
        `得分 ${formatNumber(item.score)} / ${formatNumber(item.max_score)}`,
        item.rate_value !== null ? `率值 ${formatNumber(item.rate_value)}` : null,
        `证据状态 ${item.evidence_status}`
      ].filter((value): value is string => Boolean(value)),
      business_impact: item.interpretation
    })),
    root_cause_hypotheses: optimization.weak_links.slice(0, 5).map((item) => ({
      hypothesis: `${item.kpi_name} 是 ${item.group_name} 中需要优先复盘的薄弱信号`,
      evidence: [`得分 ${formatNumber(item.score)} / ${formatNumber(item.max_score)}`, item.rate_value !== null ? `率值 ${formatNumber(item.rate_value)}` : ""].filter(Boolean),
      confidence: item.evidence_status === "strong" ? "medium" : "low"
    })),
    action_plan: optimization.action_plan,
    driver_analysis: optimization.driver_analysis,
    causal_chains: optimization.causal_chain.map((item) => ({ chain: item.node_name })),
    driver_root_causes: optimization.root_causes,
    insights: optimization.insights,
    causal_chain_analysis: causalChainAnalysis,
    data_notes: [hasComparison
      ? "分析基于已计算 KPI 的 currentValue / previousValue / changePercent；AI 不重新计算指标。"
      : "当前报告缺少昨日对比字段，分析只基于当前已计算 KPI。"]
  };
}

function findMetric(metricResults: AiReportInputRecord[], aliases: string[], role?: "score" | "rate" | "value") {
  const aliasKeys = aliases.map(compact);
  const rolePatterns = {
    score: [/得分/, /score/],
    rate: [/率值/, /占比/, /rate/],
    value: [/分子/, /责任量/, /订单量/, /业务量/, /签收量/, /value/, /volume/]
  };

  return metricResults.find((metric) => {
    const text = metricText(metric);
    if (!aliasKeys.some((alias) => alias && text.includes(alias))) return false;
    if (!role) return true;
    return rolePatterns[role].some((pattern) => pattern.test(text));
  }) ?? null;
}

function driverData(metricResults: AiReportInputRecord[], driver: KpiDriverDefinition["drivers"][number]) {
  const scoreMetric = findMetric(metricResults, driver.aliases, "score");
  const rateMetric = findMetric(metricResults, driver.aliases, "rate");
  const valueMetric = findMetric(metricResults, driver.aliases, "value") ?? findMetric(metricResults, driver.aliases);
  const score = metricNumericValue(scoreMetric);
  const rate = metricNumericValue(rateMetric);
  const value = metricNumericValue(valueMetric);

  return {
    kpi_name: driver.name,
    value,
    score,
    rate,
    maxScore: driver.maxScore ?? null,
    hasData: score !== null || rate !== null || value !== null
  };
}

type LogisticsDriverGroup = {
  group_name: string;
  group_score: number | null;
  group_rate: number | null;
  kpis: Array<{
    kpi_name: string;
    value: number | null;
    score: number | null;
    rate: number | null;
    maxScore?: number | null;
    hasData: boolean;
  }>;
};

function driverImpact(kpi: LogisticsDriverGroup["kpis"][number]) {
  if (kpi.score !== null) return kpi.score;
  if (kpi.rate !== null) return kpi.rate;
  if (kpi.value !== null) return Math.abs(kpi.value);
  return null;
}

function sortedDriversByImpact(group: LogisticsDriverGroup) {
  return group.kpis
    .filter((kpi) => kpi.hasData)
    .map((kpi) => ({ kpi, impact: driverImpact(kpi) }))
    .filter((item): item is { kpi: LogisticsDriverGroup["kpis"][number]; impact: number } => item.impact !== null)
    .sort((left, right) => right.impact - left.impact);
}

function impactLevelForKpi(kpi: LogisticsDriverGroup["kpis"][number]): "low" | "medium" | "high" {
  if (kpi.score !== null) {
    if (kpi.score <= 2) return "high";
    if (kpi.score <= 5) return "medium";
    return "low";
  }
  if (kpi.rate !== null) {
    if (kpi.rate <= 0.7 || kpi.rate <= 70) return "high";
    if (kpi.rate <= 0.9 || kpi.rate <= 90) return "medium";
  }
  return "low";
}

function causalKpiEvidence(kpi: LogisticsDriverGroup["kpis"][number]) {
  return {
    kpi_name: kpi.kpi_name,
    value: kpi.value,
    score: kpi.score,
    rate: kpi.rate,
    maxScore: kpi.maxScore ?? null,
    has_data: kpi.hasData
  };
}

function exactMetric(metricResults: AiReportInputRecord[], aliases: string[]) {
  const targets = aliases.map(compact).filter(Boolean);
  return metricResults.find((metric) => {
    const tokens = metricIdentityTokens(metric);
    return targets.some((target) => tokens.includes(target));
  }) ?? null;
}

function systemTotalKpi(metricResults: AiReportInputRecord[] = []) {
  const scoreMetric = exactMetric(metricResults, ["KPI总分", "kpi_total_score", "total_score"]);
  const rateMetric = exactMetric(metricResults, ["得分率", "KPI得分率", "kpi_score_rate", "total_rate"]);
  const score = metricNumericValue(scoreMetric);
  const rate = metricNumericValue(rateMetric);

  if (score === null && rate === null) return null;

  return {
    kpi_name: "KPI总分",
    value: null,
    score,
    rate: rate ?? (score !== null ? score / 100 : null),
    maxScore: 100,
    hasData: true
  };
}

function summaryKpiFromMetric(
  metricResults: AiReportInputRecord[],
  aliases: string[],
  displayName: string,
  maxScore: number
) {
  const scoreMetric = exactMetric(metricResults, aliases) ?? findMetric(metricResults, aliases, "score");
  const score = metricNumericValue(scoreMetric);

  if (score === null) return null;

  return {
    kpi_name: displayName,
    value: null,
    score,
    rate: score / maxScore,
    maxScore,
    hasData: true
  };
}

function buildProblemResolutionCausalChain(groups: LogisticsDriverGroup[], metricResults: AiReportInputRecord[] = []) {
  const problemGroup = groups.find((group) => compact(group.group_name).includes("问题解决")) ?? null;
  const fallbackGroup = groups.find((group) => group.kpis.some((kpi) => compact(kpi.kpi_name).includes("工单"))) ?? null;
  const targetGroup = problemGroup ?? fallbackGroup;
  const kpis = targetGroup?.kpis.filter((kpi) => kpi.hasData) ?? [];
  const byName = (keywords: string[]) => kpis.find((kpi) => {
    const text = compact(kpi.kpi_name);
    return keywords.some((keyword) => text.includes(compact(keyword)));
  }) ?? null;
  const firstResolutionTotal = summaryKpiFromMetric(
    metricResults,
    ["工单一次性解决率总分", "工单一次性解决率 总分"],
    "工单一次性解决率总分",
    25
  );
  const problemResolutionTotal = summaryKpiFromMetric(
    metricResults,
    ["问题解决率总得分", "问题解决率 总得分", "问题解决总得分"],
    "问题解决率总得分",
    30
  ) ?? (targetGroup ? {
    kpi_name: "问题解决率总得分",
    value: null,
    score: targetGroup.group_score,
    rate: targetGroup.group_score !== null ? targetGroup.group_score / 30 : targetGroup.group_rate,
	    maxScore: 30,
	    hasData: targetGroup.group_score !== null || targetGroup.group_rate !== null
	  } : null);
  const pickupTotal = summaryKpiFromMetric(metricResults, ["散件揽收总得分", "散件揽收 总得分"], "散件揽收总得分", 20);
  const timelinessTotal = summaryKpiFromMetric(metricResults, ["时效达成总得分", "时效达成 总得分"], "时效达成总得分", 20);
  const deliveryTotal = summaryKpiFromMetric(metricResults, ["投递规范总得分", "投递规范 总得分"], "投递规范总得分", 30);
  const penaltyTotal = summaryKpiFromMetric(metricResults, ["加减分项总得分", "加减分项 总得分", "总减分"], "加减分项总得分", 0);
  const leafBreakdown = (title: string, kpi: LogisticsDriverGroup["kpis"][number] | null) => ({
    type: "result",
    title,
    expression: `${title}得分 / 满分，结合率值查看当前表现`,
    valueText: `= ${formatNumber(kpi?.score)} / ${formatNumber(kpi?.maxScore)} · 率值 ${kpi?.rate !== null && kpi?.rate !== undefined ? `${(Math.abs(kpi.rate) <= 1 ? kpi.rate * 100 : kpi.rate).toFixed(2)}%` : "-"}`,
    resultText: `= 当前得分 ${formatNumber(kpi?.score)}`,
    components: [
      { name: `${title}得分`, score: kpi?.score ?? null, maxScore: kpi?.maxScore ?? null },
      { name: `${title}率值`, score: kpi?.rate ?? null, maxScore: null }
    ],
    finalScore: kpi?.score ?? null,
    maxScore: kpi?.maxScore ?? null
  });
  const chainKpis = [
    { stage: "首次解决能力偏弱", kpi: firstResolutionTotal, rateLabel: "得分率" },
    { stage: "客户求助压力", kpi: byName(["客户求助"]), rateLabel: "率值" },
    { stage: "网点查件压力", kpi: byName(["网点查件"]) ?? byName(["二次工单", "重复进线"]), rateLabel: "率值" },
    { stage: "预警工单压力", kpi: byName(["预警工单"]), rateLabel: "率值" },
    { stage: "问题解决表现偏弱", kpi: problemResolutionTotal, rateLabel: "得分率" },
    { stage: "KPI总分承压", kpi: systemTotalKpi(metricResults), rateLabel: "得分率" }
  ];
  const calculationBreakdownForNode = (stage: string) => {
    if (stage === "首次解决能力偏弱") {
      return {
	        type: "formula",
	        title: "工单一次性解决率总分",
	        expression: "客户求助得分 + 网点查件得分 + 预警工单得分",
	        valueText: `= ${formatNumber(byName(["客户求助"])?.score)} + ${formatNumber(byName(["网点查件"])?.score)} + ${formatNumber(byName(["预警工单"])?.score)}`,
	        resultText: `= ${formatNumber(firstResolutionTotal?.score)}`,
	        components: [
	          { name: "客户求助", score: byName(["客户求助"])?.score ?? null, maxScore: byName(["客户求助"])?.maxScore ?? 13 },
	          { name: "网点查件", score: byName(["网点查件"])?.score ?? null, maxScore: byName(["网点查件"])?.maxScore ?? 7 },
          { name: "预警工单", score: byName(["预警工单"])?.score ?? null, maxScore: byName(["预警工单"])?.maxScore ?? 5 }
        ],
        finalScore: firstResolutionTotal?.score ?? null,
        maxScore: 25
      };
    }
    if (stage === "问题解决表现偏弱") {
      return {
	        type: "formula",
	        title: "问题解决率总得分",
	        expression: "工单一次性解决率总分 + 网点接通率得分",
	        valueText: `= ${formatNumber(firstResolutionTotal?.score)} + ${formatNumber(byName(["网点接通率"])?.score)}`,
	        resultText: `= ${formatNumber(problemResolutionTotal?.score)}`,
	        components: [
	          { name: "工单一次性解决率总分", score: firstResolutionTotal?.score ?? null, maxScore: 25 },
	          { name: "网点接通率", score: byName(["网点接通率"])?.score ?? null, maxScore: byName(["网点接通率"])?.maxScore ?? 5 }
        ],
        finalScore: problemResolutionTotal?.score ?? null,
	        maxScore: 30
	      };
	    }
	    if (stage === "客户求助压力") return leafBreakdown("客户求助", byName(["客户求助"]));
	    if (stage === "网点查件压力") return leafBreakdown("网点查件", byName(["网点查件"]) ?? byName(["二次工单", "重复进线"]));
	    if (stage === "预警工单压力") return leafBreakdown("预警工单", byName(["预警工单"]));
	    if (stage === "KPI总分承压") {
	      const total = systemTotalKpi(metricResults);
	      return {
	        type: "formula",
	        title: "KPI总分",
	        expression: "散件揽收总得分 + 时效达成总得分 + 投递规范总得分 + 问题解决率总得分 + 加减分项总得分",
	        valueText: `= ${formatNumber(pickupTotal?.score)} + ${formatNumber(timelinessTotal?.score)} + ${formatNumber(deliveryTotal?.score)} + ${formatNumber(problemResolutionTotal?.score)} + ${formatNumber(penaltyTotal?.score)}`,
	        resultText: `= ${formatNumber(total?.score)}`,
	        components: [
	          { name: "散件揽收总得分", score: pickupTotal?.score ?? null, maxScore: 20 },
	          { name: "时效达成总得分", score: timelinessTotal?.score ?? null, maxScore: 20 },
	          { name: "投递规范总得分", score: deliveryTotal?.score ?? null, maxScore: 30 },
	          { name: "问题解决率总得分", score: problemResolutionTotal?.score ?? null, maxScore: 30 },
	          { name: "加减分项总得分", score: penaltyTotal?.score ?? null, maxScore: null }
	        ],
	        finalScore: total?.score ?? null,
	        maxScore: 100
	      };
	    }
	    return null;
	  };
  const chainNodes = chainKpis.map((item) => ({
    stage: item.stage,
    kpi_name: item.kpi?.kpi_name ?? null,
    value: item.kpi?.value ?? null,
    score: item.kpi?.score ?? null,
    rate: item.kpi?.rate ?? null,
    maxScore: item.kpi?.maxScore ?? null,
    rateLabel: item.rateLabel,
    calculationBreakdown: calculationBreakdownForNode(item.stage),
    status: item.kpi?.hasData ? "valid" : "missing"
  }));
  const impactItems = chainKpis
    .filter((item): item is { stage: string; rateLabel: string; kpi: LogisticsDriverGroup["kpis"][number] } => Boolean(item.kpi?.hasData))
    .map((item) => ({
      kpi_name: item.kpi.kpi_name,
      group_name: targetGroup?.group_name ?? "问题解决",
      value: item.kpi.value,
      score: item.kpi.score,
      rate: item.kpi.rate,
      maxScore: item.kpi.maxScore ?? null,
      rateLabel: item.rateLabel,
      impact_level: impactLevelForKpi(item.kpi),
      reason: `${item.stage} 是问题解决链路中的已计算信号。`
    }));
  const primary = [...impactItems].sort((left, right) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[right.impact_level] - order[left.impact_level];
  })[0] ?? null;

  return {
    causal_chain: [
      {
        stage: "KPI → Group → System",
        chain: "首次解决能力偏弱 → 客户求助压力 → 网点查件压力 → 预警工单压力 → 问题解决表现偏弱 → KPI总分承压"
      }
    ],
    chain_nodes: chainNodes,
    bottlenecks: {
      primary_bottleneck_group: targetGroup?.group_name ?? "问题解决",
      primary_bottleneck_kpi: primary?.kpi_name ?? "",
      primary_bottleneck_evidence: primary
        ? causalKpiEvidence(kpis.find((kpi) => kpi.kpi_name === primary.kpi_name) ?? {
            kpi_name: primary.kpi_name,
            value: null,
            score: null,
            rate: null,
            maxScore: null,
            hasData: false
          })
        : null,
      secondary_bottlenecks: impactItems
        .filter((item) => item.kpi_name !== primary?.kpi_name)
        .slice(0, 3)
        .map((item) => item.kpi_name)
    },
    impact_analysis: impactItems,
    system_insight: {
      root_cause_stage: primary?.kpi_name || "insufficient data",
      explanation: primary
        ? `${primary.kpi_name} 是当前问题解决链路中最需要优先复盘的瓶颈信号，会沿链路影响问题解决表现，并传导到 KPI 总分。`
        : "当前问题解决链路缺少足够的已计算 KPI，无法定位唯一主瓶颈。"
    }
  };
}

function buildKpiDriverInsight(groups: LogisticsDriverGroup[], metricResults: AiReportInputRecord[] = []) {
  const groupsWithData = groups.filter((group) => group.kpis.some((kpi) => kpi.hasData));
  const weakGroups = groupsWithData.filter((group) => {
    if (group.group_rate !== null) return group.group_rate < 0.7 || group.group_rate < 70;
    return group.kpis.some((kpi) => kpi.score === 0);
  });
  const focusGroups = weakGroups.length ? weakGroups : groupsWithData.slice(0, 3);
  const causalChainAnalysis = buildProblemResolutionCausalChain(groups, metricResults);

  return {
    driver_analysis: groupsWithData.map((group) => {
      const sorted = sortedDriversByImpact(group);
      const weak = [...sorted].reverse();
      return {
        group_name: group.group_name,
        top_drivers: sorted.slice(0, 3).map((item) => item.kpi.kpi_name),
        weak_drivers: weak.slice(0, 2).map((item) => item.kpi.kpi_name)
      };
    }),
    causal_chains: focusGroups.flatMap((group) => {
      const weakDrivers = sortedDriversByImpact(group).reverse().slice(0, 2);
      return weakDrivers.map((item) => ({
        chain: `${item.kpi.kpi_name}表现偏弱 → ${group.group_name}承压 → KPI总分承压`
      }));
    }),
    root_causes: focusGroups.slice(0, 5).map((group) => {
      const weakDrivers = sortedDriversByImpact(group).reverse().slice(0, 3).map((item) => item.kpi.kpi_name);
      return {
        group_name: group.group_name,
        cause: `${group.group_name} 相关流程可能存在执行效率或闭环压力。`,
        evidence_kpis: weakDrivers
      };
    }),
    insights: {
      what_happened: focusGroups.length
        ? focusGroups.map((group) => `${group.group_name} 是当前需要关注的业务模块。`)
        : ["当前没有足够的 KPI 数据形成驱动判断。"],
      why_it_happened: focusGroups.flatMap((group) =>
        sortedDriversByImpact(group).reverse().slice(0, 2).map((item) => `${item.kpi.kpi_name} 是 ${group.group_name} 的主要拖累信号。`)
      ),
      so_what: focusGroups.map((group) => `${group.group_name} 若持续承压，会影响整体服务质量和 KPI 总分稳定性。`)
    },
    causal_chain_analysis: causalChainAnalysis
  };
}

function groupScore(metricResults: AiReportInputRecord[], group: KpiDriverDefinition) {
  const scoreAliases = group.aliases.flatMap((alias) => {
    const rateAlias = alias.endsWith("率") ? alias : `${alias}率`;
    return [`${alias}总得分`, `${alias}得分`, `${rateAlias}总得分`, `${rateAlias}得分`];
  });
  const scoreMetric = findMetric(
    metricResults,
    scoreAliases,
    "score"
  ) ?? findMetric(metricResults, scoreAliases);

  return metricNumericValue(scoreMetric);
}

function groupRate(metricResults: AiReportInputRecord[], group: KpiDriverDefinition) {
  const rateAliases = group.aliases.flatMap((alias) => {
    const rateAlias = alias.endsWith("率") ? alias : `${alias}率`;
    return [`${alias}得分率`, `${rateAlias}得分率`];
  });
  const rateMetric = findMetric(
    metricResults,
    rateAliases,
    "rate"
  ) ?? findMetric(metricResults, rateAliases);

  return metricNumericValue(rateMetric);
}

export function buildKpiAiReportJson(input: {
  metricResults: AiReportInputRecord[];
  aggregationResults: AiReportInputRecord[];
  auditReport?: AiReportInputRecord | null;
  composedReport?: AiReportInputRecord | null;
  report?: AiReportInputRecord | null;
}) {
  const dimensionTables = dimensionTablesFromInput(input);

  if (dimensionTables.length > 0) {
    return buildEcommerceAiReport(dimensionTables);
  }

  const metricResults = input.metricResults.filter((metric) => {
    const status = String(metric.status ?? "computed");
    return status === "computed" || status === "valid" || status === "zero" || status === "missing";
  });

  if (metricResults.some((metric) => asNumber(metric.currentValue ?? metric.value) !== null)) {
    return buildMetricObjectAttentionReport(metricResults);
  }

  const groups: LogisticsDriverGroup[] = logisticsDriverMap.map((group) => {
    const kpis = group.drivers.map((driver) => driverData(metricResults, driver));

    return {
      group_name: group.groupName,
      group_score: groupScore(metricResults, group),
      group_rate: groupRate(metricResults, group),
      kpis
    };
  });
  const groupsWithData = groups.filter((group) => group.kpis.some((kpi) => kpi.hasData));
  const weakGroups = groupsWithData.filter((group) => {
    const rate = group.group_rate;
    if (typeof rate === "number") return rate < 0.7 || rate < 70;
    return group.kpis.some((kpi) => kpi.score === 0);
  });
  const focusGroups = weakGroups.length ? weakGroups : groupsWithData.slice(0, 2);
  const totalScoreMetric = findMetric(metricResults, ["KPI总分", "总分"], "score") ?? findMetric(metricResults, ["KPI总分", "总分"]);
  const totalRateMetric = findMetric(metricResults, ["得分率"], "rate") ?? findMetric(metricResults, ["得分率"]);
  const totalScore = metricNumericValue(totalScoreMetric);
  const totalRate = metricNumericValue(totalRateMetric);
  const driverInsight = buildKpiDriverInsight(groups, metricResults);

  return {
    executive_summary: {
      overall_assessment: focusGroups.length ? "当前网络整体存在压力。" : "当前报告暂无总体判断。",
      key_message: focusGroups.length
        ? `主要关注点是 ${focusGroups.map((group) => group.group_name).join("、")}，需要关注低分 KPI。`
        : "当前没有足够的 KPI 数据用于判断。",
      score_interpretation: [
        totalScore !== null ? `KPI 总分 ${totalScore}` : null,
        totalRate !== null ? `得分率 ${totalRate}%` : null
      ].filter(Boolean).join("，") || "insufficient data"
    },
    score_decomposition: groupsWithData.map((group) => {
      const signals = group.kpis
        .filter((kpi) => kpi.hasData)
        .slice(0, 2)
        .map((kpi) => `${kpi.kpi_name}${kpi.score !== null ? `，得分 ${kpi.score}` : ""}${kpi.rate !== null ? `，率值 ${kpi.rate}%` : ""}`)
        .join("；");

      return {
        group_name: group.group_name,
        group_score: group.group_score,
        group_rate: group.group_rate,
        interpretation: signals
          ? `${group.group_name} 当前表现偏弱，需要关注低分 KPI。主要信号：${signals}。`
          : `${group.group_name} 当前数据不足。`
      };
    }),
    key_risks: focusGroups.slice(0, 5).map((group) => ({
      risk_name: `${group.group_name} 得分压力`,
      related_group: group.group_name,
      evidence: [
        group.group_rate !== null ? `得分率 ${group.group_rate}%` : null,
        ...group.kpis
          .filter((kpi) => kpi.hasData)
          .slice(0, 3)
          .map((kpi) => `${kpi.kpi_name}${kpi.score !== null ? ` 得分 ${kpi.score}` : ""}${kpi.rate !== null ? ` 率值 ${kpi.rate}%` : ""}`)
      ].filter((item): item is string => Boolean(item)),
      business_impact: `${group.group_name} 当前表现偏弱，需要关注低分 KPI。`
    })),
    root_cause_hypotheses: focusGroups.slice(0, 5).map((group) => ({
      hypothesis: `${group.group_name} 相关执行环节存在压力`,
      evidence: group.kpis
        .filter((kpi) => kpi.hasData)
        .slice(0, 3)
        .map((kpi) => `${kpi.kpi_name}${kpi.score !== null ? ` 得分 ${kpi.score}` : ""}${kpi.rate !== null ? ` 率值 ${kpi.rate}%` : ""}`),
      confidence: "medium"
    })),
    action_plan: {
      p0: focusGroups.slice(0, 2).map((group) => `优先复盘 ${group.group_name} 的低分 KPI 和异常网点。`),
      p1: focusGroups.slice(2, 5).map((group) => `建立 ${group.group_name} 的日常跟踪和责任闭环。`),
      p2: ["保留指标口径审计，避免 AI 或前端改变计算结果。"]
    },
    driver_analysis: driverInsight.driver_analysis,
    causal_chains: driverInsight.causal_chains,
    driver_root_causes: driverInsight.root_causes,
    insights: driverInsight.insights,
    causal_chain_analysis: driverInsight.causal_chain_analysis,
    data_notes: groupsWithData.length ? [] : ["insufficient data"]
  };
}
