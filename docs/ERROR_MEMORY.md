# Error Memory

This file is append-only. Never overwrite or delete old records. When a new bug pattern or repeated mistake is found, append a new entry with the same structure.

## Entry 001

### Date
2026-06-13

### Area
Metric semantic mistakes

### Symptom
- `SUM(Price)` was wrongly treated as revenue.
- `SalesChannel` or other dimension fields were rendered as numeric trends.
- Fallback semantic metrics were treated as verified metrics.

### Root cause
Metric generation and rendering trusted field names or fallback semantic output without checking business grain, metric lineage, validation status, and field type.

### Fix
Require registry-backed or validated metric definitions for formal reports. Keep dimension fields out of numeric trend charts. Treat fallback semantic metrics as provisional, not verified.

### Prevention rule
Before changing metrics, verify formula, required fields, table scope, metric lineage, validation status, business type, and whether the metric came from `business_metric_registry`.

### Files changed
- `lib/**`
- `app/api/**`
- `components/**`
- `tests/**`

## Entry 002

### Date
2026-06-13

### Area
Date anchor mistakes

### Symptom
- Daily report used the system date instead of the latest data date.
- Weekly report compared unequal periods.
- Demo report was incorrectly affected by today's date.
- Reports confused current system date with historical business data date, such as data ending on 2018-08-08 while the system date was 2026-06-13.

### Root cause
Report generation used runtime dates or requested windows without anchoring to the latest business date available in the full dataset.

### Fix
Resolve report windows from `latestDataDate`. Daily reports use `latestDataDate` only. Weekly reports use equal current and previous windows. Demo reports use fixed demo anchors.

### Prevention rule
Before changing report time logic, identify the business date field, compute `latestDataDate` from full data, and confirm current and comparison windows are equal unless explicitly partial.

### Files changed
- `lib/report-date-range.ts`
- `lib/report-composers.ts`
- `lib/report-data-audit.ts`
- `app/api/dashboard/reports/**`
- `tests/**`

## Entry 003

### Date
2026-06-13

### Area
Sample row mistakes

### Symptom
- Engine only read the first 500 rows and missed latest dates.
- Schema samples were used for full report calculation.
- Report displayed total source rows but current-period or daily analysis rows were zero.
- Formal reports attempted to use `sampleRows`, `previewRows`, `sampleData`, `headRows`, or `first500Rows`.

### Root cause
Field detection samples were reused as calculation input, or the full uploaded file/storage object was not read before metric execution.

### Fix
Block formal report generation when only sample rows are available. Require complete file reads, storage object reads, or database aggregation queries for verified metrics.

### Prevention rule
Before calculating reports from uploaded files, confirm full data is readable and use full-data row counts, latest-date rows, and metric rows separately.

### Files changed
- `lib/csv-upload-rows.ts`
- `lib/report-data-audit.ts`
- `lib/skills/full-data-analysis-guardrail.ts`
- `app/api/dashboard/reports/**`
- `tests/**`

## Entry 004

### Date
2026-06-13

### Area
Auth / workspace mistakes

### Symptom
- New user was assigned `VIEWER` instead of `OWNER`.
- User entered the wrong workspace.
- Workspace data was not isolated.
- Mobile sign-in showed `You're already signed in.` but did not enter dashboard.

### Root cause
Auth and workspace membership assumptions were split across Clerk identity, local user records, workspace membership records, and redirect handling.

### Fix
Ensure new workspace creators become owners, workspace-scoped data is always filtered by `workspaceId`, and already signed-in users redirect to `/dashboard`.

### Prevention rule
Before changing auth or workspace logic, verify role assignment, active workspace resolution, workspace-scoped queries, and signed-in redirect behavior.

### Files changed
- `components/sign-in-panel.tsx`
- `app/api/user/**`
- `app/api/workspace/**`
- `middleware.ts`
- `lib/**`

## Entry 005

### Date
2026-06-13

### Area
UI rendering mistakes

### Symptom
- Dimension fields were shown as zero-line charts.
- Report text was too long for cards or mobile layouts.
- AI insight wording was unclear or too technical.
- Internal terms such as `STORED_FILE_PATH`, `verifiedMetrics`, and `dailyRows` leaked into user-facing failure states.

### Root cause
The UI rendered raw analysis artifacts and internal audit fields instead of business-facing states, concise text, and appropriate empty/error views.

### Fix
Add explicit empty and audit-failed states. Keep chart inputs numeric. Convert internal audit details into business-facing guidance.

### Prevention rule
Before changing UI rendering, check mobile and desktop layout, text length, chart field types, empty states, audit-failed states, and localization.

