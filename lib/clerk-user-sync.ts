import { auth, clerkClient } from "@clerk/nextjs/server";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function createWorkspaceSlug(clerkUserId: string) {
  return `workspace-${clerkUserId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase()}`;
}

export async function syncCurrentClerkUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);

  const email = clerkUser.emailAddresses.find(
    (item) => item.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("Signed-in Clerk user does not have an email address.");
  }

  const name = clerkUser.fullName ?? clerkUser.username ?? email.split("@")[0] ?? "New user";
  const avatarUrl = clerkUser.imageUrl || null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { clerkUserId: clerkUser.id },
      update: {
        email,
        name,
        avatarUrl
      },
      create: {
        clerkUserId: clerkUser.id,
        email,
        name,
        avatarUrl
      },
      include: {
        memberships: {
          include: {
            workspace: true
          },
          orderBy: [
            { status: "asc" },
            { joinedAt: "asc" },
            { createdAt: "asc" }
          ]
        }
      }
    });

    const existingMembership = user.memberships.find(
      (membership) => membership.status === WorkspaceMemberStatus.ACTIVE
    ) ?? user.memberships[0];

    if (existingMembership) {
      return {
        user,
        workspace: existingMembership.workspace,
        membership: existingMembership
      };
    }

    const pendingInvite = await tx.workspaceMember.findFirst({
      where: {
        invitedEmail: email,
        status: WorkspaceMemberStatus.INVITED,
        userId: null
      },
      include: {
        workspace: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (pendingInvite) {
      const membership = await tx.workspaceMember.update({
        where: { id: pendingInvite.id },
        data: {
          userId: user.id,
          invitedEmail: null,
          status: WorkspaceMemberStatus.ACTIVE,
          joinedAt: new Date()
        }
      });

      return {
        user,
        workspace: pendingInvite.workspace,
        membership
      };
    }

    const workspace = await tx.workspace.create({
      data: {
        name: `${name}'s Workspace`,
        slug: createWorkspaceSlug(clerkUser.id),
        ownerId: user.id
      }
    });

    const membership = await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceRole.OWNER,
        status: WorkspaceMemberStatus.ACTIVE,
        joinedAt: new Date()
      }
    });

    return {
      user,
      workspace,
      membership
    };
  });
}
