import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiFactory = require("jiti");
const jiti = jitiFactory(process.cwd() + "/");
const { recommendationIdFromRecord } = jiti("./lib/optimization/recommendation-identity.ts");

test("same business recommendation has stable id across queue and portfolio row shapes", () => {
  const context = {
    policyVersion: "expert-policy-v1",
    optimizerVersion: "optimizer-v2.4",
    simulationVersion: "simulation-v2",
    dataVersion: "data-v1"
  };
  const queueRow = {
    skuId: "SKU_01663",
    action: "SCALE",
    sourceAction: "RESTOCK_AND_SCALE",
    expectedProfitImpact: 107.46,
    confidence: 0.6522
  };
  const portfolioRow = {
    sku: "SKU_01663",
    action: "RESTOCK_AND_SCALE",
    profit_delta: 107.46,
    confidence: 0.6522
  };

  assert.equal(
    recommendationIdFromRecord(queueRow, context),
    recommendationIdFromRecord(portfolioRow, context)
  );
});

test("material recommendation parameter change creates a new id", () => {
  const context = {
    policyVersion: "expert-policy-v1",
    optimizerVersion: "optimizer-v2.4",
    simulationVersion: "simulation-v2",
    dataVersion: "data-v1"
  };
  const base = {
    skuId: "SKU_01663",
    action: "SCALE",
    expectedProfitImpact: 107.46,
    simulation: {
      current_ads_spend: 2148.6,
      recommended_ads_spend: 2286.52
    }
  };
  const changed = {
    ...base,
    simulation: {
      current_ads_spend: 2148.6,
      recommended_ads_spend: 2500
    }
  };

  assert.notEqual(
    recommendationIdFromRecord(base, context),
    recommendationIdFromRecord(changed, context)
  );
});

test("prediction impact change alone does not create a new recommendation id", () => {
  const context = {
    policyVersion: "expert-policy-v1",
    optimizerVersion: "optimizer-v2.4",
    simulationVersion: "simulation-v2",
    dataVersion: "data-v1"
  };
  const base = {
    skuId: "SKU_01663",
    action: "SCALE",
    expectedProfitImpact: 581.11,
    confidence: 0.6522,
    simulation: {
      current_ads_spend: 2148.6,
      recommended_ads_spend: 2286.52
    }
  };
  const changedImpact = {
    ...base,
    expectedProfitImpact: 107.46,
    confidence: 0.61
  };

  assert.equal(
    recommendationIdFromRecord(base, context),
    recommendationIdFromRecord(changedImpact, context)
  );
});