### Files changed
- `components/dashboard.tsx`
- `components/homepage.tsx`
- `lib/report-composers.ts`
- `lib/insights/**`
- `tests/**`

## Entry 006

### Date
2026-06-13

### Area
Data-source connection and database introspection

### Symptom
- MySQL source option was missing.
- Read-only MySQL reports did not work reliably.
- Database introspection needed different SQL for MySQL and PostgreSQL.
- A data source could show `CONNECTED` while report generation still failed.

### Root cause
The connection UI and report query layer did not fully support MySQL/read-only database behavior, and connection status was treated as equivalent to report readiness.

### Fix
Add MySQL source option, use read-only-safe aggregate queries, and keep data-source connection separate from field recognition, metric generation, and report validation states.

### Prevention rule
Before changing data-source code, verify provider-specific introspection, read-only query compatibility, snapshot freshness, and report-readiness checks.

### Files changed
- `app/api/data-sources/**`
- `lib/database-introspection.ts`
- `components/dashboard.tsx`
- `tests/mysql-readonly-data-sources.test.mjs`

## Entry 007

### Date
2026-06-13

### Area
Uploaded file storage and production uploads

### Symptom
- Production upload failures were hard to diagnose.
- R2 upload configuration was inconsistent.
- Uploaded files could be saved but later unavailable to report generation.
- Billing/upload errors were not localized.

### Root cause
Storage configuration, object path persistence, diagnostics, and localized error handling were not aligned across local, R2, Supabase, and production environments.

### Fix
Switch uploads to Cloudflare R2, align upload configuration, improve production diagnostics, and localize upload errors.

### Prevention rule
Before changing upload code, verify upload, object persistence, later full-file reads, diagnostics, and localized errors in the same flow.

### Files changed
- `app/api/uploads/**`
- `app/api/data-sources/upload/**`
- `lib/r2-storage.ts`
- `lib/supabase-storage.ts`
- `components/**`

## Entry 008

### Date
2026-06-13

### Area
Chinese and English field recognition

### Symptom
- `业务日期` was not recognized as a business date field.
- `订单日期`, `交易日期`, `支付日期`, and other Chinese date fields were unsupported.
- Chinese field normalization produced empty strings and could misclassify fields such as `订单编号`.

### Root cause
Date field detection only handled English normalized field names and used ASCII-only normalization for Chinese labels.

### Fix
Add Chinese business date candidates and compact matching that does not compare empty normalized strings.

### Prevention rule
Before changing field detection, test both English and Chinese field names and make sure non-ASCII labels are not normalized into ambiguous empty keys.

### Files changed
- `lib/report-date-range.ts`
- `tests/report-date-range.test.mjs`

## Entry 009

### Date
2026-06-13

### Area
Report API and async generation

### Symptom
- `/api/dashboard/reports` and `/api/dashboard/reports/generate` could diverge.
- Report refresh and source persistence were unreliable.
- Async report generation could reuse stale date-range cache.
- Generation sometimes returned before a fresh report was produced.

### Root cause
Report read, refresh, generation, cache, and selected data-source state were split across related code paths without enough shared guarantees.

### Fix
Run report generation before responding when needed, persist source selection, and include date-range cache keys in async report generation.

### Prevention rule
Before changing report APIs, verify read and generate paths produce compatible payloads, refresh uses current source state, and cache keys include report mode and date range.

### Files changed
- `app/api/dashboard/reports/**`
- `app/api/reports/**`
- `lib/report-composers.ts`
- `tests/**`

## Entry 010

### Date
2026-06-13

### Area
Report composer and report mode naming

### Symptom
- `自定义报告` was actually a monthly operating report.
- Internal `custom_report` naming did not match the product label.
- Composer risked mixing metric calculation logic with report presentation.
- Audit failure could produce empty KPI cards instead of a clear paused state.

### Root cause
Product naming, internal report modes, and composer responsibilities were not clearly separated.

### Fix
Rename the UI label to `月经营报告`, keep composer as a structured presentation layer, and render audit-failed states explicitly.

### Prevention rule
Before changing composer code, keep metric calculation outside the composer, preserve report-mode compatibility, and map internal names to clear product labels.

### Files changed
- `components/dashboard.tsx`
- `lib/report-composers.ts`
- `tests/report-composers.test.mjs`

## Entry 011

### Date
2026-06-13

### Area
Daily, weekly, and monthly report completeness

### Symptom
- Daily KPI board was empty.
- Daily and weekly dimension comparisons were empty.
- Weekly report showed only Average Rating.
- Monthly operating report showed zero revenue or orders.
- Monthly trend existed but change-source decomposition was empty.

### Root cause
Executable metrics, date windows, dimension fields, and aggregation results were missing or insufficient after strict validation.

