import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("optimization worker has an authenticated cron endpoint", () => {
  const route = read("app/api/internal/jobs/process/route.ts");
  const vercel = JSON.parse(read("vercel.json"));

  assert.match(route, /ASYNC_JOB_WORKER_SECRET/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /processAsyncJobBatch/);
  assert.match(route, /recoverAsyncJobs/);
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/internal/jobs/process"));
});

test("async job runner uses identity, lease, heartbeat, and optimization-specific stale windows", () => {
  const runner = read("lib/jobs/async-job-runner.ts");

  assert.match(runner, /optimizationJobIdentity/);
  assert.match(runner, /leaseExpiresAt/);
  assert.match(runner, /lockedBy: owner/);
  assert.match(runner, /OPTIMIZATION_HEARTBEAT_STALE_MS/);
  assert.match(runner, /OPTIMIZATION_QUEUED_STALE_MS/);
  assert.match(runner, /processAsyncJobBatch/);
});

test("database migration preserves historical jobs and adds partial unique identity", () => {
  const migration = read("prisma/migrations/20260816_async_job_worker_reliability/migration.sql");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "identity"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "leaseExpiresAt"/);
  assert.match(migration, /WHERE "identity" IS NOT NULL/);
  assert.doesNotMatch(migration, /DELETE FROM/i);
  assert.doesNotMatch(migration, /DROP TABLE/i);
});

test("decision report and optimize routes share optimization readiness gate", () => {
  const decisionReport = read("app/api/dashboard/ecommerce/decision-report/route.ts");
  const optimize = read("app/api/dashboard/ecommerce/optimize/route.ts");

  assert.match(decisionReport, /optimizationReadiness/);
  assert.match(decisionReport, /readiness:/);
  assert.match(optimize, /optimizationReadiness/);
  assert.match(optimize, /readiness\.ready/);
});

test("job polling is read-only and retry is readiness gated", () => {
  const statusRoute = read("app/api/jobs/[jobId]/route.ts");
  const retryRoute = read("app/api/jobs/[jobId]/retry/route.ts");

  assert.doesNotMatch(statusRoute, /processJob/);
  assert.match(statusRoute, /optimizationRecoveryState/);
  assert.match(statusRoute, /recovery/);
  assert.match(retryRoute, /optimizationReadiness/);
  assert.match(retryRoute, /status:\s*"CANONICAL_NOT_READY"/);
  assert.match(retryRoute, /status:\s*"QUEUED"/);
  assert.match(retryRoute, /leaseExpiresAt:\s*null/);
  assert.match(retryRoute, /after\(\(\) => \{\s*void processJob\(jobId\)/);
});
