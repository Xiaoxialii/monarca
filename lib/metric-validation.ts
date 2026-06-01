import {
  MetricStatus,
  type MetricDefinition,
  type Prisma,
  type PrismaClient
} from "@prisma/client";

export type ValidationStatus = "valid" | "warning" | "invalid" | "needs_review" | "execution_failed";

export type SchemaColumn = {
  name: string;
  type?: string | null;
  nullable?: boolean | null;
};

export type SchemaTable = {
  name: string;
  schema?: string | null;
  columns: SchemaColumn[];
};

export type MetricValidationResult = {
  validation_status: ValidationStatus;
  validation_errors: string[];
  validation_warnings: string[];
  suggested_metric_name?: string;
  suggested_formula?: string;
  suggested_source_table?: string;
  confidence_score: number;
  execution_sql?: string;
};

type ValidationMetric = Pick<
  MetricDefinition,
  "id" | "name" | "category" | "definition" | "formula" | "mappingJson" | "lineageJson"
>;

type ValidationTransaction = Prisma.TransactionClient | PrismaClient;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function tablesFromSchemaJson(schemaJson: unknown): SchemaTable[] {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema?.tables) ? schema.tables : [];

  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const name = typeof tableRecord?.name === "string" ? tableRecord.name : "";

    if (!name) {
      return [];
    }

    const columns = Array.isArray(tableRecord?.columns) ? tableRecord.columns : [];

    return [{
      name,
      schema: typeof tableRecord?.schema === "string" ? tableRecord.schema : null,
      columns: columns.flatMap((column) => {
        const columnRecord = asRecord(column);
        const columnName = typeof columnRecord?.name === "string" ? columnRecord.name : "";

        if (!columnName) {
          return [];
        }

        return [{
          name: columnName,
          type: typeof columnRecord?.type === "string" ? columnRecord.type : null,
          nullable: typeof columnRecord?.nullable === "boolean" ? columnRecord.nullable : null
        }];
      })
    }];
  });
}

function tableLabel(table: SchemaTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function findTable(tables: SchemaTable[], tableName: string) {
  const normalized = normalize(tableName);
  return tables.find((table) =>
    normalize(table.name) === normalized || normalize(tableLabel(table)) === normalized
  );
}

function findColumn(table: SchemaTable, fieldName: string) {
  const normalized = normalize(fieldName);
  return table.columns.find((column) => normalize(column.name) === normalized);
}

function isNumericColumn(column: SchemaColumn) {
  const type = (column.type ?? "").toLowerCase();
  const name = normalize(column.name);

  return (
    ["int", "decimal", "double", "float", "number", "numeric", "real"].some((keyword) => type.includes(keyword)) ||
    [
      "amount",
      "score",
      "polarity",
      "subjectivity",
      "rating",
      "price",
      "cost",
      "revenue",
      "income",
      "mrr",
      "arr",
      "installs",
      "reviews",
      "volume",
      "open",
      "high",
      "low",
      "close",
      "adj_close",
      "count"
    ].some((keyword) => name.includes(keyword))
  );
}

function isTextColumn(column: SchemaColumn) {
  const type = (column.type ?? "").toLowerCase();
  const name = normalize(column.name);

  return (
    ["char", "text", "string", "varchar"].some((keyword) => type.includes(keyword)) ||
    ["review", "comment", "feedback", "description", "text", "message"].some((keyword) => name.includes(keyword))
  );
}

function isDimensionColumn(column: SchemaColumn) {
  const name = normalize(column.name);
  const type = (column.type ?? "").toLowerCase();

  return (
    ["char", "text", "date", "time", "enum"].some((keyword) => type.includes(keyword)) ||
    ["category", "type", "status", "sentiment", "app", "product", "country", "region", "date", "time"].some((keyword) =>
      name.includes(keyword)
    )
  );
}

function likelyEntityColumn(column: SchemaColumn) {
  const name = normalize(column.name);

  return [
    "app",
    "app_id",
    "product",
    "product_id",
    "sku",
    "item_id",
    "user_id",
    "customer_id",
    "account_id",
    "client_id",
    "order_id",
    "transaction_id",
    "invoice_id"
  ].some((keyword) => name === keyword || name.endsWith(`_${keyword}`) || name.includes(keyword));
}

function likelyEntityMetric(metric: ValidationMetric) {
  const text = normalize(`${metric.name} ${metric.category} ${metric.definition}`);

  return [
    "total_app",
    "app_count",
    "total_product",
    "product_count",
    "total_sku",
    "sku_count",
    "total_user",
    "user_count",
    "active_user",
    "total_customer",
    "customer_count",
    "active_customer",
    "total_account",
    "account_count",
    "total_order",
    "order_count"
  ].some((keyword) => text.includes(keyword));
}

function extractFieldRefs(formula: string) {
  const refs = new Map<string, { table: string; field: string }>();
  const pattern = /\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)\.([A-Za-z_][\w]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(formula)) !== null) {
    const table = match[1];
    const field = match[2];
    refs.set(`${table}.${field}`, { table, field });
  }

  return Array.from(refs.values());
}