### Fix
Keep strict validation, but display clear insufficient-data states and ensure metrics/dimensions come from the registry and full-data calculation path.

### Prevention rule
Before changing report views, verify KPI availability, dimension availability, aggregation results, and partial-period messaging for daily, weekly, and monthly reports.

### Files changed
- `components/dashboard.tsx`
- `lib/report-composers.ts`
- `lib/report-data-audit.ts`
- `tests/report-composers.test.mjs`

## Entry 012

### Date
2026-06-13

### Area
Old industry template generator versus business metric registry

### Symptom
- Old industry templates could generate metrics that did not match actual fields.
- Registry metrics and template metrics could disagree.
- Fallback template logic could produce non-executable or inconsistent KPIs.

### Root cause
Industry templates were broad presets, while `business_metric_registry` is intended to define verified business metrics from actual source fields.

### Fix
Prioritize registry-generated metrics for formal reports. Treat old templates as fallback or suggestions only.

### Prevention rule
Before changing metric generation, confirm whether a metric is registry-backed, whether the fallback path is intentional, and whether all report modes share the same definitions.

### Files changed
- `lib/metrics/**`
- `lib/report-generation/**`
- `app/api/dashboard/reports/**`
- `tests/metric-registry-consistency.test.mjs`

## Entry 013

### Date
2026-06-13

### Area
Localization and report language consistency

### Symptom
- English mode could still render Chinese report text.
- Evidence object fields were not localized.
- Locale rendering needed guardrails.
- Chinese summaries needed clearer business wording.

### Root cause
Generated report content, structured evidence, UI labels, and fallback strings were localized in different places.

### Fix
Guard locale rendering and localize evidence fields, report summaries, upload errors, and UI labels consistently.

### Prevention rule
Before changing report or UI text, verify Chinese and English modes render consistently across labels, summaries, evidence, errors, and fallback states.

### Files changed
- `components/**`
- `lib/report-composers.ts`
- `lib/insights/**`
- `tests/**`

## Entry 014

### Date
2026-06-13

### Area
Charts, visualizations, and recommendations

### Symptom
- Chart category labels were clipped.
- Chart recommendations could be made when data was insufficient.
- Dimension fields could be plotted as numeric zero-line charts.

### Root cause
Chart rendering and recommendation logic did not always validate data type, label length, and evidence sufficiency.

### Fix
Prevent category label clipping, add chart recommendation guardrails, and only render numeric metrics in numeric charts.

### Prevention rule
Before changing charts, validate field type, chart type, label length, empty states, and recommendation confidence.

### Files changed
- `components/dashboard.tsx`
- `lib/insights/**`
- `tests/**`

## Entry 015

### Date
2026-06-13

### Area
Mobile dashboard and sign-in rendering

### Symptom
- Mobile sign-in form did not allow normal account/password login.
- Signed-in mobile users were stuck on the sign-in page.
- Dashboard top-left mobile button did not open navigation.
- Mobile menu accidentally included `数据源`.

### Root cause
Mobile auth and dashboard navigation reused incomplete desktop assumptions and did not handle signed-in state or scoped mobile navigation.

### Fix
Add mobile password sign-in support, redirect signed-in users to dashboard, add a mobile dashboard menu, and restrict it to `报表页` and `设置页`.

### Prevention rule
Before changing mobile UI, test signed-out, signed-in, narrow viewport, and route navigation states; do not blindly reuse desktop menus.

### Files changed
- `components/sign-in-panel.tsx`
- `components/dashboard.tsx`

## Entry 016

### Date
2026-06-13

### Area
Landing page, pricing, consulting, and commercial flow

### Symptom
- Homepage CTA was not explicit enough.
- Landing hero layout and density needed refinement.
- Pricing and demo report UI needed polish.
- Consulting request workflow was missing or lacked WeChat contact.
- Report entitlements needed product gating.

### Root cause
Commercial flow, consulting capture, pricing, and product messaging evolved separately from dashboard/report functionality.

### Fix
Add demo CTA, refine homepage/report sections, add consulting request workflow, support WeChat contact, and introduce report entitlements.

### Prevention rule
Before changing commercial UI, verify CTA clarity, mobile layout, localized copy, entitlement behavior, and consulting/contact capture.

### Files changed
- `components/homepage.tsx`
- `components/consulting-page.tsx`
- `components/payment-page.tsx`
- `app/api/consulting-requests/**`
- `app/api/billing/**`

## Entry 017

### Date
2026-06-13

### Area
Deployment and production verification

### Symptom
- Localhost 3000 did not open when the dev server used another port.
- GitHub commit was assumed to mean Vercel was live.
- Vercel preview showed homepage, hiding dashboard changes.
- Production readiness was misread without checking alias and source commit.

