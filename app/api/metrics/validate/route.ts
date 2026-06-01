import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tablesFromSchemaJson, validateWorkspaceMetrics } from "@/lib/metric-validation";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

export async function POST() {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        version: "desc"
      }
    });

    if (!latestSnapshot) {
      return NextResponse.json({ ok: false, message: "No schema snapshot found" }, { status: 404 });
    }

    const results = await validateWorkspaceMetrics(prisma, {
      workspaceId: session.workspace.id,
      tables: tablesFromSchemaJson(latestSnapshot.schemaJson)
    });

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to validate metrics");
  }
}
