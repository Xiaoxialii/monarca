import test from "node:test";
import assert from "node:assert/strict";
import { validateFullDataAnalysisContext } from "../lib/skills/full-data-analysis-guardrail.ts";

const ecommerceFieldMap = {
  order_id: "订单",
  order_date: "订单日期",
  customer_id: "客户",
  net_sales: "净销售额",
  total_paid: "实付金额",
  category: "品类"
};

test("sampleRows metric source blocks report generation", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "schema.sampleRows",
    rowsUsed: 500,
    expectedFullRows: 83561,
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap
  });

  assert.equal(result.canGenerateReport, false);
  assert.equal(result.dataScope, "SAMPLE_ONLY");
  assert.match(result.blockingIssues.join(" "), /sampleRows|first500Rows|previewRows/);
});

test("partial rows block report generation", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "weekly_report",
    metricSource: "FULL_DATA",
    rowsUsed: 500,
    expectedFullRows: 83561,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap
  });

  assert.equal(result.canGenerateReport, false);
  assert.equal(result.dataScope, "PARTIAL_DATA");
  assert.match(result.blockingIssues.join(" "), /500.*83561/);
});

test("full data source with complete row count allows report generation", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "weekly_report",
    metricSource: "FULL_DATA",
    rowsUsed: 83561,
    expectedFullRows: 83561,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "ecommerce"
  });

  assert.equal(result.canGenerateReport, true);
  assert.equal(result.dataScope, "FULL_DATA");
});

test("daily full data requires latest-day rows and matching metric rows", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "FULL_DATA",
    rowsUsed: 83561,
    expectedFullRows: 83561,
    dailyRows: 650,
    rowsUsedForMetrics: 3,
    sampleRowsCount: 3,
    fullDataAvailable: true,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "ecommerce"
  });

  assert.equal(result.canGenerateReport, false);
  assert.match(result.blockingIssues.join(" "), /650.*3|3.*650/);
});

test("daily full data allows report when rowsUsedForMetrics equals latest-day rows", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "FULL_DATA",
    rowsUsed: 83561,
    expectedFullRows: 83561,
    dailyRows: 650,
    rowsUsedForMetrics: 650,
    sampleRowsCount: 3,
    fullDataAvailable: true,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "ecommerce"
  });

  assert.equal(result.canGenerateReport, true);
  assert.equal(result.dailyRows, 650);
  assert.equal(result.rowsUsedForMetrics, 650);
  assert.equal(result.sampleRowsCount, 3);
});

test("daily report compares metrics against latest-day rows, not total file rows", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "FULL_DATA",
    rowsUsed: 82911,
    expectedFullRows: 82911,
    dailyRows: 680,
    rowsUsedForMetrics: 680,
    fullDataAvailable: true,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-09",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "ecommerce"
  });

  assert.equal(result.canGenerateReport, true);
  assert.equal(result.dataScope, "FULL_DATA");
  assert.equal(result.rowsUsed, 82911);
  assert.equal(result.rowsUsedForMetrics, 680);
  assert.equal(result.blockingIssues.join(" "), "");
});

test("ecommerce field map blocks app template industry", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "FULL_DATA",
    rowsUsed: 83561,
    expectedFullRows: 83561,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "app_market"
  });

  assert.equal(result.canGenerateReport, false);
  assert.match(result.blockingIssues.join(" "), /电商订单字段被识别成 App/);
});

test("forbidden output terms such as AverageRating Share block generation", () => {
  const result = validateFullDataAnalysisContext({
    reportType: "daily_brief",
    metricSource: "FULL_DATA",
    rowsUsed: 83561,
    expectedFullRows: 83561,
    storedFilePath: ".data-source-uploads/orders.csv",
    latestDataDate: "2026-06-10",
    businessFieldMap: ecommerceFieldMap,
    detectedIndustry: "ecommerce",
    outputText: "AverageRating Share is high"
  });

  assert.equal(result.canGenerateReport, false);
  assert.match(result.blockingIssues.join(" "), /AverageRating Share/);
});
