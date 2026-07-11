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
const { runSelfEvolvingCommerceOS } = jiti("./lib/evolution/self-evolving-commerce-os.ts");

function state() {
  return {
    skus: [
      { skuId: "SKU_SCALE", revenue: 2000, quantity: 80, grossProfit: 920, adSpend: 260, inventory: 500, salesVelocity: 8, roas: 4.1, margin: 0.46 },
      { skuId: "SKU_REPAIR", revenue: 900, quantity: 30, grossProfit: 90, adSpend: 160, inventory: 90, salesVelocity: 4, roas: 0.8, margin: 0.1 },
      { skuId: "SKU_STABLE", revenue: 1200, quantity: 45, grossProfit: 480, adSpend: 130, inventory: 150, salesVelocity: 5, roas: 2.4, margin: 0.4 }
    ],
    constraints: {
      budgetLimit: 600,
      minRoas: 1.5,
      maxCac: 80,
      cashFlowLimit: 3000
    }
  };
}

test("self-evolving commerce OS returns required top-level structure", () => {
  const result = runSelfEvolvingCommerceOS({ state: state(), mode: "suggest" });

  assert.equal(result.version, "self_evolving_commerce_os_v1");
  assert.equal(result.system_version, "v_next");
  assert.ok(Array.isArray(result.best_actions));
  assert.ok(Array.isArray(result.executed_actions));
  assert.ok(Array.isArray(result.policy_updates));
  assert.ok(Array.isArray(result.strategy_mutations));
  assert.ok(Array.isArray(result.evolution_log));
  assert.equal(typeof result.confidence, "number");
  assert.equal(result.objective_function_update.rollback_token.includes("rollback"), true);
});

test("suggest mode blocks active objective mutation without feedback", () => {
  const result = runSelfEvolvingCommerceOS({ state: state(), mode: "suggest" });

  assert.equal(result.feedback.outcomes.length, 0);
  assert.equal(result.objective_function_update.previous_weights.profit, result.objective_function_update.next_weights.profit);
  assert.match(result.objective_function_update.next_objective, /suggest/);
  assert.ok(result.evolution_log.some((entry) => entry.event === "objective_function_update_blocked"));
});

test("evolution mode uses feedback to mutate policies and objective weights", () => {
  const base = state();
  const result = runSelfEvolvingCommerceOS({
    state: base,
    mode: "evolution",
    actualOutcomes: {
      SKU_SCALE: 180,
      SKU_REPAIR: -25,
      SKU_STABLE: 55
    }
  });

  assert.ok(result.feedback.outcomes.length > 0);
  assert.ok(result.policy_updates.length > 0);
  assert.notDeepEqual(result.objective_function_update.previous_weights, result.objective_function_update.next_weights);
  assert.ok(result.policy_updates.every((policy) => policy.rollback_token.includes("rollback")));
  assert.ok(result.safety_constraints.includes("profit_safety_constraint"));
});

test("strategy mutations are ranked by risk-adjusted expected profit", () => {
  const result = runSelfEvolvingCommerceOS({
    state: state(),
    mode: "evolution",
    actualOutcomes: {
      SKU_SCALE: 180,
      SKU_REPAIR: -25
    }
  });

  for (let index = 1; index < result.strategy_mutations.length; index += 1) {
    const previous = result.strategy_mutations[index - 1];
    const current = result.strategy_mutations[index];
    assert.ok(previous.expected_profit - previous.risk * 1000 >= current.expected_profit - current.risk * 1000);
  }
});

test("evolution API route and modules avoid LLM-driven mutation", () => {
  const route = fs.readFileSync(join(process.cwd(), "app/api/evolution/run/route.ts"), "utf8");
  const evolutionFiles = [
    "lib/evolution/evolution-engine.ts",
    "lib/evolution/policy-generator.ts",
    "lib/evolution/objective-function-updater.ts",
    "lib/evolution/self-evolving-commerce-os.ts"
  ].map((file) => fs.readFileSync(join(process.cwd(), file), "utf8")).join("\n");

  assert.match(route, /runSelfEvolvingCommerceOS/);
  assert.doesNotMatch(evolutionFiles, /openai|gpt|prompt|chatCompletion/i);
});
