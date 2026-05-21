import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { prisma } from "@/lib/prisma";
import {
  canInviteAndManage,
  canInviteRole,
  mapDbStatusToTeamStatus,
  mapDbRoleToTeamRole,
  mapTeamRoleToDbRole,
  parseTeamRole
} from "@/lib/workspace-members";
import { WorkspaceMemberStatus } from "@prisma/client";

async function sendClerkInvitationEmail(request: Request, email: string, workspaceId: string, role: string) {
  const client = await clerkClient();
  const existingInvitations = await client.invitations.getInvitationList({
    query: email,
    status: "pending",
    limit: 10
  });

  await Promise.all(
    existingInvitations.data
      .filter((invitation) => invitation.emailAddress.toLowerCase() === email)
      .map((invitation) => client.invitations.revokeInvitation(invitation.id).catch(() => null))
  );

  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    notify: true,
    redirectUrl: new URL("/sign-up", request.url).toString(),
    publicMetadata: {
      workspaceId,
      role
    }
  });

  return invitation.url ?? null;
}

export async function GET() {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: session.workspace.id
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }]
  });

  return NextResponse.json({
    currentUserId: session.user.id,
    currentUserRole: mapDbRoleToTeamRole(session.membership.role),
    canInvite: canInviteRole(session.membership.role),
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user?.name ?? null,
      email: member.user?.email ?? member.invitedEmail ?? "",
      role: mapDbRoleToTeamRole(member.role),
      status: mapDbStatusToTeamStatus(member.status),
      joinedAt: (member.joinedAt ?? member.createdAt).toISOString()
    }))
  });
}

export async function POST(request: Request) {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canInviteAndManage(session.membership.role)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const email =
    typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const requestedRole = typeof payload?.role === "string" ? payload.role : "";
  const role = parseTeamRole(requestedRole);

  if (!email || !role) {
    return NextResponse.json(
      {
        error: "Invalid request",
        message: "email and role (owner/admin/viewer) are required"
      },
      { status: 400 }
    );
  }

  const dbRole = mapTeamRoleToDbRole(role);

  if (!canInviteRole(session.membership.role, dbRole)) {
    return NextResponse.json(
      {
        error: "No permission",
        message: "You do not have permission to invite this role"
      },
      { status: 403 }
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email
    }
  });

  if (!user) {
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_invitedEmail: {
          workspaceId: session.workspace.id,
          invitedEmail: email
        }
      }
    });

    if (existing && existing.status !== WorkspaceMemberStatus.REMOVED) {
      let inviteUrl: string | null = null;

      try {
        inviteUrl = await sendClerkInvitationEmail(request, email, session.workspace.id, role);
      } catch (error) {
        console.error("Failed to resend Clerk invitation email", error);

        return NextResponse.json(
          {
            error: "Invitation email failed",
            message: "This email is already pending, but Clerk could not resend the invitation email. Please check Clerk email/invitation settings."
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        member: {
          id: existing.id,
          userId: existing.userId,
          name: null,
          email,
          role: mapDbRoleToTeamRole(existing.role),
          status: mapDbStatusToTeamStatus(existing.status),
          joinedAt: existing.createdAt.toISOString()
        },
        resent: true,
        inviteUrl
      });
    }

    const created = existing
      ? await prisma.workspaceMember.update({
          where: { id: existing.id },
          data: {
            status: WorkspaceMemberStatus.INVITED,
            role: dbRole,
            invitedBy: session.user.id,
            invitedEmail: email,
            userId: null,
            joinedAt: null
          }
        })
      : await prisma.workspaceMember.create({
          data: {
            workspaceId: session.workspace.id,
            userId: null,
            invitedEmail: email,
            status: WorkspaceMemberStatus.INVITED,
            invitedBy: session.user.id,
            role: dbRole,
            joinedAt: null
          }
        });

    let inviteUrl: string | null = null;

    try {
      inviteUrl = await sendClerkInvitationEmail(request, email, session.workspace.id, role);
    } catch (error) {
      await prisma.workspaceMember.delete({
        where: { id: created.id }
      }).catch(() => null);

      console.error("Failed to send Clerk invitation email", error);

      return NextResponse.json(
        {
          error: "Invitation email failed",
          message: "The member was not invited because Clerk could not send the invitation email. Please check Clerk email/invitation settings."
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      member: {
        id: created.id,
        userId: created.userId,
        name: null,
        email: email,
        role: mapDbRoleToTeamRole(created.role),
        status: mapDbStatusToTeamStatus(created.status),
        joinedAt: created.createdAt.toISOString()
      },
      inviteUrl
    });
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: session.workspace.id,
        userId: user.id
      }
    }
  });

  if (existing) {
    if (existing.status === WorkspaceMemberStatus.REMOVED) {
      const updated = await prisma.workspaceMember.update({
        where: { id: existing.id },
        data: {
          status: WorkspaceMemberStatus.ACTIVE,
          role: dbRole,
          invitedEmail: null,
          invitedBy: session.user.id,
          joinedAt: new Date()
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
        member: {
          id: updated.id,
          userId: updated.userId,
          name: updated.user?.name ?? null,
          email: updated.user?.email ?? "",
          role: mapDbRoleToTeamRole(updated.role),
          status: mapDbStatusToTeamStatus(updated.status),
          joinedAt: (updated.joinedAt ?? updated.createdAt).toISOString()
        }
      });
    }

    return NextResponse.json(
      {
        error: "Already invited",
        message: "This user has already joined the workspace"
      },
      { status: 409 }
    );
  }

  const pendingInvite = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_invitedEmail: {
        workspaceId: session.workspace.id,
        invitedEmail: email
      }
    }
  });

  if (pendingInvite) {
    const promoted = await prisma.workspaceMember.update({
      where: { id: pendingInvite.id },
      data: {
        status: WorkspaceMemberStatus.ACTIVE,
        role: dbRole,
        userId: user.id,
        invitedBy: session.user.id,
        invitedEmail: null,
        joinedAt: new Date()
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
      member: {
        id: promoted.id,
        userId: promoted.userId,
        name: promoted.user?.name ?? null,
        email: promoted.user?.email ?? "",
        role: mapDbRoleToTeamRole(promoted.role),
        status: mapDbStatusToTeamStatus(promoted.status),
        joinedAt: (promoted.joinedAt ?? promoted.createdAt).toISOString()
      }
    });
  }

  const created = await prisma.workspaceMember.create({
    data: {
      workspaceId: session.workspace.id,
      userId: user.id,
      status: WorkspaceMemberStatus.ACTIVE,
      invitedBy: session.user.id,
      role: dbRole,
      joinedAt: new Date()
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
    member: {
      id: created.id,
      userId: created.userId,
      name: created.user?.name ?? null,
      email: created.user?.email ?? "",
      role: mapDbRoleToTeamRole(created.role),
      status: mapDbStatusToTeamStatus(created.status),
      joinedAt: (created.joinedAt ?? created.createdAt).toISOString()
    }
  });
}
