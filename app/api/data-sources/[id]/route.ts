import { NextResponse } from "next/server";
import { ConnectionStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;

    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id,
        isActive: true
      },
      select: {
        id: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    await prisma.dataSourceConnection.update({
      where: {
        id: dataSource.id
      },
      data: {
        isActive: false,
        status: ConnectionStatus.DISCONNECTED
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to remove data source");
  }
}
