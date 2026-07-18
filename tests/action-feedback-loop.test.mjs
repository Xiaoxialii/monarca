import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("action feedback loop exposes tracking state machine and APIs", () => {
  const types = fs.readFileSync(join(process.cwd(), "lib/optimization/action-tracking-types.ts"), "utf8");
  const store = fs.readFileSync(join(process.cwd(), "lib/optimization/action-tracking-store.ts"), "utf8");
  const renderer = fs.readFileSync(join(process.cwd(), "components/report-renderer-engine.tsx"), "utf8");

  for (const status of ["pending", "accepted", "running", "completed", "learned", "rejected", "expired", "blocked"]) {
    assert.match(types, new RegExp(status));
  }

  assert.match(types, /ActionTrackingRecord/);
  assert.match(store, /acceptActionTrackingRecord/);
  assert.match(store, /rejectActionTrackingRecord/);
  assert.match(store, /updateActionTrackingRecords/);
  assert.match(store, /evaluateActionTrackingRecord/);
  assert.match(store, /recordOptimizationFeedback/);
  assert.match(renderer, /ActionOutcomeTracker/);
  assert.match(renderer, /ActionTrackingDrawer/);
  assert.match(renderer, /Baseline vs Predicted vs Actual/);
});

test("action feedback API routes are implemented", () => {
  const routes = [
    "app/api/actions/accept/route.ts",
    "app/api/actions/reject/route.ts",
    "app/api/actions/start/route.ts",
    "app/api/actions/route.ts",
    "app/api/actions/history/route.ts",
    "app/api/actions/performance/route.ts",
    "app/api/actions/[actionId]/route.ts",
    "app/api/actions/update-status/route.ts",
    "app/api/actions/evaluate/route.ts"
  ];

  for (const route of routes) {
    assert.ok(fs.existsSync(join(process.cwd(), route)), `${route} should exist`);
  }

  const acceptRoute = fs.readFileSync(join(process.cwd(), "app/api/actions/accept/route.ts"), "utf8");
  const updateRoute = fs.readFileSync(join(process.cwd(), "app/api/actions/update-status/route.ts"), "utf8");
  const evaluateRoute = fs.readFileSync(join(process.cwd(), "app/api/actions/evaluate/route.ts"), "utf8");

  assert.match(acceptRoute, /POST/);
  assert.match(acceptRoute, /baseline_metrics/);
  assert.match(acceptRoute, /predicted_metrics/);
  assert.match(updateRoute, /updateActionTrackingRecords/);
  assert.match(evaluateRoute, /evaluateActionTrackingRecord/);
});

test("optimization decision learning architecture is wired", () => {
  const schema = fs.readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const store = fs.readFileSync(join(process.cwd(), "lib/optimization/action-tracking-store.ts"), "utf8");
  const renderer = fs.readFileSync(join(process.cwd(), "components/report-renderer-engine.tsx"), "utf8");
  const dashboard = fs.readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");
  const thresholdEngine = fs.readFileSync(join(process.cwd(), "lib/optimization/dynamic-threshold-engine.ts"), "utf8");
  const routes = [
    "app/api/optimization/decisions/route.ts",
    "app/api/optimization/decision/[id]/accept/route.ts",
    "app/api/optimization/decision/[id]/reject/route.ts",
    "app/api/optimization/tracking/update/route.ts",
    "app/api/optimization/learning/performance/route.ts"
  ];

  assert.match(schema, /model OptimizationDecision/);
  assert.match(schema, /model OptimizationLearningRecord/);
  assert.match(schema, /model DecisionSnapshot/);
  assert.match(schema, /PENDING_APPROVAL/);
  assert.match(schema, /LEARNED/);
  assert.match(schema, /baselineSnapshotId/);
  assert.match(schema, /predictionSnapshotId/);
  assert.match(schema, /model DecisionTrackingSnapshot/);
  assert.match(schema, /attributedProfitChange/);
  assert.match(schema, /organicProfitChange/);
  assert.match(schema, /outcomeStatus/);
  assert.match(store, /upsertOptimizationDecisionFromAction/);
  assert.match(store, /upsertOptimizationDecisionFromRejectedAction/);
  assert.match(store, /createDecisionSnapshots/);
  assert.match(store, /startActionTrackingRecord/);
  assert.match(store, /writeDecisionTrackingSnapshot/);
  assert.match(store, /calculateDecisionAttribution/);
  assert.match(store, /createOptimizationLearningRecord/);
  assert.match(renderer, /Accepted Optimization Impact/);
  assert.match(renderer, /No accepted actions yet/);
  assert.match(dashboard, /Observed Profit Impact/);
  assert.match(dashboard, /Collecting data/);
  assert.match(thresholdEngine, /optimization_outcome_history/);

  for (const route of routes) {
    assert.ok(fs.existsSync(join(process.cwd(), route)), `${route} should exist`);
  }
});
