import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComparisonPeriod,
  buildWeeklyComparisonPeriod,
  composeReport,
  effectiveReportMode,
  normalizeReportMode
} from "../lib/report-composers.ts";

const keyFindings = Array.from({ length: 5 }, (_, index) => ({
  id: `finding-${index}`,
  title: `Finding ${index}`,
  summary: `Finding summary ${index}`,
  evidenceMetrics: ["TotalOrders"]
}));

function dateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function input(overrides = {}) {
  return {
    workspaceId: "workspace-1",
    requestedReportMode: "custom_report",
    metricResults: [
      { metricId: "m1", metricName: "TotalOrders", value: 100, status: "computed" }
    ],
    metricSnapshots: [],
    structuredReport: {
      coreSummary: "Core summary",
      generatedInsights: {
        keyFindings,
        businessRisks: keyFindings,
        growthOpportunities: keyFindings,
        recommendedActions: keyFindings,
        nextActionPlan: { actionInsights: keyFindings },
        dataLimitations: []
      }
    },
    trendMetrics: [
      {
        metricName: "TotalOrders",
        currentValue: 120,
        previousValue: 100,
        percentChange: 0.2,
        trendDirection: "up",
        timeSeries: [
          { date: "2026-05-22", value: 10 },
          { date: "2026-05-23", value: 10 },
          { date: "2026-05-24", value: 10 },
          { date: "2026-05-25", value: 80 },
          { date: "2026-05-26", value: 20 },
          { date: "2026-05-27", value: 10 },
          { date: "2026-05-28", value: 10 },
          { date: "2026-05-29", value: 20 },
          { date: "2026-05-30", value: 20 },
          { date: "2026-05-31", value: 20 },
          { date: "2026-06-01", value: 20 },
          { date: "2026-06-02", value: 20 },
          { date: "2026-06-03", value: 20 },
          { date: "2026-06-04", value: 20 }
        ]
      }
    ],
    trendCharts: [],
    timeConfig: { hasTimeField: true, endDate: "2026-06-07", defaultTimeField: "order_date" },
    dateRange: { preset: "30D", startDate: "2026-05-08", endDate: "2026-06-07" },
    locale: "zh",
    generatedAt: new Date("2026-06-08T00:00:00Z"),
    ...overrides
  };
}

function ecommerceAudit(overrides = {}) {
  return {
    passed: true,
    industry: "ecommerce",
    dataScope: "full_file",
    totalRows: 83561,
    expectedFullRows: 83561,
    dailyRows: 650,
    rowsUsedForMetrics: 650,
    sampleRowsCount: 3,
    dateField: "order_date",
    dateRangeStart: "2026-01-01",
    dateRangeEnd: "2026-06-10",
    latestDataDate: "2026-06-10",
    usesFullData: true,
    failures: [],
    warnings: [],
    requiredFixes: [],
    analysisSource: "STORED_FILE_PATH",
    businessFieldMap: {
      order_id: "订单",
      order_date: "订单日期",
      customer_id: "客户",
      net_sales: "净销售额",
      total_paid: "实付金额",
      category: "品类"
    },
    fullDataGuardrail: {
      canGenerateReport: true,
      dataScope: "FULL_DATA",
      analysisSource: "STORED_FILE_PATH",
      rowsUsed: 83561,
      expectedFullRows: 83561,
      dailyRows: 650,
      rowsUsedForMetrics: 650,
      sampleRowsCount: 3,
      latestDataDate: "2026-06-10",
      businessFieldMappingReady: true,
      blockingIssues: [],
      warnings: [],
      requiredFixes: []
    },
    ecommerceFields: {
      hasOrderId: true,
      hasCustomerId: true,
      hasGrossSales: true,
      hasNetSales: true,
      hasTotalPaid: true,
      hasQuantity: true,
      hasUnitPrice: true,
      hasReturnFlag: true,
      hasRating: true,
      hasFulfillmentDays: true
    },
    ...overrides
  };
}

test("reportMode custom_report preserves full custom report payload", () => {
  const report = composeReport(input({ requestedReportMode: "custom_report" }));

  assert.equal(report.reportMode, "custom_report");
  assert.equal(report.structuredReport.coreSummary, "Core summary");
  assert.equal(report.metricResults.length, 1);
});

test("reportMode daily_brief calls DailyBriefComposer and caps sections to three", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-04T00:00:00Z"),
    trendMetrics: [{
      metricName: "TotalOrders",
      timeSeries: [
        { date: "2026-06-02", value: 20 },
        { date: "2026-06-03", value: 20 },
        { date: "2026-06-04", value: 20, sampleSize: 40 }
      ]
    }]
  }));

  assert.equal(report.reportMode, "daily_brief");
  assert.equal(report.dailyBriefMode, "daily_full");
  assert.equal(report.keyChanges.length, 1);
  assert.match(report.dailyKpis[0].title, /订单数/);
  assert.ok(report.aiBrief.length >= 3);
  assert.ok(report.dailyKpis.length > 0);
  assert.ok(report.priorityActions.length > 0);
});

