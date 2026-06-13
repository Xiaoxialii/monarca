import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { canInviteRole } from "@/lib/workspace-members";
import {
  createWorkspaceInviteToken,
  hashWorkspaceInviteToken,
  workspaceInviteExpiresAt,
  workspaceInviteUrl
} from "@/lib/workspace-invite-links";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    if (!canInviteRole(session.membership.role, WorkspaceRole.VIEWER)) {
      return NextResponse.json(
        { ok: false, message: "You do not have permission to create viewer invite links." },
        { status: 403 }
      );
    }

    const token = createWorkspaceInviteToken();
    const inviteLink = await prisma.workspaceInviteLink.create({
      data: {
        workspaceId: session.workspace.id,
        tokenHash: hashWorkspaceInviteToken(token),
        role: WorkspaceRole.VIEWER,
        createdBy: session.user.id,
        expiresAt: workspaceInviteExpiresAt()
      },
      select: {
        id: true,
        role: true,
        expiresAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      inviteUrl: workspaceInviteUrl(request, token),
      role: inviteLink.role.toLowerCase(),
      expiresAt: inviteLink.expiresAt.toISOString()
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error("Failed to create workspace invite link", error);
    return NextResponse.json(
      { ok: false, message: "Failed to create workspace invite link." },
      { status: 500 }
    );
  }
}
