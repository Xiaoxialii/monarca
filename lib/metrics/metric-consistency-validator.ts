type RegistryMetricLike = {
  metricId: string;
  businessName: string;
  formula: string;
  requiredFields: string[];
};

export type ReportMetricRegistrySnapshot = {
  reportType: "daily" | "weekly" | "custom";
  metricRegistryId: string | null;
  definitions: RegistryMetricLike[];
};

export function validateMetricConsistency(snapshots: ReportMetricRegistrySnapshot[]) {
  const failures: string[] = [];
  const registryIds = new Set(snapshots.map((snapshot) => snapshot.metricRegistryId).filter(Boolean));

  if (registryIds.size !== 1 || snapshots.some((snapshot) => !snapshot.metricRegistryId)) {
    failures.push("当前报告未通过指标一致性校验，日报、周报和月经营分析使用了不一致的指标口径。");
  }

  const byMetric = new Map<string, RegistryMetricLike>();
  for (const snapshot of snapshots) {
    for (const definition of snapshot.definitions) {
      const existing = byMetric.get(definition.metricId);
      if (!existing) {
        byMetric.set(definition.metricId, definition);
        continue;
      }
      const sameFormula = existing.formula === definition.formula;
      const sameName = existing.businessName === definition.businessName;
      const sameFields = JSON.stringify([...existing.requiredFields].sort()) === JSON.stringify([...definition.requiredFields].sort());
      if (!sameFormula || !sameName || !sameFields) {
        failures.push("当前报告未通过指标一致性校验，日报、周报和月经营分析使用了不一致的指标口径。");
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures: Array.from(new Set(failures))
  };
}