test("daily brief anchors on latest business date instead of system date", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-10T00:00:00Z"),
    trendMetrics: [{
      metricName: "TotalOrders",
      sourceMetricName: "orders",
      canonicalMetricKey: "orders",
      timeSeries: [
        { date: "2026-06-08", value: 40 },
        { date: "2026-06-09", value: 35 }
      ]
    }]
  }));

  assert.equal(report.latestDataDate, "2026-06-09");
  assert.match(report.latestDateNotice, /最新数据日期为 2026-06-09|最新业务日期为 2026-06-09/);
  assert.match(JSON.stringify(report.aiBrief), /2026-06-09/);
});

test("daily brief sample size comes from full latest-day rows, not trend cards or preview samples", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-10T00:00:00Z"),
    reportDataAudit: ecommerceAudit(),
    trendMetrics: [
      {
        metricName: "Average Rating",
        canonicalMetricKey: "rating",
        timeSeries: [{ date: "2026-06-10", value: 4.7, sampleSize: 1 }]
      },
      {
        metricName: "Return Rate",
        canonicalMetricKey: "return_rate",
        timeSeries: [{ date: "2026-06-10", value: 0.02, sampleSize: 1 }]
      },
      {
        metricName: "Fulfillment Days",
        canonicalMetricKey: "fulfillment_days",
        timeSeries: [{ date: "2026-06-10", value: 2.1, sampleSize: 1 }]
      }
    ]
  }));
  const visibleText = JSON.stringify(report);

  assert.equal(report.latestDataDate, "2026-06-10");
  assert.equal(report.dailySampleSize, 650);
  assert.equal(report.dailyBriefMode, "daily_full");
  assert.doesNotMatch(visibleText, /样本量 3|当前日期样本量：3|小样本日报|基于 3 条样本/);
  assert.match(visibleText, /今日订单记录数：650|今日订单记录数 650/);
});

test("daily brief computes today yesterday and 7-day windows from latestDataDate", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-10T00:00:00Z"),
    trendMetrics: [{
      metricName: "TotalOrders",
      sourceMetricName: "orders",
      canonicalMetricKey: "orders",
      timeSeries: [
        { date: "2026-05-28", value: 5 },
        { date: "2026-05-29", value: 5 },
        { date: "2026-05-30", value: 5 },
        { date: "2026-05-31", value: 5 },
        { date: "2026-06-01", value: 5 },
        { date: "2026-06-02", value: 5 },
        { date: "2026-06-03", value: 5 },
        { date: "2026-06-04", value: 10 },
        { date: "2026-06-05", value: 10 },
        { date: "2026-06-06", value: 10 },
        { date: "2026-06-07", value: 10 },
        { date: "2026-06-08", value: 10 },
        { date: "2026-06-09", value: 20 },
        { date: "2026-06-10", value: 30 }
      ]
    }]
  }));

  const ordersKpi = report.dailyKpis.find((item) => item.metricKind === "orders");
  const ordersTrend = report.sevenDayTrends.find((item) => item.metricKind === "orders");

  assert.equal(ordersKpi.currentValue, 30);
  assert.equal(ordersKpi.previousValue, 20);
  assert.match(ordersTrend.keyEvidence, /2026-06-04 至 2026-06-10/);
  assert.match(ordersTrend.keyEvidence, /2026-05-28 至 2026-06-03/);
  assert.equal(ordersTrend.currentValue, 100);
  assert.equal(ordersTrend.previousValue, 35);
});

test("daily brief uses business KPI language and does not expose records share", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-10T00:00:00Z"),
    trendMetrics: [
      {
        metricName: "Records",
        sourceMetricName: "records",
        canonicalMetricKey: "orders",
        timeSeries: [
          { date: "2026-06-09", value: 20 },
          { date: "2026-06-10", value: 30 }
        ]
      },
      {
        metricName: "Estimated GMV",
        sourceMetricName: "Estimated GMV",
        canonicalMetricKey: "sales",
        timeSeries: [
          { date: "2026-06-09", value: 1000 },
          { date: "2026-06-10", value: 1200 }
        ]
      }
    ]
  }));
  const visibleText = JSON.stringify({
    aiBrief: report.aiBrief,
    dailyKpis: report.dailyKpis,
    dataCaveats: report.dataCaveats
  });

  assert.match(visibleText, /订单数/);
  assert.match(visibleText, /估算成交规模|Estimated GMV/);
  assert.match(visibleText, /不等同于真实支付收入、利润或现金流/);
  assert.doesNotMatch(visibleText, /Records Share|AverageRating Share|Top 3 Category Records Share/);
});

