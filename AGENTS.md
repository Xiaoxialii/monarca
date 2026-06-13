# Agent Instructions

This repository uses two levels of long-term error memory:

- `docs/ERROR_MEMORY_INDEX.md`: short recurring mistakes and prevention rules. Read this before every coding task.
- `docs/ERROR_MEMORY.md`: full historical error log. Read this only when relevant to the current task.

Also use `docs/CODING_RULES.md` before implementation and apply the checklist for the area being changed.

## Before Coding

1. Always read `docs/ERROR_MEMORY_INDEX.md`.
2. Read `docs/ERROR_MEMORY.md` only when the task is related to:
   - Bugs or regressions.
   - Metric generation, metric validation, metric execution, or semantic metric mapping.
   - Daily, weekly, monthly, snapshot, demo, or historical report generation.
   - Uploaded file parsing, storage-backed calculation, R2/Supabase/local file reads, or data-source introspection.
   - Auth, sign-in, workspace creation, workspace membership, role assignment, or tenant isolation.
   - Dashboard, report, chart, KPI, insight, mobile, localization, or other UI rendering.
   - A known recurring mistake listed in `docs/ERROR_MEMORY_INDEX.md`.
3. Check whether the current issue matches any known recurring error.
4. Apply the relevant prevention rule before editing.

## After Coding

1. Do not blindly update error memory.
2. Append to `docs/ERROR_MEMORY.md` only if the work revealed a reusable error pattern, repeated mistake, fragile assumption, or new prevention rule.
3. Update `docs/ERROR_MEMORY_INDEX.md` only if the new rule is high-frequency or high-impact.
4. Never overwrite or delete old historical records in `docs/ERROR_MEMORY.md`; append new entries only.
5. If no memory update is needed, briefly state that no new reusable error pattern was found.

## Final Response

Every final response after a code change must include:

- Whether `docs/ERROR_MEMORY_INDEX.md` was read.
- Whether `docs/ERROR_MEMORY.md` was read, and why.
- Whether the current issue matched a known recurring error.
- Whether error memory was updated.
- The files changed.
