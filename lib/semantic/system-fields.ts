const CANONICAL_SYSTEM_FIELD_NAMES = new Set([
  "workspace_id",
  "data_source_id",
  "source_provider",
  "source_account_id",
  "schema_version",
  "sync_run_id",
  "source_record_id",
  "raw_payload_hash",
  "normalized_at"
]);

export function isCanonicalSystemField(fieldName: string) {
  const normalized = fieldName.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  const leaf = normalized.split(".").pop() ?? normalized;

  return CANONICAL_SYSTEM_FIELD_NAMES.has(normalized) || CANONICAL_SYSTEM_FIELD_NAMES.has(leaf);
}
