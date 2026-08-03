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
const { calculateSkuProfitability, CANONICAL_PROFITABILITY_ENGINE_VERSION } = jiti("./lib/profit/canonical-profitability-engine.ts");
const { evaluateActionEligibility } = jiti("./lib/optimization/policy/optimization-policy.ts");
const { DEFAULT_OPTIMIZATION_POLICY } = jiti("./lib/optimization/policy/default-policies.ts");

test("canonical profitability v2 keeps ads separate from total cost", () => {
  const result = calculateSkuProfitability({
    revenue: 1000,
    cogs: 400,
    shippingCost: 30,
    fulfillmentCost: 20,
    platformFee: 40,
    paymentFee: 25,
    refundCost: 15,
    adSpend: 100,
    cogsStatus: "AVAILABLE",
    cogsConfidence: 1,
    adAllocationMethod: "DIRECT_SKU",
    attributionConfidence: 0.95
  });

  assert.equal(result.engine_version, CANONICAL_PROFITABILITY_ENGINE_VERSION);
  assert.equal(result.gross_profit, 600);
  assert.equal(result.operating_cost, 130);
  assert.equal(result.contribution_profit, 470);
  assert.equal(result.total_cost, 530);
  assert.equal(result.ad_spend, 100);
  assert.equal(result.net_profit, 370);
  assert.equal(result.margin, 0.37);
  assert.equal(result.validation.validation_status, "PASSED");
});

test("missing COGS blocks optimization instead of creating fake profit", () => {
  const result = calculateSkuProfitability({
    revenue: 1000,
    cogs: 0,
    adSpend: 50,
    cogsStatus: "MISSING",
    cogsConfidence: 0,
    adAllocationMethod: "DIRECT_SKU",
    attributionConfidence: 0.95
  });

  assert.equal(result.cogs_status, "MISSING");
  assert.equal(result.validation.optimization_allowed, false);
  assert.ok(result.validation.warnings.some((warning) => /COGS is missing/i.test(warning)));
  assert.ok(result.profitability_confidence < 0.5);
});

test("low attribution confidence blocks aggressive scale ads action", () => {
  const sku = {
    sku: "SKU-LOW-ATTR",
    revenue: 1000,
    quantity: 20,
    price: 50,
    cogs: 20,
    ads_spend: 200,
    margin: 0.35,
    net_profit: 350,
    inventory: 1000,
    sales_velocity: 2,
    refund_rate: 0,
    customer_ltv: 120,
    conversion_rate: 0.04,
    prediction_confidence: 0.9,
    cogs_status: "AVAILABLE",
    cogs_confidence: 1,
    attribution_confidence: 0.4,
    optimization_allowed: true
  };

  const result = evaluateActionEligibility({
    sku,
    action: "SCALE_ADS",
    policy: DEFAULT_OPTIMIZATION_POLICY,
    coverageDays: 90
  });

  assert.equal(result.allowed, false);
  assert.ok(result.rejectedReasons.some((reason) => /attribution confidence/i.test(reason)));
});
