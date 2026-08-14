import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("manual profit optimization button creates and polls an optimization job", () => {
  const dashboard = read("components/dashboard.tsx");
  const startFunctionMatch = dashboard.match(/const startProfitOptimization = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[analysisDecisionReportPayload\?\.optimizationReadiness, hasStartedProfitOptimization, isZh, loadAnalysisDecisionReport\]\);/);

  assert.ok(startFunctionMatch, "startProfitOptimization should be an explicit callback");
  const startFunction = startFunctionMatch[0];

  assert.match(startFunction, /"\/api\/dashboard\/ecommerce\/optimize"/);
  assert.match(startFunction, /method:\s*"POST"/);
  assert.match(startFunction, /waitForProfitOptimizationJob\(payload\.jobId/);
  assert.match(startFunction, /await loadAnalysisDecisionReport\("full", \{ showLoading: false \}\)/);
  assert.match(startFunction, /optimizationDecisionReportRunId\(latestReport\) !== completedJob\.id/);
  assert.doesNotMatch(startFunction, /setHasStartedProfitOptimization\(true\);\s*await loadAnalysisDecisionReport\("full"\)/);
});

test("frontend polls the shared async job status endpoint until completion", () => {
  const dashboard = read("components/dashboard.tsx");
  const route = read("app/api/jobs/[jobId]/route.ts");

  assert.match(dashboard, /async function waitForProfitOptimizationJob/);
  assert.match(dashboard, /`\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}`/);
  assert.match(dashboard, /"COMPLETED"/);
  assert.match(dashboard, /"FAILED"/);
  assert.match(dashboard, /"CANCELLED"/);
  assert.match(dashboard, /Optimization completed/);
  assert.match(route, /prisma\.asyncJob\.findFirst/);
  assert.match(route, /resultReference:\s*true/);
  assert.match(route, /return NextResponse\.json\(\{\s*ok:\s*true,\s*job\s*\}\)/);
  assert.match(route, /export const maxDuration = 60/);
  assert.doesNotMatch(route, /await processJob\(job\.id\)/);
});

