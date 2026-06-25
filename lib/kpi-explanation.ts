export type KpiExplanationDirection = "higher_is_better" | "lower_is_better" | null;

export type KpiExplanationInput = {
  name: string;
  today: number;
  yesterday: number | null;
  change_pct: number | null;
  definition?: string | null;
  formula?: string | null;
  direction?: KpiExplanationDirection;
};

export type KpiExplanation = {
  title: string;
  meaning: string;
  calculation: string;
  comparison: string | null;
  note: string | null;
};

function cleanTitle(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b(avg|average|sum|count distinct|count|median)\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "KPI";
}

function hasChinese(text: string) {
  return /[\u4e00-\u9fa5]/.test(text);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(4)).toString().replace(/\.?0+$/, "");
}

function sentence(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return /[.!?。！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function plainDefinition(definition: string | null | undefined) {
  const text = definition?.trim();
  if (!text) return null;
  if (/[(){};=<>]/.test(text) && !/[\u4e00-\u9fa5]/.test(text)) return null;
  return sentence(text);
}

function meaningFromName(title: string) {
  const text = title.toLowerCase();
  const isZh = hasChinese(title);
  if (/催单|urge/.test(text)) return isZh ? "客户主动“催促/升级”的行为次数。" : "Tracks cases where customers actively urged follow-up or escalated handling.";
  if (/回访未解决|followup/.test(text)) return isZh ? "统计回访后客户仍反馈未解决的工单数量。" : "Tracks cases still unresolved after follow-up.";
  if (/未解决|unresolved|repeat|重复|rework|二次/.test(text)) return isZh ? "统计首次处理未能解决、需要继续跟进的工单数量。" : "Tracks cases that were not resolved in the first handling attempt.";
  if (/complaint|投诉|客诉/.test(text)) return isZh ? "统计当前周期记录的客户投诉数量。" : "Tracks customer complaints recorded for this period.";
  if (/解决率|resolution rate|resolved rate|first contact/.test(text)) return isZh ? "统计工单在首次处理时被解决的比例。" : "Tracks the share of cases resolved during the first handling attempt.";
  if (/resolved|解决|完成|completed/.test(text)) return isZh ? "统计当前周期成功完成或解决的业务数量。" : "Tracks cases successfully completed during this period.";
  if (/revenue|sales|收入|销售|paid|支付/.test(text)) return isZh ? "统计当前周期产生的业务收入。" : "Tracks business revenue generated during this period.";
  if (/orders|订单|工单|tickets?/.test(text)) return isZh ? "统计当前周期记录的业务单量。" : "Tracks the number of operational cases recorded for this period.";
  if (/rank|排名/.test(text)) return isZh ? "展示该指标当前的排名位置。" : "Tracks the current ranking position for this KPI.";
  if (/score|得分|评分|总分/.test(text)) return isZh ? "展示该业务模块当前的 KPI 得分。" : "Tracks the KPI score for this operating area.";
  if (/rate|率/.test(text)) return isZh ? "展示该业务结果在总体中的占比。" : "Tracks the percentage outcome for this KPI.";
  return `Tracks the current value of ${title} for this period.`;
}

function calculationFromName(title: string) {
  const text = title.toLowerCase();
  const isZh = hasChinese(title);
  if (/催单|urge/.test(text)) return isZh ? "统计未解决原因包含“催单”，或催单标记为 true 的工单数。" : "Counts tickets whose unresolved reason indicates an urge order or whose urge-order flag is true.";
  if (/回访未解决|followup/.test(text)) return isZh ? "统计未解决原因包含“回访未解决”，或回访未解决标记为 true 的工单数。" : "Counts tickets marked as unresolved after follow-up.";
  if (/二次工单|second/.test(text)) return isZh ? "统计未解决原因包含“二次工单”，或二次工单标记为 true 的工单数。" : "Counts tickets that became a second ticket for the same issue.";
  if (/重复进线|repeat contact/.test(text)) return isZh ? "统计未解决原因包含“重复进线”，或重复进线标记为 true 的工单数。" : "Counts repeat contacts caused by unresolved issues.";
  if (/一次性未解决|unresolved/.test(text)) return isZh ? "统计首次处理后仍未解决的工单数。" : "Counts tickets not resolved during the first handling attempt.";
  if (/问题解决失分|score loss/.test(text)) return isZh ? "用问题解决模块满分减去当前问题解决得分。" : "Subtracts the current problem-resolution score from the target score.";
  return null;
}

function simplifyFormula(formula: string | null | undefined, title: string) {
  const isZh = hasChinese(title);
  const calculation = calculationFromName(title);
  if (calculation) return calculation;
  const text = formula?.trim();
  if (!text) return isZh ? "按该指标在语义层中绑定的业务字段统计。" : "Uses the business fields bound to this KPI in the semantic layer.";
  const normalized = text.toLowerCase();

  if (/first_resolution\s*=\s*false|unresolved|未解决/.test(normalized)) {
    return isZh ? "统计首次处理未解决的工单。" : "Counts cases that were not solved during the first handling attempt.";
  }
  if (/count_distinct|distinct/.test(normalized)) return isZh ? "统计去重后的记录数量。" : "Counts unique records for this KPI.";
  if (/count\s*\(/.test(normalized)) return isZh ? "统计符合该指标口径的记录数量。" : "Counts records that match this KPI definition.";
  if (/avg|average|mean/.test(normalized)) return isZh ? "计算该指标记录值的平均水平。" : "Averages the recorded values for this KPI.";
  if (/median/.test(normalized)) return isZh ? "取该指标记录值的中位数。" : "Uses the middle recorded value for this KPI.";
  if (/sum\s*\(/.test(normalized)) return isZh ? "汇总该指标对应的记录值。" : "Adds the recorded values for this KPI.";
  if (/safe_divide|\/|rate|率/.test(normalized)) return isZh ? "用相关数量除以对应的总量来得到比例。" : "Compares the relevant count against its eligible total.";
  if (/-\s*latest|- *avg|loss|失分/.test(normalized)) return isZh ? "衡量当前得分与目标分之间的差距。" : "Measures the gap between the current score and its target.";

  return isZh ? "使用该 KPI 已配置的计算口径。" : "Uses the configured formula for this KPI, simplified for display.";
}

function comparisonText(input: KpiExplanationInput) {
  if (input.yesterday == null) return null;
  const today = formatNumber(input.today);
  const yesterday = formatNumber(input.yesterday);
  const isZh = hasChinese(input.name);

  if (input.today === input.yesterday) return isZh ? `${today} vs ${yesterday}，与昨日持平。` : `${today} vs ${yesterday}, unchanged from yesterday.`;
  if (input.today > input.yesterday) return isZh ? `${today} vs ${yesterday}，较昨日上升。` : `${today} vs ${yesterday}, higher than yesterday.`;
  return isZh ? `${today} vs ${yesterday}，较昨日下降。` : `${today} vs ${yesterday}, lower than yesterday.`;
}

function noteText(input: KpiExplanationInput) {
  const isZh = hasChinese(input.name);
  if (input.yesterday == null) return isZh ? "暂无历史数据，无法进行趋势对比。" : "No previous data available for comparison.";
  if (input.today === input.yesterday) return null;

  const increased = input.today > input.yesterday;
  if (input.direction === "lower_is_better") {
    return increased
      ? (isZh ? "该指标越低越好，上升表示表现变差。" : "An increase indicates deterioration in performance.")
      : (isZh ? "该指标越低越好，下降表示表现改善。" : "A decrease indicates improvement in performance.");
  }
  if (input.direction === "higher_is_better") {
    return increased
      ? (isZh ? "该指标越高越好，上升表示表现改善。" : "An increase indicates improvement in performance.")
      : (isZh ? "该指标越高越好，下降表示表现变差。" : "A decrease indicates deterioration in performance.");
  }
  return isZh ? "当前未配置好坏方向，因此只描述变化，不判断好坏。" : "Direction is not configured, so this change is not labeled as good or bad.";
}

export function explainKpi(input: KpiExplanationInput): KpiExplanation {
  const title = cleanTitle(input.name);

  return {
    title,
    meaning: plainDefinition(input.definition) ?? meaningFromName(title),
    calculation: simplifyFormula(input.formula, title),
    comparison: comparisonText(input),
    note: noteText(input)
  };
}

export function explainKpis(items: KpiExplanationInput[]): { explanations: KpiExplanation[] } {
  return { explanations: items.map(explainKpi) };
}
