import { SystemRole } from "@prisma/client";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

export async function requireSuperAdmin(_request?: Request | null) {
  void _request;
  const identity = await syncCurrentClerkUserIdentity();

  if (!identity) {
    throw new WorkspaceAuthError("Unauthorized", 401);
  }

  if (identity.user.systemRole !== SystemRole.SUPER_ADMIN) {
    throw new WorkspaceAuthError("Forbidden", 403);
  }

  return identity.user;
}