test("daily brief KPI cards use latest-day metric window instead of ALL totals", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    reportDataAudit: ecommerceAudit({
      totalRows: 82911,
      dailyRows: 680,
      rowsUsedForMetrics: 680,
      latestDataDate: "2026-06-09",
      dateRangeEnd: "2026-06-09"
    }),
    timeConfig: { hasTimeField: true, endDate: "2026-06-09", defaultTimeField: "order_date" },
    dateRange: { preset: "DAILY", startDate: "2026-06-09", endDate: "2026-06-09" },
    trendMetrics: [],
    metricResults: [
      {
        metricId: "orders",
        metricName: "Orders",
        displayName: "Orders",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "COUNT_DISTINCT(orders.order_id)",
        status: "computed",
        value: 82911,
        previousValue: 0,
        dateRangePreset: "ALL",
        dateRangeStart: null,
        dateRangeEnd: null
      },
      {
        metricId: "orders",
        metricName: "Orders",
        displayName: "Orders",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "COUNT_DISTINCT(orders.order_id)",
        status: "computed",
        value: 680,
        previousValue: 640,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "units_sold",
        metricName: "Units Sold",
        displayName: "Units Sold",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "SUM(orders.quantity)",
        status: "computed",
        value: 1432,
        previousValue: 1390,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "net_sales",
        metricName: "Net Sales",
        displayName: "Net Sales",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "SUM(orders.net_sales)",
        status: "computed",
        value: 25800,
        previousValue: 27150,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "customers",
        metricName: "Customers",
        displayName: "Customers",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "COUNT_DISTINCT(orders.customer_id)",
        status: "computed",
        value: 656,
        previousValue: 662,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "average_rating",
        metricName: "Average Rating",
        displayName: "Average Rating",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "AVG(orders.customer_rating)",
        status: "computed",
        value: 4.18,
        previousValue: 4.26,
        sampleSize: 621,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "return_rate",
        metricName: "Return Rate",
        displayName: "Return Rate",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "SAFE_DIVIDE(SUM(orders.is_returned), COUNT_DISTINCT(orders.order_id))",
        status: "computed",
        value: 0,
        previousValue: 0,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricId: "fulfillment_days",
        metricName: "Fulfillment Days",
        displayName: "Fulfillment Days",
        businessType: "ecommerce",
        metricCategory: "metric_registry",
        formula: "AVG(orders.fulfillment_days)",
        status: "computed",
        value: 3.71,
        previousValue: 3.6,
        sampleSize: 680,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      }
    ]
  }));

  const ordersKpi = report.dailyKpis.find((item) => item.metricKind === "orders");
  const unitsKpi = report.dailyKpis.find((item) => item.metricKind === "units");
  const revenueKpi = report.dailyKpis.find((item) => item.metricKind === "revenue");
  const customersKpi = report.dailyKpis.find((item) => item.metricKind === "customers");
  const ratingKpi = report.dailyKpis.find((item) => item.metricKind === "rating");
  const returnRateKpi = report.dailyKpis.find((item) => item.metricKind === "return_rate");
  const fulfillmentKpi = report.dailyKpis.find((item) => item.metricKind === "fulfillment_days");

  assert.equal(ordersKpi.currentValue, 680);
  assert.equal(ordersKpi.previousValue, 640);
  assert.equal(unitsKpi.currentValue, 1432);
  assert.equal(revenueKpi.currentValue, 25800);
  assert.equal(customersKpi.title, "客户数");
  assert.equal(customersKpi.currentValue, 656);
  assert.equal(customersKpi.previousValue, 662);
  assert.equal(ratingKpi.title, "平均客户评分");
  assert.equal(ratingKpi.currentValue, 4.18);
  assert.equal(ratingKpi.previousValue, 4.26);
  assert.equal(ratingKpi.caveat, "");
  assert.match(returnRateKpi.recommendedAction, /退货可能存在业务滞后/);
  assert.doesNotMatch(returnRateKpi.caveat, /小样本|样本较少/);
  assert.ok(Math.abs(fulfillmentKpi.currentValue - 3.71) < 0.0001);
  assert.ok(fulfillmentKpi.percentChange > 0);
  assert.doesNotMatch(JSON.stringify(report.dailyKpis), /82\.9K|82911|3\.43M/);
});

