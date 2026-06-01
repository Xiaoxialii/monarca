import { NextResponse } from "next/server";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isDatabaseAuthError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  return (
    code === "P1000" ||
    message.includes("authentication failed against database server") ||
    message.includes("access denied for user")
  );
}

export function isDatabaseUnavailableError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  return (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    message.includes("can't connect to mysql server on") ||
    message.includes("can't connect to mysql server") ||
    message.includes("can't connect to local mysql server") ||
    message.includes("cannot connect to database server") ||
    message.includes("server has closed the connection") ||
    message.includes("server has gone away") ||
    message.includes("lost connection") ||
    message.includes("connection refused") ||
    message.includes("connection timed out") ||
    message.includes("connect etimedout") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("pool timeout") ||
    message.includes("failed to retrieve a connection from pool")
  );
}

export function databaseUnavailableResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "DATABASE_UNAVAILABLE",
      message: "数据库暂时无法连接，请先启动本地 MySQL 后重试"
    },
    { status: 503 }
  );
}

export function databaseAuthErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "DATABASE_AUTH_FAILED",
      message: "数据库认证失败，请检查 DATABASE_URL 的用户、密码和权限"
    },
    { status: 503 }
  );
}

export function apiErrorResponse(error: unknown, fallbackMessage: string, status = 400) {
  if (isDatabaseAuthError(error)) {
    return databaseAuthErrorResponse();
  }

  if (isDatabaseUnavailableError(error)) {
    return databaseUnavailableResponse();
  }

  return NextResponse.json({ ok: false, message: fallbackMessage }, { status });
}