function extractFunctionCalls(formula: string, functionName: string) {
  const pattern = new RegExp(`${functionName}\\s*\\(([^)]*)\\)`, "gi");
  const calls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(formula)) !== null) {
    calls.push(match[1].trim());
  }

  return calls;
}

function firstFieldRef(expression: string) {
  const refs = extractFieldRefs(expression);
  return refs[0] ?? null;
}

function metricUsesAnyField(metric: ValidationMetric, fields: string[]) {
  const haystack = normalize(`${metric.name} ${metric.category} ${metric.definition} ${metric.formula}`);
  return fields.some((field) => haystack.includes(normalize(field)));
}

function makeSuggestion(metric: ValidationMetric, tables: SchemaTable[]) {
  const allFields = tables.flatMap((table) =>
    table.columns.map((column) => ({ table: tableLabel(table), column }))
  );
  const metricText = normalize(`${metric.name} ${metric.category} ${metric.definition}`);
  const sentimentField = allFields.find(({ column }) => /sentiment$|sentiment_label/i.test(column.name));
  const polarityField = allFields.find(({ column }) => /sentiment_polarity|polarity/i.test(column.name));
  const subjectivityField = allFields.find(({ column }) => /sentiment_subjectivity|subjectivity/i.test(column.name));
  const ratingField = allFields.find(({ column }) => /rating|score/i.test(column.name));
  const reviewsField = allFields.find(({ column }) => /^reviews?$|review_count/i.test(column.name));
  const reviewTextField = allFields.find(({ column }) => /translated_review|review|comment|feedback/i.test(column.name));
  const appField = allFields.find(({ column }) => /^app$|product|item/i.test(column.name));

  if (metricText.includes("review") && metricText.includes("count") && reviewsField) {
    return {
      suggested_metric_name: "Review Volume",
      suggested_formula: `SUM(${reviewsField.table}.${reviewsField.column.name})`,
      suggested_source_table: reviewsField.table
    };
  }

  if (metricText.includes("review") && reviewTextField) {
    return {
      suggested_metric_name: "Review Volume",
      suggested_formula: `COUNT_NON_EMPTY(${reviewTextField.table}.${reviewTextField.column.name})`,
      suggested_source_table: reviewTextField.table
    };
  }

  if (metricText.includes("positive") && sentimentField) {
    return {
      suggested_metric_name: "Positive Sentiment Rate",
      suggested_formula: `SAFE_DIVIDE(COUNT_IF(${sentimentField.table}.${sentimentField.column.name} = 'Positive'), COUNT_NON_EMPTY(${sentimentField.table}.${sentimentField.column.name}))`,
      suggested_source_table: sentimentField.table
    };
  }

  if (metricText.includes("negative") && sentimentField) {
    return {
      suggested_metric_name: "Negative Sentiment Rate",
      suggested_formula: `SAFE_DIVIDE(COUNT_IF(${sentimentField.table}.${sentimentField.column.name} = 'Negative'), COUNT_NON_EMPTY(${sentimentField.table}.${sentimentField.column.name}))`,
      suggested_source_table: sentimentField.table
    };
  }

  if (metricText.includes("sentiment") && polarityField) {
    return {
      suggested_metric_name: "Average Sentiment Polarity",
      suggested_formula: `AVG(${polarityField.table}.${polarityField.column.name})`,
      suggested_source_table: polarityField.table
    };
  }

  if (metricText.includes("subjectivity") && subjectivityField) {
    return {
      suggested_metric_name: "Average Sentiment Subjectivity",
      suggested_formula: `AVG(${subjectivityField.table}.${subjectivityField.column.name})`,
      suggested_source_table: subjectivityField.table
    };
  }

  if ((metricText.includes("rating") || metricText.includes("score")) && ratingField) {
    return {
      suggested_metric_name: "Average Rating",
      suggested_formula: `AVG(${ratingField.table}.${ratingField.column.name})`,
      suggested_source_table: ratingField.table
    };
  }

  if (metricText.includes("by") && appField && polarityField) {
    return {
      suggested_metric_name: "Sentiment by Product",
      suggested_formula: `AVG(${polarityField.table}.${polarityField.column.name}) BY ${appField.table}.${appField.column.name}`,
      suggested_source_table: polarityField.table
    };
  }

  return {};
}

