export type RawKpiForFramework = {
  name: string;
  value?: unknown;
  today?: unknown;
  yesterday?: unknown;
  definition?: string | null;
};

export type KpiFrameworkGroupName = "Volume" | "Speed" | "Quality" | "Experience";

export type KpiFrameworkGroup = {
  group_name: KpiFrameworkGroupName;
  purpose: string;
  kpis: RawKpiForFramework[];
};

export type KpiFrameworkTree = {
  level1_groups: KpiFrameworkGroup[];
  missing_groups: KpiFrameworkGroupName[];
};

export type QualityKpiCategory =
  | "First-touch failure"
  | "Rework / repetition"
  | "Customer escalation"
  | "Follow-up failure";

export type QualityKpiDiagnostic = {
  name: string;
  category: QualityKpiCategory;
  meaning: string;
  what_it_indicates: string;
  possible_causes: string[];
  risk_level: "low" | "medium" | "high";
};

export type QualityKpiDiagnostics = {
  quality_kpis: QualityKpiDiagnostic[];
};

const frameworkGroups: Array<{ group_name: KpiFrameworkGroupName; purpose: string }> = [
  {
    group_name: "Volume",
    purpose: "Measures workload scale, inflow, and business demand."
  },
  {
    group_name: "Speed",
    purpose: "Measures response, handling, SLA, and resolution time performance."
  },
  {
    group_name: "Quality",
    purpose: "Measures correctness, unresolved work, rework, and repeat handling."
  },
  {
    group_name: "Experience",
    purpose: "Measures customer satisfaction, complaints, and negative feedback."
  }
];

function textForKpi(kpi: RawKpiForFramework) {
  return `${kpi.name} ${kpi.definition ?? ""}`.toLowerCase();
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function classifyKpiGroup(kpi: RawKpiForFramework): KpiFrameworkGroupName {
  const text = textForKpi(kpi);

  if (/满意|投诉|评分|差评|负面|csat|complaint|rating|satisfaction|negative feedback/.test(text)) return "Experience";
  if (/时间|时效|响应|处理时长|解决时长|sla|response[ _-]?time|resolution[ _-]?time|speed|timeliness/.test(text)) return "Speed";
  if (/重复|未解决|返工|催单|二次|回访未解决|失败|错误|rework|repeat|unresolved|second ticket|follow-up unresolved|urge|chasing|failed|error/.test(text)) return "Quality";
  if (/数量|工单|进线|订单|单量|分母|流入|规模|ticket|order|volume|inflow|demand|count/.test(text)) return "Volume";

  return "Volume";
}

export function buildKpiFrameworkTree(kpis: RawKpiForFramework[]): KpiFrameworkTree {
  const assigned = new Set<RawKpiForFramework>();
  const level1Groups = frameworkGroups.map((group) => {
    const groupKpis = kpis.filter((kpi) => {
      if (assigned.has(kpi)) return false;
      const matches = classifyKpiGroup(kpi) === group.group_name;
      if (matches) assigned.add(kpi);
      return matches;
    });

    return {
      ...group,
      kpis: groupKpis
    };
  });

  return {
    level1_groups: level1Groups,
    missing_groups: level1Groups
      .filter((group) => group.kpis.length === 0)
      .map((group) => group.group_name)
  };
}

function qualityCategory(kpi: RawKpiForFramework): QualityKpiCategory | null {
  const text = textForKpi(kpi);
  if (/催单|升级|投诉|urge|chasing|escalation|complaint/.test(text)) return "Customer escalation";
  if (/回访未解决|callback not solved|follow-up unresolved|followup/.test(text)) return "Follow-up failure";
  if (/二次|重复|返工|rework|repeat|second ticket|re-opened|reopened/.test(text)) return "Rework / repetition";
  if (/一次性未解决|未解决|first.*fail|first-touch|first resolution failed|unresolved/.test(text)) return "First-touch failure";
  return null;
}

function qualityMeaning(category: QualityKpiCategory) {
  if (category === "Customer escalation") return "Customers are actively pushing for resolution or escalating the issue.";
  if (category === "Follow-up failure") return "Cases remain unresolved even after follow-up or callback.";
  if (category === "Rework / repetition") return "The same issue is returning as repeat work or a second case.";
  return "The first handling attempt did not resolve the case.";
}

function qualityIndication(category: QualityKpiCategory, increased: boolean | null) {
  const movement = increased === true ? "increased, suggesting" : increased === false ? "decreased, suggesting less" : "is present, indicating";
  if (category === "Customer escalation") return `Customer escalation ${movement} pressure from slow response, unclear communication, or unresolved expectations.`;
  if (category === "Follow-up failure") return `Follow-up failure ${movement} gaps in resolution quality after the case is revisited.`;
  if (category === "Rework / repetition") return `Repeat work ${movement} incomplete diagnosis, handoff gaps, or weak closure checks.`;
  return `First-touch failure ${movement} a training, SOP, or first-line handling issue.`;
}

function possibleCauses(category: QualityKpiCategory) {
  if (category === "Customer escalation") return ["slow response", "unclear communication", "missed SLA"];
  if (category === "Follow-up failure") return ["weak closure evidence", "insufficient callback quality", "issue not fully resolved"];
  if (category === "Rework / repetition") return ["poor diagnosis", "missing SOP", "handover issues"];
  return ["training gap", "SOP mismatch", "insufficient first-line authority"];
}

function riskLevel(kpi: RawKpiForFramework, increased: boolean | null): QualityKpiDiagnostic["risk_level"] {
  const today = numeric(kpi.today ?? kpi.value);
  if (increased === true && today != null && today >= 8) return "high";
  if (increased === true) return "medium";
  if (today != null && today > 0) return "medium";
  return "low";
}

export function diagnoseQualityKpis(kpis: RawKpiForFramework[]): QualityKpiDiagnostics {
  const qualityKpis = kpis.flatMap((kpi) => {
    const category = qualityCategory(kpi);
    if (!category) return [];
    const today = numeric(kpi.today ?? kpi.value);
    const yesterday = numeric(kpi.yesterday);
    const increased = today == null || yesterday == null ? null : today > yesterday;

    return [{
      name: kpi.name,
      category,
      meaning: kpi.definition?.trim() || qualityMeaning(category),
      what_it_indicates: qualityIndication(category, increased),
      possible_causes: possibleCauses(category),
      risk_level: riskLevel(kpi, increased)
    }];
  });

  return { quality_kpis: qualityKpis };
}
