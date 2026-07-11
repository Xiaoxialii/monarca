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
    "app/api/actions/route.ts",
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
