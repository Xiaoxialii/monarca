import type { Industry } from "@/lib/metric-generation/metric-types";

export type ReportColumnType = "string" | "number" | "date" | "boolean" | "unknown";

export type ReportInputColumn = {
  name: string;
  type: ReportColumnType | string;
  nullable?: boolean;
};

export type ReportInputTable = {
  name: string;
  schema?: string;
  columns: ReportInputColumn[];
  rowCount?: number;
  sampleRows?: Record<string, unknown>[];
};

export type ReportMetric = {
  label: string;
  value: string;
  explanation: string;
};

export type DataQualityIssue = {
  issue: string;
  impact: string;
};

export type DataOverviewRow = {
  dataset: string;
  originalRows: number;
  cleanedRows: number;
  fieldCount: number;
  mainContent: string;
  dataQuality: string;
};

export type UniversalDataAnalysisReport = {
  title: string;
  generatedAt: string;
  detectedScenario: {
    primary: Industry;
    label: string;
    confidence: number;
    reasons: string[];
  };
  overview: DataOverviewRow[];
  coreMetrics: ReportMetric[];
  businessQuestions: {
    canAnswer: string[];
    cannotAnswer: string[];
  };
  overallAnalysis: string[];
  trendAnalysis: string[];
  structureAnalysis: string[];
  topObjectAnalysis: string[];
  risks: string[];
  opportunities: string[];
  conclusions: string[];
  recommendations: string[];
  nextAnalysisDirections: string[];
  evidence: string[];
  dataQualityIssues: DataQualityIssue[];
};

export type ReportBusinessType =
  | "sales"
  | "orders"
  | "ecommerce"
  | "app_market"
  | "user_growth"
  | "finance_timeseries"
  | "reviews"
  | "customer_support"
  | "marketing"
  | "product_usage"
  | "operations"
  | "inventory"
  | "generic";

export type ReportMetricResultInput = {
  metricId: string;
  metricName: string;
  displayName?: string;
  unit?: string | null;
  formula: string;
  status: "computed" | "skipped" | "failed";
  scope?: "global" | "group" | "entity" | "ranking" | "comparison" | "diagnostic" | "internal";
  value?: number | string | null;
  rows?: Array<{ dimension: string; value: number | string | null }>;
  computedAt: string;
  error?: string;
  metricType?: string;
  metricCategory?: string;
  businessType?: string;
  sourceDataset?: string;
  semanticRole?: string | null;
  priority?: number | null;
  isCoreMetric?: boolean;
  isBusinessMetric?: boolean;
  isInternalMetric?: boolean;
  isDiagnosticMetric?: boolean;
  isBenchmarkMetric?: boolean;
  isEstimated?: boolean;
  requiresDeduplication?: boolean;
  sampleSize?: number | null;
  warningTypes?: string[];
  validationStatus?: string | null;
  warning?: string;
  benchmarkContext?: {
    comparisonType: "median" | "previous_period" | "topN_share" | "threshold" | "group_average" | "distribution" | "none";
    baselineValue?: number | string | null;
    delta?: number | null;
    deltaPercent?: number | null;
    status?: string;
    interpretation?: string;
  };
};

export type AggregationWarning = {
  code: string;
  message: string;
};

export type GroupByResult = {
  id: string;
  title: string;
  dimension: string;
  metrics: string[];
  rows: Array<Record<string, string | number | null>>;
};

export type RankingResult = {
  id: string;
  title: string;
  rankingType?:
    | "top_by_scale"
    | "bottom_by_quality"
    | "high_volume_low_quality"
    | "high_quality_low_volume"
    | "top_group"
    | "bottom_group";
  dimension: string;
  metric: string;
  entityField?: string;
  metricField?: string;
  comparisonMetric?: string;
  rows: Array<Record<string, string | number | null>>;
  totalValue?: number | null;
  top1Share?: number | null;
  top3Share?: number | null;
  top5Share?: number | null;
  summary?: string;
  insightCandidate?: boolean;
  confidence?: number;
};

export type TimeTrendResult = {
  id: string;
  title: string;
  bucket: "day" | "week" | "month" | "year";
  metric: string;
  dateField?: string;
  rows: Array<{ period: string; value: number | null }>;
};

export type DistributionResult = {
  id: string;
  field: string;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  stddev: number | null;
  outlierCount: number;
};

export type CandidateResult = {
  id: string;
  title: string;
  type: string;
  riskType?:
    | "business_performance_risk"
    | "sample_concentration_risk"
    | "high_volume_low_quality_risk"
    | "negative_feedback_risk"
    | "conversion_risk"
    | "revenue_quality_risk"
    | "data_structure_risk";
  opportunityType?:
    | "high_quality_low_scale"
    | "high_conversion_low_traffic"
    | "high_margin_low_sales"
    | "positive_feedback_low_exposure"
    | "segment_growth_candidate";
  severity?: "high" | "medium" | "low";
  priority?: "high" | "medium" | "low";
  evidenceMetrics: string[];
  evidenceValues: Record<string, string | number | null>;
  metricEvidence?: string;
  comparisonEvidence?: string;
  comparison?: string;
  objects?: Array<Record<string, string | number | null>>;
  affectedObjects?: Array<Record<string, string | number | null>>;
  targetObjects?: Array<Record<string, string | number | null>>;
  businessMeaning: string;
  businessImpact?: string;
  recommendedAction: string;
  caveat?: string;
  confidence: number;
  confidenceReason?: string;
};

