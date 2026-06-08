import test from "node:test";
import assert from "node:assert/strict";
import { buildReportTimeArtifacts } from "../lib/report-time-artifacts.mjs";

function trend(metric, rows, dateField = "order_date") {
  return {
    id: `${metric}-trend`,
    title: `${metric} over time`,
    bucket: "day",
    metric,
    dateField,
    rows
  };
}

function aggregation(timeTrends, businessType = "ecommerce") {
  return {
    datasetId: "dataset-1",
    datasetName: "orders",
    businessType,
    groupBys: [],
    topRankings: [],
    bottomRankings: [],
    timeTrends,
    distributions: [],
    riskCandidates: [],
    opportunityCandidates: [],
    warnings: []
  };
}

test("backend report time artifacts dedupe duplicate customer rating trend charts", () => {
  const artifacts = buildReportTimeArtifacts([
    aggregation([
      trend("CustomerRating", [
        { period: "2026-05-01", value: 4.5 },
        { period: "2026-05-02", value: 4.4 }
      ]),
      trend("Average Customer Rating", [
        { period: "2026-05-01", value: 4.5 },
        { period: "2026-05-02", value: 4.4 }
      ])
    ])
  ], { preset: "30D" }, "zh");

  const ratingCharts = artifacts.trendCharts.filter((chart) => chart.canonicalMetricKey === "average_rating");

  assert.equal(ratingCharts.length, 1);
  assert.equal(ratingCharts[0].title, "平均客户评分趋势");
  assert.equal(ratingCharts[0].yAxis, "平均客户评分");
  assert.doesNotMatch(ratingCharts[0].insightHint, /用于识别增长、下滑和波动/);
});

test("backend report time artifacts reject impossible rating trend ranges", () => {
  const artifacts = buildReportTimeArtifacts([
    aggregation([
      trend("CustomerRating", [
        { period: "2026-05-01", value: 19 },
        { period: "2026-05-02", value: 18 }
      ])
    ])
  ], { preset: "30D" }, "zh");

  assert.equal(artifacts.timeConfig.hasTimeField, false);
  assert.equal(artifacts.trendMetrics.length, 0);
  assert.equal(artifacts.trendCharts.length, 0);
});

test("backend report time artifacts keep distinct core ecommerce trend charts", () => {
  const artifacts = buildReportTimeArtifacts([
    aggregation([
      trend("GrossSales", [
        { period: "2026-05-01", value: 1000 },
        { period: "2026-05-02", value: 1200 }
      ]),
      trend("TotalOrders", [
        { period: "2026-05-01", value: 10 },
        { period: "2026-05-02", value: 12 }
      ]),
      trend("TotalCustomers", [
        { period: "2026-05-01", value: 8 },
        { period: "2026-05-02", value: 9 }
      ])
    ])
  ], { preset: "30D" }, "zh");

  assert.deepEqual(
    artifacts.trendCharts.map((chart) => chart.title),
    ["销售额趋势", "订单数趋势", "客户数趋势"]
  );
});