test("daily brief builds dimension comparisons with yesterday values", () => {
  const metricBase = {
    businessType: "ecommerce",
    metricCategory: "metric_registry",
    status: "computed",
    dateRangePreset: "DAILY",
    dateRangeStart: "2026-06-09",
    dateRangeEnd: "2026-06-09"
  };
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    reportDataAudit: ecommerceAudit({
      latestDataDate: "2026-06-09",
      dateRangeEnd: "2026-06-09",
      dailyRows: 680,
      rowsUsedForMetrics: 680
    }),
    timeConfig: { hasTimeField: true, endDate: "2026-06-09", defaultTimeField: "order_date" },
    dateRange: { preset: "DAILY", startDate: "2026-06-09", endDate: "2026-06-09" },
    trendMetrics: [],
    metricResults: [
      {
        ...metricBase,
        metricId: "category_orders",
        metricName: "Category Orders",
        displayName: "品类订单数",
        formula: "COUNT_DISTINCT(orders.order_id) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 120, previousValue: 150, percentChange: -0.2 },
          { dimension: "Beauty & Personal Care", value: 90, previousValue: 80, percentChange: 0.125 }
        ]
      },
      {
        ...metricBase,
        metricId: "category_net_sales",
        metricName: "Category Net Sales",
        displayName: "品类净销售额",
        formula: "SUM(orders.net_sales) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 4800, previousValue: 6000, percentChange: -0.2 },
          { dimension: "Beauty & Personal Care", value: 4500, previousValue: 4000, percentChange: 0.125 }
        ]
      },
      {
        ...metricBase,
        metricId: "category_return_rate",
        metricName: "Category Return Rate",
        displayName: "品类退货率",
        formula: "SAFE_DIVIDE(COUNT_IF(orders.is_returned = 1), COUNT_DISTINCT(orders.order_id)) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 0.03, previousValue: 0.02, percentChange: 0.5 }
        ]
      },
      {
        ...metricBase,
        metricId: "category_average_rating",
        metricName: "Category Average Rating",
        displayName: "品类平均客户评分",
        formula: "AVG(orders.customer_rating) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 4.1, previousValue: 4.2, percentChange: -0.0238 }
        ]
      }
    ]
  }));

  const category = report.dimensionComparisons.find((table) => table.type === "category");

  assert.ok(category);
  const food = category.rows.find((row) => row.name === "Food & Beverage");
  assert.ok(food);
  assert.equal(food.todayOrders, 120);
  assert.equal(food.yesterdayOrders, 150);
  assert.equal(food.todayNetSales, 4800);
  assert.equal(food.yesterdayNetSales, 6000);
  assert.equal(food.todayAov, 40);
  assert.equal(food.yesterdayAov, 40);
  assert.match(food.businessJudgment, /订单量回落|退货率高于昨日/);
  assert.ok(category.summaries.length > 0);
});

test("failed data audit blocks formal report output", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    reportDataAudit: {
      passed: false,
      industry: "ecommerce",
      dataScope: "sample_only",
      totalRows: 500,
      dateField: "order_date",
      dateRangeStart: "2026-06-01",
      dateRangeEnd: "2026-06-10",
      latestDataDate: "2026-06-10",
      usesFullData: false,
      failures: ["当前仅基于样本数据生成，不能代表完整业务表现。"],
      warnings: [],
      ecommerceFields: {
        hasOrderId: true,
        hasCustomerId: true,
        hasGrossSales: true,
        hasNetSales: true,
        hasTotalPaid: true,
        hasQuantity: true,
        hasUnitPrice: true,
        hasReturnFlag: true,
        hasRating: true,
        hasFulfillmentDays: true
      }
    }
  }));

  assert.equal(report.validationStatus, "failed");
  assert.match(report.todayOverview, /未通过数据口径校验/);
  assert.deepEqual(report.risks, []);
  assert.deepEqual(report.opportunities, []);
});

function lowSampleDailyInput(overrides = {}) {
  return input({
    requestedReportMode: "daily_brief",
    generatedAt: new Date("2026-06-04T00:00:00Z"),
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: [
          { date: "2026-05-29", value: 8 },
          { date: "2026-05-30", value: 7 },
          { date: "2026-05-31", value: 9 },
          { date: "2026-06-01", value: 10 },
          { date: "2026-06-02", value: 8 },
          { date: "2026-06-03", value: 7 },
          { date: "2026-06-04", value: 5 }
        ]
      },
      {
        metricName: "平均客户评分",
        timeSeries: [
          { date: "2026-06-03", value: 3.2, sampleSize: 8 },
          { date: "2026-06-04", value: 4.8, sampleSize: 5 }
        ]
      }
    ],
    structuredReport: {
      coreSummary: "Core summary",
      generatedInsights: {
        keyFindings,
        businessRisks: [
          {
            id: "risk-food",
            title: "Food & Beverage 样本集中度过高，是业务风险",
            targetObjects: ["Food & Beverage"],
            evidence: "Food & Beverage 在当前样本中占比较高",
            riskLevel: "high"
          },
          {
            id: "risk-food-dup",
            title: "Food & Beverage 样本集中度过高，是业务风险",
            targetObjects: ["Food & Beverage"],
            evidence: "Food & Beverage 在当前样本中占比较高",
            riskLevel: "high"
          }
        ],
        growthOpportunities: [
          {
            id: "opp-fashion",
            title: "Fashion Accessories 可作为增长候选",
            targetObjects: ["Fashion Accessories"],
            metricEvidence: "Fashion Accessories 的 AverageRating 高于 P75，且 records 不高",
            businessMeaning: "Fashion Accessories 可作为强机会",
            recommendedAction: "放大 Fashion Accessories 投放"
          }
        ],
        recommendedActions: [
          {
            id: "action-food",
            title: "放大高收入高利润产品",
            targetObjects: ["Food & Beverage"],
            recommendedAction: "优先投入 Food & Beverage"
          }
        ],
        nextActionPlan: { actionInsights: [] },
        dataLimitations: [
          { id: "limit-1", title: "缺少真实收入 / 成本字段", summary: "无法判断真实利润和 ROI" },
          { id: "limit-2", title: "估算值不代表真实收入", summary: "Estimated GMV 只能作为方向性指标" },
          { id: "limit-3", title: "重复提醒", summary: "重复提醒" }
        ]
      }
    },
    ...overrides
  });
}

