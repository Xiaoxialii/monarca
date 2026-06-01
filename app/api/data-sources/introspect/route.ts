import { ConnectionStatus, DataSourceType, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import mariadb from "mariadb";
import { Client as PostgresClient } from "pg";
import { prisma } from "@/lib/prisma";
import { buildSemanticLayer } from "@/lib/semantic-layer";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { generateWorkspaceMetricsFromConnectedSources } from "@/lib/workspace-metric-generation";
import { assertSafeDatabaseHost } from "@/lib/database-host-safety";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

type DatabaseType = "mysql" | "postgresql";

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  mysql: 3306,
  postgresql: 5432
};

type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey: boolean;
};

type TableInfo = {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
};

function normalizeDatabaseType(value: unknown): DatabaseType | null {
  if (value === "mysql") return "mysql";
  if (value === "postgresql") return "postgresql";
  return null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function parseBooleanEnv(value: string) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseDatabaseUrl(value: string) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(":", "");
    const type: DatabaseType | null =
      protocol === "mysql" || protocol === "mariadb"
        ? "mysql"
        : protocol === "postgresql" || protocol === "postgres"
          ? "postgresql"
          : null;

    if (!type) return null;

    return {
      type,
      host: url.hostname,
      port: url.port ? Number(url.port) : DEFAULT_PORTS[type],
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password)
    };
  } catch {
    return null;
  }
}

function getDatabaseUrlPreset(type: DatabaseType) {
  const parsed = parseDatabaseUrl(firstEnv("DATABASE_URL"));
  return parsed?.type === type ? parsed : null;
}

function resolvePort(type: DatabaseType, payloadPort: unknown, presetPort?: number) {
  const payloadPortNumber = Number(payloadPort);
  const envPort = Number(
    type === "mysql"
      ? firstEnv("MYSQL_PORT", "PRESET_MYSQL_PORT")
      : firstEnv("POSTGRESQL_PORT", "POSTGRES_PORT", "PGPORT", "PRESET_POSTGRESQL_PORT")
  );

  if (Number.isInteger(payloadPortNumber) && payloadPortNumber > 0) return payloadPortNumber;
  if (Number.isInteger(envPort) && envPort > 0) return envPort;
  if (typeof presetPort === "number" && Number.isInteger(presetPort) && presetPort > 0) return presetPort;
  return DEFAULT_PORTS[type];
}

function resolveDatabaseConfig(type: DatabaseType, payload: Record<string, unknown> | null) {
  const payloadHost = typeof payload?.host === "string" ? payload.host.trim() : "";
  const payloadDatabase = typeof payload?.database === "string" ? payload.database.trim() : "";
  const payloadUsername = typeof payload?.username === "string" ? payload.username.trim() : "";
  const payloadPassword = typeof payload?.password === "string" ? payload.password : "";
  const databaseUrlPreset = getDatabaseUrlPreset(type);

  if (type === "mysql") {
    return {
      type,
      host: payloadHost || firstEnv("MYSQL_HOST", "PRESET_MYSQL_HOST") || databaseUrlPreset?.host || "127.0.0.1",
      port: resolvePort(type, payload?.port, databaseUrlPreset?.port),
      database: payloadDatabase || firstEnv("MYSQL_DATABASE", "MYSQL_DB", "PRESET_MYSQL_DATABASE") || databaseUrlPreset?.database || "",
      username: payloadUsername || firstEnv("MYSQL_USER", "MYSQL_USERNAME", "PRESET_MYSQL_USER") || databaseUrlPreset?.username || "",
      password: payloadPassword || firstEnv("MYSQL_PASSWORD", "PRESET_MYSQL_PASSWORD") || databaseUrlPreset?.password || "",
      ssl: Boolean(payload?.ssl) || parseBooleanEnv(firstEnv("MYSQL_SSL", "PRESET_MYSQL_SSL"))
    };
  }

  return {
    type,
    host: payloadHost || firstEnv("POSTGRESQL_HOST", "POSTGRES_HOST", "PGHOST", "PRESET_POSTGRESQL_HOST") || databaseUrlPreset?.host || "127.0.0.1",
    port: resolvePort(type, payload?.port, databaseUrlPreset?.port),
    database: payloadDatabase || firstEnv("POSTGRESQL_DATABASE", "POSTGRES_DATABASE", "PGDATABASE", "PRESET_POSTGRESQL_DATABASE") || databaseUrlPreset?.database || "",
    username: payloadUsername || firstEnv("POSTGRESQL_USER", "POSTGRES_USER", "PGUSER", "PRESET_POSTGRESQL_USER") || databaseUrlPreset?.username || "",
    password: payloadPassword || firstEnv("POSTGRESQL_PASSWORD", "POSTGRES_PASSWORD", "PGPASSWORD", "PRESET_POSTGRESQL_PASSWORD") || databaseUrlPreset?.password || "",
    ssl: Boolean(payload?.ssl) || parseBooleanEnv(firstEnv("POSTGRESQL_SSL", "POSTGRES_SSL", "PRESET_POSTGRESQL_SSL"))
  };
}

