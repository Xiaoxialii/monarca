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
  attachSnapshotIdentity,
  isSnapshotFresh,
  shouldRejectSnapshotOverwrite
} = jiti("./lib/dashboard/snapshot-freshness.ts");
const {
  DECISION_ALGORITHM_VERSION,
  OPTIMIZATION_VERSION,
  SIMULATION_VERSION
} = jiti("./lib/dashboard/decision-snapshot-lifecycle.ts");
const {
  CANONICAL_PROFITABILITY_ENGINE_VERSION
} = jiti("./lib/profit/canonical-profitability-engine.ts");

function currentIdentity(overrides = {}) {
  return {
    canonicalDataVersion: "canonical-v12",
    canonicalSnapshotVersion: "canonical-v12",
    metricEngineVersion: "metric-v3",
    profitabilityEngineVersion: CANONICAL_PROFITABILITY_ENGINE_VERSION,
    algorithmVersion: DECISION_ALGORITHM_VERSION,
    optimizationVersion: OPTIMIZATION_VERSION,
    optimizationEngineVersion: OPTIMIZATION_VERSION,
    simulationVersion: SIMULATION_VERSION,
    inputHash: "hash-current",
    dataFingerprint: "hash-current",
    ...overrides
  };
}

test("snapshot freshness accepts matching current data and engine identity", () => {
  const identity = currentIdentity();
  const payload = attachSnapshotIdentity({ ok: true, state: "ready" }, identity);
  const result = isSnapshotFresh(payload, identity);

  assert.equal(result.isFresh, true);
  assert.equal(result.state, "READY");
  assert.deepEqual(result.reasons, []);
});

test("snapshot freshness rejects profitability engine mismatches", () => {
  const identity = currentIdentity();
  const payload = attachSnapshotIdentity({ ok: true, state: "ready" }, {
    ...identity,
    profitabilityEngineVersion: "v2.0-old"
  });
  payload.profitabilityEngineVersion = "v2.0-old";
  payload.decisionSnapshotVersions.profitabilityEngineVersion = "v2.0-old";
  payload.calculationIdentity.profitabilityEngineVersion = "v2.0-old";
  payload.snapshotIdentity.profitabilityEngineVersion = "v2.0-old";
  const result = isSnapshotFresh(payload, identity);

  assert.equal(result.isFresh, false);
  assert.ok(result.reasons.includes("profitability_engine_version_mismatch"));
});

test("snapshot freshness rejects stale canonical fingerprints", () => {
  const identity = currentIdentity();
  const payload = attachSnapshotIdentity({ ok: true, state: "ready" }, {
    ...identity,
    canonicalDataVersion: "canonical-v11",
    canonicalSnapshotVersion: "canonical-v11",
    inputHash: "hash-old",
    dataFingerprint: "hash-old"
  });
  const result = isSnapshotFresh(payload, identity);

  assert.equal(result.isFresh, false);
  assert.ok(result.reasons.includes("canonical_data_version_mismatch"));
  assert.ok(result.reasons.includes("data_fingerprint_mismatch"));
});

test("safe snapshot writer rejects failed or empty overwrites over valid rows", () => {
  assert.equal(shouldRejectSnapshotOverwrite({
    existingState: "ready",
    newState: "unavailable",
    existingHasRows: true,
    newHasRows: false
  }), true);

  assert.equal(shouldRejectSnapshotOverwrite({
    existingState: "stale",
    newState: "ready",
    existingHasRows: true,
    newHasRows: false
  }), true);

  assert.equal(shouldRejectSnapshotOverwrite({
    existingState: "stale",
    newState: "ready",
    existingHasRows: true,
    newHasRows: true
  }), false);
});
