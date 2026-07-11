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
const { runOptimization } = jiti("./lib/optimization/solver.ts");
const { runPolicy } = jiti("./lib/policy/policy-engine.ts");
const { runClosedLoopPolicy } = jiti("./lib/policy/policy-runner.ts");
const { trackOutcome } = jiti("./lib/feedback/outcome-tracker.ts");
const { updatePolicyWeights } = jiti("./lib/feedback/policy-update.ts");
const { generatePolicyReport } = jiti("./lib/llm/report-generator.ts");

function commerceState() {
  return {
    skus: [
      { skuId: "SKU_SCALE", revenue: 1000, quantity: 50, grossProfit: 500, adSpend: 120, inventory: 200, salesVelocity: 4, roas: 3, margin: 0.5 },
      { skuId: "SKU_STOP", revenue: 300, quantity: 20, grossProfit: 80, adSpend: 150, inventory: 80, salesVelocity: 2, roas: 0.8, margin: 0.1 }
    ],
    constraints: {
      budgetLimit: 500,
      minRoas: 1.5,
      maxCac: 80
    }
  };
}

test("closed-loop optimization produces SCALE STOP FIX decisions under constraints", () => {
  const result = runOptimization(commerceState());

  assert.ok(result.decisions.length > 0);
  assert.ok(result.budgetUsed <= 500);
  assert.ok(result.objectiveValue > 0);
  assert.ok(result.decisions.every((decision) => ["SCALE", "STOP", "FIX"].includes(decision.action)));
});

test("policy runner executes prediction optimization policy flow", () => {
  const result = runClosedLoopPolicy(commerceState());

  assert.deepEqual(result.flow, [
    "ingest_data",
    "build_state",
    "predict_metrics",
    "optimize_profit",
    "finalize_policy",
    "prepare_execution",
    "capture_feedback",
    "update_policy"
  ]);
  assert.equal(result.policyVersion, "policy_engine_v1");
  assert.ok(result.predictions.demand.length > 0);
  assert.ok(result.predictions.roas.length > 0);
  assert.ok(result.predictions.inventoryRunway.length > 0);
  assert.deepEqual(runPolicy(commerceState()), result.decisions);
});

test("feedback updates policy weights from actual outcomes", () => {
  const [decision] = runPolicy(commerceState());
  const outcome = trackOutcome(decision, decision.expectedProfitImpact + 25, "2026-07-06T00:00:00.000Z");
  const update = updatePolicyWeights([outcome], commerceState().policyWeights);

  assert.equal(outcome.skuId, decision.skuId);
  assert.ok(update.rewards[0].reward > 1);
  assert.ok(update.nextWeights.profit > 0);
});

test("LLM layer only explains decisions and does not optimize", () => {
  const decisions = runPolicy(commerceState());
  const report = generatePolicyReport(decisions);
  const llmSource = [
    fs.readFileSync(join(process.cwd(), "lib/llm/explainer.ts"), "utf8"),
    fs.readFileSync(join(process.cwd(), "lib/llm/report-generator.ts"), "utf8")
  ].join("\n");
  const solverSource = fs.readFileSync(join(process.cwd(), "lib/optimization/solver.ts"), "utf8");

  assert.match(report.summary, /decisions generated/);
  assert.doesNotMatch(llmSource, /solve\(|runOptimization|ProfitOptimizer|forecastSkuDemand|predictSkuRoas/);
  assert.doesNotMatch(solverSource, /openai|gpt|prompt|llm|explain/i);
});

test("closed-loop API routes exist", () => {
  for (const path of [
    "app/api/optimization/run/route.ts",
    "app/api/policy/run/route.ts",
    "app/api/runtime/execute/route.ts"
  ]) {
    assert.ok(fs.existsSync(join(process.cwd(), path)), `${path} should exist`);
  }
});
