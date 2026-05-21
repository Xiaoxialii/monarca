import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export class WorkspaceAuthError extends Error {
  status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "WorkspaceAuthError";
    this.status = status;
  }
}

export type WorkspaceSession = NonNullable<Awaited<ReturnType<typeof syncCurrentClerkUser>>>;

export async function requireAuth(): Promise<WorkspaceSession> {
  const session = await syncCurrentClerkUser();

  if (!session) {
    throw new WorkspaceAuthError("Unauthorized", 401);
  }

  return session;
}

export async function requireWorkspace(): Promise<WorkspaceSession> {
  return requireAuth();
}

export function getCurrentUserRole(session: WorkspaceSession): WorkspaceRole {
  return session.membership.role;
}

export function hasWorkspaceRole(role: WorkspaceRole, allowedRoles: WorkspaceRole[]): boolean {
  return allowedRoles.includes(role);
}

export async function requireWorkspaceRole(allowedRoles: WorkspaceRole[]): Promise<WorkspaceSession> {
  const session = await requireWorkspace();

  if (!hasWorkspaceRole(session.membership.role, allowedRoles)) {
    throw new WorkspaceAuthError("Forbidden", 403);
  }

  return session;
}

export function workspaceAuthErrorResponse(error: unknown) {
  if (error instanceof WorkspaceAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}
