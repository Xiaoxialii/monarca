import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["NEW", "CONTACTED", "QUALIFIED", "CLOSED", "ARCHIVED"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    const { id } = await params;
    const payload = await request.json().catch(() => null);
    const status = payload && typeof payload === "object"
      ? String((payload as { status?: unknown }).status ?? "").trim().toUpperCase()
      : "";

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status." },
        { status: 400 }
      );
    }

    const requestRecord = await prisma.consultingRequest.update({
      where: { id },
      data: { status }
    });

    return NextResponse.json({ success: true, request: requestRecord });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      { success: false, message: "Failed to update consulting request." },
      { status: 500 }
    );
  }
}
