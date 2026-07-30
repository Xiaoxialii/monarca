import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("manual profit optimization button creates and polls an optimization job", () => {
  const dashboard = read("components/dashboard.tsx");
  const startFunctionMatch = dashboard.match(/const startProfitOptimization = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[isZh, loadAnalysisDecisionReport\]\);/);

  assert.ok(startFunctionMatch, "startProfitOptimization should be an explicit callback");
  const startFunction = startFunctionMatch[0];

  assert.match(startFunction, /"\/api\/dashboard\/ecommerce\/optimize"/);
  assert.match(startFunction, /method:\s*"POST"/);
  assert.match(startFunction, /waitForProfitOptimizationJob\(payload\.jobId/);
  assert.match(startFunction, /await loadAnalysisDecisionReport\("full"\)/);
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
  assert.match(route, /job\.type === "SKU_OPTIMIZATION" && job\.status === "QUEUED"/);
  assert.match(route, /processJob\(job\.id\)/);
});

test("manual optimization endpoint uses the async job runner and prevents duplicate jobs", () => {
  const route = read("app/api/dashboard/ecommerce/optimize/route.ts");
  const runner = read("lib/jobs/async-job-runner.ts");

  assert.match(route, /enqueueSkuOptimizationJob\(prisma/);
  assert.match(route, /reason:\s*"manual_optimization_refresh"/);
  assert.match(route, /decisionMode:\s*"full"/);
  assert.match(route, /after\(\(\) => \{\s*void processJob\(job\.id\)/);
  assert.doesNotMatch(route, /generateEcommerceDecisionSnapshots\(/);

  assert.match(runner, /export async function enqueueSkuOptimizationJob/);
  assert.match(runner, /type:\s*"SKU_OPTIMIZATION"/);
  assert.match(runner, /in:\s*\["QUEUED", "PROCESSING", "PAUSED"\]/);
  assert.match(runner, /if \(existing\.status === "QUEUED"\) return existing/);
  assert.match(runner, /if \(!isStaleSkuOptimizationJob\(existing, now\)\) return existing/);
});

test("completed optimization jobs generate decision snapshots from internal data and refresh cache", () => {
  const runner = read("lib/jobs/async-job-runner.ts");
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(runner, /processSkuOptimizationAsyncJob/);
  assert.match(runner, /generateEcommerceDecisionSnapshots\(client/);
  assert.match(runner, /dataSourceId:\s*null/);
  assert.match(generator, /loadEcommerceSalesDashboardData\(/);
  assert.match(generator, /upsertDecisionSnapshot\(prisma/);
  assert.match(generator, /upsertOptimizationReportCache\(prisma/);
});

test("new optimization snapshots exclude already accepted optimization actions", () => {
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(generator, /loadAcceptedOptimizationSkuIds\(prisma, input\.workspaceId\)/);
  assert.match(generator, /acceptedOptimizationSkuIds/);
  assert.match(generator, /decision_instance_key/);
  assert.match(generator, /filterRowsByAcceptedSkus/);
  assert.match(generator, /accepted_optimization_actions_excluded/);
  assert.match(generator, /total_opportunities: compactSkuDecisions\.length/);
  assert.match(generator, /total_expected_profit_gain: totalProfitImpact/);
});

test("new decision snapshots include optimization run metadata", () => {
  const generator = read("lib/dashboard/decision-snapshot-generator.ts");

  assert.match(generator, /optimization_run_id/);
  assert.match(generator, /started_at/);
  assert.match(generator, /completed_at/);
  assert.match(generator, /optimizer_version/);
  assert.match(generator, /policy_version/);
  assert.match(generator, /simulation_version/);
  assert.match(generator, /data_version/);
  assert.match(generator, /analyzed_sku_count/);
  assert.match(generator, /optimizationRun:\s*content\.optimizationRun/);
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
  assert.match(refreshFunction[0], /\/api\/policy\/actions\?scope=current_optimization/);
  assert.match(refreshFunction[0], /setPayload\(data\)/);
  assert.doesNotMatch(refreshFunction[0], /\/api\/dashboard\/ecommerce\/decision-report\?mode=full/);
  assert.doesNotMatch(dashboard, /filterDecisionImpactPayloadToCurrentReport/);
  assert.doesNotMatch(dashboard, /function currentDecisionReportScope/);
  assert.doesNotMatch(dashboard, /function decisionImpactRowKey/);
  assert.match(dashboard, /No accepted optimization decisions yet/);
  assert.match(dashboard, /const hasAcceptedDecisionData = activeDecisionCount \+ completedDecisionCount > 0/);
  assert.match(dashboard, /No accepted decisions from the current optimization report/);
  assert.match(policyActionsRoute, /listActionTrackingRecords\(\{ workspaceId, decisionInstancePrefix \}\)/);
  assert.doesNotMatch(policyActionsRoute, /dataSourceConnection\.count/);
  assert.doesNotMatch(policyActionsRoute, /hasConnectedDataSource/);
});

test("action tracking list falls back to local JSON records when database reads fail", () => {
  const store = read("lib/optimization/action-tracking-store.ts");
  const listFunction = store.match(/export async function listActionTrackingRecords[\s\S]*?\n\}/);

  assert.ok(listFunction, "action tracking list function should exist");
  assert.match(listFunction[0], /const jsonRecords = await listJsonActionTrackingRecords\(filter\)\.catch\(\(\) => \[\]\)/);
  assert.match(listFunction[0], /if \(jsonRecords\.length\) return jsonRecords/);
  assert.match(listFunction[0], /return withTimeout\(/);
  assert.doesNotMatch(listFunction[0], /catch \{\s*return \[\]/);
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
  assert.match(acceptedImpactEffect[0], /\/api\/policy\/actions\?decisionInstancePrefix=/);
  assert.match(acceptedImpactEffect[0], /optimizationReportInstanceKey/);
  assert.match(acceptedImpactEffect[0], /activeDecisions/);
  assert.match(acceptedProfitLine[0], /acceptedImpactSummary\?\.expectedProfitImpact/);
  assert.match(renderer, /const hasAcceptedOptimizationActions = \(acceptedImpactSummary\?\.activeCount \?\? acceptedDecisionRows\.length\) > 0/);
  assert.match(acceptFunction[0], /setAcceptedImpactSummary/);
  assert.match(renderer, /responsePayload\?\.ok !== true/);
});

test("optimization tracker reads accepted actions from the current optimization scope", () => {
  const dashboard = read("components/dashboard.tsx");
  const policyActionsRoute = read("app/api/policy/actions/route.ts");
  const trackerFunction = dashboard.match(/function ActionTrackerPage\([\s\S]*?\nfunction DecisionTextMetric/);

  assert.ok(trackerFunction, "action tracker page should exist");
  assert.match(trackerFunction[0], /\/api\/policy\/actions\?scope=current_optimization/);
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

test("optimization header uses optimization run completion time", () => {
  const dashboard = read("components/dashboard.tsx");
  const headerBlock = dashboard.match(/const reportHeaderAction = \([\s\S]*?\n  \);/);

  assert.ok(headerBlock, "report header action should exist");
  assert.match(headerBlock[0], /optimizationRun\?\.completed_at/);
  assert.match(headerBlock[0], /Optimized/);
  assert.match(headerBlock[0], /Not optimized/);
  assert.doesNotMatch(headerBlock[0], /Data updated/);
  assert.doesNotMatch(headerBlock[0], /generatedAt/);
});

test("optimization page loads latest decision report on initial render", () => {
  const dashboard = read("components/dashboard.tsx");

  assert.match(dashboard, /useState\(\(\) => hasConnectedDatabase\)/);
  assert.match(dashboard, /void loadAnalysisDecisionReport\("full"\)/);
  assert.match(dashboard, /payload\.decision_report \|\| payload\.optimizationRun\?\.completed_at/);
  assert.match(dashboard, /setHasStartedProfitOptimization\(true\)/);
});

test("optimization report cache preserves optimization run metadata", () => {
  const cache = read("lib/dashboard/optimization-report-cache.ts");

  assert.match(cache, /optimizationRun:\s*content\.optimizationRun/);
  assert.match(cache, /const optimizationRun = asRecord\(reportShell\.optimizationRun\)/);
  assert.match(cache, /optimizationRun:\s*Object\.keys\(optimizationRun\)\.length \? optimizationRun : null/);
});

test("optimization accept and reject tolerate compact recommendations without simulation payload", () => {
  const renderer = read("components/report-renderer-engine.tsx");

  assert.doesNotMatch(renderer, /recommendation\.simulation\.current_ads_spend/);
  assert.doesNotMatch(renderer, /recommendation\.simulation\.predicted_revenue/);
  assert.doesNotMatch(renderer, /recommendation\.simulation\.recommended_ads_spend/);
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
  assert.match(renderer, /function decisionInstanceKey/);
  assert.match(renderer, /function optimizationReportKey/);
  assert.match(renderer, /function hasConcreteOptimizationReportKey/);
  assert.match(acceptFunction[0], /const instanceKey = decisionInstanceKey\(row, optimizationReportInstanceKey\)/);
  assert.match(acceptFunction[0], /hasConcreteOptimizationReportKey\(optimizationReportInstanceKey\)/);
  assert.match(acceptFunction[0], /decision_instance_key: instanceKey/);
  assert.match(hydrationFunction[0], /persistedInstanceKey !== decisionInstanceKey\(matchedRow, optimizationReportInstanceKey\)/);
  assert.match(store, /const hasDecisionInstanceKey = typeof input\.action_payload\?\.decision_instance_key === "string"/);
  assert.match(store, /const existing = hasDecisionInstanceKey\s*\?\s*null/);
  assert.match(store, /function actionPayloadDecisionInstanceKey/);
  assert.match(store, /actionPayloadDecisionInstanceKey\(record\.action_payload\)/);
  assert.match(store, /export async function getActionTrackingRecordByDecisionInstanceKey/);
  assert.match(store, /path: \["decision_instance_key"\]/);
  assert.match(acceptRoute, /requestedDecisionInstanceKey/);
  assert.match(acceptRoute, /Current optimization decision key is required before accepting an action/);
  assert.match(acceptRoute, /getActionTrackingRecordByDecisionInstanceKey/);
  assert.match(acceptRoute, /Accepted action was not readable after persistence/);
  assert.match(acceptRoute, /persistedDecisionInstanceKey !== requestedDecisionInstanceKey/);
  assert.match(acceptRoute, /Accepted action was not persisted for the current optimization decision/);
  assert.match(acceptRoute, /\[action-accept:request\]/);
  assert.match(acceptRoute, /\[action-accept:persisted\]/);
});

test("optimization page passes optimization run metadata into renderer report", () => {
  const dashboard = read("components/dashboard.tsx");
  assert.match(dashboard, /const optimizationDecisionReport = useMemo/);
  assert.match(dashboard, /optimizationRun/);
  assert.match(dashboard, /report=\{optimizationDecisionReport\}/);
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
