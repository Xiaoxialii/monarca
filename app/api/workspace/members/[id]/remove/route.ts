import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";
import { canRemoveMember, mapDbRoleToTeamRole, mapDbStatusToTeamStatus } from "@/lib/workspace-members";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = await prisma.workspaceMember.findUnique({
    where: {
      id
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!target || target.workspaceId !== session.workspace.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const actorRole = session.membership.role;

  if (!canRemoveMember(actorRole, target.role)) {
    return NextResponse.json(
      {
        error: "No permission",
        message: "You do not have permission to remove this member"
      },
      { status: 403 }
    );
  }

  if (target.userId === session.user.id) {
    return NextResponse.json(
      {
        error: "Invalid action",
        message: "You cannot remove yourself from the workspace here"
      },
      { status: 400 }
    );
  }

  if (target.status === WorkspaceMemberStatus.REMOVED) {
    return NextResponse.json(
      {
        removed: {
          id: target.id,
          userId: target.userId,
          name: target.user?.name ?? null,
          email: target.user?.email ?? target.invitedEmail ?? "",
          role: mapDbRoleToTeamRole(target.role),
          status: mapDbStatusToTeamStatus(target.status),
          joinedAt: (target.joinedAt ?? target.createdAt).toISOString()
        }
      },
      { status: 200 }
    );
  }

  if (target.role === WorkspaceRole.OWNER) {
    const ownerCount = await prisma.workspaceMember.count({
      where: {
        workspaceId: session.workspace.id,
        role: target.role,
        status: WorkspaceMemberStatus.ACTIVE
      }
    });

    if (ownerCount <= 1) {
      return NextResponse.json(
        {
          error: "Last owner",
          message: "At least one owner is required"
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.workspaceMember.update({
    where: {
      id
    },
    data: {
      status: WorkspaceMemberStatus.REMOVED
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return NextResponse.json({
    removed: {
      id: updated.id,
      userId: updated.userId,
      name: updated.user?.name ?? null,
      email: updated.user?.email ?? updated.invitedEmail ?? "",
      role: mapDbRoleToTeamRole(updated.role),
      status: mapDbStatusToTeamStatus(updated.status),
      joinedAt: (updated.joinedAt ?? updated.createdAt).toISOString()
    }
  });
}
