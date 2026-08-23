import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPLICATION_STATUS_OPTIONS } from "@/lib/partnership-applications";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(APPLICATION_STATUS_OPTIONS.map((item) => item.value));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const { id } = await params;
    const payload = await request.json().catch(() => null);
    const status = payload && typeof payload === "object"
      ? String((payload as { status?: unknown }).status ?? "").trim().toUpperCase()
      : "";

    if (!allowedStatuses.has(status as never)) {
      return NextResponse.json(
        { success: false, message: "Invalid application status." },
        { status: 400 }
      );
    }

    const application = await prisma.storePartnershipApplication.update({
      where: { id },
      data: { status: status as never }
    });

    return NextResponse.json({ success: true, application });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      { success: false, message: "Failed to update application status." },
      { status: 500 }
    );
  }
}
