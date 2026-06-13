export type SupportedDatabaseType = "postgresql" | "mysql";

export type ResolvedDatabaseConfig = {
  type: SupportedDatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

const DEFAULT_PORTS: Record<SupportedDatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306
};

type ParsedDatabaseUrl = Partial<Omit<ResolvedDatabaseConfig, "type" | "ssl">> & {
  type: SupportedDatabaseType;
};

export function normalizeDatabaseType(value: unknown): SupportedDatabaseType | null {
  if (value === "postgresql") {
    return "postgresql";
  }

  if (value === "mysql") {
    return "mysql";
  }

  return null;
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];

    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseBooleanEnv(value: string) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseDatabaseUrl(value: string): ParsedDatabaseUrl | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(":", "");
    const type =
      protocol === "postgresql" || protocol === "postgres"
        ? "postgresql"
        : protocol === "mysql" || protocol === "mysql2"
          ? "mysql"
          : null;

    if (!type) {
      return null;
    }

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

function getDatabaseUrlPreset(type: SupportedDatabaseType) {
  const parsed = parseDatabaseUrl(firstEnv(
    type === "mysql" ? "MYSQL_DATABASE_URL" : "POSTGRESQL_DATABASE_URL",
    type === "mysql" ? "PRESET_MYSQL_DATABASE_URL" : "PRESET_POSTGRESQL_DATABASE_URL",
    "DATABASE_URL"
  ));

  if (parsed?.type === type) {
    return parsed;
  }

  return null;
}

function resolvePort(type: SupportedDatabaseType, payloadPort: unknown, presetPort?: number) {
  const payloadPortNumber = Number(payloadPort);
  const envPort = Number(type === "mysql"
    ? firstEnv("MYSQL_PORT", "PRESET_MYSQL_PORT")
    : firstEnv("POSTGRESQL_PORT", "POSTGRES_PORT", "PGPORT", "PRESET_POSTGRESQL_PORT"));

  if (Number.isInteger(payloadPortNumber) && payloadPortNumber > 0) {
    return payloadPortNumber;
  }

  if (Number.isInteger(envPort) && envPort > 0) {
    return envPort;
  }

  if (typeof presetPort === "number" && Number.isInteger(presetPort) && presetPort > 0) {
    return presetPort;
  }

  return DEFAULT_PORTS[type];
}

function envKeys(type: SupportedDatabaseType, field: "host" | "database" | "username" | "password" | "ssl") {
  if (type === "mysql") {
    return {
      host: ["MYSQL_HOST", "PRESET_MYSQL_HOST"],
      database: ["MYSQL_DATABASE", "PRESET_MYSQL_DATABASE"],
      username: ["MYSQL_USER", "MYSQL_USERNAME", "PRESET_MYSQL_USER"],
      password: ["MYSQL_PASSWORD", "PRESET_MYSQL_PASSWORD"],
      ssl: ["MYSQL_SSL", "PRESET_MYSQL_SSL"]
    }[field];
  }

  return {
    host: ["POSTGRESQL_HOST", "POSTGRES_HOST", "PGHOST", "PRESET_POSTGRESQL_HOST"],
    database: ["POSTGRESQL_DATABASE", "POSTGRES_DATABASE", "PGDATABASE", "PRESET_POSTGRESQL_DATABASE"],
    username: ["POSTGRESQL_USER", "POSTGRES_USER", "PGUSER", "PRESET_POSTGRESQL_USER"],
    password: ["POSTGRESQL_PASSWORD", "POSTGRES_PASSWORD", "PGPASSWORD", "PRESET_POSTGRESQL_PASSWORD"],
    ssl: ["POSTGRESQL_SSL", "POSTGRES_SSL", "PRESET_POSTGRESQL_SSL"]
  }[field];
}

export function resolveDatabaseConfig(
  type: SupportedDatabaseType,
  payload: Record<string, unknown> | null
): ResolvedDatabaseConfig {
  const payloadHost = typeof payload?.host === "string" ? payload.host.trim() : "";
  const payloadDatabase = typeof payload?.database === "string" ? payload.database.trim() : "";
  const payloadUsername = typeof payload?.username === "string" ? payload.username.trim() : "";
  const payloadPassword = typeof payload?.password === "string" ? payload.password : "";
  const databaseUrlPreset = getDatabaseUrlPreset(type);

  return {
    type,
    host:
      payloadHost ||
      firstEnv(...envKeys(type, "host")) ||
      databaseUrlPreset?.host ||
      "127.0.0.1",
    port: resolvePort(type, payload?.port, databaseUrlPreset?.port),
    database:
      payloadDatabase ||
      firstEnv(...envKeys(type, "database")) ||
      databaseUrlPreset?.database ||
      "",
    username:
      payloadUsername ||
      firstEnv(...envKeys(type, "username")) ||
      databaseUrlPreset?.username ||
      "",
    password:
      payloadPassword ||
      firstEnv(...envKeys(type, "password")) ||
      databaseUrlPreset?.password ||
      "",
    ssl: Boolean(payload?.ssl) || parseBooleanEnv(firstEnv(...envKeys(type, "ssl")))
  };
}

export function publicDatabaseConfig(config: ResolvedDatabaseConfig) {
  return {
    type: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.ssl
  };
}
