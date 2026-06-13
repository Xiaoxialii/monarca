# Coding Rules

Use this checklist before coding. If a rule matches the change, apply it before editing.

## Metric Generation Checklist

- Confirm whether the metric should come from `business_metric_registry` before using a fallback or industry template.
- Do not treat fallback semantic metrics as verified metrics.
- Do not infer revenue from `SUM(price)` unless the field is explicitly a revenue, sales, paid, net, gross, or amount field and the unit grain is correct.
- Do not render dimension fields such as channel, category, market, region, or customer segment as numeric trends.
- Check lineage: required fields, formula, generated source, validation status, table scope, and business type.
- Only execute business-facing metrics with valid lineage.
- Ensure metrics belong to the current table/source, especially for multi-source workspaces.
- If no registry metrics exist, generate or recover workspace metrics without silently changing formulas across reports.

## Report Generation Checklist

- Anchor daily reports to the latest available business data date, not the system date.
- Anchor weekly reports to equal current and previous windows unless explicitly showing partial history.
- Anchor monthly operating reports to month-to-date when the month is incomplete; do not present it as a full natural month.
- Keep daily, weekly, and monthly reports on the same registry metric definitions.
- Run data audit before composing report content.
- If audit fails, render a clear failure state instead of empty KPI cards or overconfident conclusions.
- Do not let demo reports change because of today's system date.
- Do not output strong conclusions when comparison periods, trend points, or dimension evidence are insufficient.
- Keep report locale consistent across summaries, evidence, labels, and UI.

## Uploaded File Calculation Checklist

- Never calculate a formal report from `schema.sampleRows`, `previewRows`, `sampleData`, `headRows`, or `first500Rows`.
- Read the full file or query the database before calculating verified metrics.
- Confirm the source path or object key is actually readable; a saved `storedFilePath` alone is not enough.
- For daily reports, compute `latestDataDate` from the complete business date column.
- For daily reports, ensure `dailyRows > 0` and `rowsUsedForMetrics === dailyRows`.
- Support Chinese and English business date fields such as `业务日期`, `订单日期`, `交易日期`, `order_date`, `business_date`, and `created_at`.
- Avoid Chinese field matching through empty normalized strings.
- Keep total source rows, current-period rows, and metric calculation rows distinct.
- For R2, Supabase, local files, CSV, and Excel, confirm the same full-data path is available to report generation.

## Workspace Isolation Checklist

- New workspace creators must become `OWNER`, not `VIEWER`.
- Authenticated users must land in their own active workspace.
- Do not mix data sources, snapshots, metrics, briefings, reports, or members across workspaces.
- Always filter workspace-scoped reads and writes by `workspaceId`.
- Verify role checks before allowing report generation, data-source changes, billing actions, or member management.
- Redirect already signed-in users away from sign-in pages to the correct dashboard.
- Do not assume Clerk user identity alone is sufficient; map it to the local workspace membership.

## UI Rendering Checklist

- Do not render dimension/category fields as numeric zero-line charts.
- Show empty, insufficient-data, and audit-failed states explicitly.
- Keep report text concise enough for desktop and mobile containers.
- Use business wording that explains the action or implication, not internal terms such as `verifiedMetrics`, `dailyRows`, or `STORED_FILE_PATH`.
- On mobile dashboards, keep navigation intentionally scoped; do not blindly reuse desktop menus.
- Distinguish data-source connected, fields recognized, metrics generated, and report generated states.
- For localized UI, keep the language consistent across labels, buttons, cards, errors, and generated insight text.
- Avoid overconfident AI insight wording when data is partial, sample-only, or comparison windows are incomplete.
