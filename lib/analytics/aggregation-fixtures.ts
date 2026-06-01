import type { AggregationResult, ReportMetricResultInput } from "@/lib/report-generation/report-types";

export const reviewsMetricFixture: ReportMetricResultInput[] = [
  {
    metricId: "review-volume",
    metricName: "Review Volume",
    formula: "COUNT_NON_EMPTY(googleplaystore_user_reviews.Translated_Review)",
    status: "computed",
    value: 37427,
    computedAt: "2026-05-24T00:00:00.000Z"
  },
  {
    metricId: "positive-rate",
    metricName: "Positive Sentiment Rate",
    formula: "SAFE_DIVIDE(COUNT_IF(googleplaystore_user_reviews.Sentiment = 'Positive'), COUNT_NON_EMPTY(googleplaystore_user_reviews.Sentiment))",
    status: "computed",
    value: 0.641,
    computedAt: "2026-05-24T00:00:00.000Z"
  },
  {
    metricId: "negative-rate",
    metricName: "Negative Sentiment Rate",
    formula: "SAFE_DIVIDE(COUNT_IF(googleplaystore_user_reviews.Sentiment = 'Negative'), COUNT_NON_EMPTY(googleplaystore_user_reviews.Sentiment))",
    status: "computed",
    value: 0.221,
    computedAt: "2026-05-24T00:00:00.000Z"
  }
];

export const appMarketAggregationFixture: AggregationResult = {
  datasetId: "fixture:googleplaystore",
  datasetName: "Google Play 应用数据",
  businessType: "app_market",
  rowCount: 10841,
  groupBys: [{
    id: "category-installs",
    title: "Category 聚合",
    dimension: "Category",
    metrics: ["objects", "installs", "averageRating"],
    rows: [
      { dimension: "GAME", objects: 945, installs: 13450000000, averageRating: 4.28 },
      { dimension: "COMMUNICATION", objects: 315, installs: 11040000000, averageRating: 4.12 }
    ]
  }],
  topRankings: [{
    id: "top-apps-by-installs",
    title: "Top Apps by Installs",
    dimension: "App",
    metric: "installs",
    rows: [
      { dimension: "YouTube", installs: 1000000000, averageRating: 4.3 },
      { dimension: "Google Chrome", installs: 1000000000, averageRating: 4.3 }
    ]
  }],
  bottomRankings: [{
    id: "low-rating-apps",
    title: "低评分 App",
    dimension: "App",
    metric: "averageRating",
    rows: [
      { dimension: "My Telcel", installs: 50000000, averageRating: 3.1 }
    ]
  }],
  timeTrends: [],
  distributions: [],
  riskCandidates: [{
    id: "high-volume-low-quality",
    title: "高规模低评分对象",
    type: "high_volume_low_quality",
    severity: "medium",
    evidenceMetrics: ["installs", "averageRating"],
    evidenceValues: { count: 1 },
    objects: [{ dimension: "My Telcel", installs: 50000000, averageRating: 3.1 }],
    businessMeaning: "安装规模较高但评分偏低，可能影响用户信任",
    recommendedAction: "优先排查评分偏低对象的评论和版本问题",
    confidence: 0.8
  }],
  opportunityCandidates: [{
    id: "high-quality-low-scale",
    title: "高质量低规模对象",
    type: "high_quality_low_scale",
    priority: "medium",
    evidenceMetrics: ["averageRating", "installs"],
    evidenceValues: { count: 1 },
    objects: [{ dimension: "Ríos de Fe", installs: 1000, averageRating: 5 }],
    businessMeaning: "评分高但规模较小，可能有分发增长空间",
    recommendedAction: "做 ASO 和渠道曝光测试",
    confidence: 0.76
  }],
  warnings: []
};
