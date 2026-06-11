import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReportGenerationAccess } from "../lib/report-entitlement-rules.mjs";

const now = new Date("2026-06-07T00:00:00.000Z");

function freeWorkspace(overrides = {}) {
  return {
    firstFreeReportUsed: false,
    oneTimeReportAvailable: false,
    subscriptionStatus: "free",
    monthlyUnlimited: false,
    currentPeriodEnd: null,
    historyVisible: true,
    ...overrides
  };
}

function markSucceeded(entitlement, accessType) {
  const next = { ...entitlement };

  if (accessType === "one_time_purchase") {
    next.oneTimeReportAvailable = false;
    next.oneTimeReportUsedAt = now;
  }

  return next;
}

function markFailed(entitlement) {
  return { ...entitlement };
}

test("new workspace has no free report allowance", () => {
  const entitlement = freeWorkspace();

  assert.equal(entitlement.firstFreeReportUsed, false);
});

test("free user cannot generate reports", () => {
  const access = evaluateReportGenerationAccess(freeWorkspace(), now);

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "NO_ACCESS");
  assert.equal(access.accessType, undefined);
});

test("failed report does not grant free generation", () => {
  const entitlement = markFailed(freeWorkspace());
  const access = evaluateReportGenerationAccess(entitlement, now);

  assert.equal(entitlement.firstFreeReportUsed, false);
  assert.equal(access.allowed, false);
  assert.equal(access.reason, "NO_ACCESS");
});

test("one-time report can generate once and is consumed on success", () => {
  const entitlement = freeWorkspace({
    firstFreeReportUsed: true,
    oneTimeReportAvailable: true,
    subscriptionPlan: "one_time"
  });
  const access = evaluateReportGenerationAccess(entitlement, now);
  const afterSuccess = markSucceeded(entitlement, access.accessType);

  assert.equal(access.allowed, true);
  assert.equal(access.accessType, "one_time_purchase");
  assert.equal(afterSuccess.oneTimeReportAvailable, false);
});

test("active monthly subscription can generate unlimited reports", () => {
  const entitlement = freeWorkspace({
    firstFreeReportUsed: true,
    subscriptionStatus: "active",
    monthlyUnlimited: true,
    currentPeriodEnd: "2026-07-07T00:00:00.000Z"
  });

  assert.deepEqual(evaluateReportGenerationAccess(entitlement, now), {
    allowed: true,
    reason: "SUBSCRIPTION_ACTIVE",
    accessType: "subscription"
  });
  assert.equal(markSucceeded(entitlement, "subscription").firstFreeReportUsed, true);
});

test("expired subscription does not allow unlimited generation", () => {
  const entitlement = freeWorkspace({
    firstFreeReportUsed: true,
    subscriptionStatus: "active",
    monthlyUnlimited: true,
    currentPeriodEnd: "2026-06-01T00:00:00.000Z"
  });
  const access = evaluateReportGenerationAccess(entitlement, now);

  assert.equal(access.allowed, false);
});

test("same idempotency key does not consume twice", () => {
  const entitlement = freeWorkspace({ oneTimeReportAvailable: true });
  const access = evaluateReportGenerationAccess(entitlement, now);
  const once = markSucceeded(entitlement, access.accessType);
  const twice = markSucceeded(once, access.accessType);

  assert.equal(once.oneTimeReportAvailable, false);
  assert.equal(twice.oneTimeReportAvailable, false);
});

test("no access maps to NO_REPORT_ACCESS API semantics", () => {
  const access = evaluateReportGenerationAccess(freeWorkspace({ firstFreeReportUsed: true }), now);
  const apiError = access.allowed ? null : {
    error: "NO_REPORT_ACCESS",
    upgradeRequired: true
  };

  assert.deepEqual(apiError, {
    error: "NO_REPORT_ACCESS",
    upgradeRequired: true
  });
});

test("used free report does not hide historical reports", () => {
  const entitlement = freeWorkspace({
    firstFreeReportUsed: true,
    historyVisible: true
  });
  const access = evaluateReportGenerationAccess(entitlement, now);

  assert.equal(access.allowed, false);
  assert.equal(entitlement.historyVisible, true);
});
