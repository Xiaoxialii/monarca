export type SupportedDatabaseType = "postgresql";

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
  postgresql: 5432
};

type ParsedDatabaseUrl = Partial<Omit<ResolvedDatabaseConfig, "type" | "ssl">> & {
  type: SupportedDatabaseType;
};

export function normalizeDatabaseType(value: unknown): SupportedDatabaseType | null {
  if (value === "postgresql") {
    return "postgresql";
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
    const type = protocol === "postgresql" || protocol === "postgres" ? "postgresql" : null;

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
  const parsed = parseDatabaseUrl(firstEnv("DATABASE_URL"));

  if (parsed?.type === type) {
    return parsed;
  }

  return null;
}

function resolvePort(type: SupportedDatabaseType, payloadPort: unknown, presetPort?: number) {
  const payloadPortNumber = Number(payloadPort);
  const envPort = Number(firstEnv("POSTGRESQL_PORT", "POSTGRES_PORT", "PGPORT", "PRESET_POSTGRESQL_PORT"));

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
      firstEnv("POSTGRESQL_HOST", "POSTGRES_HOST", "PGHOST", "PRESET_POSTGRESQL_HOST") ||
      databaseUrlPreset?.host ||
      "127.0.0.1",
    port: resolvePort(type, payload?.port, databaseUrlPreset?.port),
    database:
      payloadDatabase ||
      firstEnv("POSTGRESQL_DATABASE", "POSTGRES_DATABASE", "PGDATABASE", "PRESET_POSTGRESQL_DATABASE") ||
      databaseUrlPreset?.database ||
      "",
    username:
      payloadUsername ||
      firstEnv("POSTGRESQL_USER", "POSTGRES_USER", "PGUSER", "PRESET_POSTGRESQL_USER") ||
      databaseUrlPreset?.username ||
      "",
    password:
      payloadPassword ||
      firstEnv("POSTGRESQL_PASSWORD", "POSTGRES_PASSWORD", "PGPASSWORD", "PRESET_POSTGRESQL_PASSWORD") ||
      databaseUrlPreset?.password ||
      "",
    ssl: Boolean(payload?.ssl) || parseBooleanEnv(firstEnv("POSTGRESQL_SSL", "POSTGRES_SSL", "PRESET_POSTGRESQL_SSL"))
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