async function introspectMysql(config: ReturnType<typeof resolveDatabaseConfig>) {
  await assertSafeDatabaseHost(config.host);

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
    const rows = await connection.query(
      `SELECT c.table_name AS tableName,
              c.column_name AS columnName,
              c.column_type AS columnType,
              c.is_nullable AS isNullable,
              c.column_key AS columnKey,
              k.referenced_table_name AS referencedTableName
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage k
           ON c.table_schema = k.table_schema
          AND c.table_name = k.table_name
          AND c.column_name = k.column_name
        WHERE c.table_schema = ?
        ORDER BY c.table_name, c.ordinal_position
        LIMIT 1000`,
      [config.database]
    ) as Array<Record<string, string | null>>;

    return rowsToTables(rows.map((row) => ({
      table: String(row.tableName),
      column: String(row.columnName),
      type: String(row.columnType),
      nullable: row.isNullable === "YES",
      primaryKey: row.columnKey === "PRI",
      foreignKey: Boolean(row.referencedTableName)
    })));
  } finally {
    await connection.end();
  }
}

async function introspectPostgres(config: ReturnType<typeof resolveDatabaseConfig>) {
  await assertSafeDatabaseHost(config.host);

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
    const result = await client.query(
      `SELECT c.table_schema AS "schemaName",
              c.table_name AS "tableName",
              c.column_name AS "columnName",
              c.data_type AS "columnType",
              c.is_nullable AS "isNullable",
              CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS "primaryKey",
              CASE WHEN fk.constraint_type = 'FOREIGN KEY' THEN true ELSE false END AS "foreignKey"
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage kcu
           ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
         LEFT JOIN information_schema.table_constraints tc
           ON kcu.constraint_schema = tc.constraint_schema
          AND kcu.constraint_name = tc.constraint_name
          AND tc.constraint_type = 'PRIMARY KEY'
         LEFT JOIN information_schema.table_constraints fk
           ON kcu.constraint_schema = fk.constraint_schema
          AND kcu.constraint_name = fk.constraint_name
          AND fk.constraint_type = 'FOREIGN KEY'
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT 1000`
    );

    return rowsToTables(result.rows.map((row) => ({
      schema: String(row.schemaName),
      table: String(row.tableName),
      column: String(row.columnName),
      type: String(row.columnType),
      nullable: row.isNullable === "YES",
      primaryKey: Boolean(row.primaryKey),
      foreignKey: Boolean(row.foreignKey)
    })));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function rowsToTables(rows: Array<{ schema?: string; table: string; column: string; type: string; nullable: boolean; primaryKey: boolean; foreignKey: boolean; }>): TableInfo[] {
  const tables = new Map<string, TableInfo>();

  for (const row of rows) {
    const key = row.schema ? `${row.schema}.${row.table}` : row.table;
    const table = tables.get(key) ?? { name: row.table, schema: row.schema, columns: [] };
    table.columns.push({
      name: row.column,
      type: row.type,
      nullable: row.nullable,
      primaryKey: row.primaryKey,
      foreignKey: row.foreignKey
    });
    tables.set(key, table);
  }

  return [...tables.values()];
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const type = normalizeDatabaseType(payload?.type);

    if (!type) {
      return jsonError("Database type must be mysql or postgresql");
    }

    const config = resolveDatabaseConfig(type, payload);

    if (!config.host || !config.database || !config.username) {
      return jsonError("Database preset is incomplete. Configure host, database, and username on the server.");
    }

    const tables = type === "mysql" ? await introspectMysql(config) : await introspectPostgres(config);
    const semanticLayer = buildSemanticLayer(tables);
    const schemaPayload = {
      type,
      database: config.database,
      host: config.host,
      port: config.port,
      tableCount: tables.length,
      tables,
      semanticLayer
    };

    const dataSource = await prisma.dataSourceConnection.create({
      data: {
        workspaceId: session.workspace.id,
        type: type === "mysql" ? DataSourceType.MYSQL : DataSourceType.POSTGRESQL,
        name: `${type === "mysql" ? "MySQL" : "PostgreSQL"} · ${config.database}`,
        provider: type,
        status: ConnectionStatus.CONNECTED,
        connectionMode: "server-preset",
        authMethod: "database",
        config: {
          host: config.host,
          port: config.port,
          database: config.database,
          ssl: config.ssl
        },
        schemas: schemaPayload,
        connectedAt: new Date(),
        lastSyncAt: new Date()
      }
    });

    const lastSnapshot = await prisma.schemaSnapshot.findFirst({
      where: { workspaceId: session.workspace.id },
      orderBy: { version: "desc" },
      select: { version: true }
    });

    await prisma.schemaSnapshot.create({
      data: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id,
        version: (lastSnapshot?.version ?? 0) + 1,
        status: ConnectionStatus.CONNECTED,
        schemaJson: schemaPayload,
        qualityReport: {
          tableCount: tables.length,
          columnCount: tables.reduce((total, table) => total + table.columns.length, 0),
          semanticFieldCount: semanticLayer.fields.length,
          businessEntityCount: semanticLayer.entities.length,
          generatedMetricCount: semanticLayer.metrics.length,
          generatedAt: new Date().toISOString()
        }
      }
    });

    await generateWorkspaceMetricsFromConnectedSources(prisma, {
      workspaceId: session.workspace.id,
      userId: session.user.id
    });

    return NextResponse.json({
      ok: true,
      message: "Schema scanned",
      dataSourceId: dataSource.id,
      schema: schemaPayload,
      semanticLayer
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return apiErrorResponse(error, "Schema scan failed");
  }
}
