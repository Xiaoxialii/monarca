import assert from "node:assert/strict";
import fs from "node:fs";
import jitiFactory from "jiti";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(new URL("../", import.meta.url).pathname);
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/monarca_test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("unified ingestion uses a dedicated async job model and schema status fields", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260721_add_unified_ingestion_jobs/migration.sql");
  const recoveryMigration = read("prisma/migrations/20260722_add_ingestion_job_recovery/migration.sql");
  const asyncMigration = read("prisma/migrations/20260723_add_unified_async_jobs/migration.sql");
  const lifecycleMigration = read("prisma/migrations/20260804_ingestion_lifecycle_state/migration.sql");

  assert.match(schema, /model UnifiedIngestionJob \{[\s\S]*status\s+String\s+@default\("QUEUED"\)/);
  assert.match(schema, /progress\s+Int\s+@default\(0\)/);
  assert.match(schema, /currentStep\s+String\?/);
  assert.match(schema, /errorMessage\s+String\?/);
  assert.match(schema, /heartbeatAt\s+DateTime\?/);
  assert.match(schema, /lastHeartbeatAt\s+DateTime\?/);
  assert.match(schema, /lockedAt\s+DateTime\?/);
  assert.match(schema, /lockedBy\s+String\?/);
  assert.match(schema, /retryCount\s+Int\s+@default\(0\)/);
  assert.match(schema, /attemptCount\s+Int\s+@default\(0\)/);
  assert.match(schema, /schemaStatus\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /canonicalStatus\s+String\s+@default\("NOT_STARTED"\)/);
  assert.match(schema, /canonicalVersion\s+String\?/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS "UnifiedIngestionJob"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "schemaStatus"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "canonicalStatus"/);
  assert.match(recoveryMigration, /ADD COLUMN IF NOT EXISTS "heartbeatAt"/);
  assert.match(recoveryMigration, /ADD COLUMN IF NOT EXISTS "retryCount"/);
  assert.match(lifecycleMigration, /ADD COLUMN IF NOT EXISTS "lastHeartbeatAt"/);
  assert.match(lifecycleMigration, /ADD COLUMN IF NOT EXISTS "attemptCount"/);
  assert.match(lifecycleMigration, /"UnifiedIngestionJob_status_lastHeartbeatAt_idx"/);

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
    assert.doesNotMatch(source, /status:\s*"PROCESSING"/);
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
  assert.match(runner, /enqueueMissingIngestionAsyncJobs/);
  assert.match(runner, /status:\s*\{\s*in:\s*\["QUEUED", "PROCESSING", "PAUSED"\]\s*\}/);
  assert.match(runner, /retryableIngestionJobWhere/);
  assert.match(runner, /Recovered legacy ingestion job/);
  assert.match(runner, /staleQueuedJobWhere/);
  assert.match(runner, /staleResumableJobWhere/);
  assert.match(runner, /export async function recoverAsyncJobs/);
  assert.doesNotMatch(runner, /\$transaction\(/);

  assert.match(statusRoute, /workspaceId:\s*session\.workspace\.id/);
  assert.doesNotMatch(statusRoute, /processJob/);
  assert.match(statusRoute, /recovery/);
  assert.match(retryRoute, /retryableAsyncJobWhere/);
  assert.match(retryRoute, /status:\s*"QUEUED"/);
  assert.match(retryRoute, /processJob\(jobId\)/);
  assert.match(recoveryRoute, /recoverAsyncJobs/);
  assert.match(recoveryRoute, /RECOVERY_QUEUED/);
});

test("data sources listing reports stale ingestion state without blocking on recovery", () => {
  const dataSourcesRoute = read("app/api/data-sources/route.ts");

  assert.match(dataSourcesRoute, /import \{ NextResponse \} from "next\/server"/);
  assert.match(dataSourcesRoute, /recoverStaleIngestionJobs/);
  assert.match(dataSourcesRoute, /recoverAsyncJobs/);
  assert.match(dataSourcesRoute, /function isActiveIngestionStatus/);
  assert.match(dataSourcesRoute, /"QUEUED"/);
  assert.match(dataSourcesRoute, /"RUNNING"/);
  assert.match(dataSourcesRoute, /"TIMEOUT"/);
  assert.match(dataSourcesRoute, /ingestionJob:/);
  assert.match(dataSourcesRoute, /async function recoverStaleDataSourceJobs\(workspaceId: string\)/);
  assert.match(dataSourcesRoute, /recoverStaleIngestionJobs\(\{\s*workspaceId,\s*limit:\s*5,\s*processRetryableJobs:\s*false\s*\}\)/);
  assert.match(dataSourcesRoute, /recoverAsyncJobs\(\{\s*workspaceId,\s*limit:\s*5\s*\}\)/);
  assert.match(dataSourcesRoute, /requestUrl\.searchParams\.get\("recoverStaleJobs"\) !== "0"/);
  assert.doesNotMatch(dataSourcesRoute, /after\(\(\) => \{\s*void recoverStaleDataSourceJobs\(session\.workspace\.id\)/);
  assert.match(dataSourcesRoute, /job\.payload->>'dataSourceId'/);
  assert.match(dataSourcesRoute, /prisma\.unifiedIngestionJob\.findMany/);
  assert.match(dataSourcesRoute, /latestIngestionJobBySourceId/);
  assert.match(dataSourcesRoute, /latestIngestionJob:\s*latestIngestionJobBySourceId\.get\(source\.id\) \?\? null/);
  assert.match(dataSourcesRoute, /ingestionStatus === "QUEUED"[\s\S]*syncStatus = "QUEUED"/);
  assert.match(dataSourcesRoute, /if \(isActiveIngestionStatus\(ingestionStatus\)\)[\s\S]*syncStatus = "RUNNING"/);
  assert.match(dataSourcesRoute, /ingestionStatus === "TIMEOUT"[\s\S]*syncStatus = "TIMEOUT"/);
  assert.match(dataSourcesRoute, /syncStatus = "FAILED_SYNC"[\s\S]*Data source sync did not finish/);

  const dashboard = read("components/dashboard.tsx");
  assert.match(dashboard, /QUEUED:\s*"Waiting"/);
  assert.match(dashboard, /RUNNING:\s*"Syncing"/);
  assert.match(dashboard, /TIMEOUT:\s*"Needs retry"/);
  assert.match(dashboard, /FAILED:\s*"Failed"/);
});

test("worker owns canonicalization and commits schema state without long interactive transactions", () => {
  const worker = read("lib/ingestion/unified-ingestion-worker.ts");
  const statusRoute = read("app/api/ingestion/jobs/[jobId]/route.ts");
  const retryRoute = read("app/api/ingestion/jobs/[jobId]/retry/route.ts");
  const recoveryRoute = read("app/api/ingestion/jobs/recover/route.ts");

  assert.match(worker, /export async function processIngestionJob/);
  assert.match(worker, /STALE_INGESTION_JOB_MS/);
  assert.match(worker, /QUEUED_INGESTION_JOB_MS/);
  assert.match(worker, /const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 1_000/);
  assert.match(worker, /const DEFAULT_STALE_INGESTION_JOB_MS = 2 \* 60 \* 1000/);
  assert.match(worker, /ACTIVE_INGESTION_JOB_STATUSES\s*=\s*\["RUNNING"\]/);
  assert.match(worker, /LEGACY_ACTIVE_INGESTION_JOB_STATUSES\s*=\s*\["PROCESSING", "SCHEMA_READY", "CANONICALIZING"\]/);
  assert.match(worker, /MAX_INGESTION_ATTEMPTS\s*=\s*3/);
  assert.match(worker, /staleActiveJobWhere/);
  assert.match(worker, /staleQueuedJobWhere/);
  assert.match(worker, /lastHeartbeatAt/);
  assert.match(worker, /status:\s*"TIMEOUT"/);
  assert.match(worker, /markIngestionJobExhausted/);
  assert.match(worker, /Maximum retry attempts reached/);
  assert.match(worker, /retryCount:\s*\{\s*increment:/);
  assert.match(worker, /attemptCount:\s*\{\s*increment:\s*1/);
  assert.match(worker, /startHeartbeat/);
  assert.match(worker, /currentStep:\s*"Building canonical model"/);
  assert.match(worker, /new InMemorySemanticMemoryStore\(\)/);
  assert.match(worker, /persistInferredMappings:\s*false/);
  assert.match(worker, /semanticMemoryMode:\s*"ephemeral"/);
  assert.doesNotMatch(worker, /new PrismaSemanticMemoryStore\(client/);
  assert.match(worker, /writeCanonicalDatasetArtifacts\(/);
  assert.match(worker, /export function inferBusinessSource/);
  assert.match(worker, /sourceProvider:\s*businessSource/);
  assert.match(worker, /sourceInference,\s*\n\s*sourceInferenceVersion:/);
  assert.match(worker, /productContextValidation/);
  assert.match(worker, /replaceProductContextIndex/);
  assert.match(worker, /transportSource:\s*source/);
  assert.doesNotMatch(worker, /generateEcommerceDecisionSnapshots\(client/);
  assert.doesNotMatch(worker, /generateWorkspaceMetricsFromConnectedSources/);
  assert.match(worker, /canonicalVersion:\s*ECOMMERCE_CANONICAL_SCHEMA_VERSION/);
  assert.match(worker, /schemaJson,/);
  assert.doesNotMatch(worker, /\$transaction\(/);
  assert.match(worker, /status:\s*"FAILED"/);

  assert.match(statusRoute, /export async function GET/);
  assert.match(statusRoute, /heartbeatAt/);
  assert.match(statusRoute, /lastHeartbeatAt/);
  assert.match(statusRoute, /retryCount/);
  assert.match(statusRoute, /attemptCount/);
  assert.match(statusRoute, /progress/);
  assert.match(statusRoute, /currentStep/);
  assert.match(retryRoute, /export async function POST/);
  assert.match(retryRoute, /retryableIngestionJobWhere/);
  assert.match(retryRoute, /status:\s*"QUEUED"/);
  assert.match(retryRoute, /processIngestionJob\(jobId\)/);
  assert.match(recoveryRoute, /recoverStaleIngestionJobs/);
  assert.match(recoveryRoute, /RECOVERY_QUEUED/);
});

test("upload ingestion skips persistent semantic learning for serverless workers", () => {
  const engine = read("lib/ingestion/unified-ingestion-engine.ts");
  const runtime = read("lib/semantic/runtime.ts");

  assert.match(engine, /persistInferredMappings\?: boolean/);
  assert.match(engine, /persistInferredMappings:\s*input\.persistInferredMappings/);
  assert.match(runtime, /persistInferredMappings\?: boolean/);
  assert.match(runtime, /const persistInferredMappings = input\.persistInferredMappings !== false/);
  assert.match(runtime, /persistInferredMappings\s*\n\s*\}\)/);
  assert.match(runtime, /if \(input\.persistInferredMappings === false\)/);
  assert.match(runtime, /fast-ingestion-no-persistent-memory/);
  assert.match(runtime, /runtime_updated:\s*false/);
});

test("local upload storage uses tmpdir on Vercel instead of the read-only app directory", () => {
  const storage = read("lib/local-upload-storage.ts");

  assert.match(storage, /import os from "node:os"/);
  assert.match(storage, /const uploadRoot = process\.env\.VERCEL \? os\.tmpdir\(\) : process\.cwd\(\)/);
  assert.doesNotMatch(storage, /path\.join\(\s*process\.cwd\(\),\s*"\.data-source-uploads"/);
});

test("upload and rescan routes use a serverless-safe semantic sample size", () => {
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const completeRoute = read("app/api/data-sources/upload/complete/route.ts");
  const rescanRoute = read("app/api/data-sources/[id]/rescan/route.ts");

  for (const source of [uploadRoute, completeRoute, rescanRoute]) {
    assert.match(source, /const MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 1_000/);
    assert.doesNotMatch(source, /MAX_UNIFIED_INGESTION_SAMPLE_ROWS = 5_000/);
  }
});

test("uploaded Excel files infer business platform instead of using transport source", () => {
  const { inferBusinessSource, inferBusinessSourceDiagnostic } = jiti("./lib/ingestion/unified-ingestion-worker.ts");

  assert.equal(inferBusinessSource({ source: "excel", provider: "Excel", fileName: "shopify_enriched.xlsx" }), "shopify");
  assert.equal(inferBusinessSource({ source: "excel", provider: "Excel", fileName: "amazon_enriched.xlsx" }), "amazon");
  assert.equal(inferBusinessSource({ source: "excel", provider: "Excel", fileName: "meta_ads_enriched.xlsx" }), "meta_ads");
  assert.equal(inferBusinessSource({ source: "excel", provider: "Excel", fileName: "inventory_enriched.xlsx" }), "inventory");
  assert.equal(inferBusinessSource({ source: "excel", provider: "Excel", businessSource: "excel", fileName: "shopify_enriched.xlsx" }), "shopify");
  assert.equal(inferBusinessSource({
    source: "excel",
    provider: "Excel",
    fileName: "shopify_enriched.xlsx",
    observedFields: ["amazon_order_id", "asin", "seller_sku", "item_price", "item_cost"]
  }), "amazon");
  assert.equal(inferBusinessSource({
    source: "excel",
    provider: "Excel",
    businessSource: "shopify",
    fileName: "shopify_enriched.xlsx",
    observedFields: ["amazon_order_id", "asin", "seller_sku"]
  }), "shopify");

  const amazonHeaders = inferBusinessSourceDiagnostic({
    source: "excel",
    provider: "Excel",
    fileName: "shopify_enriched.xlsx",
    observedFields: ["amazon_order_id", "asin", "seller_sku", "item_price", "fulfillment_channel"]
  });
  assert.equal(amazonHeaders.inferredSource, "amazon");
  assert.ok(amazonHeaders.confidence > 0.7);
  assert.ok(amazonHeaders.matchedSignals.some((signal) => signal === "amazon:asin"));
  assert.ok(amazonHeaders.conflictingSignals.includes("weak:shopify"));
  assert.ok(amazonHeaders.warnings.some((warning) => /conflicted/i.test(warning)));
  assert.match(amazonHeaders.inferenceVersion, /^source_inference\/v/);

  const shopifyHeaders = inferBusinessSourceDiagnostic({
    source: "excel",
    provider: "Excel",
    fileName: "amazon_export.xlsx",
    observedFields: ["shopify_order_id", "variant_id", "lineitem_name", "compare_at_price", "fulfillment_status"]
  });
  assert.equal(shopifyHeaders.inferredSource, "shopify");
  assert.ok(shopifyHeaders.conflictingSignals.includes("weak:amazon"));

  const genericHeaders = inferBusinessSourceDiagnostic({
    source: "excel",
    provider: "Excel",
    fileName: "orders.xlsx",
    observedFields: ["order_id", "sku", "product_name", "quantity", "unit_price", "order_date"]
  });
  assert.equal(genericHeaders.inferredSource, "ecommerce");
  assert.equal(genericHeaders.matchedSignals[0], "generic:ecommerce_fields");

  const mixedHeaders = inferBusinessSourceDiagnostic({
    source: "excel",
    provider: "Excel",
    fileName: "upload.xlsx",
    observedFields: ["asin", "seller_sku", "item_price", "variant_id", "lineitem_name"]
  });
  assert.equal(mixedHeaders.inferredSource, "amazon");
  assert.ok(mixedHeaders.conflictingSignals.some((signal) => signal.startsWith("shopify:")));
});

test("semantic field analyzer samples across multi-sheet flattened Excel rows", () => {
  const { analyzeRawFields } = jiti("./lib/semantic/engine/field-analyzer.ts");
  const rows = [
    ...Array.from({ length: 600 }, (_, index) => ({
      amazon_order_id: `order-${index}`,
      sku: `SKU-${index}`,
      item_price: 10
    })),
    ...Array.from({ length: 600 }, (_, index) => ({
      order_id: `order-${index}`,
      sku: `SKU-${index}`,
      product_name: `Product ${index}`,
      asin: `B000000${index}`
    })),
    ...Array.from({ length: 100 }, (_, index) => ({
      product_id: `product-${index}`,
      sku: `SKU-${index}`,
      product_name: `Catalog Product ${index}`,
      product_type: "Bags",
      tags: "travel, storage",
      handle: `catalog-product-${index}`
    }))
  ];

  const result = analyzeRawFields(rows);
  const fieldNames = result.fields.map((field) => field.field);
  assert.ok(fieldNames.includes("amazon_order_id"));
  assert.ok(fieldNames.includes("product_name"));
  assert.ok(fieldNames.includes("product_type"));
  assert.ok(fieldNames.includes("handle"));
  assert.ok(!fieldNames.includes("__sheetName"));
});

test("worker canonical sampling keeps rows from later Excel sheets", () => {
  const { representativeIngestionRows } = jiti("./lib/ingestion/unified-ingestion-worker.ts");
  const rows = [
    ...Array.from({ length: 600 }, (_, index) => ({ __sheetName: "source_orders", sku: `SKU-${index}`, item_price: 10 })),
    ...Array.from({ length: 600 }, (_, index) => ({ __sheetName: "ecommerce_order_items", sku: `SKU-${index}`, product_name: `Line Product ${index}` })),
    ...Array.from({ length: 100 }, (_, index) => ({ __sheetName: "ecommerce_products", sku: `SKU-${index}`, product_name: `Catalog Product ${index}`, tags: "catalog" }))
  ];

  const sampledRows = representativeIngestionRows(rows, 1_000);
  assert.equal(sampledRows.length, 1_000);
  assert.ok(sampledRows.some((row) => row.__sheetName === "source_orders"));
  assert.ok(sampledRows.some((row) => row.__sheetName === "ecommerce_order_items"));
  assert.ok(sampledRows.some((row) => row.__sheetName === "ecommerce_products"));
});

test("reprocess endpoint queues idempotent ingestion from preserved raw artifacts", () => {
  const reprocessRoute = read("app/api/data-sources/[id]/reprocess/route.ts");

  assert.match(reprocessRoute, /requireWorkspaceRole\(\[WorkspaceRole\.OWNER,\s*WorkspaceRole\.ADMIN\]/);
  assert.match(reprocessRoute, /id:\s*dataSourceId/);
  assert.match(reprocessRoute, /workspaceId:\s*session\.workspace\.id/);
  assert.match(reprocessRoute, /RAW_ARTIFACT_UNAVAILABLE/);
  assert.match(reprocessRoute, /rawUploadLocatorFromIngestionHistory/, "Reprocess should recover preserved raw uploads from prior ingestion job metadata.");
  assert.match(reprocessRoute, /!objectKey\.startsWith\(\"\/tmp\/\"\)/, "Expired local tmp upload paths must not be treated as cloud artifact keys.");
  assert.match(read("lib/ingestion/unified-ingestion-worker.ts"), /representativeIngestionRows\(uploadRows, MAX_UNIFIED_INGESTION_SAMPLE_ROWS\)/);
  assert.match(read("lib/ingestion/unified-ingestion-worker.ts"), /payload:\s*uploadRows/);
  assert.doesNotMatch(read("lib/ingestion/unified-ingestion-worker.ts"), /payload:\s*sampledRows/);
  assert.match(reprocessRoute, /ACTIVE_REPROCESS_STATUSES\s*=\s*\["QUEUED", "PROCESSING", "PAUSED"\]/);
  assert.match(reprocessRoute, /status:\s*\{\s*in:\s*\[\.\.\.ACTIVE_REPROCESS_STATUSES\]\s*\}/);
  assert.match(reprocessRoute, /idempotencyKey/);
  assert.match(reprocessRoute, /schemaSnapshot\.create/);
  assert.match(reprocessRoute, /unifiedIngestionJob\.create/);
  assert.match(reprocessRoute, /createAsyncJob\(prisma/);
  assert.match(reprocessRoute, /after\(\(\) => \{\s*void processJob\(asyncJob\.id\)/);
  assert.match(reprocessRoute, /statusUrl:\s*`\/api\/jobs\/\$\{asyncJob\.id\}`/);
  assert.match(reprocessRoute, /clearWorkspaceReportCaches/);
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
  assert.match(generator, /PROFIT_INPUT_ROW_LIMIT/);
  assert.match(generator, /compactDecisionReport/);
  assert.match(generator, /compactPortfolioOptimization/);
  assert.match(generator, /profitInputModel\.rows\.slice\(0, PROFIT_INPUT_ROW_LIMIT\)/);
  assert.doesNotMatch(generator, /compactSkuDecisions = .*\.slice\(0, PROFIT_INPUT_ROW_LIMIT\)/);
  assert.doesNotMatch(generator, /OPTIMIZATION_INPUTS_INCOMPLETE/);
  assert.doesNotMatch(generator, /const exposedReport = needsProfitInputs \? null : report/);
});
