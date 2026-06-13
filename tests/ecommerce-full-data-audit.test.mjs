import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const { DataSourceType, MetricExpressionType, MetricLayer, MetricMaintainerRole, MetricStatus } = jiti("@prisma/client");
const { inferTablesFromCsvText } = jiti("./lib/file-upload-schema.ts");
const { buildReportDataAudit } = jiti("./lib/report-data-audit.ts");
const { computeMetricResultsForContexts } = jiti("./lib/metric-results.ts");

const csvPath = ".data-source-uploads/cmpwb1gom0006j24w1rcf0rlh/cmq6g7p880000uqjogev8qu5j/ecommerce_dataset_2026_jan_to_jun09_82911_rows.csv";

function contextForDataset() {
  const text = readFileSync(csvPath, "utf8");
  const tables = inferTablesFromCsvText("ecommerce_dataset_2026_jan_to_jun09_82911_rows.csv", text);

  return {
    dataSource: {
      id: "csv-source",
      name: "CSV - ecommerce_dataset_2026_jan_to_jun09_82911_rows.csv",
      type: DataSourceType.CSV,
      config: {
        fileName: "ecommerce_dataset_2026_jan_to_jun09_82911_rows.csv",
        fileSize: text.length,
        storedFilePath: csvPath
      }
    },
    tables,
    schemaJson: {
      fileName: "ecommerce_dataset_2026_jan_to_jun09_82911_rows.csv",
      tables
    }
  };
}

test("full-data audit reads all 82,911 ecommerce rows and validates KPI totals", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const audit = await buildReportDataAudit({
    contexts: [contextForDataset()],
    reportType: "custom_report"
  });
  const metrics = audit.ecommerceFullDataMetrics;

  assert.equal(audit.totalRows, 82911);
  assert.equal(audit.latestDataDate, "2026-06-09");
  assert.equal(audit.dailyRows, 680);
  assert.equal(metrics?.totalOrders, 82911);
  assert.equal(metrics?.totalCustomers, 17900);
  assert.equal(metrics?.grossSales, 3764833.18);
  assert.equal(metrics?.netSales, 3428884.38);
  assert.equal(metrics?.totalPaid, 4252736.92);
  assert.equal(metrics?.aov, 41.36);
  assert.equal(metrics?.averageRating, 4.04);
  assert.equal(metrics?.averageRatingSampleSize, 77382);
  assert.equal(metrics?.categoryOrders["Food & Beverage"], 16620);
  assert.equal(metrics?.categoryOrders["Beauty & Personal Care"], 16420);
  assert.equal(metrics?.categoryOrders["Home & Kitchen"], 14776);
});

test("CSV metric execution computes Average Rating from non-empty order-level ratings only", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const context = contextForDataset();
  const tableName = context.tables[0].name;
  const [rating] = await computeMetricResultsForContexts({
    contexts: [context],
    dateRange: { preset: "ALL" },
    metrics: [{
      id: "average-rating",
      workspaceId: "workspace",
      layer: MetricLayer.PRIMARY,
      category: "Customer Experience",
      name: "Average Rating",
      definition: "Average customer rating, excluding blank values",
      formula: `AVG(${tableName}.customer_rating)`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: null,
      window: null,
      sourceMetricIds: null,
      mappingJson: { sourceFields: [{ table: tableName, field: "customer_rating" }] },
      lineageJson: {
        validation: { validation_status: "valid", validation_errors: [], validation_warnings: [] },
        metricType: "core_metric",
        businessType: "ecommerce",
        displayName: "Average Rating"
      },
      isActive: true,
      maintainerRole: MetricMaintainerRole.AI,
      maintainerUserId: null,
      status: MetricStatus.AI_READY,
      tagsJson: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }]
  });

  assert.equal(rating.status, "computed");
  assert.equal(Number(rating.value).toFixed(4), "4.0400");
});

