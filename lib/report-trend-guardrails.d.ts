export type TrendSemanticType =
  | "numeric_metric"
  | "categorical_dimension"
  | "time_dimension"
  | "identifier"
  | "text"
  | "boolean"
  | "system_field";

export type TrendFieldLike = {
  name?: string;
  metricName?: string;
  yAxis?: string;
  type?: string;
  fieldType?: string;
  semanticType?: TrendSemanticType;
  metricCategory?: string;
  isDimension?: boolean;
  isIdentifier?: boolean;
  isSystemField?: boolean;
};

export function normalizeTrendFieldName(value?: string): string;
export function isCategoricalDimensionName(name?: string): boolean;
export function isIdentifierName(name?: string): boolean;
export function isSystemFieldName(name?: string): boolean;
export function isNumericFieldType(type?: string): boolean;
export function detectFieldSemanticType(field?: TrendFieldLike): TrendSemanticType;
export function isLikelyDimensionMetricName(name?: string, category?: string): boolean;
export function canUseAsTrendMetric(fieldOrMetric?: TrendFieldLike): boolean;
export function isValidTrendMetricName(name?: string, category?: string): boolean;
export function isValidTrendSeries(input?: {
  metricName?: string;
  metricCategory?: string;
  yAxis?: string;
  values?: unknown[];
}): boolean;
export function selectTrendMetricCandidates<T extends TrendFieldLike>(columns?: T[], businessType?: string, limit?: number): T[];
export function canUseRecordsAsDerivedTrendMetric(columns?: TrendFieldLike[], businessType?: string): boolean;
