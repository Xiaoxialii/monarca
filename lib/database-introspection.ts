import mariadb from "mariadb";
import { Client as PostgresClient } from "pg";
import type { SupportedDatabaseType } from "@/lib/database-connection-config";

export type DatabaseConnectionInput = {
  type: SupportedDatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

export type IntrospectedTable = {
  name: string;
  schema?: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
};

export async function testDatabaseConnection(input: DatabaseConnectionInput) {
  if (input.type === "mysql") {
    const connection = await mariadb.createConnection({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.username,
      password: input.password,
      connectTimeout: 5000,
      allowPublicKeyRetrieval: true,
      ssl: input.ssl ? { rejectUnauthorized: false } : undefined
    });

    try {
      await connection.query("SELECT 1 AS ok");
    } finally {
      await connection.end();
    }
  }

  if (input.type === "postgresql") {
    const client = new PostgresClient({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.username,
      password: input.password,
      connectionTimeoutMillis: 5000,
      ssl: input.ssl ? { rejectUnauthorized: false } : undefined
    });

    try {
      await client.connect();
      await client.query("SELECT 1 AS ok");
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

export async function introspectDatabase(input: DatabaseConnectionInput): Promise<IntrospectedTable[]> {
  if (input.type === "mysql") {
    const connection = await mariadb.createConnection({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.username,
      password: input.password,
      connectTimeout: 5000,
      allowPublicKeyRetrieval: true,
      ssl: input.ssl ? { rejectUnauthorized: false } : undefined
    });

    try {
      const rows = (await connection.query(
        `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION
         LIMIT 500`,
        [input.database]
      )) as Array<{
        tableName: string;
        columnName: string;
        dataType: string;
        isNullable: string;
      }>;

      return groupColumns(rows.map((row) => ({
        tableName: row.tableName,
        columnName: row.columnName,
        dataType: row.dataType,
        nullable: row.isNullable === "YES"
      })));
    } finally {
      await connection.end();
    }
  }

  const client = new PostgresClient({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.username,
    password: input.password,
    connectionTimeoutMillis: 5000,
    ssl: input.ssl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    const result = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name, ordinal_position
       LIMIT 500`
    );

    return groupColumns(result.rows.map((row) => ({
      schema: row.table_schema,
      tableName: row.table_name,
      columnName: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES"
    })));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function groupColumns(
  rows: Array<{
    schema?: string;
    tableName: string;
    columnName: string;
    dataType: string;
    nullable: boolean;
  }>
): IntrospectedTable[] {
  const byTable = new Map<string, IntrospectedTable>();

  for (const row of rows) {
    const key = `${row.schema ?? ""}.${row.tableName}`;
    const table = byTable.get(key) ?? {
      name: row.tableName,
      schema: row.schema,
      columns: []
    };

    table.columns.push({
      name: row.columnName,
      type: row.dataType,
      nullable: row.nullable
    });
    byTable.set(key, table);
  }

  return Array.from(byTable.values());
}
