import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import {
  normalizeDatabaseType,
  publicDatabaseConfig,
  resolveDatabaseConfig
} from "@/lib/database-connection-config";
import { testDatabaseConnection } from "@/lib/database-introspection";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const type = normalizeDatabaseType(payload?.type);

    if (!type) {
      return jsonError("UNSUPPORTED_DATABASE_TYPE: 当前暂不支持该数据库类型。");
    }

    const config = resolveDatabaseConfig(type, payload);
    const { host, database, username } = config;

    if (!host || !database || !username) {
      return jsonError(
        "Database preset is incomplete. Configure host, database, and username on the server or provide them as overrides."
      );
    }

    await testDatabaseConnection(config);

    return NextResponse.json({
      ok: true,
      success: true,
      databaseType: type,
      message: type === "mysql" ? "MySQL connection successful" : "PostgreSQL connection successful",
      database: publicDatabaseConfig(config)
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Connection failed");
  }
}