function toValidationStatus(errors: string[], warnings: string[]): ValidationStatus {
  if (errors.length > 0) return "invalid";
  if (warnings.length > 0) return "warning";
  return "valid";
}

function confidenceForStatus(status: ValidationStatus, errors: string[], warnings: string[]) {
  if (status === "invalid") return Math.max(20, 62 - errors.length * 12 - warnings.length * 4);
  if (status === "needs_review") return 58;
  if (status === "warning") return Math.max(68, 88 - warnings.length * 5);
  return 94;
}

export function validateMetricDefinition(metric: ValidationMetric, tables: SchemaTable[]): MetricValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referencedTables = new Set<string>();
  const references = extractFieldRefs(metric.formula);

  if (references.length === 0) {
    errors.push("Formula does not reference any schema field");
  }

  for (const reference of references) {
    const table = findTable(tables, reference.table);

    if (!table) {
      errors.push(`Table not found: ${reference.table}`);
      continue;
    }

    referencedTables.add(tableLabel(table));

    const column = findColumn(table, reference.field);

    if (!column) {
      errors.push(`Field not found: ${reference.table}.${reference.field}`);
    }
  }

  for (const functionName of ["SUM", "AVG", "MEDIAN", "PERCENTILE", "STDDEV", "MIN", "MAX"]) {
    for (const call of extractFunctionCalls(metric.formula, functionName)) {
      const reference = firstFieldRef(call);
      const table = reference ? findTable(tables, reference.table) : null;
      const column = table && reference ? findColumn(table, reference.field) : null;

      if (!reference || !table || !column) {
        continue;
      }

      if (!isNumericColumn(column)) {
        errors.push(`${functionName} requires a numeric field: ${reference.table}.${reference.field}`);
      }
    }
  }

  for (const call of extractFunctionCalls(metric.formula, "COUNT_IF")) {
    const reference = firstFieldRef(call);

    if (!reference) {
      errors.push("COUNT_IF requires a field condition");
      continue;
    }

    if (/=\s*target\b/i.test(call)) {
      warnings.push("COUNT_IF uses a placeholder target value; choose an explicit value before reporting");
    }
  }

  for (const call of extractFunctionCalls(metric.formula, "COUNT_DISTINCT_IF")) {
    const parts = call.split(",").map((part) => part.trim()).filter(Boolean);
    const entityReference = firstFieldRef(parts[0] ?? "");
    const conditionReference = firstFieldRef(parts.slice(1).join(","));

    if (!entityReference || !conditionReference) {
      errors.push("COUNT_DISTINCT_IF requires an entity field and a condition field");
      continue;
    }
  }

  for (const call of extractFunctionCalls(metric.formula, "COUNT_NON_EMPTY")) {
    const reference = firstFieldRef(call);
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (!reference || !table || !column) {
      errors.push("COUNT_NON_EMPTY requires a field");
      continue;
    }

    if (!isTextColumn(column)) {
      warnings.push(`COUNT_NON_EMPTY is intended for text fields: ${reference.table}.${reference.field}`);
    }
  }

  for (const call of extractFunctionCalls(metric.formula, "COUNT")) {
    const reference = firstFieldRef(call);
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (column && likelyEntityColumn(column) && likelyEntityMetric(metric)) {
      warnings.push(`Entity scale metrics should use COUNT_DISTINCT for ${reference.table}.${reference.field}`);
    }
  }

  if (/\bSAFE_DIVIDE\s*\([^,]+,\s*COUNT\s*\(\s*\*\s*\)\s*\)/i.test(metric.formula)) {
    const entityReference = references.find((reference) => {
      const table = findTable(tables, reference.table);
      const column = table ? findColumn(table, reference.field) : null;
      return Boolean(column && likelyEntityColumn(column));
    });

    if (entityReference) {
      warnings.push(`Ratio denominator may need COUNT_DISTINCT(${entityReference.table}.${entityReference.field}) instead of COUNT(*)`);
    }
  }

  const byReference = /\bBY\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?\.[A-Za-z_][\w]*)/i.exec(metric.formula);

  if (byReference) {
    const reference = firstFieldRef(byReference[1]);
    const table = reference ? findTable(tables, reference.table) : null;
    const column = table && reference ? findColumn(table, reference.field) : null;

    if (column && !isDimensionColumn(column)) {
      warnings.push(`GROUP BY/BY field should be a category or time field: ${byReference[1]}`);
    }
  }

  const metricText = normalize(`${metric.name} ${metric.category} ${metric.definition}`);

  if (
    (metricText.includes("rate") || metricText.includes("ratio") || metricText.includes("per_")) &&
    metric.formula.includes("/") &&
    !/\bSAFE_DIVIDE\s*\(/i.test(metric.formula)
  ) {
    warnings.push("Ratio metrics should use SAFE_DIVIDE so the execution logic and business formula handle zero denominators consistently");
  }

  if (metricText.includes("sentiment")) {
    const hasSentimentField = references.some((reference) =>
      /sentiment|polarity|subjectivity/i.test(reference.field)
    );

    if (!hasSentimentField) {
      errors.push("Sentiment metrics must use Sentiment, Sentiment_Polarity, or Sentiment_Subjectivity fields");
    }
  }

  if ((metricText.includes("rating") || metricText.includes("score")) && !metricUsesAnyField(metric, ["rating", "score"])) {
    warnings.push("Rating or score metrics should use Rating or Score fields");
  }

  const reviewsRef = references.find((reference) => /^reviews?$/i.test(reference.field));
  if (metricText.includes("review") && metricText.includes("count") && reviewsRef && /\bCOUNT\s*\(/i.test(metric.formula)) {
    warnings.push("Reviews is usually a numeric review count field; use SUM(Reviews) instead of COUNT(Reviews)");
  }

  const usesPriceInstallEstimate = /price\s*\*\s*installs|installs\s*\*\s*price/i.test(metric.formula);

  if (
    (metricText.includes("revenue") || metricText.includes("income")) &&
    /\bSUM\s*\([^)]*\.price\)/i.test(metric.formula) &&
    !(metricText.includes("estimated") && usesPriceInstallEstimate)
  ) {
    errors.push("Revenue/Income metrics should not use SUM(Price) unless explicitly marked as price_sum or total_list_price");
  }

  if (metricText.includes("estimated") && usesPriceInstallEstimate) {
    warnings.push("Estimated revenue formula is allowed but must remain clearly labeled as estimated");
  }

  if ((metricText.includes("positive") || metricText.includes("negative")) && metricText.includes("sentiment")) {
    const usesSentimentLabel = references.some((reference) => /^sentiment$/i.test(reference.field));
    if (!usesSentimentLabel) {
      errors.push("Positive/Negative Sentiment Rate must be based on the Sentiment field, not Category or another dimension");
    }
  }

  if (referencedTables.size > 1) {
    const tableColumns = Array.from(referencedTables).map((label) => {
      const table = findTable(tables, label);
      return new Set(table?.columns.map((column) => normalize(column.name)) ?? []);
    });
    const commonKeys = Array.from(tableColumns[0] ?? []).filter((field) =>
      tableColumns.every((columns) => columns.has(field))
    );
    const likelyJoinKeys = commonKeys.filter((field) => /id$|app|product|customer|account|user/.test(field));

    if (likelyJoinKeys.length === 0) {
      errors.push("Cross-table metric references multiple tables but no join key was found");
    } else {
      warnings.push(`Cross-table metric should explicitly join on ${likelyJoinKeys[0]}`);
    }

    const referencesReviewTable = Array.from(referencedTables).some((table) => /review|feedback/i.test(table));
    const referencesStoreTable = Array.from(referencedTables).some((table) => /googleplaystore($|_)/i.test(table));

    if (referencesReviewTable && referencesStoreTable && !likelyJoinKeys.includes("app")) {
      errors.push("Category sentiment analysis across googleplaystore tables requires an App join key");
    }
  }

  const suggestion = makeSuggestion(metric, tables);
  const status = toValidationStatus(errors, warnings);

  return {
    validation_status: status,
    validation_errors: errors,
    validation_warnings: warnings,
    ...suggestion,
    confidence_score: confidenceForStatus(status, errors, warnings),
    execution_sql: status === "valid" || status === "warning" ? metric.formula : undefined
  };
}