test("daily brief remains a formal business daily even when daily record count is low", () => {
  const report = composeReport(lowSampleDailyInput());

  assert.equal(report.dailyBriefMode, "daily_full");
  assert.ok(report.dailySampleSize < 10);
  assert.match(report.reportTitle, /经营日报/);
  assert.doesNotMatch(report.reportTitle, /电商/);
  assert.equal(report.lowSampleNotice, undefined);
});

test("daily brief no longer exposes validation-signal modules in the main report payload", () => {
  const report = composeReport(lowSampleDailyInput());
  const visibleText = JSON.stringify(report);

  assert.equal(report.dailySignals, undefined);
  assert.equal(report.validationActions, undefined);
  assert.equal(report.rollingContext, undefined);
  assert.doesNotMatch(visibleText, /今日线索|建议验证动作|小样本日报|稳定性验证表|验证对象/);
});

test("daily brief executive summary prioritizes business outcome change and action", () => {
  const report = composeReport(lowSampleDailyInput());
  const firstThree = JSON.stringify(report.aiBrief.slice(0, 3));

  assert.match(firstThree, /当天订单数|与昨日相比|今日应优先|今日最优先/);
  assert.doesNotMatch(firstThree, /近 7 天参考|仅作参考|待验证|样本结构线索/);
});

test("daily brief keeps data caveats at the bottom instead of turning them into the report body", () => {
  const report = composeReport(lowSampleDailyInput());
  const visibleText = JSON.stringify({
    aiBrief: report.aiBrief.slice(0, 3),
    dailyKpis: report.dailyKpis,
    keyChanges: report.keyChanges,
    priorityActions: report.priorityActions
  });

  assert.ok(report.dataCaveats.length <= 3);
  assert.doesNotMatch(visibleText, /收入字段缺失提示|估算值不能代表真实收入|缺少成本字段/);
});

test("daily brief returns full mode when daily sample size is enough", () => {
  const report = composeReport(lowSampleDailyInput({
    trendMetrics: [{
      metricName: "TotalOrders",
      timeSeries: [
        { date: "2026-06-03", value: 25 },
        { date: "2026-06-04", value: 35 }
      ]
    }]
  }));

  assert.equal(report.dailyBriefMode, "daily_full");
  assert.deepEqual(report.risks, []);
  assert.deepEqual(report.opportunities, []);
  assert.ok(report.priorityActions.length > 0);
});

test("weekly growth opportunities use business copy instead of technical terms", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    structuredReport: {
      coreSummary: "Core summary",
      generatedInsights: {
        keyFindings,
        businessRisks: [],
        growthOpportunities: [{
          id: "growth-1",
          title: "Fashion Accessories 可作为测试候选",
          targetObjects: ["Fashion Accessories"],
          metricEvidence: "Fashion Accessories 的AverageRating高于 P75，且记录数量不高",
          businessMeaning: "Fashion Accessories 的 AverageRating 高于 P75，且 records 不高",
          recommendedAction: "对 Fashion Accessories 做小范围曝光、推荐位或投放测试"
        }],
        recommendedActions: [],
        nextActionPlan: { actionInsights: [] },
        dataLimitations: []
      }
    }
  }));
  const opportunity = report.growthOpportunities[0];
  const visibleText = [
    opportunity.title,
    opportunity.keyEvidence,
    opportunity.businessJudgment,
    opportunity.recommendedAction
  ].join(" ");

  assert.match(visibleText, /评分表现排在前 25%/);
  assert.match(visibleText, /当前样本量还不大/);
  assert.doesNotMatch(visibleText, /AverageRating|P75|records|记录数量不高/);
});

test("reportMode weekly_report calls WeeklyReportComposer with latest 7 days comparison", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: [
          { date: "2026-05-22", value: 10 },
          { date: "2026-05-23", value: 10 },
          { date: "2026-05-24", value: 10 },
          { date: "2026-05-25", value: 10 },
          { date: "2026-05-26", value: 10 },
          { date: "2026-05-27", value: 10 },
          { date: "2026-05-28", value: 10 },
          { date: "2026-05-29", value: 20 },
          { date: "2026-05-30", value: 20 },
          { date: "2026-05-31", value: 20 },
          { date: "2026-06-01", value: 20 },
          { date: "2026-06-02", value: 20 },
          { date: "2026-06-03", value: 20 },
          { date: "2026-06-04", value: 20 }
        ]
      }
    ]
  }));

  assert.equal(report.reportMode, "weekly_report");
  assert.equal(report.reportTimeMode, "current_week_report");
  assert.equal(report.comparisonMode, "latest_7_days_vs_previous_7_days");
  assert.match(report.executiveSummary, /最新业务日期 2026-06-04/);
  assert.match(report.weeklyKpiChanges[0].title, /周变化/);
  assert.equal(report.trendAnalysis.length, 1);
});

