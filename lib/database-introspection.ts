import { createHash } from "node:crypto";
import { Client as PostgresClient } from "pg";
import mysql from "mysql2/promise";
import type { SupportedDatabaseType } from "@/lib/database-connection-config";
import { assertSafeDatabaseHost } from "@/lib/database-host-safety";

export type DatabaseConnectionInput = {
  type: SupportedDatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

export type IntrospectedColumn = {
  name: string;
  type: string;
  dataType?: string;
  columnType?: string;
  semanticType?: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isUnique?: boolean;
  defaultValue?: string | null;
  ordinalPosition?: number;
};

export type IntrospectedTable = {
  name: string;
  schema?: string;
  rowCount?: number;
  columns: IntrospectedColumn[];
};

export type DataSourceTableStat = {
  tableName: string;
  rowCount: number | null;
  minDate: Date | null;
  maxDate: Date | null;
  dateField: string | null;
  schemaHash: string;
};

const CONNECTION_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 15000;
const MAX_TABLES = 200;
const MAX_COLUMNS = 2000;

function postgresqlClient(input: DatabaseConnectionInput) {
  return new PostgresClient({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.username,
    password: input.password,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: 15_000,
    ssl: input.ssl ? { rejectUnauthorized: false } : undefined
  });
}

async function mysqlConnection(input: DatabaseConnectionInput) {
  return mysql.createConnection({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.username,
    password: input.password,
    connectTimeout: CONNECTION_TIMEOUT_MS,
    ssl: input.ssl ? {} : undefined,
    multipleStatements: false
  });
}

export async function testDatabaseConnection(input: DatabaseConnectionInput) {
  await assertSafeDatabaseHost(input.host);

  if (input.type === "mysql") {
    const connection = await mysqlConnection(input);
    try {
      await connection.query("SELECT 1 AS ok");
    } finally {
      await connection.end().catch(() => undefined);
    }
    return;
  }

  const client = postgresqlClient(input);
  try {
    await client.connect();
    await client.query("SELECT 1 AS ok");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function introspectDatabase(input: DatabaseConnectionInput): Promise<IntrospectedTable[]> {
  await assertSafeDatabaseHost(input.host);

  return input.type === "mysql"
    ? introspectMysql(input)
    : introspectPostgresql(input);
}

export async function getDataSourceStats(
  input: DatabaseConnectionInput,
  tables: IntrospectedTable[]
): Promise<DataSourceTableStat[]> {
  await assertSafeDatabaseHost(input.host);

  const limitedTables = tables.slice(0, MAX_TABLES);

  if (input.type === "mysql") {
    const connection = await mysqlConnection(input);
    try {
      return Promise.all(limitedTables.map((table) => mysqlTableStats(connection, table)));
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  const client = postgresqlClient(input);
  try {
    await client.connect();
    return Promise.all(limitedTables.map((table) => postgresqlTableStats(client, table)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function getLatestDataDate(
  input: DatabaseConnectionInput,
  table: IntrospectedTable,
  dateField: string
) {
  await assertSafeDatabaseHost(input.host);

  if (input.type === "mysql") {
    const connection = await mysqlConnection(input);
    try {
      const [rows] = await connection.execute(
        `SELECT MAX(${mysqlIdentifier(dateField)}) AS latestDataDate FROM ${mysqlTableIdentifier(table)} WHERE ${mysqlIdentifier(dateField)} IS NOT NULL`
      );
      return dateValue((rows as Array<{ latestDataDate?: unknown }>)[0]?.latestDataDate);
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  const client = postgresqlClient(input);
  try {
    await client.connect();
    const result = await client.query(
      `SELECT MAX(${postgresqlIdentifier(dateField)}) AS "latestDataDate" FROM ${postgresqlTableIdentifier(table)} WHERE ${postgresqlIdentifier(dateField)} IS NOT NULL`
    );
    return dateValue(result.rows[0]?.latestDataDate);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function schemaHash(table: IntrospectedTable) {
  return createHash("sha256")
    .update(JSON.stringify({
      name: table.name,
      schema: table.schema,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        primary: column.isPrimaryKey,
        unique: column.isUnique
      }))
    }))
    .digest("hex");
}

function dateValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function semanticType(name: string, type: string) {
  const normalizedName = name.toLowerCase();
  const normalizedType = type.toLowerCase();

  if (["date", "datetime", "timestamp", "time", "year"].some((keyword) => normalizedType.includes(keyword))) {
    return "date";
  }

  if (normalizedType.includes("tinyint(1)") || ["boolean", "bool"].some((keyword) => normalizedType.includes(keyword))) {
    return "boolean";
  }

  if (["amount", "price", "revenue", "gmv", "sales", "paid", "cost", "order_amount", "gross_sales"].some((keyword) => normalizedName.includes(keyword))) {
    return "currency";
  }

  if (["int", "bigint", "smallint", "tinyint", "mediumint", "decimal", "numeric", "float", "double", "real"].some((keyword) => normalizedType.includes(keyword))) {
    return "number";
  }

  return "text";
}

async function introspectMysql(input: DatabaseConnectionInput) {
  const connection = await mysqlConnection(input);

  try {
    const [tableRows] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
       AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME
       LIMIT ${MAX_TABLES}`,
      timeout: QUERY_TIMEOUT_MS
    }, [input.database]);
    const [columnRows] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION
       LIMIT ${MAX_COLUMNS}`,
      timeout: QUERY_TIMEOUT_MS
    }, [input.database]);
    const [indexRows] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
        LIMIT ${MAX_COLUMNS}`,
      timeout: QUERY_TIMEOUT_MS
    }, [input.database]).catch(() => [[], []] as unknown as [mysql.RowDataPacket[], unknown]);

    const indexes = indexMap(indexRows.map((row) => ({
      tableName: String(row.TABLE_NAME),
      indexName: String(row.INDEX_NAME),
      columnName: String(row.COLUMN_NAME),
      nonUnique: Number(row.NON_UNIQUE)
    })));
    const tables = new Map<string, IntrospectedTable>();

    for (const row of tableRows) {
      tables.set(String(row.TABLE_NAME), {
        name: String(row.TABLE_NAME),
        schema: input.database,
        rowCount: Number.isFinite(Number(row.TABLE_ROWS)) ? Number(row.TABLE_ROWS) : undefined,
        columns: []
      });
    }

    for (const row of columnRows) {
      const table = tables.get(String(row.TABLE_NAME));
      if (!table) continue;
      const columnName = String(row.COLUMN_NAME);
      const columnType = String(row.COLUMN_TYPE ?? row.DATA_TYPE);
      const index = indexes.get(`${row.TABLE_NAME}.${columnName}`);

      table.columns.push({
        name: columnName,
        type: columnType,
        dataType: String(row.DATA_TYPE),
        columnType,
        semanticType: semanticType(columnName, columnType),
        nullable: row.IS_NULLABLE === "YES",
        isPrimaryKey: row.COLUMN_KEY === "PRI",
        isForeignKey: false,
        isUnique: row.COLUMN_KEY === "UNI" || Boolean(index?.unique),
        defaultValue: row.COLUMN_DEFAULT == null ? null : String(row.COLUMN_DEFAULT),
        ordinalPosition: Number(row.ORDINAL_POSITION)
      });
    }

    return Array.from(tables.values()).filter((table) => table.columns.length > 0);
  } catch (error) {
    await connection.end().catch(() => undefined);

    try {
      return await introspectMysqlWithShow(input);
    } catch (fallbackError) {
      const primaryMessage = error instanceof Error ? error.message : "unknown error";
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "unknown error";

      throw new Error(`MySQL schema introspection failed: ${primaryMessage}; SHOW fallback failed: ${fallbackMessage}`);
    }
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function introspectMysqlWithShow(input: DatabaseConnectionInput) {
  const connection = await mysqlConnection(input);

  try {
    const [tableRows] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SHOW FULL TABLES FROM ${mysqlIdentifier(input.database)} WHERE Table_type = 'BASE TABLE'`,
      timeout: QUERY_TIMEOUT_MS
    });
    const tableNames = tableRows
      .map((row) => Object.entries(row).find(([key]) => key.startsWith("Tables_in_"))?.[1])
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .slice(0, MAX_TABLES);
    const tables: IntrospectedTable[] = [];

    for (const tableName of tableNames) {
      const [columnRows] = await connection.query<mysql.RowDataPacket[]>({
        sql: `SHOW FULL COLUMNS FROM ${mysqlIdentifier(tableName)} FROM ${mysqlIdentifier(input.database)}`,
        timeout: QUERY_TIMEOUT_MS
      });

      tables.push({
        name: tableName,
        schema: input.database,
        columns: columnRows.map((row, index) => {
          const columnName = String(row.Field ?? "");
          const columnType = String(row.Type ?? "unknown");
          const key = String(row.Key ?? "");

          return {
            name: columnName,
            type: columnType,
            dataType: columnType.split("(")[0] || columnType,
            columnType,
            semanticType: semanticType(columnName, columnType),
            nullable: row.Null === "YES",
            isPrimaryKey: key === "PRI",
            isForeignKey: false,
            isUnique: key === "UNI",
            defaultValue: row.Default == null ? null : String(row.Default),
            ordinalPosition: index + 1
          };
        }).filter((column) => column.name.length > 0)
      });
    }

    return tables.filter((table) => table.columns.length > 0);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function introspectPostgresql(input: DatabaseConnectionInput) {
  const client = postgresqlClient(input);

  try {
    await client.connect();
    const tableResult = await client.query<{
      table_schema: string;
      table_name: string;
    }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name
       LIMIT ${MAX_TABLES}`
    );
    const columnResult = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      ordinal_position: number;
    }>(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name, ordinal_position
       LIMIT ${MAX_COLUMNS}`
    );
    const keyResult = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      constraint_type: string;
    }>(
      `SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_type
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')`
    );
    const keys = keyMap(keyResult.rows.map((row) => ({
      tableSchema: row.table_schema,
      tableName: row.table_name,
      columnName: row.column_name,
      type: row.constraint_type
    })));
    const tables = new Map<string, IntrospectedTable>();

    for (const row of tableResult.rows) {
      tables.set(`${row.table_schema}.${row.table_name}`, {
        name: row.table_name,
        schema: row.table_schema,
        columns: []
      });
    }

    for (const row of columnResult.rows) {
      const table = tables.get(`${row.table_schema}.${row.table_name}`);
      if (!table) continue;
      const key = keys.get(`${row.table_schema}.${row.table_name}.${row.column_name}`);

      table.columns.push({
        name: row.column_name,
        type: row.data_type,
        dataType: row.data_type,
        semanticType: semanticType(row.column_name, row.data_type),
        nullable: row.is_nullable === "YES",
        isPrimaryKey: Boolean(key?.primary),
        isForeignKey: Boolean(key?.foreign),
        isUnique: Boolean(key?.unique),
        defaultValue: row.column_default,
        ordinalPosition: row.ordinal_position
      });
    }

    return Array.from(tables.values()).filter((table) => table.columns.length > 0);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function indexMap(rows: Array<{ tableName: string; indexName: string; columnName: string; nonUnique: number }>) {
  const map = new Map<string, { unique: boolean }>();

  for (const row of rows) {
    map.set(`${row.tableName}.${row.columnName}`, {
      unique: row.indexName === "PRIMARY" || row.nonUnique === 0
    });
  }

  return map;
}

function keyMap(rows: Array<{ tableSchema: string; tableName: string; columnName: string; type: string }>) {
  const map = new Map<string, { primary?: boolean; unique?: boolean; foreign?: boolean }>();

  for (const row of rows) {
    const key = `${row.tableSchema}.${row.tableName}.${row.columnName}`;
    const value = map.get(key) ?? {};

    if (row.type === "PRIMARY KEY") value.primary = true;
    if (row.type === "UNIQUE") value.unique = true;
    if (row.type === "FOREIGN KEY") value.foreign = true;
    map.set(key, value);
  }

  return map;
}

function assertIdentifier(value: string) {
  if (!value || value.includes("\0")) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
}

function mysqlIdentifier(value: string) {
  assertIdentifier(value);
  return `\`${value.replace(/`/g, "``")}\``;
}

function mysqlTableIdentifier(table: IntrospectedTable) {
  return [table.schema, table.name].filter(Boolean).map((part) => mysqlIdentifier(String(part))).join(".");
}

function postgresqlIdentifier(value: string) {
  assertIdentifier(value);
  return `"${value}"`;
}

function postgresqlTableIdentifier(table: IntrospectedTable) {
  return [table.schema, table.name].filter(Boolean).map((part) => postgresqlIdentifier(String(part))).join(".");
}

function likelyDateField(table: IntrospectedTable) {
  const explicit = table.columns.find((column) => column.semanticType === "date");
  if (explicit) return explicit.name;

  return table.columns.find((column) => /date|time|created|updated/i.test(column.name))?.name ?? null;
}

async function mysqlTableStats(connection: mysql.Connection, table: IntrospectedTable): Promise<DataSourceTableStat> {
  const dateField = likelyDateField(table);
  const rowCountSql = `COUNT(*) AS rowCount`;
  const dateSql = dateField
    ? `, MIN(${mysqlIdentifier(dateField)}) AS minDate, MAX(${mysqlIdentifier(dateField)}) AS maxDate`
    : "";
  const [rows] = await connection.query(
    `SELECT ${rowCountSql}${dateSql} FROM ${mysqlTableIdentifier(table)}`
  );
  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};

  return {
    tableName: table.schema ? `${table.schema}.${table.name}` : table.name,
    rowCount: Number.isFinite(Number(row.rowCount)) ? Number(row.rowCount) : table.rowCount ?? null,
    minDate: dateValue(row.minDate),
    maxDate: dateValue(row.maxDate),
    dateField,
    schemaHash: schemaHash(table)
  };
}

async function postgresqlTableStats(client: PostgresClient, table: IntrospectedTable): Promise<DataSourceTableStat> {
  const dateField = likelyDateField(table);
  const rowCountSql = `COUNT(*) AS "rowCount"`;
  const dateSql = dateField
    ? `, MIN(${postgresqlIdentifier(dateField)}) AS "minDate", MAX(${postgresqlIdentifier(dateField)}) AS "maxDate"`
    : "";
  const result = await client.query(
    `SELECT ${rowCountSql}${dateSql} FROM ${postgresqlTableIdentifier(table)}`
  );
  const row = result.rows[0] ?? {};

  return {
    tableName: table.schema ? `${table.schema}.${table.name}` : table.name,
    rowCount: Number.isFinite(Number(row.rowCount)) ? Number(row.rowCount) : table.rowCount ?? null,
    minDate: dateValue(row.minDate),
    maxDate: dateValue(row.maxDate),
    dateField,
    schemaHash: schemaHash(table)
  };
}
