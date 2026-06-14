# Error Memory Index

Read this before every coding task. Keep it short. Use `docs/ERROR_MEMORY.md` only when the task matches a known mistake, bug, report, metric, data-source, auth/workspace, or UI rendering area.

## High-Signal Prevention Rules

1. **Metrics must be verified, not guessed.** Use `business_metric_registry` or validated lineage for formal reports; do not treat fallback semantic metrics as verified.
2. **Do not turn dimensions into measures.** Channel, category, market, region, customer segment, and similar fields are dimensions, not numeric trend values.
3. **Revenue needs business grain.** Never treat `SUM(price)` as revenue unless the field and row grain prove it represents revenue, paid amount, net sales, gross sales, or order amount.
4. **Reports use data dates, not system dates.** Daily reports anchor to `latestDataDate`; weekly comparisons use equal windows; demo reports use fixed demo anchors.
5. **Samples are never full-data calculations.** Do not calculate formal reports from `sampleRows`, `previewRows`, `sampleData`, `headRows`, or `first500Rows`.
6. **Uploaded files must be fully readable.** A saved path or object key is not enough; verified metrics require reading the full file or querying the database.
7. **Daily report row counts must match.** For daily reports, compute `dailyRows` from the latest business date and ensure `rowsUsedForMetrics === dailyRows`.
8. **Support Chinese and English business fields.** Field detection must handle `业务日期`, `订单日期`, `交易日期`, `order_date`, `business_date`, and avoid empty normalized Chinese matches.
9. **Browser direct uploads need storage CORS and the account S3 endpoint.** Presigned R2/S3 uploads must use `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, allow the production origin, and show actionable errors instead of raw `Failed to fetch`.
10. **Large files cannot fall back to serverless uploads.** Keep API upload fallback under the platform payload limit; larger files must use direct storage upload.
11. **Database presets must fail clearly.** Do not silently use `127.0.0.1` as a production preset; return missing fields and tell the user which env vars or overrides are required.
12. **Workspace data must be isolated.** Scope data sources, snapshots, metrics, reports, members, billing actions, and invite links by `workspaceId`; new workspace creators must be `OWNER`.
13. **UI should hide internals and real controls must work.** Do not leak `STORED_FILE_PATH`, `dailyRows`, or `verifiedMetrics`; visible buttons need handlers, feedback, and empty/error states.
14. **Mobile UI is not desktop UI.** Test signed-in/signed-out and narrow viewport states; do not blindly reuse desktop navigation on mobile.
15. **Checkout flows must match current product intent.** Do not infer Stripe from a plan name; only explicitly payment-enabled plans should call Stripe. Evaluation, consulting, enterprise, and setup flows submit requests.
16. **Locale first render must use request context.** Do not hard-code `useLocale("en")` on public entry pages; pass a server request locale from cookie, IP country, or `Accept-Language`, then let user preference override it.
17. **Clerk passwordless must satisfy backend requirements invisibly.** If the product UX hides passwords but Clerk still requires `password`, generate a strong managed password in `signUp.create` and keep login passwordless.
18. **Only update memory when it teaches reuse.** Append full memory only for reusable patterns; update this index only for high-frequency or high-impact prevention rules.