test("weekly_report compares latest 7 days versus previous 7 days", () => {
  const report = composeReport(input({ requestedReportMode: "weekly_report" }));

  assert.equal(report.reportMode, "weekly_report");
  assert.equal(report.reportTimeMode, "current_week_report");
  assert.equal(report.comparisonMode, "latest_7_days_vs_previous_7_days");
  assert.equal(report.latestDataDate, "2026-06-04");
  assert.equal(report.currentPeriodStart, "2026-05-29");
  assert.equal(report.currentPeriodEnd, "2026-06-04");
  assert.equal(report.previousPeriodStart, "2026-05-22");
  assert.equal(report.previousPeriodEnd, "2026-05-28");
  assert.match(report.weeklyKpiChanges[0].summary, /最近 7 天为 140，较前 7 天/);
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /2026-05-29 至 2026-06-04（7天） 合计值：140/);
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /2026-05-22 至 2026-05-28（7天） 合计值：150/);
});

test("weekly_report exposes weekly KPI and dimension modules from latest 7 days metric window", () => {
  const dateRows = [
    "2026-05-27",
    "2026-05-28",
    "2026-05-29",
    "2026-05-30",
    "2026-05-31",
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
    "2026-06-06",
    "2026-06-07",
    "2026-06-08",
    "2026-06-09"
  ];
  const metricBase = {
    businessType: "ecommerce",
    metricCategory: "metric_registry",
    status: "computed",
    dateRangePreset: "WEEKLY",
    dateRangeStart: "2026-06-03",
    dateRangeEnd: "2026-06-09"
  };
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    reportDataAudit: ecommerceAudit({
      latestDataDate: "2026-06-09",
      dateRangeEnd: "2026-06-09",
      dailyRows: 680
    }),
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: dateRows.map((date) => ({ date, value: 100 }))
      }
    ],
    metricResults: [
      {
        ...metricBase,
        metricId: "net_sales",
        metricName: "Net Sales",
        displayName: "Net Sales",
        formula: "SUM(orders.net_sales)",
        value: 210000,
        previousValue: 190000
      },
      {
        ...metricBase,
        metricId: "orders",
        metricName: "Orders",
        displayName: "Orders",
        formula: "COUNT_DISTINCT(orders.order_id)",
        value: 5200,
        previousValue: 5000
      },
      {
        ...metricBase,
        metricId: "customers",
        metricName: "Customers",
        displayName: "Customers",
        formula: "COUNT_DISTINCT(orders.customer_id)",
        value: 4100,
        previousValue: 3900
      },
      {
        ...metricBase,
        metricId: "aov",
        metricName: "AOV",
        displayName: "AOV",
        formula: "SAFE_DIVIDE(SUM(orders.net_sales), COUNT_DISTINCT(orders.order_id))",
        value: 40.38,
        previousValue: 38
      },
      {
        ...metricBase,
        metricId: "category_orders",
        metricName: "Category Orders",
        displayName: "Category Orders",
        formula: "COUNT_DISTINCT(orders.order_id) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 900, previousValue: 820 },
          { dimension: "Electronics", value: 700, previousValue: 760 }
        ]
      },
      {
        ...metricBase,
        metricId: "category_net_sales",
        metricName: "Category Net Sales",
        displayName: "Category Net Sales",
        formula: "SUM(orders.net_sales) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 36000, previousValue: 30000 },
          { dimension: "Electronics", value: 52000, previousValue: 57000 }
        ]
      },
      {
        ...metricBase,
        metricId: "category_average_rating",
        metricName: "Category Average Rating",
        displayName: "Category Average Rating",
        formula: "AVG(orders.customer_rating) BY orders.category",
        rows: [
          { dimension: "Food & Beverage", value: 4.3, previousValue: 4.2 },
          { dimension: "Electronics", value: 3.9, previousValue: 4.1 }
        ]
      }
    ]
  }));

  assert.equal(report.latestDataDate, "2026-06-09");
  assert.equal(report.currentPeriodStart, "2026-06-03");
  assert.equal(report.currentPeriodEnd, "2026-06-09");
  assert.equal(report.previousPeriodStart, "2026-05-27");
  assert.equal(report.previousPeriodEnd, "2026-06-02");
  assert.equal(report.currentPeriodDateCount, 7);
  assert.equal(report.currentPeriodComplete, true);
  assert.equal(report.weeklyKpis.find((item) => item.metricKind === "orders").currentValue, 5200);
  assert.equal(report.weeklyKpis.find((item) => item.metricKind === "orders").previousValue, 5000);
  assert.match(report.weeklyKpis[0].keyEvidence, /最近 7 天/);
  assert.match(report.weeklyKpis[0].keyEvidence, /前 7 天/);
  assert.equal(report.weeklyDimensionComparisons[0].type, "category");
  assert.equal(report.weeklyDimensionComparisons[0].rows[0].name, "Food & Beverage");
  assert.doesNotMatch(JSON.stringify(report.weeklyDimensionComparisons), /今日|昨日/);
  assert.ok(report.keyFindings.length > 0);
});

