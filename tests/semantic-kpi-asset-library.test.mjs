import assert from "node:assert/strict";
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
const { buildSemanticLayer } = jiti("./lib/semantic-layer.ts");
const { inferTablesFromExcelBuffer } = jiti("./lib/file-upload-schema.ts");

test("semantic layer extracts reusable KPI assets from wide KPI tables", () => {
  const semanticLayer = buildSemanticLayer([
    {
      name: "KPI网点-网点综合KPI考核",
      columns: [
        { name: "考核日期", type: "date", nullable: false },
        { name: "网点名称", type: "text", nullable: false },
        { name: "KPI总分", type: "number", nullable: true },
        { name: "全国排名", type: "number", nullable: true },
        { name: "省区排名", type: "number", nullable: true },
        { name: "散件揽收(20)", type: "number", nullable: true },
        { name: "首揽及时率", type: "number", nullable: true },
        { name: "首揽及时率分子", type: "number", nullable: true },
        { name: "首揽及时率分母", type: "number", nullable: true },
        { name: "首揽及时率率值", type: "number", nullable: true },
        { name: "首揽及时率得分", type: "number", nullable: true },
        { name: "投诉率", type: "number", nullable: true },
        { name: "业务量", type: "number", nullable: true }
      ]
    }
  ]);

  const assetLibrary = semanticLayer.kpiAssetLibrary;
  const kpiNames = assetLibrary.kpi_registry.map((kpi) => kpi.kpi_name);
  const excludedNames = assetLibrary.excluded_columns.map((column) => column.column);

  assert.equal(assetLibrary.total_kpi_count, 9);
  assert.deepEqual(kpiNames.sort(), [
    "KPI总分",
    "业务量",
    "全国排名",
    "散件揽收(20)",
    "投诉率",
    "省区排名",
    "首揽及时率",
    "首揽及时率得分",
    "首揽及时率率值"
  ].sort());
  assert.ok(assetLibrary.column_mapping["首揽及时率"]);
  assert.ok(assetLibrary.kpi_registry.some((kpi) => kpi.kpi_id === assetLibrary.column_mapping["首揽及时率"]));
  assert.ok(assetLibrary.column_mapping["首揽及时率得分"]);
  assert.ok(assetLibrary.kpi_registry.every((kpi) => kpi.source_columns.length > 0));
  assert.ok(assetLibrary.kpi_registry.every((kpi) => kpi.formula));

  for (const excluded of ["首揽及时率分子", "首揽及时率分母"]) {
    assert.ok(excludedNames.includes(excluded), `${excluded} should be excluded from business KPI count`);
  }

  for (const included of ["KPI总分", "全国排名", "省区排名", "散件揽收(20)", "首揽及时率率值", "业务量"]) {
    assert.ok(!excludedNames.includes(included), `${included} should be included as a business KPI`);
  }

  assert.ok(semanticLayer.fields.some((field) => field.semanticType === "business_kpi_column" && field.displayField === "首揽及时率"));
  assert.ok(semanticLayer.metrics.some((metric) => metric.name === "首揽及时率" && metric.tags.includes("Semantic KPI Asset")));
  assert.ok(semanticLayer.metrics.every((metric) => metric.tags.includes("Semantic KPI Asset")));
  assert.ok(!semanticLayer.metrics.some((metric) => /average|median|p75|p90/i.test(metric.name)));
});

test("semantic KPI asset library preserves grouped Excel KPI headers", async () => {
  const XLSX = await import("xlsx");
  const rows = [
    ["考核日期", "网点名称", "散件揽收(20)", "", "", "", "", "", "", "", ""],
    ["考核日期", "网点名称", "首揽及时率", "首揽及时率", "首揽及时率", "首揽及时率", "揽收及时率", "揽收及时率", "揽收及时率", "揽收及时率", "网点取消率"],
    ["考核日期", "网点名称", "分子", "分母", "率值", "得分", "分子", "分母", "率值", "得分", "得分"],
    ["2026-06-17", "大庆明湖分部", 95, 100, 0.95, 7, 92, 100, 0.92, 3, 5]
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 2 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 2 }, e: { r: 1, c: 5 } },
    { s: { r: 1, c: 6 }, e: { r: 1, c: 9 } }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "KPI网点");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const [table] = await inferTablesFromExcelBuffer("KPI网点-网点综合KPI考核.xlsx", buffer);
  const semanticLayer = buildSemanticLayer([table]);
  const assets = semanticLayer.kpiAssetLibrary.kpi_registry;
  const names = assets.map((asset) => asset.kpi_name);
  const firstPickupRate = assets.find((asset) => asset.kpi_name === "首揽及时率 率值");
  const firstPickupScore = assets.find((asset) => asset.kpi_name === "首揽及时率 得分");

  assert.ok(names.includes("首揽及时率 率值"));
  assert.ok(names.includes("首揽及时率 得分"));
  assert.ok(names.includes("揽收及时率 率值"));
  assert.ok(names.includes("揽收及时率 得分"));
  assert.ok(names.includes("网点取消率 得分"));
  assert.ok(names.includes("散件揽收"));
  assert.ok(names.includes("首揽及时率"));
  assert.ok(names.includes("揽收及时率"));
  assert.ok(names.includes("网点取消率"));
  assert.equal(firstPickupRate?.group_name, "散件揽收(20)");
  assert.equal(firstPickupRate?.components?.[0]?.role, "rate");
  assert.equal(firstPickupScore?.components?.[0]?.role, "score");
  assert.match(firstPickupScore?.formula ?? "", /^AVG\(branch_kpi_daily\./);
  assert.ok(!firstPickupScore?.formula.includes("branch_name"));
  assert.ok(assets.find((asset) => asset.kpi_name === "散件揽收")?.components?.length >= 5);
  assert.ok(semanticLayer.metrics.some((metric) => metric.name === "首揽及时率 得分"));
  assert.ok(semanticLayer.metrics.every((metric) => metric.tags.includes("Semantic KPI Asset")));
});

test("Excel schema inference records per-field row coverage", async () => {
  const XLSX = await import("xlsx");
  const rows = [
    ["amazon_order_id", "sku", "asin", "item_price"],
    ["A-1", "SKU_0001", "B0001", 12.5],
    ["A-2", "SKU_0002", "", 14],
    ["A-3", "", "B0003", ""]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "orders");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const [table] = await inferTablesFromExcelBuffer("shopify_named_amazon_headers.xlsx", buffer);

  assert.equal(table.rowCount, 3);
  assert.equal(table.columns.find((column) => column.name === "amazon_order_id")?.rowCount, 3);
  assert.equal(table.columns.find((column) => column.name === "amazon_order_id")?.nonNullCount, 3);
  assert.equal(table.columns.find((column) => column.name === "sku")?.nonNullCount, 2);
  assert.equal(table.columns.find((column) => column.name === "asin")?.nonNullCount, 2);
  assert.equal(table.columns.find((column) => column.name === "item_price")?.nonNullCount, 2);
});