export function mergeValidationIntoLineage(lineageJson: unknown, validation: MetricValidationResult) {
  return {
    ...(asRecord(lineageJson) ?? {}),
    validation,
    validationUpdatedAt: new Date().toISOString()
  };
}

export function validationFromLineage(lineageJson: unknown): MetricValidationResult | null {
  const lineage = asRecord(lineageJson);
  const validation = asRecord(lineage?.validation);

  if (!validation) {
    return null;
  }

  const status = validation.validation_status;

  if (
    status !== "valid" &&
    status !== "warning" &&
    status !== "invalid" &&
    status !== "needs_review" &&
    status !== "execution_failed"
  ) {
    return null;
  }

  return {
    validation_status: status,
    validation_errors: Array.isArray(validation.validation_errors)
      ? validation.validation_errors.filter((item): item is string => typeof item === "string")
      : [],
    validation_warnings: Array.isArray(validation.validation_warnings)
      ? validation.validation_warnings.filter((item): item is string => typeof item === "string")
      : [],
    suggested_metric_name: typeof validation.suggested_metric_name === "string" ? validation.suggested_metric_name : undefined,
    suggested_formula: typeof validation.suggested_formula === "string" ? validation.suggested_formula : undefined,
    suggested_source_table: typeof validation.suggested_source_table === "string" ? validation.suggested_source_table : undefined,
    confidence_score: typeof validation.confidence_score === "number" ? validation.confidence_score : 0,
    execution_sql: typeof validation.execution_sql === "string" ? validation.execution_sql : undefined
  };
}

export function metricStatusFromValidation(validation: MetricValidationResult) {
  return validation.validation_status === "valid"
    ? MetricStatus.AI_READY
    : MetricStatus.NEEDS_VALIDATION;
}

export async function validateWorkspaceMetrics(
  tx: ValidationTransaction,
  {
    workspaceId,
    tables,
    metricIds
  }: {
    workspaceId: string;
    tables: SchemaTable[];
    metricIds?: string[];
  }
) {
  const metrics = await tx.metricDefinition.findMany({
    where: {
      workspaceId,
      isActive: true,
      ...(metricIds ? { id: { in: metricIds } } : {})
    }
  });

  const results = [];

  for (const metric of metrics) {
    const validation = validateMetricDefinition(metric, tables);

    await tx.metricDefinition.update({
      where: {
        id: metric.id
      },
      data: {
        status: metricStatusFromValidation(validation),
        lineageJson: mergeValidationIntoLineage(metric.lineageJson, validation)
      }
    });

    results.push({ metricId: metric.id, validation });
  }

  return results;
}
