import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("unified ingestion uses a dedicated async job model and schema status fields", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260721_add_unified_ingestion_jobs/migration.sql");
  const recoveryMigration = read("prisma/migrations/20260722_add_ingestion_job_recovery/migration.sql");
  const asyncMigration = read("prisma/migrations/20260723_add_unified_async_jobs/migration.sql");

  assert.match(schema, /model UnifiedIngestionJob \{[\s\S]*status\s+String\s+@default\("QUEUED"\)/);
  assert.match(schema, /progress\s+Int\s+@default\(0\)/);
  assert.match(schema, /currentStep\s+String\?/);
  assert.match(schema, /errorMessage\s+String\?/);
  assert.match(schema, /heartbeatAt\s+DateTime\?/);
  assert.match(schema, /lockedAt\s+DateTime\?/);
  assert.match(schema, /lockedBy\s+String\?/);
  assert.match(schema, /retryCount\s+Int\s+@default\(0\)/);
  assert.match(schema, /schemaStatus\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /canonicalStatus\s+String\s+@default\("NOT_STARTED"\)/);
  assert.match(schema, /canonicalVersion\s+String\?/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS "UnifiedIngestionJob"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "schemaStatus"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "canonicalStatus"/);
  assert.match(recoveryMigration, /ADD COLUMN IF NOT EXISTS "heartbeatAt"/);
  assert.match(recoveryMigration, /ADD COLUMN IF NOT EXISTS "retryCount"/);

  assert.match(schema, /model AsyncJob \{/);
  assert.match(schema, /type\s+String/);
  assert.match(schema, /status\s+String\s+@default\("QUEUED"\)/);
  assert.match(schema, /payload\s+Json\?/);
  assert.match(schema, /resultReference\s+Json\?/);
  assert.match(schema, /model Snapshot \{/);
  assert.match(schema, /sourceJobId\s+String\?/);
  assert.match(schema, /dataReference\s+Json\?/);
  assert.match(asyncMigration, /CREATE TABLE IF NOT EXISTS "AsyncJob"/);
  assert.match(asyncMigration, /CREATE TABLE IF NOT EXISTS "Snapshot"/);
});

test("upload routes enqueue ingestion jobs instead of running legacy post-processing", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const completeRoute = read("app/api/data-sources/upload/complete/route.ts");

  for (const source of [uploadRoute, completeRoute]) {
    assert.match(source, /unifiedIngestionJob\.create/);
    assert.match(source, /createAsyncJob\(prisma/);
    assert.match(source, /type:\s*"INGESTION"/);
    assert.match(source, /unifiedIngestionJobId:\s*ingestionJob\.id/);
    assert.match(source, /status:\s*"QUEUED"/);
    assert.match(source, /after\(\(\) => \{\s*void processJob\(asyncJob\.id\)/);
    assert.match(source, /status:\s*"PROCESSING"/);
    assert.match(source, /asyncJobId:\s*asyncJob\.id/);
    assert.doesNotMatch(source, /runUploadPostProcessing\(/);
    assert.doesNotMatch(source, /runDirectUploadPostProcessing\(/);
    assert.doesNotMatch(source, /writeCanonicalDatasetArtifacts\(/);
    assert.doesNotMatch(source, /runUnifiedIngestionPipeline\(/);
    assert.doesNotMatch(source, /inferTablesFromExcelBuffer\(/);
    assert.doesNotMatch(source, /inferTablesFromCsvText\(/);
  }
});

test("async job runner centralizes lifecycle, heartbeat, snapshots, and recovery", () => {
  const runner = read("lib/jobs/async-job-runner.ts");
  const statusRoute = read("app/api/jobs/[jobId]/route.ts");
  const retryRoute = read("app/api/jobs/[jobId]/retry/route.ts");
  const recoveryRoute = read("app/api/jobs/recover/route.ts");

  assert.match(runner, /export const ASYNC_JOB_TYPES\s*=\s*\[/);
  assert.match(runner, /"INGESTION"/);
  assert.match(runner, /"SYNC_CONNECTOR"/);
  assert.match(runner, /"CALCULATE_METRICS"/);
  assert.match(runner, /"PROFIT_ANALYSIS"/);
  assert.match(runner, /"GENERATE_REPORT"/);
  assert.match(runner, /"SKU_OPTIMIZATION"/);
  assert.match(runner, /export async function processJob/);
  assert.match(runner, /client\.asyncJob\.updateMany/);
  assert.match(runner, /startHeartbeat/);
  assert.match(runner, /executeJobHandler/);
  assert.match(runner, /processIngestionJob\(ingestionJobId/);
  assert.match(runner, /generateWorkspaceMetricsFromConnectedSources/);
  assert.match(runner, /normalizeProfitInputs/);
  assert.match(runner, /generateEcommerceDecisionSnapshots\(client/);
  assert.match(runner, /client\.snapshot\.create/);
  assert.match(runner, /staleQueuedJobWhere/);
  assert.match(runner, /staleResumableJobWhere/);
  assert.match(runner, /export async function recoverAsyncJobs/);
  assert.doesNotMatch(runner, /\$transaction\(/);

  assert.match(statusRoute, /workspaceId:\s*session\.workspace\.id/);
  assert.match(retryRoute, /retryableAsyncJobWhere/);
  assert.match(retryRoute, /processJob\(jobId\)/);
  assert.match(recoveryRoute, /recoverAsyncJobs/);
  assert.match(recoveryRoute, /RECOVERY_QUEUED/);
});

test("worker owns canonicalization and commits schema state without long interactive transactions", () => {
  const worker = read("lib/ingestion/unified-ingestion-worker.ts");
  const statusRoute = read("app/api/ingestion/jobs/[jobId]/route.ts");
  const retryRoute = read("app/api/ingestion/jobs/[jobId]/retry/route.ts");
  const recoveryRoute = read("app/api/ingestion/jobs/recover/route.ts");

  assert.match(worker, /export async function processIngestionJob/);
  assert.match(worker, /STALE_INGESTION_JOB_MS/);
  assert.match(worker, /QUEUED_INGESTION_JOB_MS/);
  assert.match(worker, /ACTIVE_INGESTION_JOB_STATUSES\s*=\s*\["PROCESSING", "SCHEMA_READY", "CANONICALIZING"\]/);
  assert.match(worker, /staleActiveJobWhere/);
  assert.match(worker, /staleQueuedJobWhere/);
  assert.match(worker, /retryCount:\s*\{\s*increment:/);
  assert.match(worker, /startHeartbeat/);
  assert.match(worker, /currentStep:\s*"Building canonical model"/);
  assert.match(worker, /writeCanonicalDatasetArtifacts\(/);
  assert.doesNotMatch(worker, /generateEcommerceDecisionSnapshots\(client/);
  assert.doesNotMatch(worker, /generateWorkspaceMetricsFromConnectedSources/);
  assert.match(worker, /canonicalVersion:\s*ECOMMERCE_CANONICAL_SCHEMA_VERSION/);
  assert.match(worker, /schemaJson,/);
  assert.doesNotMatch(worker, /\$transaction\(/);
  assert.match(worker, /status:\s*"FAILED"/);

  assert.match(statusRoute, /export async function GET/);
  assert.match(statusRoute, /heartbeatAt/);
  assert.match(statusRoute, /retryCount/);
  assert.match(statusRoute, /progress/);
  assert.match(statusRoute, /currentStep/);
  assert.match(retryRoute, /export async function POST/);
  assert.match(retryRoute, /retryableIngestionJobWhere/);
  assert.match(retryRoute, /status:\s*"QUEUED"/);
  assert.match(retryRoute, /processIngestionJob\(jobId\)/);
  assert.match(recoveryRoute, /recoverStaleIngestionJobs/);
  assert.match(recoveryRoute, /RECOVERY_QUEUED/);
});

test("decision snapshots degrade gracefully when profit inputs are incomplete", () => {
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");
  const normalizer = read("lib/profit/profit-input-normalizer.ts");

  assert.match(normalizer, /export type ProfitInputModel/);
  assert.match(normalizer, /profitDataCoverage/);
  assert.match(normalizer, /optimizationLevel/);
  assert.match(normalizer, /gross_profit/);
  assert.match(normalizer, /contribution_margin/);
  assert.match(generator, /normalizeProfitInputs/);
  assert.match(generator, /profitInputModel/);
  assert.match(generator, /profitDataCoverage/);
  assert.match(generator, /PARTIAL_OPTIMIZATION_INPUTS/);
  assert.match(generator, /partialSkuRecommendations/);
  assert.match(generator, /SNAPSHOT_ROW_LIMIT/);
  assert.match(generator, /compactDecisionReport/);
  assert.match(generator, /compactSkuOptimizationAlgorithm/);
  assert.match(generator, /profitInputModel\.rows\.slice\(0, SNAPSHOT_ROW_LIMIT\)/);
  assert.doesNotMatch(generator, /OPTIMIZATION_INPUTS_INCOMPLETE/);
  assert.doesNotMatch(generator, /const exposedReport = needsProfitInputs \? null : report/);
});
