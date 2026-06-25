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
const { explainKpi } = jiti("./lib/kpi-explanation.ts");

test("explains lower-is-better KPI without exposing formula syntax", () => {
  const explanation = explainKpi({
    name: "一次性未解决",
    today: 18,
    yesterday: 6,
    change_pct: 2,
    formula: "first_resolution=false",
    direction: "lower_is_better"
  });

  assert.equal(explanation.title, "一次性未解决");
  assert.match(explanation.meaning, /not resolved|首次|first/i);
  assert.equal(explanation.calculation.includes("first_resolution=false"), false);
  assert.match(explanation.calculation, /not solved|未/i);
  assert.equal(explanation.comparison, "18 vs 6，较昨日上升。");
  assert.equal(explanation.note, "该指标越低越好，上升表示表现变差。");
});

test("uses no-history note when previous value is missing", () => {
  const explanation = explainKpi({
    name: "KPI 总分",
    today: 0,
    yesterday: null,
    change_pct: null,
    formula: "AVG(total_score)",
    direction: "higher_is_better"
  });

  assert.equal(explanation.comparison, null);
  assert.equal(explanation.note, "暂无历史数据，无法进行趋势对比。");
  assert.equal(explanation.calculation, "计算该指标记录值的平均水平。");
});

test("uses definition as plain business meaning", () => {
  const explanation = explainKpi({
    name: "Net Sales",
    today: 90,
    yesterday: 120,
    change_pct: -0.25,
    definition: "Sales after discounts and returns.",
    formula: "SUM(net_sales)",
    direction: "higher_is_better"
  });

  assert.equal(explanation.meaning, "Sales after discounts and returns.");
  assert.equal(explanation.note, "A decrease indicates deterioration in performance.");
});