test("full-data audit blocks stale KPI results that do not match the full CSV aggregation", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const context = contextForDataset();
  const tableName = context.tables[0].name;
  const audit = await buildReportDataAudit({
    contexts: [context],
    reportType: "custom_report",
    dateRange: { preset: "ALL" },
    metricDefinitions: [{
      id: "net-sales",
      workspaceId: "workspace",
      layer: MetricLayer.PRIMARY,
      category: "Revenue",
      name: "Net Sales",
      definition: "Net sales from order rows",
      formula: `SUM(${tableName}.net_sales)`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: null,
      window: null,
      sourceMetricIds: null,
      mappingJson: { sourceFields: [{ table: tableName, field: "net_sales" }] },
      lineageJson: {
        validation: { validation_status: "valid", validation_errors: [], validation_warnings: [] },
        metricType: "core_metric",
        businessType: "ecommerce",
        displayName: "Net Sales"
      },
      isActive: true,
      maintainerRole: MetricMaintainerRole.AI,
      maintainerUserId: null,
      status: MetricStatus.AI_READY,
      tagsJson: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }],
    metricResults: [
      {
        metricId: "net-sales",
        metricName: "Net Sales",
        displayName: "Net Sales",
        formula: "SUM(ecommerce_dataset_2026_jan_to_jun09_82911_rows.net_sales)",
        value: 775900
      }
    ]
  });

  assert.equal(audit.passed, false);
  assert.match(audit.failures.join(" "), /Net Sales.*775900.*3428884\.38/);
});

test("daily data audit validates daily-window KPIs against latest-day rows, not ALL totals", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const audit = await buildReportDataAudit({
    contexts: [contextForDataset()],
    reportType: "daily_brief",
    metricResults: [
      {
        metricName: "Total Orders",
        displayName: "Orders",
        formula: "COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.order_id)",
        value: 680,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricName: "Total Customers",
        displayName: "Customers",
        formula: "COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.customer_id)",
        value: 656,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricName: "AOV",
        displayName: "AOV",
        formula: "SAFE_DIVIDE(SUM(ecommerce_dataset_2026_jan_to_jun09_82911_rows.net_sales), COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.order_id))",
        value: 39.88,
        dateRangePreset: "DAILY",
        dateRangeStart: "2026-06-09",
        dateRangeEnd: "2026-06-09"
      }
    ]
  });

  assert.equal(audit.passed, true);
  assert.equal(audit.rowsUsedForMetrics, 680);
  assert.doesNotMatch(audit.failures.join(" "), /82911|17900|41\.36/);
});

test("weekly data audit validates latest-7-day KPIs against weekly rows, not ALL totals", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const audit = await buildReportDataAudit({
    contexts: [contextForDataset()],
    reportType: "weekly_report",
    metricResults: [
      {
        metricName: "Total Orders",
        displayName: "Orders",
        formula: "COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.order_id)",
        value: 4121,
        dateRangePreset: "WEEKLY",
        dateRangeStart: "2026-06-03",
        dateRangeEnd: "2026-06-09"
      },
      {
        metricName: "Total Customers",
        displayName: "Customers",
        formula: "COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.customer_id)",
        value: 2803,
        dateRangePreset: "WEEKLY",
        dateRangeStart: "2026-06-03",
        dateRangeEnd: "2026-06-09"
      }
    ]
  });

  assert.equal(audit.passed, true);
  assert.equal(audit.rowsUsedForMetrics, 4121);
  assert.doesNotMatch(audit.failures.join(" "), /82911|17900/);
});

test("full-data audit does not match AOV formulas as Total Orders", async (t) => {
  if (!existsSync(csvPath)) {
    t.skip("local ecommerce fixture is not present");
    return;
  }

  const audit = await buildReportDataAudit({
    contexts: [contextForDataset()],
    reportType: "custom_report",
    metricResults: [
      {
        metricName: "AOV",
        displayName: "AOV",
        formula: "SAFE_DIVIDE(SUM(ecommerce_dataset_2026_jan_to_jun09_82911_rows.net_sales), COUNT_DISTINCT(ecommerce_dataset_2026_jan_to_jun09_82911_rows.order_id))",
        value: 41.36
      }
    ]
  });

  assert.equal(audit.passed, true);
  assert.doesNotMatch(audit.failures.join(" "), /Total Orders.*41\.36.*82911/);
});