export type AggregationResult = {
  datasetId: string;
  datasetName: string;
  businessType: ReportBusinessType;
  rowCount?: number;
  groupBys: GroupByResult[];
  topRankings: RankingResult[];
  bottomRankings: RankingResult[];
  timeTrends: TimeTrendResult[];
  distributions: DistributionResult[];
  riskCandidates: CandidateResult[];
  opportunityCandidates: CandidateResult[];
  warnings: AggregationWarning[];
};

export type GeneratedInsight = {
  id: string;
  title: string;
  findingType?:
    | "category_comparison"
    | "group_vs_overall"
    | "joined_table_insight"
    | "high_scale_low_quality"
    | "high_quality_low_scale"
    | "trend_shift"
    | "metric_risk"
    | "data_limitation";
  summary: string;
  finding: string;
  currentConclusion?: string;
  supportingEvidence?: string;
  evidence?: string;
  deeperAnalysisResult?: string;
  businessImplication?: string;
  recommendedDecision?: string;
  caveat?: string;
  evidenceMetrics: string[];
  evidenceValues: Record<string, string | number | null>;
  evidenceObjects?: Array<Record<string, string | number | null>>;
  comparedGroups?: Array<Record<string, string | number | null>>;
  joinedTables?: string[];
  joinKey?: string;
  technicalDetails?: {
    joinedTables?: string[];
    joinKey?: string;
    sourceDatasets?: string[];
    fieldMapping?: Record<string, string>;
    joinConfidence?: number;
    caveat?: string;
  };
  comparison?: {
    comparisonType: string;
    baselineValue?: number | string | null;
    delta?: number | null;
    deltaPercent?: number | null;
    status?: "high" | "low" | "normal" | "risk" | "opportunity" | "unknown" | string;
    interpretation?: string;
  };
  businessMeaning: string;
  riskOrOpportunity?: string;
  nextAction: string;
  nextBreakdown?: string[];
  confidence: number;
  confidenceReason: string;
  limitations?: string[];
};

export type GeneratedRecommendedAction = {
  id: string;
  title: string;
  type?: "business_action" | "data_quality_action";
  actionType?:
    | "optimize_risk_object"
    | "scale_opportunity_object"
    | "validate_roi"
    | "improve_conversion"
    | "reduce_negative_feedback"
    | "expand_high_performing_segment"
    | "fix_data_quality_for_decision"
    | "create_deduped_metric"
    | "collect_revenue_field"
    | "build_benchmark"
    | "run_growth_test"
    | "collect_missing_business_data"
    | "reallocate_budget"
    | "improve_retention"
    | "reduce_cost"
    | "investigate_anomaly";
  priority: "high" | "medium" | "low";
  basedOn: string[];
  currentFinding?: string;
  whyItMatters?: string;
  recommendedAction?: string;
  evidence?: string;
  targetObjects?: string[];
  targetSegment?: string;
  action: string;
  expectedOutcome: string;
  expectedImpact?: string;
  estimatedRoiOrValue?: number | string;
  roiConfidence?: "high" | "medium" | "low" | "unavailable";
  caveats?: string[];
  requiredDataIfAny?: string[];
  evidenceMetrics?: string[];
  evidenceRankings?: string[];
  referencedObjects?: string[];
  referencedFields?: string[];
  suggestedBreakdowns?: string[];
};

export type AutoGeneratedResult = {
  id: string;
  title: string;
  type:
    | "group_analysis"
    | "ranking_analysis"
    | "risk_object_analysis"
    | "opportunity_analysis"
    | "trend_analysis"
    | "dedup_analysis"
    | "roi_analysis"
    | "quality_analysis"
    | "distribution_analysis";
  resultSummary: string;
  keyObjects: string[];
  keyMetrics: string[];
  businessMeaning: string;
  sourceInsightIds: string[];
};

export type ActionInsight = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  actionType:
    | "optimize_risk_object"
    | "scale_opportunity_object"
    | "validate_roi"
    | "improve_conversion"
    | "reduce_negative_feedback"
    | "expand_high_performing_segment"
    | "fix_data_quality_for_decision"
    | "collect_missing_business_data"
    | "run_growth_test"
    | "reallocate_budget"
    | "improve_retention"
    | "reduce_cost"
    | "investigate_anomaly";
  currentFinding: string;
  evidence: string;
  keyEvidence?: string;
  targetObjects: string[];
  targetSegment?: string;
  businessMeaning: string;
  recommendedAction: string;
  executionSteps?: string[];
  deliverable?: string;
  ownerHint?: string;
  timeHorizon?: "today" | "this_week" | "this_month";
  expectedImpact: string;
  caveat?: string;
  confidence: number;
  basedOn: string[];
  evidenceMetrics: string[];
  evidenceRankings: string[];
};

