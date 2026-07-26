import { WorkspaceMemberStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function findActiveWorkspaceMembershipForUser(userId: string) {
  return prisma.workspaceMember.findFirst({
    where: {
      userId,
      status: WorkspaceMemberStatus.ACTIVE
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function findBlockingPendingInviteForEmail(email: string, workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: {
      invitedEmail: email,
      status: WorkspaceMemberStatus.INVITED,
      workspaceId: {
        not: workspaceId
      }
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export function singleWorkspaceViolationPayload(workspaceName?: string | null) {
  return {
    error: "User already belongs to a workspace",
    code: "USER_ALREADY_HAS_WORKSPACE",
    message: workspaceName
      ? `This user already belongs to ${workspaceName}. A user can only belong to one workspace.`
      : "This user already belongs to a workspace. A user can only belong to one workspace."
  };
}