test("weekly_report latestDataDate ignores system date and natural week", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: [
          { date: "2026-05-22", value: 1 },
          { date: "2026-05-23", value: 1 },
          { date: "2026-05-24", value: 1 },
          { date: "2026-05-25", value: 1 },
          { date: "2026-05-26", value: 1 },
          { date: "2026-05-27", value: 1 },
          { date: "2026-05-28", value: 1 },
          { date: "2026-05-29", value: 1 },
          { date: "2026-05-30", value: 1 },
          { date: "2026-05-31", value: 1 },
          { date: "2026-06-01", value: 50 },
          { date: "2026-06-02", value: 70 },
          { date: "2026-06-03", value: 1 },
          { date: "2026-06-04", value: 1 }
        ]
      }
    ],
    generatedAt: new Date("2026-06-09T00:00:00Z")
  }));

  assert.equal(report.reportTimeMode, "current_week_report");
  assert.equal(report.latestDataDate, "2026-06-04");
  assert.equal(report.currentPeriodStart, "2026-05-29");
  assert.equal(report.currentPeriodEnd, "2026-06-04");
  assert.doesNotMatch(report.weeklyKpiChanges[0].keyEvidence, /2026-06-09/);
});

test("weekly_report uses average aggregation for localized rating metrics", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "平均客户评分",
        timeSeries: [
          { date: "2026-05-22", value: 3 },
          { date: "2026-05-23", value: 3 },
          { date: "2026-05-24", value: 3 },
          { date: "2026-05-25", value: 3 },
          { date: "2026-05-26", value: 3 },
          { date: "2026-05-27", value: 3 },
          { date: "2026-05-28", value: 3 },
          { date: "2026-05-29", value: 4 },
          { date: "2026-05-30", value: 4 },
          { date: "2026-05-31", value: 4 },
          { date: "2026-06-01", value: 4 },
          { date: "2026-06-02", value: 4 },
          { date: "2026-06-03", value: 4 },
          { date: "2026-06-04", value: 4 }
        ]
      }
    ]
  }));

  assert.match(report.weeklyKpiChanges[0].keyEvidence, /2026-05-29 至 2026-06-04（7天） 平均评分：4/);
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /样本量：7/);
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /2026-05-22 至 2026-05-28（7天） 平均评分：3/);
});

test("weekly_report KPI copy is metric-specific and trend analysis is not duplicated", () => {
  const datesPrevious = ["2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28"];
  const datesCurrent = ["2026-05-29", "2026-05-30", "2026-05-31", "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"];
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "GrossSales",
        timeSeries: [
          ...datesPrevious.map((date) => ({ date, value: 100 })),
          ...datesCurrent.map((date) => ({ date, value: 200 }))
        ]
      },
      {
        metricName: "DiscountAmount",
        timeSeries: [
          ...datesPrevious.map((date) => ({ date, value: 10 })),
          ...datesCurrent.map((date) => ({ date, value: 25 }))
        ]
      },
      {
        metricName: "平均客户评分",
        timeSeries: [
          ...datesPrevious.map((date) => ({ date, value: 4, sampleSize: 1 })),
          ...datesCurrent.map((date) => ({ date, value: 2, sampleSize: 1 }))
        ]
      }
    ]
  }));

  const sales = report.weeklyKpiChanges.find((item) => item.targetObjects?.[0] === "GrossSales");
  const discount = report.weeklyKpiChanges.find((item) => item.targetObjects?.[0] === "DiscountAmount");
  const rating = report.weeklyKpiChanges.find((item) => item.targetObjects?.[0] === "平均客户评分");

  assert.match(report.weeklyKpiSummary, /销售额增长/);
  assert.match(report.weeklyKpiSummary, /折扣金额同步上升/);
  assert.match(report.weeklyKpiSummary, /客户评分下降/);
  assert.match(sales.businessJudgment, /销售规模出现回升/);
  assert.match(sales.recommendedAction, /拆解增长来源/);
  assert.match(discount.businessJudgment, /折扣变化需要和销售额变化一起判断/);
  assert.match(discount.recommendedAction, /促销推动/);
  assert.match(rating.businessJudgment, /体验风险线索/);
  assert.match(rating.recommendedAction, /低评分订单/);
  assert.equal(rating.caveat, "小样本线索");
  assert.doesNotMatch(sales.businessJudgment, /这是按业务时间汇总后的周度变化/);
  assert.doesNotMatch(sales.recommendedAction, /结合本周完整性/);
  assert.equal(report.trendAnalysis.length, 1);
  assert.equal(report.trendAnalysis[0].trendMode, "short_term_basic");
  assert.match(report.trendAnalysis[0].summary, /短期数据/);
  assert.notEqual(report.trendAnalysis[0].keyEvidence, report.weeklyKpiChanges[0].keyEvidence);
});

