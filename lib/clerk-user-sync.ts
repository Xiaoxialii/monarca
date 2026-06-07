import { auth, clerkClient } from "@clerk/nextjs/server";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureReportEntitlement } from "@/lib/report-entitlements";

function createWorkspaceSlug(clerkUserId: string) {
  return `workspace-${clerkUserId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase()}`;
}

export async function syncCurrentClerkUser(options: { fallbackEmail?: string } = {}) {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return syncClerkUserById(userId, options);
}

export async function syncClerkUserById(
  clerkUserId: string,
  options: { fallbackEmail?: string } = {}
) {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);

  const email = clerkUser.emailAddresses.find(
    (item) => item.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? options.fallbackEmail?.trim().toLowerCase();

  if (!email) {
    throw new Error("SIGNED_IN_USER_EMAIL_REQUIRED");
  }

  const name = clerkUser.fullName ?? clerkUser.username ?? email.split("@")[0] ?? "New user";
  const avatarUrl = clerkUser.imageUrl || null;

  const user = await prisma.user.upsert({
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
    await ensureReportEntitlement(existingMembership.workspace.id);

    return {
      user,
      workspace: existingMembership.workspace,
      membership: existingMembership
    };
  }

  const pendingInvite = await prisma.workspaceMember.findFirst({
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
    const membership = await prisma.workspaceMember.update({
      where: { id: pendingInvite.id },
      data: {
        userId: user.id,
        invitedEmail: null,
        status: WorkspaceMemberStatus.ACTIVE,
        joinedAt: new Date()
      }
    });
    await ensureReportEntitlement(pendingInvite.workspace.id);

    return {
      user,
      workspace: pendingInvite.workspace,
      membership
    };
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: `${name}'s Workspace`,
      slug: createWorkspaceSlug(clerkUser.id),
      ownerId: user.id
    }
  });

  const membership = await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
      status: WorkspaceMemberStatus.ACTIVE,
      joinedAt: new Date()
    }
  });
  await ensureReportEntitlement(workspace.id);

  return {
    user,
    workspace,
    membership
  };
}