### Root cause
Local dev server ports, GitHub push, Vercel build, production aliasing, and route-specific validation were treated as one step.

### Fix
Check actual local port, run lint/build/tests, push to GitHub, wait for Vercel `READY`, verify alias to `www.monarcadata.com`, and test the route that changed.

### Prevention rule
Before saying a change is live, confirm build success, deployment readiness, production alias, source commit, and the specific route affected.

### Files changed
- `AGENTS.md`
- `docs/**`
- Vercel deployment configuration

## Entry 018

### Date
2026-06-13

### Area
Error memory workflow

### Symptom
- Full historical error memory could become too long to read before every small coding task.
- Error memory updates could become noisy if every change blindly appended a new record.
- High-signal recurring rules were mixed with long historical detail.

### Root cause
The repository had only one long error memory file and no short rule index. The old workflow required broad reading and updating even when the current task did not need the full history.

### Fix
Create a two-level memory workflow: `docs/ERROR_MEMORY_INDEX.md` for short high-impact rules that must be read before every coding task, and `docs/ERROR_MEMORY.md` for full historical records read only when relevant.

### Prevention rule
Always read the short index before coding. Read the full log only for bugs, metrics, reports, data sources, auth/workspace, UI rendering, or known recurring mistakes. Append to the full log only for reusable patterns, and update the index only for high-frequency or high-impact rules.

### Files changed
- `AGENTS.md`
- `docs/ERROR_MEMORY_INDEX.md`
- `docs/ERROR_MEMORY.md`

## Entry 019

### Date
2026-06-13

### Area
Browser direct upload and R2 CORS

### Symptom
- Uploading a CSV/XLS/XLSX from production showed raw `Failed to fetch`.
- The selected file appeared in the preview, but the upload did not complete.
- Browser-level failures hid whether the failing request was the app upload API, presign API, or direct R2 PUT.

### Root cause
Large file uploads use a presigned R2/S3 URL and browser `PUT`. If the R2 bucket does not allow the production origin by CORS, the browser blocks the request and surfaces only a generic network error. The UI also showed the raw browser error instead of an actionable upload/storage message.

### Fix
When preparing presigned uploads, attempt to ensure R2 bucket CORS allows the production and local origins. In the client, catch network-level failures, fall back to API upload for small files, and show a clear R2 CORS/storage configuration message for direct upload failures.

### Prevention rule
Before changing browser direct upload logic, verify the presign route, storage CORS, production origin, fallback path, and user-facing error copy. Never surface raw `Failed to fetch` for upload failures.

### Files changed
- `app/api/uploads/presign/route.ts`
- `components/dashboard.tsx`
- `lib/r2-storage.ts`
- `docs/ERROR_MEMORY_INDEX.md`
- `docs/ERROR_MEMORY.md`

## Entry 020

### Date
2026-06-13

### Area
Browser direct upload fallback scope

### Symptom
- Production upload still showed the R2 direct-upload failure message after CORS handling was added.
- The fallback path only retried app API upload for files under the direct API threshold, so larger CSV/XLS/XLSX files stayed blocked by R2 CORS.

### Root cause
The upload fallback was scoped to the small-file threshold instead of the project upload limit. R2 direct upload was treated as required for larger files, even though the app upload API can still be attempted as a reliability fallback.

### Fix
When presign, direct `PUT`, or direct upload status fails, retry the app upload API for any file within `FILE_UPLOAD_MAX_BYTES`.

### Prevention rule
Browser direct-to-storage upload should be an optimization, not the only path. For files within the project upload limit, keep an app API fallback unless a platform hard limit is confirmed and handled with a clear message.

### Files changed
- `components/dashboard.tsx`
- `docs/ERROR_MEMORY.md`

## Entry 021

### Date
2026-06-13

### Area
Serverless upload payload limit

### Symptom
- Upload fallback returned `Request Entity Too Large FUNCTION_PAYLOAD_TOO_LARGE`.
- The R2 direct upload failed first, then the app retried a large file through the Vercel Function upload API.

### Root cause
The fallback assumed files up to the app-level `FILE_UPLOAD_MAX_BYTES` could be sent through the application API. Vercel Functions have a stricter request payload limit, so large file fallback must not use serverless request bodies.

### Fix
Restrict app API upload fallback to the small direct API threshold. Larger files must use presigned R2 direct upload, with clear CORS/storage instructions when that direct path fails.

### Prevention rule
Do not route large file fallback through Vercel Functions. Keep serverless upload bodies below the platform payload limit and require direct object storage upload for larger files.

### Files changed
- `components/dashboard.tsx`
- `docs/ERROR_MEMORY_INDEX.md`
- `docs/ERROR_MEMORY.md`
