import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";
import {
  mapDbStatusToTeamStatus,
  canChangeRole,
  mapDbRoleToTeamRole,
  mapTeamRoleToDbRole,
  parseTeamRole
} from "@/lib/workspace-members";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const payload = await request.json().catch(() => null);
  const requestedRole = typeof payload?.role === "string" ? payload.role : "";
  const nextRole = parseTeamRole(requestedRole);

  if (!nextRole) {
    return NextResponse.json(
      {
        error: "Invalid request",
        message: "role must be owner, admin, or viewer"
      },
      { status: 400 }
    );
  }

  const actorRole = session.membership.role;
  const newDbRole = mapTeamRoleToDbRole(nextRole);

  if (!canChangeRole(actorRole, target.role, newDbRole)) {
    return NextResponse.json(
      {
        error: "No permission",
        message: "You do not have permission to update this member role"
      },
      { status: 403 }
    );
  }

  if (target.userId === session.user.id && target.role !== newDbRole) {
    return NextResponse.json(
      {
        error: "Invalid action",
        message: "You cannot modify your own role"
      },
      { status: 400 }
    );
  }

  if (target.role === newDbRole) {
    return NextResponse.json({
      updated: {
        id: target.id,
        userId: target.userId,
        name: target.user?.name ?? null,
        email: target.user?.email ?? target.invitedEmail ?? "",
        role: mapDbRoleToTeamRole(target.role),
        status: mapDbStatusToTeamStatus(target.status),
        joinedAt: (target.joinedAt ?? target.createdAt).toISOString()
      }
    });
  }

  if (target.status === WorkspaceMemberStatus.REMOVED) {
    return NextResponse.json(
      {
        error: "Invalid action",
        message: "Removed members cannot be updated"
      },
      { status: 409 }
    );
  }

  if (target.role === WorkspaceRole.OWNER && nextRole !== "owner") {
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
      role: newDbRole
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
    updated: {
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