test("manual optimization endpoint uses the async job runner and prevents duplicate jobs", () => {
  const route = read("app/api/dashboard/ecommerce/optimize/route.ts");
  const runner = read("lib/jobs/async-job-runner.ts");

  assert.match(route, /canonicalArtifactAvailability\(prisma/);
  assert.match(route, /refreshSkippedReason:\s*"canonical_artifact_unavailable"/);
  assert.match(route, /status:\s*409/);
  assert.match(route, /enqueueSkuOptimizationJob\(prisma/);
  assert.match(route, /reason:\s*"manual_optimization_refresh"/);
  assert.match(route, /decisionMode:\s*"full"/);
  assert.match(route, /export const maxDuration = 60/);
  assert.match(route, /after\(\(\) => \{\s*void processJob\(job\.id\)/);
  assert.doesNotMatch(route, /generateEcommerceDecisionSnapshots\(/);

  assert.match(runner, /export async function enqueueSkuOptimizationJob/);
  assert.match(runner, /type:\s*"SKU_OPTIMIZATION"/);
  assert.match(runner, /in:\s*\["QUEUED", "PROCESSING", "PAUSED"\]/);
  assert.match(runner, /if \(existing\.status === "QUEUED"\) \{\s*if \(existing\.updatedAt >= queuedBeforeDate\(now\)\) return existing/);
  assert.match(runner, /Failed - stale queued optimization job/);
  assert.match(runner, /if \(!isStaleSkuOptimizationJob\(existing, now\)\) return existing/);
});

test("optimization jobs use short heartbeat stale recovery", () => {
  const runner = read("lib/jobs/async-job-runner.ts");

  assert.match(runner, /const DEFAULT_STALE_ASYNC_JOB_MS = 2 \* 60 \* 1000/);
  assert.match(runner, /const DEFAULT_SKU_OPTIMIZATION_STALE_JOB_MS = 2 \* 60 \* 1000/);
  assert.match(runner, /SKU_OPTIMIZATION_JOB_STALE_MS/);
  assert.match(runner, /isStaleSkuOptimizationJob/);
  assert.match(runner, /Superseded because SKU optimization heartbeat was stale/);
  assert.match(runner, /retryCount:\s*existing\.maxRetries/);
  assert.match(runner, /if \(item\.type === "SKU_OPTIMIZATION" && item\.status === "FAILED"\) return false/);
});

test("decision report route refreshes optimization caches only when canonical artifacts are readable", () => {
  const route = read("app/api/dashboard/ecommerce/decision-report/route.ts");
  const artifactAvailability = read("lib/dashboard/canonical-artifact-availability.ts");
  const cache = read("lib/dashboard/optimization-report-cache.ts");

  assert.match(route, /recoverAsyncJobs/);
  assert.match(route, /cacheNeedsOptimizationRefresh/);
  assert.match(route, /hasOptimizationRecommendationRows/);
  assert.match(route, /withDecisionReportContract/);
  assert.match(route, /metrics:\s*\{\s*source:\s*"canonical_live"/);
  assert.match(route, /optimization:\s*\{\s*source:\s*optimizationSource/);
  assert.match(route, /refresh:\s*\{\s*status:\s*input\.refreshStatus \?\? "IDLE"/);
  assert.match(route, /console\.info\("\[decision-report\] response_state"/);
  assert.match(route, /hasReadyCanonicalSources/);
  assert.match(route, /canonicalArtifactAvailability/);
  assert.match(route, /optimizationRefreshAvailability/);
  assert.match(route, /refreshSkippedReason:\s*"canonical_artifact_unavailable"/);
  assert.match(route, /latestOptimizationJob/);
  assert.match(route, /non_ready_decision_report_cache/);
  assert.match(route, /decision_snapshot_missing_with_ready_sources/);
  assert.match(route, /state:\s*"processing"/);
  assert.match(route, /decision_report:\s*null/);
  assert.match(route, /Optimization data is ready and a decision analysis refresh is running/);
  assert.match(route, /SKU_OPTIMIZATION_STALE_JOB_MS/);
  assert.match(route, /const queued = jobs\.find\(\(job\) => job\.status === "QUEUED"\)/);
  assert.match(route, /function processQueuedOptimizationJob/);
  assert.match(route, /if \(job\.status !== "QUEUED"\) return/);
  assert.match(route, /await processQueuedOptimizationJob\(job\)/);
  assert.match(route, /freshOptimizationCacheResponse/);
  assert.match(route, /if \(!hasOptimizationRecommendationRows\(cachedPayload\)\) \{\s*const liveResponse = await liveDecisionReportResponse\(\{\s*workspaceId: session\.workspace\.id,\s*mode: decisionMode,\s*startedAt,\s*message: "Loaded current decision analysis because the cached optimization snapshot is stale\."/);
  assert.match(route, /optimizationStatus:\s*"STALE"/);
  assert.match(route, /fallbackReason:\s*`stale_decision_report_cache:\$\{freshness\.reason \?\? "unknown"\}`/);
  assert.match(route, /export const maxDuration = 60/);
  assert.match(route, /after\(\(\) => \{\s*void recoverAsyncJobs/);
  assert.match(route, /after\(\(\) => \{\s*void processJob\(job\.id\)/);
  assert.match(artifactAvailability, /readR2ObjectText\(checkedArtifactKey\)/);
  assert.match(artifactAvailability, /firstUnavailable \?\?=/);
  assert.match(artifactAvailability, /continue;/);
  assert.match(artifactAvailability, /LOCAL_ARTIFACT_NOT_FOUND/);
  assert.match(artifactAvailability, /R2_CONFIGURATION_MISSING/);
  assert.match(cache, /skipped unsafe overwrite of ready cache/);
  assert.match(cache, /shouldRejectSnapshotOverwrite/);
  assert.match(cache, /existingState:\s*existing\?\.state/);
  assert.match(cache, /newState:\s*split\.state/);
  assert.doesNotMatch(cache, /stale cache skipped/);
  assert.doesNotMatch(cache, /return null;\s*\n\s*}\s*\n\s*return record;/);
});

test("dashboard loader skips unreadable canonical snapshots before falling back to older snapshots", () => {
  const loader = read("lib/dashboard/ecommerce-sales-dashboard-loader.ts");

  assert.match(loader, /const snapshotsBySource = new Map/);
  assert.match(loader, /for \(const sourceSnapshots of snapshotsBySource\.values\(\)\)/);
  assert.match(loader, /artifactDatasets\.push\(await readCanonicalDatasetFromSnapshot\(schemaJson\)\)/);
  assert.match(loader, /readableArtifactError\(error\)/);
  assert.doesNotMatch(loader, /const latestBySource = new Map/);
});

test("optimization summary does not add simulated ad spend when no recommendations are pending", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const dashboard = read("components/dashboard.tsx");

  assert.match(renderer, /pendingDecisionRows\.length > 0 \? \(solverAdditionalAdSpend/);
  assert.match(renderer, /: 0\);/);
  assert.match(dashboard, /analysisDecisionReportPayload\?\.generated_at/);
  assert.match(dashboard, /analysisDecisionReportPayload\?\.snapshot\?\.updatedAt/);
  assert.match(dashboard, /analysisDecisionReportPayload\?\.snapshot\?\.createdAt/);
});

test("completed optimization jobs generate decision snapshots from internal data and refresh cache", () => {
  const runner = read("lib/jobs/async-job-runner.ts");
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(runner, /processSkuOptimizationAsyncJob/);
  assert.match(runner, /canonicalArtifactAvailability\(client/);
  assert.match(runner, /Canonical artifact unavailable:/);
  assert.match(runner, /generateEcommerceDecisionSnapshots\(client/);
  assert.match(runner, /dataSourceId:\s*null/);
  assert.match(generator, /loadEcommerceSalesDashboardData\(/);
  assert.match(generator, /upsertDecisionSnapshot\(prisma/);
  assert.match(generator, /upsertOptimizationReportCache\(prisma/);
});

test("new optimization snapshots include active decision context without excluding accepted SKUs", () => {
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(generator, /loadActiveDecisionContexts\(prisma/);
  assert.match(generator, /activeDecisionContexts/);
  assert.match(generator, /previous_decision_context/);
  assert.match(generator, /active_decision_context_included/);
  assert.doesNotMatch(generator, /filterRowsByAcceptedSkus/);
  assert.doesNotMatch(generator, /accepted_optimization_actions_excluded/);
  assert.match(generator, /total_opportunities: optimization\.optimization_summary\.total_opportunities \?\? compactSkuDecisions\.length/);
  assert.match(generator, /total_expected_profit_gain: totalProfitImpact/);
});

test("new decision snapshots include optimization run metadata", () => {
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");
  const identity = read("lib/optimization/recommendation-identity.ts");

  assert.match(generator, /optimization_run_id/);
  assert.match(generator, /recommendation_id/);
  assert.match(identity, /recommendationFingerprint/);
  assert.match(generator, /recommendationIdentityForDecision/);
  assert.match(generator, /started_at/);
  assert.match(generator, /completed_at/);
  assert.match(generator, /optimizer_version/);
  assert.match(generator, /policy_version/);
  assert.match(generator, /simulation_version/);
  assert.match(generator, /data_version/);
  assert.match(generator, /analyzed_sku_count/);
  assert.match(generator, /optimizationRun:\s*content\.optimizationRun/);
  assert.match(identity, /sku_id/);
  assert.match(identity, /action_type/);
  assert.match(identity, /action_parameters/);
  assert.match(identity, /policy_version/);
  assert.match(identity, /optimizer_version/);
  assert.match(identity, /simulation_version/);
  assert.match(identity, /metric_snapshot_version/);
  assert.doesNotMatch(identity, /optimization_run_id/);
});

test("frontend normalization uses simulation current inventory instead of restock copy fallback", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const taxonomy = read("lib/optimization/action-taxonomy.ts");

  assert.match(renderer, /payload\.simulation\?\.current_inventory/);
  assert.match(renderer, /recommendationSimulation\.current_inventory/);
  assert.doesNotMatch(renderer, /before_state\?\.inventory\s*\?\?\s*recommendation\?\.simulation\?\.required_inventory/);
  assert.doesNotMatch(taxonomy, /recommendedText\.includes\("stockout"\)/);
});

test("optimization queue selection opens the SKU decision panel by default", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const selectFunction = renderer.match(/const selectOptimizationQueueRow = \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);
  const defaultSelectionEffect = renderer.match(/const firstDecision = pendingDecisionRows\[0\];[\s\S]*?setExpandedSku\(firstDecision\.skuId\);/);

  assert.ok(selectFunction, "queue selection handler should exist");
  assert.match(selectFunction[0], /setSelectedDecisionRow\(row\)/);
  assert.match(selectFunction[0], /setIsSkuOperationsOpen\(false\)/);
  assert.ok(defaultSelectionEffect, "default selection effect should select the first pending decision");
  assert.match(defaultSelectionEffect[0], /setIsSkuOperationsOpen\(false\)/);
});

test("optimization tracker loads payload without running status refresh on page load", () => {
  const dashboard = read("components/dashboard.tsx");
  const refreshFunction = dashboard.match(/const refresh = useCallback\(async \(\) => \{[\s\S]*?const openDecisionDetail/);

  assert.ok(refreshFunction, "action tracker refresh function should exist");
  assert.doesNotMatch(refreshFunction[0], /\/api\/actions\/update-status/);
  assert.match(refreshFunction[0], /AbortController/);
  assert.match(refreshFunction[0], /finally/);
  assert.match(refreshFunction[0], /setIsLoading\(false\)/);
});

test("optimization tracker loading state is independent from connected source list loading", () => {
  const dashboard = read("components/dashboard.tsx");
  const trackerFunction = dashboard.match(/function ActionTrackerPage\([\s\S]*?\nfunction DecisionTextMetric/);

  assert.ok(trackerFunction, "action tracker component should exist");
  assert.doesNotMatch(trackerFunction[0], /isLoadingConnectedData/);
  assert.doesNotMatch(trackerFunction[0], /hasConnectedData/);
  assert.doesNotMatch(trackerFunction[0], /Connect data to track optimization decisions/);
  assert.match(trackerFunction[0], /const shouldShowDecisionTrackerLoadingState = isLoading \|\| shouldShowEmptyDecisionLoop/);
  assert.doesNotMatch(trackerFunction[0], /shouldShowDecisionTrackerLoadingState = .*isLoadingConnectedData/);
});

test("optimization tracker uses action tracking records as the source of truth", () => {
  const dashboard = read("components/dashboard.tsx");
  const policyActionsRoute = read("app/api/policy/actions/route.ts");
  const refreshFunction = dashboard.match(/const refresh = useCallback\(async \(\) => \{[\s\S]*?const openDecisionDetail/);

  assert.ok(refreshFunction, "action tracker refresh function should exist");
  assert.match(refreshFunction[0], /\/api\/policy\/actions/);
  assert.doesNotMatch(refreshFunction[0], /scope=current_optimization/);
  assert.match(refreshFunction[0], /setPayload\(data\)/);
  assert.doesNotMatch(refreshFunction[0], /\/api\/dashboard\/ecommerce\/decision-report\?mode=full/);
  assert.doesNotMatch(dashboard, /filterDecisionImpactPayloadToCurrentReport/);
  assert.doesNotMatch(dashboard, /function currentDecisionReportScope/);
  assert.doesNotMatch(dashboard, /function decisionImpactRowKey/);
  assert.match(dashboard, /No accepted optimization decisions yet/);
  assert.match(dashboard, /const hasAcceptedDecisionData = activeDecisionCount \+ completedDecisionCount > 0/);
  assert.match(dashboard, /No accepted optimization decisions yet/);
  assert.match(policyActionsRoute, /listActionTrackingRecords\(\{ workspaceId, decisionInstancePrefix \}\)/);
  assert.doesNotMatch(policyActionsRoute, /dataSourceConnection\.count/);
  assert.doesNotMatch(policyActionsRoute, /hasConnectedDataSource/);
});

test("action tracking list falls back to local JSON records when database reads fail", () => {
  const store = read("lib/optimization/action-tracking-store.ts");
  const listFunction = store.match(/export async function listActionTrackingRecords[\s\S]*?\n\}/);

  assert.ok(listFunction, "action tracking list function should exist");
  assert.match(listFunction[0], /return await withTimeout\(/);
  assert.match(listFunction[0], /listDbActionTrackingRecords\(filter\)/);
  assert.match(listFunction[0], /Falling back to local action tracking records/);
  assert.match(listFunction[0], /return listJsonActionTrackingRecords\(filter\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(listFunction[0], /if \(jsonRecords\.length\) return jsonRecords/);
  assert.match(store, /function listDbActionTrackingRecords/);
  assert.match(store, /function withTimeout/);
  assert.match(store, /function upsertJsonActionTrackingRecord/);
  assert.match(store, /function actionTrackingRecordKey/);
});

test("optimization accepted impact uses the action tracker source of truth", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const acceptedImpactEffect = renderer.match(/async function loadAcceptedImpactSummary\(\) \{[\s\S]*?\n    \}/);
  const acceptedProfitLine = renderer.match(/const displayedAcceptedProfitGain =[\s\S]*?;/);
  const acceptFunction = renderer.match(/const acceptDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?const response = await fetch\(\"\/api\/actions\/accept\"/);

  assert.ok(acceptedImpactEffect, "optimization page should load accepted impact summary");
  assert.ok(acceptedProfitLine, "accepted profit gain calculation should exist");
  assert.ok(acceptFunction, "accept function should exist");
  assert.match(acceptedImpactEffect[0], /\/api\/policy\/actions/);
  assert.doesNotMatch(acceptedImpactEffect[0], /decisionInstancePrefix/);
  assert.match(acceptedImpactEffect[0], /activeDecisions/);
  assert.match(acceptedProfitLine[0], /acceptedImpactSummary\?\.expectedProfitImpact/);
  assert.match(renderer, /const hasAcceptedOptimizationActions = \(acceptedImpactSummary\?\.activeCount \?\? acceptedDecisionRows\.length\) > 0/);
  assert.match(acceptFunction[0], /setAcceptedImpactSummary/);
  assert.match(renderer, /responsePayload\?\.ok !== true/);
});

test("optimization tracker reads active accepted actions across optimization runs", () => {
  const dashboard = read("components/dashboard.tsx");
  const policyActionsRoute = read("app/api/policy/actions/route.ts");
  const trackerFunction = dashboard.match(/function ActionTrackerPage\([\s\S]*?\nfunction DecisionTextMetric/);

  assert.ok(trackerFunction, "action tracker page should exist");
  assert.match(trackerFunction[0], /\/api\/policy\/actions/);
  assert.doesNotMatch(trackerFunction[0], /scope=current_optimization/);
  assert.match(policyActionsRoute, /url\.searchParams\.get\("scope"\) === "current_optimization"/);
  assert.match(policyActionsRoute, /currentOptimizationDecisionInstancePrefix/);
  assert.match(policyActionsRoute, /findOptimizationReportCache/);
});

test("optimization tracker does not fake measurement progress before elapsed observation days", () => {
  const dashboard = read("components/dashboard.tsx");
  const tracker = read("lib/policy/action-impact-tracker.ts");
  const progressFunction = dashboard.match(/function decisionTaskProgress\(task: DecisionImpactRow\) \{[\s\S]*?\n\}/);
  const observationDaysFunction = tracker.match(/function observationDaysFromRecord\(record: ActionTrackingRecord, observationWindow: number\) \{[\s\S]*?\n\}/);
  const decisionRowFunction = tracker.match(/function decisionRowFromRecord\(record: ActionTrackingRecord\): DecisionImpactRow \{[\s\S]*?\n\}/);
  const runningTasksBlock = dashboard.match(/const runningTasks = \[\.\.\.\(payload\?\.activeDecisions \?\? \[\]\)\][\s\S]*?;/);

  assert.ok(progressFunction, "decision task progress should exist");
  assert.ok(observationDaysFunction, "observation day calculation should exist");
  assert.ok(decisionRowFunction, "decision impact row mapping should exist");
  assert.ok(runningTasksBlock, "running tasks query should exist");
  assert.match(progressFunction[0], /Math\.max\(0, Math\.min\(totalDays, task\.observationDays \|\| 0\)\)/);
  assert.match(progressFunction[0], /Math\.max\(0, Math\.round\(\(currentDay \/ totalDays\) \* 100\)\)/);
  assert.doesNotMatch(progressFunction[0], /task\.observationDays \|\| 1/);
  assert.doesNotMatch(progressFunction[0], /Math\.max\(1, Math\.round/);
  assert.match(dashboard, /Waiting for measurement data/);
  assert.match(decisionRowFunction[0], /const isMeasuring = record\.status === "running" \|\| record\.status === "completed" \|\| record\.status === "learned"/);
  assert.match(decisionRowFunction[0], /measurementStatus: isEvaluated \? "COMPLETED" : isMeasuring \? "TRACKING" : "NOT_STARTED"/);
  assert.match(runningTasksBlock[0], /\[\.\.\.\(payload\?\.activeDecisions \?\? \[\]\)\]/);
  assert.doesNotMatch(runningTasksBlock[0], /\.filter\(/);
  assert.match(dashboard, /decisionTaskStatusLabel\(task, isZh\)/);
  assert.match(observationDaysFunction[0], /record\.status !== "running" && record\.status !== "completed" && record\.status !== "learned"/);
  assert.match(observationDaysFunction[0], /Math\.floor/);
  assert.match(observationDaysFunction[0], /Math\.max\(0, Math\.min\(observationWindow, elapsed\)\)/);
  assert.doesNotMatch(observationDaysFunction[0], /Math\.max\(1/);
});

test("optimization header separates optimization and live metric timestamps", () => {
  const dashboard = read("components/dashboard.tsx");
  const headerBlock = dashboard.match(/const reportHeaderAction = \([\s\S]*?\n  \);/);

  assert.ok(headerBlock, "report header action should exist");
  assert.match(dashboard, /const optimizationState = analysisDecisionReportPayload\?\.optimization/);
  assert.match(dashboard, /const refreshState = analysisDecisionReportPayload\?\.refresh/);
  assert.match(dashboard, /const metricsLastUpdatedAt = analysisDecisionReportPayload\?\.metrics\?\.generatedAt/);
  assert.match(dashboard, /optimizationRun\?\.completed_at/);
  assert.match(dashboard, /optimizationRun\?\.started_at/);
  assert.match(dashboard, /analysisDecisionReportPayload\?\.snapshot\?\.updatedAt/);
  assert.match(headerBlock[0], /Last optimized/);
  assert.match(headerBlock[0], /Data updated/);
});

test("optimization page loads latest decision report on initial render", () => {
  const dashboard = read("components/dashboard.tsx");

  assert.match(dashboard, /useState\(\(\) => hasConnectedDatabase\)/);
  assert.match(dashboard, /void loadAnalysisDecisionReport\("full"\)/);
  assert.match(dashboard, /payload\.optimization\?\.source === "optimization_snapshot"/);
  assert.match(dashboard, /\(payload\.optimization\?\.recommendationCount \?\? 0\) > 0/);
  assert.doesNotMatch(dashboard, /payload\.decision_report \|\| payload\.optimizationRun\?\.completed_at/);
  assert.match(dashboard, /setHasStartedProfitOptimization\(true\)/);
});

test("optimization report cache preserves optimization run metadata", () => {
  const cache = read("lib/dashboard/optimization-report-cache.ts");

  assert.match(cache, /optimizationRun:\s*content\.optimizationRun/);
  assert.match(cache, /const optimizationRun = asRecord\(reportShell\.optimizationRun\)/);
  assert.match(cache, /optimizationRun:\s*Object\.keys\(optimizationRun\)\.length \? optimizationRun : null/);
  assert.match(cache, /const queueRows = normalizeProfitImpactRows\(asArray\(cache\.queueRowsJson\)\)/);
  assert.match(cache, /skuDecisions:\s*queueRows/);
});

test("optimization accept and reject tolerate compact recommendations without simulation payload", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const acceptFunction = renderer.match(/const acceptDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);
  const rejectFunction = renderer.match(/const rejectDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);

  assert.ok(acceptFunction, "accept handler should exist");
  assert.ok(rejectFunction, "reject handler should exist");
  assert.doesNotMatch(acceptFunction[0], /recommendation\.simulation\.current_ads_spend/);
  assert.doesNotMatch(acceptFunction[0], /recommendation\.simulation\.predicted_revenue/);
  assert.doesNotMatch(acceptFunction[0], /recommendation\.simulation\.recommended_ads_spend/);
  assert.doesNotMatch(rejectFunction[0], /recommendation\.simulation\.current_ads_spend/);
  assert.match(renderer, /recommendation\.simulation\?\.current_ads_spend/);
  assert.match(renderer, /recommendation\.simulation\?\.predicted_revenue/);
  assert.match(renderer, /recommendation\.simulation\?\.recommended_ads_spend/);
  assert.match(renderer, /setActionStatuses\(\(current\) => \(\{ \.\.\.current, \[key\]: "pending" \}\)\)/);
});

test("optimization accept and reject update UI state optimistically and roll back on failure", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const acceptFunction = renderer.match(/const acceptDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);
  const rejectFunction = renderer.match(/const rejectDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);

  assert.ok(acceptFunction, "accept handler should exist");
  assert.ok(rejectFunction, "reject handler should exist");

  const acceptSource = acceptFunction[0];
  const rejectSource = rejectFunction[0];
  assert.ok(
    acceptSource.indexOf('[key]: "accepted"') <
      acceptSource.indexOf('await fetch("/api/actions/accept"'),
    "accept should immediately mark a decision accepted for fast UI feedback"
  );
  assert.match(acceptSource, /responsePayload\?\.ok !== true/);
  assert.ok(
    acceptSource.indexOf("responsePayload?.ok !== true") <
      acceptSource.indexOf("setTrackedOutcomeRows"),
    "accept should only add tracker rows after persistence succeeds"
  );
  assert.ok(
    acceptSource.lastIndexOf('[key]: "pending"') >
      acceptSource.indexOf("catch"),
    "accept should roll back to pending when persistence fails"
  );
  assert.match(acceptSource, /setActionPersistenceError/);
  assert.match(renderer, /Accept 没有写入数据库/);
  assert.ok(
    rejectSource.indexOf('[key]: "rejected"') <
      rejectSource.indexOf('await fetch("/api/actions/reject"'),
    "reject should immediately mark a decision rejected for fast UI feedback"
  );
  assert.ok(
    rejectSource.lastIndexOf('[key]: "pending"') >
      rejectSource.indexOf("catch"),
    "reject should roll back to pending when persistence fails"
  );
});

test("optimization accepted actions are persisted by decision instance", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const store = read("lib/optimization/action-tracking-store.ts");
  const acceptRoute = read("app/api/actions/accept/route.ts");
  const acceptFunction = renderer.match(/const acceptDecisionAction = async \(row: PortfolioDecisionRow\) => \{[\s\S]*?\n  \};/);
  const hydrationFunction = renderer.match(/async function loadPersistedDecisionStatuses\(\) \{[\s\S]*?\n    \}/);

  assert.ok(acceptFunction, "accept handler should exist");
  assert.ok(hydrationFunction, "status hydration should exist");
  assert.match(renderer, /function recommendationIdForDecision/);
  assert.match(renderer, /function optimizationReportKey/);
  assert.match(renderer, /function hasConcreteOptimizationReportKey/);
  assert.match(acceptFunction[0], /const optimizationRunId = optimizationReportRunId/);
  assert.match(acceptFunction[0], /const decisionId = decisionRowKey\(row\)/);
  assert.match(acceptFunction[0], /const recommendationId = recommendationIdForDecision\(row, report\)/);
  assert.match(acceptFunction[0], /const instanceKey = recommendationId/);
  assert.match(acceptFunction[0], /hasConcreteOptimizationReportKey\(optimizationRunId\)/);
  assert.match(acceptFunction[0], /\[optimization accept click\]/);
  assert.match(acceptFunction[0], /optimization_run_id: optimizationRunId/);
  assert.match(acceptFunction[0], /recommendation_id: recommendationId/);
  assert.match(acceptFunction[0], /sku_id: row\.skuId/);
  assert.match(acceptFunction[0], /decision_id: decisionId/);
  assert.match(acceptFunction[0], /decision_instance_key: instanceKey/);
  assert.match(renderer, /function shouldShowInOptimizationQueue/);
  assert.match(renderer, /const pendingDecisionRows = filteredDecisionRows\.filter\(\(row\) => shouldShowInOptimizationQueue\(row, actionStatuses\)\)/);
  assert.match(hydrationFunction[0], /persistedRecommendationId/);
  assert.match(hydrationFunction[0], /persistedRecommendationId === recommendationIdForDecision\(row, report\)/);
  assert.match(hydrationFunction[0], /legacyActionMatchesDecisionRecommendation\(action, row\)/);
  assert.match(renderer, /function legacyActionMatchesDecisionRecommendation/);
  assert.match(renderer, /persistedDecisionId !== currentDecisionId &&[\s\S]*?!persistedInstanceKey\.endsWith/);
  assert.match(renderer, /Math\.abs\(persistedAdDelta - currentAdDelta\) > 0\.01/);
  assert.doesNotMatch(renderer, /function persistedActionMatchesDecisionRow/);
  assert.doesNotMatch(hydrationFunction[0], /persistedActionMatchesDecisionRow/);
  assert.match(store, /const hasDecisionInstanceKey = typeof input\.action_payload\?\.decision_instance_key === "string"/);
  assert.match(store, /const recommendationId = typeof input\.action_payload\?\.recommendation_id === "string"/);
  assert.doesNotMatch(store, /const existing = hasDecisionInstanceKey\s*\?\s*null/);
  assert.match(store, /require_database\?: boolean/);
  assert.match(store, /export async function getDbActionTrackingRecordByDecisionInstanceKey/);
  assert.match(store, /export async function getDbActionTrackingRecordByRecommendationId/);
  assert.match(store, /function actionPayloadDecisionInstanceKey/);
  assert.match(store, /actionPayloadDecisionInstanceKey\(record\.action_payload\)/);
  assert.match(store, /export async function getActionTrackingRecordByDecisionInstanceKey/);
  assert.match(store, /path: \["decision_instance_key"\]/);
  assert.match(store, /path: \["recommendation_id"\]/);
  assert.match(store, /\[action persisted\]/);
  assert.match(store, /if \(input\.require_database\)/);
  assert.match(acceptRoute, /requestedDecisionInstanceKey/);
  assert.match(acceptRoute, /canonicalDecisionInstanceKey\(recommendationId\)/);
  assert.match(acceptRoute, /currentOptimizationRecommendationExists\(workspaceId, recommendationId\)/);
  assert.match(acceptRoute, /findOptimizationReportCache\(prisma/);
  assert.match(acceptRoute, /optimizationReportCachePayload\(cache\)/);
  assert.match(acceptRoute, /Accepted recommendation is not present in the current optimization snapshot/);
  assert.match(acceptRoute, /recommendation_id: recommendationId/);
  assert.match(acceptRoute, /Current optimization run, decision id, and recommendation id are required before accepting an action/);
  assert.match(acceptRoute, /getDbActionTrackingRecordByRecommendationId/);
  assert.match(acceptRoute, /getDbActionTrackingRecordByDecisionInstanceKey/);
  assert.match(acceptRoute, /require_database: true/);
  assert.match(acceptRoute, /Accepted action was not readable after persistence/);
  assert.match(acceptRoute, /persistedDecisionInstanceKey !== requestedDecisionInstanceKey/);
  assert.match(acceptRoute, /Accepted action was not persisted for the current optimization decision/);
  assert.match(acceptRoute, /\[accept request\]/);
  assert.match(acceptRoute, /\[action-accept:persisted\]/);
});

test("recommendation identity is stable across optimization runs", () => {
  const identity = read("lib/optimization/recommendation-identity.ts");
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(identity, /export function recommendationFingerprint/);
  assert.match(identity, /sku_id: input\.skuId/);
  assert.match(identity, /action_type: input\.actionType/);
  assert.match(identity, /action_parameters: normalizeIdentityValue/);
  assert.match(identity, /policy_version: input\.policyVersion/);
  assert.match(identity, /optimizer_version: input\.optimizerVersion/);
  assert.match(identity, /simulation_version: input\.simulationVersion/);
  assert.match(identity, /evidence: normalizeIdentityValue/);
  assert.match(identity, /metric_snapshot_version: input\.metricSnapshotVersion/);
  assert.doesNotMatch(identity, /optimization_run_id/);
  assert.match(generator, /optimization_run_id: recommendationIdentityContext\?\.optimizationRunId/);
  assert.match(generator, /recommendation_id: recommendationIdentityForDecision/);
  assert.match(generator, /sku_id: skuId/);
  assert.match(generator, /action_type: record\.action/);
  assert.match(generator, /expected_profit_impact:/);
});

test("queue filtering uses recommendation id and active statuses, not sku or run id", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const impactTracker = read("lib/policy/action-impact-tracker.ts");
  const queueFilter = renderer.match(/function shouldShowInOptimizationQueue\([\s\S]*?\n\}/);
  const hydrationFunction = renderer.match(/async function loadPersistedDecisionStatuses\(\) \{[\s\S]*?\n    \}/);

  assert.ok(queueFilter, "queue filter should exist");
  assert.ok(hydrationFunction, "status hydration should exist");
  assert.match(hydrationFunction[0], /persistedRecommendationId === recommendationIdForDecision\(row, report\)/);
  assert.match(hydrationFunction[0], /action\.status === "accepted" \|\| action\.status === "running"/);
  assert.doesNotMatch(hydrationFunction[0], /action\.status === "completed"/);
  assert.doesNotMatch(hydrationFunction[0], /optimization_run_id.*===/);
  assert.match(queueFilter[0], /status !== "accepted" && status !== "rejected"/);
  assert.match(impactTracker, /activeDecisions: rows\.filter\(\(row\) => row\.status === "accepted" \|\| row\.status === "running"\)/);
});

test("active strategies UI is backed by DecisionAction records", () => {
  const dashboard = read("components/dashboard.tsx");
  const policyActionsRoute = read("app/api/policy/actions/route.ts");

  assert.match(dashboard, /function ActionTrackerPage/);
  assert.match(dashboard, /fetch\("\/api\/policy\/actions"/);
  assert.match(dashboard, /Active Strategies/);
  assert.match(policyActionsRoute, /listActionTrackingRecords\(\{ workspaceId, decisionInstancePrefix \}\)/);
  assert.doesNotMatch(policyActionsRoute, /scope=current_optimization[\s\S]*fetch/);
});

test("optimization page passes optimization run metadata into renderer report", () => {
  const dashboard = read("components/dashboard.tsx");
  assert.match(dashboard, /const optimizationDecisionReport = useMemo/);
  assert.match(dashboard, /optimizationRun/);
  assert.match(dashboard, /report=\{optimizationDecisionReport\}/);
});

test("optimization portfolio controls stay visible and current portfolio uses portfolio totals", () => {
  const renderer = read("components/report-renderer-engine.tsx");
  const displaySnippet = renderer.match(/const displayedCurrentSkuCount = shouldBlankOptimizationSummary[\s\S]*?const displayedCurrentProfit/);
  const adSpendHelper = renderer.match(/function currentAdSpendFromOptimizationSummary\([\s\S]*?\n\}/);

  assert.ok(displaySnippet, "current portfolio display count should be defined");
  assert.match(displaySnippet[0], /shouldBlankOptimizationSummary \? 0 : currentSkuCount/);
  assert.doesNotMatch(displaySnippet[0], /pendingDecisionRows\.length/);
  assert.ok(adSpendHelper, "current ad spend should be derived separately from added ad budget");
  assert.match(adSpendHelper[0], /total_ads_budget/);
  assert.match(renderer, /displayedCurrentAdSpend/);
  assert.match(renderer, /Current Profit/);
  assert.match(renderer, /Ad Spend/);
  assert.match(renderer, /shouldShowOptimizationStarter/);
  assert.match(renderer, /<OptimizationDecisionRail/);
  assert.match(renderer, /<SelectedSkuOptimizationPanel/);
  assert.match(renderer, /setIsDecisionPanelOpen\(\(open\) => !open\)/);
  assert.match(renderer, /AI Decision Summary/);
  assert.match(renderer, /Daily SKU Profit Optimization/);
  assert.match(renderer, /min-h-0 flex-1 overflow-auto/);
  assert.doesNotMatch(renderer, /sticky top-24 z-20 flex w-full flex-wrap items-center gap-2 rounded-full/);
  assert.match(renderer, /sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b/);
  assert.match(renderer, /xl:sticky xl:top-24 xl:h-full xl:max-h-full/);
  assert.match(renderer, /sticky top-0 z-20 bg-emerald-50\/95 p-2 pb-1 backdrop-blur/);
  assert.match(renderer, /xl:overflow-hidden/);
  assert.match(renderer, /All channels/);
});

test("action APIs return auth errors as JSON responses", () => {
  const acceptRoute = read("app/api/actions/accept/route.ts");
  const rejectRoute = read("app/api/actions/reject/route.ts");
  const policyActionsRoute = read("app/api/policy/actions/route.ts");
  const updateStatusRoute = read("app/api/actions/update-status/route.ts");

  for (const route of [acceptRoute, rejectRoute, policyActionsRoute, updateStatusRoute]) {
    assert.match(route, /workspaceAuthErrorResponse/);
    assert.match(route, /const authResponse = workspaceAuthErrorResponse\(error\)/);
    assert.match(route, /if \(authResponse\) return authResponse/);
  }
});
