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
      return jsonError("Database type must be mysql or postgresql");
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
      message: "Connection verified",
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
