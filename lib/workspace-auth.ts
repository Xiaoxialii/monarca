import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { getCurrentWorkspaceContext } from "@/lib/current-workspace-context";
import { PRODUCT_ACCESS_REQUIRED_CODE, productAccessErrorPayload } from "@/lib/product-access";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

export { WorkspaceAuthError };

export type WorkspaceSession = Awaited<ReturnType<typeof getCurrentWorkspaceContext>>;

export async function requireAuth(request?: Request | null): Promise<WorkspaceSession> {
  return requireWorkspace(request);
}

export async function requireWorkspace(request?: Request | null): Promise<WorkspaceSession> {
  return getCurrentWorkspaceContext(request);
}

export function getCurrentUserRole(session: WorkspaceSession): WorkspaceRole {
  return session.membership.role;
}

export function hasWorkspaceRole(role: WorkspaceRole, allowedRoles: WorkspaceRole[]): boolean {
  return allowedRoles.includes(role);
}

export async function requireWorkspaceRole(allowedRoles: WorkspaceRole[], request?: Request | null): Promise<WorkspaceSession> {
  const session = await requireWorkspace(request);

  if (!hasWorkspaceRole(session.membership.role, allowedRoles)) {
    throw new WorkspaceAuthError("Forbidden", 403);
  }

  return session;
}

export function workspaceAuthErrorResponse(error: unknown) {
  if (error instanceof WorkspaceAuthError) {
    if (error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return NextResponse.json(productAccessErrorPayload(), { status: 403 });
    }

    return NextResponse.json(
      {
        error: error.message,
        message: error.message,
        code: error.code ?? (error.status === 409 ? "USER_WORKSPACE_CONFLICT" : undefined)
      },
      { status: error.status }
    );
  }

  return null;
}
