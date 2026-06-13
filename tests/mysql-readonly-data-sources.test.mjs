import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("MySQL is a supported read-only data source type end to end", () => {
  const schema = read("prisma/schema.prisma");
  const dashboard = read("components/dashboard.tsx");
  const config = read("lib/database-connection-config.ts");
  const testConnectionRoute = read("app/api/data-sources/test-connection/route.ts");
  const connectRoute = read("app/api/data-sources/connect/route.ts");
  const introspectRoute = read("app/api/data-sources/introspect/route.ts");
  const rescanRoute = read("app/api/data-sources/[id]/rescan/route.ts");

  assert.match(schema, /enum DataSourceType[\s\S]*MYSQL/, "Prisma DataSourceType should include MYSQL");
  assert.match(schema, /model DataSourceStats/, "Prisma should store only aggregate data source stats");
  assert.match(config, /"postgresql" \| "mysql"/, "Database config should accept mysql");
  assert.match(config, /protocol === "mysql"[\s\S]*protocol === "mysql2"/, "Database URL parsing should recognize MySQL URLs");
  assert.match(config, /missingRequiredDatabaseConfigFields/, "Database config should expose missing required fields");
  assert.doesNotMatch(config, /databaseUrlPreset\?\.host\s*\|\|\s*"127\.0\.0\.1"/, "Database config must not silently use localhost as a production preset");
  assert.match(dashboard, /selectedSource\.name === "MySQL"[\s\S]*\? "mysql"/, "MySQL card should map to databaseType=mysql");
  assert.match(dashboard, /databaseType === "mysql" \? "3306" : "5432"/, "MySQL should default to port 3306");
  assert.match(dashboard, /DATABASE_PRESET_INCOMPLETE/, "Dashboard should translate incomplete database presets");
  assert.match(dashboard, /服务器预设 \/ 未配置/, "Database preview should not imply a blank preset is localhost");
  assert.match(testConnectionRoute, /databaseType:\s*type/, "Test connection should echo the accepted databaseType");
  assert.match(testConnectionRoute, /code:\s*"DATABASE_PRESET_INCOMPLETE"/, "Test connection should return a stable incomplete preset error code");
  assert.match(connectRoute, /DataSourceType\.MYSQL/, "Connect route should save MySQL as MYSQL");
  assert.match(connectRoute, /code:\s*"DATABASE_PRESET_INCOMPLETE"/, "Connect route should return a stable incomplete preset error code");
  assert.match(introspectRoute, /DataSourceType\.MYSQL/, "Introspect route should save MySQL as MYSQL");
  assert.match(introspectRoute, /code:\s*"DATABASE_PRESET_INCOMPLETE"/, "Introspect route should return a stable incomplete preset error code");
  assert.match(rescanRoute, /DataSourceType\.MYSQL/, "Rescan route should support MySQL");
});

test("database connectors introspect metadata and aggregate stats without sample rows", () => {
  const introspection = read("lib/database-introspection.ts");
  const uploadRoute = read("app/api/data-sources/upload/route.ts");
  const uploadCompleteRoute = read("app/api/data-sources/upload/complete/route.ts");

  assert.match(introspection, /SELECT 1 AS ok/, "Connection tests should use minimal read-only SELECT 1");
  assert.match(introspection, /information_schema\.TABLES/, "MySQL introspection should read table metadata");
  assert.match(introspection, /information_schema\.COLUMNS/, "MySQL introspection should read column metadata");
  assert.match(introspection, /information_schema\.STATISTICS/, "MySQL introspection should read index metadata");
  assert.match(introspection, /COUNT\(\*\)/, "DataSourceStats should use aggregate row counts");
  assert.match(introspection, /MAX\(/, "latestDataDate and stats should use aggregate MAX queries");
  assert.doesNotMatch(introspection, /SELECT \*/, "Database introspection/stats should not use SELECT *");
  assert.match(uploadRoute, /tables:\s*schemaTables/, "Direct upload schema snapshots should persist sanitized schema tables");
  assert.match(uploadCompleteRoute, /tables:\s*schemaTables/, "Signed upload schema snapshots should persist sanitized schema tables");
  assert.doesNotMatch(uploadRoute, /schemaJson:[\s\S]*tables,\s*semanticLayer/, "Direct upload snapshots should not persist raw inferred tables");
  assert.doesNotMatch(uploadCompleteRoute, /schemaJson:[\s\S]*tables,\s*semanticLayer/, "Signed upload snapshots should not persist raw inferred tables");
});

test("metric execution supports MySQL dialect and blocks non-read queries", () => {
  const metricResults = read("lib/metric-results.ts");

  assert.match(metricResults, /DataSourceType\.MYSQL\) return "mysql"/, "Metric execution should route MYSQL to mysql dialect");
  assert.match(metricResults, /const quote = type === "mysql" \? "`" : `"`/, "MySQL identifiers should use backticks");
  assert.match(metricResults, /multipleStatements:\s*false/, "MySQL execution should disable multiple statements");
  assert.match(metricResults, /Only SELECT aggregation queries are allowed/, "Metric execution should allow SELECT only");
  assert.match(metricResults, /insert\|update\|delete\|drop\|alter\|truncate\|create\|grant\|revoke\|call\|execute/, "Metric execution should block write/admin SQL");
  assert.match(metricResults, /DATA_SOURCE_FULL_DATA_UNAVAILABLE/, "Metric execution should fail when full source data is unavailable");
  assert.doesNotMatch(metricResults, /schema\.sampleRows/, "Metric execution should not consume schema.sampleRows directly");
});