test("weekly_report trend analysis treats 25 days as short-term trend", () => {
  const days = Array.from({ length: 25 }, (_, index) => {
    const date = new Date(2026, 4, 11);
    date.setDate(date.getDate() + index);
    return dateOnly(date);
  });
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "GrossSales",
        timeSeries: days.map((date, index) => ({ date, value: index < 18 ? 100 : 180 }))
      },
      {
        metricName: "DiscountAmount",
        timeSeries: days.map((date, index) => ({ date, value: index < 18 ? 10 : 20 }))
      }
    ]
  }));

  assert.equal(report.trendAnalysis[0].trendMode, "short_term_trend");
  assert.match(report.trendAnalysis[0].title, /已有近 25 天短期趋势/);
  assert.match(report.trendAnalysis[0].summary, /可用于观察短期上升、下滑和波动/);
  assert.match(report.trendAnalysis[0].summary, /不足 4 个完整周/);
  assert.doesNotMatch(report.trendAnalysis[0].title, /多周趋势暂不足/);
  assert.doesNotMatch(report.trendAnalysis[0].summary, /暂无趋势|不能分析/);
});

test("weekly_report does not output strong comparison when previous 7 days are insufficient", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: [
          { date: "2026-05-27", value: 10 },
          { date: "2026-05-28", value: 10 },
          { date: "2026-05-29", value: 20 },
          { date: "2026-05-30", value: 20 },
          { date: "2026-05-31", value: 20 },
          { date: "2026-06-01", value: 20 },
          { date: "2026-06-02", value: 20 },
          { date: "2026-06-03", value: 20 },
          { date: "2026-06-04", value: 20 }
        ]
      }
    ]
  }));

  assert.equal(report.comparisonMode, "latest_7_days_baseline");
  assert.equal(report.previousPeriodStart, "2026-05-22");
  assert.equal(report.previousPeriodEnd, "2026-05-28");
  assert.match(report.executiveSummary, /前 7 天历史不足/);
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /前 7 天历史不足，仅覆盖 2 天/);
  assert.doesNotMatch(report.weeklyKpiChanges[0].keyEvidence, /（[+-]?\d+\.\d%）/);
});

test("weekly_report treats missing dates as insufficient history instead of filling zeros", () => {
  const report = composeReport(input({
    requestedReportMode: "weekly_report",
    trendMetrics: [
      {
        metricName: "TotalOrders",
        timeSeries: [
          { date: "2026-05-22", value: 10 },
          { date: "2026-05-24", value: 10 },
          { date: "2026-05-29", value: 20 },
          { date: "2026-05-31", value: 20 },
          { date: "2026-06-04", value: 20 }
        ]
      }
    ]
  }));

  assert.equal(report.comparisonMode, "partial_latest_period");
  assert.match(report.weeklyKpiChanges[0].keyEvidence, /当前数据覆盖 3 天，不足 7 天/);
  assert.doesNotMatch(report.weeklyKpiChanges[0].keyEvidence, /合计值：60.*合计值：20/);
});

test("buildWeeklyComparisonPeriod returns latest 7 days versus previous 7 days", () => {
  const period = buildWeeklyComparisonPeriod({
    latestDataDate: "2026-06-04",
    dateField: "order_date"
  });

  assert.equal(period.latestDataDate, "2026-06-04");
  assert.equal(period.dateField, "order_date");
  assert.equal(period.comparisonMode, "latest_7_days_vs_previous_7_days");
  assert.equal(period.currentDays, 7);
  assert.equal(period.previousDays, 7);
  assert.equal(period.currentPeriodStart, "2026-05-29");
  assert.equal(period.currentPeriodEnd, "2026-06-04");
  assert.equal(period.previousPeriodStart, "2026-05-22");
  assert.equal(period.previousPeriodEnd, "2026-05-28");
});

test("buildComparisonPeriod returns equal-length ranges for 7D report", () => {
  const period = buildComparisonPeriod({
    selectedRange: "7D",
    latestDataDate: "2026-06-04",
    reportMode: "daily_brief"
  });

  assert.equal(period.comparisonMode, "equal_length_period");
  assert.equal(period.currentDays, 7);
  assert.equal(period.previousDays, 7);
  assert.equal(dateOnly(period.currentStart), "2026-05-29");
  assert.equal(dateOnly(period.currentEnd), "2026-06-04");
  assert.equal(dateOnly(period.previousStart), "2026-05-22");
  assert.equal(dateOnly(period.previousEnd), "2026-05-28");
});

test("no time field forces snapshot_report instead of fake period comparison", () => {
  const report = composeReport(input({
    requestedReportMode: "daily_brief",
    timeConfig: { hasTimeField: false }
  }));

  assert.equal(effectiveReportMode({ requestedReportMode: "daily_brief", hasTimeField: false }), "snapshot_report");
  assert.equal(report.reportMode, "snapshot_report");
  assert.equal(report.reportTimeMode, "snapshot_report");
  assert.match(report.overview, /缺少可用业务时间字段/);
});

test("normalizes unknown reportMode to custom_report", () => {
  assert.equal(normalizeReportMode("daily_brief"), "daily_brief");
  assert.equal(normalizeReportMode("unknown"), "custom_report");
});
