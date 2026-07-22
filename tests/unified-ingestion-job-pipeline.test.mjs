import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("unified ingestion uses a dedicated async job model and schema status fields", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260721_add_unified_ingestion_jobs/migration.sql");

  assert.match(schema, /model UnifiedIngestionJob \{[\s\S]*status\s+String\s+@default\("QUEUED"\)/);
  assert.match(schema, /progress\s+Int\s+@default\(0\)/);
  assert.match(schema, /currentStep\s+String\?/);
  assert.match(schema, /errorMessage\s+String\?/);
  assert.match(schema, /schemaStatus\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /canonicalStatus\s+String\s+@default\("NOT_STARTED"\)/);
  assert.match(schema, /canonicalVersion\s+String\?/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS "UnifiedIngestionJob"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "schemaStatus"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "canonicalStatus"/);
});

test("upload routes enqueue ingestion jobs instead of running legacy post-processing", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const completeRoute = read("app/api/data-sources/upload/complete/route.ts");

  for (const source of [uploadRoute, completeRoute]) {
    assert.match(source, /unifiedIngestionJob\.create/);
    assert.match(source, /status:\s*"QUEUED"/);
    assert.match(source, /after\(\(\) => \{\s*void processIngestionJob\(ingestionJob\.id\)/);
    assert.match(source, /status:\s*"PROCESSING"/);
    assert.doesNotMatch(source, /runUploadPostProcessing\(/);
    assert.doesNotMatch(source, /runDirectUploadPostProcessing\(/);
    assert.doesNotMatch(source, /writeCanonicalDatasetArtifacts\(/);
    assert.doesNotMatch(source, /runUnifiedIngestionPipeline\(/);
    assert.doesNotMatch(source, /inferTablesFromExcelBuffer\(/);
    assert.doesNotMatch(source, /inferTablesFromCsvText\(/);
  }
});

test("worker owns canonicalization and commits schema state in a short transaction", () => {
  const worker = read("lib/ingestion/unified-ingestion-worker.ts");
  const statusRoute = read("app/api/ingestion/jobs/[jobId]/route.ts");
  const retryRoute = read("app/api/ingestion/jobs/[jobId]/retry/route.ts");

  assert.match(worker, /export async function processIngestionJob/);
  assert.match(worker, /status:\s*\{\s*in:\s*\["QUEUED", "FAILED"\]/);
  assert.match(worker, /currentStep:\s*"Building canonical model"/);
  assert.match(worker, /writeCanonicalDatasetArtifacts\(/);
  assert.match(worker, /generateEcommerceDecisionSnapshots\(client/);
  assert.match(worker, /canonicalVersion:\s*ECOMMERCE_CANONICAL_SCHEMA_VERSION/);
  assert.match(worker, /\$transaction\([\s\S]*timeout:\s*1_000/);
  assert.match(worker, /status:\s*"FAILED"/);

  assert.match(statusRoute, /export async function GET/);
  assert.match(statusRoute, /progress/);
  assert.match(statusRoute, /currentStep/);
  assert.match(retryRoute, /export async function POST/);
  assert.match(retryRoute, /status:\s*"FAILED"/);
  assert.match(retryRoute, /status:\s*"QUEUED"/);
  assert.match(retryRoute, /processIngestionJob\(jobId\)/);
});
