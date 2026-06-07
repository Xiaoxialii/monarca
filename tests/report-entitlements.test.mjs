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

  if (accessType === "free_first_report") {
    next.firstFreeReportUsed = true;
    next.firstFreeReportUsedAt = now;
  }

  if (accessType === "one_time_purchase") {
    next.oneTimeReportAvailable = false;
    next.oneTimeReportUsedAt = now;
  }

  return next;
}

function markFailed(entitlement) {
  return { ...entitlement };
}

test("new workspace starts with first free report unused", () => {
  const entitlement = freeWorkspace();

  assert.equal(entitlement.firstFreeReportUsed, false);
});

test("free user can generate the first report", () => {
  const access = evaluateReportGenerationAccess(freeWorkspace(), now);

  assert.equal(access.allowed, true);
  assert.equal(access.reason, "FIRST_FREE_REPORT_AVAILABLE");
  assert.equal(access.accessType, "free_first_report");
});

test("successful first report marks firstFreeReportUsed", () => {
  const access = evaluateReportGenerationAccess(freeWorkspace(), now);
  const entitlement = markSucceeded(freeWorkspace(), access.accessType);

  assert.equal(entitlement.firstFreeReportUsed, true);
  assert.ok(entitlement.firstFreeReportUsedAt instanceof Date);
});

test("free report blocks another generation after success", () => {
  const entitlement = markSucceeded(freeWorkspace(), "free_first_report");
  const access = evaluateReportGenerationAccess(entitlement, now);

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "FREE_REPORT_USED");
});

test("failed report does not mark firstFreeReportUsed", () => {
  const entitlement = markFailed(freeWorkspace());
  const access = evaluateReportGenerationAccess(entitlement, now);

  assert.equal(entitlement.firstFreeReportUsed, false);
  assert.equal(access.allowed, true);
  assert.equal(access.accessType, "free_first_report");
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
  const entitlement = freeWorkspace();
  const access = evaluateReportGenerationAccess(entitlement, now);
  const once = markSucceeded(entitlement, access.accessType);
  const twice = markSucceeded(once, access.accessType);

  assert.equal(once.firstFreeReportUsed, true);
  assert.equal(twice.firstFreeReportUsed, true);
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
