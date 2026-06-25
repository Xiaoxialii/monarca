export type KpiDirection = "higher_is_better" | "lower_is_better" | "unknown";
export type KpiSemanticLabel = "improvement" | "deterioration" | "stable" | "new_activity" | "no_activity";
export type KpiChangeType = "pct" | "new_activity" | "no_activity";

export type KpiNormalizationInput = {
  name: string;
  today: number;
  yesterday: number;
  higher_is_better: boolean | null;
};

export type KpiInterpretationInput = {
  name: string;
  today_value: number;
  yesterday_value: number;
  direction?: KpiDirection | null;
};

export type KpiInterpretation = {
  name: string;
  today: number;
  yesterday: number;
  change_pct: number | null;
  change_type: KpiChangeType;
  change: string;
  semantic_label: KpiSemanticLabel;
  insight: string;
  interpretation: string;
};

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(4)).toString();
}

function formatPercent(value: number) {
  const percent = value * 100;
  const text = Math.abs(percent) >= 10 ? percent.toFixed(1) : percent.toFixed(2);
  return `${percent > 0 ? "+" : ""}${text}%`;
}

function normalizeDirection(value: KpiDirection | null | undefined): KpiDirection {
  return value === "higher_is_better" || value === "lower_is_better" ? value : "unknown";
}

function directionFromBoolean(value: boolean | null): KpiDirection {
  if (value === true) return "higher_is_better";
  if (value === false) return "lower_is_better";
  return "unknown";
}

function changeType(today: number, yesterday: number): KpiChangeType {
  if (yesterday === 0 && today === 0) return "no_activity";
  if (yesterday === 0 && today > 0) return "new_activity";
  return "pct";
}

function changePct(today: number, yesterday: number) {
  return yesterday > 0 ? (today - yesterday) / yesterday : null;
}

function semanticLabel(today: number, yesterday: number, direction: KpiDirection): KpiSemanticLabel {
  if (yesterday === 0 && today === 0) return "no_activity";
  if (yesterday === 0 && today > 0) return "new_activity";
  if (today === yesterday) return "stable";
  if (direction === "unknown") return "stable";
  const increased = today > yesterday;
  if (direction === "higher_is_better") return increased ? "improvement" : "deterioration";
  return increased ? "deterioration" : "improvement";
}

function changeText(today: number, yesterday: number) {
  if (yesterday === 0 && today === 0) return "0 (no activity)";
  if (yesterday === 0 && today > 0) return `NEW +${formatNumber(today)}`;
  return formatPercent(changePct(today, yesterday) ?? 0);
}

function interpretationText(input: KpiInterpretationInput, label: KpiSemanticLabel, direction: KpiDirection) {
  const name = input.name;
  const today = formatNumber(input.today_value);
  const yesterday = formatNumber(input.yesterday_value);

  if (label === "new_activity") return `${name} appeared today with ${today}, previously none.`;
  if (label === "no_activity") return `${name} remained at 0 with no activity in either period.`;
  if (label === "stable") {
    if (input.today_value === input.yesterday_value) return `${name} stayed flat at ${today} versus ${yesterday}.`;
    return `${name} changed from ${yesterday} to ${today}; direction is unknown, so no business sentiment is inferred.`;
  }
  if (label === "improvement") {
    return direction === "lower_is_better"
      ? `${name} decreased from ${yesterday} to ${today}, which is an improvement for this KPI.`
      : `${name} increased from ${yesterday} to ${today}, which is an improvement for this KPI.`;
  }
  return direction === "lower_is_better"
    ? `${name} increased from ${yesterday} to ${today}, which is a deterioration for this KPI.`
    : `${name} decreased from ${yesterday} to ${today}, which is a deterioration for this KPI.`;
}

export function interpretKpis(items: KpiNormalizationInput[]): { results: KpiInterpretation[] } {
  return {
    results: items.map((item) => {
      const direction = directionFromBoolean(item.higher_is_better);
      const label = semanticLabel(item.today, item.yesterday, direction);
      const insight = interpretationText({
        name: item.name,
        today_value: item.today,
        yesterday_value: item.yesterday,
        direction
      }, label, direction);

      return {
        name: item.name,
        today: item.today,
        yesterday: item.yesterday,
        change_pct: changePct(item.today, item.yesterday),
        change_type: changeType(item.today, item.yesterday),
        change: changeText(item.today, item.yesterday),
        semantic_label: label,
        insight,
        interpretation: insight
      };
    })
  };
}

export function interpretKpiItems(items: KpiInterpretationInput[]): { kpis: KpiInterpretation[] } {
  const results = interpretKpis(items.map((item) => ({
    name: item.name,
    today: item.today_value,
    yesterday: item.yesterday_value,
    higher_is_better: normalizeDirection(item.direction) === "unknown"
      ? null
      : normalizeDirection(item.direction) === "higher_is_better"
  }))).results;

  return { kpis: results };
}
