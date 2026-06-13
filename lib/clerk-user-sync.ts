import { auth, clerkClient } from "@clerk/nextjs/server";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureReportEntitlement } from "@/lib/report-entitlements";
import { workspaceInviteCookieName } from "@/lib/workspace-invite-links";

function createWorkspaceSlug(clerkUserId: string) {
  return `workspace-${clerkUserId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase()}`;
}

function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();

  return value || null;
}

function createPlaceholderEmail(clerkUserId: string) {
  const stableId = clerkUserId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return `clerk_${stableId}@no-email.local`;
}

function uniqueEmails(...emails: Array<string | null>) {
  return Array.from(new Set(emails.filter((email): email is string => Boolean(email))));
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

  const clerkEmail = normalizeEmail(
    clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress
  );
  const fallbackEmail = normalizeEmail(options.fallbackEmail);
  const email = clerkEmail ?? fallbackEmail ?? createPlaceholderEmail(clerkUser.id);

  const name = clerkUser.fullName ?? clerkUser.username ?? clerkEmail?.split("@")[0] ?? "New user";
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

  const cookieStore = await cookies().catch(() => null);
  const preferredWorkspaceId = cookieStore?.get(workspaceInviteCookieName)?.value ?? null;
  const existingMembership = (
    preferredWorkspaceId
      ? user.memberships.find(
        (membership) =>
          membership.status === WorkspaceMemberStatus.ACTIVE &&
          membership.workspaceId === preferredWorkspaceId
      )
      : null
  ) ?? user.memberships.find(
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

  const inviteEmails = uniqueEmails(clerkEmail, fallbackEmail);
  const pendingInvite = inviteEmails.length
    ? await prisma.workspaceMember.findFirst({
      where: {
        invitedEmail: { in: inviteEmails },
        status: WorkspaceMemberStatus.INVITED,
        userId: null
      },
      include: {
        workspace: true
      },
      orderBy: {
        createdAt: "asc"
      }
    })
    : null;

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
