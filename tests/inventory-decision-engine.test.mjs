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
const {
  evaluateInventoryDecision,
  inferDemandTrendFromOrderDates
} = jiti("./lib/inventory/inventory-decision-engine.ts");

test("growth SKU with high margin and increasing demand is healthy despite high inventory", () => {
  const decision = evaluateInventoryDecision({
    sku: "GROWTH",
    lifecycle_stage: "GROWTH",
    lifecycle_confidence: "HIGH",
    stock: 500,
    sold: 300,
    revenue: 15000,
    cogs: 6000,
    margin: 0.45,
    net_profit: 6750,
    sales_velocity: 10,
    velocity_confidence: "HIGH",
    data_period_days: 45,
    runway_days: 50,
    ad_spend: 800,
    roas_confidence: "HIGH",
    demandTrend: { direction: "UP", growth_rate: 0.45, confidence: "HIGH" }
  });

  assert.equal(decision.risk_status, "HEALTHY");
  assert.ok(["RESTOCK", "MAINTAIN"].includes(decision.recommended_action));
  assert.ok(decision.reasons.some((reason) => /Growth lifecycle/.test(reason)));
});

test("declining low margin SKU with high runway becomes excess inventory and reduce purchase", () => {
  const decision = evaluateInventoryDecision({
    sku: "DECLINING",
    lifecycle_stage: "DECLINING",
    lifecycle_confidence: "MEDIUM",
    stock: 900,
    sold: 60,
    revenue: 3000,
    cogs: 2100,
    margin: 0.08,
    net_profit: 240,
    sales_velocity: 3,
    velocity_confidence: "MEDIUM",
    data_period_days: 20,
    runway_days: 300,
    ad_spend: 250,
    roas_confidence: "MEDIUM",
    demandTrend: { direction: "DOWN", growth_rate: -0.35, confidence: "MEDIUM" }
  });

  assert.equal(decision.risk_status, "LIQUIDATION_RISK");
  assert.equal(decision.recommended_action, "LIQUIDATE");
  assert.ok(decision.inventoryRiskScore > 0.5);
});

test("single-period unknown lifecycle still calculates inventory risk", () => {
  const decision = evaluateInventoryDecision({
    sku: "UNKNOWN",
    lifecycle_stage: "UNKNOWN",
    lifecycle_confidence: "LOW",
    stock: 558,
    sold: 131,
    revenue: 23218,
    cogs: 8480.47,
    margin: 0.5576,
    net_profit: 12946.58,
    sales_velocity: 4.3667,
    velocity_confidence: "LOW",
    data_period_days: 0,
    runway_days: 127.8,
    ad_spend: 806,
    roas_confidence: "LOW"
  });

  assert.equal(decision.confidence, "LOW");
  assert.notEqual(decision.risk_status, "OBSERVATION");
  assert.equal(decision.recommended_action, "REDUCE_PURCHASE");
  assert.ok(decision.inventory_value > 0);
});

test("demand trend detects increasing recent order velocity", () => {
  const dates = [
    "2026-01-01", "2026-01-02", "2026-01-03",
    "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27"
  ];
  const trend = inferDemandTrendFromOrderDates({ totalUnitsSold: 90, orderDates: dates });

  assert.equal(trend.direction, "UP");
  assert.ok(trend.growth_rate > 0.5);
  assert.equal(trend.confidence, "MEDIUM");
});
