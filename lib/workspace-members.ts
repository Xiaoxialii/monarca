import { WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client";

export type TeamRole = "owner" | "admin" | "viewer";
export type TeamStatus = "active" | "invited" | "removed";
export function mapDbStatusToTeamStatus(status: WorkspaceMemberStatus): TeamStatus {
  if (status === WorkspaceMemberStatus.INVITED) {
    return "invited";
  }

  if (status === WorkspaceMemberStatus.REMOVED) {
    return "removed";
  }

  return "active";
}

export function mapDbRoleToTeamRole(role: WorkspaceRole): TeamRole {
  if (role === WorkspaceRole.OWNER) {
    return "owner";
  }

  if (role === WorkspaceRole.ADMIN) {
    return "admin";
  }

  return "viewer";
}

export function mapTeamRoleToDbRole(role: TeamRole): WorkspaceRole {
  if (role === "owner") {
    return WorkspaceRole.OWNER;
  }

  if (role === "admin") {
    return WorkspaceRole.ADMIN;
  }

  return WorkspaceRole.VIEWER;
}

export function parseTeamRole(value: string): TeamRole | null {
  if (value === "owner" || value === "admin" || value === "viewer") {
    return value;
  }

  return null;
}

export function canInviteAndManage(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export function canChangeRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole, nextRole: WorkspaceRole): boolean {
  if (!canInviteAndManage(actorRole)) {
    return false;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return targetRole === WorkspaceRole.VIEWER && nextRole === WorkspaceRole.VIEWER;
  }

  return true;
}

export function canRemoveMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (!canInviteAndManage(actorRole)) {
    return false;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return targetRole === WorkspaceRole.VIEWER;
  }

  return actorRole === WorkspaceRole.OWNER;
}

export function canInviteRole(actorRole: WorkspaceRole, invitedRole?: WorkspaceRole): boolean {
  if (actorRole === WorkspaceRole.OWNER) {
    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return invitedRole ? invitedRole === WorkspaceRole.VIEWER : true;
  }

  return false;
}

export function canEditRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  targetUserId: string,
  actorUserId: string
): boolean {
  if (targetUserId === actorUserId) {
    return false;
  }

  if (!canInviteAndManage(actorRole)) {
    return false;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return targetRole === WorkspaceRole.VIEWER;
  }

  return actorRole === WorkspaceRole.OWNER;
}

export function getAssignableRoleOptions(actorRole: WorkspaceRole, targetRole: WorkspaceRole, isSelf: boolean): TeamRole[] {
  if (isSelf) {
    return [];
  }

  if (actorRole === WorkspaceRole.OWNER) {
    if (targetRole === WorkspaceRole.OWNER) {
      return ["owner", "admin", "viewer"];
    }

    return ["owner", "admin", "viewer"];
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    if (targetRole === WorkspaceRole.OWNER) {
      return [];
    }

    return ["viewer"];
  }

  return [];
}
