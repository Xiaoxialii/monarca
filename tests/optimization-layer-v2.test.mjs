import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
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
const { runOptimizationLayerV2 } = jiti("./lib/optimization/optimization-layer-v2.ts");
const { simulateAllScenarios } = jiti("./lib/optimization/simulation-search.ts");

function state() {
  return {
    skus: [
      { skuId: "SKU_JOINT", revenue: 1000, quantity: 50, grossProfit: 520, adSpend: 120, inventory: 300, salesVelocity: 5, roas: 3.5, margin: 0.52 },
      { skuId: "SKU_STOP", revenue: 300, quantity: 20, grossProfit: 80, adSpend: 180, inventory: 100, salesVelocity: 2, roas: 0.7, margin: 0.08 },
      { skuId: "SKU_HOLD", revenue: 700, quantity: 35, grossProfit: 300, adSpend: 80, inventory: 25, salesVelocity: 4, roas: 2.1, margin: 0.42 }
    ],
    constraints: {
      budgetLimit: 200,
      minRoas: 1.5,
      maxCac: 100,
      cashFlowLimit: 1000
    }
  };
}

test("optimization layer v2 returns complete structured report", () => {
  const report = runOptimizationLayerV2(state());

  assert.equal(report.version, "optimization_layer_v2");
  assert.equal(typeof report.executive_summary.total_profit, "number");
  assert.ok(Array.isArray(report.executive_summary.key_drivers));
  assert.ok(Array.isArray(report.best_actions));
  assert.ok(Array.isArray(report.budget_allocation));
  assert.ok(Array.isArray(report.joint_optimization_results));
  assert.ok(Array.isArray(report.simulation_results));
  assert.ok(Array.isArray(report.ranking));
  assert.ok(Array.isArray(report.constraints_applied));
  assert.equal(typeof report.confidence_score, "number");
});

test("budget allocation respects budget constraint", () => {
  const report = runOptimizationLayerV2(state());
  const budgetUsed = report.budget_allocation.reduce((sum, row) => sum + row.allocated_budget, 0);

  assert.ok(budgetUsed <= state().constraints.budgetLimit);
});

test("simulation result is reproducible", () => {
  assert.deepEqual(simulateAllScenarios(state().skus), simulateAllScenarios(state().skus));
});

test("joint optimization can beat single-variable optimization", () => {
  const report = runOptimizationLayerV2(state());
  const joint = report.joint_optimization_results.find((row) => row.sku === "SKU_JOINT");

  assert.ok(joint);
  assert.equal(joint.beats_single_variable, true);
});

test("global optimized profit beats baseline profit", () => {
  const report = runOptimizationLayerV2(state());

  assert.ok(report.executive_summary.optimized_profit > report.executive_summary.current_profit);
  assert.ok(report.executive_summary.profit_change > 0);
});

test("ranking is sorted descending and actions have explanations", () => {
  const report = runOptimizationLayerV2(state());

  for (let index = 1; index < report.ranking.length; index += 1) {
    assert.ok(report.ranking[index - 1].score >= report.ranking[index].score);
  }
  assert.ok(report.best_actions.length > 0);
  assert.ok(report.best_actions.every((action) => typeof action.reason === "string" && action.reason.length > 10));
});

test("optimization API exposes v2 report and v2 is not LLM driven", () => {
  const routeSource = fs.readFileSync(join(process.cwd(), "app/api/optimization/run/route.ts"), "utf8");
  const v2Source = fs.readFileSync(join(process.cwd(), "lib/optimization/optimization-layer-v2.ts"), "utf8");

  assert.match(routeSource, /optimization_report/);
  assert.match(routeSource, /runOptimizationLayerV2/);
  assert.doesNotMatch(v2Source, /openai|gpt|prompt|llm|explainDecision/i);
});
