import { readFile } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import { Client as PostgresClient } from "pg";
import {
  ConnectionStatus,
  DataSourceType,
  MetricStatus,
  type DataSourceConnection,
  type MetricDefinition
} from "@prisma/client";
import type { SchemaColumn, SchemaTable } from "@/lib/metric-validation";
import { validationFromLineage } from "@/lib/metric-validation";
import { storedSecret } from "@/lib/secret-crypto";

type SupportedResultDatabase = "mysql" | "postgresql";

type ResultConfig = {
  type: SupportedResultDatabase;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

export type MetricResultValue = {
  metricId: string;
  metricName: string;
  displayName?: string;
  unit?: string | null;
  formula: string;
  status: "computed" | "skipped" | "failed";
  scope?: "global" | "group" | "entity" | "ranking" | "comparison" | "diagnostic" | "internal";
  value?: number | string | null;
  rows?: Array<{
    dimension: string;
    value: number | string | null;
    sampleSize?: number | null;
    negativeCount?: number | null;
  }>;
  sql?: string;
  error?: string;
  computedAt: string;
  metricType?: string;
  metricCategory?: string;
  businessType?: string;
  sourceDataset?: string;
  semanticRole?: string | null;
  priority?: number | null;
  isCoreMetric?: boolean;
  isBusinessMetric?: boolean;
  isInternalMetric?: boolean;
  isDiagnosticMetric?: boolean;
  isBenchmarkMetric?: boolean;
  isEstimated?: boolean;
  requiresDeduplication?: boolean;
  sampleSize?: number | null;
  warningTypes?: string[];
  validationStatus?: string | null;
  warning?: string;
  benchmarkContext?: {
    comparisonType: "median" | "previous_period" | "topN_share" | "threshold" | "group_average" | "distribution" | "none";
    baselineValue?: number | string | null;
    delta?: number | null;
    deltaPercent?: number | null;
    status?: string;
    interpretation?: string;
  };
};

export type MetricResultContext = {
  dataSource: DataSourceConnection;
  tables: SchemaTable[];
  schemaJson?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metricLineage(metric: Pick<MetricDefinition, "name" | "category" | "formula" | "lineageJson">) {
  const lineage = asRecord(metric.lineageJson);
  const metricType = typeof lineage.metricType === "string" ? lineage.metricType : "core_metric";
  const validation = validationFromLineage(metric.lineageJson);
  const warning = typeof lineage.warning === "string"
    ? lineage.warning
    : Array.isArray(lineage.warnings) && typeof lineage.warnings[0] === "string"
      ? lineage.warnings[0]
      : undefined;
  const lineageWarnings = Array.isArray(lineage.warningTypes)
    ? lineage.warningTypes.filter((item): item is string => typeof item === "string")
    : [];
  const warningTypes = Array.from(new Set([
    ...lineageWarnings,
    ...(lineage.isEstimated || /price\s*\*/i.test(`${metric.name} ${metric.formula}`) ? ["estimated_value"] : []),
    ...(lineage.requiresDeduplication ? ["deduplication_warning"] : []),
    ...(warning && /sample/i.test(warning) ? ["small_sample_warning"] : []),
    ...(warning && /benchmark|基准/i.test(warning) ? ["missing_benchmark"] : [])
  ]));
  const isInternalMetric = Boolean(lineage.isInternalMetric) || /internal|debug/i.test(metricType);
  const isDiagnosticMetric = Boolean(lineage.isDiagnosticMetric) ||
    /diagnostic|sample/i.test(metricType) ||
    /sample(_|\s)?size|confidence|impactscore|impact_score|dataqualityscore|data_quality_score/i.test(metric.name);

  return {
    displayName: typeof lineage.displayName === "string" ? lineage.displayName : metric.name,
    unit: typeof lineage.unit === "string" ? lineage.unit : undefined,
    metricType,
    metricCategory: typeof lineage.metricCategory === "string" ? lineage.metricCategory : metric.category,
    businessType: typeof lineage.businessType === "string" ? lineage.businessType : undefined,
    sourceDataset: typeof lineage.sourceDataset === "string" ? lineage.sourceDataset : undefined,
    semanticRole: typeof lineage.semanticRole === "string" ? lineage.semanticRole : undefined,
    priority: typeof lineage.priority === "number" ? lineage.priority : undefined,
    isCoreMetric: Boolean(lineage.isCoreMetric) || metricType === "core_metric" || metricType === "core",
    isBusinessMetric: lineage.isBusinessMetric === false ? false : !isInternalMetric && !isDiagnosticMetric,
    isInternalMetric,
    isDiagnosticMetric,
    isBenchmarkMetric: Boolean(lineage.isBenchmarkMetric),
    isEstimated: Boolean(lineage.isEstimated),
    requiresDeduplication: Boolean(lineage.requiresDeduplication),
    sampleSize: typeof lineage.sampleSize === "number" ? lineage.sampleSize : undefined,
    warningTypes,
    validationStatus: validation?.validation_status === "valid"
      ? "passed"
      : validation?.validation_status ?? undefined,
    warning,
    benchmarkContext: {
      comparisonType: metricType === "distribution_metric"
        ? "distribution"
        : metricType === "concentration_metric"
          ? "topN_share"
          : metricType === "comparison_metric"
            ? "group_average"
            : warning
              ? "threshold"
              : "none",
      status: warning ? "warning" : undefined,
      interpretation: warning
    } satisfies MetricResultValue["benchmarkContext"]
  };
}

function metricScope(metric: Pick<MetricDefinition, "name" | "formula" | "lineageJson">, hasRows = false): NonNullable<MetricResultValue["scope"]> {
  const lineage = asRecord(metric.lineageJson);
  const explicitScope = typeof lineage.scope === "string" ? lineage.scope : "";
  const text = `${metric.name} ${metric.formula}`.toLowerCase();

  if (["global", "group", "entity", "ranking", "comparison", "diagnostic", "internal"].includes(explicitScope)) {
    return explicitScope as NonNullable<MetricResultValue["scope"]>;
  }

  if (/sample(_|\s)?size|samplecount|sample_count|diagnostic/.test(text)) {
    return "diagnostic";
  }

  if (/confidence|impactscore|impact_score|dataqualityscore|data_quality_score|applied_steps_count|anomalytype|anomaly_type|debug|internal/.test(text)) {
    return "internal";
  }

  if (/^top_n_share\s*\(/i.test(metric.formula.trim()) || /top \d+ .*share|median|percentile|p75|p90|p95|threshold|previous period|mean median/i.test(text)) {
    return "comparison";
  }

  if (hasRows) {
    if (/by\s+(app|product|sku|customer|user|account|entity|object)\b/i.test(text)) {
      return "entity";
    }

    return "group";
  }

  if (/\s+by\s+[a-z_][\w]*(?:\.[a-z_][\w]*)?/i.test(metric.formula.trim())) {
    return "group";
  }

  return "global";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sourceType(source: Pick<DataSourceConnection, "type">): SupportedResultDatabase | null {
  if (source.type === DataSourceType.MYSQL) return "mysql";
  if (source.type === DataSourceType.POSTGRESQL) return "postgresql";
  return null;
}

function configFromSource(source: Pick<DataSourceConnection, "type" | "config">): ResultConfig | null {
  const type = sourceType(source);
  const config = asRecord(source.config);

  if (!type) {
    return null;
  }

  const host = typeof config.host === "string" ? config.host : "";
  const database = typeof config.database === "string" ? config.database : "";
  const username = typeof config.username === "string" ? config.username : "";
  const password = storedSecret(config.password, config.passwordEncrypted);
  const port = Number(config.port);

  if (!host || !database || !username || !Number.isInteger(port)) {
    return null;
  }

  return {
    type,
    host,
    port,
    database,
    username,
    password,
    ssl: Boolean(config.ssl)
  };
}

function quoteIdentifier(type: SupportedResultDatabase, value: string) {
  const parts = value.split(".").filter(Boolean);

  return parts.map((part) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
      throw new Error(`Unsafe identifier: ${part}`);
    }

    return type === "mysql" ? `\`${part}\`` : `"${part}"`;
  }).join(".");
}

function tableLabel(table: SchemaTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function findTable(tables: SchemaTable[], tableName: string) {
  const normalized = normalize(tableName);
  return tables.find((table) => normalize(table.name) === normalized || normalize(tableLabel(table)) === normalized);
}

function findColumn(table: SchemaTable, fieldName: string) {
  const normalized = normalize(fieldName);
  return table.columns.find((column) => normalize(column.name) === normalized);
}

function isLikelyTextColumn(column: SchemaColumn) {
  const type = (column.type ?? "").toLowerCase();
  const name = normalize(column.name);

  return (
    ["char", "text", "string", "varchar"].some((keyword) => type.includes(keyword)) ||
    ["review", "comment", "feedback", "description", "message", "text"].some((keyword) => name.includes(keyword))
  );
}

function isRatingColumn(column: SchemaColumn) {
  const name = normalize(column.name);
  return /\brating\b|\bscore\b/.test(name) && !/review|sentiment|subject|confidence|impact|quality/i.test(column.name);
}

function cleanMetricNumber(value: number | null, column?: SchemaColumn | null) {
  if (value == null) return null;
  if (column && isRatingColumn(column) && (value < 0 || value > 5)) {
    return null;
  }
  return value;
}

function singleFieldReference(tables: SchemaTable[], expression: string) {
  const references = uniqueRefs(expression);

  if (references.length !== 1) {
    return null;
  }

  const reference = references[0];
  const table = findTable(tables, reference.table);
  const column = table ? findColumn(table, reference.field) : null;

  return table && column ? { reference, table, column } : null;
}

function textCast(type: SupportedResultDatabase, expressionSql: string) {
  return type === "mysql" ? `CAST(${expressionSql} AS CHAR)` : `CAST(${expressionSql} AS TEXT)`;
}

function nonEmptyTextCountSql(type: SupportedResultDatabase, expressionSql: string) {
  const textSql = `TRIM(${textCast(type, expressionSql)})`;

  return `SUM(CASE WHEN ${expressionSql} IS NOT NULL AND ${textSql} <> '' AND LOWER(${textSql}) NOT IN ('nan', 'null', 'undefined', 'n/a', 'na', 'none') THEN 1 ELSE 0 END)`;
}

function cleanNumericSqlExpression(type: SupportedResultDatabase, tables: SchemaTable[], expression: string) {
  const fieldReference = singleFieldReference(tables, expression);
  const rawSql = translateFieldExpression(type, tables, expression);

  if (!fieldReference || !isRatingColumn(fieldReference.column)) {
    return rawSql;
  }

  const numericSql = type === "mysql"
    ? `CAST(${rawSql} AS DECIMAL(20,6))`
    : `CAST(${rawSql} AS NUMERIC)`;

  return `CASE WHEN ${numericSql} BETWEEN 0 AND 5 THEN ${numericSql} ELSE NULL END`;
}

function extractRefs(formula: string) {
  const refs: Array<{ table: string; field: string }> = [];
  const pattern = /\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)\.([A-Za-z_][\w]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(formula)) !== null) {
    refs.push({ table: match[1], field: match[2] });
  }

  return refs;
}

function uniqueRefs(formula: string) {
  const seen = new Set<string>();

  return extractRefs(formula).filter((reference) => {
    const key = `${normalize(reference.table)}.${normalize(reference.field)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;

    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function splitTopLevelOperator(value: string, operators: string[]) {
  let depth = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];

    if (character === ")") depth += 1;
    if (character === "(") depth -= 1;

    if (depth === 0 && operators.includes(character)) {
      if ((character === "+" || character === "-") && index === 0) {
        continue;
      }

      return {
        left: value.slice(0, index).trim(),
        operator: character,
        right: value.slice(index + 1).trim()
      };
    }
  }

  return null;
}

function sourceTableForFormula(tables: SchemaTable[], formula: string) {
  const refs = extractRefs(formula);
  const found = refs.flatMap((reference) => {
    const table = findTable(tables, reference.table);
    return table ? [table] : [];
  });
  const labels = new Set(found.map(tableLabel));

  if (labels.size !== 1) {
    throw new Error(labels.size > 1 ? "Cross-table metric results are not supported yet" : "No table reference found");
  }

  return found[0];
}

function percentileSql(tableSql: string, fieldSql: string, ratio: number) {
  const ordered = `SELECT ${fieldSql} AS value, ROW_NUMBER() OVER (ORDER BY ${fieldSql}) AS rn, COUNT(*) OVER () AS cnt FROM ${tableSql} WHERE ${fieldSql} IS NOT NULL`;
  const position = Math.max(0, Math.min(1, ratio));
  const target = `1 + (cnt - 1) * ${position}`;

  return `SELECT AVG(value) AS metric_value FROM (${ordered}) ranked WHERE rn IN (FLOOR(${target}), CEIL(${target}))`;
}

function contextForMetric(contexts: MetricResultContext[], metric: Pick<MetricDefinition, "formula">) {
  const references = uniqueRefs(metric.formula);

  if (references.length === 0) {
    return null;
  }

  const matchingContexts = contexts.filter((context) =>
    references.every((reference) => {
      const table = findTable(context.tables, reference.table);
      return Boolean(table && findColumn(table, reference.field));
    })
  );

  return matchingContexts.find(canComputeContext) ?? matchingContexts[0] ?? null;
}

function canComputeContext(context: MetricResultContext) {
  if (sourceType(context.dataSource)) {
    return true;
  }

  return getSchemaTables(context.schemaJson).some((table) => Array.isArray(table.sampleRows)) ||
    typeof asRecord(context.dataSource.config).storedFilePath === "string";
}

function translateExpression(type: SupportedResultDatabase, tables: SchemaTable[], formula: string): string {
  const trimmed = formula.trim();
  const safeDivideMatch = /^SAFE_DIVIDE\s*\((.*)\)$/i.exec(trimmed);

  if (safeDivideMatch) {
    const [numerator, denominator] = splitTopLevel(safeDivideMatch[1]);

    if (!numerator || !denominator) {
      throw new Error("SAFE_DIVIDE requires numerator and denominator");
    }

    return `(${translateExpression(type, tables, numerator)}) / NULLIF((${translateExpression(type, tables, denominator)}), 0)`;
  }

  const countDistinctMatch = /^COUNT_DISTINCT\s*\(([^)]*)\)$/i.exec(trimmed);
  if (countDistinctMatch) {
    return `COUNT(DISTINCT ${translateFieldExpression(type, tables, countDistinctMatch[1])})`;
  }

  const countDistinctIfMatch = /^COUNT_DISTINCT_IF\s*\((.*)\)$/i.exec(trimmed);
  if (countDistinctIfMatch) {
    const [fieldExpression, conditionExpression] = splitTopLevel(countDistinctIfMatch[1]);

    if (!fieldExpression || !conditionExpression) {
      throw new Error("COUNT_DISTINCT_IF requires a field and condition");
    }

    return `COUNT(DISTINCT CASE WHEN ${translateCondition(type, tables, conditionExpression)} THEN ${translateFieldExpression(type, tables, fieldExpression)} ELSE NULL END)`;
  }

  const countIfMatch = /^COUNT_IF\s*\((.*)\)$/i.exec(trimmed);
  if (countIfMatch) {
    return `SUM(CASE WHEN ${translateCondition(type, tables, countIfMatch[1])} THEN 1 ELSE 0 END)`;
  }

  const countNonEmptyMatch = /^COUNT_NON_EMPTY\s*\((.*)\)$/i.exec(trimmed);
  if (countNonEmptyMatch) {
    const inner = countNonEmptyMatch[1].trim();

    if (!inner) {
      throw new Error("COUNT_NON_EMPTY requires a field");
    }

    return nonEmptyTextCountSql(type, translateFieldExpression(type, tables, inner));
  }

  const aggregateMatch = /^(SUM|AVG|MIN|MAX|STDDEV|COUNT)\s*\((.*)\)$/i.exec(trimmed);
  if (aggregateMatch) {
    const fn = aggregateMatch[1].toUpperCase();
    const inner = aggregateMatch[2].trim();
    const sqlFn = fn === "STDDEV" && type === "postgresql" ? "STDDEV_SAMP" : fn;

    if (fn === "COUNT" && inner === "*") {
      return "COUNT(*)";
    }

    const fieldReference = fn === "COUNT" ? singleFieldReference(tables, inner) : null;

    if (fieldReference && isLikelyTextColumn(fieldReference.column)) {
      return nonEmptyTextCountSql(type, translateFieldExpression(type, tables, inner));
    }

    return `${sqlFn}(${cleanNumericSqlExpression(type, tables, inner)})`;
  }

  const additiveExpression = splitTopLevelOperator(trimmed, ["+", "-"]);
  if (additiveExpression) {
    return `(${translateExpression(type, tables, additiveExpression.left)}) ${additiveExpression.operator} (${translateExpression(type, tables, additiveExpression.right)})`;
  }

  const multiplicativeExpression = splitTopLevelOperator(trimmed, ["*", "/"]);
  if (multiplicativeExpression) {
    if (multiplicativeExpression.operator === "/") {
      return `(${translateExpression(type, tables, multiplicativeExpression.left)}) / NULLIF((${translateExpression(type, tables, multiplicativeExpression.right)}), 0)`;
    }

    return `(${translateExpression(type, tables, multiplicativeExpression.left)}) * (${translateExpression(type, tables, multiplicativeExpression.right)})`;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return translateFieldExpression(type, tables, trimmed);
}

function translateCondition(type: SupportedResultDatabase, tables: SchemaTable[], expression: string) {
  const match = /^(.+?)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/.exec(expression.trim());

  if (!match) {
    throw new Error("Unsupported COUNT_IF condition");
  }

  return `${translateFieldExpression(type, tables, match[1].trim())} ${match[2]} ${translateLiteral(match[3].trim())}`;
}

function translateLiteral(value: string) {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }

  const unquoted = value.replace(/^['"]|['"]$/g, "");
  return `'${unquoted.replace(/'/g, "''")}'`;
}

function translateFieldExpression(type: SupportedResultDatabase, tables: SchemaTable[], expression: string): string {
  let translated = expression;
  const refs = extractRefs(expression);

  for (const reference of refs) {
    const table = findTable(tables, reference.table);

    if (!table) {
      throw new Error(`Table not found: ${reference.table}`);
    }

    const column = findColumn(table, reference.field);

    if (!column) {
      throw new Error(`Field not found: ${reference.table}.${reference.field}`);
    }

    const quoted = quoteIdentifier(type, column.name);
    const pattern = new RegExp(`\\b${reference.table.replace(".", "\\.")}\\.${reference.field}\\b`, "g");
    translated = translated.replace(pattern, quoted);
  }

  if (!/^[\w\s`".+\-*/()]+$/.test(translated)) {
    throw new Error("Unsupported formula expression");
  }

  return translated;
}

function buildMetricSql(type: SupportedResultDatabase, tables: SchemaTable[], metric: Pick<MetricDefinition, "formula">) {
  const formula = metric.formula.trim();
  const topShareMatch = /^TOP_N_SHARE\s*\((.+?)\s+BY\s+(.+?),\s*(\d+)\s*\)$/i.exec(formula);
  const byMatch = /^(.+?)\s+BY\s+(.+)$/i.exec(formula);
  const sourceTable = sourceTableForFormula(tables, formula);
  const tableSql = quoteIdentifier(type, tableLabel(sourceTable));

  const meanMedianRatioMatch = /^SAFE_DIVIDE\s*\(\s*AVG\s*\((.*?)\)\s*,\s*MEDIAN\s*\((.*?)\)\s*\)$/i.exec(formula);
  if (meanMedianRatioMatch) {
    const avgFieldSql = cleanNumericSqlExpression(type, tables, meanMedianRatioMatch[1].trim());
    const medianFieldSql = cleanNumericSqlExpression(type, tables, meanMedianRatioMatch[2].trim());
    const medianQuery = percentileSql(tableSql, medianFieldSql, 0.5);

    return {
      sql: `SELECT (SELECT AVG(${avgFieldSql}) FROM ${tableSql}) / NULLIF((SELECT metric_value FROM (${medianQuery}) median_value), 0) AS metric_value`,
      grouped: false
    };
  }

  if (topShareMatch) {
    const aggregateSql = translateExpression(type, tables, topShareMatch[1].trim());
    const dimensionSql = translateFieldExpression(type, tables, topShareMatch[2].trim());
    const limit = Math.max(1, Math.min(50, Number(topShareMatch[3])));

    return {
      sql: `SELECT (SELECT SUM(metric_value) FROM (SELECT ${aggregateSql} AS metric_value FROM ${tableSql} GROUP BY ${dimensionSql} ORDER BY metric_value DESC LIMIT ${limit}) ranked) / NULLIF((SELECT ${aggregateSql} FROM ${tableSql}), 0) AS metric_value`,
      grouped: false
    };
  }

  const medianMatch = /^MEDIAN\s*\((.*)\)$/i.exec(formula);
  if (medianMatch) {
    const fieldSql = cleanNumericSqlExpression(type, tables, medianMatch[1].trim());
    return {
      sql: percentileSql(tableSql, fieldSql, 0.5),
      grouped: false
    };
  }

  const percentileMatch = /^PERCENTILE\s*\((.*)\)$/i.exec(formula);
  if (percentileMatch) {
    const [fieldExpression, ratioExpression] = splitTopLevel(percentileMatch[1]);
    const ratio = Number(ratioExpression);

    if (!fieldExpression || !Number.isFinite(ratio)) {
      throw new Error("PERCENTILE requires a field and numeric ratio");
    }

    const fieldSql = cleanNumericSqlExpression(type, tables, fieldExpression);
    return {
      sql: percentileSql(tableSql, fieldSql, ratio),
      grouped: false
    };
  }

  if (byMatch) {
    const aggregateSql = translateExpression(type, tables, byMatch[1].trim());
    const dimensionSql = translateFieldExpression(type, tables, byMatch[2].trim());

    return {
      sql: `SELECT ${dimensionSql} AS dimension_value, ${aggregateSql} AS metric_value FROM ${tableSql} GROUP BY ${dimensionSql} ORDER BY metric_value DESC LIMIT 10`,
      grouped: true
    };
  }

  return {
    sql: `SELECT ${translateExpression(type, tables, formula)} AS metric_value FROM ${tableSql}`,
    grouped: false
  };
}

async function queryMetric(config: ResultConfig, sql: string) {
  if (config.type === "mysql") {
    const connection = await mariadb.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectTimeout: 5000,
      allowPublicKeyRetrieval: true,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined
    });

    try {
      return await connection.query(sql) as Array<Record<string, unknown>>;
    } finally {
      await connection.end();
    }
  }

  const client = new PostgresClient({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionTimeoutMillis: 5000,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    const result = await client.query(sql);
    return result.rows as Array<Record<string, unknown>>;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function getSchemaTables(schemaJson: unknown): Array<Record<string, unknown>> {
  const schema = asRecord(schemaJson);
  return Array.isArray(schema.tables)
    ? schema.tables.filter((table): table is Record<string, unknown> => Boolean(asRecord(table)))
    : [];
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && nextCharacter === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

async function readCsvRows(filePath: string) {
  const resolved = path.resolve(filePath);
  const workspaceRoot = path.resolve(process.cwd());

  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error("CSV file path is outside the workspace");
  }

  const text = await readFile(resolved, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : [];

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function rowsForCsvTable(context: MetricResultContext, table: SchemaTable) {
  const schemaTable = getSchemaTables(context.schemaJson).find((candidate) =>
    normalize(String(candidate.name ?? "")) === normalize(table.name)
  );
  const sampleRows = Array.isArray(schemaTable?.sampleRows)
    ? schemaTable.sampleRows.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)))
    : [];

  if (sampleRows.length > 0) {
    return sampleRows;
  }

  const storedFilePath = asRecord(context.dataSource.config).storedFilePath;

  if (typeof storedFilePath === "string" && storedFilePath) {
    return readCsvRows(storedFilePath);
  }

  throw new Error("No CSV rows are available for metric execution");
}

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[$,%+,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBlankishValue(value: unknown) {
  if (value == null) {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();
  return !normalized || ["nan", "null", "undefined", "n/a", "na", "none"].includes(normalized);
}

function rowFieldValue(row: Record<string, unknown>, column: SchemaColumn) {
  if (Object.prototype.hasOwnProperty.call(row, column.name)) {
    return row[column.name];
  }

  const normalized = normalize(column.name);
  const matchingKey = Object.keys(row).find((key) => normalize(key) === normalized);

  return matchingKey ? row[matchingKey] : undefined;
}

function fieldExpressionValue(row: Record<string, unknown>, tables: SchemaTable[], expression: string) {
  let translated = expression;
  const refs = uniqueRefs(expression);

  for (const reference of refs) {
    const table = findTable(tables, reference.table);
    const column = table ? findColumn(table, reference.field) : null;

    if (!table || !column) {
      throw new Error(`Field not found: ${reference.table}.${reference.field}`);
    }

    const value = cleanMetricNumber(parseNumber(rowFieldValue(row, column)), column);
    const pattern = new RegExp(`\\b${reference.table.replace(".", "\\.")}\\.${reference.field}\\b`, "g");
    translated = translated.replace(pattern, value == null ? "NaN" : String(value));
  }

  if (!/^[\d\s.+\-*/()eENaN]+$/.test(translated)) {
    throw new Error("Unsupported CSV formula expression");
  }

  const value = Function(`"use strict"; return (${translated});`)() as unknown;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return null;
  const bounded = Math.max(0, Math.min(1, ratio));
  const index = (sortedValues.length - 1) * bounded;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function conditionValue(row: Record<string, unknown>, tables: SchemaTable[], expression: string) {
  const match = /^(.+?)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/.exec(expression.trim());

  if (!match) {
    throw new Error("Unsupported COUNT_IF condition");
  }

  const reference = uniqueRefs(match[1])[0];
  const table = reference ? findTable(tables, reference.table) : null;
  const column = table && reference ? findColumn(table, reference.field) : null;

  if (!reference || !table || !column) {
    throw new Error("COUNT_IF requires a field condition");
  }

  const leftRaw = rowFieldValue(row, column);
  const rightRaw = match[3].trim().replace(/^['"]|['"]$/g, "");
  const leftNumber = parseNumber(leftRaw);
  const rightNumber = parseNumber(rightRaw);
  const left = leftNumber ?? String(leftRaw ?? "");
  const right = rightNumber ?? rightRaw;

  switch (match[2]) {
    case "=":
      return left === right;
    case "!=":
    case "<>":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function aggregateRows(rows: Array<Record<string, unknown>>, tables: SchemaTable[], formula: string): number | string | null {
  const trimmed = formula.trim();
  const topShareMatch = /^TOP_N_SHARE\s*\((.+?)\s+BY\s+(.+?),\s*(\d+)\s*\)$/i.exec(trimmed);

  if (topShareMatch) {
    const aggregateExpression = topShareMatch[1].trim();
    const dimensionRef = uniqueRefs(topShareMatch[2])[0];
    const table = dimensionRef ? findTable(tables, dimensionRef.table) : null;
    const column = table && dimensionRef ? findColumn(table, dimensionRef.field) : null;
    const limit = Math.max(1, Math.min(50, Number(topShareMatch[3])));

    if (!dimensionRef || !table || !column) {
      throw new Error("TOP_N_SHARE requires a dimension field");
    }

    const groups = new Map<string, Array<Record<string, unknown>>>();

    for (const row of rows) {
      const key = String(rowFieldValue(row, column) ?? "");
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const groupValues = Array.from(groups.values())
      .map((groupRows) => Number(aggregateRows(groupRows, tables, aggregateExpression)))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left);
    const total = Number(aggregateRows(rows, tables, aggregateExpression));

    return total ? groupValues.slice(0, limit).reduce((sum, value) => sum + value, 0) / total : null;
  }

  const safeDivideMatch = /^SAFE_DIVIDE\s*\((.*)\)$/i.exec(trimmed);

  if (safeDivideMatch) {
    const [numerator, denominator] = splitTopLevel(safeDivideMatch[1]);
    const numeratorValue = Number(aggregateRows(rows, tables, numerator));
    const denominatorValue = Number(aggregateRows(rows, tables, denominator));
    return denominatorValue ? numeratorValue / denominatorValue : null;
  }

  const countDistinctMatch = /^COUNT_DISTINCT\s*\(([^)]*)\)$/i.exec(trimmed);
  if (countDistinctMatch) {
    const reference = uniqueRefs(countDistinctMatch[1])[0];
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (!reference || !table || !column) {
      throw new Error("COUNT_DISTINCT requires a field");
    }

    return new Set(rows.map((row) => String(rowFieldValue(row, column) ?? ""))).size;
  }

  const countDistinctIfMatch = /^COUNT_DISTINCT_IF\s*\((.*)\)$/i.exec(trimmed);
  if (countDistinctIfMatch) {
    const [fieldExpression, conditionExpression] = splitTopLevel(countDistinctIfMatch[1]);
    const reference = fieldExpression ? uniqueRefs(fieldExpression)[0] : null;
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (!fieldExpression || !conditionExpression || !reference || !table || !column) {
      throw new Error("COUNT_DISTINCT_IF requires a field and condition");
    }

    return new Set(rows
      .filter((row) => conditionValue(row, tables, conditionExpression))
      .map((row) => String(rowFieldValue(row, column) ?? ""))
      .filter(Boolean)).size;
  }

  const countIfMatch = /^COUNT_IF\s*\((.*)\)$/i.exec(trimmed);
  if (countIfMatch) {
    return rows.filter((row) => conditionValue(row, tables, countIfMatch[1])).length;
  }

  const countNonEmptyMatch = /^COUNT_NON_EMPTY\s*\((.*)\)$/i.exec(trimmed);
  if (countNonEmptyMatch) {
    const reference = uniqueRefs(countNonEmptyMatch[1])[0];
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (!reference || !table || !column) {
      throw new Error("COUNT_NON_EMPTY requires a field");
    }

    return rows.filter((row) => !isBlankishValue(rowFieldValue(row, column))).length;
  }

  const medianMatch = /^MEDIAN\s*\((.*)\)$/i.exec(trimmed);
  if (medianMatch) {
    const values = rows.flatMap((row) => {
      const value = fieldExpressionValue(row, tables, medianMatch[1].trim());
      return value == null ? [] : [value];
    }).sort((left, right) => left - right);

    return percentile(values, 0.5);
  }

  const percentileMatch = /^PERCENTILE\s*\((.*)\)$/i.exec(trimmed);
  if (percentileMatch) {
    const [fieldExpression, ratioExpression] = splitTopLevel(percentileMatch[1]);
    const ratio = Number(ratioExpression);

    if (!fieldExpression || !Number.isFinite(ratio)) {
      throw new Error("PERCENTILE requires a field and numeric ratio");
    }

    const values = rows.flatMap((row) => {
      const value = fieldExpressionValue(row, tables, fieldExpression);
      return value == null ? [] : [value];
    }).sort((left, right) => left - right);

    return percentile(values, ratio);
  }

  const aggregateMatch = /^(SUM|AVG|MIN|MAX|STDDEV|COUNT)\s*\((.*)\)$/i.exec(trimmed);
  if (!aggregateMatch) {
    const additiveExpression = splitTopLevelOperator(trimmed, ["+", "-"]);
    if (additiveExpression) {
      const left = Number(aggregateRows(rows, tables, additiveExpression.left));
      const right = Number(aggregateRows(rows, tables, additiveExpression.right));
      return additiveExpression.operator === "+" ? left + right : left - right;
    }

    const multiplicativeExpression = splitTopLevelOperator(trimmed, ["*", "/"]);
    if (multiplicativeExpression) {
      const left = Number(aggregateRows(rows, tables, multiplicativeExpression.left));
      const right = Number(aggregateRows(rows, tables, multiplicativeExpression.right));

      if (multiplicativeExpression.operator === "/") {
        return right ? left / right : null;
      }

      return left * right;
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    return null;
  }

  const fn = aggregateMatch[1].toUpperCase();
  const inner = aggregateMatch[2].trim();

  if (fn === "COUNT" && inner === "*") {
    return rows.length;
  }

  const values = rows.flatMap((row) => {
    if (fn === "COUNT") {
      const reference = uniqueRefs(inner)[0];
      const table = reference ? findTable(tables, reference.table) : null;
      const column = table && reference ? findColumn(table, reference.field) : null;
      const value = column ? rowFieldValue(row, column) : undefined;
      if (column && isRatingColumn(column)) {
        return cleanMetricNumber(parseNumber(value), column) == null ? [] : [1];
      }
      return isBlankishValue(value) ? [] : [1];
    }

    const value = fieldExpressionValue(row, tables, inner);
    return value == null ? [] : [value];
  });

  if (fn === "COUNT") return values.length;
  if (values.length === 0) return null;
  if (fn === "SUM") return values.reduce((sum, value) => sum + value, 0);
  if (fn === "AVG") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (fn === "MIN") return Math.min(...values);
  if (fn === "MAX") return Math.max(...values);
  if (fn === "STDDEV") {
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  return null;
}

function sentimentRateParts(formula: string) {
  const match = /^SAFE_DIVIDE\s*\(\s*(COUNT_IF\s*\(.+?\))\s*,\s*(COUNT_NON_EMPTY\s*\(.+?\))\s*\)$/i.exec(formula.trim());

  if (!match || !/sentiment/i.test(formula)) {
    return null;
  }

  return {
    numerator: match[1],
    denominator: match[2]
  };
}

async function computeCsvMetricResult(
  context: MetricResultContext,
  metric: MetricDefinition,
  computedAt: string
): Promise<MetricResultValue> {
  const sourceTable = sourceTableForFormula(context.tables, metric.formula);
  const rows = await rowsForCsvTable(context, sourceTable);
  const byMatch = /^(.+?)\s+BY\s+(.+)$/i.exec(metric.formula.trim());

  if (/^TOP_N_SHARE\s*\(/i.test(metric.formula.trim())) {
    return {
      metricId: metric.id,
      metricName: metric.name,
      ...metricLineage(metric),
      formula: metric.formula,
      status: "computed",
      scope: metricScope(metric),
      value: aggregateRows(rows, context.tables, metric.formula),
      computedAt
    };
  }

  if (byMatch) {
    const dimensionRef = uniqueRefs(byMatch[2])[0];
    const table = dimensionRef ? findTable(context.tables, dimensionRef.table) : null;
    const column = table && dimensionRef ? findColumn(table, dimensionRef.field) : null;

    if (!dimensionRef || !table || !column) {
      throw new Error("BY metric requires a dimension field");
    }

    const groups = new Map<string, Array<Record<string, unknown>>>();

    for (const row of rows) {
      const key = String(rowFieldValue(row, column) ?? "");
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const rateParts = sentimentRateParts(byMatch[1].trim());

    return {
      metricId: metric.id,
      metricName: metric.name,
      ...metricLineage(metric),
      formula: metric.formula,
      status: "computed",
      scope: metricScope(metric, true),
      rows: Array.from(groups.entries())
        .map(([dimension, groupRows]) => ({
          dimension,
          value: aggregateRows(groupRows, context.tables, byMatch[1].trim()),
          ...(rateParts
            ? {
                sampleSize: Number(aggregateRows(groupRows, context.tables, rateParts.denominator)) || 0,
                negativeCount: /negative/i.test(rateParts.numerator)
                  ? Number(aggregateRows(groupRows, context.tables, rateParts.numerator)) || 0
                  : undefined
              }
            : {})
        }))
        .sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0))
        .slice(0, 10),
      computedAt
    };
  }

  return {
    metricId: metric.id,
    metricName: metric.name,
    ...metricLineage(metric),
    formula: metric.formula,
    status: "computed",
    scope: metricScope(metric),
    value: aggregateRows(rows, context.tables, metric.formula),
    computedAt
  };
}

function isMetricAllowed(metric: Pick<MetricDefinition, "status" | "lineageJson">) {
  const validation = validationFromLineage(metric.lineageJson);

  return metric.status === MetricStatus.AI_READY && validation?.validation_status === "valid";
}

export async function computeMetricResults({
  dataSource,
  metrics,
  tables
}: {
  dataSource: DataSourceConnection;
  metrics: MetricDefinition[];
  tables: SchemaTable[];
}): Promise<MetricResultValue[]> {
  const config = configFromSource(dataSource);
  const computedAt = new Date().toISOString();

  if (!config || dataSource.status !== ConnectionStatus.CONNECTED) {
    return metrics.map((metric) => ({
      metricId: metric.id,
      metricName: metric.name,
      ...metricLineage(metric),
      formula: metric.formula,
      status: "skipped",
      scope: metricScope(metric),
      error: "No connected database source is available for metric execution",
      computedAt
    }));
  }

  const results: MetricResultValue[] = [];

  for (const metric of metrics) {
    if (!isMetricAllowed(metric)) {
      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "skipped",
        scope: metricScope(metric),
        error: "Metric is not valid for result execution",
        computedAt
      });
      continue;
    }

    try {
      const query = buildMetricSql(config.type, tables, metric);
      const rows = await queryMetric(config, query.sql);

      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "computed",
        scope: metricScope(metric, Boolean(query.grouped)),
        sql: query.sql,
        value: query.grouped ? undefined : rows[0]?.metric_value as number | string | null,
        rows: query.grouped
          ? rows.map((row) => ({
            dimension: String(row.dimension_value ?? ""),
            value: row.metric_value as number | string | null
          }))
          : undefined,
        computedAt
      });
    } catch (error) {
      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "failed",
        scope: metricScope(metric),
        error: error instanceof Error ? error.message : "Metric execution failed",
        computedAt
      });
    }
  }

  return results;
}

export async function computeMetricResultsForContexts({
  contexts,
  metrics
}: {
  contexts: MetricResultContext[];
  metrics: MetricDefinition[];
}): Promise<MetricResultValue[]> {
  const computedAt = new Date().toISOString();
  const results: MetricResultValue[] = [];

  for (const metric of metrics) {
    if (!isMetricAllowed(metric)) {
      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "skipped",
        scope: metricScope(metric),
        error: "Metric is not valid for result execution",
        computedAt
      });
      continue;
    }

    const context = contextForMetric(contexts, metric);

    if (!context) {
      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "failed",
        scope: metricScope(metric),
        error: "No matching data source was found for this metric",
        computedAt
      });
      continue;
    }

    try {
      if (sourceType(context.dataSource)) {
        const [result] = await computeMetricResults({
          dataSource: context.dataSource,
          metrics: [metric],
          tables: context.tables
        });
        results.push(result);
      } else if (context.dataSource.type === DataSourceType.CSV || context.dataSource.type === DataSourceType.EXCEL) {
        results.push(await computeCsvMetricResult(context, metric, computedAt));
      } else {
        results.push({
          metricId: metric.id,
          metricName: metric.name,
          ...metricLineage(metric),
          formula: metric.formula,
          status: "skipped",
          scope: metricScope(metric),
          error: "This data source type is not supported by the Metric Result Engine yet",
          computedAt
        });
      }
    } catch (error) {
      results.push({
        metricId: metric.id,
        metricName: metric.name,
        ...metricLineage(metric),
        formula: metric.formula,
        status: "failed",
        scope: metricScope(metric),
        error: error instanceof Error ? error.message : "Metric execution failed",
        computedAt
      });
    }
  }

  return results;
}
