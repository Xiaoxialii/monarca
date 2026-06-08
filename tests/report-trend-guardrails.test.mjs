import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseAsTrendMetric,
  detectFieldSemanticType,
  isCategoricalDimensionName,
  isValidTrendMetricName,
  isValidTrendSeries,
  selectTrendMetricCandidates
} from "../lib/report-trend-guardrails.mjs";

function numberField(name, overrides = {}) {
  return { name, type: "number", ...overrides };
}

function stringField(name, overrides = {}) {
  return { name, type: "string", ...overrides };
}

test("SalesChannel does not qualify as a line chart yAxis", () => {
  const field = stringField("SalesChannel");

  assert.equal(detectFieldSemanticType(field), "categorical_dimension");
  assert.equal(canUseAsTrendMetric(field), false);
  assert.equal(isValidTrendMetricName("SalesChannel"), false);
});

test("Category does not qualify as a line chart yAxis", () => {
  const field = stringField("Category");

  assert.equal(detectFieldSemanticType(field), "categorical_dimension");
  assert.equal(canUseAsTrendMetric(field), false);
  assert.equal(isValidTrendMetricName("Category"), false);
});

test("CustomerSegment does not qualify as a line chart yAxis", () => {
  const field = stringField("CustomerSegment");

  assert.equal(detectFieldSemanticType(field), "categorical_dimension");
  assert.equal(canUseAsTrendMetric(field), false);
  assert.equal(isValidTrendMetricName("CustomerSegment"), false);
});

test("SalesChannel plus TotalOrders selects Orders by SalesChannel source metric, not SalesChannel", () => {
  const candidates = selectTrendMetricCandidates([
    stringField("SalesChannel"),
    numberField("TotalOrders")
  ], "ecommerce");

  assert.deepEqual(candidates.map((field) => field.name), ["TotalOrders"]);
  assert.equal(isCategoricalDimensionName("SalesChannel"), true);
});

test("Category plus Revenue selects Revenue by Category source metric, not Category", () => {
  const candidates = selectTrendMetricCandidates([
    stringField("Category"),
    numberField("Revenue")
  ], "ecommerce");

  assert.deepEqual(candidates.map((field) => field.name), ["Revenue"]);
  assert.equal(isCategoricalDimensionName("Category"), true);
});

test("no numeric metric means no trend metric candidate", () => {
  const candidates = selectTrendMetricCandidates([
    stringField("SalesChannel"),
    stringField("Category"),
    stringField("ProductName")
  ], "ecommerce");

  assert.deepEqual(candidates, []);
});

test("all-zero series from a dimension metric is hidden", () => {
  assert.equal(isValidTrendSeries({
    metricName: "SalesChannel",
    yAxis: "SalesChannel",
    values: [0, 0, 0]
  }), false);
});

test("dimension fields can be used as series, groupBy, or filter, but not as yAxis metric", () => {
  assert.equal(isCategoricalDimensionName("SalesChannel"), true);
  assert.equal(canUseAsTrendMetric(stringField("SalesChannel", { isDimension: true })), false);
  assert.equal(canUseAsTrendMetric(numberField("TotalOrders")), true);
});

test("line chart yAxis must be a numeric metric", () => {
  assert.equal(canUseAsTrendMetric(numberField("Revenue", { semanticType: "numeric_metric" })), true);
  assert.equal(canUseAsTrendMetric(numberField("Status", { semanticType: "categorical_dimension" })), false);
  assert.equal(canUseAsTrendMetric(stringField("Revenue", { semanticType: "numeric_metric" })), false);
});

test("tooltip label SalesChannel: 0 is rejected by trend validation", () => {
  const valid = isValidTrendSeries({
    metricName: "SalesChannel",
    yAxis: "SalesChannel",
    values: [0, 0]
  });

  assert.equal(valid, false);
});
