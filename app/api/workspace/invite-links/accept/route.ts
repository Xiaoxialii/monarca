import { auth, clerkClient } from "@clerk/nextjs/server";
import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureReportEntitlement } from "@/lib/report-entitlements";
import { hashWorkspaceInviteToken, workspaceInviteCookieName } from "@/lib/workspace-invite-links";

export const runtime = "nodejs";

function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();
  return value || null;
}

function createPlaceholderEmail(clerkUserId: string) {
  const stableId = clerkUserId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `clerk_${stableId}@no-email.local`;
}

async function upsertCurrentUser(clerkUserId: string) {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const clerkEmail = normalizeEmail(
    clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress
  );
  const email = clerkEmail ?? createPlaceholderEmail(clerkUser.id);
  const name = clerkUser.fullName ?? clerkUser.username ?? clerkEmail?.split("@")[0] ?? "New user";

  return prisma.user.upsert({
    where: { clerkUserId: clerkUser.id },
    update: {
      email,
      name,
      avatarUrl: clerkUser.imageUrl || null
    },
    create: {
      clerkUserId: clerkUser.id,
      email,
      name,
      avatarUrl: clerkUser.imageUrl || null
    }
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { token?: string } | null;
  const token = typeof payload?.token === "string" ? payload.token.trim() : "";

  if (!token) {
    return NextResponse.json({ ok: false, message: "Invite token is required." }, { status: 400 });
  }

  const invite = await prisma.workspaceInviteLink.findUnique({
    where: { tokenHash: hashWorkspaceInviteToken(token) },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!invite || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, message: "This invite link is invalid or expired." }, { status: 404 });
  }

  const user = await upsertCurrentUser(userId);
  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: invite.workspaceId,
        userId: user.id
      }
    }
  });
  const membership = existing
    ? await prisma.workspaceMember.update({
        where: { id: existing.id },
        data: {
          status: WorkspaceMemberStatus.ACTIVE,
          role: existing.role === WorkspaceRole.OWNER || existing.role === WorkspaceRole.ADMIN
            ? existing.role
            : WorkspaceRole.VIEWER,
          invitedEmail: null,
          joinedAt: existing.joinedAt ?? new Date()
        }
      })
    : await prisma.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: WorkspaceRole.VIEWER,
          status: WorkspaceMemberStatus.ACTIVE,
          joinedAt: new Date()
        }
      });

  await ensureReportEntitlement(invite.workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(workspaceInviteCookieName, invite.workspaceId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30
  });

  return NextResponse.json({
    ok: true,
    workspace: invite.workspace,
    role: membership.role.toLowerCase()
  });
}