export type PriorityAction = ActionInsight;

export type MissingDataRequest = {
  id: string;
  missingFieldType:
    | "revenue"
    | "cost"
    | "time"
    | "entity_id"
    | "benchmark"
    | "conversion"
    | "retention"
    | "margin"
    | "customer_id"
    | "order_id"
    | "campaign_id"
    | "inventory"
    | "support_ticket"
    | "usage_event";
  suggestedFields: string[];
  whyNeeded: string;
  whatItEnables: string;
  priority: "high" | "medium" | "low";
};

export type ActionCaveat = {
  id: string;
  type:
    | "estimated_value"
    | "raw_metric"
    | "deduplication"
    | "small_sample"
    | "missing_benchmark"
    | "missing_trend"
    | "missing_field";
  message: string;
  affectedMetrics: string[];
  displayMode: "badge" | "tooltip" | "collapsed_detail";
};

export type GeneratedNextActionPlan = {
  autoGeneratedResults: AutoGeneratedResult[];
  actionInsights: ActionInsight[];
  /**
   * Backward-compatible alias for older UI consumers.
   * New code should consume actionInsights.
   */
  priorityActions: PriorityAction[];
  missingDataRequests: MissingDataRequest[];
  caveats: ActionCaveat[];
};

export type DataLimitation = {
  id: string;
  title?: string;
  limitation?: string;
  impact?: string;
  suggestedFix?: string;
  message: string;
};

export type GeneratedInsights = {
  executiveSummary: GeneratedInsight[];
  keyFindings: GeneratedInsight[];
  keyMetrics?: SelectedReportMetric[];
  diagnosticMetrics?: ReportMetricResultInput[];
  businessRisks: CandidateResult[];
  growthOpportunities: CandidateResult[];
  dataLimitations: DataLimitation[];
  /**
   * Backward-compatible aliases for older saved reports and API consumers.
   * New code should consume businessRisks / growthOpportunities / dataLimitations.
   */
  risks: CandidateResult[];
  opportunities: CandidateResult[];
  recommendedActions: GeneratedRecommendedAction[];
  nextActionPlan?: GeneratedNextActionPlan;
};

export type ReportMetricDefinitionInput = {
  id: string;
  name: string;
  category: string;
  definition: string;
  formula: string;
  unit?: string | null;
  mappingJson?: unknown;
  lineageJson?: unknown;
};

export type SelectedReportMetric = {
  metricId: string;
  name: string;
  displayName: string;
  unit?: string | null;
  category: string;
  businessType: ReportBusinessType;
  metricType?: string;
  metricCategory?: string;
  scope?: ReportMetricResultInput["scope"];
  semanticRole?: string | null;
  sourceDataset?: string;
  validationStatus?: string | null;
  isCoreMetric?: boolean;
  isBusinessMetric?: boolean;
  isInternalMetric?: boolean;
  isDiagnosticMetric?: boolean;
  isBenchmarkMetric?: boolean;
  benchmarkContext?: ReportMetricResultInput["benchmarkContext"];
  requiresDeduplication?: boolean;
  priority: number;
  value: number | string | null;
  displayValue: string;
  topRows?: Array<{ dimension: string; value: number | string | null }>;
  formula: string;
  explanation: string;
  grain: string;
  warning?: string;
  warningTypes?: string[];
  sampleSize?: number | null;
  isEstimated: boolean;
  isDeduped?: boolean;
};

export type BusinessModuleReport = {
  businessType: ReportBusinessType;
  title: string;
  summary: string;
  coreMetrics: SelectedReportMetric[];
  metricExplanation: string[];
  businessMeaning: string[];
  risks: string[];
  nextBreakdowns: string[];
};

export type StructuredAiReport = {
  title: string;
  generatedAt: string;
  coreSummary: string;
  coreSummaryBullets: string[];
  dataOverview: string[];
  coreMetricOverview: SelectedReportMetric[];
  keyFindings: string[];
  modules: BusinessModuleReport[];
  trendAnalysis: string[];
  structureAnalysis: string[];
  topObjectAnalysis: string[];
  risks: string[];
  opportunities: string[];
  risksAndOpportunities: string[];
  businessRisks: CandidateResult[];
  growthOpportunities: CandidateResult[];
  dataLimitations: DataLimitation[];
  recommendations: Array<{
    title: string;
    type?: "business_action" | "data_quality_action";
    basedOn: string;
    action: string;
    reason: string;
    priorityDimension: string;
    priority: "High" | "Medium" | "Low";
    referencedObjects?: string[];
    referencedFields?: string[];
  }>;
  limitations: string[];
  evidence: string[];
  aggregationResults?: AggregationResult[];
  generatedInsights?: GeneratedInsights;
};
